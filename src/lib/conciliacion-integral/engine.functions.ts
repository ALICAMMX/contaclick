import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

const RunInput = z.object({
  cliente_id: z.string().uuid(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  trigger: z.string().optional(),
});

export type IncidenciaTipo =
  | "ingreso_sat_sin_poliza"
  | "gasto_sat_sin_poliza"
  | "pago_banco_sin_cfdi"
  | "cfdi_sin_movimiento"
  | "diferencia_monto"
  | "cfdi_duplicado"
  | "cfdi_cancelado_no_ajustado";

type Gravedad = "critica" | "media" | "baja";

type IncidenciaDraft = {
  tipo: IncidenciaTipo;
  gravedad: Gravedad;
  fecha: string | null;
  monto: number;
  cfdi_id?: string | null;
  poliza_id?: string | null;
  movimiento_id?: string | null;
  ref_hash: string;
  detalle: Record<string, unknown>;
  recomendacion: string;
  impacto_isr: number;
  impacto_iva: number;
};

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
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getDashboardConciliacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("conciliacion_incidencias")
      .select("tipo, gravedad, estatus, monto, impacto_isr, impacto_iva, cliente_id, clientes:cliente_id(razon_social)");
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    const { data: rows } = await q;
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
    const upd: Record<string, unknown> = { estatus: data.estatus };
    if (data.estatus === "resuelta" || data.estatus === "falso_positivo") {
      upd.resuelta_at = new Date().toISOString();
      upd.resuelta_por = userId;
    }
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
      .select("id, rfc, razon_social, despacho_id")
      .eq("id", data.cliente_id)
      .maybeSingle();
    if (!cli) throw new Error("Cliente no encontrado");
    const rfcCli = (cli.rfc as string).toUpperCase();

    const [{ data: cfdis }, { data: polizas }, { data: movs }] = await Promise.all([
      supabase
        .from("cfdi_xml")
        .select("id, uuid, tipo_cfdi, fecha, total, subtotal, iva_trasladado, rfc_emisor, rfc_receptor, estatus_sat, metodo_pago")
        .eq("cliente_id", data.cliente_id)
        .gte("fecha", desde)
        .lte("fecha", `${hasta}T23:59:59`),
      supabase
        .from("polizas")
        .select("id, tipo, fecha, monto, concepto, uuid_cfdi, movimiento_bancario_id, referencia")
        .eq("cliente_id", data.cliente_id)
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase
        .from("movimientos_bancarios")
        .select("id, fecha, descripcion, cargo, abono")
        .eq("cliente_id", data.cliente_id)
        .gte("fecha", desde)
        .lte("fecha", hasta),
    ]);

    const cfdi = cfdis ?? [];
    const pol = polizas ?? [];
    const mov = movs ?? [];

    const polByUuid = new Map<string, any>();
    for (const p of pol) if (p.uuid_cfdi) polByUuid.set(String(p.uuid_cfdi).toUpperCase(), p);

    const polUsed = new Set<string>();
    const cfdiUsed = new Set<string>();
    const movUsed = new Set<string>();

    const incidencias: IncidenciaDraft[] = [];

    // 1. Duplicados de CFDI por UUID
    const uuidCount = new Map<string, any[]>();
    for (const c of cfdi) {
      if (!c.uuid) continue;
      const k = String(c.uuid).toUpperCase();
      const arr = uuidCount.get(k) ?? [];
      arr.push(c);
      uuidCount.set(k, arr);
    }
    for (const [uuid, arr] of uuidCount) {
      if (arr.length > 1) {
        incidencias.push({
          tipo: "cfdi_duplicado",
          gravedad: "media",
          fecha: arr[0].fecha?.slice(0, 10) ?? null,
          monto: Number(arr[0].total ?? 0),
          cfdi_id: arr[0].id,
          ref_hash: `dup:${uuid}`,
          detalle: { uuid, copias: arr.length },
          recomendacion: "Eliminar duplicado en contabilidad y conservar único CFDI vigente.",
          impacto_isr: 0,
          impacto_iva: 0,
        });
      }
    }

    // 2. CFDI cancelado pero contabilizado
    for (const c of cfdi) {
      if (c.estatus_sat === "cancelado") {
        const uuid = String(c.uuid ?? "").toUpperCase();
        const p = polByUuid.get(uuid);
        if (p) {
          incidencias.push({
            tipo: "cfdi_cancelado_no_ajustado",
            gravedad: "critica",
            fecha: c.fecha?.slice(0, 10) ?? null,
            monto: Number(c.total ?? 0),
            cfdi_id: c.id,
            poliza_id: p.id,
            ref_hash: `canc:${uuid}`,
            detalle: { uuid, poliza: p.id },
            recomendacion: "Reversar póliza o emitir nota de ajuste; CFDI cancelado en SAT.",
            impacto_isr: Number(c.subtotal ?? 0) * 0.3,
            impacto_iva: Number(c.iva_trasladado ?? 0),
          });
        }
      }
    }

    // 3. Match CFDI ↔ Póliza por UUID
    for (const c of cfdi) {
      const uuid = String(c.uuid ?? "").toUpperCase();
      if (!uuid || c.estatus_sat === "cancelado") continue;
      const p = polByUuid.get(uuid);
      if (p) {
        cfdiUsed.add(c.id);
        polUsed.add(p.id);
        const dif = Math.abs(Number(c.total ?? 0) - Number(p.monto ?? 0));
        if (dif > 1) {
          incidencias.push({
            tipo: "diferencia_monto",
            gravedad: dif > 1000 ? "critica" : "media",
            fecha: c.fecha?.slice(0, 10) ?? null,
            monto: dif,
            cfdi_id: c.id,
            poliza_id: p.id,
            ref_hash: `dif:${uuid}`,
            detalle: { uuid, cfdi: Number(c.total), poliza: Number(p.monto), diff: dif },
            recomendacion: "Ajustar póliza para que coincida con el monto del CFDI vigente.",
            impacto_isr: dif * 0.3,
            impacto_iva: 0,
          });
        }
      }
    }

    // 4. Match CFDI ↔ Póliza por monto+fecha (±3d) entre los no usados
    const cfdiPend = cfdi.filter((c) => !cfdiUsed.has(c.id) && c.estatus_sat !== "cancelado");
    const polPend = pol.filter((p) => !polUsed.has(p.id));
    for (const c of cfdiPend) {
      const cFecha = new Date(c.fecha as string).getTime();
      const cTotal = Number(c.total ?? 0);
      const hit = polPend.find((p) => {
        if (polUsed.has(p.id)) return false;
        const pf = new Date(p.fecha as string).getTime();
        const dDays = Math.abs(cFecha - pf) / 86400000;
        return dDays <= 3 && Math.abs(Number(p.monto ?? 0) - cTotal) <= 1;
      });
      if (hit) {
        cfdiUsed.add(c.id);
        polUsed.add(hit.id);
      }
    }

    // 5. Ingresos / gastos SAT sin póliza
    for (const c of cfdi) {
      if (cfdiUsed.has(c.id) || c.estatus_sat === "cancelado") continue;
      const esEmitido = String(c.rfc_emisor ?? "").toUpperCase() === rfcCli && c.tipo_cfdi === "I";
      const esRecibido = String(c.rfc_receptor ?? "").toUpperCase() === rfcCli && c.tipo_cfdi === "I";
      if (!esEmitido && !esRecibido) continue;
      const total = Number(c.total ?? 0);
      const subtotal = Number(c.subtotal ?? 0);
      const iva = Number(c.iva_trasladado ?? 0);
      const tipo: IncidenciaTipo = esEmitido ? "ingreso_sat_sin_poliza" : "gasto_sat_sin_poliza";
      const gravedad: Gravedad = total > 50000 ? "critica" : total > 5000 ? "media" : "baja";
      incidencias.push({
        tipo,
        gravedad,
        fecha: (c.fecha as string)?.slice(0, 10) ?? null,
        monto: total,
        cfdi_id: c.id,
        ref_hash: `${tipo}:${String(c.uuid ?? c.id).toUpperCase()}`,
        detalle: { uuid: c.uuid, contraparte: esEmitido ? c.rfc_receptor : c.rfc_emisor },
        recomendacion: esEmitido
          ? "Registrar ingreso en contabilidad y conciliar con depósito bancario."
          : "Registrar gasto deducible en contabilidad y validar soporte fiscal.",
        impacto_isr: esEmitido ? subtotal * 0.3 : 0,
        impacto_iva: esEmitido ? iva : -iva,
      });
    }

    // 6. CFDI emitido sin movimiento bancario (PUE)
    const abonos = mov.filter((m) => Number(m.abono ?? 0) > 0);
    const cargos = mov.filter((m) => Number(m.cargo ?? 0) > 0);
    for (const c of cfdi) {
      if (c.tipo_cfdi !== "I") continue;
      if (String(c.rfc_emisor ?? "").toUpperCase() !== rfcCli) continue;
      if ((c.metodo_pago ?? "") !== "PUE") continue;
      const total = Number(c.total ?? 0);
      const cf = new Date(c.fecha as string).getTime();
      const hit = abonos.find((m) => {
        if (movUsed.has(m.id)) return false;
        const mf = new Date(m.fecha as string).getTime();
        return Math.abs(cf - mf) / 86400000 <= 7 && Math.abs(Number(m.abono ?? 0) - total) <= 1;
      });
      if (hit) {
        movUsed.add(hit.id);
      } else {
        incidencias.push({
          tipo: "cfdi_sin_movimiento",
          gravedad: total > 50000 ? "critica" : "media",
          fecha: (c.fecha as string)?.slice(0, 10) ?? null,
          monto: total,
          cfdi_id: c.id,
          ref_hash: `nopay:${String(c.uuid ?? c.id).toUpperCase()}`,
          detalle: { uuid: c.uuid, metodo: c.metodo_pago },
          recomendacion: "Validar cobro: si no se cobró, emitir complemento o nota; si se cobró, conciliar.",
          impacto_isr: 0,
          impacto_iva: 0,
        });
      }
    }

    // 7. Pagos bancarios sin CFDI deducible
    for (const m of cargos) {
      if (movUsed.has(m.id)) continue;
      const monto = Number(m.cargo ?? 0);
      if (monto < 500) continue; // ignorar micro-cargos
      incidencias.push({
        tipo: "pago_banco_sin_cfdi",
        gravedad: monto > 50000 ? "critica" : monto > 5000 ? "media" : "baja",
        fecha: (m.fecha as string)?.slice(0, 10) ?? null,
        monto,
        movimiento_id: m.id,
        ref_hash: `nocfdi:${m.id}`,
        detalle: { descripcion: m.descripcion },
        recomendacion: "Solicitar CFDI deducible al proveedor o documentar el pago.",
        impacto_isr: monto * 0.3,
        impacto_iva: monto * 0.16 / 1.16,
      });
    }

    // ---------- Score ----------
    const criticas = incidencias.filter((i) => i.gravedad === "critica").length;
    const medias = incidencias.filter((i) => i.gravedad === "media").length;
    const bajas = incidencias.filter((i) => i.gravedad === "baja").length;
    const score = Math.max(0, 100 - criticas * 8 - medias * 3 - bajas * 1);
    const monto_observado = incidencias.reduce((a, i) => a + i.monto, 0);

    const kpis = {
      ingresos_omitidos: incidencias.filter((i) => i.tipo === "ingreso_sat_sin_poliza").length,
      gastos_sin_registrar: incidencias.filter((i) => i.tipo === "gasto_sat_sin_poliza").length,
      cfdi_sin_pago: incidencias.filter((i) => i.tipo === "cfdi_sin_movimiento").length,
      pagos_sin_cfdi: incidencias.filter((i) => i.tipo === "pago_banco_sin_cfdi").length,
      duplicados: incidencias.filter((i) => i.tipo === "cfdi_duplicado").length,
      cancelados: incidencias.filter((i) => i.tipo === "cfdi_cancelado_no_ajustado").length,
      diferencias: incidencias.filter((i) => i.tipo === "diferencia_monto").length,
      cfdi_total: cfdi.length,
      polizas_total: pol.length,
      mov_total: mov.length,
    };

    // ---------- Guardar corrida ----------
    const { data: run, error: errRun } = await supabase
      .from("conciliacion_integral_runs")
      .insert({
        cliente_id: data.cliente_id,
        despacho_id: cli.despacho_id,
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
        despacho_id: cli.despacho_id,
        run_id: run!.id,
        tipo: i.tipo,
        gravedad: i.gravedad,
        fecha: i.fecha,
        monto: i.monto,
        cfdi_id: i.cfdi_id ?? null,
        poliza_id: i.poliza_id ?? null,
        movimiento_id: i.movimiento_id ?? null,
        ref_hash: i.ref_hash,
        detalle: i.detalle,
        recomendacion: i.recomendacion,
        impacto_isr: i.impacto_isr,
        impacto_iva: i.impacto_iva,
      }));
      const { error: errInc } = await supabase
        .from("conciliacion_incidencias")
        .upsert(payload, { onConflict: "cliente_id,tipo,ref_hash", ignoreDuplicates: false });
      if (errInc) throw new Error(errInc.message);
    }

    // ---------- Snapshot histórico ----------
    await supabase.from("conciliacion_score_historico").insert({
      cliente_id: data.cliente_id,
      despacho_id: cli.despacho_id,
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
    };
  });

// ---------- Explicar incidencia con IA ----------
const ExplainInput = z.object({ id: z.string().uuid() });

export const explicarIncidencia = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => ExplainInput.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
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
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      });
      if (res.status === 429) return { error: "Límite IA alcanzado, intenta en unos minutos.", explicacion: "" };
      if (res.status === 402) return { error: "Créditos IA agotados. Recarga en Plan & Consumo.", explicacion: "" };
      if (!res.ok) return { error: `IA ${res.status}`, explicacion: "" };
      const json = await res.json() as any;
      const content = json.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content);
      const explicacion = String(parsed.explicacion ?? "");
      const accion = String(parsed.accion ?? "");
      const full = accion ? `${explicacion}\n\nAcción sugerida: ${accion}` : explicacion;
      await supabase.from("conciliacion_incidencias").update({ explicacion_ia: full }).eq("id", data.id);
      return { error: null as string | null, explicacion: full };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Error IA", explicacion: "" };
    }
  });
