import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

export type HistorialItem = {
  id: string;
  fecha: string;
  tipo: "tool_run" | "audit";
  titulo: string;
  detalle: string | null;
  status: string | null;
};

export const getClienteHistorial = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [runsRes, auditRes] = await Promise.all([
      supabase
        .from("tool_runs")
        .select("id, tool_key, status, notes, created_at")
        .eq("cliente_id", data.cliente_id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("audit_logs")
        .select("id, accion, entidad, payload, created_at")
        .eq("entidad_id", data.cliente_id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const items: HistorialItem[] = [];

    (runsRes.data ?? []).forEach((r: any) => {
      items.push({
        id: `run-${r.id}`,
        fecha: r.created_at,
        tipo: "tool_run",
        titulo: prettyTool(r.tool_key),
        detalle: r.notes ?? null,
        status: r.status ?? null,
      });
    });

    (auditRes.data ?? []).forEach((a: any) => {
      items.push({
        id: `aud-${a.id}`,
        fecha: a.created_at,
        tipo: "audit",
        titulo: `${a.accion} · ${a.entidad}`,
        detalle: null,
        status: null,
      });
    });

    items.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    return { items: items.slice(0, 80) };
  });

function prettyTool(key: string): string {
  const map: Record<string, string> = {
    riesgo_sat: "Riesgo SAT 2026",
    express_auditor: "Auditor express",
    isr_iva_pf: "Calculadora ISR/IVA · PF",
    isr_iva_pm: "Calculadora ISR/IVA · PM",
    conciliacion: "Conciliación bancaria",
    efos: "Revisión EFOS",
    resumen_fiscal: "Resumen fiscal",
    descarga_sat: "Descarga CFDI SAT",
    "csf-parser": "Lector de Constancia Fiscal",
    "cfdi-validator": "Validador CFDI",
    "cfdi-verifier": "Verificador CFDI",
    "oficio-generator": "Generador de oficios",
  };
  return map[key] ?? key;
}
