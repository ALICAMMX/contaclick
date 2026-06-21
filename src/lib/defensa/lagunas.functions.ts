import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";
import { z } from "zod";

const ESTATUS = ["activa", "en_proceso", "resuelta_favorable", "resuelta_desfavorable", "archivada"] as const;

const CreateSchema = z.object({
  cliente_id: z.string().uuid(),
  nombre: z.string().min(1).max(300),
  conflicto: z.string().max(500).optional(),
  potencial: z.string().max(200).optional(),
  estrategia: z.string().max(1000).optional(),
  exito: z.number().int().min(0).max(100).optional(),
});

const UpdateSchema = z.object({
  id: z.string().uuid(),
  estatus: z.enum(ESTATUS).optional(),
  notas: z.string().max(5000).optional(),
});

const IdSchema = z.object({ id: z.string().uuid() });

export type Defensa = {
  id: string;
  user_id: string;
  cliente_id: string;
  nombre: string;
  conflicto: string | null;
  potencial: string | null;
  estrategia: string | null;
  exito: number | null;
  estatus: string;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

export const listDefensas = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("defensas").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { defensas: (rows ?? []) as Defensa[] };
  });

export const createDefensa = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase as never, userId);
    const { data: row, error } = await supabase
      .from("defensas")
      .insert({
        user_id: userId,
        despacho_id: despachoId,
        cliente_id: data.cliente_id,
        nombre: data.nombre,
        conflicto: data.conflicto || null,
        potencial: data.potencial || null,
        estrategia: data.estrategia || null,
        exito: data.exito ?? null,
        estatus: "activa",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as Defensa;
  });

export const updateDefensa = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload: { estatus?: string; notas?: string | null } = {};
    if (data.estatus) payload.estatus = data.estatus;
    if (data.notas !== undefined) payload.notas = data.notas || null;
    const { data: row, error } = await supabase
      .from("defensas")
      .update(payload)
      .eq("id", data.id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as Defensa;
  });

export const deleteDefensa = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => IdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("defensas").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
