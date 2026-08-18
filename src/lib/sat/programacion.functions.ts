// Programación de Descargas Masivas SAT — superficie autenticada.
//
// Estas funciones SÓLO administran el calendario. No contactan al SAT, no
// tocan la e.firma, no descargan XML y no ejecutan procesamiento posterior:
// eso lo hace el núcleo único `ejecutarCorridaSat`, invocado por el
// despachador o por el botón "Sincronizar ahora".

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";
import { assertClienteScope } from "@/lib/despacho/scope";
import {
  AVISO_ASINCRONO,
  PERIODO_LABEL,
  ZONA_PREDETERMINADA,
  describirProgramacion,
  fechaLocal,
  proximaEjecucion,
  resolverPeriodoProgramado,
  type PeriodoOpcion,
  type Recurrencia,
  type TipoProgramacion,
} from "@/lib/sat/programacion";

const ZONAS_PERMITIDAS = [
  "America/Mexico_City",
  "America/Cancun",
  "America/Chihuahua",
  "America/Hermosillo",
  "America/Tijuana",
  "UTC",
] as const;

export const ZONAS_SOPORTADAS = ZONAS_PERMITIDAS;

const GuardarSchema = z
  .object({
    cliente_id: z.string().uuid(),
    activa: z.boolean().default(true),
    zona_horaria: z.enum(ZONAS_PERMITIDAS).default(ZONA_PREDETERMINADA),
    tipo: z.enum(["unica", "recurrente"]),
    recurrencia: z.enum(["diaria", "semanal", "mensual"]).nullable().default(null),
    dias_semana: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    dia_mes: z.number().int().min(1).max(31).nullable().default(null),
    hora: z.number().int().min(0).max(23),
    minuto: z.number().int().min(0).max(59),
    fecha_unica: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
    periodo_opcion: z.enum([
      "dia_anterior",
      "ultimos_3",
      "ultimos_7",
      "mes_anterior",
      "desde_ultima",
      "rango_fijo",
    ]),
    rango_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
    rango_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
    solapamiento_dias: z.number().int().min(0).max(30).default(1),
    emitidos: z.boolean().default(true),
    recibidos: z.boolean().default(true),
    clasificar_nomina: z.boolean().default(true),
    clasificar_pagos: z.boolean().default(true),
    tolerancia_minutos: z.number().int().min(0).max(720).default(60),
    politica_retraso: z.enum(["recuperar", "omitir"]).default("recuperar"),
  })
  .superRefine((v, ctx) => {
    if (!v.emitidos && !v.recibidos) {
      ctx.addIssue({ code: "custom", message: "Selecciona al menos emitidos o recibidos." });
    }
    if (v.tipo === "unica" && !v.fecha_unica) {
      ctx.addIssue({ code: "custom", message: "Captura la fecha de la ejecución única." });
    }
    if (v.tipo === "recurrente" && !v.recurrencia) {
      ctx.addIssue({ code: "custom", message: "Elige diaria, semanal o mensual." });
    }
    if (v.tipo === "recurrente" && v.recurrencia === "semanal" && v.dias_semana.length === 0) {
      ctx.addIssue({ code: "custom", message: "Elige al menos un día de la semana." });
    }
    if (v.tipo === "recurrente" && v.recurrencia === "mensual" && !v.dia_mes) {
      ctx.addIssue({ code: "custom", message: "Elige el día del mes." });
    }
    if (v.periodo_opcion === "rango_fijo") {
      if (v.tipo !== "unica") {
        ctx.addIssue({
          code: "custom",
          message: "El rango fijo sólo se permite en ejecuciones únicas.",
        });
      }
      if (!v.rango_desde || !v.rango_hasta || v.rango_desde > v.rango_hasta) {
        ctx.addIssue({ code: "custom", message: "Captura un rango fijo válido." });
      }
    }
  });

/** Permiso fino: quién puede crear, modificar, pausar o cancelar.
 *  Siempre acotado al despacho del expediente: un rol de contador o despacho
 *  en OTRO despacho no concede administración aquí. */
const ROLES_ADMIN = ["despacho", "contador"];

async function assertPuedeAdministrar(supabase: any, userId: string, despachoId: string) {
  const { data: owner } = await supabase
    .from("despachos")
    .select("id")
    .eq("id", despachoId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (owner) return;

  const { data: superAdmin } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (superAdmin) return;

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("despacho_id", despachoId)
    .in("role", ROLES_ADMIN);
  if (!roles || roles.length === 0) {
    throw new Error(
      "No tienes permiso para administrar la programación de descargas SAT en este despacho.",
    );
  }
}


function derivar(p: any) {
  if (!p) return null;
  const ahora = new Date();
  const rango = resolverPeriodoProgramado({
    opcion: p.periodo_opcion as PeriodoOpcion,
    zona_horaria: p.zona_horaria,
    ahora,
    ultima_exitosa_hasta: null,
    solapamiento_dias: p.solapamiento_dias,
    rango_desde: p.rango_desde,
    rango_hasta: p.rango_hasta,
  });
  const prox = p.proxima_ejecucion_at ? new Date(p.proxima_ejecucion_at) : null;
  return {
    ...p,
    aviso: AVISO_ASINCRONO,
    resumen: describirProgramacion(p),
    periodo_label: PERIODO_LABEL[p.periodo_opcion as PeriodoOpcion],
    periodo_estimado: rango,
    proxima_local: prox
      ? new Intl.DateTimeFormat("es-MX", {
          timeZone: p.zona_horaria,
          dateStyle: "full",
          timeStyle: "short",
        }).format(prox)
      : null,
    proxima_utc: prox ? prox.toISOString() : null,
    proxima_fecha_local: prox ? fechaLocal(p.zona_horaria, prox) : null,
    direcciones: [p.emitidos ? "emitidos" : null, p.recibidos ? "recibidos" : null].filter(Boolean),
  };
}

export const getProgramacionSat = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await assertClienteScope(
      context.supabase as any,
      context.userId,
      data.cliente_id,
    );
    const { data: row } = await context.supabase
      .from("sat_programaciones")
      .select("*")
      .eq("cliente_id", scope.cliente_id)
      .eq("despacho_id", scope.despacho_id)
      .eq("cancelada", false)
      .maybeSingle();

    const { data: bit } = row
      ? await context.supabase
          .from("sat_programacion_bitacora")
          .select("accion, programada_at, retraso_ms, run_id, resultado, detalle, created_at")
          .eq("programacion_id", (row as any).id)
          .order("created_at", { ascending: false })
          .limit(20)
      : { data: [] as any[] };

    return { programacion: derivar(row), bitacora: bit ?? [], aviso: AVISO_ASINCRONO };
  });

export const guardarProgramacionSat = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => GuardarSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);
    await assertPuedeAdministrar(supabase, userId, scope.despacho_id);

    const regla = {
      zona_horaria: data.zona_horaria,
      tipo: data.tipo as TipoProgramacion,
      recurrencia: (data.tipo === "recurrente" ? data.recurrencia : null) as Recurrencia | null,
      dias_semana: data.dias_semana,
      dia_mes: data.dia_mes,
      hora: data.hora,
      minuto: data.minuto,
      fecha_unica: data.tipo === "unica" ? data.fecha_unica : null,
    };
    const prox = proximaEjecucion(regla, new Date());
    if (data.activa && !prox) {
      throw new Error(
        "La programación no tiene ninguna ejecución futura. Revisa la fecha o la recurrencia.",
      );
    }

    // Escritura canónica y atómica: autorización + alta/actualización +
    // versión + próxima ejecución + bitácora en UNA sola transacción. Si la
    // bitácora falla, la programación se revierte.
    const fila = {
      zona_horaria: data.zona_horaria,
      tipo: data.tipo,
      recurrencia: regla.recurrencia,
      dias_semana: data.dias_semana,
      dia_mes: data.dia_mes,
      hora: data.hora,
      minuto: data.minuto,
      fecha_unica: regla.fecha_unica,
      periodo_opcion: data.periodo_opcion,
      rango_desde: data.periodo_opcion === "rango_fijo" ? data.rango_desde : null,
      rango_hasta: data.periodo_opcion === "rango_fijo" ? data.rango_hasta : null,
      solapamiento_dias: data.solapamiento_dias,
      emitidos: data.emitidos,
      recibidos: data.recibidos,
      clasificar_nomina: data.clasificar_nomina,
      clasificar_pagos: data.clasificar_pagos,
      tolerancia_minutos: data.tolerancia_minutos,
      politica_retraso: data.politica_retraso,
      activa: data.activa,
      proxima_ejecucion_at: prox ? prox.toISOString() : null,
    };

    const { data: salida, error } = await supabase.rpc("sat_programacion_guardar", {
      _cliente: scope.cliente_id,
      _fila: fila as any,
      _detalle: {
        tipo: data.tipo,
        recurrencia: regla.recurrencia,
        zona_horaria: data.zona_horaria,
        hora: `${String(data.hora).padStart(2, "0")}:${String(data.minuto).padStart(2, "0")}`,
        periodo: data.periodo_opcion,
        emitidos: data.emitidos,
        recibidos: data.recibidos,
        proxima_utc: prox?.toISOString() ?? null,
      } as any,
    });
    if (error) throw new Error(error.message);
    const id = (salida as any)?.id as string;

    return { ok: true, id, proxima_utc: prox?.toISOString() ?? null, aviso: AVISO_ASINCRONO };
  });


export const cambiarEstadoProgramacionSat = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        accion: z.enum(["pausar", "reanudar", "cancelar"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);
    await assertPuedeAdministrar(supabase, userId, scope.despacho_id);

    const { data: p } = await supabase
      .from("sat_programaciones")
      .select("*")
      .eq("cliente_id", scope.cliente_id)
      .eq("cancelada", false)
      .maybeSingle();
    if (!p) throw new Error("Este expediente no tiene una programación activa.");

    const prox =
      data.accion === "reanudar" ? proximaEjecucion(p as any, new Date()) : null;

    // Cambio de estado + versión + bitácora en una sola transacción.
    const { error } = await supabase.rpc("sat_programacion_cambiar_estado", {
      _cliente: scope.cliente_id,
      _accion: data.accion,
      _proxima: prox ? prox.toISOString() : null,
      _detalle: { proxima_utc: prox?.toISOString() ?? null } as any,
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });

