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
import { materialEFirma } from "./credencial.server";
import {
  abrirEFirma,
  satAutenticar,
  satSolicitar,
  satVerificar,
  satDescargarPaquete,
} from "./providers/sat-directo.server";
import { ingestOneInternal } from "@/lib/cfdi/cfdi.functions";
import { requiereRecalculo } from "./linaje";
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
  ESTADOS_ACTIVOS,
  ESTADOS_TERMINALES,
  estatusLegado,
  resolverEstadoCorrida,
  type ResumenCorrida,
  type SolicitudRegistro,
} from "./maquina-estados";


export type ContextoEFirma = Awaited<ReturnType<typeof abrirEFirma>>;

/**
 * Abre la e.firma del expediente usando el RESOLVEDOR CENTRAL.
 * La tarjeta de conexión, el preflight y este runner comparten exactamente la
 * misma definición de "e.firma activa" y el mismo AAD.
 */
async function credencialesDe(
  supabase: SupabaseClient,
  clienteId: string,
  opts: { despachoId?: string | null; rfcExpediente?: string | null } = {},
): Promise<ContextoEFirma> {
  const material = await materialEFirma(supabase, {
    clienteId,
    despachoId: opts.despachoId ?? null,
    rfcExpediente: opts.rfcExpediente ?? null,
  });
  return abrirEFirma({
    cer_b64: material.cer_b64,
    key_b64: material.key_b64,
    password: material.password,
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
        // Explícito y seguro: el XML de comprobantes cancelados no puede
        // solicitarse como receptor y no se pide por omisión en ningún caso.
        estado: "Vigente",
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

/**
 * Ingesta con LINAJE: cada XML deja constancia de la corrida, la solicitud y
 * el paquete de los que provino, y registra un evento por documento —también
 * los duplicados y los rechazados, que no crean un segundo comprobante pero sí
 * deben poder verse en el detalle de la corrida.
 */
function ingestorDe(
  supabase: SupabaseClient,
  despachoId: string,
  clienteId: string,
  runId?: string | null,
): Ingestar {
  return async ({ nombre, xml }, ctx) => {
    const linaje = {
      origen: "sat_descarga_masiva",
      proveedor: "sat_directo",
      run_id: runId ?? null,
      solicitud_id: ctx?.idSolicitud ?? null,
      paquete_id: ctx?.idPaquete ?? null,
    };
    const evento = async (tipo: string, payload: Record<string, unknown>, uuid?: string | null, monto?: number | null, mensaje?: string) => {
      if (!runId) return;
      try {
        await supabase.from("sat_sync_eventos").insert({
          despacho_id: despachoId,
          cliente_id: clienteId,
          run_id: runId,
          tipo,
          uuid_cfdi: uuid ?? null,
          monto: monto ?? null,
          mensaje: mensaje ?? null,
          payload: { ...payload, ...linaje, archivo: nombre },
        });
      } catch (e: any) {
        console.warn("[sat-sync linaje] no se pudo registrar el evento:", e?.message ?? e);
      }
    };

    try {
      const r = await ingestOneInternal(supabase, despachoId, clienteId, nombre, xml, linaje);
      if (r.duplicado) {
        await evento(
          "duplicado",
          { cfdi_id: r.id, hash: r.hash, validacion: "duplicado" },
          r.uuid,
          null,
          "El comprobante ya existía en el expediente; no se creó un segundo documento.",
        );
      } else {
        await evento(
          "nuevo",
          { cfdi_id: r.id, hash: r.hash, validacion: "aceptado" },
          r.uuid,
          null,
          "Comprobante incorporado al expediente desde la Descarga Masiva SAT.",
        );
      }
      return { duplicado: !!r.duplicado };
    } catch (e: any) {
      const mensaje = String(e?.message ?? e).slice(0, 250);
      await evento("rechazado", { validacion: "rechazado", motivo: mensaje }, null, null, mensaje);
      throw e;
    }
  };
}

// ---------------------------------------------------------------------
// Paso A — Solicitar
// ---------------------------------------------------------------------

export async function solicitarDescargas(args: {
  supabase: SupabaseClient;
  clienteId: string;
  despachoId?: string | null;
  rfc: string;
  desde: string;
  hasta: string;
  direcciones: DireccionDescarga[];
}): Promise<{ solicitudes: SolicitudRegistro[]; errores: string[] }> {
  const creds = await credencialesDe(args.supabase, args.clienteId, {
    despachoId: args.despachoId ?? null,
    rfcExpediente: args.rfc,
  });
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
  runId?: string | null;
  solicitud: SolicitudRegistro;
  creds?: ContextoEFirma;
  token?: string;
}): Promise<SolicitudRegistro> {
  const creds =
    args.creds ??
    (await credencialesDe(args.supabase, args.clienteId, {
      despachoId: args.despachoId,
      rfcExpediente: args.rfc ?? null,
    }));

  const token = args.token ?? (await satAutenticar(creds));
  return cosecharSolicitudCiclo({
    cliente: clienteSat(creds, token, args.rfc ?? ""),
    solicitud: args.solicitud,
    abrirPaquete: abrirPaqueteZip,
    ingestar: ingestorDe(args.supabase, args.despachoId, args.clienteId, args.runId ?? null),
    maxXmlPorPaquete: MAX_XML_POR_PAQUETE,
  });
}

/** Cosecha todas las solicitudes de una corrida y devuelve el resumen. */
export async function cosecharCorrida(args: {
  supabase: SupabaseClient;
  despachoId: string;
  clienteId: string;
  rfc?: string;
  runId?: string | null;
  solicitudes: SolicitudRegistro[];
}): Promise<{ solicitudes: SolicitudRegistro[]; resumen: ResumenCorrida }> {
  const pendientes = args.solicitudes.filter((s) => s.estado === "pendiente");
  if (pendientes.length === 0) {
    return { solicitudes: args.solicitudes, resumen: resolverEstadoCorrida(args.solicitudes) };
  }

  let creds: ContextoEFirma;
  let token: string;
  try {
    creds = await credencialesDe(args.supabase, args.clienteId, {
      despachoId: args.despachoId,
      rfcExpediente: args.rfc ?? null,
    });

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
    ingestar: ingestorDe(args.supabase, args.despachoId, args.clienteId, args.runId ?? null),
    maxXmlPorPaquete: MAX_XML_POR_PAQUETE,
  });
}

/**
 * Persiste el avance de una corrida y devuelve si quedó terminal.
 *
 * La escritura está acotada a corridas ACTIVAS: una corrida ya terminal nunca
 * retrocede de estado ni se reescribe si otro proceso la cerró antes.
 *
 * REGLA DE TRAZABILIDAD: una corrida que trajo comprobantes nuevos NO puede
 * cerrarse como `completada` sin pasar por `recalculando`. Se mantiene en ese
 * estado hasta que exista evidencia real de los recálculos.
 */
export async function guardarAvanceCorrida(
  supabase: SupabaseClient,
  runId: string,
  solicitudes: SolicitudRegistro[],
  resumen: ResumenCorrida,
) {
  const terminal = ESTADOS_TERMINALES.includes(resumen.estado);
  const pendienteRecalculo = requiereRecalculo({
    estado: resumen.estado,
    xml_nuevos: resumen.xml_nuevos,
  });
  const estadoDestino = pendienteRecalculo ? "recalculando" : resumen.estado;
  const cerrar = terminal && !pendienteRecalculo;
  await supabase
    .from("sat_sync_runs")
    .update({
      solicitudes: solicitudes as any,
      estado: estadoDestino,
      estatus: estatusLegado(estadoDestino as any),
      cobertura: resumen.cobertura,
      advertencia: resumen.advertencia,
      descargados: resumen.xml_encontrados,
      nuevos: resumen.xml_nuevos,
      duplicados: resumen.duplicados,
      rechazados: resumen.rechazados,
      paquetes_procesados: resumen.paquetes_procesados,
      ultima_consulta_at: new Date().toISOString(),
      finalizado_at: cerrar ? new Date().toISOString() : null,
      detalle: resumen.advertencia
        ? resumen.advertencia
        : pendienteRecalculo
          ? "Descarga terminada. Recalculando los módulos del expediente."
          : terminal
            ? `Nuevos: ${resumen.xml_nuevos} · duplicados: ${resumen.duplicados} · rechazados: ${resumen.rechazados}`
            : "El SAT sigue procesando la solicitud. La descarga continúa en segundo plano.",
    })
    .eq("id", runId)
    .in("estado", ESTADOS_ACTIVOS);
  return terminal;
}

/**
 * Cierra una corrida que estaba en `recalculando` una vez que los módulos
 * dejaron evidencia. Nunca cierra una corrida sin recálculos registrados.
 */
export async function cerrarTrasRecalculo(
  supabase: SupabaseClient,
  runId: string,
  resumen: { xml_nuevos: number; duplicados: number; rechazados: number },
) {
  const { data } = await supabase
    .from("sat_sync_runs")
    .update({
      estado: "completada",
      estatus: estatusLegado("completada"),
      finalizado_at: new Date().toISOString(),
      detalle: `Nuevos: ${resumen.xml_nuevos} · duplicados: ${resumen.duplicados} · rechazados: ${resumen.rechazados}`,
    })
    .eq("id", runId)
    .eq("estado", "recalculando")
    .select("id");
  return !!data?.length;
}


/** Ventana de exclusión entre trabajadores que cosechan la misma corrida. */
const LOCK_COSECHA_MS = 3 * 60_000;

/**
 * Reclama una corrida para este trabajador. Devuelve `false` si otro proceso
 * la consultó hace menos de LOCK_COSECHA_MS: así dos crones simultáneos no
 * descargan ni ingieren el mismo paquete al mismo tiempo.
 */
async function reclamarCorrida(supabase: SupabaseClient, runId: string): Promise<boolean> {
  const corte = new Date(Date.now() - LOCK_COSECHA_MS).toISOString();
  const { data } = await supabase
    .from("sat_sync_runs")
    .update({ ultima_consulta_at: new Date().toISOString() })
    .eq("id", runId)
    .in("estado", ESTADOS_ACTIVOS)
    .or(`ultima_consulta_at.is.null,ultima_consulta_at.lt.${corte}`)
    .select("id");
  return !!data?.length;
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
    // Otro trabajador ya está cosechando esta corrida: no se duplica el trabajo.
    if (!(await reclamarCorrida(supabase, (run as any).id as string))) continue;
    revisadas++;
    const { solicitudes, resumen } = await cosecharCorrida({
      supabase,
      despachoId: (run as any).despacho_id as string,
      clienteId: (run as any).cliente_id as string,
      runId: (run as any).id as string,
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
