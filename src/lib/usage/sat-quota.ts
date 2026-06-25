// Candados de costo para el PAC SAT (SW Sapien).
// - Calcula cuántas solicitudes generará una corrida o conexión.
// - Bloquea por cuota del plan (despacho) y por saldo global de la cuenta PAC.
// - Registra consumo real tras la corrida.

import type { SupabaseClient } from "@supabase/supabase-js";
import { assertWithinLimit, getPlanLimites, periodoActual, type Limites } from "./limits";

export type FrecuenciaSat = "manual" | "mensual" | "semanal" | "diaria";

const FREC_RANK: Record<FrecuenciaSat, number> = { manual: 0, mensual: 1, semanal: 2, diaria: 3 };

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

export class FrecuenciaNoPermitidaError extends Error {
  constructor(plan: FrecuenciaSat, pedida: FrecuenciaSat) {
    super(
      `Tu plan permite frecuencia máxima ${plan}. Para usar ${pedida}, mejora tu plan.`,
    );
  }
}

export function assertFrecuenciaPermitida(limites: Limites, pedida: FrecuenciaSat) {
  const max = (limites.sat_frecuencia_max ?? "diaria") as FrecuenciaSat;
  if (FREC_RANK[pedida] > FREC_RANK[max]) {
    throw new FrecuenciaNoPermitidaError(max, pedida);
  }
}

export class SaldoPacInsuficienteError extends Error {
  constructor(saldo: number, previstas: number) {
    super(
      `El proveedor de descarga SAT no tiene saldo suficiente (saldo: ${saldo}, requiere: ${previstas}). ` +
        `El administrador del sistema fue notificado.`,
    );
  }
}

/** Lee el saldo global del PAC y bloquea si no alcanza. Requiere supabaseAdmin. */
export async function assertSaldoPacDisponible(
  supabaseAdmin: SupabaseClient,
  previstas: number,
) {
  if (previstas <= 0) return;
  const { data: saldo } = await supabaseAdmin
    .from("sat_pac_saldo")
    .select("saldo_solicitudes, umbral_aviso")
    .eq("proveedor", "sw_sapien")
    .maybeSingle();
  const disponible = saldo?.saldo_solicitudes ?? 0;
  const umbral = saldo?.umbral_aviso ?? 1000;

  // Si el saldo restante después de la corrida quedaría por debajo del umbral,
  // emite alerta global (idempotente) — sin bloquear todavía.
  if (disponible - previstas < umbral) {
    await supabaseAdmin
      .from("alertas")
      .insert({
        despacho_id: null,
        tipo: "sat_saldo_bajo",
        nivel: disponible - previstas <= 0 ? "alto" : "medio",
        titulo: "Saldo bajo en proveedor SAT",
        descripcion: `Saldo SW: ${disponible}, próximo consumo previsto: ${previstas}.`,
        recomendacion: "Registrar recarga en /app/admin/sat-saldo.",
        evidencia: { saldo: disponible, previstas, umbral, periodo: periodoActual() },
      })
      .then(() => undefined, () => undefined);
  }

  if (disponible < previstas) {
    throw new SaldoPacInsuficienteError(disponible, previstas);
  }
}

/** Atajo: aplica los 3 candados (frecuencia + cuota despacho + saldo PAC). */
export async function assertSatRunPermitido(opts: {
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient | null;
  despachoId: string;
  frecuencia: FrecuenciaSat;
  previstas: number;
}) {
  const limites = await getPlanLimites(opts.supabase, opts.despachoId);
  assertFrecuenciaPermitida(limites, opts.frecuencia);
  if (opts.previstas > 0) {
    await assertWithinLimit(opts.supabase, opts.despachoId, "sat_solicitudes", opts.previstas);
    if (opts.supabaseAdmin) {
      await assertSaldoPacDisponible(opts.supabaseAdmin, opts.previstas);
    }
  }
}

/** Registra consumo real tras una corrida exitosa o parcial. */
export async function registrarConsumoSat(opts: {
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient | null;
  despachoId: string;
  solicitudes: number;
  esMock: boolean;
}) {
  if (opts.solicitudes <= 0) return;
  const periodo = periodoActual();
  // Costo unitario actual del PAC (o 50 centavos por defecto)
  let costoUnit = 50;
  if (opts.supabaseAdmin) {
    const { data } = await opts.supabaseAdmin
      .from("sat_pac_saldo")
      .select("costo_unitario_centavos")
      .eq("proveedor", "sw_sapien")
      .maybeSingle();
    if (data?.costo_unitario_centavos) costoUnit = data.costo_unitario_centavos;
  }
  const costoTotal = BigInt(opts.solicitudes) * BigInt(costoUnit);

  await opts.supabase.rpc("incrementar_uso_sat", {
    _despacho: opts.despachoId,
    _periodo: periodo,
    _solicitudes: opts.solicitudes,
    _costo_centavos: Number(costoTotal),
  });

  // Solo descuenta saldo PAC cuando es ejecución real (no demo).
  if (!opts.esMock && opts.supabaseAdmin) {
    await opts.supabaseAdmin.rpc("descontar_saldo_pac", {
      _solicitudes: opts.solicitudes,
      _costo_centavos: Number(costoTotal),
    });
  }
}
