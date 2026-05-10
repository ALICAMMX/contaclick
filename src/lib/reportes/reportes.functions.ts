import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

const PeriodSchema = z.object({
  cliente_id: z.string().uuid(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ReporteTipo =
  | "estado_resultados"
  | "iva"
  | "isr"
  | "diferencias"
  | "xml_inconsistentes"
  | "depositos_no_identificados";

// ---- Compute report data ----
export const computeReporte = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    PeriodSchema.extend({ tipo: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { cliente_id, desde, hasta, tipo } = data;

    const { data: cli } = await supabase
      .from("clientes")
      .select("rfc, razon_social, regimen_fiscal, despacho_id")
      .eq("id", cliente_id)
      .single();
    if (!cli) throw new Error("Cliente no encontrado");
    const rfcCli = (cli.rfc as string).toUpperCase();

    const [{ data: cfdis }, { data: movs }, { data: conc }] = await Promise.all([
      supabase
        .from("cfdi_xml")
        .select("id, uuid, tipo_cfdi, fecha, total, subtotal, iva_trasladado, iva_retenido, isr_retenido, rfc_emisor, rfc_receptor, nombre_emisor, nombre_receptor, metodo_pago, forma_pago, version, estatus_sat")
        .eq("cliente_id", cliente_id)
        .gte("fecha", desde)
        .lte("fecha", `${hasta}T23:59:59`),
      supabase
        .from("movimientos_bancarios")
        .select("id, fecha, descripcion, referencia, cargo, abono")
        .eq("cliente_id", cliente_id)
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase
        .from("conciliaciones")
        .select("movimiento_id, cfdi_id, tipo_match, estatus")
        .eq("cliente_id", cliente_id),
    ]);

    const matchedMov = new Set((conc ?? []).filter((c) => c.estatus !== "rechazado").map((c) => c.movimiento_id).filter(Boolean));
    const emitidos = (cfdis ?? []).filter((c) => (c.rfc_emisor as string)?.toUpperCase() === rfcCli && c.tipo_cfdi === "I");
    const recibidos = (cfdis ?? []).filter((c) => (c.rfc_receptor as string)?.toUpperCase() === rfcCli && c.tipo_cfdi === "I");

    const sum = (arr: any[], k: string) => arr.reduce((a, b) => a + Number(b[k] ?? 0), 0);

    let payload: any = { meta: { cliente: cli, periodo: { desde, hasta }, generado: new Date().toISOString() } };

    if (tipo === "estado_resultados") {
      const ingresos = sum(emitidos, "subtotal");
      const egresos = sum(recibidos, "subtotal");
      payload.resumen = {
        ingresos,
        egresos,
        utilidad: ingresos - egresos,
        margen_pct: ingresos ? ((ingresos - egresos) / ingresos) * 100 : 0,
        n_emitidos: emitidos.length,
        n_recibidos: recibidos.length,
      };
      payload.detalle = emitidos.slice(0, 100).map((c) => ({
        fecha: c.fecha, uuid: c.uuid, cliente: c.nombre_receptor, subtotal: Number(c.subtotal ?? 0), total: Number(c.total ?? 0),
      }));
    } else if (tipo === "iva") {
      const iva_trasladado = sum(emitidos, "iva_trasladado");
      const iva_acreditable = sum(recibidos, "iva_trasladado");
      const iva_retenido = sum(emitidos, "iva_retenido");
      payload.resumen = {
        iva_trasladado,
        iva_acreditable,
        iva_retenido,
        iva_por_pagar: Math.max(iva_trasladado - iva_acreditable - iva_retenido, 0),
        a_favor: Math.max(iva_acreditable + iva_retenido - iva_trasladado, 0),
      };
      payload.detalle_emitidos = emitidos.map((c) => ({ fecha: c.fecha, uuid: c.uuid, receptor: c.nombre_receptor, subtotal: Number(c.subtotal ?? 0), iva: Number(c.iva_trasladado ?? 0) }));
      payload.detalle_recibidos = recibidos.map((c) => ({ fecha: c.fecha, uuid: c.uuid, emisor: c.nombre_emisor, subtotal: Number(c.subtotal ?? 0), iva: Number(c.iva_trasladado ?? 0) }));
    } else if (tipo === "isr") {
      const ingresos = sum(emitidos, "subtotal");
      const deducciones = sum(recibidos, "subtotal");
      const utilidad = Math.max(ingresos - deducciones, 0);
      const isr_retenido = sum(emitidos, "isr_retenido");
      const tasa = (cli.regimen_fiscal === "626") ? 0.0125 : 0.30; // RESICO PF 1.25% simplificado, otros 30%
      const isr_provisional = utilidad * tasa;
      payload.resumen = {
        ingresos,
        deducciones,
        utilidad_fiscal: utilidad,
        tasa_aplicada_pct: tasa * 100,
        isr_provisional,
        isr_retenido,
        isr_por_pagar: Math.max(isr_provisional - isr_retenido, 0),
        nota: cli.regimen_fiscal === "626" ? "Cálculo simplificado RESICO PF (1.25%)." : "Cálculo simplificado tasa general (30%). Validar deducciones autorizadas.",
      };
    } else if (tipo === "diferencias") {
      const cfdiSinPago = (cfdis ?? [])
        .filter((c) => c.tipo_cfdi === "I" && !(conc ?? []).some((m) => m.cfdi_id === c.id))
        .map((c) => ({ fecha: c.fecha, uuid: c.uuid, contra: (c.rfc_emisor as string)?.toUpperCase() === rfcCli ? c.nombre_receptor : c.nombre_emisor, total: Number(c.total ?? 0), tipo: (c.rfc_emisor as string)?.toUpperCase() === rfcCli ? "Emitido" : "Recibido" }));
      const movSinCfdi = (movs ?? [])
        .filter((m) => !matchedMov.has(m.id))
        .map((m) => ({ fecha: m.fecha, descripcion: m.descripcion, abono: Number(m.abono ?? 0), cargo: Number(m.cargo ?? 0) }));
      payload.resumen = {
        cfdi_sin_pago: cfdiSinPago.length,
        movimientos_sin_cfdi: movSinCfdi.length,
        monto_cfdi_sin_pago: cfdiSinPago.reduce((a, b) => a + b.total, 0),
        monto_mov_sin_cfdi: movSinCfdi.reduce((a, b) => a + b.abono + b.cargo, 0),
      };
      payload.cfdi_sin_pago = cfdiSinPago.slice(0, 200);
      payload.mov_sin_cfdi = movSinCfdi.slice(0, 200);
    } else if (tipo === "xml_inconsistentes") {
      const issues = (cfdis ?? [])
        .map((c) => {
          const motivos: string[] = [];
          if (c.version !== "4.0") motivos.push(`Versión ${c.version}`);
          if (!c.uuid) motivos.push("Sin UUID (no timbrado)");
          const total = Number(c.total ?? 0);
          const sub = Number(c.subtotal ?? 0);
          const iva = Number(c.iva_trasladado ?? 0);
          if (Math.abs(total - (sub + iva)) > 1) motivos.push("Total ≠ Subtotal + IVA");
          if (c.metodo_pago === "PUE" && c.forma_pago === "99") motivos.push("PUE + Forma 99 inválido");
          if (c.estatus_sat === "Cancelado") motivos.push("Cancelado en SAT");
          return motivos.length ? { fecha: c.fecha, uuid: c.uuid, contra: (c.rfc_emisor as string)?.toUpperCase() === rfcCli ? c.nombre_receptor : c.nombre_emisor, total, motivos } : null;
        })
        .filter(Boolean) as any[];
      payload.resumen = { total_cfdi: (cfdis ?? []).length, inconsistentes: issues.length };
      payload.detalle = issues.slice(0, 300);
    } else if (tipo === "depositos_no_identificados") {
      const items = (movs ?? [])
        .filter((m) => Number(m.abono ?? 0) > 0 && !matchedMov.has(m.id))
        .map((m) => ({ fecha: m.fecha, descripcion: m.descripcion, referencia: m.referencia, abono: Number(m.abono ?? 0) }))
        .sort((a, b) => b.abono - a.abono);
      payload.resumen = {
        total_depositos: items.length,
        monto_total: items.reduce((a, b) => a + b.abono, 0),
      };
      payload.detalle = items.slice(0, 300);
    } else {
      throw new Error(`Tipo de reporte no soportado: ${tipo}`);
    }

    // Persist to reportes table
    const { data: rep, error } = await supabase
      .from("reportes")
      .insert({
        despacho_id: cli.despacho_id,
        cliente_id,
        tipo,
        periodo: `[${desde},${hasta}]`,
        parametros: { desde, hasta },
        resultado: payload,
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);

    return { id: rep.id as string, created_at: rep.created_at as string, payload };
  });

// ---- List recent reports ----
export const listReportes = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("reportes")
      .select("id, tipo, parametros, resultado, created_at, cliente_id")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { reportes: (rows ?? []) as Array<{ id: string; tipo: string; parametros: unknown; resultado: unknown; created_at: string; cliente_id: string | null }> };
  });

// ---- AI executive summary ----
export const summarizeReporteAI = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reporte_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { error: "IA no configurada", content: "" };
    const { data: rep } = await context.supabase.from("reportes").select("tipo, resultado, parametros").eq("id", data.reporte_id).single();
    if (!rep) return { error: "Reporte no encontrado", content: "" };

    const prompt = `Eres contador fiscalista mexicano. Convierte este reporte técnico (${rep.tipo}) en un resumen ejecutivo claro para el cliente:
1) Una frase con el resultado clave en lenguaje no técnico.
2) 3 hallazgos importantes (bullets).
3) 2 acciones recomendadas concretas.
4) Una nota de riesgo si aplica.

Reporte: ${JSON.stringify(rep.resultado).slice(0, 8000)}

Responde en español, formato markdown, máximo 220 palabras.`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Eres ContaClick IA, traductor de tecnicismos fiscales a lenguaje claro." },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (res.status === 429) return { error: "Demasiadas solicitudes.", content: "" };
      if (res.status === 402) return { error: "Sin créditos de IA.", content: "" };
      if (!res.ok) return { error: "Error del servicio de IA.", content: "" };
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { error: null as string | null, content: json.choices?.[0]?.message?.content ?? "" };
    } catch (e) {
      console.error("summarizeReporteAI", e);
      return { error: "Error de red.", content: "" };
    }
  });
