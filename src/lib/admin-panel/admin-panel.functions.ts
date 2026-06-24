import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APP_ROLES = ["super_admin", "despacho", "contador", "auxiliar", "cliente_final", "colaborador"] as const;
type AppRole = (typeof APP_ROLES)[number];

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Solo el super administrador puede usar este panel.");
}

export type AdminUserRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  telefono: string | null;
  activo: boolean;
  created_at: string;
  despacho_id: string | null;
  despacho_nombre: string | null;
  despacho_estado: string | null;
  trial_ends_at: string | null;
  plan_clave: string | null;
  plan_nombre: string | null;
  plan_precio_mxn: number | null;
  suscripcion_estatus: string | null;
  current_period_end: string | null;
  ultimo_pago_at: string | null;
  ultimo_pago_monto: number | null;
  total_pagado_mxn: number;
  roles: AppRole[];
  ia_calls_mes: number;
  ia_tokens_mes: number;
  ia_costo_usd_mes: number;
  rfc_activos: number;
  rfc_limite: number;
  ia_msgs_limite: number;
  ia_tokens_limite: number;
};

/** Lista todos los usuarios con su despacho, plan, pagos y consumo IA del mes. */
export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profilesRes, despachosRes, subsRes, pagosRes, iaRes, rolesRes, membRes, planesRes, authRes, clientesRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("*"),
      supabaseAdmin.from("despachos").select("*"),
      supabaseAdmin.from("suscripciones").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("pagos").select("*").order("pagado_at", { ascending: false }),
      supabaseAdmin.from("ia_historial").select("user_id, despacho_id, tokens_in, tokens_out, costo_usd, created_at"),
      supabaseAdmin.from("user_roles").select("*"),
      supabaseAdmin.from("user_memberships").select("*"),
      supabaseAdmin.from("planes").select("*"),
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
      supabaseAdmin.from("clientes").select("despacho_id, tipo_relacion"),
    ]);

    if (profilesRes.error) throw new Error(profilesRes.error.message);

    const despachos = despachosRes.data ?? [];
    const subs = subsRes.data ?? [];
    const pagos = pagosRes.data ?? [];
    const ia = iaRes.data ?? [];
    const roles = rolesRes.data ?? [];
    const memberships = membRes.data ?? [];
    const planes = planesRes.data ?? [];
    const authUsers = authRes.data?.users ?? [];
    const clientes = clientesRes.data ?? [];

    const planById = new Map(planes.map((p) => [p.id, p]));
    const despachoById = new Map(despachos.map((d) => [d.id, d]));
    const subByDespacho = new Map<string, any>();
    for (const s of subs) if (!subByDespacho.has(s.despacho_id)) subByDespacho.set(s.despacho_id, s);

    const rfcsByDespacho = new Map<string, number>();
    for (const c of clientes as any[]) {
      if (!c.despacho_id || c.tipo_relacion !== "cliente") continue;
      rfcsByDespacho.set(c.despacho_id, (rfcsByDespacho.get(c.despacho_id) ?? 0) + 1);
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const rows: AdminUserRow[] = (profilesRes.data ?? []).map((p: any) => {
      // Despacho prioridad: owner > membership
      const owned = despachos.find((d: any) => d.owner_user_id === p.id);
      const memb = memberships.find((m: any) => m.user_id === p.id && m.estado === "activo");
      const despacho = owned || (memb ? despachoById.get(memb.despacho_id) : null) || null;
      const sub = despacho ? subByDespacho.get(despacho.id) : null;
      const plan = sub ? planById.get(sub.plan_id) : despacho?.plan_id ? planById.get(despacho.plan_id) : null;

      const pagosDelDespacho = despacho ? pagos.filter((pg: any) => pg.despacho_id === despacho.id) : [];
      const ultimoPago = pagosDelDespacho[0] ?? null;
      const totalPagado = pagosDelDespacho.reduce((s: number, pg: any) => s + Number(pg.monto_mxn ?? 0), 0);

      const userRoles = roles
        .filter((r: any) => r.user_id === p.id)
        .map((r: any) => r.role as AppRole);

      const iaMes = ia.filter((i: any) => i.user_id === p.id && new Date(i.created_at) >= startOfMonth);
      const iaCalls = iaMes.length;
      const iaTokens = iaMes.reduce((s: number, i: any) => s + (i.tokens_in ?? 0) + (i.tokens_out ?? 0), 0);
      const iaCosto = iaMes.reduce((s: number, i: any) => s + Number(i.costo_usd ?? 0), 0);

      const authUser = authUsers.find((u: any) => u.id === p.id);

      return {
        user_id: p.id,
        email: p.email ?? authUser?.email ?? null,
        full_name: p.full_name,
        telefono: p.telefono ?? authUser?.phone ?? null,
        activo: p.activo ?? true,
        created_at: p.created_at,
        despacho_id: despacho?.id ?? null,
        despacho_nombre: despacho?.nombre ?? null,
        despacho_estado: despacho?.estado ?? null,
        trial_ends_at: despacho?.trial_ends_at ?? null,
        plan_clave: plan?.clave ?? null,
        plan_nombre: plan?.nombre ?? null,
        plan_precio_mxn: plan ? Number(plan.precio_mxn) : null,
        suscripcion_estatus: sub?.estatus ?? null,
        current_period_end: sub?.current_period_end ?? null,
        ultimo_pago_at: ultimoPago?.pagado_at ?? null,
        ultimo_pago_monto: ultimoPago ? Number(ultimoPago.monto_mxn) : null,
        total_pagado_mxn: totalPagado,
        roles: Array.from(new Set(userRoles)),
        ia_calls_mes: iaCalls,
        ia_tokens_mes: iaTokens,
        ia_costo_usd_mes: Number(iaCosto.toFixed(4)),
      };
    });

    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    const totalIaUsd = rows.reduce((s, r) => s + r.ia_costo_usd_mes, 0);
    const totalIngresosMes = rows
      .filter((r) => r.ultimo_pago_at && new Date(r.ultimo_pago_at) >= startOfMonth)
      .reduce((s, r) => s + (r.ultimo_pago_monto ?? 0), 0);

    return {
      rows,
      planes: planes.map((p: any) => ({ id: p.id, clave: p.clave, nombre: p.nombre, precio_mxn: Number(p.precio_mxn) })),
      stats: {
        total_usuarios: rows.length,
        activos: rows.filter((r) => r.activo).length,
        pagados: rows.filter((r) => r.suscripcion_estatus === "activa" || (r.total_pagado_mxn > 0)).length,
        trial: rows.filter((r) => r.despacho_estado === "trial").length,
        ingresos_mes_mxn: totalIngresosMes,
        ia_costo_total_usd_mes: Number(totalIaUsd.toFixed(4)),
      },
    };
  });

export const adminSetActivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid(), activo: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ activo: data.activo }).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    // También bloqueamos en auth (banear) si se desactiva.
    await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.activo ? "none" : "876000h",
    } as any);
    return { ok: true };
  });

export const adminSetPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ despacho_id: z.string().uuid(), plan_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: dErr } = await supabaseAdmin
      .from("despachos")
      .update({ plan_id: data.plan_id, estado: "activa" })
      .eq("id", data.despacho_id);
    if (dErr) throw new Error(dErr.message);

    const { data: existing } = await supabaseAdmin
      .from("suscripciones")
      .select("id")
      .eq("despacho_id", data.despacho_id)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("suscripciones")
        .update({ plan_id: data.plan_id, estatus: "activa", proveedor: "manual" })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("suscripciones").insert({
        despacho_id: data.despacho_id,
        plan_id: data.plan_id,
        estatus: "activa",
        proveedor: "manual",
      });
    }
    return { ok: true };
  });

export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        despacho_id: z.string().uuid().nullable().optional(),
        role: z.enum(APP_ROLES),
        action: z.enum(["add", "remove"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.action === "add") {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: data.user_id, role: data.role, despacho_id: data.despacho_id ?? null },
          { onConflict: "user_id,role,despacho_id,cliente_id" },
        );
      if (error) throw new Error(error.message);
    } else {
      let q = supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", data.role);
      if (data.despacho_id) q = q.eq("despacho_id", data.despacho_id);
      const { error } = await q;
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminRegisterPago = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        despacho_id: z.string().uuid(),
        monto_mxn: z.number().positive(),
        nota: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("suscripciones")
      .select("id")
      .eq("despacho_id", data.despacho_id)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("pagos").insert({
      despacho_id: data.despacho_id,
      suscripcion_id: sub?.id ?? null,
      monto_mxn: data.monto_mxn,
      estatus: "pagado",
      proveedor: "manual",
      pagado_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Permite que el primer usuario reclame el rol super_admin si nadie lo tiene aún. */
export const claimSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: cErr } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) > 0) throw new Error("Ya existe un super administrador.");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "super_admin", despacho_id: null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const isSuperAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "super_admin")
      .limit(1);
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");
    return { isSuperAdmin: (data?.length ?? 0) > 0, anySuperAdmin: (count ?? 0) > 0 };
  });
