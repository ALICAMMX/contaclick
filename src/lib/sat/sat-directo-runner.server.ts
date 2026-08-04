/**
 * Orquestador de la Descarga Masiva SAT sin PAC.
 *
 * Cada corrida:
 *  - Paso A (solicitar): autentica con la e.firma y manda 1-2 solicitudes (emitidos / recibidos).
 *  - Paso B (cosechar):  verifica solicitudes pendientes y, cuando el SAT las termina,
 *                        descarga los ZIP y los ingesta como CFDI del expediente.
 *
 * Costo: $0 por solicitud. El SAT limita a ~2 solicitudes activas por RFC.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { descifrar } from "./efirma-vault.server";
import {
  abrirEFirma,
  satAutenticar,
  satSolicitar,
  satVerificar,
  satDescargarPaquete,
  type TipoDescarga,
} from "./providers/sat-directo.server";
import { ingestOneInternal } from "@/lib/cfdi/cfdi.functions";

export type SolicitudPendiente = {
  id_solicitud: string;
  tipo: TipoDescarga;
  desde: string;
  hasta: string;
  estado: "pendiente" | "listo" | "error" | "vacio";
  mensaje?: string;
  paquetes_procesados?: string[];
};

async function credencialesDe(supabase: SupabaseClient, clienteId: string) {
  const { data } = await supabase
    .from("sat_credenciales")
    .select("efirma_cer, efirma_key_enc, efirma_pass_enc, estatus, proveedor")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!data || data.estatus !== "activo" || !data.efirma_cer || !data.efirma_key_enc) {
    throw new Error(
      "Este expediente no tiene la e.firma cargada. Súbela en Descarga SAT para activar la descarga gratuita.",
    );
  }
  return abrirEFirma({
    cer_b64: data.efirma_cer as string,
    key_b64: await descifrar(data.efirma_key_enc as string),
    password: await descifrar(data.efirma_pass_enc as string),
  });
}

/** Paso A: envía las solicitudes de descarga al SAT. */
export async function solicitarDescargas(args: {
  supabase: SupabaseClient;
  clienteId: string;
  rfc: string;
  desde: string;
  hasta: string;
  emitidos: boolean;
  recibidos: boolean;
}): Promise<{ solicitudes: SolicitudPendiente[]; errores: string[] }> {
  const creds = await credencialesDe(args.supabase, args.clienteId);
  const token = await satAutenticar(creds);

  const tipos: TipoDescarga[] = [];
  if (args.emitidos) tipos.push("emitidos");
  if (args.recibidos) tipos.push("recibidos");
  if (tipos.length === 0) tipos.push("recibidos");

  const solicitudes: SolicitudPendiente[] = [];
  const errores: string[] = [];
  for (const tipo of tipos) {
    try {
      const r = await satSolicitar(creds, token, {
        rfc: args.rfc.toUpperCase(),
        desde: args.desde,
        hasta: args.hasta,
        tipo,
      });
      solicitudes.push({
        id_solicitud: r.idSolicitud,
        tipo,
        desde: args.desde,
        hasta: args.hasta,
        estado: "pendiente",
        mensaje: r.mensaje,
      });
    } catch (e: any) {
      errores.push(`[${tipo}] ${String(e?.message ?? e).slice(0, 250)}`);
    }
  }
  return { solicitudes, errores };
}

/**
 * Paso B: verifica una solicitud y, si el SAT ya la terminó, baja los paquetes
 * e ingesta los CFDI. Devuelve el estado actualizado.
 */
export async function cosecharSolicitud(args: {
  supabase: SupabaseClient;
  despachoId: string;
  clienteId: string;
  solicitud: SolicitudPendiente;
}): Promise<{ solicitud: SolicitudPendiente; nuevos: number; duplicados: number }> {
  const { supabase, solicitud } = args;
  let nuevos = 0;
  let duplicados = 0;

  const creds = await credencialesDe(supabase, args.clienteId);
  const token = await satAutenticar(creds);
  const v = await satVerificar(creds, token, solicitud.id_solicitud);

  // 1 aceptada · 2 en proceso · 3 terminada · 4 error · 5 rechazada · 6 vencida
  if (v.estado === 1 || v.estado === 2) {
    return { solicitud: { ...solicitud, estado: "pendiente", mensaje: v.mensaje }, nuevos, duplicados };
  }
  if (v.estado >= 4) {
    return {
      solicitud: {
        ...solicitud,
        estado: "error",
        mensaje: `${v.codigo} ${v.mensaje}`.trim() || "El SAT rechazó la solicitud",
      },
      nuevos,
      duplicados,
    };
  }
  if (v.numeroCfdis === 0 || v.paquetes.length === 0) {
    return {
      solicitud: { ...solicitud, estado: "vacio", mensaje: "Sin CFDI en el periodo" },
      nuevos,
      duplicados,
    };
  }

  const procesados = new Set(solicitud.paquetes_procesados ?? []);
  for (const idPaquete of v.paquetes) {
    if (procesados.has(idPaquete)) continue;
    const zipB64 = await satDescargarPaquete(creds, token, idPaquete);
    const zip = await JSZip.loadAsync(zipB64, { base64: true });
    const entries = Object.values(zip.files).filter(
      (f) => !f.dir && /\.xml$/i.test(f.name),
    );
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
        // XML inválido dentro del paquete: se omite sin romper la corrida
      }
    }
    procesados.add(idPaquete);
  }

  return {
    solicitud: {
      ...solicitud,
      estado: "listo",
      mensaje: `${v.numeroCfdis} CFDI entregados por el SAT`,
      paquetes_procesados: Array.from(procesados),
    },
    nuevos,
    duplicados,
  };
}

/** Cosecha todas las corridas con solicitudes pendientes (usado por el cron). */
export async function cosecharPendientes(
  supabase: SupabaseClient,
  limite = 20,
): Promise<{ revisadas: number; nuevos: number }> {
  const { data: runs } = await supabase
    .from("sat_sync_runs")
    .select("id, despacho_id, cliente_id, solicitudes, estatus")
    .eq("proveedor", "sat_directo")
    .eq("estatus", "en_curso")
    .order("iniciado_at", { ascending: true })
    .limit(limite);

  let revisadas = 0;
  let nuevosTotal = 0;

  for (const run of runs ?? []) {
    const sols = (run.solicitudes ?? []) as SolicitudPendiente[];
    if (!sols.length) continue;
    const actualizadas: SolicitudPendiente[] = [];
    let nuevos = 0;
    for (const s of sols) {
      if (s.estado !== "pendiente") {
        actualizadas.push(s);
        continue;
      }
      try {
        const r = await cosecharSolicitud({
          supabase,
          despachoId: run.despacho_id as string,
          clienteId: run.cliente_id as string,
          solicitud: s,
        });
        actualizadas.push(r.solicitud);
        nuevos += r.nuevos;
      } catch (e: any) {
        actualizadas.push({ ...s, mensaje: String(e?.message ?? e).slice(0, 250) });
      }
    }
    revisadas++;
    nuevosTotal += nuevos;

    const sigueEsperando = actualizadas.some((s) => s.estado === "pendiente");
    await supabase
      .from("sat_sync_runs")
      .update({
        solicitudes: actualizadas,
        estatus: sigueEsperando ? "en_curso" : "exitoso",
        nuevos: (run as any).nuevos ? (run as any).nuevos + nuevos : nuevos,
        descargados: nuevos,
        finalizado_at: sigueEsperando ? null : new Date().toISOString(),
      })
      .eq("id", run.id);
  }

  return { revisadas, nuevos: nuevosTotal };
}
