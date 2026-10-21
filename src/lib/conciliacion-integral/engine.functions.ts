import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { montoDesdeRenglones, SELECT_RENGLONES_LEGADO } from "@/lib/polizas/adaptador";
import { detectarIncidencias, kpisDe, type IncidenciaTipo, type PolizaIn } from "./detectar";
import { aiFetch, aiApiKey } from "@/lib/ai/gateway";

export type { IncidenciaTipo } from "./detectar";

function extractJsonObject(raw: string) {
  const text = String(raw ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(text); } catch { /* try extracting below */ }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(text.slice(first, last + 1));
  return {};
}

const RunInput = z.object({
  cliente_id: z.string().uuid(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  trigger: z.string().optional(),
});

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultPeriod() {
  const hoy = new Date();
  const hasta = fmtDate(hoy);
  const d = new Date(hoy);
  d.setMonth(d.getMonth() - 3);
  return { desde: fmtDate(d), hasta };
}

// ---------- LISTAR ----------
export const listarIncidencias = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid().optional(),
      estatus: z.string().optional(),
      gravedad: z.string().optional(),
      tipo: z.string().optional(),
      desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("conciliacion_incidencias")
      .select(
        "id, cliente_id, tipo, gravedad, estatus, fecha, monto, impacto_isr, impacto_iva, recomendacion, explicacion_ia, detalle, cfdi_id, poliza_id, movimiento_id, tarea_id, created_at, clientes:cliente_id(rfc, razon_social)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    if (data.estatus) q = q.eq("estatus", data.estatus);
    if (data.gravedad) q = q.eq("gravedad", data.gravedad);
    if (data.tipo) q = q.eq("tipo", data.tipo);
    if (data.desde) q = q.gte("fecha", data.desde);
    if (data.hasta) q = q.lte("fecha", data.hasta);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getDashboardConciliacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid().optional(),
      desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("conciliacion_incidencias")
      .select("tipo, gravedad, estatus, monto, impacto_isr, impacto_iva, cliente_id, clientes:cliente_id(razon_social)");
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    // Sólo el periodo que el contador está revisando, nunca todo el histórico.
    if (data.desde) q = q.gte("fecha", data.desde);
    if (data.hasta) q = q.lte("fecha", data.hasta);
    const { data: rows } = await q;

    // Suficiencia de datos de la última corrida de ESE rango.
    let suficiencia: {
      hay_contabilidad: boolean;
      hay_banco: boolean;
      isr_estimable: boolean;
      tasa_isr: number | null;
      corrida_at: string | null;
    } | null = null;
    if (data.cliente_id && data.desde && data.hasta) {
      const { data: run } = await supabase
        .from("conciliacion_integral_runs")
        .select("kpis, created_at")
        .eq("cliente_id", data.cliente_id)
        .eq("desde", data.desde)
        .eq("hasta", data.hasta)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const k = (run?.kpis ?? null) as any;
      suficiencia = k?.suficiencia
        ? {
            hay_contabilidad: !!k.suficiencia.hay_contabilidad,
            hay_banco: !!k.suficiencia.hay_banco,
            isr_estimable: !!k.suficiencia.isr_estimable,
            tasa_isr: k.suficiencia.tasa_isr ?? null,
            corrida_at: (run?.created_at as string | null) ?? null,
          }
        : null;
    }
    const all = rows ?? [];
    const open = all.filter((r) => r.estatus === "abierta" || r.estatus === "escalada");
    const sum = (k: string) => open.reduce((a, r: any) => a + Number(r[k] ?? 0), 0);
    const byTipo = (t: IncidenciaTipo) => open.filter((r) => r.tipo === t).length;

    const porCliente = new Map<string, { nombre: string; total: number; monto: number; criticas: number }>();
    for (const r of open as any[]) {
      const id = r.cliente_id as string;
      const cur = porCliente.get(id) ?? { nombre: r.clientes?.razon_social ?? id.slice(0, 8), total: 0, monto: 0, criticas: 0 };
      cur.total += 1;
      cur.monto += Number(r.monto ?? 0);
      if (r.gravedad === "critica") cur.criticas += 1;
      porCliente.set(id, cur);
    }
    return {
      kpis: {
        total_abiertas: open.length,
        criticas: open.filter((r) => r.gravedad === "critica").length,
        medias: open.filter((r) => r.gravedad === "media").length,
        bajas: open.filter((r) => r.gravedad === "baja").length,
        monto_observado: sum("monto"),
        impacto_isr: sum("impacto_isr"),
        impacto_iva: sum("impacto_iva"),
        ingresos_omitidos: byTipo("ingreso_sat_sin_poliza"),
        gastos_sin_registrar: byTipo("gasto_sat_sin_poliza"),
        cfdi_sin_pago: byTipo("cfdi_sin_movimiento"),
        pagos_sin_cfdi: byTipo("pago_banco_sin_cfdi"),
        duplicados: byTipo("cfdi_duplicado"),
      },
      suficiencia,
      top_clientes: Array.from(porCliente.entries())
        .map(([id, v]) => ({ cliente_id: id, ...v }))
        .sort((a, b) => b.criticas - a.criticas || b.monto - a.monto)
        .slice(0, 10),
    };
  });

export const getTimeline = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid(), limit: z.number().int().default(24) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("conciliacion_score_historico")
      .select("score, criticas, medias, bajas, monto_observado, created_at")
      .eq("cliente_id", data.cliente_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return (rows ?? []).reverse();
  });

// ---------- MUTACIONES INCIDENCIA ----------
export const actualizarEstatus = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      estatus: z.enum(["abierta", "revisada", "escalada", "resuelta", "falso_positivo"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const upd = {
      estatus: data.estatus,
      ...(data.estatus === "resuelta" || data.estatus === "falso_positivo"
        ? { resuelta_at: new Date().toISOString(), resuelta_por: userId }
        : {}),
    };
    const { error } = await supabase.from("conciliacion_incidencias").update(upd).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const crearTareaDesdeIncidencia = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inc, error } = await supabase
      .from("conciliacion_incidencias")
      .select("id, cliente_id, despacho_id, tipo, gravedad, monto, recomendacion, explicacion_ia, fecha")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !inc) throw new Error("Incidencia no encontrada");
    const tareaId = crypto.randomUUID();
    const prioridad = inc.gravedad === "critica" ? "urgente" : inc.gravedad === "media" ? "alta" : "media";
    const { error: errT } = await supabase.from("tareas").insert({
      id: tareaId,
      despacho_id: inc.despacho_id,
      cliente_id: inc.cliente_id,
      titulo: `Conciliación: ${prettyTipo(inc.tipo)} ($${Number(inc.monto).toFixed(0)})`,
      descripcion: inc.explicacion_ia ?? inc.recomendacion ?? "Revisar incidencia detectada por motor de conciliación integral.",
      prioridad,
      estatus: "pendiente",
      origen: "conciliacion_integral",
      created_by: userId,
    });
    if (errT) throw new Error(errT.message);
    await supabase.from("conciliacion_incidencias").update({ tarea_id: tareaId }).eq("id", data.id);
    return { tarea_id: tareaId };
  });

function prettyTipo(t: string) {
  return ({
    ingreso_sat_sin_poliza: "Ingreso SAT sin registro contable",
    gasto_sat_sin_poliza: "Gasto SAT sin registro contable",
    pago_banco_sin_cfdi: "Pago bancario sin CFDI",
    cfdi_sin_movimiento: "CFDI sin movimiento bancario",
    diferencia_monto: "Diferencia de monto",
    cfdi_duplicado: "CFDI duplicado",
    cfdi_cancelado_no_ajustado: "CFDI cancelado sin ajuste",
  } as Record<string, string>)[t] ?? t;
}

// ---------- MOTOR ----------
export const runConciliacionIntegral = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => RunInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { desde, hasta } = (() => {
      const def = defaultPeriod();
      return { desde: data.desde ?? def.desde, hasta: data.hasta ?? def.hasta };
    })();

    const { data: cli } = await supabase
      .from("clientes")
      .select("id, rfc, razon_social, despacho_id, regimen_fiscal, tipo_persona")
      .eq("id", data.cliente_id)
      .maybeSingle();
    if (!cli) throw new Error("Cliente no encontrado");
    if (!cli.despacho_id) throw new Error("Cliente sin despacho asignado");
    const despachoId = cli.despacho_id as string;
    const rfcCli = (cli.rfc as string).toUpperCase();

    // Lectura exhaustiva y estricta: si una consulta falla o se trunca, la
    // corrida se detiene en lugar de cerrar incidencias reales por error.
    async function todas<T>(armar: (desde: number, hasta: number) => any): Promise<T[]> {
      const out: T[] = [];
      for (let desdeFila = 0; ; desdeFila += 1000) {
        const { data: pagina, error } = await armar(desdeFila, desdeFila + 999);
        if (error) throw new Error(error.message);
        out.push(...((pagina ?? []) as T[]));
        if ((pagina ?? []).length < 1000) break;
      }
      return out;
    }
    const [cfdis, polizas, movs] = await Promise.all([
      todas<any>((a, b) =>
        supabase
          .from("cfdi_xml")
          .select("id, uuid, tipo_cfdi, fecha, total, subtotal, iva_trasladado, rfc_emisor, rfc_receptor, estatus_sat, metodo_pago")
          .eq("cliente_id", data.cliente_id)
          .gte("fecha", desde)
          .lte("fecha", `${hasta}T23:59:59`)
          .order("id")
          .range(a, b),
      ),
      todas<any>((a, b) =>
        supabase
          .from("polizas")
          .select(`id, tipo, fecha, estado, concepto, uuid_cfdi, movimiento_bancario_id, referencia, ${SELECT_RENGLONES_LEGADO}`)
          .eq("cliente_id", data.cliente_id)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("id")
          .range(a, b),
      ),
      todas<any>((a, b) =>
        supabase
          .from("movimientos_bancarios")
          .select("id, fecha, descripcion, cargo, abono")
          .eq("cliente_id", data.cliente_id)
          .not("validado_at", "is", null)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("id")
          .range(a, b),
      ),
    ]);

    const cfdi = cfdis ?? [];
    const pol: PolizaIn[] = (polizas ?? []).map((p: any) => ({
      id: p.id,
      fecha: p.fecha,
      estado: p.estado ?? null,
      uuid_cfdi: p.uuid_cfdi ?? null,
      cfdi_ids: [
        ...new Set(((p.poliza_renglones ?? []) as any[]).map((r) => r.cfdi_id).filter(Boolean) as string[]),
      ],
      monto: montoDesdeRenglones(p),
    }));
    const mov = movs ?? [];

    // Lo que el contador ya confirmó en la conciliación bancaria no se vuelve a acusar.
    const movimientosConfirmados = new Set<string>();
    const cfdiConfirmados = new Set<string>();
    // Se busca por ambos lados: un CFDI de fin de mes pudo conciliarse con un
    // depósito del mes siguiente, fuera de este rango.
    const porLado: { col: "movimiento_id" | "cfdi_id"; ids: string[] }[] = [
      { col: "movimiento_id", ids: mov.map((m) => m.id as string) },
      { col: "cfdi_id", ids: cfdi.map((c) => c.id as string) },
    ];
    for (const lado of porLado) {
      for (let i = 0; i < lado.ids.length; i += 200) {
        const { data: conf, error: errConf } = await supabase
          .from("conciliaciones")
          .select("movimiento_id, cfdi_id")
          .eq("cliente_id", data.cliente_id)
          .eq("estado_grupo", "confirmado")
          .in(lado.col, lado.ids.slice(i, i + 200));
        if (errConf) throw new Error(errConf.message);
        for (const c of conf ?? []) {
          if (c.movimiento_id) movimientosConfirmados.add(c.movimiento_id);
          if (c.cfdi_id) cfdiConfirmados.add(c.cfdi_id);
        }
      }
    }

    const { incidencias, suficiencia } = detectarIncidencias({
      rfcCliente: rfcCli,
      regimenFiscal: (cli as any).regimen_fiscal ?? null,
      tipoPersona: ((cli as any).tipo_persona ?? null) as "fisica" | "moral" | null,
      cfdi: cfdi as any,
      polizas: pol,
      movimientos: mov as any,
      movimientosConfirmados,
      cfdiConfirmados,
    });

    // ---------- Score ----------
    const criticas = incidencias.filter((i) => i.gravedad === "critica").length;
    const medias = incidencias.filter((i) => i.gravedad === "media").length;
    const bajas = incidencias.filter((i) => i.gravedad === "baja").length;
    const score = Math.max(0, 100 - criticas * 8 - medias * 3 - bajas * 1);
    const monto_observado = incidencias.reduce((a, i) => a + i.monto, 0);

    const kpis = {
      ...kpisDe(incidencias),
      cfdi_total: cfdi.length,
      polizas_total: pol.length,
      mov_total: mov.length,
      suficiencia,
    };

    // ---------- Guardar corrida ----------
    const { data: run, error: errRun } = await supabase
      .from("conciliacion_integral_runs")
      .insert({
        cliente_id: data.cliente_id,
        despacho_id: despachoId,
        desde,
        hasta,
        score_consistencia: score,
        kpis,
        total_incidencias: incidencias.length,
        criticas,
        medias,
        bajas,
        monto_observado,
        trigger_origen: data.trigger ?? "manual",
        created_by: userId,
      })
      .select("id")
      .single();
    if (errRun) throw new Error(errRun.message);

    // ---------- Upsert incidencias (idempotente por hash) ----------
    if (incidencias.length > 0) {
      const payload = incidencias.map((i) => ({
        cliente_id: data.cliente_id,
        despacho_id: despachoId,
        run_id: run!.id,
        tipo: i.tipo,
        gravedad: i.gravedad,
        fecha: i.fecha,
        monto: i.monto,
        cfdi_id: i.cfdi_id ?? null,
        poliza_id: i.poliza_id ?? null,
        movimiento_id: i.movimiento_id ?? null,
        ref_hash: i.ref_hash,
        detalle: i.detalle as any,
        recomendacion: i.recomendacion,
        impacto_isr: i.impacto_isr,
        impacto_iva: i.impacto_iva,
      }));
      const { error: errInc } = await supabase
        .from("conciliacion_incidencias")
        .upsert(payload, { onConflict: "cliente_id,tipo,ref_hash", ignoreDuplicates: false });
      if (errInc) throw new Error(errInc.message);
    }

    // ---------- Cerrar lo que ya no aplica ----------
    // Una incidencia abierta del mismo rango que esta corrida ya no detecta se
    // marca como resuelta: el tablero refleja la realidad actual, no un histórico
    // acumulado de alarmas.
    {
      const vigentesHash = new Set(incidencias.map((i) => `${i.tipo}|${i.ref_hash}`));
      const { data: delRango, error: errRango } = await supabase
        .from("conciliacion_incidencias")
        .select("id, tipo, ref_hash, estatus, resuelta_por")
        .eq("cliente_id", data.cliente_id)
        .in("estatus", ["abierta", "resuelta"])
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (errRango) throw new Error(errRango.message);
      const filas = (delRango ?? []) as any[];
      const cerrar = filas
        .filter((r) => r.estatus === "abierta" && !vigentesHash.has(`${r.tipo}|${r.ref_hash}`))
        .map((r) => r.id as string);
      // Lo que el motor cerró solo (sin persona) y vuelve a detectarse, se reabre.
      // Lo que una persona resolvió o marcó como falso positivo no se toca.
      const reabrir = filas
        .filter((r) => r.estatus === "resuelta" && !r.resuelta_por && vigentesHash.has(`${r.tipo}|${r.ref_hash}`))
        .map((r) => r.id as string);
      for (let i = 0; i < cerrar.length; i += 200) {
        const { error: e1 } = await supabase
          .from("conciliacion_incidencias")
          .update({ estatus: "resuelta", resuelta_at: new Date().toISOString(), resuelta_por: null })
          .in("id", cerrar.slice(i, i + 200));
        if (e1) throw new Error(e1.message);
      }
      for (let i = 0; i < reabrir.length; i += 200) {
        const { error: e2 } = await supabase
          .from("conciliacion_incidencias")
          .update({ estatus: "abierta", resuelta_at: null })
          .in("id", reabrir.slice(i, i + 200));
        if (e2) throw new Error(e2.message);
      }
    }

    // ---------- Snapshot histórico ----------
    await supabase.from("conciliacion_score_historico").insert({
      cliente_id: data.cliente_id,
      despacho_id: despachoId,
      run_id: run!.id,
      score,
      criticas,
      medias,
      bajas,
      monto_observado,
    });

    return {
      run_id: run!.id,
      score,
      criticas,
      medias,
      bajas,
      monto_observado,
      total: incidencias.length,
      kpis,
      suficiencia,
    };
  });

// ---------- Explicar incidencia con IA ----------
const ExplainInput = z.object({ id: z.string().uuid() });

export const explicarIncidencia = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => ExplainInput.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = aiApiKey();
    if (!apiKey) return { error: "IA no configurada", explicacion: "" };
    const { supabase } = context;
    const { data: inc } = await supabase
      .from("conciliacion_incidencias")
      .select("id, cliente_id, tipo, gravedad, monto, fecha, detalle, recomendacion, impacto_isr, impacto_iva, clientes:cliente_id(rfc, razon_social)")
      .eq("id", data.id)
      .maybeSingle();
    if (!inc) return { error: "No encontrada", explicacion: "" };

    const prompt = `Eres analista fiscal mexicano. Explica en español claro (máx 5 líneas) esta inconsistencia y qué riesgo fiscal implica.
Tipo: ${inc.tipo}. Gravedad: ${inc.gravedad}. Monto: $${Number(inc.monto).toFixed(2)}. Fecha: ${inc.fecha ?? "—"}.
Cliente: ${(inc as any).clientes?.razon_social ?? ""} ${(inc as any).clientes?.rfc ?? ""}.
Detalle JSON: ${JSON.stringify(inc.detalle)}. Recomendación base: ${inc.recomendacion ?? ""}.
Responde SOLO JSON: {"explicacion":"...", "accion":"..."}`;
    try {
      const res = await aiFetch("chat/completions", {
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
      if (res.status === 429) return { error: "Límite IA alcanzado, intenta en unos minutos.", explicacion: "" };
      if (res.status === 402) return { error: "Créditos IA agotados. Recarga en Plan & Consumo.", explicacion: "" };
      if (!res.ok) return { error: `IA ${res.status}`, explicacion: "" };
      const json = await res.json() as any;
      const finishReason = json.choices?.[0]?.finish_reason ?? json.choices?.[0]?.finishReason;
      if (finishReason && !["stop", "STOP"].includes(String(finishReason))) return { error: `IA incompleta (${finishReason})`, explicacion: "" };
      const content = json.choices?.[0]?.message?.content ?? "{}";
      const parsed = extractJsonObject(content);
      const explicacion = String(parsed.explicacion ?? "");
      const accion = String(parsed.accion ?? "");
      const full = accion ? `${explicacion}\n\nAcción sugerida: ${accion}` : explicacion;
      await supabase.from("conciliacion_incidencias").update({ explicacion_ia: full }).eq("id", data.id);
      return { error: null as string | null, explicacion: full };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Error IA", explicacion: "" };
    }
  });
