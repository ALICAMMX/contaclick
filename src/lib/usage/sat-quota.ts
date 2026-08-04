// Candados de costo del PAC SAT sobre el libro mayor inmutable.
// Regla de oro: una corrida NUNCA inicia sin saldo, y un reintento NUNCA
// descuenta dos veces (todo pasa por una llave de idempotencia).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertCuota,
  assertFrecuencia,
  getEntitlements,
  periodoActual,
  type Entitlements,
  type FrecuenciaSat,
} from "@/lib/entitlements/service";

export type { FrecuenciaSat };

export interface ConfigDescarga {
  emitidos: boolean;
  recibidos: boolean;
  nomina: boolean;
  pagos: boolean;
  retenciones: boolean;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
}

/** Solicitudes que enviará una corrida: tipos activos × meses en el rango. */
export function contarSolicitudesPrevistas(cfg: ConfigDescarga): number {
  const tipos =
    (cfg.emitidos ? 1 : 0) +
    (cfg.recibidos ? 1 : 0) +
    (cfg.nomina ? 1 : 0) +
    (cfg.pagos ? 1 : 0) +
    (cfg.retenciones ? 1 : 0);
  if (tipos === 0) return 0;
  let meses = 1;
  if (cfg.fecha_desde && cfg.fecha_hasta) {
    const d1 = new Date(cfg.fecha_desde);
    const d2 = new Date(cfg.fecha_hasta);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime()) && d2 >= d1) {
      meses = Math.max(
        1,
        (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 +
          (d2.getUTCMonth() - d1.getUTCMonth()) +
          1,
      );
    }
  }
  return tipos * meses;
}

export class SaldoPacInsuficienteError extends Error {
  readonly code = "SALDO_PAC_INSUFICIENTE";
  disponible: number;
  requerido: number;
  constructor(disponible: number, requerido: number) {
    super(
      `No se inició la descarga: el servicio de descarga SAT no tiene saldo operativo suficiente ` +
        `(disponible: ${disponible} solicitudes, se requieren ${requerido}). ` +
        `No se consumió nada de tu cuota. El administrador del sistema ya fue notificado; ` +
        `reintenta en cuanto se recargue el saldo.`,
    );
    this.disponible = disponible;
    this.requerido = requerido;
  }
}

/** Llave estable por corrida: dos reintentos concurrentes comparten reserva. */
export function claveReserva(runId: string): string {
  return `run:${runId}`;
}

// ---------------------------------------------------------------------
// Saldo global del PAC
// ---------------------------------------------------------------------

export async function leerSaldoPac(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("sat_pac_saldo")
    .select(
      "saldo_solicitudes, reservado_solicitudes, umbral_aviso, umbral_critico, costo_unitario_centavos",
    )
    .eq("proveedor", "sw_sapien")
    .maybeSingle();
  const saldo = (data as any)?.saldo_solicitudes ?? 0;
  const reservado = (data as any)?.reservado_solicitudes ?? 0;
  return {
    saldo,
    reservado,
    disponible: Math.max(0, saldo - reservado),
    umbral_aviso: (data as any)?.umbral_aviso ?? 1000,
    umbral_critico: (data as any)?.umbral_critico ?? 200,
    costo_unitario_centavos: (data as any)?.costo_unitario_centavos ?? 50,
  };
}

/** Alertas globales 80% / umbral / agotado, con proyección de días restantes. */
export async function evaluarAlertasSaldoPac(supabase: SupabaseClient) {
  const s = await leerSaldoPac(supabase);
  const total = s.saldo + s.reservado;

  const { data: consumo } = await supabase
    .from("sat_pac_movimientos")
    .select("solicitudes, created_at")
    .eq("tipo", "consumo")
    .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());
  const consumidas30 = (consumo ?? []).reduce((a: number, m: any) => a + (m.solicitudes ?? 0), 0);
  const ritmoDiario = consumidas30 / 30;
  const diasRestantes = ritmoDiario > 0 ? Math.floor(s.disponible / ritmoDiario) : null;

  let umbral: "80" | "critico" | "agotado" | null = null;
  let nivel: "medio" | "alto" = "medio";
  if (s.disponible <= 0) {
    umbral = "agotado";
    nivel = "alto";
  } else if (s.disponible <= s.umbral_critico) {
    umbral = "critico";
    nivel = "alto";
  } else if (total > 0 && s.disponible / total <= 0.2) {
    umbral = "80";
    nivel = "medio";
  }
  if (!umbral) return { ...s, dias_restantes: diasRestantes, alerta: null };

  const titulo =
    umbral === "agotado"
      ? "Saldo SAT agotado: las descargas están detenidas"
      : umbral === "critico"
        ? "Saldo SAT en nivel crítico"
        : "Saldo SAT al 80% de consumo";

  await supabase
    .from("alertas")
    .insert({
      despacho_id: null,
      tipo: "sat_saldo",
      nivel,
      titulo,
      descripcion:
        `Disponible: ${s.disponible} solicitudes (${s.reservado} reservadas). ` +
        `Consumo últimos 30 días: ${consumidas30}. ` +
        (diasRestantes != null
          ? `Proyección: ~${diasRestantes} días de operación.`
          : "Sin consumo reciente para proyectar."),
      recomendacion: "Registrar una recarga en Administración → Saldo SAT.",
      accion_sugerida: "Recargar saldo",
      evidencia: {
        umbral,
        periodo: periodoActual(),
        disponible: s.disponible,
        reservado: s.reservado,
        consumo_30d: consumidas30,
        dias_restantes: diasRestantes,
      },
    })
    .then(
      () => undefined,
      () => undefined,
    );

  return { ...s, dias_restantes: diasRestantes, alerta: umbral };
}

// ---------------------------------------------------------------------
// Reserva / confirmación / devolución
// ---------------------------------------------------------------------

/**
 * Reserva saldo de forma transaccional e idempotente. Si no alcanza, lanza
 * SaldoPacInsuficienteError y la corrida no debe iniciar.
 */
export async function reservarSaldoPac(
  supabase: SupabaseClient,
  opts: { key: string; solicitudes: number; runId?: string | null; despachoId?: string | null },
): Promise<{ reservadas: number; duplicado: boolean }> {
  if (opts.solicitudes <= 0) return { reservadas: 0, duplicado: false };

  const { data, error } = await supabase.rpc("pac_reservar", {
    _key: opts.key,
    _solicitudes: opts.solicitudes,
    _run_id: opts.runId ?? null,
    _despacho: opts.despachoId ?? null,
    _motivo: "Reserva previa a corrida SAT",
  });
  if (error) throw new Error(`No se pudo reservar saldo SAT: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    await evaluarAlertasSaldoPac(supabase);
    throw new SaldoPacInsuficienteError(row?.saldo_disponible ?? 0, opts.solicitudes);
  }
  await evaluarAlertasSaldoPac(supabase);
  return { reservadas: row.reservadas ?? opts.solicitudes, duplicado: !!row.duplicado };
}

/** Confirma el consumo real; devuelve al saldo lo reservado y no usado. */
export async function confirmarConsumoPac(
  supabase: SupabaseClient,
  opts: { key: string; reales: number; runId?: string | null; despachoId?: string | null },
) {
  const { error } = await supabase.rpc("pac_confirmar_consumo", {
    _key: opts.key,
    _solicitudes_reales: Math.max(0, opts.reales),
    _run_id: opts.runId ?? null,
    _despacho: opts.despachoId ?? null,
  });
  if (error) console.error("[pac] confirmar consumo:", error.message);
  await evaluarAlertasSaldoPac(supabase);
}

/** Falla del PAC tras reservar: libera la reserva completa. */
export async function devolverReservaPac(
  supabase: SupabaseClient,
  key: string,
  motivo: string,
) {
  const { error } = await supabase.rpc("pac_devolver_reserva", { _key: key, _motivo: motivo });
  if (error) console.error("[pac] devolución:", error.message);
}

// ---------------------------------------------------------------------
// Candado completo previo a una corrida
// ---------------------------------------------------------------------

/**
 * Aplica los 4 candados: acceso de la cuenta, frecuencia del plan, cuota del
 * despacho y saldo operativo del PAC (reservándolo). Devuelve la llave de
 * reserva para confirmar o devolver después.
 */
export async function assertSatRunPermitido(opts: {
  supabase: SupabaseClient;
  despachoId: string;
  frecuencia: FrecuenciaSat;
  previstas: number;
  runId?: string | null;
  esMock?: boolean;
}): Promise<{ ent: Entitlements; reservaKey: string | null }> {
  const ent = await getEntitlements(opts.supabase, opts.despachoId);
  assertFrecuencia(ent, opts.frecuencia);
  if (opts.previstas <= 0) return { ent, reservaKey: null };

  await assertCuota(opts.supabase, ent, "sat_solicitudes", opts.previstas);

  // Las corridas demo/sandbox no tocan el saldo real del proveedor.
  if (opts.esMock || ent.es_sandbox) return { ent, reservaKey: null };

  const key = claveReserva(opts.runId ?? crypto.randomUUID());
  await reservarSaldoPac(opts.supabase, {
    key,
    solicitudes: opts.previstas,
    runId: opts.runId ?? null,
    despachoId: opts.despachoId,
  });
  return { ent, reservaKey: key };
}

/** Registra consumo real del despacho y liquida la reserva del PAC. */
export async function registrarConsumoSat(opts: {
  supabase: SupabaseClient;
  despachoId: string;
  solicitudes: number;
  esMock: boolean;
  reservaKey?: string | null;
  runId?: string | null;
}) {
  if (opts.solicitudes > 0 && !opts.esMock) {
    const { costo_unitario_centavos } = await leerSaldoPac(opts.supabase);
    await opts.supabase.rpc("incrementar_uso_sat", {
      _despacho: opts.despachoId,
      _periodo: periodoActual(),
      _solicitudes: opts.solicitudes,
      _costo_centavos: opts.solicitudes * costo_unitario_centavos,
    });
  }

  if (opts.reservaKey) {
    await confirmarConsumoPac(opts.supabase, {
      key: opts.reservaKey,
      reales: opts.esMock ? 0 : opts.solicitudes,
      runId: opts.runId ?? null,
      despachoId: opts.despachoId,
    });
  }
}
