import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

// Cuentas por defecto usadas para movimientos bancarios sin clasificar.
const CTA_BANCOS = { c: "102-01", n: "Bancos" };
const CTA_ING_POR_IDENT = { c: "499-01", n: "Ingresos por identificar" };
const CTA_GTO_POR_IDENT = { c: "699-01", n: "Gastos por identificar" };

type ReglaBanco = {
  id: string;
  nombre: string;
  prioridad: number;
  activa: boolean;
  cuenta_cargo: string;
  cuenta_abono: string;
  condicion: {
    keyword?: string | null;
    min_monto?: number | null;
    max_monto?: number | null;
    tipo_cfdi?: string | null; // ignorado para bancos
  } | null;
};

function matchReglaBanco(desc: string, monto: number, reglas: ReglaBanco[]) {
  const sorted = [...reglas].filter((r) => r.activa).sort((a, b) => b.prioridad - a.prioridad);
  for (const r of sorted) {
    const cd = r.condicion ?? {};
    if (cd.keyword && !desc.toLowerCase().includes(cd.keyword.toLowerCase())) continue;
    if (cd.min_monto != null && monto < cd.min_monto) continue;
    if (cd.max_monto != null && monto > cd.max_monto) continue;
    return r;
  }
  return null;
}

// ---------- Listar movimientos bancarios sin póliza ----------
export const listarMovimientosSinPoliza = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      desde: z.string().optional(),
      hasta: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("movimientos_bancarios")
      .select("id, fecha, descripcion, referencia, cargo, abono, cuenta_id")
      .eq("cliente_id", data.cliente_id)
      .order("fecha", { ascending: false })
      .limit(data.limit);
    if (data.desde) q = q.gte("fecha", data.desde);
    if (data.hasta) q = q.lte("fecha", data.hasta);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.id);
    let yaPolizados = new Set<string>();
    if (ids.length) {
      const { data: pol } = await supabase
        .from("polizas")
        .select("movimiento_bancario_id")
        .eq("cliente_id", data.cliente_id)
        .in("movimiento_bancario_id", ids);
      yaPolizados = new Set((pol ?? []).map((p: any) => p.movimiento_bancario_id).filter(Boolean));
    }
    return (rows ?? []).filter((r) => !yaPolizados.has(r.id));
  });

// ---------- Generar pólizas borrador desde movimientos ----------
export const generarPolizasDesdeMovimientos = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      movimiento_ids: z.array(z.string().uuid()).min(1).max(500),
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

    const { data: movs, error } = await supabase
      .from("movimientos_bancarios")
      .select("id, fecha, descripcion, referencia, cargo, abono")
      .eq("cliente_id", data.cliente_id)
      .in("id", data.movimiento_ids);
    if (error) throw new Error(error.message);

    const { data: reglasRows } = await supabase
      .from("reglas_contables")
      .select("id, nombre, prioridad, activa, cuenta_cargo, cuenta_abono, condicion")
      .eq("cliente_id", data.cliente_id)
      .eq("activa", true);
    const reglas: ReglaBanco[] = (reglasRows ?? []) as any;

    const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
    const filas: any[] = [];
    let omitidos = 0;

    for (const m of movs ?? []) {
      const cargo = r2(m.cargo as number);
      const abono = r2(m.abono as number);
      if (cargo === 0 && abono === 0) { omitidos++; continue; }
      const esIngreso = abono > 0;
      const monto = esIngreso ? abono : cargo;
      const desc = m.descripcion ?? "(sin descripción)";
      const regla = matchReglaBanco(desc, monto, reglas);

      let cuentaCargo = esIngreso ? CTA_BANCOS.c : (regla?.cuenta_cargo ?? CTA_GTO_POR_IDENT.c);
      let nombreCargo = esIngreso ? CTA_BANCOS.n : (regla ? `${CTA_GTO_POR_IDENT.n} · ${regla.nombre}` : CTA_GTO_POR_IDENT.n);
      let cuentaAbono = esIngreso ? (regla?.cuenta_abono ?? CTA_ING_POR_IDENT.c) : CTA_BANCOS.c;
      let nombreAbono = esIngreso ? (regla ? `${CTA_ING_POR_IDENT.n} · ${regla.nombre}` : CTA_ING_POR_IDENT.n) : CTA_BANCOS.n;

      const asientos = [
        { cuenta: cuentaCargo, nombre: nombreCargo, debe: monto, haber: 0 },
        { cuenta: cuentaAbono, nombre: nombreAbono, debe: 0, haber: monto },
      ];
      const warnings: string[] = [];
      if (!regla) warnings.push("Sin regla: clasificación pendiente.");

      filas.push({
        id: crypto.randomUUID(),
        cliente_id: data.cliente_id,
        despacho_id: cli.despacho_id as string,
        movimiento_bancario_id: m.id,
        tipo: esIngreso ? "ingreso" : "egreso",
        fecha: String(m.fecha).slice(0, 10),
        monto,
        concepto: `Banco · ${esIngreso ? "depósito" : "cargo"} · ${desc.slice(0, 80)}`,
        cuenta: cuentaCargo,
        referencia: m.referencia ?? null,
        origen: "auto_banco",
        estado: "borrador",
        metadata: { asientos, warnings, regla_aplicada: regla?.nombre ?? null },
        created_by: userId,
      });
    }

    let insertadas = 0;
    for (let i = 0; i < filas.length; i += 200) {
      const chunk = filas.slice(i, i + 200);
      const { error: errIns } = await supabase.from("polizas").insert(chunk);
      if (errIns) throw new Error(`Lote ${i / 200 + 1}: ${errIns.message}`);
      insertadas += chunk.length;
    }
    return { insertadas, omitidos };
  });
