// Panel super-admin: saldo del PAC SAT (SW Sapien), libro de movimientos,
// recargas auditadas y conciliación contra corridas SAT.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";
import { periodoActual } from "@/lib/entitlements/service";
import { evaluarAlertasSaldoPac, leerSaldoPac } from "@/lib/usage/sat-quota";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .limit(1);
  if (!data?.length) throw new Error("Solo super-admin");
}

export const getSatPacSaldo = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const supabase = context.supabase;

    const { data: saldo } = await supabase
      .from("sat_pac_saldo")
      .select("*")
      .eq("proveedor", "sw_sapien")
      .maybeSingle();

    const estado = await leerSaldoPac(supabase);

    // Top despachos por consumo en el mes actual
    const periodo = periodoActual();
    const { data: top } = await supabase
      .from("uso_periodo")
      .select("despacho_id, sat_solicitudes, sat_costo_centavos, despachos(nombre)")
      .eq("periodo", periodo)
      .order("sat_solicitudes", { ascending: false })
      .limit(10);

    const totalMes = (top ?? []).reduce(
      (acc: number, r: any) => acc + (r.sat_solicitudes ?? 0),
      0,
    );

    // Proyección con el consumo real de los últimos 30 días (libro mayor)
    const { data: consumo30 } = await supabase
      .from("sat_pac_movimientos")
      .select("solicitudes")
      .eq("tipo", "consumo")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());
    const consumidas30 = (consumo30 ?? []).reduce(
      (a: number, m: any) => a + (m.solicitudes ?? 0),
      0,
    );
    const ritmoDiario = consumidas30 / 30;
    const diasRestantes =
      ritmoDiario > 0 ? Math.floor(estado.disponible / ritmoDiario) : null;

    return {
      saldo,
      disponible: estado.disponible,
      reservado: estado.reservado,
      umbral_aviso: estado.umbral_aviso,
      umbral_critico: estado.umbral_critico,
      top_despachos: top ?? [],
      total_mes: totalMes,
      ritmo_diario: Math.round(ritmoDiario),
      dias_restantes: diasRestantes,
      periodo,
    };
  });

/** Libro mayor inmutable: recargas, reservas, consumos, devoluciones y ajustes. */
export const listarMovimientosPac = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ limit: z.number().int().min(1).max(500).default(100) })
      .partial()
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("sat_pac_movimientos")
      .select(
        "id, tipo, solicitudes, costo_centavos, saldo_resultante, motivo, referencia, idempotency_key, run_id, despacho_id, created_at, created_by",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Conciliación: solicitudes de corridas SAT vs movimientos del libro mayor. */
export const conciliarPac = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ dias: z.number().int().min(1).max(180).default(30) }).partial().parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const desde = new Date(Date.now() - (data.dias ?? 30) * 86400000).toISOString();
    const { data: rows, error } = await context.supabase.rpc("pac_conciliacion", {
      _desde: desde,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      desde,
      corridas_sat: row?.corridas_sat ?? 0,
      consumos_ledger: row?.consumos ?? 0,
      uso_periodo_total: row?.solicitudes_uso_periodo ?? 0,
      recargas: row?.recargas ?? 0,
      devoluciones: row?.devoluciones ?? 0,
      ajustes: row?.ajustes ?? 0,
      reservado: row?.reservado ?? 0,
      saldo_actual: row?.saldo_actual ?? 0,
      saldo_calculado: row?.saldo_calculado ?? 0,
      diferencia: row?.descuadre ?? 0,
      cuadra: (row?.descuadre ?? 0) === 0,
    };
  });

export const recargarSatPac = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        solicitudes: z.number().int().positive(),
        costo_total_mxn: z.number().positive(),
        referencia: z.string().min(3).max(120),
        confirmacion: z.literal("RECARGAR"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const centavos = Math.round(data.costo_total_mxn * 100);
    const { data: row, error } = await context.supabase.rpc("pac_recargar", {
      _solicitudes: data.solicitudes,
      _costo_total_centavos: centavos,
      _motivo: `Recarga manual registrada por super-admin. Referencia: ${data.referencia}`,
      // Llave de idempotencia: dos envíos del mismo comprobante no duplican saldo.
      _key: `recarga:${data.referencia}`,
    });
    if (error) throw new Error(error.message);
    await evaluarAlertasSaldoPac(context.supabase);
    return Array.isArray(row) ? row[0] : row;
  });

/** Ajuste manual (positivo o negativo) — siempre con motivo y queda en bitácora. */
export const ajustarSaldoPac = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        solicitudes: z.number().int(),
        motivo: z.string().min(10).max(300),
        referencia: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    if (data.solicitudes === 0) throw new Error("El ajuste no puede ser cero.");
    const { data: row, error } = await context.supabase.rpc("pac_ajustar", {
      _delta: data.solicitudes,
      _motivo: data.motivo,
      _key: `ajuste:${data.referencia ?? `${Date.now()}`}`,
    });
    if (error) throw new Error(error.message);
    await evaluarAlertasSaldoPac(context.supabase);
    return Array.isArray(row) ? row[0] : row;
  });

export const ajustarSatPacConfig = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        umbral_aviso: z.number().int().min(0).optional(),
        umbral_critico: z.number().int().min(0).optional(),
        costo_unitario_centavos: z.number().int().min(1).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const patch: any = {};
    if (data.umbral_aviso !== undefined) patch.umbral_aviso = data.umbral_aviso;
    if (data.umbral_critico !== undefined) patch.umbral_critico = data.umbral_critico;
    if (data.costo_unitario_centavos !== undefined)
      patch.costo_unitario_centavos = data.costo_unitario_centavos;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("sat_pac_saldo")
      .update(patch)
      .eq("proveedor", "sw_sapien");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
