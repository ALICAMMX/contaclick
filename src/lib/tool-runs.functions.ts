import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SaveSchema = z.object({
  cliente_id: z.string().uuid().nullable().optional(),
  tool_key: z.string().min(1).max(60),
  status: z.enum(["completed", "failed", "draft"]).default("completed"),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export const saveToolRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("tool_runs")
      .insert({
        user_id: userId,
        cliente_id: data.cliente_id ?? null,
        tool_key: data.tool_key,
        status: data.status,
        input: (data.input ?? null) as never,
        output: (data.output ?? null) as never,
        notes: data.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listToolRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid().optional(), limit: z.number().min(1).max(100).default(30) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("tool_runs")
      .select("id, tool_key, status, notes, created_at, cliente_id")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { runs: rows ?? [] };
  });
