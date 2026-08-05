import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import {
  calcularSaludScore,
  type CoberturaSalud,
  type DimensionSalud,
  type EstadoDimension,
  type FaltanteSalud,
  type SemaforoSalud,
} from "./cobertura";

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
  /** 0..100 (más alto = mejor). null cuando no hay información para evaluarla. */
  score: number | null;
  peso: number; // %
  estado: EstadoDimension;
  detalles: string[];
  faltante: FaltanteSalud | null;
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
  /** 0..100 más alto = mejor. null cuando no hay cobertura mínima de información. */
  score: number | null;
  semaforo: SemaforoSalud;
  /** Auditoría del cálculo: qué se pudo evaluar y qué falta. */
  cobertura: CoberturaSalud;
  /** diff vs mes anterior; null si alguno de los dos periodos no tiene score. */
  variacion_mes: number | null;
  /** últimos 12 meses; null en los meses sin score publicable. */
  tendencia: (number | null)[];
  subscores: SubScore[];
  alertas: SaludAlerta[];
  comparativo: SaludComparativo;
  hallazgos: SaludHallazgo[];
  recomendaciones: SaludRecomendacion[];
  historial: { periodo: string; score: number; semaforo: string }[];
};

const PESOS = { cumplimiento: 25, riesgo_sat: 25, cfdi: 15, bancos: 15, laboral: 10, documental: 10 } as const;


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

    // ===== Dimensiones =====
    // REGLA: una dimensión sólo recibe puntos cuando existe evidencia real.
    // Sin evidencia se marca "no_evaluable" (score null) y se excluye del
    // promedio ponderado — nunca se interpreta como 0 ni como 100.

    // Cumplimiento: requiere tareas/obligaciones registradas.
    const tareasVencidas = tareasList.filter((t) => t.estatus !== "completada" && t.due_date && new Date(t.due_date) < today).length;
    const tareasCompletadas = tareasList.filter((t) => t.estatus === "completada").length;
    const hayTareas = tareasList.length > 0;
    const scoreCumpl = hayTareas
      ? Math.max(0, Math.min(100, Math.round((tareasCompletadas / tareasList.length) * 100 - tareasVencidas * 8)))
      : null;

    // Riesgo SAT: requiere que el motor de riesgo haya producido hallazgos.
    // El campo `semaforo` del expediente NO cuenta como evidencia: puede venir
    // de una captura manual o de un valor por omisión, y usarlo convertiría un
    // expediente vacío en "riesgo bajo".
    const alertasAltas = al.filter((a) => a.nivel === "alto" || a.nivel === "critica").length;
    const semCli = cli.semaforo as string | null;
    const hayRiesgo = al.length > 0;
    const semBase = semCli === "rojo" ? 35 : semCli === "amarillo" ? 65 : semCli === "verde" ? 90 : 70;
    const scoreRiesgo = hayRiesgo ? Math.max(0, Math.min(100, semBase - alertasAltas * 8)) : null;


    // CFDI: requiere comprobantes cargados en el periodo.
    const cfdiCancelados = cfdis.filter((c) => c.estatus_sat === "cancelado").length;
    const hashes = new Set<string>();
    let cfdiDup = 0;
    for (const c of cfdis) {
      if (c.archivo_hash) {
        if (hashes.has(c.archivo_hash)) cfdiDup++;
        else hashes.add(c.archivo_hash);
      }
    }
    const hayCfdi = cfdis.length > 0;
    const tasaIncidencias = hayCfdi ? (cfdiCancelados + cfdiDup) / cfdis.length : 0;
    const scoreCfdi = hayCfdi ? Math.max(0, Math.min(100, Math.round(100 - tasaIncidencias * 100))) : null;

    // Bancos: requiere al menos una conciliación cargada.
    const concPend = concList.filter((c) => c.estatus !== "confirmada" && c.estatus !== "conciliada").length;
    const concDif = concList.filter((c) => Math.abs(Number(c.diferencia ?? 0)) > 0).length;
    const hayBancos = concList.length > 0;
    const scoreBancos = hayBancos ? Math.max(0, Math.min(100, 100 - concPend * 6 - concDif * 4)) : null;

    // Laboral: requiere CFDI de nómina o incidencias laborales registradas.
    const alertasLab = al.filter((a) => (a.tipo ?? "").toLowerCase().includes("nomina") || (a.tipo ?? "").toLowerCase().includes("imss")).length;
    const cfdiNomina = cfdis.filter((c) => c.tipo_cfdi === "N").length;
    const hayLaboral = cfdiNomina > 0 || alertasLab > 0;
    const scoreLaboral = hayLaboral ? Math.max(0, Math.min(100, 100 - alertasLab * 12)) : null;

    // Documental: requiere que el motor de alertas haya evaluado el expediente.
    const alertasDoc = al.filter((a) => (a.tipo ?? "").toLowerCase().includes("documento") || (a.tipo ?? "").toLowerCase().includes("efirma") || (a.tipo ?? "").toLowerCase().includes("csd")).length;
    const hayDocumental = al.length > 0;
    const scoreDoc = hayDocumental ? Math.max(0, Math.min(100, 100 - alertasDoc * 14)) : null;

    const dim = (
      key: SubScore["key"],
      label: string,
      peso: number,
      score: number | null,
      detalles: string[],
      faltante: FaltanteSalud,
    ): SubScore => ({
      key,
      label,
      peso,
      score,
      estado: score === null ? "no_evaluable" : score >= 70 ? "favorable" : "desfavorable",
      detalles: score === null ? ["Sin información suficiente para evaluar esta área."] : detalles,
      faltante: score === null ? faltante : null,
    });

    const subscores: SubScore[] = [
      dim("cumplimiento", "Cumplimiento Fiscal", PESOS.cumplimiento, scoreCumpl,
        [`${tareasCompletadas}/${tareasList.length} tareas cerradas`, `${tareasVencidas} tareas vencidas`],
        { que: "Obligaciones y tareas del expediente", ruta: "/app/calendario", cta: "Generar calendario fiscal" }),
      dim("riesgo_sat", "Riesgo SAT", PESOS.riesgo_sat, scoreRiesgo,
        [`${alertasAltas} alertas críticas`, `Semáforo expediente: ${semCli ?? "—"}`],
        { que: "Evaluación de los criterios de riesgo SAT", ruta: "/app/riesgo", cta: "Evaluar riesgo SAT" }),
      dim("cfdi", "Salud CFDI", PESOS.cfdi, scoreCfdi,
        [`${cfdis.length} CFDI del mes`, `${cfdiCancelados} cancelados · ${cfdiDup} duplicados`],
        { que: "CFDI del periodo", ruta: "/app/sat-sync", cta: "Descargar o cargar CFDI" }),
      dim("bancos", "Salud Bancaria", PESOS.bancos, scoreBancos,
        [`${concPend} conciliaciones pendientes`, `${concDif} con diferencias`],
        { que: "Estados de cuenta conciliados", ruta: "/app/conciliacion", cta: "Conciliar banco" }),
      dim("laboral", "Salud Laboral", PESOS.laboral, scoreLaboral,
        [`${cfdiNomina} CFDI de nómina`, `${alertasLab} incidencias laborales`],
        { que: "CFDI de nómina o expediente laboral", ruta: "/app/admin/nomina", cta: "Auditar nómina" }),
      dim("documental", "Salud Documental", PESOS.documental, scoreDoc,
        [`${alertasDoc} pendientes documentales`],
        { que: "Revisión documental del expediente (e.firma, CSD, constancias)", ruta: "/app/expedientes", cta: "Completar expediente" }),
    ];

    const { score: scoreGlobal, semaforo, cobertura } = calcularSaludScore(subscores as unknown as DimensionSalud[]);


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
    for (const h of histRows) if (h.score !== null) histMap.set(h.periodo as string, h.score as number);
    if (scoreGlobal !== null) histMap.set(periodoActual, scoreGlobal);
    const tendencia: (number | null)[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      tendencia.push(histMap.get(ym(d)) ?? null);
    }
    const scorePrev = histMap.get(periodoPrev) ?? null;
    const variacion = scoreGlobal !== null && scorePrev !== null ? scoreGlobal - scorePrev : null;

    const result: SaludFiscal = {
      cliente: { id: cli.id, rfc: cli.rfc, razon_social: cli.razon_social },
      periodo: periodoActual,
      score: scoreGlobal,
      semaforo,
      cobertura,
      variacion_mes: variacion,
      tendencia,
      subscores,
      alertas: saludAlertas,
      comparativo,
      hallazgos,
      recomendaciones,
      historial: histRows
        .filter((h) => h.score !== null)
        .map((h) => ({ periodo: h.periodo as string, score: h.score as number, semaforo: h.semaforo as string }))
        .reverse(),
    };

    // Persist snapshot del periodo (idempotente por unique cliente_id+periodo).
    // Sin cobertura mínima NO se guarda score: un snapshot falso contaminaría
    // la tendencia histórica y el comparativo de meses siguientes.
    if (data.persist !== false && scoreGlobal !== null) {
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
