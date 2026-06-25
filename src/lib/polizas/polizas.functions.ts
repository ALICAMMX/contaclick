import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

const PolizaRow = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  tipo: z.enum(["ingreso", "egreso", "diario"]),
  monto: z.number().finite(),
  concepto: z.string().max(500).optional().nullable(),
  cuenta: z.string().max(120).optional().nullable(),
  referencia: z.string().max(120).optional().nullable(),
  uuid_cfdi: z.string().max(64).optional().nullable(),
});

export type PolizaInput = z.infer<typeof PolizaRow>;

// ---------- Crear póliza manual ----------
export const crearPoliza = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), poliza: PolizaRow }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cli, error: errCli } = await supabase
      .from("clientes")
      .select("id, despacho_id")
      .eq("id", data.cliente_id)
      .maybeSingle();
    if (errCli || !cli) throw new Error("Cliente no encontrado");

    const row = {
      id: crypto.randomUUID(),
      cliente_id: data.cliente_id,
      despacho_id: cli.despacho_id,
      tipo: data.poliza.tipo,
      fecha: data.poliza.fecha,
      monto: data.poliza.monto,
      concepto: data.poliza.concepto ?? null,
      cuenta: data.poliza.cuenta ?? null,
      referencia: data.poliza.referencia ?? null,
      uuid_cfdi: data.poliza.uuid_cfdi ? data.poliza.uuid_cfdi.toUpperCase() : null,
      origen: "manual" as const,
      created_by: userId,
    };
    const { error } = await supabase.from("polizas").insert(row);
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

// ---------- Importar lote (CSV ya parseado) ----------
export const importarPolizas = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      polizas: z.array(PolizaRow).min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cli, error: errCli } = await supabase
      .from("clientes")
      .select("id, despacho_id")
      .eq("id", data.cliente_id)
      .maybeSingle();
    if (errCli || !cli) throw new Error("Cliente no encontrado");

    const rows = data.polizas.map((p) => ({
      id: crypto.randomUUID(),
      cliente_id: data.cliente_id,
      despacho_id: cli.despacho_id,
      tipo: p.tipo,
      fecha: p.fecha,
      monto: p.monto,
      concepto: p.concepto ?? null,
      cuenta: p.cuenta ?? null,
      referencia: p.referencia ?? null,
      uuid_cfdi: p.uuid_cfdi ? p.uuid_cfdi.toUpperCase() : null,
      origen: "import" as const,
      created_by: userId,
    }));

    // Insertar en lotes de 500 para no exceder límites
    let insertadas = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase.from("polizas").insert(chunk);
      if (error) throw new Error(`Error en lote ${i / 500 + 1}: ${error.message}`);
      insertadas += chunk.length;
    }
    return { insertadas };
  });

// ---------- Listar pólizas ----------
export const listarPolizas = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("polizas")
      .select("id, fecha, tipo, monto, concepto, cuenta, referencia, uuid_cfdi, origen, created_at")
      .eq("cliente_id", data.cliente_id)
      .order("fecha", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Eliminar póliza ----------
export const eliminarPoliza = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("polizas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
