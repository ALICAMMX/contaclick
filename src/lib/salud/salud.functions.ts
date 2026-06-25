import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

function extractJsonObject(raw: string) {
  const text = String(raw ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(text); } catch { /* try extracting below */ }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(text.slice(first, last + 1));
  return {};
}

const Input = z.object({
  cliente_id: z.string().uuid(),
  persist: z.boolean().optional(),
});

export type SubScore = {
  key: "cumplimiento" | "riesgo_sat" | "cfdi" | "bancos" | "laboral" | "documental";
  label: string;
  score: number; // 0..100 (más alto = mejor)
  peso: number; // %
  detalles: string[];
};

export type SaludAlerta = {
  nivel: "info" | "media" | "alta" | "critica";
  titulo: string;
  detalle?: string;
  origen?: string;
};

export type SaludHallazgo = {
  tipo: "patron" | "inconsistencia" | "oportunidad";
  titulo: string;
  detalle: string;
};

export type SaludRecomendacion = {
  titulo: string;
  detalle: string;
  accion: "crear_tarea" | "generar_estrategia" | "solicitar_documentos" | "revisar_operacion";
};

export type SaludComparativo = {
  ingresos: { actual: number; anterior: number };
  egresos: { actual: number; anterior: number };
  utilidad: { actual: number; anterior: number };
  isr_estimado: { actual: number; anterior: number };
  iva_trasladado: { actual: number; anterior: number };
  iva_acreditable: { actual: number; anterior: number };
  margen_pct: { actual: number; anterior: number };
};

export type SaludFiscal = {
  notFound?: false;
  cliente: { id: string; rfc: string; razon_social: string };
  periodo: string; // YYYY-MM
  score: number; // 0..100 más alto = mejor
  semaforo: "verde" | "amarillo" | "naranja" | "rojo";
  variacion_mes: number; // diff vs mes anterior
  tendencia: number[]; // últimos 12 meses
  subscores: SubScore[];
  alertas: SaludAlerta[];
  comparativo: SaludComparativo;
  hallazgos: SaludHallazgo[];
  recomendaciones: SaludRecomendacion[];
  historial: { periodo: string; score: number; semaforo: string }[];
};

const PESOS = { cumplimiento: 25, riesgo_sat: 25, cfdi: 15, bancos: 15, laboral: 10, documental: 10 } as const;

function semaforoOf(score: number): "verde" | "amarillo" | "naranja" | "rojo" {
  if (score >= 85) return "verde";
  if (score >= 70) return "amarillo";
  if (score >= 50) return "naranja";
  return "rojo";
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function ym(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export const computeSaludFiscal = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<SaludFiscal | { notFound: true }> => {
    const { supabase, userId } = context;
    const { data: cli, error: cliErr } = await supabase
      .from("clientes")
      .select("id, rfc, razon_social, despacho_id, semaforo, regimen_fiscal, tipo_persona")
      .eq("id", data.cliente_id)
      .maybeSingle();
    if (cliErr || !cli) return { notFound: true };

    const today = new Date();
    const startMes = new Date(today.getFullYear(), today.getMonth(), 1);
    const startPrev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endPrev = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
    const start12 = new Date(today.getFullYear(), today.getMonth() - 11, 1);

    // === CFDI del periodo actual y anterior ===
    const [{ data: cfdiActual }, { data: cfdiPrev }, { data: alertas }, { data: conc }, { data: tareas }, { data: hist }] = await Promise.all([
      supabase.from("cfdi_xml").select("uuid, total, rfc_emisor, rfc_receptor, iva_trasladado, iva_retenido, isr_retenido, tipo_cfdi, estatus_sat, archivo_hash, fecha")
        .eq("cliente_id", cli.id).gte("fecha", ymd(startMes)),
      supabase.from("cfdi_xml").select("total, rfc_emisor, iva_trasladado, iva_retenido, tipo_cfdi, fecha")
        .eq("cliente_id", cli.id).gte("fecha", ymd(startPrev)).lte("fecha", ymd(endPrev)),
      supabase.from("alertas").select("nivel, tipo, titulo, descripcion, estatus, created_at")
        .eq("cliente_id", cli.id).neq("estatus", "resuelta").order("created_at", { ascending: false }).limit(50),
      supabase.from("conciliaciones").select("estatus, diferencia, motivo, created_at")
        .eq("cliente_id", cli.id).gte("created_at", start12.toISOString()),
      supabase.from("tareas").select("estatus, prioridad, due_date, completada_at, kanban_estado")
        .eq("cliente_id", cli.id).gte("created_at", start12.toISOString()),
      supabase.from("salud_fiscal_snapshots").select("periodo, score, semaforo, subscores")
        .eq("cliente_id", cli.id).order("periodo", { ascending: false }).limit(12),
    ]);

    const cfdis = cfdiActual ?? [];
    const cfdisPrev = cfdiPrev ?? [];
    const al = alertas ?? [];
    const concList = conc ?? [];
    const tareasList = tareas ?? [];

    // ===== Comparativo =====
    const sumIng = (rows: any[]) =>
      rows.filter((r) => r.rfc_emisor === cli.rfc && r.tipo_cfdi === "I").reduce((a, b) => a + Number(b.total ?? 0), 0);
    const sumEgr = (rows: any[]) =>
      rows.filter((r) => r.rfc_emisor !== cli.rfc).reduce((a, b) => a + Number(b.total ?? 0), 0);
    const sumIVATras = (rows: any[]) =>
      rows.filter((r) => r.rfc_emisor === cli.rfc).reduce((a, b) => a + Number(b.iva_trasladado ?? 0), 0);
    const sumIVAAcr = (rows: any[]) =>
      rows.filter((r) => r.rfc_emisor !== cli.rfc).reduce((a, b) => a + Number(b.iva_trasladado ?? 0), 0);

    const ingActual = sumIng(cfdis);
    const ingPrev = sumIng(cfdisPrev);
    const egrActual = sumEgr(cfdis);
    const egrPrev = sumEgr(cfdisPrev);
    const utilActual = ingActual - egrActual;
    const utilPrev = ingPrev - egrPrev;
    const ivaTAct = sumIVATras(cfdis);
    const ivaTPrev = sumIVATras(cfdisPrev);
    const ivaAAct = sumIVAAcr(cfdis);
    const ivaAPrev = sumIVAAcr(cfdisPrev);
    const isrAct = Math.max(0, utilActual) * 0.3;
    const isrPrev = Math.max(0, utilPrev) * 0.3;
    const margenAct = ingActual > 0 ? (utilActual / ingActual) * 100 : 0;
    const margenPrev = ingPrev > 0 ? (utilPrev / ingPrev) * 100 : 0;

    const comparativo: SaludComparativo = {
      ingresos: { actual: ingActual, anterior: ingPrev },
      egresos: { actual: egrActual, anterior: egrPrev },
      utilidad: { actual: utilActual, anterior: utilPrev },
      isr_estimado: { actual: isrAct, anterior: isrPrev },
      iva_trasladado: { actual: ivaTAct, anterior: ivaTPrev },
      iva_acreditable: { actual: ivaAAct, anterior: ivaAPrev },
      margen_pct: { actual: margenAct, anterior: margenPrev },
    };

    // ===== Subscores =====
    // Cumplimiento: tareas vencidas + alertas críticas
    const tareasVencidas = tareasList.filter((t) => t.estatus !== "completada" && t.due_date && new Date(t.due_date) < today).length;
    const tareasCompletadas = tareasList.filter((t) => t.estatus === "completada").length;
    const tareasTotales = tareasList.length || 1;
    const tasaCumpl = tareasCompletadas / tareasTotales;
    const scoreCumpl = Math.max(0, Math.min(100, Math.round(tasaCumpl * 100 - tareasVencidas * 8)));

    // Riesgo SAT: alertas altas + semáforo cliente
    const alertasAltas = al.filter((a) => a.nivel === "alto" || a.nivel === "critica").length;
    const semBase = cli.semaforo === "rojo" ? 35 : cli.semaforo === "amarillo" ? 65 : cli.semaforo === "verde" ? 90 : 70;
    const scoreRiesgo = Math.max(0, Math.min(100, semBase - alertasAltas * 8));

    // CFDI salud
    const cfdiCancelados = cfdis.filter((c) => c.estatus_sat === "cancelado").length;
    const hashes = new Set<string>();
    let cfdiDup = 0;
    for (const c of cfdis) {
      if (c.archivo_hash) {
        if (hashes.has(c.archivo_hash)) cfdiDup++;
        else hashes.add(c.archivo_hash);
      }
    }
    const totalCfdi = cfdis.length || 1;
    const tasaIncidencias = (cfdiCancelados + cfdiDup) / totalCfdi;
    const scoreCfdi = Math.max(0, Math.min(100, Math.round(100 - tasaIncidencias * 100 - (cfdis.length === 0 ? 20 : 0))));

    // Bancos: conciliaciones pendientes/diferencias
    const concPend = concList.filter((c) => c.estatus !== "confirmada" && c.estatus !== "conciliada").length;
    const concDif = concList.filter((c) => Math.abs(Number(c.diferencia ?? 0)) > 0).length;
    const scoreBancos = Math.max(0, Math.min(100, 100 - concPend * 6 - concDif * 4));

    // Laboral
    const alertasLab = al.filter((a) => (a.tipo ?? "").toLowerCase().includes("nomina") || (a.tipo ?? "").toLowerCase().includes("imss")).length;
    const scoreLaboral = Math.max(0, Math.min(100, 90 - alertasLab * 12));

    // Documental
    const alertasDoc = al.filter((a) => (a.tipo ?? "").toLowerCase().includes("documento") || (a.tipo ?? "").toLowerCase().includes("efirma") || (a.tipo ?? "").toLowerCase().includes("csd")).length;
    const scoreDoc = Math.max(0, Math.min(100, 92 - alertasDoc * 14));

    const subscores: SubScore[] = [
      { key: "cumplimiento", label: "Cumplimiento Fiscal", score: scoreCumpl, peso: PESOS.cumplimiento,
        detalles: [`${tareasCompletadas}/${tareasList.length || 0} tareas cerradas`, `${tareasVencidas} tareas vencidas`] },
      { key: "riesgo_sat", label: "Riesgo SAT", score: scoreRiesgo, peso: PESOS.riesgo_sat,
        detalles: [`${alertasAltas} alertas críticas`, `Semáforo expediente: ${cli.semaforo ?? "—"}`] },
      { key: "cfdi", label: "Salud CFDI", score: scoreCfdi, peso: PESOS.cfdi,
        detalles: [`${cfdis.length} CFDI del mes`, `${cfdiCancelados} cancelados · ${cfdiDup} duplicados`] },
      { key: "bancos", label: "Salud Bancaria", score: scoreBancos, peso: PESOS.bancos,
        detalles: [`${concPend} conciliaciones pendientes`, `${concDif} con diferencias`] },
      { key: "laboral", label: "Salud Laboral", score: scoreLaboral, peso: PESOS.laboral,
        detalles: [`${alertasLab} incidencias laborales`] },
      { key: "documental", label: "Salud Documental", score: scoreDoc, peso: PESOS.documental,
        detalles: [`${alertasDoc} pendientes documentales`] },
    ];

    const scoreGlobal = Math.round(
      subscores.reduce((acc, s) => acc + (s.score * s.peso) / 100, 0),
    );

    // ===== Alertas (top) =====
    const saludAlertas: SaludAlerta[] = al.slice(0, 6).map((a) => ({
      nivel: a.nivel === "alto" || a.nivel === "critica" ? "alta" : a.nivel === "medio" ? "media" : "info",
      titulo: a.titulo ?? "Alerta",
      detalle: a.descripcion ?? undefined,
      origen: a.tipo ?? undefined,
    }));
    if (ingActual > ingPrev * 1.4 && ingPrev > 0)
      saludAlertas.unshift({ nivel: "alta", titulo: `Incremento de ingresos del ${Math.round(((ingActual - ingPrev) / ingPrev) * 100)}%`, origen: "CFDI" });
    if (cfdiDup > 0)
      saludAlertas.unshift({ nivel: "alta", titulo: `${cfdiDup} CFDI duplicados detectados`, origen: "CFDI" });
    if (tareasVencidas > 0)
      saludAlertas.unshift({ nivel: "media", titulo: `${tareasVencidas} obligaciones/tareas vencidas`, origen: "Tareas" });

    // ===== Hallazgos heurísticos =====
    const hallazgos: SaludHallazgo[] = [];
    if (cli.tipo_persona === "fisica" && (cli.regimen_fiscal ?? "") !== "626" && ingActual < 291_667)
      hallazgos.push({ tipo: "oportunidad", titulo: "Posible migración a RESICO",
        detalle: "Los ingresos del mes están dentro del umbral de RESICO; conviene evaluar el cambio de régimen." });
    if (ivaAAct > ivaTAct * 1.2 && ivaAAct > 0)
      hallazgos.push({ tipo: "oportunidad", titulo: "Oportunidad de saldo a favor / devolución de IVA",
        detalle: `IVA acreditable (${ivaAAct.toFixed(0)}) supera al trasladado (${ivaTAct.toFixed(0)}).` });
    if (margenAct < 5 && ingActual > 0)
      hallazgos.push({ tipo: "patron", titulo: "Margen operativo muy bajo",
        detalle: `Margen del periodo: ${margenAct.toFixed(1)}%. Revisar gastos y precios.` });
    if (cfdiDup > 0)
      hallazgos.push({ tipo: "inconsistencia", titulo: "CFDI duplicados",
        detalle: "Hay archivos XML repetidos cargados al expediente este mes." });
    if (concPend > 3)
      hallazgos.push({ tipo: "inconsistencia", titulo: "Conciliación bancaria atrasada",
        detalle: `${concPend} movimientos sin conciliar.` });

    // ===== Recomendaciones =====
    const recomendaciones: SaludRecomendacion[] = [];
    if (tareasVencidas > 0)
      recomendaciones.push({ titulo: "Cerrar tareas vencidas", detalle: "Liquidar obligaciones atrasadas para subir el score de cumplimiento.", accion: "crear_tarea" });
    if (cfdiDup > 0)
      recomendaciones.push({ titulo: "Depurar CFDI duplicados", detalle: "Eliminar los XML repetidos del expediente.", accion: "revisar_operacion" });
    if (alertasAltas > 0)
      recomendaciones.push({ titulo: "Atender alertas de riesgo SAT", detalle: "Hay hallazgos del Plan Maestro sin resolver.", accion: "generar_estrategia" });
    if (alertasDoc > 0)
      recomendaciones.push({ titulo: "Solicitar documentos pendientes", detalle: "Faltantes de e.firma, CSD o constancias.", accion: "solicitar_documentos" });
    if (ivaAAct > ivaTAct * 1.2 && ivaAAct > 0)
      recomendaciones.push({ titulo: "Preparar trámite de devolución de IVA", detalle: "Revisar requisitos y armar papeles de trabajo.", accion: "generar_estrategia" });

    // ===== Historial =====
    const histRows = hist ?? [];
    const periodoActual = ym(today);
    const periodoPrev = ym(startPrev);
    const histMap = new Map<string, number>();
    for (const h of histRows) histMap.set(h.periodo as string, h.score as number);
    histMap.set(periodoActual, scoreGlobal);
    const tendencia: number[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      tendencia.push(histMap.get(ym(d)) ?? 0);
    }
    const scorePrev = histMap.get(periodoPrev) ?? scoreGlobal;
    const variacion = scoreGlobal - scorePrev;

    const result: SaludFiscal = {
      cliente: { id: cli.id, rfc: cli.rfc, razon_social: cli.razon_social },
      periodo: periodoActual,
      score: scoreGlobal,
      semaforo: semaforoOf(scoreGlobal),
      variacion_mes: variacion,
      tendencia,
      subscores,
      alertas: saludAlertas,
      comparativo,
      hallazgos,
      recomendaciones,
      historial: histRows
        .map((h) => ({ periodo: h.periodo as string, score: h.score as number, semaforo: h.semaforo as string }))
        .reverse(),
    };

    // Persist snapshot del periodo (idempotente por unique cliente_id+periodo)
    if (data.persist !== false) {
      await supabase.from("salud_fiscal_snapshots").upsert({
        despacho_id: cli.despacho_id as string,
        cliente_id: cli.id,
        periodo: periodoActual,
        score: scoreGlobal,
        semaforo: result.semaforo,
        subscores: subscores as any,
        alertas: saludAlertas as any,
        hallazgos: hallazgos as any,
        recomendaciones: recomendaciones as any,
        comparativo: comparativo as any,
        computed_by: userId,
      } as any, { onConflict: "cliente_id,periodo" });
    }

    return result;
  });

// ===== Análisis IA bajo demanda =====
const AIInput = z.object({ cliente_id: z.string().uuid() });

export const analizarSaludConIA = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => AIInput.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { error: "IA no configurada", resumen: "", hallazgos: [] as SaludHallazgo[] };
    const { supabase } = context;
    const { data: snap } = await supabase.from("salud_fiscal_snapshots")
      .select("score, semaforo, subscores, alertas, hallazgos, comparativo, periodo")
      .eq("cliente_id", data.cliente_id).order("periodo", { ascending: false }).limit(1).maybeSingle();
    if (!snap) return { error: "Sin snapshot vigente", resumen: "", hallazgos: [] as SaludHallazgo[] };

    const prompt = `Eres analista fiscal mexicano. Genera un diagnóstico ejecutivo en español (máx 6 líneas) y 3 hallazgos accionables JSON. Datos: ${JSON.stringify(snap)}.
Responde SOLO JSON: {"resumen":"...", "hallazgos":[{"tipo":"patron|inconsistencia|oportunidad","titulo":"...","detalle":"..."}]}`;
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          max_tokens: 8000,
          maxOutputTokens: 8000,
        }),
      });
      if (!res.ok) return { error: `IA ${res.status}`, resumen: "", hallazgos: [] };
      const json = await res.json() as any;
      const finishReason = json.choices?.[0]?.finish_reason ?? json.choices?.[0]?.finishReason;
      if (finishReason && !["stop", "STOP"].includes(String(finishReason))) return { error: `IA incompleta (${finishReason})`, resumen: "", hallazgos: [] };
      const content = json.choices?.[0]?.message?.content ?? "{}";
      const parsed = extractJsonObject(content);
      const resumen = String(parsed.resumen ?? "");
      const hallazgos: SaludHallazgo[] = Array.isArray(parsed.hallazgos) ? parsed.hallazgos.slice(0, 5) : [];
      await supabase.from("salud_fiscal_snapshots")
        .update({ ai_resumen: resumen })
        .eq("cliente_id", data.cliente_id).eq("periodo", snap.periodo);
      return { error: null as string | null, resumen, hallazgos };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Error IA", resumen: "", hallazgos: [] as SaludHallazgo[] };
    }
  });

// ===== Crear tarea desde recomendación =====
const TareaInput = z.object({
  cliente_id: z.string().uuid(),
  titulo: z.string().min(3),
  descripcion: z.string().optional(),
  prioridad: z.enum(["baja", "media", "alta", "urgente"]).optional(),
});

export const crearTareaDesdeSalud = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => TareaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cli } = await supabase.from("clientes").select("despacho_id").eq("id", data.cliente_id).maybeSingle();
    if (!cli) throw new Error("Cliente no encontrado");
    const { data: t, error } = await supabase.from("tareas").insert({
      despacho_id: cli.despacho_id,
      cliente_id: data.cliente_id,
      titulo: data.titulo,
      descripcion: data.descripcion ?? "",
      prioridad: data.prioridad ?? "media",
      estatus: "abierta",
      origen: "salud_fiscal",
      created_by: userId,
    } as any).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return { id: t?.id };
  });
