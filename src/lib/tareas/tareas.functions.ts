import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";

export const KANBAN_ESTADOS = [
  "pendiente",
  "en_proceso",
  "esperando_cliente",
  "en_revision",
  "finalizado",
  "cancelado",
] as const;
export type KanbanEstado = (typeof KANBAN_ESTADOS)[number];

export const TIPOS_TAREA = [
  "declaracion",
  "conciliacion",
  "tramite_sat",
  "requerimiento",
  "nomina",
  "devolucion",
  "defensa",
  "cobranza",
  "juridico",
  "administrativo",
  "otro",
] as const;
export type TipoTarea = (typeof TIPOS_TAREA)[number];

export const ORIGENES = ["manual", "calendario", "buzon", "riesgo", "cfdi", "auditor", "portal"] as const;
export const PRIORIDADES = ["baja", "media", "alta", "critica"] as const;

export type TareaRow = {
  id: string;
  despacho_id: string;
  cliente_id: string | null;
  cliente_nombre?: string | null;
  cliente_rfc?: string | null;
  titulo: string;
  descripcion: string | null;
  tipo: string | null;
  origen: string | null;
  origen_id: string | null;
  estatus: string;
  kanban_estado: string;
  prioridad: string;
  asignado_a: string | null;
  asignado_nombre?: string | null;
  due_date: string | null;
  tiempo_invertido_min: number;
  requires_evidence: boolean;
  evidencia_url: string | null;
  completada_at: string | null;
  completada_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

async function logBitacora(
  supabase: any,
  args: { tareaId: string; despachoId: string; userId: string | null; evento: string; detalle?: Record<string, unknown> },
) {
  await supabase.from("tarea_bitacora").insert({
    tarea_id: args.tareaId,
    despacho_id: args.despachoId,
    user_id: args.userId,
    evento: args.evento,
    detalle: args.detalle ?? null,
  });
}

async function enrichTareas(supabase: any, rows: any[]): Promise<TareaRow[]> {
  if (rows.length === 0) return [];
  const clienteIds = Array.from(new Set(rows.map((r) => r.cliente_id).filter(Boolean))) as string[];
  const userIds = Array.from(new Set(rows.map((r) => r.asignado_a).filter(Boolean))) as string[];

  const [{ data: clientes }, { data: profs }] = await Promise.all([
    clienteIds.length
      ? supabase.from("clientes").select("id, razon_social, rfc_principal").in("id", clienteIds)
      : Promise.resolve({ data: [] as any[] }),
    userIds.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const cMap = new Map((clientes ?? []).map((c: any) => [c.id, c]));
  const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r: any) => {
    const c = r.cliente_id ? cMap.get(r.cliente_id) : null;
    const p = r.asignado_a ? pMap.get(r.asignado_a) : null;
    // marca vencida si due_date pasada y no finalizada
    let estatus = r.estatus;
    if (
      r.kanban_estado !== "finalizado" &&
      r.kanban_estado !== "cancelado" &&
      r.due_date &&
      r.due_date < today
    ) {
      estatus = "vencida";
    }
    return {
      ...r,
      estatus,
      cliente_nombre: c?.razon_social ?? null,
      cliente_rfc: c?.rfc_principal ?? null,
      asignado_nombre: p?.full_name ?? p?.email ?? null,
    } as TareaRow;
  });
}

// -------------------- LISTAR --------------------

export const listTareas = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clienteId: z.string().uuid().optional(),
        asignadoA: z.string().uuid().optional(),
        kanbanEstado: z.string().optional(),
        prioridad: z.string().optional(),
        origen: z.string().optional(),
        search: z.string().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    let q = supabase.from("tareas").select("*").eq("despacho_id", despachoId).order("due_date", { ascending: true, nullsFirst: false });
    if (data.clienteId) q = q.eq("cliente_id", data.clienteId);
    if (data.asignadoA) q = q.eq("asignado_a", data.asignadoA);
    if (data.kanbanEstado) q = q.eq("kanban_estado", data.kanbanEstado);
    if (data.prioridad) q = q.eq("prioridad", data.prioridad);
    if (data.origen) q = q.eq("origen", data.origen);
    if (data.search) q = q.ilike("titulo", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return await enrichTareas(supabase, rows ?? []);
  });

// -------------------- KPIs + productividad --------------------

export const getTareasDashboard = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    const { data: rows } = await supabase
      .from("tareas")
      .select("id, kanban_estado, asignado_a, cliente_id, due_date, prioridad, completada_at, created_at")
      .eq("despacho_id", despachoId);
    const list = (rows ?? []) as any[];
    const today = new Date().toISOString().slice(0, 10);
    const in7 = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    const activas = list.filter((t) => t.kanban_estado !== "finalizado" && t.kanban_estado !== "cancelado");
    const kpis = {
      total: list.length,
      pendientes: list.filter((t) => t.kanban_estado === "pendiente").length,
      en_proceso: list.filter((t) => t.kanban_estado === "en_proceso").length,
      esperando: list.filter((t) => t.kanban_estado === "esperando_cliente").length,
      revision: list.filter((t) => t.kanban_estado === "en_revision").length,
      finalizadas: list.filter((t) => t.kanban_estado === "finalizado").length,
      vencidas: activas.filter((t) => t.due_date && t.due_date < today).length,
      sin_asignar: activas.filter((t) => !t.asignado_a).length,
      proximas: activas.filter((t) => t.due_date && t.due_date >= today && t.due_date <= in7).length,
    };

    // Carga por colaborador
    const userIds = Array.from(new Set(activas.map((t) => t.asignado_a).filter(Boolean))) as string[];
    const { data: profs } = userIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : { data: [] as any[] };
    const pMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || p.email || "Usuario"]));
    const carga: Record<string, { user_id: string; nombre: string; activas: number; vencidas: number; finalizadas: number; tasa: number }> = {};
    for (const uid of userIds) {
      const mine = list.filter((t) => t.asignado_a === uid);
      const fin = mine.filter((t) => t.kanban_estado === "finalizado").length;
      const venc = mine.filter((t) => t.kanban_estado !== "finalizado" && t.kanban_estado !== "cancelado" && t.due_date && t.due_date < today).length;
      const act = mine.filter((t) => t.kanban_estado !== "finalizado" && t.kanban_estado !== "cancelado").length;
      const total = mine.length || 1;
      carga[uid] = {
        user_id: uid,
        nombre: pMap.get(uid) ?? "Usuario",
        activas: act,
        vencidas: venc,
        finalizadas: fin,
        tasa: Math.round((fin / total) * 100),
      };
    }

    // Clientes con más tareas abiertas
    const clienteIds = Array.from(new Set(activas.map((t) => t.cliente_id).filter(Boolean))) as string[];
    const { data: clis } = clienteIds.length
      ? await supabase.from("clientes").select("id, razon_social, rfc_principal").in("id", clienteIds)
      : { data: [] as any[] };
    const cMap = new Map((clis ?? []).map((c: any) => [c.id, c]));
    const porCliente: { cliente_id: string; nombre: string; rfc: string | null; abiertas: number }[] = [];
    for (const cid of clienteIds) {
      const ab = activas.filter((t) => t.cliente_id === cid).length;
      const c = cMap.get(cid) as any;
      porCliente.push({ cliente_id: cid, nombre: c?.razon_social ?? "—", rfc: c?.rfc_principal ?? null, abiertas: ab });
    }
    porCliente.sort((a, b) => b.abiertas - a.abiertas);

    return {
      kpis,
      carga: Object.values(carga).sort((a, b) => b.activas - a.activas),
      clientesTop: porCliente.slice(0, 5),
    };
  });

// -------------------- CREAR / ACTUALIZAR --------------------

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  titulo: z.string().trim().min(1).max(200),
  descripcion: z.string().max(4000).optional().nullable(),
  cliente_id: z.string().uuid().optional().nullable(),
  tipo: z.enum(TIPOS_TAREA).optional().nullable(),
  prioridad: z.enum(PRIORIDADES).default("media"),
  asignado_a: z.string().uuid().optional().nullable(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  requires_evidence: z.boolean().optional(),
  origen: z.enum(ORIGENES).optional(),
  origen_id: z.string().optional().nullable(),
});

export const upsertTarea = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    const payload: any = {
      despacho_id: despachoId,
      titulo: data.titulo,
      descripcion: data.descripcion ?? null,
      cliente_id: data.cliente_id ?? null,
      tipo: data.tipo ?? null,
      prioridad: data.prioridad,
      asignado_a: data.asignado_a ?? null,
      due_date: data.due_date ?? null,
      requires_evidence: data.requires_evidence ?? false,
      origen: data.origen ?? "manual",
      origen_id: data.origen_id ?? null,
    };
    if (data.id) {
      const { error } = await supabase.from("tareas").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await logBitacora(supabase, { tareaId: data.id, despachoId, userId, evento: "actualizada", detalle: payload });
      return { ok: true, id: data.id };
    }
    payload.estatus = "pendiente";
    payload.kanban_estado = "pendiente";
    payload.created_by = userId;
    const { data: row, error } = await supabase.from("tareas").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    await logBitacora(supabase, { tareaId: (row as any).id, despachoId, userId, evento: "creada", detalle: { titulo: data.titulo } });
    return { ok: true, id: (row as any).id };
  });

// -------------------- CAMBIAR ESTADO KANBAN --------------------

export const setKanbanEstado = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), estado: z.enum(KANBAN_ESTADOS) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prev } = await supabase
      .from("tareas")
      .select("despacho_id, kanban_estado, requires_evidence, evidencia_url, origen, tipo")
      .eq("id", data.id)
      .maybeSingle();
    if (!prev) throw new Error("Tarea no encontrada");
    // Regla: tareas fiscales (tipo declaracion/tramite_sat/requerimiento) no se cierran sin evidencia si así se marcó
    if (
      data.estado === "finalizado" &&
      (prev as any).requires_evidence &&
      !(prev as any).evidencia_url
    ) {
      throw new Error("Esta tarea requiere evidencia antes de finalizarse.");
    }
    const update: any = { kanban_estado: data.estado };
    if (data.estado === "finalizado") {
      update.completada_at = new Date().toISOString();
      update.completada_by = userId;
      update.estatus = "completada";
    } else if (data.estado === "cancelado") {
      update.estatus = "cancelada";
    } else {
      update.completada_at = null;
      update.completada_by = null;
      update.estatus = data.estado === "pendiente" ? "pendiente" : "en_proceso";
    }
    const { error } = await supabase.from("tareas").update(update).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logBitacora(supabase, {
      tareaId: data.id,
      despachoId: (prev as any).despacho_id,
      userId,
      evento: "cambio_estado",
      detalle: { de: (prev as any).kanban_estado, a: data.estado },
    });
    return { ok: true };
  });

// -------------------- ELIMINAR --------------------

export const eliminarTarea = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("tareas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- TIEMPO --------------------

export const sumarTiempo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), minutos: z.number().int().min(1).max(8 * 60) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: t } = await supabase
      .from("tareas")
      .select("despacho_id, tiempo_invertido_min")
      .eq("id", data.id)
      .maybeSingle();
    if (!t) throw new Error("Tarea no encontrada");
    const nuevo = ((t as any).tiempo_invertido_min ?? 0) + data.minutos;
    const { error } = await supabase.from("tareas").update({ tiempo_invertido_min: nuevo }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logBitacora(supabase, {
      tareaId: data.id,
      despachoId: (t as any).despacho_id,
      userId,
      evento: "tiempo_registrado",
      detalle: { minutos: data.minutos, acumulado: nuevo },
    });
    return { ok: true, total: nuevo };
  });

// -------------------- COMENTARIOS / BITACORA --------------------

export const getTareaDetalle = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tarea } = await supabase.from("tareas").select("*").eq("id", data.id).maybeSingle();
    if (!tarea) throw new Error("Tarea no encontrada");
    const [enriched] = await enrichTareas(supabase, [tarea]);
    const [{ data: coms }, { data: bit }] = await Promise.all([
      supabase
        .from("tarea_comentarios")
        .select("id, user_id, contenido, created_at")
        .eq("tarea_id", data.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("tarea_bitacora")
        .select("id, user_id, evento, detalle, created_at")
        .eq("tarea_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const userIds = Array.from(
      new Set([
        ...(coms ?? []).map((c: any) => c.user_id),
        ...(bit ?? []).map((b: any) => b.user_id).filter(Boolean),
      ]),
    );
    const { data: profs } = userIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : { data: [] as any[] };
    const pMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || p.email || "Usuario"]));
    return {
      tarea: enriched,
      comentarios: (coms ?? []).map((c: any) => ({ ...c, autor: pMap.get(c.user_id) ?? "Usuario" })),
      bitacora: (bit ?? []).map((b: any) => ({ ...b, autor: b.user_id ? pMap.get(b.user_id) ?? "Usuario" : "Sistema" })),
    };
  });

export const addComentario = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tareaId: z.string().uuid(), contenido: z.string().trim().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: t } = await supabase.from("tareas").select("despacho_id").eq("id", data.tareaId).maybeSingle();
    if (!t) throw new Error("Tarea no encontrada");
    const { error } = await supabase.from("tarea_comentarios").insert({
      tarea_id: data.tareaId,
      despacho_id: (t as any).despacho_id,
      user_id: userId,
      contenido: data.contenido,
    });
    if (error) throw new Error(error.message);
    await logBitacora(supabase, {
      tareaId: data.tareaId,
      despachoId: (t as any).despacho_id,
      userId,
      evento: "comentario",
      detalle: { contenido: data.contenido.slice(0, 200) },
    });
    return { ok: true };
  });

// -------------------- AUTOGENERACIÓN DESDE CALENDARIO --------------------

export const generarDesdeCalendario = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clienteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    // Obligaciones pendientes del cliente
    const { data: rfcs } = await supabase.from("rfcs").select("id").eq("cliente_id", data.clienteId);
    const rfcIds = (rfcs ?? []).map((r: any) => r.id);
    if (rfcIds.length === 0) return { inserted: 0 };
    const { data: obs } = await supabase
      .from("obligaciones_fiscales")
      .select("id, nombre, clave, tipo, proximo_vencimiento, periodo")
      .in("rfc_id", rfcIds)
      .neq("estatus", "presentada");
    // Tareas existentes con origen calendario para evitar duplicar
    const { data: existentes } = await supabase
      .from("tareas")
      .select("origen_id")
      .eq("despacho_id", despachoId)
      .eq("origen", "calendario")
      .eq("cliente_id", data.clienteId);
    const ya = new Set((existentes ?? []).map((t: any) => t.origen_id));
    const inserts = (obs ?? [])
      .filter((o: any) => !ya.has(o.id))
      .map((o: any) => ({
        despacho_id: despachoId,
        cliente_id: data.clienteId,
        titulo: `${o.nombre ?? o.clave}${o.periodo ? ` · ${o.periodo}` : ""}`,
        descripcion: `Obligación fiscal generada desde Calendario Fiscal.`,
        tipo: o.tipo === "informativa" ? "tramite_sat" : "declaracion",
        prioridad: "alta",
        kanban_estado: "pendiente",
        estatus: "pendiente",
        origen: "calendario",
        origen_id: o.id,
        due_date: o.proximo_vencimiento,
        requires_evidence: true,
        created_by: userId,
      }));
    if (inserts.length === 0) return { inserted: 0 };
    const { error } = await supabase.from("tareas").insert(inserts);
    if (error) throw new Error(error.message);
    return { inserted: inserts.length };
  });

// -------------------- EQUIPO (responsables) --------------------

export const listEquipo = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    const { data: members } = await supabase
      .from("user_memberships")
      .select("user_id")
      .eq("despacho_id", despachoId)
      .eq("estado", "activo");
    const ids = (members ?? []).map((m: any) => m.user_id);
    if (ids.length === 0) return [] as { id: string; name: string }[];
    const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
    return (profs ?? []).map((p: any) => ({ id: p.id, name: p.full_name || p.email || "Usuario" }));
  });

// -------------------- CLIENTES DEL DESPACHO (selector) --------------------

export const listClientesDespacho = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    const { data } = await supabase
      .from("clientes")
      .select("id, razon_social, rfc_principal")
      .eq("despacho_id", despachoId)
      .order("razon_social");
    return (data ?? []) as { id: string; razon_social: string; rfc_principal: string | null }[];
  });
