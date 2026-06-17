import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

const BankList = ["BBVA", "Banorte", "Santander", "Banamex", "HSBC", "Scotiabank", "Inbursa", "Azteca", "Mifel", "Otro"] as const;

const CuentaSchema = z.object({
  cliente_id: z.string().uuid(),
  banco: z.string().min(1).max(60),
  alias: z.string().max(80).optional().nullable(),
  numero_cuenta_mask: z.string().max(40).optional().nullable(),
  moneda: z.string().max(8).default("MXN"),
});

export const listCuentas = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("cuentas_bancarias")
      .select("id, banco, alias, numero_cuenta_mask, moneda, created_at")
      .eq("cliente_id", data.cliente_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    // movimientos count per cuenta
    const ids = (rows ?? []).map((r) => r.id);
    let counts: Record<string, number> = {};
    if (ids.length) {
      const { data: movs } = await context.supabase
        .from("movimientos_bancarios")
        .select("cuenta_id")
        .in("cuenta_id", ids);
      counts = (movs ?? []).reduce<Record<string, number>>((a, m) => {
        const k = m.cuenta_id as string;
        a[k] = (a[k] ?? 0) + 1;
        return a;
      }, {});
    }
    return { cuentas: (rows ?? []).map((r) => ({ ...r, movimientos: counts[r.id] ?? 0 })) };
  });

export const createCuenta = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => CuentaSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Resolve despacho_id from the client record
    const { data: cli, error: ec } = await supabase
      .from("clientes").select("despacho_id").eq("id", data.cliente_id).single();
    if (ec || !cli?.despacho_id) throw new Error("Cliente sin despacho asignado");
    const { data: row, error } = await supabase
      .from("cuentas_bancarias")
      .insert({
        despacho_id: cli.despacho_id,
        cliente_id: data.cliente_id,
        banco: data.banco,
        alias: data.alias || "Principal",
        numero_cuenta_mask: data.numero_cuenta_mask || null,
        moneda: data.moneda || "MXN",
      })
      .select("id, banco, alias, numero_cuenta_mask, moneda, created_at")
      .single();
    if (error) throw new Error(error.message);
    void userId;
    return row;
  });

export const updateCuenta = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    banco: z.string().min(1).max(60).optional(),
    alias: z.string().max(80).optional().nullable(),
    numero_cuenta_mask: z.string().max(40).optional().nullable(),
    moneda: z.string().max(8).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("cuentas_bancarias").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCuenta = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Block deletion if it has movements (avoid orphaning conciliaciones)
    const { count } = await context.supabase
      .from("movimientos_bancarios")
      .select("id", { count: "exact", head: true })
      .eq("cuenta_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error(`No se puede borrar: la cuenta tiene ${count} movimientos. Elimina primero los movimientos.`);
    }
    const { error } = await context.supabase.from("cuentas_bancarias").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const BANCOS = BankList;
