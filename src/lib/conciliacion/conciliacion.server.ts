import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function ensureDespacho(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: m } = await supabase.from("user_memberships").select("despacho_id").eq("user_id", userId).limit(1).maybeSingle();
  if (m?.despacho_id) return m.despacho_id as string;
  const { data: d, error } = await supabase.from("despachos").insert({ nombre: "Mi despacho", owner_user_id: userId }).select("id").single();
  if (error || !d) throw new Error(`No se pudo crear despacho: ${error?.message}`);
  await supabase.from("user_memberships").insert({ user_id: userId, despacho_id: d.id });
  await supabase.from("user_roles").insert({ user_id: userId, role: "despacho", despacho_id: d.id });
  return d.id as string;
}

export async function ensureCuenta(
  supabase: SupabaseClient,
  args: { despachoId: string; clienteId: string; banco: string; alias?: string | null; mask?: string | null },
): Promise<string> {
  const { data: existing } = await supabase
    .from("cuentas_bancarias")
    .select("id")
    .eq("despacho_id", args.despachoId)
    .eq("cliente_id", args.clienteId)
    .eq("banco", args.banco)
    .eq("alias", args.alias ?? "Principal")
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await supabase
    .from("cuentas_bancarias")
    .insert({
      despacho_id: args.despachoId,
      cliente_id: args.clienteId,
      banco: args.banco,
      alias: args.alias ?? "Principal",
      numero_cuenta_mask: args.mask ?? null,
      moneda: "MXN",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo crear cuenta: ${error?.message}`);
  return data.id as string;
}

export function normalizeBankDescription(value: unknown): string {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (text || "(sin descripción)").slice(0, 480);
}

export function normalizeBankReference(value: unknown): string | null {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 120) : null;
}

const MovimientoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  descripcion: z.preprocess(normalizeBankDescription, z.string()),
  referencia: z.preprocess(normalizeBankReference, z.string().nullable()),
  cargo: z.number().min(0).default(0),
  abono: z.number().min(0).default(0),
  saldo: z.number().nullable().default(null),
});

const UploadSchema = z.object({
  cliente_id: z.string().uuid(),
  cuenta_id: z.string().uuid().optional(),
  banco: z.string().min(1).max(60).optional(),
  alias: z.string().max(80).optional(),
  mask: z.string().max(40).optional(),
  movimientos: z.array(MovimientoSchema).min(1).max(5000),
});

function normalizeUploadPayload(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const payload = value as Record<string, unknown>;
  const movimientos = Array.isArray(payload.movimientos)
    ? payload.movimientos.map((item) => {
        if (!item || typeof item !== "object") return item;
        const movimiento = item as Record<string, unknown>;
        return {
          ...movimiento,
          descripcion: normalizeBankDescription(movimiento.descripcion),
          referencia: normalizeBankReference(movimiento.referencia),
        };
      })
    : payload.movimientos;

  return { ...payload, movimientos };
}

export function parseUploadMovimientosInput(data: unknown) {
  return UploadSchema.parse(normalizeUploadPayload(data));
}

export function parseListMovimientosInput(data: unknown) {
  return z.object({
    cliente_id: z.string().uuid(),
    cuenta_id: z.string().uuid().optional(),
    limit: z.number().min(1).max(1000).default(500),
  }).parse(data);
}

export function parseClienteInput(data: unknown) {
  return z.object({ cliente_id: z.string().uuid() }).parse(data);
}

export function parseRunReconciliationInput(data: unknown) {
  return z.object({
    cliente_id: z.string().uuid(),
    tolerancia_pct: z.number().min(0).max(5).default(0.5),
    dias_ventana: z.number().min(0).max(30).default(5),
  }).parse(data);
}

export function parseUpdateConciliacionInput(data: unknown) {
  return z.object({
    id: z.string().uuid(),
    estatus: z.enum(["propuesto", "confirmado", "rechazado", "ignorado"]),
  }).parse(data);
}