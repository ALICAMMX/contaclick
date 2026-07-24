import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---- helpers ----
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureDespacho(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: m } = await supabase.from("user_memberships").select("despacho_id").eq("user_id", userId).limit(1).maybeSingle();
  if (m?.despacho_id) return m.despacho_id as string;
  const { data: d, error } = await supabase.from("despachos").insert({ nombre: "Mi despacho", owner_user_id: userId }).select("id").single();
  if (error || !d) throw new Error(`No se pudo crear despacho: ${error?.message}`);
  await supabase.from("user_memberships").insert({ user_id: userId, despacho_id: d.id });
  await supabase.from("user_roles").insert({ user_id: userId, role: "despacho", despacho_id: d.id });
  return d.id as string;
}

async function ensureCuenta(
  supabase: SupabaseClient,
  args: { despachoId: string; clienteId: string; banco: string; alias?: string | null; mask?: string | null },
): Promise<string> {
  const { data: existing } = await supabase
    .from("cuentas_bancarias")
    .select("id")
    .eq("despacho_id", args.despachoId)
    .eq("cliente_id", args.clienteId)
    .eq("banco", args.banco)
    .eq("alias", args.alias ?? "Principal")
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await supabase
    .from("cuentas_bancarias")
    .insert({
      despacho_id: args.despachoId,
      cliente_id: args.clienteId,
      banco: args.banco,
      alias: args.alias ?? "Principal",
      numero_cuenta_mask: args.mask ?? null,
      moneda: "MXN",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo crear cuenta: ${error?.message}`);
  return data.id as string;
}

// ---- schemas ----
const MovimientoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  descripcion: z.string().max(500).default(""),
  referencia: z.string().max(120).nullable().default(null),
  cargo: z.number().min(0).default(0),
  abono: z.number().min(0).default(0),
  saldo: z.number().nullable().default(null),
});

const UploadSchema = z.object({
  cliente_id: z.string().uuid(),
  cuenta_id: z.string().uuid().optional(),
  banco: z.string().min(1).max(60).optional(),
  alias: z.string().max(80).optional(),
  mask: z.string().max(40).optional(),
  movimientos: z.array(MovimientoSchema).min(1).max(5000),
});

// ---- upload movimientos ----
export const uploadMovimientos = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await ensureDespacho(supabase, userId);

    // CANDADO: el expediente debe pertenecer al despacho del usuario
    const { data: cli, error: cliErr } = await supabase
      .from("clientes")
      .select("id, rfc, despacho_id")
      .eq("id", data.cliente_id)
      .maybeSingle();
    if (cliErr || !cli) throw new Error("Expediente no encontrado");
    if (cli.despacho_id !== despachoId) {
      throw new Error("El expediente no pertenece a tu despacho. Operación cancelada.");
    }

    let cuentaId: string;
    if (data.cuenta_id) {
      // CANDADO: la cuenta bancaria debe pertenecer al MISMO expediente que se está conciliando
      const { data: cta, error: ctaErr } = await supabase
        .from("cuentas_bancarias")
        .select("id, cliente_id, banco, alias")
        .eq("id", data.cuenta_id)
        .maybeSingle();
      if (ctaErr || !cta) throw new Error("Cuenta bancaria no encontrada");
      if (cta.cliente_id !== data.cliente_id) {
        throw new Error(
          `La cuenta seleccionada (${cta.banco} · ${cta.alias ?? ""}) pertenece a otro expediente. Para no mezclar contabilidades, la carga fue rechazada.`,
        );
      }
      cuentaId = data.cuenta_id;
    } else {
      if (!data.banco) throw new Error("Indica una cuenta existente o un banco para crearla.");
      cuentaId = await ensureCuenta(supabase, {
        despachoId,
        clienteId: data.cliente_id,
        banco: data.banco,
        alias: data.alias,
        mask: data.mask,
      });
    }


    let inserted = 0, duplicates = 0;
    const rows = [];
    for (const m of data.movimientos) {
      const hash = await sha256Hex(`${cuentaId}|${m.fecha}|${m.cargo}|${m.abono}|${m.descripcion}|${m.referencia ?? ""}`);
      rows.push({
        despacho_id: despachoId,
        cliente_id: data.cliente_id,
        cuenta_id: cuentaId,
        fecha: m.fecha,
        descripcion: m.descripcion,
        referencia: m.referencia,
        cargo: m.cargo,
        abono: m.abono,
        saldo: m.saldo,
        hash,
      });
    }

    // dedupe within batch first (varios renglones idénticos en el mismo PDF)
    const seenLocal = new Set<string>();
    const uniqueRows = rows.filter((r) => {
      if (seenLocal.has(r.hash)) return false;
      seenLocal.add(r.hash);
      return true;
    });

    // dedupe contra lo ya guardado en BD
    const hashes = uniqueRows.map((r) => r.hash);
    const { data: dups } = hashes.length
      ? await supabase
          .from("movimientos_bancarios")
          .select("hash")
          .eq("cuenta_id", cuentaId)
          .in("hash", hashes)
      : { data: [] as { hash: string }[] };
    const dupSet = new Set((dups ?? []).map((d) => d.hash as string));
    const fresh = uniqueRows.filter((r) => !dupSet.has(r.hash));
    duplicates = rows.length - fresh.length;

    if (fresh.length) {
      // insert in chunks
      for (let i = 0; i < fresh.length; i += 500) {
        const chunk = fresh.slice(i, i + 500);
        const { error } = await supabase.from("movimientos_bancarios").insert(chunk);
        if (error) throw new Error(error.message);
        inserted += chunk.length;
      }
    }

    return { cuenta_id: cuentaId, inserted, duplicates, total: rows.length };
  });

// ---- listing ----
export const listMovimientos = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    cliente_id: z.string().uuid(),
    cuenta_id: z.string().uuid().optional(),
    limit: z.number().min(1).max(1000).default(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("movimientos_bancarios")
      .select("id, fecha, descripcion, referencia, cargo, abono, saldo, cuenta_id")
      .eq("cliente_id", data.cliente_id)
      .order("fecha", { ascending: false })
      .limit(data.limit);
    if (data.cuenta_id) q = q.eq("cuenta_id", data.cuenta_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const [{ data: matches }, { data: cuentas }] = await Promise.all([
      context.supabase
        .from("conciliaciones")
        .select("id, movimiento_id, cfdi_id, tipo_match, probabilidad, estatus, motivo, diferencia")
        .eq("cliente_id", data.cliente_id),
      context.supabase
        .from("cuentas_bancarias")
        .select("id, banco, alias, numero_cuenta_mask")
        .eq("cliente_id", data.cliente_id),
    ]);

    return { movimientos: rows ?? [], conciliaciones: matches ?? [], cuentas: cuentas ?? [] };
  });

// ---- run reconciliation engine ----
const RunSchema = z.object({
  cliente_id: z.string().uuid(),
  tolerancia_pct: z.number().min(0).max(5).default(0.5),
  dias_ventana: z.number().min(0).max(30).default(5),
});

export const runReconciliation = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => RunSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const cliente_id = data.cliente_id;

    // Despacho id (needed for inserts)
    const { data: cli } = await supabase.from("clientes").select("despacho_id, rfc").eq("id", cliente_id).single();
    if (!cli?.despacho_id) throw new Error("Cliente sin despacho asignado.");
    const despachoId = cli.despacho_id as string;
    const rfcCliente = (cli.rfc as string).toUpperCase();

    // Fetch movimientos & cfdis
    const [{ data: movs }, { data: cfdis }, { data: existing }] = await Promise.all([
      supabase.from("movimientos_bancarios").select("id, fecha, descripcion, referencia, cargo, abono").eq("cliente_id", cliente_id),
      supabase.from("cfdi_xml").select("id, uuid, tipo_cfdi, fecha, rfc_emisor, rfc_receptor, total, nombre_emisor, nombre_receptor").eq("cliente_id", cliente_id),
      supabase.from("conciliaciones").select("movimiento_id, cfdi_id").eq("cliente_id", cliente_id),
    ]);

    const usedMov = new Set((existing ?? []).map((e) => e.movimiento_id).filter(Boolean));
    const usedCfdi = new Set((existing ?? []).map((e) => e.cfdi_id).filter(Boolean));

    type Match = { movimiento_id: string; cfdi_id: string; probabilidad: number; tipo_match: string; diferencia: number; motivo: string };
    const matches: Match[] = [];

    const tol = data.tolerancia_pct / 100;
    const ventanaMs = data.dias_ventana * 86400000;

    const cfdiArr = (cfdis ?? []).filter((c) => !usedCfdi.has(c.id));

    for (const mov of movs ?? []) {
      if (usedMov.has(mov.id)) continue;
      const movMonto = Number(mov.abono ?? 0) > 0 ? Number(mov.abono) : Number(mov.cargo ?? 0);
      const esIngreso = Number(mov.abono ?? 0) > 0;
      const movFecha = new Date(mov.fecha as string).getTime();
      const desc = (mov.descripcion as string ?? "").toUpperCase();
      const ref = (mov.referencia as string ?? "").toUpperCase();

      let best: Match | null = null;
      for (const c of cfdiArr) {
        // Direction filter: Ingreso → buscar CFDI emitido por cliente (rfc_emisor=cliente)
        // Egreso → buscar CFDI recibido (rfc_receptor=cliente)
        const isCfdiEmitido = (c.rfc_emisor as string)?.toUpperCase() === rfcCliente;
        const isCfdiRecibido = (c.rfc_receptor as string)?.toUpperCase() === rfcCliente;
        if (esIngreso && !isCfdiEmitido) continue;
        if (!esIngreso && !isCfdiRecibido) continue;

        const total = Number(c.total ?? 0);
        if (total <= 0) continue;
        const dif = Math.abs(total - movMonto);
        const pctDif = dif / total;

        const cfdiFecha = new Date(c.fecha as string).getTime();
        const dDias = Math.abs(cfdiFecha - movFecha);
        if (dDias > ventanaMs) continue;
        if (pctDif > Math.max(tol, 0.005)) continue; // bound min tol

        // Score
        let score = 0;
        let tipo = "manual";
        const motivos: string[] = [];
        if (dif < 0.01 && dDias <= 86400000) { score = 0.99; tipo = "exacto"; motivos.push("Monto y fecha exactos"); }
        else if (dif < 0.01) { score = 0.9 - dDias / ventanaMs * 0.1; tipo = "exacto"; motivos.push(`Monto exacto, ${Math.round(dDias / 86400000)}d`); }
        else { score = 0.7 - pctDif * 5 - (dDias / ventanaMs) * 0.1; tipo = "probable"; motivos.push(`Diferencia ${(pctDif * 100).toFixed(2)}%`); }

        // Bonus: RFC contraparte mencionado en descripción
        const rfcContra = ((esIngreso ? c.rfc_receptor : c.rfc_emisor) as string ?? "").toUpperCase();
        if (rfcContra && (desc.includes(rfcContra) || desc.includes((esIngreso ? c.nombre_receptor : c.nombre_emisor) as string ?? "—".toUpperCase()))) {
          score += 0.1;
          motivos.push("RFC/Razón social en descripción");
        }
        // Bonus: UUID/folio en referencia
        if (ref && (c.uuid as string)?.slice(-6) && ref.includes((c.uuid as string).slice(-6).toUpperCase())) {
          score += 0.1;
          motivos.push("Folio en referencia");
        }
        score = Math.min(score, 0.999);

        if (!best || score > best.probabilidad) {
          best = {
            movimiento_id: mov.id as string,
            cfdi_id: c.id as string,
            probabilidad: score,
            tipo_match: tipo,
            diferencia: dif,
            motivo: motivos.join(" · "),
          };
        }
      }

      if (best && best.probabilidad >= 0.5) {
        matches.push(best);
        usedCfdi.add(best.cfdi_id);
      }
    }

    if (matches.length) {
      const rows = matches.map((m) => ({
        despacho_id: despachoId,
        cliente_id,
        movimiento_id: m.movimiento_id,
        cfdi_id: m.cfdi_id,
        tipo_match: m.tipo_match,
        probabilidad: Number(m.probabilidad.toFixed(3)),
        diferencia: Number(m.diferencia.toFixed(2)),
        estatus: m.probabilidad >= 0.95 ? "confirmado" : "propuesto",
        motivo: m.motivo,
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from("conciliaciones").insert(rows.slice(i, i + 200));
        if (error) throw new Error(error.message);
      }
    }

    return {
      total_movimientos: (movs ?? []).length,
      total_cfdi: (cfdis ?? []).length,
      nuevos_matches: matches.length,
      exactos: matches.filter((m) => m.tipo_match === "exacto").length,
      probables: matches.filter((m) => m.tipo_match === "probable").length,
    };
  });

// ---- KPIs ----
export const getReconciliationStats = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: movs }, { data: cfdis }, { data: conc }] = await Promise.all([
      supabase.from("movimientos_bancarios").select("id, cargo, abono").eq("cliente_id", data.cliente_id),
      supabase.from("cfdi_xml").select("id, total, tipo_cfdi, rfc_emisor, rfc_receptor").eq("cliente_id", data.cliente_id),
      supabase.from("conciliaciones").select("id, movimiento_id, cfdi_id, tipo_match, probabilidad, estatus").eq("cliente_id", data.cliente_id),
    ]);

    const totalMov = (movs ?? []).length;
    const ingresos = (movs ?? []).reduce((a, m) => a + Number(m.abono ?? 0), 0);
    const egresos = (movs ?? []).reduce((a, m) => a + Number(m.cargo ?? 0), 0);
    const matchedMov = new Set((conc ?? []).map((c) => c.movimiento_id).filter(Boolean));
    const matchedCfdi = new Set((conc ?? []).map((c) => c.cfdi_id).filter(Boolean));
    const sinCfdi = (movs ?? []).filter((m) => !matchedMov.has(m.id)).length;
    const cfdiSinPago = (cfdis ?? []).filter((c) => !matchedCfdi.has(c.id)).length;
    const exactos = (conc ?? []).filter((c) => c.tipo_match === "exacto").length;
    const probables = (conc ?? []).filter((c) => c.tipo_match === "probable").length;
    const tasa = totalMov ? Math.round((matchedMov.size / totalMov) * 100) : 0;

    return {
      total_movimientos: totalMov,
      total_cfdi: (cfdis ?? []).length,
      ingresos,
      egresos,
      matched: matchedMov.size,
      sinCfdi,
      cfdiSinPago,
      exactos,
      probables,
      tasa,
    };
  });

// ---- AI analysis ----
export const analyzeReconciliationAI = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { error: "IA no configurada", content: "" };

    const { supabase } = context;
    const [{ data: movs }, { data: cfdis }, { data: conc }] = await Promise.all([
      supabase.from("movimientos_bancarios").select("fecha, descripcion, cargo, abono").eq("cliente_id", data.cliente_id).limit(50),
      supabase.from("cfdi_xml").select("uuid, tipo_cfdi, fecha, total, rfc_emisor, rfc_receptor").eq("cliente_id", data.cliente_id).limit(50),
      supabase.from("conciliaciones").select("tipo_match, probabilidad, diferencia, motivo").eq("cliente_id", data.cliente_id).limit(100),
    ]);

    const prompt = `Eres contador fiscalista mexicano. Analiza esta conciliación bancaria y entrega:
1) Resumen ejecutivo (1 párrafo)
2) Riesgos fiscales detectados (depósitos sin CFDI, posibles ingresos omitidos, duplicidades)
3) 3 acciones recomendadas concretas
4) Una carta corta (3 líneas) para el cliente

Datos:
Movimientos: ${JSON.stringify(movs?.slice(0, 30))}
CFDIs: ${JSON.stringify(cfdis?.slice(0, 30))}
Matches existentes: ${JSON.stringify(conc?.slice(0, 30))}

Responde en español, formato markdown, conciso.`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Eres ContaClick IA, contador fiscalista mexicano experto en conciliaciones bancarias y SAT." },
            { role: "user", content: prompt },
          ],
          max_tokens: 8000,
          maxOutputTokens: 8000,
        }),
      });
      if (res.status === 429) return { error: "Demasiadas solicitudes.", content: "" };
      if (res.status === 402) return { error: "Sin créditos de IA.", content: "" };
      if (!res.ok) return { error: "Error del servicio de IA.", content: "" };
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { error: null as string | null, content: json.choices?.[0]?.message?.content ?? "" };
    } catch (e) {
      console.error("analyzeReconciliationAI", e);
      return { error: "Error de red.", content: "" };
    }
  });

// ---- delete a manual match / mark ignored ----
export const updateConciliacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    estatus: z.enum(["propuesto", "confirmado", "rechazado", "ignorado"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("conciliaciones").update({ estatus: data.estatus, confirmado_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
