// Panel super-admin: saldo del PAC SAT (SW Sapien), recargas y consumo por despacho.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";
import { periodoActual } from "@/lib/usage/limits";

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
    const { data: saldo } = await context.supabase
      .from("sat_pac_saldo")
      .select("*")
      .eq("proveedor", "sw_sapien")
      .maybeSingle();

    // Top despachos por consumo en el mes actual
    const periodo = periodoActual();
    const { data: top } = await context.supabase
      .from("uso_periodo")
      .select("despacho_id, sat_solicitudes, sat_costo_centavos, despachos(nombre)")
      .eq("periodo", periodo)
      .order("sat_solicitudes", { ascending: false })
      .limit(10);

    const totalMes = (top ?? []).reduce(
      (acc: number, r: any) => acc + (r.sat_solicitudes ?? 0),
      0,
    );

    // Estimación de días restantes al ritmo del mes
    const diasDelMes = new Date().getUTCDate();
    const ritmoDiario = diasDelMes > 0 ? totalMes / diasDelMes : 0;
    const diasRestantes =
      ritmoDiario > 0 && saldo?.saldo_solicitudes
        ? Math.floor(saldo.saldo_solicitudes / ritmoDiario)
        : null;

    return {
      saldo,
      top_despachos: top ?? [],
      total_mes: totalMes,
      ritmo_diario: Math.round(ritmoDiario),
      dias_restantes: diasRestantes,
      periodo,
    };
  });

export const recargarSatPac = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        solicitudes: z.number().int().positive(),
        costo_total_mxn: z.number().positive(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const centavos = Math.round(data.costo_total_mxn * 100);
    const { data: row, error } = await context.supabase.rpc("recargar_saldo_pac", {
      _solicitudes: data.solicitudes,
      _costo_total_centavos: centavos,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const ajustarSatPacConfig = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        umbral_aviso: z.number().int().min(0).optional(),
        costo_unitario_centavos: z.number().int().min(1).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const patch: any = {};
    if (data.umbral_aviso !== undefined) patch.umbral_aviso = data.umbral_aviso;
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
