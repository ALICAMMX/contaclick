import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";
import { plantillasPorRegimen, fechaVencimiento } from "./catalogo";
import { assertClienteScope, assertRecordScope } from "@/lib/despacho/scope";

export type ObligacionRow = {
  id: string;
  cliente_id: string | null;
  rfc_id: string;
  clave: string;
  nombre: string | null;
  tipo: string | null;
  periodicidad: string;
  proximo_vencimiento: string | null;
  periodo: string | null;
  estatus: string;
  responsable_user_id: string | null;
  notas: string | null;
  alert_days_before: number;
  alert_channels: string[];
  completada_at: string | null;
  completada_by: string | null;
};

export type CalendarioResponse = {
  obligaciones: ObligacionRow[];
  resumen: {
    total: number;
    vencidas: number;
    proximas: number; // <=5 días
    cumplidas: number;
    sin_responsable: number;
  };
  proximas: ObligacionRow[]; // top 3 pendientes
};

const NEAR_DAYS = 5;
const todayISO = () => new Date().toISOString().slice(0, 10);

// ------------------- LISTAR -------------------

export const listObligacionesCliente = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clienteId: z.string().uuid(),
      desde: z.string().optional(),
      hasta: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CalendarioResponse> => {
    const { supabase } = context;
    await assertClienteScope(supabase as any, context.userId, data.clienteId);

    const { data: rfcs } = await supabase
      .from("rfcs")
      .select("id")
      .eq("cliente_id", data.clienteId);
    const rfcIds = (rfcs ?? []).map((r: any) => r.id);
    if (rfcIds.length === 0) {
      return { obligaciones: [], resumen: { total: 0, vencidas: 0, proximas: 0, cumplidas: 0, sin_responsable: 0 }, proximas: [] };
    }

    let q = supabase
      .from("obligaciones_fiscales")
      .select("id, cliente_id, rfc_id, clave, nombre, tipo, periodicidad, proximo_vencimiento, periodo, estatus, responsable_user_id, notas, alert_days_before, alert_channels, completada_at, completada_by")
      .in("rfc_id", rfcIds)
      .order("proximo_vencimiento", { ascending: true });
    if (data.desde) q = q.gte("proximo_vencimiento", data.desde);
    if (data.hasta) q = q.lte("proximo_vencimiento", data.hasta);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const today = todayISO();
    const in5 = new Date(Date.now() + NEAR_DAYS * 86400_000).toISOString().slice(0, 10);

    const norm: ObligacionRow[] = (rows ?? []).map((r: any) => {
      let estatus = r.estatus as string;
      if (estatus !== "presentada" && r.proximo_vencimiento && r.proximo_vencimiento < today) {
        estatus = "vencida";
      }
      return { ...r, estatus, alert_channels: r.alert_channels ?? ["interna"] };
    });

    const resumen = {
      total: norm.length,
      vencidas: norm.filter((o) => o.estatus === "vencida").length,
      proximas: norm.filter((o) => o.estatus !== "presentada" && o.proximo_vencimiento && o.proximo_vencimiento >= today && o.proximo_vencimiento <= in5).length,
      cumplidas: norm.filter((o) => o.estatus === "presentada").length,
      sin_responsable: norm.filter((o) => !o.responsable_user_id && o.estatus !== "presentada").length,
    };

    const proximas = norm
      .filter((o) => o.estatus !== "presentada" && o.proximo_vencimiento)
      .slice(0, 3);

    return { obligaciones: norm, resumen, proximas };
  });

// ------------------- AUTOGENERAR 12 MESES -------------------

export const autogenerarObligaciones = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clienteId: z.string().uuid(),
      year: z.number().int().min(2020).max(2100),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);

    const { data: cliente } = await supabase
      .from("clientes")
      .select("id, alert_days_default, alert_channels_default")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (!cliente) throw new Error("Expediente no encontrado");

    const { data: rfcs } = await supabase
      .from("rfcs")
      .select("id, tipo_persona, regimen_fiscal")
      .eq("cliente_id", data.clienteId);
    if (!rfcs || rfcs.length === 0) {
      throw new Error("El expediente no tiene RFCs registrados. Agrega la CSF primero.");
    }

    const alertDays = (cliente as any).alert_days_default ?? 5;
    const alertChannels = (cliente as any).alert_channels_default ?? ["interna"];

    const inserts: any[] = [];
    for (const rfc of rfcs) {
      const plantillas = plantillasPorRegimen((rfc as any).regimen_fiscal, (rfc as any).tipo_persona);
      const yearlyDone = new Set<string>();
      for (let m = 1; m <= 12; m++) {
        for (const p of plantillas) {
          // bimestral: solo meses pares (Feb, Abr, Jun, Ago, Oct, Dic) como cierre de bimestre
          if (p.periodicidad === "bimestral" && m % 2 !== 0) continue;
          // anual: solo una vez
          if (p.periodicidad === "anual") {
            if (yearlyDone.has(p.clave)) continue;
            yearlyDone.add(p.clave);
          }
          const venc = fechaVencimiento(p, data.year, m);
          const vencISO = venc.toISOString().slice(0, 10);
          const periodo = `${data.year}-${String(m).padStart(2, "0")}`;
          inserts.push({
            despacho_id: despachoId,
            rfc_id: (rfc as any).id,
            cliente_id: data.clienteId,
            clave: p.clave,
            nombre: p.nombre,
            tipo: p.tipo,
            periodicidad: p.periodicidad,
            proximo_vencimiento: vencISO,
            periodo: p.periodicidad === "anual" ? String(data.year) : periodo,
            estatus: "pendiente",
            alert_days_before: alertDays,
            alert_channels: alertChannels,
            notas: p.descripcion ?? null,
          });
        }
      }
    }

    if (inserts.length === 0) return { inserted: 0 };

    // upsert via insert ignore: usamos unique index existente (despacho_id, rfc_id, clave, proximo_vencimiento)
    // si no existe ese índice, hacemos insert simple y absorbemos errores de duplicado.
    const { error, count } = await supabase
      .from("obligaciones_fiscales")
      .upsert(inserts, { onConflict: "despacho_id,rfc_id,clave,proximo_vencimiento", ignoreDuplicates: true, count: "exact" });
    if (error) {
      // fallback: intentar inserción simple por lote ignorando duplicados manualmente
      let ok = 0;
      for (const row of inserts) {
        const { error: e2 } = await supabase.from("obligaciones_fiscales").insert(row);
        if (!e2) ok++;
      }
      return { inserted: ok };
    }
    return { inserted: count ?? inserts.length };
  });

// ------------------- CREAR / ACTUALIZAR MANUAL -------------------

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  clienteId: z.string().uuid(),
  rfcId: z.string().uuid().optional(),
  nombre: z.string().trim().min(1).max(200),
  clave: z.string().trim().min(1).max(40),
  tipo: z.enum(["mensual", "bimestral", "anual", "informativa", "laboral", "estatal"]),
  periodicidad: z.enum(["mensual", "bimestral", "anual"]),
  proximo_vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodo: z.string().optional(),
  responsable_user_id: z.string().uuid().nullable().optional(),
  notas: z.string().max(2000).optional().nullable(),
  alert_days_before: z.number().int().min(0).max(60).optional(),
  alert_channels: z.array(z.enum(["interna", "correo", "whatsapp"])).optional(),
});

export const upsertObligacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);

    let rfcId = data.rfcId;
    if (!rfcId) {
      const { data: rfc } = await supabase
        .from("rfcs")
        .select("id")
        .eq("cliente_id", data.clienteId)
        .limit(1)
        .maybeSingle();
      if (!rfc) throw new Error("El expediente no tiene RFCs registrados.");
      rfcId = (rfc as any).id;
    }

    const payload: any = {
      despacho_id: despachoId,
      cliente_id: data.clienteId,
      rfc_id: rfcId,
      clave: data.clave,
      nombre: data.nombre,
      tipo: data.tipo,
      periodicidad: data.periodicidad,
      proximo_vencimiento: data.proximo_vencimiento,
      periodo: data.periodo ?? null,
      responsable_user_id: data.responsable_user_id ?? null,
      notas: data.notas ?? null,
      alert_days_before: data.alert_days_before ?? 5,
      alert_channels: data.alert_channels ?? ["interna"],
    };

    let savedId: string;
    if (data.id) {
      const { error } = await supabase.from("obligaciones_fiscales").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      savedId = data.id;
    } else {
      payload.estatus = "pendiente";
      const { data: row, error } = await supabase.from("obligaciones_fiscales").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      savedId = (row as any).id;
    }
    try {
      const { pushObligacionToGoogle } = await import("@/lib/google-calendar/google.server");
      await pushObligacionToGoogle(despachoId, savedId);
    } catch (e) { console.error("google push (upsert) failed", e); }
    return { ok: true, id: savedId };
  });

// ------------------- MARCAR COMPLETADA / PENDIENTE -------------------

export const setEstatusObligacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      estatus: z.enum(["pendiente", "presentada"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const update: any = { estatus: data.estatus };
    if (data.estatus === "presentada") {
      update.completada_at = new Date().toISOString();
      update.completada_by = userId;
    } else {
      update.completada_at = null;
      update.completada_by = null;
    }
    const { error } = await supabase.from("obligaciones_fiscales").update(update).eq("id", data.id);
    if (error) throw new Error(error.message);
    try {
      const { data: row } = await supabase.from("obligaciones_fiscales").select("despacho_id").eq("id", data.id).maybeSingle();
      if (row?.despacho_id) {
        const { pushObligacionToGoogle } = await import("@/lib/google-calendar/google.server");
        await pushObligacionToGoogle(row.despacho_id as string, data.id);
      }
    } catch (e) { console.error("google push (estatus) failed", e); }
    return { ok: true };
  });

// ------------------- POSPONER -------------------

export const posponerObligacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      nuevaFecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("obligaciones_fiscales")
      .update({ proximo_vencimiento: data.nuevaFecha, estatus: "pendiente" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    try {
      const { data: row } = await supabase.from("obligaciones_fiscales").select("despacho_id").eq("id", data.id).maybeSingle();
      if (row?.despacho_id) {
        const { pushObligacionToGoogle } = await import("@/lib/google-calendar/google.server");
        await pushObligacionToGoogle(row.despacho_id as string, data.id);
      }
    } catch (e) { console.error("google push (posponer) failed", e); }
    return { ok: true };
  });

// ------------------- ELIMINAR -------------------

export const eliminarObligacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("obligaciones_fiscales").select("despacho_id").eq("id", data.id).maybeSingle();
    const { error } = await context.supabase.from("obligaciones_fiscales").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    try {
      if (row?.despacho_id) {
        const { deleteObligacionFromGoogle } = await import("@/lib/google-calendar/google.server");
        await deleteObligacionFromGoogle(row.despacho_id as string, data.id);
      }
    } catch (e) { console.error("google delete failed", e); }
    return { ok: true };
  });

// ------------------- CONFIG ALERTAS DEL CLIENTE -------------------

export const getAlertConfig = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clienteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("clientes")
      .select("alert_days_default, alert_channels_default")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      alert_days_default: (row as any)?.alert_days_default ?? 5,
      alert_channels_default: (row as any)?.alert_channels_default ?? ["interna"],
    };
  });

export const updateAlertConfig = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clienteId: z.string().uuid(),
      alert_days_default: z.number().int().min(0).max(60),
      alert_channels_default: z.array(z.enum(["interna", "correo", "whatsapp"])).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("clientes")
      .update({
        alert_days_default: data.alert_days_default,
        alert_channels_default: data.alert_channels_default,
      })
      .eq("id", data.clienteId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------- EQUIPO PARA SELECTOR DE RESPONSABLE -------------------

export const listEquipoDespacho = createServerFn({ method: "GET" })
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
    if (ids.length === 0) return [] as { id: string; name: string; email: string | null }[];
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    return (profs ?? []).map((p: any) => ({
      id: p.id,
      name: p.full_name || p.email || "Usuario",
      email: p.email,
    }));
  });
