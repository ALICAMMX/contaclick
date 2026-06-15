import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MonthRow = {
  mes: number; // 1..12
  ingresos_cfdi: number;
  egresos_cfdi: number;
  bank_ingresos: number;
  bank_egresos: number;
  conciliados: number;
  movimientos: number;
  cfdi_count: number;
  diferencia: number; // bank_ingresos - ingresos_cfdi
  diff_pct: number;
  estado: "verde" | "amarillo" | "rojo" | "vacio";
  conciliado_completo: boolean;
};

export const getMonthlyHistorial = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().min(1), year: z.number().int().min(2018).max(2100).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const year = data.year ?? new Date().getFullYear();
    if (!UUID_RE.test(data.cliente_id)) {
      return { year, meses: Array.from({ length: 12 }, (_, i) => emptyMonth(i + 1)) };
    }
    const { supabase } = context;
    const yStart = `${year}-01-01`;
    const yEnd = `${year + 1}-01-01`;

    const { data: cli } = await supabase.from("clientes").select("rfc").eq("id", data.cliente_id).maybeSingle();
    const rfcCli = ((cli?.rfc as string) ?? "").toUpperCase();

    const [{ data: cfdis }, { data: movs }, { data: conc }] = await Promise.all([
      supabase
        .from("cfdi_xml")
        .select("id, tipo_cfdi, fecha, total, rfc_emisor, rfc_receptor")
        .eq("cliente_id", data.cliente_id)
        .gte("fecha", yStart)
        .lt("fecha", yEnd),
      supabase
        .from("movimientos_bancarios")
        .select("id, fecha, cargo, abono")
        .eq("cliente_id", data.cliente_id)
        .gte("fecha", yStart)
        .lt("fecha", yEnd),
      supabase
        .from("conciliaciones")
        .select("movimiento_id, estatus")
        .eq("cliente_id", data.cliente_id),
    ]);

    const meses: MonthRow[] = Array.from({ length: 12 }, (_, i) => emptyMonth(i + 1));
    const concSet = new Set(
      (conc ?? [])
        .filter((c) => c.estatus === "confirmado" || c.estatus === "propuesto")
        .map((c) => c.movimiento_id as string)
        .filter(Boolean),
    );

    for (const c of cfdis ?? []) {
      const m = new Date(c.fecha as string).getUTCMonth();
      const row = meses[m];
      const total = Number(c.total ?? 0);
      const tipo = c.tipo_cfdi as string;
      const isEmisor = (c.rfc_emisor as string)?.toUpperCase() === rfcCli;
      if (tipo === "I" && isEmisor) row.ingresos_cfdi += total;
      else if (tipo === "I" && !isEmisor) row.egresos_cfdi += total;
      else if (tipo === "E" && isEmisor) row.ingresos_cfdi -= total; // nota de crédito reduce ingresos
      row.cfdi_count += 1;
    }

    for (const mv of movs ?? []) {
      const m = new Date(mv.fecha as string).getUTCMonth();
      const row = meses[m];
      row.bank_ingresos += Number(mv.abono ?? 0);
      row.bank_egresos += Number(mv.cargo ?? 0);
      row.movimientos += 1;
      if (concSet.has(mv.id as string)) row.conciliados += 1;
    }

    for (const row of meses) {
      row.diferencia = row.bank_ingresos - row.ingresos_cfdi;
      const base = Math.max(Math.abs(row.ingresos_cfdi), Math.abs(row.bank_ingresos), 1);
      row.diff_pct = Math.abs(row.diferencia) / base;
      row.conciliado_completo = row.movimientos > 0 && row.conciliados >= row.movimientos;
      if (row.movimientos === 0 && row.cfdi_count === 0) row.estado = "vacio";
      else if (row.diff_pct < 0.005) row.estado = "verde";
      else if (row.diff_pct < 0.05) row.estado = "amarillo";
      else row.estado = "rojo";
    }

    return { year, meses };
  });

function emptyMonth(mes: number): MonthRow {
  return {
    mes,
    ingresos_cfdi: 0,
    egresos_cfdi: 0,
    bank_ingresos: 0,
    bank_egresos: 0,
    conciliados: 0,
    movimientos: 0,
    cfdi_count: 0,
    diferencia: 0,
    diff_pct: 0,
    estado: "vacio",
    conciliado_completo: false,
  };
}
