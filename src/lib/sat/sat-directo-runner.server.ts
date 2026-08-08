/**
 * Orquestador de la Descarga Masiva SAT con e.firma (proveedor `sat_directo`).
 *
 * El SAT es ASÍNCRONO y esta implementación lo respeta:
 *   Paso A (solicitar): autentica con la e.firma y envía 1..N solicitudes.
 *   Paso B (cosechar):  verifica, descarga los paquetes liberados e ingesta
 *                       los XML. Se repite hasta que TODAS las solicitudes
 *                       terminan; sólo entonces la corrida queda `completada`.
 *
 * Idempotencia: los paquetes ya procesados nunca se vuelven a ingerir y los
 * contadores se acumulan, así que reintentar una cosecha no duplica nada.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { aadExpediente, descifrar } from "./efirma-vault.server";
import {
  abrirEFirma,
  satAutenticar,
  satSolicitar,
  satVerificar,
  satDescargarPaquete,
} from "./providers/sat-directo.server";
import { ingestOneInternal } from "@/lib/cfdi/cfdi.functions";
import type { DireccionDescarga } from "./providers/contrato";
import {
  MAX_XML_POR_PAQUETE,
  cosecharCiclo,
  cosecharSolicitudCiclo,
  solicitarCiclo,
  type AbrirPaquete,
  type ClienteCiclo,
  type Ingestar,
} from "./ciclo-asincrono";
import {
  MAX_INTENTOS_SOLICITUD,
  acumularSolicitud,
  estadoDesdeSat,
  estatusLegado,
  nuevaSolicitud,
  resolverEstadoCorrida,
  semanticaCodigo,
  siguienteIntento,
  type ResumenCorrida,
  type SolicitudRegistro,
} from "./maquina-estados";

/** Máximo de XML que se ingieren por paquete en una sola pasada. */
const MAX_XML_POR_PAQUETE = 5000;

export type ContextoEFirma = Awaited<ReturnType<typeof abrirEFirma>>;

async function credencialesDe(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<ContextoEFirma> {
  const { data } = await supabase
    .from("sat_credenciales")
    .select("despacho_id, efirma_cer, efirma_key_enc, efirma_pass_enc, estatus, rfc")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!data || data.estatus !== "activo" || !data.efirma_cer || !data.efirma_key_enc) {
    throw new Error(
      "Este expediente no tiene una e.firma activa. Cárgala en Descarga SAT para poder solicitar comprobantes.",
    );
  }
  const aadKey = aadExpediente({
    despachoId: (data as any).despacho_id ?? null,
    clienteId,
    rfc: (data as any).rfc ?? null,
    campo: "key",
  });
  const aadPass = aadExpediente({
    despachoId: (data as any).despacho_id ?? null,
    clienteId,
    rfc: (data as any).rfc ?? null,
    campo: "pass",
  });
  return abrirEFirma({
    cer_b64: data.efirma_cer as string,
    key_b64: await descifrar(data.efirma_key_enc as string, aadKey),
    password: await descifrar(data.efirma_pass_enc as string, aadPass),
  });
}

// ---------------------------------------------------------------------
// Adaptador: el ciclo asíncrono genérico hablando con el SAT real
// ---------------------------------------------------------------------

function clienteSat(creds: ContextoEFirma, token: string, rfc: string): ClienteCiclo {
  return {
    async solicitar({ direccion, desde, hasta }) {
      const r = await satSolicitar(creds, token, {
        rfc: rfc.toUpperCase(),
        desde,
        hasta,
        tipo: direccion,
        tipoSolicitud: "CFDI",
      });
      return { idSolicitud: r.idSolicitud, codigo: r.codigo, mensaje: r.mensaje };
    },
    async verificar(idSolicitud) {
      const v = await satVerificar(creds, token, idSolicitud);
      return {
        estado: v.estado,
        codigo: v.codigo,
        mensaje: v.mensaje,
        numeroCfdis: v.numeroCfdis,
        paquetes: v.paquetes,
      };
    },
    descargar: (idPaquete) => satDescargarPaquete(creds, token, idPaquete),
  };
}

/** Abre un paquete real del SAT (ZIP en base64) y devuelve sus XML. */
const abrirPaqueteZip: AbrirPaquete = async (zipB64) => {
  const zip = await JSZip.loadAsync(zipB64, { base64: true });
  const entries = Object.values(zip.files).filter((f) => !f.dir && /\.xml$/i.test(f.name));
  const out: { nombre: string; xml: string }[] = [];
  for (const entry of entries) out.push({ nombre: entry.name, xml: await entry.async("string") });
  return out;
};

function ingestorDe(
  supabase: SupabaseClient,
  despachoId: string,
  clienteId: string,
): Ingestar {
  return async ({ nombre, xml }) => {
    const r = await ingestOneInternal(supabase, despachoId, clienteId, nombre, xml);
    return { duplicado: !!r.duplicado };
  };
}

// ---------------------------------------------------------------------
// Paso A — Solicitar
// ---------------------------------------------------------------------

export async function solicitarDescargas(args: {
  supabase: SupabaseClient;
  clienteId: string;
  rfc: string;
  desde: string;
  hasta: string;
  direcciones: DireccionDescarga[];
}): Promise<{ solicitudes: SolicitudRegistro[]; errores: string[] }> {
  const creds = await credencialesDe(args.supabase, args.clienteId);
  const token = await satAutenticar(creds);
  return solicitarCiclo(clienteSat(creds, token, args.rfc), {
    desde: args.desde,
    hasta: args.hasta,
    direcciones: args.direcciones,
  });
}

// ---------------------------------------------------------------------
// Paso B — Cosechar
// ---------------------------------------------------------------------

/**
 * Verifica una solicitud y, si el SAT ya liberó paquetes, los descarga e
 * ingesta. Devuelve la solicitud ACUMULADA (nunca pierde el avance previo).
 */
export async function cosecharSolicitud(args: {
  supabase: SupabaseClient;
  despachoId: string;
  clienteId: string;
  rfc?: string;
  solicitud: SolicitudRegistro;
  creds?: ContextoEFirma;
  token?: string;
}): Promise<SolicitudRegistro> {
  const creds = args.creds ?? (await credencialesDe(args.supabase, args.clienteId));
  const token = args.token ?? (await satAutenticar(creds));
  return cosecharSolicitudCiclo({
    cliente: clienteSat(creds, token, args.rfc ?? ""),
    solicitud: args.solicitud,
    abrirPaquete: abrirPaqueteZip,
    ingestar: ingestorDe(args.supabase, args.despachoId, args.clienteId),
    maxXmlPorPaquete: MAX_XML_POR_PAQUETE,
  });
}

/** Cosecha todas las solicitudes de una corrida y devuelve el resumen. */
export async function cosecharCorrida(args: {
  supabase: SupabaseClient;
  despachoId: string;
  clienteId: string;
  rfc?: string;
  solicitudes: SolicitudRegistro[];
}): Promise<{ solicitudes: SolicitudRegistro[]; resumen: ResumenCorrida }> {
  const pendientes = args.solicitudes.filter((s) => s.estado === "pendiente");
  if (pendientes.length === 0) {
    return { solicitudes: args.solicitudes, resumen: resolverEstadoCorrida(args.solicitudes) };
  }

  let creds: ContextoEFirma;
  let token: string;
  try {
    creds = await credencialesDe(args.supabase, args.clienteId);
    token = await satAutenticar(creds);
  } catch (e: any) {
    // Sin autenticación no se pierde el avance: se registra y se reintenta luego.
    const mensaje = String(e?.message ?? e).slice(0, 250);
    const sols = args.solicitudes.map((s) =>
      s.estado === "pendiente"
        ? { ...s, intentos: (s.intentos ?? 0) + 1, mensaje, error: mensaje }
        : s,
    );
    return { solicitudes: sols, resumen: resolverEstadoCorrida(sols) };
  }

  return cosecharCiclo({
    cliente: clienteSat(creds, token, args.rfc ?? ""),
    solicitudes: args.solicitudes,
    abrirPaquete: abrirPaqueteZip,
    ingestar: ingestorDe(args.supabase, args.despachoId, args.clienteId),
    maxXmlPorPaquete: MAX_XML_POR_PAQUETE,
  });
}

/** Persiste el avance de una corrida y devuelve el resumen aplicado. */
export async function guardarAvanceCorrida(
  supabase: SupabaseClient,
  runId: string,
  solicitudes: SolicitudRegistro[],
  resumen: ResumenCorrida,
) {
  const terminal = ["completada", "parcial", "error", "vencida"].includes(resumen.estado);
  await supabase
    .from("sat_sync_runs")
    .update({
      solicitudes: solicitudes as any,
      estado: resumen.estado,
      estatus: estatusLegado(resumen.estado),
      cobertura: resumen.cobertura,
      advertencia: resumen.advertencia,
      descargados: resumen.xml_encontrados,
      nuevos: resumen.xml_nuevos,
      duplicados: resumen.duplicados,
      rechazados: resumen.rechazados,
      paquetes_procesados: resumen.paquetes_procesados,
      ultima_consulta_at: new Date().toISOString(),
      finalizado_at: terminal ? new Date().toISOString() : null,
      detalle: resumen.advertencia
        ? resumen.advertencia
        : terminal
          ? `Nuevos: ${resumen.xml_nuevos} · duplicados: ${resumen.duplicados} · rechazados: ${resumen.rechazados}`
          : "El SAT sigue procesando la solicitud. La descarga continúa en segundo plano.",
    })
    .eq("id", runId);
  return terminal;
}

/**
 * Cosecha las corridas activas (cron). No ejecuta la cascada de recálculos:
 * registra un evento `recalculo_pendiente` que la sesión autenticada consume.
 */
export async function cosecharPendientes(
  supabase: SupabaseClient,
  limite = 20,
): Promise<{ revisadas: number; nuevos: number; completadas: number }> {
  const { data: runs } = await supabase
    .from("sat_sync_runs")
    .select("id, despacho_id, cliente_id, solicitudes, estado")
    .eq("proveedor", "sat_directo")
    .in("estado", ["esperando_sat", "descargando", "ingiriendo", "solicitando"])
    .order("iniciado_at", { ascending: true })
    .limit(limite);

  let revisadas = 0;
  let nuevos = 0;
  let completadas = 0;

  for (const run of runs ?? []) {
    const sols = ((run as any).solicitudes ?? []) as SolicitudRegistro[];
    if (!sols.length) continue;
    revisadas++;
    const { solicitudes, resumen } = await cosecharCorrida({
      supabase,
      despachoId: (run as any).despacho_id as string,
      clienteId: (run as any).cliente_id as string,
      solicitudes: sols,
    });
    nuevos += resumen.xml_nuevos;
    const terminal = await guardarAvanceCorrida(
      supabase,
      (run as any).id as string,
      solicitudes,
      resumen,
    );
    if (terminal) {
      completadas++;
      if (resumen.xml_nuevos > 0) {
        await supabase.from("sat_sync_eventos").insert({
          despacho_id: (run as any).despacho_id,
          cliente_id: (run as any).cliente_id,
          run_id: (run as any).id,
          tipo: "recalculo_pendiente",
          mensaje:
            "Descarga SAT completada. Los módulos se recalcularán al abrir el expediente.",
        });
      }
    }
  }

  return { revisadas, nuevos, completadas };
}
