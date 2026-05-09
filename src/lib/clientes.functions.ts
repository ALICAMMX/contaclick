import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i;

const CreateSchema = z.object({
  rfc: z.string().regex(RFC_REGEX, "RFC inválido").transform((s) => s.toUpperCase()),
  razon_social: z.string().min(2).max(200),
  regimen_fiscal: z.string().max(100).optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  telefono: z.string().max(40).optional().nullable(),
  notas: z.string().max(2000).optional().nullable(),
});

export const listClientes = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("clientes")
      .select("id, rfc, razon_social, regimen_fiscal, semaforo, estado_mes, email, telefono, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { clientes: data ?? [] };
  });

export const getCliente = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("clientes").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    return row;
  });

export const createCliente = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("clientes")
      .insert({
        user_id: userId,
        rfc: data.rfc,
        razon_social: data.razon_social,
        regimen_fiscal: data.regimen_fiscal || null,
        email: data.email || null,
        telefono: data.telefono || null,
        notas: data.notas || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCliente = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("clientes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
