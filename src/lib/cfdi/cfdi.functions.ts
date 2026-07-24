import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";
import { parseCfdi } from "@/lib/tools/cfdi-parser";
import { analyzeCfdi, maxLevel } from "@/lib/cfdi/risk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";

// ---------- helpers (server-side) ----------

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureDespacho(supabase: SupabaseClient, userId: string): Promise<string> {
  try {
    return await resolveActiveDespachoId(supabase, userId);
  } catch {
    // Legacy fallback below creates a personal despacho only when the user has none.
  }

  const { data: d, error: dErr } = await supabase
    .from("despachos")
    .insert({ nombre: "Mi despacho", owner_user_id: userId })
    .select("id")
    .single();
  if (dErr || !d) throw new Error(`No se pudo crear despacho: ${dErr?.message}`);

  await supabase.from("user_memberships").insert({ user_id: userId, despacho_id: d.id });
  await supabase.from("user_roles").insert({ user_id: userId, role: "despacho", despacho_id: d.id });
  return d.id as string;
}

async function ensureClienteDespacho(supabase: SupabaseClient, clienteId: string, despachoId: string) {
  await supabase.from("clientes").update({ despacho_id: despachoId }).eq("id", clienteId).is("despacho_id", null);
}

async function ensureRfc(
  supabase: SupabaseClient,
  args: { despachoId: string; clienteId: string; rfc: string; regimen?: string | null },
): Promise<string> {
  const rfc = args.rfc.toUpperCase();
  const { data: existing } = await supabase
    .from("rfcs")
    .select("id")
    .eq("despacho_id", args.despachoId)
    .eq("rfc", rfc)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const tipo = rfc.length === 12 ? "moral" : "fisica";
  const { data, error } = await supabase
    .from("rfcs")
    .insert({
      despacho_id: args.despachoId,
      cliente_id: args.clienteId,
      rfc,
      tipo_persona: tipo,
      regimen_fiscal: args.regimen ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo crear RFC: ${error?.message}`);
  return data.id as string;
}

// ---------- schemas ----------

const UploadOneSchema = z.object({
  cliente_id: z.string().uuid(),
  filename: z.string().max(300),
  xml: z.string().min(50).max(2_000_000), // ~2MB texto
});

const UploadBatchSchema = z.object({
  cliente_id: z.string().uuid(),
  files: z.array(z.object({
    filename: z.string().max(300),
    xml: z.string().min(50).max(2_000_000),
  })).min(1).max(200),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ListSchema = z.object({
  cliente_id: z.string().min(1),
  q: z.string().max(120).optional(),
  tipo: z.string().max(2).optional(),
  estatus: z.enum(["vigente","cancelado","desconocido"]).optional(),
  riesgo: z.enum(["alto","medio","bajo","ok"]).optional(),
  metodo_pago: z.string().max(4).optional(),
  forma_pago: z.string().max(4).optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  limit: z.number().min(1).max(500).default(200),
});

// ---------- server functions ----------

export const uploadCfdi = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadOneSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    return await ingestOne(supabase, userId, data.cliente_id, data.filename, data.xml);
  });

export const uploadCfdiBatch = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadBatchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await ensureDespacho(supabase, userId);
    await ensureClienteDespacho(supabase, data.cliente_id, despachoId);

    const results: Array<{ filename: string; ok: boolean; id?: string; uuid?: string | null; error?: string; duplicado?: boolean }> = [];
    for (const f of data.files) {
      try {
        const r = await ingestOneInternal(supabase, despachoId, data.cliente_id, f.filename, f.xml);
        results.push({ filename: f.filename, ok: true, id: r.id, uuid: r.uuid, duplicado: r.duplicado });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "error";
        results.push({ filename: f.filename, ok: false, error: msg });
      }
    }
    const inserted = results.filter((r) => r.ok && !r.duplicado).length;
    const duplicates = results.filter((r) => r.ok && r.duplicado).length;
    const failed = results.filter((r) => !r.ok).length;
    return { results, summary: { total: results.length, inserted, duplicates, failed } };
  });

async function ingestOne(supabase: SupabaseClient, userId: string, clienteId: string, filename: string, xml: string) {
  const despachoId = await ensureDespacho(supabase, userId);
  await ensureClienteDespacho(supabase, clienteId, despachoId);
  return ingestOneInternal(supabase, despachoId, clienteId, filename, xml);
}

async function ingestOneInternal(
  supabase: SupabaseClient,
  despachoId: string,
  clienteId: string,
  filename: string,
  xml: string,
): Promise<{ id: string; uuid: string | null; duplicado: boolean }> {
  const parsed = parseCfdi(xml);
  if (!parsed.uuid) throw new Error("CFDI sin UUID (no timbrado).");
  if (!parsed.emisor.rfc || !parsed.receptor.rfc) throw new Error("CFDI sin RFC emisor o receptor.");

  const hash = await sha256Hex(xml);

  // dedupe por uuid o hash
  const { data: dup } = await supabase
    .from("cfdi_xml")
    .select("id, uuid")
    .eq("despacho_id", despachoId)
    .or(`uuid.eq.${parsed.uuid},archivo_hash.eq.${hash}`)
    .limit(1)
    .maybeSingle();
  if (dup?.id) return { id: dup.id as string, uuid: parsed.uuid, duplicado: true };

  // RFC al que se vincula = el del cliente activo si coincide; si no, usa el emisor
  const { data: cli } = await supabase.from("clientes").select("rfc").eq("id", clienteId).maybeSingle();
  const rfcCliente = (cli?.rfc as string | undefined)?.toUpperCase();
  const rfcDestino = rfcCliente && (rfcCliente === parsed.emisor.rfc?.toUpperCase() || rfcCliente === parsed.receptor.rfc?.toUpperCase())
    ? rfcCliente
    : parsed.receptor.rfc!.toUpperCase();

  const rfcId = await ensureRfc(supabase, {
    despachoId,
    clienteId,
    rfc: rfcDestino,
    regimen: rfcDestino === parsed.receptor.rfc?.toUpperCase()
      ? parsed.receptor.regimenFiscalReceptor ?? undefined
      : parsed.emisor.regimenFiscal ?? undefined,
  });

  const { data: ins, error } = await supabase
    .from("cfdi_xml")
    .insert({
      despacho_id: despachoId,
      cliente_id: clienteId,
      rfc_id: rfcId,
      uuid: parsed.uuid,
      tipo_cfdi: parsed.tipoComprobante ?? "I",
      version: parsed.version ?? "4.0",
      rfc_emisor: parsed.emisor.rfc!.toUpperCase(),
      nombre_emisor: parsed.emisor.nombre ?? null,
      rfc_receptor: parsed.receptor.rfc!.toUpperCase(),
      nombre_receptor: parsed.receptor.nombre ?? null,
      fecha: parsed.fecha ? new Date(parsed.fecha).toISOString() : new Date().toISOString(),
      fecha_timbrado: parsed.fechaTimbrado ? new Date(parsed.fechaTimbrado).toISOString() : null,
      metodo_pago: parsed.metodoPago ?? null,
      forma_pago: parsed.formaPago ?? null,
      uso_cfdi: parsed.receptor.usoCFDI ?? null,
      moneda: parsed.moneda ?? "MXN",
      subtotal: parsed.subTotal ?? 0,
      descuento: parsed.descuento ?? 0,
      iva_trasladado: parsed.impuestos.totalTrasladados ?? 0,
      iva_retenido: parsed.impuestos.totalRetenidos ?? 0,
      total: parsed.total ?? 0,
      estatus_sat: "desconocido",
      archivo_path: filename,
      archivo_hash: hash,
    })
    .select("id")
    .single();
  if (error || !ins) throw new Error(`Error al guardar CFDI: ${error?.message}`);

  // Conceptos (best-effort, no bloquea)
  if (parsed.conceptos.length) {
    await supabase.from("cfdi_conceptos").insert(
      parsed.conceptos.slice(0, 200).map((c) => ({
        cfdi_id: ins.id,
        clave_prod_serv: c.claveProdServ ?? null,
        descripcion: c.descripcion ?? null,
        cantidad: c.cantidad ?? null,
        valor_unitario: c.valorUnitario ?? null,
        importe: c.importe ?? null,
      })),
    );
  }

  // CANDADO: validar UUIDs relacionados (Pago 2.0 y CfdiRelacionados)
  // Si un complemento de pago apunta a un UUID que NO está en el expediente,
  // o el padre tiene un emisor distinto al receptor del pago, lo registramos
  // como advertencia para que el contador no concilie pagos huérfanos.
  if (parsed.relacionados.length) {
    const uuidsRel = parsed.relacionados.map((r) => r.uuid.toUpperCase());
    const { data: parents } = await supabase
      .from("cfdi_xml")
      .select("uuid, rfc_emisor, rfc_receptor, estatus_sat, total")
      .eq("cliente_id", clienteId)
      .in("uuid", uuidsRel);
    const parentByUuid = new Map(
      (parents ?? []).map((p) => [String(p.uuid).toUpperCase(), p]),
    );

    const relRows: Array<{ cfdi_id: string; uuid_relacionado: string; tipo_relacion: string }> = [];
    const advertencias: string[] = [];
    for (const r of parsed.relacionados) {
      const u = r.uuid.toUpperCase();
      const parent = parentByUuid.get(u);
      if (!parent) {
        advertencias.push(`UUID relacionado ${u} no existe en el expediente.`);
      } else if (parsed.tipoComprobante === "P") {
        // En un complemento de pago, el emisor del pago debe coincidir con el receptor
        // de la factura (quien cobra). Si no, hay riesgo de pago mal aplicado.
        if (parsed.emisor.rfc?.toUpperCase() !== String(parent.rfc_emisor).toUpperCase()) {
          advertencias.push(
            `UUID ${u}: el emisor del pago (${parsed.emisor.rfc}) no coincide con el emisor de la factura padre (${parent.rfc_emisor}).`,
          );
        }
        if (parent.estatus_sat === "cancelado") {
          advertencias.push(`UUID ${u}: la factura padre está cancelada en el SAT.`);
        }
      }
      relRows.push({
        cfdi_id: ins.id,
        uuid_relacionado: u,
        tipo_relacion: r.tipo === "pago" ? "pago" : (r.tipoRelacion ?? "relacion"),
      });
    }
    if (relRows.length) {
      await supabase.from("cfdi_relaciones").insert(relRows);
    }
    if (advertencias.length) {
      console.warn(`[cfdi ${parsed.uuid}] relaciones con advertencias:`, advertencias);
      // Registrar como alerta para el contador
      await supabase.from("audit_logs").insert({
        despacho_id: despachoId,
        accion: "cfdi.relacion.advertencia",
        entidad: "cfdi_xml",
        entidad_id: ins.id,
        payload: { uuid: parsed.uuid, tipo: parsed.tipoComprobante, advertencias },
      });
    }
  }

  // Dispara workflows automáticos suscritos a "xml_uploaded" (no bloquea ante error)
  try {
    const { processTrigger } = await import("@/lib/workflows/engine.functions");
    await processTrigger(supabase, despachoId, "xml_uploaded", clienteId, {
      cfdi_id: ins.id,
      uuid: parsed.uuid,
      total: parsed.total ?? 0,
      tipo: parsed.tipoComprobante ?? "I",
      emisor: parsed.emisor.rfc,
      receptor: parsed.receptor.rfc,
    }, null);
  } catch (e) {
    console.warn("[workflow trigger xml_uploaded] error:", (e as any)?.message);
  }

  return { id: ins.id as string, uuid: parsed.uuid, duplicado: false };
}


export const getExistingCfdiKeys = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!UUID_RE.test(data.cliente_id)) return { uuids: [] as string[], hashes: [] as string[] };
    const { data: rows } = await context.supabase
      .from("cfdi_xml")
      .select("uuid, archivo_hash")
      .eq("cliente_id", data.cliente_id);
    const uuids = (rows ?? []).map((r) => String(r.uuid ?? "").toUpperCase()).filter(Boolean);
    const hashes = (rows ?? []).map((r) => String(r.archivo_hash ?? "")).filter(Boolean);
    return { uuids, hashes };
  });

export const listCfdi = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => ListSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!UUID_RE.test(data.cliente_id)) return { cfdis: [] };
    let q = supabase
      .from("cfdi_xml")
      .select("id, uuid, tipo_cfdi, fecha, rfc_emisor, nombre_emisor, rfc_receptor, nombre_receptor, total, subtotal, iva_trasladado, iva_retenido, metodo_pago, forma_pago, uso_cfdi, estatus_sat, moneda")
      .eq("cliente_id", data.cliente_id)
      .order("fecha", { ascending: false })
      .limit(data.limit);
    if (data.tipo) q = q.eq("tipo_cfdi", data.tipo);
    if (data.estatus) q = q.eq("estatus_sat", data.estatus);
    if (data.metodo_pago) q = q.eq("metodo_pago", data.metodo_pago);
    if (data.forma_pago) q = q.eq("forma_pago", data.forma_pago);
    if (data.desde) q = q.gte("fecha", data.desde);
    if (data.hasta) q = q.lte("fecha", data.hasta);
    if (data.q) {
      // Sanitize: PostgREST's .or() uses , ( ) . as syntax — strip them to prevent filter injection.
      const term = data.q.trim().replace(/[,()\\*]/g, "").replace(/\./g, " ").slice(0, 120);
      if (term) {
        const safe = term.replace(/%/g, "");
        q = q.or(
          `uuid.ilike.%${safe}%,rfc_emisor.ilike.%${safe}%,rfc_receptor.ilike.%${safe}%,nombre_emisor.ilike.%${safe}%,nombre_receptor.ilike.%${safe}%`
        );
      }
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Build set of UUIDs that have a related payment complement (tipo P)
    const paidUuids = new Set<string>();
    const { data: pagos } = await supabase
      .from("cfdi_xml")
      .select("id, cfdi_relaciones(uuid_relacionado)")
      .eq("cliente_id", data.cliente_id)
      .eq("tipo_cfdi", "P");
    (pagos ?? []).forEach((p: { cfdi_relaciones?: Array<{ uuid_relacionado: string }> | null }) => {
      (p.cfdi_relaciones ?? []).forEach((r) => paidUuids.add(r.uuid_relacionado.toUpperCase()));
    });
    const enriched = (rows ?? []).map((r) => ({
      ...r,
      tiene_crp: paidUuids.has(String(r.uuid).toUpperCase()),
    }));
    return { cfdis: enriched };
  });


export const getCfdiStats = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!UUID_RE.test(data.cliente_id)) {
      return { total: 0, ingresos: 0, egresos: 0, ivaTrasladado: 0, ivaAcreditable: 0, cancelados: 0, topProveedores: [] };
    }
    const [{ data: rows, error }, { data: cli }] = await Promise.all([
      supabase
        .from("cfdi_xml")
        .select("tipo_cfdi, total, iva_trasladado, iva_retenido, estatus_sat, fecha, rfc_emisor, rfc_receptor")
        .eq("cliente_id", data.cliente_id),
      supabase.from("clientes").select("rfc").eq("id", data.cliente_id).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);

    const r = rows ?? [];
    const rfcCli = ((cli?.rfc as string | undefined) ?? "").toUpperCase();
    const isEmitido = (x: typeof r[number]) => !!rfcCli && String(x.rfc_emisor ?? "").toUpperCase() === rfcCli;
    const isRecibido = (x: typeof r[number]) => !!rfcCli && String(x.rfc_receptor ?? "").toUpperCase() === rfcCli;

    const sum = (k: "total" | "iva_trasladado" | "iva_retenido", filter?: (x: typeof r[number]) => boolean) =>
      r.filter((x) => filter ? filter(x) : true).reduce((a, b) => a + Number(b[k] ?? 0), 0);

    // Ingresos = CFDI tipo I EMITIDOS por el cliente. Egresos = gastos (tipo I RECIBIDOS) + notas de crédito (tipo E).
    const ingresos = sum("total", (x) => x.tipo_cfdi === "I" && isEmitido(x));
    const egresos = sum("total", (x) => (x.tipo_cfdi === "I" && isRecibido(x)) || x.tipo_cfdi === "E");
    const ivaTrasladado = sum("iva_trasladado", (x) => x.tipo_cfdi === "I" && isEmitido(x));
    const ivaAcreditable = sum("iva_trasladado", (x) => isRecibido(x) && (x.tipo_cfdi === "I" || x.tipo_cfdi === "E"));
    const cancelados = r.filter((x) => x.estatus_sat === "cancelado").length;

    // Top proveedores por monto (cuando el cliente es receptor — gastos)
    const proveedores = new Map<string, number>();
    r.forEach((x) => {
      if (x.tipo_cfdi === "I" && isRecibido(x)) {
        const k = x.rfc_emisor as string;
        proveedores.set(k, (proveedores.get(k) ?? 0) + Number(x.total ?? 0));
      }
    });
    const topProveedores = Array.from(proveedores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([rfc, total]) => ({ rfc, total }));

    return {
      total: r.length,
      ingresos,
      egresos,
      ivaTrasladado,
      ivaAcreditable,
      cancelados,
      topProveedores,
    };
  });

const UUID_MONTH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getCfdiMonthStats = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!UUID_MONTH_RE.test(data.cliente_id)) {
      return { total: 0, emitidos: 0, recibidos: 0, desde: "", hasta: "" };
    }
    const now = new Date();
    const desde = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const hasta = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const { data: cli } = await context.supabase.from("clientes").select("rfc").eq("id", data.cliente_id).maybeSingle();
    const rfc = (cli?.rfc ?? "").toUpperCase();
    const { data: rows, error } = await context.supabase
      .from("cfdi_xml")
      .select("rfc_emisor, rfc_receptor, fecha")
      .eq("cliente_id", data.cliente_id)
      .gte("fecha", desde)
      .lt("fecha", hasta);
    if (error) throw new Error(error.message);
    const r = rows ?? [];
    const emitidos = rfc ? r.filter((x) => String(x.rfc_emisor ?? "").toUpperCase() === rfc).length : 0;
    const recibidos = rfc ? r.filter((x) => String(x.rfc_receptor ?? "").toUpperCase() === rfc).length : 0;
    return { total: r.length, emitidos, recibidos, desde, hasta };
  });



export const getCfdi = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cfdi, error } = await supabase.from("cfdi_xml").select("*").eq("id", data.id).single();
    if (error || !cfdi) throw new Error(error?.message ?? "No encontrado");
    const { data: conceptos } = await supabase
      .from("cfdi_conceptos")
      .select("*")
      .eq("cfdi_id", data.id);
    return { cfdi, conceptos: conceptos ?? [] };
  });

export const deleteCfdi = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cfdi_xml").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- IA ----------

const AnalyzeSchema = z.object({
  cfdi_id: z.string().uuid(),
});

export const analyzeCfdiAI = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => AnalyzeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { error: "IA no configurada", content: "" };

    const { data: cfdi, error } = await context.supabase
      .from("cfdi_xml")
      .select("uuid, tipo_cfdi, fecha, rfc_emisor, nombre_emisor, rfc_receptor, nombre_receptor, subtotal, iva_trasladado, iva_retenido, total, metodo_pago, forma_pago, uso_cfdi, moneda, estatus_sat")
      .eq("id", data.cfdi_id)
      .single();
    if (error || !cfdi) return { error: "CFDI no encontrado", content: "" };

    const prompt = `Eres un contador fiscalista mexicano. Analiza este CFDI 4.0 y entrega:
1) Resumen de 1 línea.
2) Riesgos o inconsistencias detectadas (uso CFDI vs régimen, método/forma de pago, montos).
3) Recomendaciones concretas (3 máx).
Responde en español, conciso, en formato markdown.

Datos:
${JSON.stringify(cfdi, null, 2)}`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Eres ContaClick IA, contador fiscalista mexicano experto. Sé conciso, claro y profesional." },
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
      console.error("analyzeCfdiAI", e);
      return { error: "Error de red.", content: "" };
    }
  });

// re-export risk helpers para uso en cliente
export { analyzeCfdi, maxLevel } from "@/lib/cfdi/risk";
