import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

export type PortalConfig = {
  ver_dashboard: boolean;
  ver_cfdi: boolean;
  ver_cxc: boolean;
  ver_cxp: boolean;
  ver_impuestos: boolean;
  ver_obligaciones: boolean;
  ver_reportes: boolean;
  ver_mensajes: boolean;
  puede_subir_docs: boolean;
};

const DEFAULT_CONFIG: PortalConfig = {
  ver_dashboard: true,
  ver_cfdi: true,
  ver_cxc: true,
  ver_cxp: true,
  ver_impuestos: true,
  ver_obligaciones: true,
  ver_reportes: true,
  ver_mensajes: true,
  puede_subir_docs: true,
};

async function resolveClienteFinalContext(supabase: any, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("despacho_id, cliente_id")
    .eq("user_id", userId)
    .eq("role", "cliente_final")
    .not("cliente_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (!role?.cliente_id) return null;

  const { data: cli } = await supabaseAdmin
    .from("clientes")
    .select("id, rfc, razon_social, regimen_fiscal, tipo_persona, despacho_id, semaforo, estado_mes")
    .eq("id", role.cliente_id)
    .maybeSingle();
  if (!cli) return null;
  const despachoId = role.despacho_id ?? cli.despacho_id;

  const { data: des } = await supabaseAdmin
    .from("despachos")
    .select("id, nombre")
    .eq("id", despachoId as string)
    .maybeSingle();

  const { data: cfg } = await supabaseAdmin
    .from("cliente_portal_config")
    .select("ver_dashboard, ver_cfdi, ver_cxc, ver_cxp, ver_impuestos, ver_obligaciones, ver_reportes, ver_mensajes, puede_subir_docs")
    .eq("cliente_id", cli.id)
    .maybeSingle();

  const config: PortalConfig = { ...DEFAULT_CONFIG, ...(cfg ?? {}) };
  return { cliente: cli, despacho: des, config };
}

export const getPortalContext = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveClienteFinalContext(context.supabase, context.userId);
    if (!ctx) return { isClient: false as const };
    return {
      isClient: true as const,
      cliente: ctx.cliente,
      despacho: ctx.despacho ?? null,
      config: ctx.config,
    };
  });

export const getPortalDashboard = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveClienteFinalContext(context.supabase, context.userId);
    if (!ctx) throw new Error("Acceso no autorizado");
    const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
    const clienteId = ctx.cliente.id;
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const in30 = new Date(now.getTime() + 30 * 86400_000).toISOString().slice(0, 10);

    // Obligaciones via rfcs
    const { data: rfcs } = await supabase.from("rfcs").select("id").eq("cliente_id", clienteId);
    const rfcIds = (rfcs ?? []).map((r: any) => r.id as string);

    const [cfdiRes, obligRes, cxcRes, cxpRes, alertasRes] = await Promise.all([
      supabase.from("cfdi_xml").select("id, total, tipo_comprobante, fecha, emisor_rfc")
        .eq("cliente_id", clienteId).gte("fecha", firstDay),
      rfcIds.length
        ? supabase.from("obligaciones_fiscales").select("clave, periodicidad, proximo_vencimiento, estatus")
          .in("rfc_id", rfcIds).neq("estatus", "presentada")
          .lte("proximo_vencimiento", in30).order("proximo_vencimiento")
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("cxc").select("monto, estado").eq("cliente_id", clienteId).eq("estado", "pendiente"),
      supabase.from("cxp").select("monto, estado").eq("cliente_id", clienteId).eq("estado", "pendiente"),
      supabase.from("alertas").select("id, titulo, nivel, descripcion, created_at")
        .eq("cliente_id", clienteId).eq("estatus", "abierta").order("created_at", { ascending: false }).limit(5),
    ]);

    const cfdis = (cfdiRes.data ?? []) as any[];
    const emitidos = cfdis.filter((c) => c.emisor_rfc === ctx.cliente.rfc);
    const recibidos = cfdis.filter((c) => c.emisor_rfc !== ctx.cliente.rfc);
    const ingresos = emitidos.reduce((a, c) => a + Number(c.total || 0), 0);
    const egresos = recibidos.reduce((a, c) => a + Number(c.total || 0), 0);
    const cxcTotal = ((cxcRes.data ?? []) as any[]).reduce((a, r) => a + Number(r.monto || 0), 0);
    const cxpTotal = ((cxpRes.data ?? []) as any[]).reduce((a, r) => a + Number(r.monto || 0), 0);

    return {
      cliente: ctx.cliente,
      despacho: ctx.despacho ?? null,
      config: ctx.config,
      mes: {
        cfdis_emitidos: emitidos.length,
        cfdis_recibidos: recibidos.length,
        ingresos,
        egresos,
        utilidad: ingresos - egresos,
      },
      cxc_total: cxcTotal,
      cxp_total: cxpTotal,
      proximas_obligaciones: (obligRes.data ?? []) as any[],
      alertas: (alertasRes.data ?? []) as any[],
    };
  });

export const getPortalCFDI = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    tipo: z.enum(["todos", "emitidos", "recibidos"]).default("todos"),
    mes: z.string().optional().nullable(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = await resolveClienteFinalContext(context.supabase, context.userId);
    if (!ctx) throw new Error("Acceso no autorizado");
    if (!ctx.config.ver_cfdi) throw new Error("Tu contador deshabilitó este módulo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin.from("cfdi_xml")
      .select("id, uuid, serie, folio, fecha, tipo_comprobante, total, subtotal, moneda, emisor_rfc, emisor_nombre, receptor_rfc, receptor_nombre, estatus_sat")
      .eq("cliente_id", ctx.cliente.id)
      .order("fecha", { ascending: false })
      .limit(500);
    if (data.mes) {
      const [y, m] = data.mes.split("-").map(Number);
      const from = new Date(y, m - 1, 1).toISOString();
      const to = new Date(y, m, 1).toISOString();
      q = q.gte("fecha", from).lt("fecha", to);
    }
    const { data: rows } = await q;
    let filtered = (rows ?? []) as any[];
    if (data.tipo === "emitidos") {
      filtered = filtered.filter((r) => r.emisor_rfc === ctx.cliente.rfc);
    } else if (data.tipo === "recibidos") {
      filtered = filtered.filter((r) => r.receptor_rfc === ctx.cliente.rfc);
    }
    return { cfdis: filtered, cliente: ctx.cliente };
  });

export const getPortalEstadoCuenta = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveClienteFinalContext(context.supabase, context.userId);
    if (!ctx) throw new Error("Acceso no autorizado");
    const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
    const [cxcRes, cxpRes] = await Promise.all([
      ctx.config.ver_cxc
        ? supabase.from("cxc").select("id, contraparte, concepto, monto, moneda, fecha_emision, fecha_vencimiento, estado")
          .eq("cliente_id", ctx.cliente.id).order("fecha_vencimiento", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      ctx.config.ver_cxp
        ? supabase.from("cxp").select("id, contraparte, concepto, monto, moneda, fecha_emision, fecha_vencimiento, estado")
          .eq("cliente_id", ctx.cliente.id).order("fecha_vencimiento", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);
    return {
      cliente: ctx.cliente,
      config: ctx.config,
      cxc: (cxcRes.data ?? []) as any[],
      cxp: (cxpRes.data ?? []) as any[],
    };
  });

export const getPortalImpuestos = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveClienteFinalContext(context.supabase, context.userId);
    if (!ctx) throw new Error("Acceso no autorizado");
    if (!ctx.config.ver_impuestos && !ctx.config.ver_obligaciones) throw new Error("Tu contador deshabilitó este módulo");
    const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
    const { data: rfcs } = await supabase.from("rfcs").select("id, rfc").eq("cliente_id", ctx.cliente.id);
    const rfcIds = (rfcs ?? []).map((r: any) => r.id as string);
    if (rfcIds.length === 0) return { cliente: ctx.cliente, config: ctx.config, obligaciones: [] as any[] };
    const { data: oblig } = await supabase
      .from("obligaciones_fiscales")
      .select("id, clave, periodicidad, proximo_vencimiento, estatus")
      .in("rfc_id", rfcIds)
      .order("proximo_vencimiento", { nullsFirst: false });
    return { cliente: ctx.cliente, config: ctx.config, obligaciones: (oblig ?? []) as any[] };
  });

export const getPortalReportes = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveClienteFinalContext(context.supabase, context.userId);
    if (!ctx) throw new Error("Acceso no autorizado");
    if (!ctx.config.ver_reportes) throw new Error("Tu contador deshabilitó este módulo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reps } = await supabaseAdmin
      .from("reportes")
      .select("id, tipo, created_at, archivo_path")
      .eq("cliente_id", ctx.cliente.id)
      .order("created_at", { ascending: false })
      .limit(100);
    return { cliente: ctx.cliente, reportes: (reps ?? []) as any[] };
  });

export const getPortalMensajes = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await resolveClienteFinalContext(context.supabase, context.userId);
    if (!ctx) throw new Error("Acceso no autorizado");
    if (!ctx.config.ver_mensajes) throw new Error("Tu contador deshabilitó este módulo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: msgs } = await supabaseAdmin
      .from("mensajes")
      .select("id, asunto, cuerpo, canal, estatus, created_at, enviado_at")
      .eq("cliente_id", ctx.cliente.id)
      .order("created_at", { ascending: false })
      .limit(200);
    return { cliente: ctx.cliente, mensajes: (msgs ?? []) as any[] };
  });

// Admin: read & update portal config for a cliente
export const getPortalConfig = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: cfg } = await context.supabase
      .from("cliente_portal_config")
      .select("ver_dashboard, ver_cfdi, ver_cxc, ver_cxp, ver_impuestos, ver_obligaciones, ver_reportes, ver_mensajes, puede_subir_docs")
      .eq("cliente_id", data.cliente_id)
      .maybeSingle();
    return { config: (cfg ?? DEFAULT_CONFIG) as PortalConfig };
  });

export const updatePortalConfig = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    cliente_id: z.string().uuid(),
    config: z.object({
      ver_dashboard: z.boolean(),
      ver_cfdi: z.boolean(),
      ver_cxc: z.boolean(),
      ver_cxp: z.boolean(),
      ver_impuestos: z.boolean(),
      ver_obligaciones: z.boolean(),
      ver_reportes: z.boolean(),
      ver_mensajes: z.boolean(),
      puede_subir_docs: z.boolean(),
    }),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: cli } = await context.supabase
      .from("clientes").select("despacho_id").eq("id", data.cliente_id).maybeSingle();
    if (!cli?.despacho_id) throw new Error("Expediente no encontrado");
    const { error } = await context.supabase
      .from("cliente_portal_config")
      .upsert({ cliente_id: data.cliente_id, despacho_id: cli.despacho_id, ...data.config }, { onConflict: "cliente_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
