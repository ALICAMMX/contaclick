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

  const solicitudes: SolicitudRegistro[] = [];
  const errores: string[] = [];

  for (const direccion of args.direcciones) {
    try {
      const r = await satSolicitar(creds, token, {
        rfc: args.rfc.toUpperCase(),
        desde: args.desde,
        hasta: args.hasta,
        tipo: direccion,
        tipoSolicitud: "CFDI",
      });
      const sem = semanticaCodigo(r.codigo);
      solicitudes.push(
        nuevaSolicitud({
          direccion,
          desde: args.desde,
          hasta: args.hasta,
          id_solicitud: r.idSolicitud,
          codigo: r.codigo,
          mensaje: sem.mensaje || r.mensaje,
          estado: sem.vencida ? "vencida" : "pendiente",
        }),
      );
    } catch (e: any) {
      const mensaje = String(e?.message ?? e).slice(0, 250);
      errores.push(`[${direccion}] ${mensaje}`);
      solicitudes.push(
        nuevaSolicitud({
          direccion,
          desde: args.desde,
          hasta: args.hasta,
          id_solicitud: "",
          estado: "error",
          mensaje,
          error: mensaje,
        }),
      );
    }
  }
  return { solicitudes, errores };
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
  solicitud: SolicitudRegistro;
  creds?: ContextoEFirma;
  token?: string;
}): Promise<SolicitudRegistro> {
  const { supabase, solicitud } = args;
  const ahora = new Date().toISOString();

  if (!solicitud.id_solicitud) {
    return { ...solicitud, estado: "error", ultima_consulta_at: ahora };
  }

  const creds = args.creds ?? (await credencialesDe(supabase, args.clienteId));
  const token = args.token ?? (await satAutenticar(creds));
  const v = await satVerificar(creds, token, solicitud.id_solicitud);
  const estado = estadoDesdeSat(v.estado, v.codigo, v.numeroCfdis);
  const sem = semanticaCodigo(v.codigo);

  if (estado === "pendiente") {
    const intentos = (solicitud.intentos ?? 0) + 1;
    const agotado = intentos >= MAX_INTENTOS_SOLICITUD;
    return {
      ...solicitud,
      estado: agotado ? "error" : "pendiente",
      intentos,
      siguiente_intento_at: agotado ? null : siguienteIntento(intentos),
      ultima_consulta_at: ahora,
      codigo: v.codigo || solicitud.codigo,
      mensaje: agotado
        ? "El SAT no liberó los paquetes dentro del plazo de reintentos. Vuelve a solicitar el periodo."
        : sem.mensaje || v.mensaje || "El SAT sigue procesando la solicitud.",
      error: agotado ? "Plazo de espera agotado" : null,
    };
  }

  if (estado === "error" || estado === "vencida") {
    return {
      ...solicitud,
      estado,
      ultima_consulta_at: ahora,
      codigo: v.codigo || solicitud.codigo,
      mensaje: sem.mensaje || v.mensaje || "El SAT no entregó esta solicitud.",
      error: `${v.codigo} ${v.mensaje}`.trim() || "Solicitud no entregada por el SAT",
    };
  }

  if (estado === "vacio") {
    return {
      ...solicitud,
      estado: "vacio",
      ultima_consulta_at: ahora,
      codigo: v.codigo || solicitud.codigo,
      mensaje: "El SAT no reportó comprobantes en el periodo solicitado.",
      error: null,
    };
  }

  // estado === "listo": descargar los paquetes que falten.
  let acumulada: SolicitudRegistro = {
    ...solicitud,
    paquetes_encontrados: Array.from(
      new Set([...(solicitud.paquetes_encontrados ?? []), ...v.paquetes]),
    ),
  };
  const procesados = new Set(acumulada.paquetes_procesados ?? []);

  for (const idPaquete of v.paquetes) {
    if (procesados.has(idPaquete)) continue;
    const zipB64 = await satDescargarPaquete(creds, token, idPaquete);
    const zip = await JSZip.loadAsync(zipB64, { base64: true });
    const entries = Object.values(zip.files)
      .filter((f) => !f.dir && /\.xml$/i.test(f.name))
      .slice(0, MAX_XML_POR_PAQUETE);

    let nuevos = 0;
    let duplicados = 0;
    let rechazados = 0;
    for (const entry of entries) {
      try {
        const xml = await entry.async("string");
        const r = await ingestOneInternal(
          supabase,
          args.despachoId,
          args.clienteId,
          entry.name,
          xml,
        );
        if (r.duplicado) duplicados++;
        else nuevos++;
      } catch {
        // XML ilegible o rechazado por el validador: se cuenta, no se descarta en silencio.
        rechazados++;
      }
    }
    acumulada = acumularSolicitud(acumulada, {
      paquetes_procesados: [idPaquete],
      xml_encontrados: entries.length,
      xml_nuevos: nuevos,
      duplicados,
      rechazados,
    });
    procesados.add(idPaquete);
  }

  return {
    ...acumulada,
    estado: "listo",
    ultima_consulta_at: ahora,
    codigo: v.codigo || acumulada.codigo,
    mensaje: `El SAT entregó ${v.numeroCfdis} comprobantes en ${v.paquetes.length} paquete(s).`,
    error: null,
  };
}

/** Cosecha todas las solicitudes de una corrida y devuelve el resumen. */
export async function cosecharCorrida(args: {
  supabase: SupabaseClient;
  despachoId: string;
  clienteId: string;
  solicitudes: SolicitudRegistro[];
}): Promise<{ solicitudes: SolicitudRegistro[]; resumen: ResumenCorrida }> {
  const pendientes = args.solicitudes.filter((s) => s.estado === "pendiente");
  if (pendientes.length === 0) {
    return { solicitudes: args.solicitudes, resumen: resolverEstadoCorrida(args.solicitudes) };
  }

  let creds: ContextoEFirma | undefined;
  let token: string | undefined;
  try {
    creds = await credencialesDe(args.supabase, args.clienteId);
    token = await satAutenticar(creds);
  } catch (e: any) {
    const mensaje = String(e?.message ?? e).slice(0, 250);
    const sols = args.solicitudes.map((s) =>
      s.estado === "pendiente"
        ? { ...s, intentos: (s.intentos ?? 0) + 1, mensaje, error: mensaje }
        : s,
    );
    return { solicitudes: sols, resumen: resolverEstadoCorrida(sols) };
  }

  const salida: SolicitudRegistro[] = [];
  for (const s of args.solicitudes) {
    if (s.estado !== "pendiente") {
      salida.push(s);
      continue;
    }
    if (s.siguiente_intento_at && new Date(s.siguiente_intento_at).getTime() > Date.now()) {
      salida.push(s);
      continue;
    }
    try {
      salida.push(
        await cosecharSolicitud({
          supabase: args.supabase,
          despachoId: args.despachoId,
          clienteId: args.clienteId,
          solicitud: s,
          creds,
          token,
        }),
      );
    } catch (e: any) {
      const mensaje = String(e?.message ?? e).slice(0, 250);
      const intentos = (s.intentos ?? 0) + 1;
      salida.push({
        ...s,
        intentos,
        siguiente_intento_at: siguienteIntento(intentos),
        mensaje,
        error: mensaje,
        estado: intentos >= MAX_INTENTOS_SOLICITUD ? "error" : "pendiente",
      });
    }
  }
  return { solicitudes: salida, resumen: resolverEstadoCorrida(salida) };
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
