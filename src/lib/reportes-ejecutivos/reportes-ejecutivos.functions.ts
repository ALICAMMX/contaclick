import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

// ============ Tipos ============
export type ReporteEjecutivo = {
  id: string;
  despacho_id: string;
  cliente_id: string | null;
  periodo: string;
  tipo: string;
  estado: string;
  resumen_financiero: Record<string, number>;
  resumen_fiscal: Record<string, number>;
  salud: Record<string, unknown>;
  conciliacion: Record<string, unknown>;
  obligaciones: Record<string, unknown>;
  riesgos: Record<string, unknown>;
  hallazgos: Array<{ titulo: string; detalle: string; severidad?: string }>;
  oportunidades: Array<{ titulo: string; detalle: string; impacto?: number }>;
  resumen_ejecutivo: string | null;
  ahorro_estimado_centavos: number;
  enviado_at: string | null;
  created_at: string;
  updated_at: string;
  cliente?: { rfc: string; razon_social: string | null } | null;
};

export type RecomendacionIA = {
  id: string;
  cliente_id: string | null;
  reporte_id: string | null;
  categoria: string;
  titulo: string;
  descripcion: string;
  accion_sugerida: string | null;
  prioridad: string;
  impacto_estimado_centavos: number;
  estado: string;
  tarea_id: string | null;
  implementada_at: string | null;
  created_at: string;
};

function periodoActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function rangoPeriodo(periodo: string) {
  const [y, m] = periodo.split("-").map(Number);
  const desde = new Date(Date.UTC(y, m - 1, 1));
  const hasta = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

// ============ Listar ============
export const listarReportes = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(200).default(50) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    let q = sb
      .from("reportes_ejecutivos")
      .select("id, cliente_id, periodo, tipo, estado, ahorro_estimado_centavos, resumen_ejecutivo, enviado_at, created_at, updated_at, clientes:cliente_id(rfc, razon_social)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string; cliente_id: string | null; periodo: string; tipo: string; estado: string;
      ahorro_estimado_centavos: number; resumen_ejecutivo: string | null; enviado_at: string | null;
      created_at: string; updated_at: string;
      clientes: { rfc: string; razon_social: string | null } | null;
    }>;
  });

// ============ KPIs Dashboard ============
export const obtenerKpisReportes = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const periodo = periodoActual();
    const [reportesMes, recomendaciones, clientesTotal] = await Promise.all([
      sb.from("reportes_ejecutivos").select("id, estado, enviado_at, ahorro_estimado_centavos", { count: "exact" }).eq("periodo", periodo),
      sb.from("recomendaciones_ia").select("id, estado, impacto_estimado_centavos, prioridad"),
      sb.from("clientes").select("id", { count: "exact", head: true }),
    ]);
    const reportes = (reportesMes.data ?? []) as Array<{ id: string; estado: string; enviado_at: string | null; ahorro_estimado_centavos: number }>;
    const recs = (recomendaciones.data ?? []) as Array<{ id: string; estado: string; impacto_estimado_centavos: number; prioridad: string }>;
    return {
      reportes_generados: reportes.length,
      reportes_enviados: reportes.filter((r) => r.enviado_at).length,
      ahorro_total_centavos: reportes.reduce((a, r) => a + (r.ahorro_estimado_centavos ?? 0), 0),
      clientes_pendientes: Math.max(0, (clientesTotal.count ?? 0) - reportes.length),
      recomendaciones_pendientes: recs.filter((r) => r.estado === "pendiente").length,
      recomendaciones_implementadas: recs.filter((r) => r.estado === "implementada").length,
      recomendaciones_alta_prioridad: recs.filter((r) => r.prioridad === "alta" && r.estado === "pendiente").length,
      impacto_potencial_centavos: recs.filter((r) => r.estado !== "descartada").reduce((a, r) => a + (r.impacto_estimado_centavos ?? 0), 0),
    };
  });

// ============ Recolectar datos del periodo ============
async function recolectarDatos(sb: any, cliente_id: string, periodo: string) {
  const { desde, hasta } = rangoPeriodo(periodo);
  const { data: cli } = await sb.from("clientes").select("id, despacho_id, rfc, razon_social, regimen_fiscal").eq("id", cliente_id).maybeSingle();
  if (!cli) throw new Error("Cliente no encontrado");

  const [cfdiIng, cfdiEgr, salud, incidencias, obligaciones, riesgoSat, polizas, movs] = await Promise.all([
    sb.from("cfdi_xml").select("subtotal, total, iva_trasladado, iva_retenido, isr_retenido, estatus_sat").eq("cliente_id", cliente_id).eq("tipo_cfdi", "I").gte("fecha", desde).lte("fecha", hasta),
    sb.from("cfdi_xml").select("subtotal, total, iva_trasladado, iva_retenido, isr_retenido, estatus_sat").eq("cliente_id", cliente_id).eq("tipo_cfdi", "E").gte("fecha", desde).lte("fecha", hasta),
    sb.from("salud_fiscal_snapshots").select("score, semaforo, subscores").eq("cliente_id", cliente_id).order("periodo", { ascending: false }).limit(1).maybeSingle(),
    sb.from("conciliacion_incidencias").select("tipo, gravedad, estatus, monto, impacto_isr, impacto_iva").eq("cliente_id", cliente_id),
    sb.from("obligaciones_fiscales").select("nombre, fecha_vencimiento, estatus").eq("cliente_id", cliente_id).gte("fecha_vencimiento", new Date().toISOString().slice(0, 10)).order("fecha_vencimiento").limit(10),
    sb.from("semaforo_fiscal").select("*").eq("cliente_id", cliente_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("polizas").select("tipo, monto").eq("cliente_id", cliente_id).gte("fecha", desde.slice(0, 10)).lte("fecha", hasta.slice(0, 10)),
    sb.from("movimientos_bancarios").select("tipo, monto").eq("cliente_id", cliente_id).gte("fecha", desde.slice(0, 10)).lte("fecha", hasta.slice(0, 10)),
  ]);

  const ingresosCfdi = (cfdiIng.data ?? []).reduce((a: number, r: any) => a + Number(r.subtotal ?? 0), 0);
  const ivaTras = (cfdiIng.data ?? []).reduce((a: number, r: any) => a + Number(r.iva_trasladado ?? 0), 0);
  const gastosCfdi = (cfdiEgr.data ?? []).reduce((a: number, r: any) => a + Number(r.subtotal ?? 0), 0);
  const ivaAcr = (cfdiEgr.data ?? []).reduce((a: number, r: any) => a + Number(r.iva_trasladado ?? 0), 0);
  const utilidad = ingresosCfdi - gastosCfdi;
  const margen = ingresosCfdi > 0 ? utilidad / ingresosCfdi : 0;
  const isrEst = Math.max(0, utilidad * 0.30);
  const ivaNeto = ivaTras - ivaAcr;

  const incRows = (incidencias.data ?? []) as Array<{ tipo: string; gravedad: string; estatus: string; monto: number; impacto_isr: number; impacto_iva: number }>;
  const ingresosOmitidos = incRows.filter((i) => i.tipo === "ingreso_sat_sin_poliza").reduce((a, r) => a + Number(r.monto ?? 0), 0);
  const gastosSinSoporte = incRows.filter((i) => i.tipo === "pago_banco_sin_cfdi").reduce((a, r) => a + Number(r.monto ?? 0), 0);

  return {
    cliente: cli,
    periodo,
    resumen_financiero: {
      ingresos: ingresosCfdi,
      gastos: gastosCfdi,
      utilidad,
      margen: Number(margen.toFixed(4)),
      cfdi_emitidos: (cfdiIng.data ?? []).length,
      cfdi_recibidos: (cfdiEgr.data ?? []).length,
      polizas_registradas: (polizas.data ?? []).length,
      movimientos_bancarios: (movs.data ?? []).length,
    },
    resumen_fiscal: {
      isr_estimado: Number(isrEst.toFixed(2)),
      iva_trasladado: Number(ivaTras.toFixed(2)),
      iva_acreditable: Number(ivaAcr.toFixed(2)),
      iva_neto: Number(ivaNeto.toFixed(2)),
      saldo_a_favor: ivaNeto < 0 ? Math.abs(Number(ivaNeto.toFixed(2))) : 0,
      saldo_a_cargo: ivaNeto > 0 ? Number(ivaNeto.toFixed(2)) : 0,
    },
    salud: salud.data ?? { score: null, semaforo: "sin_datos", subscores: {} },
    conciliacion: {
      incidencias_total: incRows.length,
      criticas: incRows.filter((i) => i.gravedad === "critica").length,
      ingresos_omitidos: Number(ingresosOmitidos.toFixed(2)),
      gastos_sin_soporte: Number(gastosSinSoporte.toFixed(2)),
      impacto_isr: incRows.reduce((a, r) => a + Number(r.impacto_isr ?? 0), 0),
      impacto_iva: incRows.reduce((a, r) => a + Number(r.impacto_iva ?? 0), 0),
    },
    obligaciones: { proximas: obligaciones.data ?? [] },
    riesgos: riesgoSat.data ?? {},
  };
}

// ============ Generar reporte ejecutivo (con IA) ============
export const generarReporte = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      tipo: z.enum(["mensual", "extraordinario", "trimestral"]).default("mensual"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const userId = context.userId;
    const periodo = data.periodo ?? periodoActual();
    const datos = await recolectarDatos(sb, data.cliente_id, periodo);

    // Llamado IA para hallazgos, oportunidades, resumen y recomendaciones
    const apiKey = process.env.LOVABLE_API_KEY;
    let hallazgos: Array<{ titulo: string; detalle: string; severidad?: string }> = [];
    let oportunidades: Array<{ titulo: string; detalle: string; impacto?: number }> = [];
    let resumen = "";
    let recomendaciones: Array<{ categoria: string; titulo: string; descripcion: string; accion_sugerida?: string; prioridad: string; impacto_estimado?: number }> = [];
    let ahorroEstimado = 0;

    if (apiKey) {
      const prompt = `Eres un CFO advisor y estratega fiscal mexicano premium. Analiza los datos del cliente y entrega un diagnóstico ejecutivo accionable en español.
Cliente: ${datos.cliente.razon_social ?? datos.cliente.rfc} (${datos.cliente.rfc}, ${datos.cliente.regimen_fiscal ?? "régimen ND"})
Periodo: ${periodo}
Datos: ${JSON.stringify({
        financiero: datos.resumen_financiero,
        fiscal: datos.resumen_fiscal,
        salud: datos.salud,
        conciliacion: datos.conciliacion,
        obligaciones_count: (datos.obligaciones as any).proximas?.length ?? 0,
      })}

Responde SOLO JSON válido con esta forma:
{
  "resumen_ejecutivo": "máx 5 líneas tono CFO, claro y no técnico",
  "hallazgos": [{"titulo":"...", "detalle":"...", "severidad":"alta|media|baja"}],
  "oportunidades": [{"titulo":"...", "detalle":"...", "impacto": numero_pesos_estimado}],
  "recomendaciones": [{"categoria":"optimizacion|correccion|riesgo_sat|flujo|nomina", "titulo":"...", "descripcion":"...", "accion_sugerida":"...", "prioridad":"alta|media|baja", "impacto_estimado": numero_pesos_estimado}],
  "ahorro_estimado_pesos": numero
}`;
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          }),
        });
        if (res.ok) {
          const json = (await res.json()) as any;
          const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
          resumen = String(parsed.resumen_ejecutivo ?? "");
          hallazgos = Array.isArray(parsed.hallazgos) ? parsed.hallazgos.slice(0, 8) : [];
          oportunidades = Array.isArray(parsed.oportunidades) ? parsed.oportunidades.slice(0, 8) : [];
          recomendaciones = Array.isArray(parsed.recomendaciones) ? parsed.recomendaciones.slice(0, 10) : [];
          ahorroEstimado = Math.round(Number(parsed.ahorro_estimado_pesos ?? 0) * 100);
        }
      } catch {
        // Fallback silencioso
      }
    }

    if (!resumen) {
      resumen = `Periodo ${periodo}: ingresos $${datos.resumen_financiero.ingresos.toFixed(2)}, utilidad $${datos.resumen_financiero.utilidad.toFixed(2)}. ${(datos.conciliacion as any).incidencias_total} incidencias detectadas.`;
    }

    const reporteId = crypto.randomUUID();
    const { error } = await sb.from("reportes_ejecutivos").insert({
      id: reporteId,
      despacho_id: datos.cliente.despacho_id,
      cliente_id: data.cliente_id,
      periodo,
      tipo: data.tipo,
      estado: "listo",
      resumen_financiero: datos.resumen_financiero,
      resumen_fiscal: datos.resumen_fiscal,
      salud: datos.salud,
      conciliacion: datos.conciliacion,
      obligaciones: datos.obligaciones,
      riesgos: datos.riesgos,
      hallazgos,
      oportunidades,
      resumen_ejecutivo: resumen,
      ahorro_estimado_centavos: ahorroEstimado,
      created_by: userId,
    });
    if (error) throw new Error(error.message);

    // Persistir recomendaciones
    if (recomendaciones.length) {
      const rows = recomendaciones.map((r) => ({
        id: crypto.randomUUID(),
        despacho_id: datos.cliente.despacho_id,
        cliente_id: data.cliente_id,
        reporte_id: reporteId,
        categoria: r.categoria ?? "optimizacion",
        titulo: r.titulo,
        descripcion: r.descripcion,
        accion_sugerida: r.accion_sugerida ?? null,
        prioridad: r.prioridad ?? "media",
        impacto_estimado_centavos: Math.round(Number(r.impacto_estimado ?? 0) * 100),
        estado: "pendiente",
        created_by: userId,
      }));
      await sb.from("recomendaciones_ia").insert(rows);
    }

    return { id: reporteId, ahorro_estimado_centavos: ahorroEstimado, hallazgos_count: hallazgos.length, recomendaciones_count: recomendaciones.length };
  });

// ============ Obtener reporte ============
export const obtenerReporte = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: rep, error } = await sb
      .from("reportes_ejecutivos")
      .select("*, clientes:cliente_id(rfc, razon_social)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rep) throw new Error("Reporte no encontrado");
    const { data: recs } = await sb
      .from("recomendaciones_ia")
      .select("*")
      .eq("reporte_id", data.id)
      .order("prioridad");
    return { reporte: rep as any, recomendaciones: (recs ?? []) as any[] };
  });

// ============ Marcar enviado ============
export const marcarReporteEnviado = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb.from("reportes_ejecutivos")
      .update({ estado: "enviado", enviado_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Recomendaciones (bandeja) ============
export const listarRecomendaciones = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid().optional(),
      estado: z.string().optional(),
      categoria: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    let q = sb
      .from("recomendaciones_ia")
      .select("*, clientes:cliente_id(rfc, razon_social)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    if (data.estado) q = q.eq("estado", data.estado);
    if (data.categoria) q = q.eq("categoria", data.categoria);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<RecomendacionIA & { clientes: { rfc: string; razon_social: string | null } | null }>;
  });

// ============ Actualizar estado recomendación ============
export const actualizarRecomendacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      estado: z.enum(["pendiente", "en_proceso", "implementada", "descartada"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const upd: Record<string, unknown> = { estado: data.estado };
    if (data.estado === "implementada") upd.implementada_at = new Date().toISOString();
    const { error } = await sb.from("recomendaciones_ia").update(upd).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Crear tarea desde recomendación ============
export const crearTareaDesdeRecomendacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const userId = context.userId;
    const { data: rec } = await sb.from("recomendaciones_ia").select("*").eq("id", data.id).maybeSingle();
    if (!rec) throw new Error("Recomendación no encontrada");
    const { data: t, error } = await sb.from("tareas").insert({
      despacho_id: rec.despacho_id,
      cliente_id: rec.cliente_id,
      titulo: rec.titulo,
      descripcion: `${rec.descripcion}\n\nAcción sugerida: ${rec.accion_sugerida ?? "-"}`,
      prioridad: rec.prioridad === "alta" ? "alta" : rec.prioridad === "baja" ? "baja" : "media",
      estatus: "abierta",
      origen: "reporte_ejecutivo",
      created_by: userId,
    }).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    await sb.from("recomendaciones_ia").update({ tarea_id: t?.id, estado: "en_proceso" }).eq("id", data.id);
    return { tarea_id: t?.id as string | undefined };
  });

// ============ Simulador estratégico ============
export const simularEscenario = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      escenario: z.string().min(3).max(200),
      parametros: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const userId = context.userId;
    const periodo = periodoActual();
    const datos = await recolectarDatos(sb, data.cliente_id, periodo);

    const apiKey = process.env.LOVABLE_API_KEY;
    let resultado: Record<string, number> = { isr_actual: datos.resumen_fiscal.isr_estimado, iva_actual: datos.resumen_fiscal.iva_neto, utilidad_actual: datos.resumen_financiero.utilidad };
    let narrativa = "Simulación calculada con datos base.";

    if (apiKey) {
      const prompt = `Eres estratega fiscal mexicano. Simula el escenario "${data.escenario}" con parámetros ${JSON.stringify(data.parametros)} sobre estos datos base: ${JSON.stringify({ financiero: datos.resumen_financiero, fiscal: datos.resumen_fiscal })}.
Responde SOLO JSON:
{"resultado":{"isr_simulado":num,"iva_simulado":num,"utilidad_simulada":num,"flujo_simulado":num,"delta_isr":num,"delta_iva":num},"narrativa":"explicación 3-4 líneas no técnica"}`;
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          }),
        });
        if (res.ok) {
          const json = (await res.json()) as any;
          const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
          resultado = { ...resultado, ...(parsed.resultado ?? {}) };
          narrativa = String(parsed.narrativa ?? narrativa);
        }
      } catch {}
    }

    const simId = crypto.randomUUID();
    await sb.from("simulaciones_fiscales").insert({
      id: simId,
      despacho_id: datos.cliente.despacho_id,
      cliente_id: data.cliente_id,
      escenario: data.escenario,
      parametros: data.parametros,
      resultado,
      narrativa,
      created_by: userId,
    });
    return { id: simId, resultado, narrativa };
  });

export const listarSimulaciones = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    let q = sb.from("simulaciones_fiscales").select("*, clientes:cliente_id(rfc, razon_social)").order("created_at", { ascending: false }).limit(50);
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ============ Listar clientes (para selector) ============
export const listarClientesParaReporte = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data, error } = await sb.from("clientes").select("id, rfc, razon_social").order("razon_social").limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; rfc: string; razon_social: string | null }>;
  });
