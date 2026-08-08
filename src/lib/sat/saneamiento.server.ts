/**
 * Recuperador de corridas atoradas (servidor).
 *
 * Reglas: no reenvía nada al SAT, no consume cuota, no borra historial.
 * Sólo cierra transiciones que quedaron abiertas por una excepción o por un
 * inicio incompleto, y reencauza a `esperando_sat` lo que sí tiene folio.
 */
import {
  clasificarCorridaAtorada,
  tieneFolioSat,
  MINUTOS_ATORADA,
  type CorridaParaSanear,
} from "./saneamiento";
import { estatusLegado } from "./maquina-estados";
import type { SolicitudRegistro } from "./maquina-estados";

export type DiagnosticoCorrida = {
  codigo: string;
  etapa: string;
  folio_sat: boolean;
  fecha: string;
  intento: number;
  accion_recomendada: string;
  mensaje: string;
};

export function diagnostico(args: {
  codigo: string;
  etapa: string;
  folioSat: boolean;
  mensaje: string;
  accion: string;
  intento?: number;
}): DiagnosticoCorrida {
  return {
    codigo: args.codigo,
    etapa: args.etapa,
    folio_sat: args.folioSat,
    fecha: new Date().toISOString(),
    intento: args.intento ?? 1,
    accion_recomendada: args.accion,
    mensaje: args.mensaje.slice(0, 300),
  };
}

/** Cierra una corrida en estado terminal conservando toda su evidencia. */
export async function cerrarCorridaConError(
  supabase: any,
  runId: string,
  diag: DiagnosticoCorrida,
) {
  const previos = await supabase
    .from("sat_sync_runs")
    .select("errores, idempotency_key")
    .eq("id", runId)
    .maybeSingle();
  const historial = Array.isArray(previos?.data?.errores) ? previos.data.errores : [];
  await supabase
    .from("sat_sync_runs")
    .update({
      estado: "error",
      estatus: "error",
      cobertura: "nula",
      finalizado_at: new Date().toISOString(),
      errores: [...historial, diag] as any,
      detalle: diag.mensaje,
    })
    .eq("id", runId)
    .in("estado", ["preparando", "solicitando", "esperando_sat", "descargando", "ingiriendo", "recalculando"]);

  // Sin contacto confirmado con el SAT no debe quedar reserva viva de saldo PAC.
  const key = previos?.data?.idempotency_key;
  if (!diag.folio_sat && key) {
    try {
      await supabase.rpc("pac_devolver_reserva", {
        _key: key,
        _motivo: `saneamiento:${diag.codigo}`,
      });
    } catch {
      /* la reserva puede no existir en el proveedor directo: no es un error */
    }
  }
}

/**
 * Barrido periódico. Se ejecuta ANTES de cosechar, para que el cosechador no
 * pierda ciclos con corridas que nunca llegaron a enviarse.
 *
 * Es idempotente y seguro ante dos ejecuciones simultáneas: cada actualización
 * está condicionada al estado exacto que se leyó, así que el segundo cron no
 * reabre ni vuelve a cerrar lo que el primero ya movió.
 */
export async function sanearCorridasAtoradas(
  supabase: any,
  limite = 50,
  ahora = Date.now(),
): Promise<{ revisadas: number; cerradas: number; reencauzadas: number }> {
  const columnas = "id, estado, estatus, iniciado_at, created_at, solicitudes, errores";

  const { data: porEstado } = await supabase
    .from("sat_sync_runs")
    .select(columnas)
    .in("estado", ["preparando", "solicitando"])
    .order("iniciado_at", { ascending: true })
    .limit(limite);

  // Red de seguridad: corridas viejas marcadas sólo con el estatus heredado.
  const { data: porEstatus } = await supabase
    .from("sat_sync_runs")
    .select(columnas)
    .is("estado", null)
    .eq("estatus", "en_curso")
    .order("iniciado_at", { ascending: true })
    .limit(limite);

  const mapa = new Map<string, CorridaParaSanear>();
  for (const r of [...(porEstado ?? []), ...(porEstatus ?? [])]) {
    const run = r as any;
    mapa.set(run.id, {
      ...run,
      estado: run.estado ?? "solicitando",
      iniciado_at: run.iniciado_at ?? run.created_at,
    } as CorridaParaSanear);
  }

  let cerradas = 0;
  let reencauzadas = 0;
  const lista = [...mapa.values()];

  for (const run of lista) {
    const d = clasificarCorridaAtorada(run, ahora, MINUTOS_ATORADA);
    if (d.accion === "ninguna") continue;

    if (d.accion === "continuar_esperando") {
      await supabase
        .from("sat_sync_runs")
        .update({ estado: d.estado, estatus: estatusLegado(d.estado) })
        .eq("id", run.id)
        .in("estado", ["preparando", "solicitando"]);
      reencauzadas++;
      continue;
    }

    await cerrarCorridaConError(
      supabase,
      run.id,
      diagnostico({
        codigo: d.codigo,
        etapa: d.etapa,
        folioSat: tieneFolioSat(run.solicitudes as SolicitudRegistro[] | null),
        mensaje: d.motivo,
        accion:
          "Verifica la conexión de e.firma del expediente y vuelve a configurar una corrida nueva.",
      }),
    );
    cerradas++;
  }

  return { revisadas: lista.length, cerradas, reencauzadas };
}

