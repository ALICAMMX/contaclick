// Módulo Descarga Masiva SAT — proveedor activo: SAT directo (e.firma).
//
// Registra:
//   - sat_sync_config  (preferencias por expediente, incluido el proveedor)
//   - sat_sync_runs    (corridas, con máquina de estados e idempotencia)
//   - sat_sync_eventos (novedades y recálculos pendientes)
//
// La ejecución es ASÍNCRONA: `runSyncNow` envía la solicitud y hace una
// primera cosecha; el resto lo completa el cron. Los módulos se recalculan
// SOLO cuando la corrida termina y trajo comprobantes nuevos.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";
import {
  MODULO_LABEL,
  clasificarCfdi,
  corridaReintentable,
  enmascararRfc,
  enmascararUuid,
  motivoSinReintento,
  paqueteSaneado,
} from "./linaje";
import {
  complementosDe,
  etiquetaTipoComprobante,
  evaluarProcesamiento,
  resumirPaquetes,
  ESTADO_MODULO_LABEL,
  type EventoModulo,
} from "./procesamiento";


import { decidirEstadoSat, nivelPac, type CausaSat } from "@/lib/sat/estado-servicio";
import { computeSaludFiscal } from "@/lib/salud/salud.functions";
import { computeRiesgoSAT } from "@/lib/riesgo/riesgo.functions";
import { runExpressAudit } from "@/lib/auditor/auditor.functions";
import { scanClienteEfos } from "@/lib/efos/efos.functions";
import { assertClienteScope } from "@/lib/despacho/scope";
import {
  assertSatRunPermitido,
  devolverReservaPac,
  leerSaldoPac,
  registrarConsumoSat,
  type FrecuenciaSat,
} from "@/lib/usage/sat-quota";
import { assertFrecuencia, getEntitlements, limiteDe, usadoDe } from "@/lib/entitlements/service";
import {
  PROVEEDORES,
  direccionesDe,
  metaProveedor,
  proveedorActivo,
  type DireccionDescarga,
  type ProveedorId,
} from "@/lib/sat/providers/contrato";
import { contarSolicitudes, rangoValido } from "@/lib/sat/consumo";
import { llaveCorrida } from "@/lib/sat/idempotencia";
import type { CredencialEFirma } from "@/lib/sat/credencial.server";
import {
  MINUTOS_ATORADA,
  puedeCerrarseManualmente,
  tieneFolioSat,
} from "@/lib/sat/saneamiento";

import {
  ESTADOS_ACTIVOS,
  estatusLegado,
  reabrirSolicitudes,
  semanticaCodigo,

  resolverEstadoCorrida,
  type EstadoCorrida,
  type SolicitudRegistro,
} from "@/lib/sat/maquina-estados";

export type Frecuencia = "manual" | "diaria" | "semanal" | "mensual";
export type Periodo = "30d" | "mes_actual" | "ejercicio" | "personalizado";

const ConfigSchema = z.object({
  cliente_id: z.string().uuid(),
  emitidos: z.boolean(),
  recibidos: z.boolean(),
  /** Clasificación posterior a la descarga, NO solicitudes independientes. */
  clasificar_nomina: z.boolean().default(true),
  clasificar_pagos: z.boolean().default(true),
  frecuencia: z.enum(["manual", "diaria", "semanal", "mensual"]),
  periodo: z.enum(["30d", "mes_actual", "ejercicio", "personalizado"]),
  fecha_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  fecha_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  activo: z.boolean().default(true),
});

export function resolverRango(
  periodo: Periodo,
  desde?: string | null,
  hasta?: string | null,
): { desde: string; hasta: string } {
  const hoy = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (periodo === "personalizado" && desde && hasta) return { desde, hasta };
  if (periodo === "30d") {
    const d = new Date(hoy);
    d.setDate(d.getDate() - 30);
    return { desde: fmt(d), hasta: fmt(hoy) };
  }
  if (periodo === "ejercicio") {
    return { desde: `${hoy.getFullYear()}-01-01`, hasta: fmt(hoy) };
  }
  const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  return { desde: fmt(ini), hasta: fmt(hoy) };
}

function calcularProxima(frec: Frecuencia, base = new Date()): string | null {
  if (frec === "manual") return null;
  const d = new Date(base);
  if (frec === "diaria") d.setDate(d.getDate() + 1);
  else if (frec === "semanal") d.setDate(d.getDate() + 7);
  else if (frec === "mensual") d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

// ============= CONFIGURACIÓN =============

export const getSatSyncConfig = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await assertClienteScope(context.supabase as any, context.userId, data.cliente_id);
    const { data: row } = await context.supabase
      .from("sat_sync_config")
      .select("*")
      .eq("cliente_id", scope.cliente_id)
      .eq("despacho_id", scope.despacho_id)
      .maybeSingle();
    return row;
  });

export const upsertSatSyncConfig = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => ConfigSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const scope = await assertClienteScope(supabase as any, context.userId, data.cliente_id);
    const ent = await getEntitlements(supabase, scope.despacho_id);
    assertFrecuencia(ent, data.frecuencia as FrecuenciaSat);
    const proxima = calcularProxima(data.frecuencia);

    const { error } = await supabase.from("sat_sync_config").upsert(
      {
        cliente_id: scope.cliente_id,
        despacho_id: scope.despacho_id,
        proveedor: "sat_directo",
        emitidos: data.emitidos,
        recibidos: data.recibidos,
        clasificar_nomina: data.clasificar_nomina,
        clasificar_pagos: data.clasificar_pagos,
        frecuencia: data.frecuencia,
        periodo: data.periodo,
        fecha_desde: data.fecha_desde ?? null,
        fecha_hasta: data.fecha_hasta ?? null,
        activo: data.activo,
        proxima_corrida_at: proxima,
      },
      { onConflict: "cliente_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Motivo legible de una corrida fallida: código del SAT + explicación.
 * Nunca devuelve sólo "Error".
 */
export function motivoCorrida(r: {
  estado?: string | null;
  detalle?: string | null;
  errores?: any;
  solicitudes?: any;
}): string {
  const sols: any[] = Array.isArray(r?.solicitudes) ? r.solicitudes : [];
  const conCodigo = sols.find((s) => s?.codigo);
  if (conCodigo) {
    const sem = semanticaCodigo(conCodigo.codigo);
    return `${conCodigo.codigo} · ${sem.mensaje}`;
  }
  const errs: any[] = Array.isArray(r?.errores) ? r.errores : [];
  if (errs.length) return String(errs[0]?.mensaje ?? errs[0]).slice(0, 160);
  if (r?.detalle) return String(r.detalle).slice(0, 160);
  return r?.estado === "vencida"
    ? "La solicitud caducó en el SAT y debe volver a generarse."
    : "Corrida no completada.";
}

// ============= DASHBOARD (acotado al expediente activo) =============

export const dashboardSatSync = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);
    const { cliente_id: clienteId, despacho_id: despachoId } = scope;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const [
      { count: conectados },
      { data: ultima },
      { count: hoyCount },
      { count: nuevos },
      { count: errores },
      { count: enProceso },
      { data: actividad },
      { data: desconectados },
      { data: conErrores },
      { data: novedades },
    ] = await Promise.all([
      supabase.from("sat_credenciales").select("cliente_id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("cliente_id", clienteId).eq("estatus", "activo"),
      // "Última sincronización" = última corrida que SÍ terminó bien.
      // Una corrida fallida nunca se presenta como sincronización exitosa.
      supabase.from("sat_sync_runs").select("iniciado_at, finalizado_at, cliente_id, estado, estatus").eq("despacho_id", despachoId).eq("cliente_id", clienteId).in("estado", ["completada", "parcial"]).order("iniciado_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("sat_sync_runs").select("id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("cliente_id", clienteId).gte("iniciado_at", hoy.toISOString()),
      supabase.from("sat_sync_eventos").select("id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("cliente_id", clienteId).eq("tipo", "nuevo").gte("created_at", hoy.toISOString()),
      supabase.from("sat_sync_runs").select("id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("cliente_id", clienteId).in("estado", ["error", "vencida"]).gte("iniciado_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      supabase.from("sat_sync_runs").select("id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("cliente_id", clienteId).in("estado", ESTADOS_ACTIVOS),
      supabase.from("sat_sync_runs").select("id, cliente_id, iniciado_at, finalizado_at, estado, estatus, cobertura, advertencia, descargados, nuevos, duplicados, rechazados, errores, detalle, solicitudes, clientes(rfc, razon_social)").eq("despacho_id", despachoId).eq("cliente_id", clienteId).order("iniciado_at", { ascending: false }).limit(15),
      supabase.from("sat_credenciales").select("cliente_id, estatus, last_error, clientes(rfc, razon_social)").eq("despacho_id", despachoId).eq("cliente_id", clienteId).neq("estatus", "activo").limit(10),
      supabase.from("sat_credenciales").select("cliente_id, estatus, last_error, last_sync_at, clientes(rfc, razon_social)").eq("despacho_id", despachoId).eq("cliente_id", clienteId).eq("estatus", "error").limit(10),
      supabase.from("sat_sync_eventos").select("id, tipo, uuid_cfdi, monto, mensaje, created_at, cliente_id, clientes(rfc, razon_social)").eq("despacho_id", despachoId).eq("cliente_id", clienteId).order("created_at", { ascending: false }).limit(20),
    ]);

    // Corridas fallidas de los últimos 7 días: alimentan el Centro de
    // incidencias para que nunca contradiga al KPI "Errores (7d)".
    const runsConError = (actividad ?? []).filter(
      (r: any) =>
        (r.estado === "error" || r.estado === "vencida") &&
        new Date(r.iniciado_at).getTime() >= Date.now() - 7 * 86400000,
    );

    return {
      conectados: conectados ?? 0,
      ultima: (ultima as any)?.finalizado_at ?? (ultima as any)?.iniciado_at ?? null,
      incidenciasCorridas: runsConError.map((r: any) => ({
        id: r.id,
        iniciado_at: r.iniciado_at,
        estado: r.estado,
        rfc: r.clientes?.rfc ?? null,
        motivo: motivoCorrida(r),
      })),
      hoy: hoyCount ?? 0,
      nuevos: nuevos ?? 0,
      errores: errores ?? 0,
      /** Corridas vivas: el SAT sigue procesándolas. */
      pendientes: enProceso ?? 0,
      actividad: actividad ?? [],
      desconectados: desconectados ?? [],
      conErrores: conErrores ?? [],
      novedades: novedades ?? [],
    };
  });

export const listSyncRuns = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await assertClienteScope(context.supabase as any, context.userId, data.cliente_id);
    const { data: rows } = await context.supabase
      .from("sat_sync_runs")
      .select("*, clientes(rfc, razon_social)")
      .eq("cliente_id", scope.cliente_id)
      .eq("despacho_id", scope.despacho_id)
      .order("iniciado_at", { ascending: false })
      .limit(data.limit);
    return rows ?? [];
  });

export const listSyncEventos = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await assertClienteScope(context.supabase as any, context.userId, data.cliente_id);
    const { data: rows } = await context.supabase
      .from("sat_sync_eventos")
      .select("*, clientes(rfc, razon_social)")
      .eq("cliente_id", scope.cliente_id)
      .eq("despacho_id", scope.despacho_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return rows ?? [];
  });

/**
 * DETALLE COMPLETO DE UNA CORRIDA.
 *
 * Responde, con evidencia y sin exponer material sensible:
 *   - identificación y periodo,
 *   - folios y códigos devueltos por el SAT,
 *   - paquetes procesados,
 *   - los comprobantes que entraron (o por qué no entraron),
 *   - los recálculos ejecutados después.
 * El alcance está acotado por `assertClienteScope`: sólo el expediente propio.
 */
export const detalleCorrida = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ run_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: run } = await supabase
      .from("sat_sync_runs")
      .select("*, clientes(rfc, razon_social)")
      .eq("id", data.run_id)
      .maybeSingle();
    if (!run) throw new Error("La corrida no existe o no pertenece a este expediente.");
    const scope = await assertClienteScope(supabase as any, userId, (run as any).cliente_id);

    const [{ data: eventos }, { data: docs }] = await Promise.all([
      supabase
        .from("sat_sync_eventos")
        .select("id, tipo, mensaje, uuid_cfdi, monto, payload, created_at")
        .eq("run_id", data.run_id)
        .eq("cliente_id", scope.cliente_id)
        .order("created_at", { ascending: true })
        .limit(500),
      supabase
        .from("cfdi_xml")
        .select(
          "id, uuid, tipo_cfdi, fecha, total, moneda, rfc_emisor, rfc_receptor, nombre_emisor, nombre_receptor, estatus_sat, validacion, sat_solicitud_id, sat_paquete_id, fecha_carga",
        )
        .eq("sat_run_id", data.run_id)
        .eq("cliente_id", scope.cliente_id)
        .order("fecha", { ascending: false })
        .limit(500),
    ]);

    const rfcExpediente = ((run as any).clientes?.rfc as string) ?? null;
    const solicitudes = (Array.isArray((run as any).solicitudes) ? (run as any).solicitudes : []) as any[];

    const documentos = (docs ?? []).map((d: any) => ({
      id: d.id as string,
      uuid: d.uuid as string,
      uuid_visible: enmascararUuid(d.uuid),
      // La clasificación SIEMPRE se deriva del XML y del RFC del expediente:
      // ningún botón de la interfaz puede alterar este hecho.
      clasificacion: clasificarCfdi({
        tipo_cfdi: d.tipo_cfdi,
        rfc_emisor: d.rfc_emisor,
        rfc_receptor: d.rfc_receptor,
        rfc_expediente: rfcExpediente,
      }),
      tipo_cfdi: d.tipo_cfdi as string,
      tipo_label: etiquetaTipoComprobante(d.tipo_cfdi),
      complementos: complementosDe(d.tipo_cfdi),
      moneda: (d.moneda as string) ?? "MXN",
      rfc_emisor: enmascararRfc(d.rfc_emisor),
      rfc_receptor: enmascararRfc(d.rfc_receptor),
      fecha: d.fecha as string,
      total: Number(d.total ?? 0),
      contraparte:
        (d.rfc_emisor ?? "").toUpperCase() === (rfcExpediente ?? "").toUpperCase()
          ? { rfc: d.rfc_receptor, nombre: d.nombre_receptor }
          : { rfc: d.rfc_emisor, nombre: d.nombre_emisor },
      estatus_sat: d.estatus_sat as string,
      validacion: (d.validacion as string) ?? "aceptado",
      solicitud_id: d.sat_solicitud_id as string | null,
      paquete: paqueteSaneado(d.sat_paquete_id),
      ingresado_at: d.fecha_carga as string,
    }));

    const evs = eventos ?? [];

    // FUENTE ÚNICA del procesamiento posterior: la bitácora por módulo.
    const { leerEventosProcesamiento } = await import("./procesamiento.server");
    const eventosModulo = await leerEventosProcesamiento(supabase, data.run_id);

    const recalculos = eventosModulo.map((e) => ({
      modulo: e.module_id,
      etiqueta: MODULO_LABEL[e.module_id] ?? e.module_id,
      estado: e.estado,
      estado_label: ESTADO_MODULO_LABEL[e.estado] ?? e.estado,
      ok: e.estado === "completado",
      pendiente: e.estado === "iniciado",
      omitido: e.estado === "omitido",
      motivo: e.motivo ?? null,
      resultado: (e.resultado as Record<string, string | number | boolean | null>) ?? null,
      iniciado_at: e.iniciado_at ?? null,
      finalizado_at: e.finalizado_at ?? null,
    }));

    // Fuente ÚNICA de paquetes: solicitudes + linaje persistido en los XML.
    const paquetesResumen = resumirPaquetes({
      solicitudes,
      documentos: (docs ?? []) as any[],
      paquetes_reportados: Number((run as any).paquetes_procesados ?? 0),
    });

    const nuevos = Number((run as any).nuevos ?? 0);
    const procesamiento = evaluarProcesamiento({
      cobertura: (run as any).cobertura as string | null,
      nuevos,
      eventos: eventosModulo,
    });



    return {
      run: {
        id: (run as any).id as string,
        estado: (run as any).estado as string,
        estado_honesto: procesamiento.estado_honesto ?? ((run as any).estado as string),
        cobertura: procesamiento.cobertura_honesta ?? ((run as any).cobertura as string | null),
        detalle: (run as any).detalle as string | null,
        advertencia: (run as any).advertencia as string | null,
        periodo: { desde: (run as any).desde as string, hasta: (run as any).hasta as string },
        proveedor: (run as any).proveedor as string | null,
        iniciado_at: (run as any).iniciado_at as string,
        finalizado_at: (run as any).finalizado_at as string | null,
        duracion_ms: (run as any).duracion_ms as number | null,
        rfc: rfcExpediente,
        razon_social: ((run as any).clientes?.razon_social as string) ?? null,
        totales: {
          encontrados: Number((run as any).descargados ?? 0),
          nuevos,
          duplicados: Number((run as any).duplicados ?? 0),
          rechazados: Number((run as any).rechazados ?? 0),
          paquetes: paquetesResumen.reportados,
        },
      },
      solicitudes: solicitudes.map((s: any) => ({
        direccion: s?.direccion ?? null,
        tipo: s?.tipo ?? null,
        estado_comprobante: s?.estado ?? null,
        folio_sat: s?.id_solicitud ?? null,
        codigo: s?.codigo ?? null,
        mensaje: s?.mensaje ?? null,
        estado: s?.estado_solicitud ?? null,
        terminal: semanticaCodigo(String(s?.codigo ?? "")).terminal,
      })),
      paquetes: paquetesResumen.lista,
      paquetes_mensaje: paquetesResumen.mensaje,
      paquetes_sin_referencia: paquetesResumen.sin_referencia,
      documentos,
      recalculos,
      procesamiento,
      eventos: evs.map((e: any) => ({
        id: e.id as string,
        tipo: e.tipo as string,
        mensaje: e.mensaje as string | null,
        uuid_visible: e.uuid_cfdi ? enmascararUuid(e.uuid_cfdi) : null,
        at: e.created_at as string,
      })),
      reintentable: corridaReintentable(run as any),
      motivo_sin_reintento: corridaReintentable(run as any) ? null : motivoSinReintento(run as any),
    };
  });

/**
 * RECUPERACIÓN EXPLÍCITA: completa el procesamiento posterior de una corrida
 * que incorporó comprobantes nuevos pero no dejó evidencia de recálculos.
 *
 * Garantías: no contacta al SAT, no descarga nada, no consume cuota ni PAC,
 * no vuelve a ingerir ningún XML y es idempotente (si ya está completo, no
 * hace nada). Registra el estado antes y después en la bitácora.
 */
export const completarProcesamiento = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ run_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: run } = await supabase
      .from("sat_sync_runs")
      .select(
        "id, cliente_id, despacho_id, estado, cobertura, nuevos, duplicados, rechazados, iniciado_at, finalizado_at",
      )
      .eq("id", data.run_id)
      .maybeSingle();
    if (!run) throw new Error("La corrida no existe o no pertenece a este expediente.");
    const scope = await assertClienteScope(supabase as any, userId, (run as any).cliente_id);

    const { ejecutarProcesamientoPosterior } = await import("./procesamiento.server");
    const { antes, despues, resultados } = await ejecutarProcesamientoPosterior({
      supabase,
      runId: (run as any).id as string,
      clienteId: scope.cliente_id,
      despachoId: scope.despacho_id,
      nuevos: Number((run as any).nuevos ?? 0),
      cobertura: (run as any).cobertura as string | null,
      runInicioAt: (run as any).iniciado_at as string | null,
    });

    const ejecutado = resultados.some((r) => r.estado !== "omitido_por_idempotencia");

    // El estado de la corrida se deriva de la bitácora releída, nunca del
    // resultado en memoria. `finalizado_at` sólo se fija cuando el
    // procesamiento quedó terminal.
    // La columna `estado` sólo admite los valores del ciclo de la corrida: un
    // procesamiento pendiente se guarda como `recalculando` y la lectura
    // honesta la aporta `evaluarProcesamiento`. La cobertura sólo admite
    // total/parcial/nula, así que nunca se escribe un texto libre.
    const ESTADO_DB: Record<string, string> = {
      completada: "completada",
      parcial: "parcial",
      error: "error",
      recalculando: "recalculando",
      procesamiento_pendiente: "recalculando",
    };
    const estadoDb = despues.estado_honesto ? ESTADO_DB[despues.estado_honesto] : null;
    const patch: Record<string, unknown> = {
      detalle: `Nuevos: ${Number((run as any).nuevos ?? 0)} · duplicados: ${Number(
        (run as any).duplicados ?? 0,
      )} · rechazados: ${Number((run as any).rechazados ?? 0)} · ${despues.mensaje}`,
    };
    if (estadoDb) {
      patch['estado'] = estadoDb;
      patch['estatus'] = estatusLegado(estadoDb as any);
    }
    if (despues.terminal && despues.cobertura_honesta &&
        ["total", "parcial", "nula"].includes(despues.cobertura_honesta)) {
      patch['cobertura'] = despues.cobertura_honesta;
    }
    if (despues.terminal) {
      patch['finalizado_at'] = (run as any).finalizado_at ?? new Date().toISOString();
    }
    await supabase.from("sat_sync_runs").update(patch as any).eq("id", (run as any).id);

    await supabase.from("audit_logs").insert({
      user_id: userId,
      despacho_id: scope.despacho_id,
      accion: "sat_sync.completar_procesamiento",
      entidad: "sat_sync_run",
      entidad_id: (run as any).id,
      payload: {
        antes: { estado: (run as any).estado, faltantes: antes.faltantes },
        despues: { estado: despues.estado_honesto, faltantes: despues.faltantes },
        modulos: resultados.map((r) => ({ modulo: r.module_id, estado: r.estado })),
        sin_contacto_sat: true,
        sin_descarga: true,
        sin_consumo_cuota: true,
        sin_consumo_pac: true,
      },
    });

    return {
      ok: despues.completo || !despues.requerido,
      ejecutado,
      mensaje: !ejecutado
        ? despues.completo
          ? "El procesamiento posterior ya estaba completo: no se ejecutó nada."
          : "Otro procesamiento ya está en curso para esta corrida."
        : despues.mensaje,
      antes,
      despues,
      modulos: resultados.map((r) => ({
        modulo: r.module_id,
        estado: r.estado,
        motivo: r.motivo ?? null,
      })),
    };
  });


// ============= ESTADO DEL SERVICIO (fuente única del candado) =============

export type EstadoServicioSat = {
  puede_ejecutar: boolean;
  motivo: string | null;
  accion: string | null;
  causa: CausaSat;
  proveedor: ProveedorId;
  proveedor_nombre: string;
  etiqueta_costo: string;
  /** Solicitudes que consumirá la corrida con la configuración guardada. */
  previstas: number;
  direcciones: DireccionDescarga[];
  rango: { desde: string; hasta: string };
  cuota: { usado: number; limite: number; ilimitado: boolean; restante: number | null };
  es_sandbox: boolean;
  credencial_activa: boolean;
  /** Diagnóstico único de la e.firma, compartido con la tarjeta de conexión. */
  credencial: CredencialEFirma;
  efirma_vence_at: string | null;
  corrida_activa: {
    id: string;
    estado: EstadoCorrida;
    iniciado_at: string;
    /** ¿El SAT llegó a devolver folio para esta corrida? */
    con_folio_sat: boolean;
    puede_cerrarse: boolean;
    motivo_cierre: string;
  } | null;

  /** Sólo para super-admin: estado interno del proveedor con saldo. */
  servicio?: { disponible: number; reservado: number; umbral_critico: number; nivel: string };
};

/** Núcleo compartido por `estadoServicioSat` y `runSyncNow`. */
async function calcularEstado(
  supabase: any,
  userId: string,
  scope: { cliente_id: string; despacho_id: string },
  opts: { verificarDescifrado?: boolean } = {},
): Promise<EstadoServicioSat> {
  const ent = await getEntitlements(supabase, scope.despacho_id);

  const { resolverCredencialEFirma } = await import("@/lib/sat/credencial.server");

  const [{ data: cfg }, { data: cli }, { data: sa }] = await Promise.all([
    supabase
      .from("sat_sync_config")
      .select("proveedor, emitidos, recibidos, periodo, fecha_desde, fecha_hasta")
      .eq("cliente_id", scope.cliente_id)
      .eq("despacho_id", scope.despacho_id)
      .maybeSingle(),
    supabase.from("clientes").select("rfc").eq("id", scope.cliente_id).maybeSingle(),
    supabase.from("user_roles").select("user_id").eq("user_id", userId).eq("role", "super_admin").limit(1),
  ]);

  // FUENTE ÚNICA: la interfaz y el runner resuelven la e.firma con esta función.
  const credencial = await resolverCredencialEFirma(supabase, {
    clienteId: scope.cliente_id,
    despachoId: scope.despacho_id,
    rfcExpediente: (cli as any)?.rfc ?? null,
    verificarDescifrado: opts.verificarDescifrado ?? false,
  });

  const c = (cfg ?? {
    proveedor: "sat_directo",
    emitidos: true,
    recibidos: true,
    periodo: "mes_actual",
    fecha_desde: null,
    fecha_hasta: null,
  }) as any;

  const proveedor = proveedorActivo(c.proveedor);
  const meta = metaProveedor(proveedor);
  const direcciones = direccionesDe(c);
  const rango = resolverRango(c.periodo as Periodo, c.fecha_desde, c.fecha_hasta);
  const previstas = contarSolicitudes({ direcciones, desde: rango.desde, hasta: rango.hasta });

  const limite = limiteDe(ent, "sat_solicitudes");
  const usado = usadoDe(ent, "sat_solicitudes");
  const ilimitado = limite < 0;
  const restante = ilimitado ? null : Math.max(0, limite - usado);

  const credencialActiva = credencial.utilizable;
  const efirmaVenceAt = credencial.vence_at;

  const { data: activa } = await supabase
    .from("sat_sync_runs")
    .select("id, estado, iniciado_at, desde, hasta, solicitudes")
    .eq("cliente_id", scope.cliente_id)
    .eq("despacho_id", scope.despacho_id)
    .in("estado", ESTADOS_ACTIVOS)
    .order("iniciado_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const mismaVentana =
    !!activa && (activa as any).desde === rango.desde && (activa as any).hasta === rango.hasta;

  const cierre = activa
    ? puedeCerrarseManualmente({
        id: (activa as any).id,
        estado: (activa as any).estado,
        iniciado_at: (activa as any).iniciado_at,
        solicitudes: (activa as any).solicitudes ?? [],
      })
    : null;

  const base = {
    proveedor,
    proveedor_nombre: meta.nombre,
    etiqueta_costo: meta.etiquetaCosto,
    previstas,
    direcciones,
    rango,
    cuota: { usado, limite, ilimitado, restante },
    es_sandbox: ent.es_sandbox,
    credencial_activa: credencialActiva,
    credencial,
    efirma_vence_at: efirmaVenceAt,
    corrida_activa: activa
      ? {
          id: (activa as any).id as string,
          estado: (activa as any).estado as EstadoCorrida,
          iniciado_at: (activa as any).iniciado_at as string,
          con_folio_sat: tieneFolioSat(((activa as any).solicitudes ?? []) as SolicitudRegistro[]),
          puede_cerrarse: !!cierre?.permitido,
          motivo_cierre: cierre?.motivo ?? "",
        }
      : null,
  };


  const entrada = {
    proveedor,
    acceso: ent.acceso,
    motivoBloqueo: ent.motivo_bloqueo,
    previstas,
    rangoValido: rangoValido(rango.desde, rango.hasta),
    credencialActiva,
    efirmaVenceAt,
    solicitudActiva: mismaVentana,
    ilimitado,
    restante,
    periodo: ent.periodo,
    esSandbox: ent.es_sandbox,
  };

  // El motivo mostrado distingue "nunca conectada" de "conectada pero no usable".
  const conMotivo = (dec: ReturnType<typeof decidirEstadoSat>) =>
    dec.causa === "sin_credencial" && credencial.existe
      ? {
          ...dec,
          motivo: credencial.mensaje,
          accion:
            credencial.accion === "renovar"
              ? "Renueva la e.firma ante el SAT y reemplázala en el expediente."
              : credencial.accion === "soporte"
                ? "Es una configuración del servidor: contacta a soporte de ContaClick."
                : "Reemplaza la e.firma del expediente con el .cer, el .key y su contraseña.",
        }
      : dec;

  const previo = conMotivo(decidirEstadoSat(entrada));
  if (!previo.puede_ejecutar || ent.es_sandbox || !meta.consumeSaldoProveedor) {
    return { ...base, ...previo };
  }

  // Sólo un proveedor con saldo contratado obliga a consultar el libro interno.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const pac = await leerSaldoPac(supabaseAdmin as any);
  const esSuperAdmin = !!(sa as any[])?.length;
  const nivel = nivelPac(pac.disponible, previstas, pac.umbral_critico);

  return {
    ...base,
    servicio: esSuperAdmin
      ? { disponible: pac.disponible, reservado: pac.reservado, umbral_critico: pac.umbral_critico, nivel }
      : undefined,
    ...conMotivo(decidirEstadoSat({ ...entrada, nivelServicio: nivel })),
  };

}

/**
 * Superficie única del candado: la interfaz NUNCA decide por su cuenta si se
 * puede sincronizar, y siempre recibe motivo + acción concreta.
 */
export const estadoServicioSat = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<EstadoServicioSat> => {
    const scope = await assertClienteScope(context.supabase as any, context.userId, data.cliente_id);
    return calcularEstado(context.supabase, context.userId, scope);
  });

// ============= EJECUCIÓN =============

const RunSchema = z.object({
  cliente_id: z.string().uuid(),
  origen: z.enum(["manual", "expediente"]).default("manual"),
  cascade: z.boolean().default(true),
});

/** Error operativo controlado: se devuelve al cliente, NUNCA se lanza. */
export type FalloSatSync = {
  ok: false;
  error: {
    etapa: "preflight" | "cuota" | "solicitud" | "cosecha";
    codigo: string;
    mensaje: string;
    accion: string;
    corrida_creada: boolean;
    solicitud_enviada: boolean;
    run_id: string | null;
  };
};

function fallo(e: FalloSatSync["error"]): FalloSatSync {
  return { ok: false, error: e };
}

export const runSyncNow = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => RunSchema.parse(d))
  .handler(async ({ data, context }): Promise<any> => {
    const { supabase, userId } = context;
    const inicio = Date.now();

    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);
    const { data: cli } = await supabase
      .from("clientes")
      .select("id, rfc, razon_social, despacho_id")
      .eq("id", scope.cliente_id)
      .maybeSingle();
    if (!cli?.despacho_id || !cli.rfc) {
      return fallo({
        etapa: "preflight",
        codigo: "expediente_incompleto",
        mensaje: "El expediente no existe o no tiene RFC capturado.",
        accion: "Captura el RFC del expediente antes de descargar comprobantes.",
        corrida_creada: false,
        solicitud_enviada: false,
        run_id: null,
      });
    }

    // 1) PREFLIGHT COMPLETO. Incluye verificar que la e.firma se puede DESCIFRAR
    //    con su AAD y su versión de llave: si aquí falla, no se crea corrida,
    //    no se consume cuota, no queda candado y no se contacta al SAT.
    const estado = await calcularEstado(supabase, userId, scope, { verificarDescifrado: true });
    if (!estado.puede_ejecutar) {
      return fallo({
        etapa: "preflight",
        codigo: estado.causa === "sin_credencial" ? estado.credencial.motivo : estado.causa,
        mensaje: estado.motivo ?? "La descarga SAT no está disponible en este momento.",
        accion: estado.accion ?? "Revisa la configuración del expediente.",
        corrida_creada: false,
        solicitud_enviada: false,
        run_id: null,
      });
    }


    const { data: cfg } = await supabase
      .from("sat_sync_config")
      .select("*")
      .eq("cliente_id", scope.cliente_id)
      .maybeSingle();

    const proveedor = estado.proveedor;
    const meta = PROVEEDORES[proveedor];
    const { desde, hasta } = estado.rango;
    const direcciones = estado.direcciones;

    // 2) Idempotencia: una sola corrida activa por proveedor+expediente+ventana.
    const idem = llaveCorrida({
      proveedor,
      clienteId: scope.cliente_id,
      direcciones,
      tipo: "CFDI",
      desde,
      hasta,
    });

    const { data: runIns, error: runErr } = await supabase
      .from("sat_sync_runs")
      .insert({
        despacho_id: cli.despacho_id,
        cliente_id: cli.id,
        origen: data.origen,
        proveedor,
        tipo: direcciones.length === 2 ? "ambos" : (direcciones[0] ?? "recibidos"),
        desde,
        hasta,
        estado: "solicitando",
        estatus: "en_curso",
        idempotency_key: idem,
        triggered_by: userId,
      })
      .select("id")
      .single();

    if (runErr || !runIns) {
      // El índice único parcial rechazó una segunda corrida simultánea.
      if ((runErr as any)?.code === "23505") {
        const { data: viva } = await supabase
          .from("sat_sync_runs")
          .select("id, estado")
          .eq("idempotency_key", idem)
          .in("estado", ESTADOS_ACTIVOS)
          .maybeSingle();
        return {
          ok: true,
          duplicada: true,
          run_id: (viva as any)?.id ?? null,
          estado: ((viva as any)?.estado ?? "esperando_sat") as EstadoCorrida,
          mensaje:
            "Ya hay una corrida en proceso para este mismo periodo. El SAT es asíncrono: " +
            "la descarga continúa en segundo plano.",
          nuevos: 0,
          duplicados: 0,
          rechazados: 0,
          errores: [] as { fase: string; mensaje: string }[],
        };
      }
      throw new Error(runErr?.message ?? "No se pudo registrar la corrida.");
    }
    const runId = runIns.id as string;

    // 3) Cuota del plan (siempre) y saldo del proveedor (sólo PAC).
    let reservaKey: string | null = null;
    try {
      const res = await assertSatRunPermitido({
        supabase,
        despachoId: cli.despacho_id,
        frecuencia: (cfg?.frecuencia ?? "manual") as FrecuenciaSat,
        previstas: estado.previstas,
        runId,
        esMock: estado.es_sandbox,
        usaSaldoProveedor: meta.consumeSaldoProveedor,
      });
      reservaKey = res.reservaKey;
    } catch (e: any) {
      const mensaje = String(e?.message ?? e).slice(0, 300);
      await supabase
        .from("sat_sync_runs")
        .update({
          estado: "error",
          estatus: "error",
          cobertura: "nula",
          finalizado_at: new Date().toISOString(),
          duracion_ms: Date.now() - inicio,
          errores: [{ fase: "cuota", mensaje }] as any,
          detalle: mensaje,
        })
        .eq("id", runId);
      return fallo({
        etapa: "cuota",
        codigo: "cuota_o_saldo",
        mensaje,
        accion: "Revisa el límite de solicitudes de tu plan o espera al siguiente periodo.",
        corrida_creada: true,
        solicitud_enviada: false,
        run_id: runId,
      });

    }

    const errores: { fase: string; mensaje: string }[] = [];
    let solicitudes: SolicitudRegistro[] = [];
    let resumen = resolverEstadoCorrida([]);

    try {
      if (estado.es_sandbox) {
        // Cuenta demo: NO se contacta al SAT y se etiqueta con claridad.
        const { simularCorridaDemo } = await import("@/lib/sat/demo-sat.server");
        const sim = await simularCorridaDemo({
          supabase,
          despachoId: cli.despacho_id,
          clienteId: cli.id,
          runId,
          direcciones,
          desde,
          hasta,
        });
        solicitudes = sim.solicitudes;
        resumen = sim.resumen;
      } else {
        const { solicitarDescargas, cosecharCorrida } = await import(
          "@/lib/sat/sat-directo-runner.server"
        );
        const envio = await solicitarDescargas({
          supabase,
          clienteId: cli.id,
          despachoId: cli.despacho_id,
          rfc: cli.rfc,
          desde,
          hasta,
          direcciones,
        });
        for (const m of envio.errores) errores.push({ fase: "solicitud", mensaje: m });
        solicitudes = envio.solicitudes;

        // Persistir antes de cosechar: si algo falla, la corrida no se pierde.
        await supabase
          .from("sat_sync_runs")
          .update({ solicitudes: solicitudes as any, estado: "esperando_sat" })
          .eq("id", runId);

        const cosecha = await cosecharCorrida({
          supabase,
          despachoId: cli.despacho_id,
          clienteId: cli.id,
          rfc: cli.rfc,
          solicitudes,
        });
        solicitudes = cosecha.solicitudes;
        resumen = cosecha.resumen;
      }
    } catch (e: any) {
      // NINGUNA excepción puede dejar la corrida viva: se cierra aquí mismo,
      // se libera el candado y se devuelve la reserva no consumida.
      const mensaje = String(e?.message ?? e).slice(0, 300);
      const conFolio = tieneFolioSat(solicitudes);
      await supabase
        .from("sat_sync_runs")
        .update({
          estado: "error",
          estatus: "error",
          cobertura: "nula",
          solicitudes: solicitudes as any,
          finalizado_at: new Date().toISOString(),
          duracion_ms: Date.now() - inicio,
          errores: [...errores, { fase: "solicitud", mensaje }] as any,
          detalle: mensaje,
        })
        .eq("id", runId);
      if (reservaKey && !conFolio) {
        await devolverReservaPac(supabase, reservaKey, "Corrida abortada antes de enviar al SAT");
      }
      return fallo({
        etapa: "solicitud",
        codigo: "fallo_solicitud",
        mensaje,
        accion: conFolio
          ? "El SAT ya recibió la solicitud. Usa Reintentar para consultar el avance."
          : "No se envió nada al SAT ni se consumió cuota. Corrige el problema y vuelve a intentar.",
        corrida_creada: true,
        solicitud_enviada: conFolio,
        run_id: runId,
      });
    }


    const { guardarAvanceCorrida } = await import("@/lib/sat/sat-directo-runner.server");
    const terminal = await guardarAvanceCorrida(supabase, runId, solicitudes, resumen);
    await supabase
      .from("sat_sync_runs")
      .update({ duracion_ms: Date.now() - inicio, errores: errores as any })
      .eq("id", runId);

    // 4) Liquidación: sólo se cobran las solicitudes efectivamente enviadas.
    const enviadas = solicitudes.filter((s) => !!s.id_solicitud).length;
    if (enviadas === 0) {
      if (reservaKey) await devolverReservaPac(supabase, reservaKey, "Ninguna solicitud enviada");
    } else {
      try {
        await registrarConsumoSat({
          supabase,
          despachoId: cli.despacho_id,
          solicitudes: enviadas,
          esMock: estado.es_sandbox,
          reservaKey,
          runId,
        });
      } catch (e: any) {
        console.warn("[sat-sync] registrar consumo falló:", e?.message ?? e);
      }
    }

    if (cfg) {
      await supabase
        .from("sat_sync_config")
        .update({
          ultima_corrida_at: new Date().toISOString(),
          proxima_corrida_at: calcularProxima((cfg.frecuencia ?? "manual") as Frecuencia),
        })
        .eq("cliente_id", cli.id);
    }

    await supabase
      .from("sat_credenciales")
      .update({
        last_sync_at: new Date().toISOString(),
        // El error de una CORRIDA no es un error del certificado: la e.firma
        // sigue conectada y su tarjeta no debe mostrar el rechazo del request.
        last_error: null,
        estatus: "activo",
      })
      .eq("cliente_id", cli.id);

    if (resumen.xml_nuevos > 0) {
      await supabase.from("alertas").insert({
        despacho_id: cli.despacho_id,
        cliente_id: cli.id,
        nivel: "bajo",
        tipo: "sat_sync",
        titulo: `${resumen.xml_nuevos} CFDI nuevos descargados`,
        descripcion: `Descarga masiva ${desde} → ${hasta} (${cli.rfc})`,
      });
    }
    if (resumen.advertencia) {
      await supabase.from("alertas").insert({
        despacho_id: cli.despacho_id,
        cliente_id: cli.id,
        nivel: "medio",
        tipo: "sat_sync_parcial",
        titulo: "Descarga SAT con cobertura parcial",
        descripcion: resumen.advertencia,
      });
    }

    await supabase.from("audit_logs").insert({
      user_id: userId,
      despacho_id: cli.despacho_id,
      accion: "sat_sync.run",
      entidad: "cliente",
      entidad_id: cli.id,
      payload: {
        run_id: runId,
        proveedor,
        estado: resumen.estado,
        cobertura: resumen.cobertura,
        solicitudes_enviadas: enviadas,
        nuevos: resumen.xml_nuevos,
        duplicados: resumen.duplicados,
        rechazados: resumen.rechazados,
        errores,
      },
    });

    // 5) Cascada SOLO si la corrida terminó y trajo comprobantes nuevos.
    if (data.cascade && terminal && resumen.xml_nuevos > 0) {
      await recalcularYCerrar({
        supabase,
        clienteId: cli.id,
        despachoId: cli.despacho_id,
        runId,
        resumen: {
          xml_nuevos: resumen.xml_nuevos,
          duplicados: resumen.duplicados,
          rechazados: resumen.rechazados,
        },
      });
    }

    return {
      ok: resumen.estado !== "error",
      duplicada: false,
      run_id: runId,
      estado: resumen.estado,
      cobertura: resumen.cobertura,
      advertencia: resumen.advertencia,
      nuevos: resumen.xml_nuevos,
      duplicados: resumen.duplicados,
      rechazados: resumen.rechazados,
      mensaje: terminal
        ? `Descarga terminada: ${resumen.xml_nuevos} nuevos, ${resumen.duplicados} duplicados, ${resumen.rechazados} rechazados.`
        : "Solicitud enviada al SAT. La descarga continúa en segundo plano; puedes cerrar esta pantalla.",
      errores,
    };
  });

/**
 * Recálculos posteriores a una descarga.
 *
 * Cada módulo deja un EVENTO con su resultado (ok o fallo) ligado a la corrida:
 * el detalle de la corrida debe poder responder "qué se recalculó y cuándo",
 * y una corrida no se declara completada sin esa evidencia.
 */
async function ejecutarCascada(
  clienteId: string,
  ctx?: {
    supabase: any;
    despachoId?: string | null;
    runId?: string | null;
    /** Si se indica, sólo se ejecutan estos módulos (recuperación selectiva). */
    soloModulos?: string[];
  },
) {
  // Con corrida: se usa el ejecutor con bitácora por módulo (fuente única).
  if (ctx?.supabase && ctx.runId) {
    const { ejecutarProcesamientoPosterior } = await import("./procesamiento.server");
    const { resultados } = await ejecutarProcesamientoPosterior({
      supabase: ctx.supabase,
      runId: ctx.runId,
      clienteId,
      despachoId: (ctx.despachoId ?? null) as string,
      nuevos: 1,
      soloModulos: ctx.soloModulos,
    });
    return resultados.map((r) => ({
      modulo: r.module_id,
      ok: r.estado === "completado" || r.estado === "omitido" || r.estado === "recuperado",
      mensaje: r.motivo ?? undefined,
      ms: 0,
    }));
  }

  // Sin corrida (recálculo suelto): se ejecuta sin bitácora de corrida.
  const resultados: Array<{ modulo: string; ok: boolean; mensaje?: string; ms: number }> = [];
  const filtro = ctx?.soloModulos;
  const safe = async (fn: () => Promise<any>, modulo: string) => {
    if (filtro && !filtro.includes(modulo)) return;
    const t0 = Date.now();
    try {
      await fn();
      resultados.push({ modulo, ok: true, ms: Date.now() - t0 });
    } catch (e: any) {
      const mensaje = String(e?.message ?? e).slice(0, 250);
      console.warn(`[sat-sync cascada] ${modulo} falló:`, mensaje);
      resultados.push({ modulo, ok: false, mensaje, ms: Date.now() - t0 });
    }
  };
  await safe(() => computeSaludFiscal({ data: { cliente_id: clienteId } }), "salud_fiscal");
  await safe(() => computeRiesgoSAT({ data: { cliente_id: clienteId } }), "riesgo_sat");
  await safe(() => runExpressAudit({ data: { cliente_id: clienteId } }), "auditor_cfdi");
  await safe(() => scanClienteEfos({ data: { cliente_id: clienteId } }), "efos");
  return resultados;
}


/** Ejecuta los recálculos y cierra la corrida que quedó en `recalculando`. */
async function recalcularYCerrar(args: {
  supabase: any;
  clienteId: string;
  despachoId?: string | null;
  runId: string;
  resumen: { xml_nuevos: number; duplicados: number; rechazados: number };
}) {
  await ejecutarCascada(args.clienteId, {
    supabase: args.supabase,
    despachoId: args.despachoId,
    runId: args.runId,
  });
  const { cerrarTrasRecalculo } = await import("@/lib/sat/sat-directo-runner.server");
  await cerrarTrasRecalculo(args.supabase, args.runId, args.resumen);
}

/**
 * Cosecha manual desde la interfaz: consulta al SAT las solicitudes vivas del
 * expediente y, si alguna terminó, ingesta y recalcula.
 */
export const cosecharAhora = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);

    const { data: runs } = await supabase
      .from("sat_sync_runs")
      .select("id, solicitudes")
      .eq("cliente_id", scope.cliente_id)
      .eq("despacho_id", scope.despacho_id)
      .in("estado", ESTADOS_ACTIVOS)
      .order("iniciado_at", { ascending: false })
      .limit(5);

    if (!runs?.length) {
      return { ok: true, revisadas: 0, nuevos: 0, terminadas: 0 };
    }

    const { cosecharCorrida, guardarAvanceCorrida } = await import(
      "@/lib/sat/sat-directo-runner.server"
    );
    let nuevos = 0;
    let terminadas = 0;
    for (const run of runs) {
      const sols = ((run as any).solicitudes ?? []) as SolicitudRegistro[];
      if (!sols.length) continue;
      const r = await cosecharCorrida({
        supabase,
        despachoId: scope.despacho_id,
        clienteId: scope.cliente_id,
        runId: (run as any).id as string,
        solicitudes: sols,
      });
      nuevos += r.resumen.xml_nuevos;
      if (await guardarAvanceCorrida(supabase, (run as any).id, r.solicitudes, r.resumen)) {
        terminadas++;
        if (r.resumen.xml_nuevos > 0) {
          await recalcularYCerrar({
            supabase,
            clienteId: scope.cliente_id,
            despachoId: scope.despacho_id,
            runId: (run as any).id as string,
            resumen: {
              xml_nuevos: r.resumen.xml_nuevos,
              duplicados: r.resumen.duplicados,
              rechazados: r.resumen.rechazados,
            },
          });
        }
      }
    }
    return { ok: true, revisadas: runs.length, nuevos, terminadas };
  });

/**
 * REINTENTO MANUAL de una corrida detenida.
 *
 * Reabre únicamente las solicitudes que el SAT todavía puede entregar
 * (folio vivo y código reintentable), vuelve a poner la corrida en curso y
 * hace una cosecha inmediata. Lo ya descargado NO se pierde y lo vencido o
 * rechazado se informa como irrecuperable, para que el usuario genere una
 * corrida nueva en vez de esperar en falso.
 */
/**
 * Salida segura para una corrida atorada.
 *
 * No reenvía nada al SAT ni borra evidencia: sólo cierra la corrida cuando es
 * seguro (sin folio SAT, o con folio pero abandonada más de 24 h), liberando
 * el candado para poder configurar una corrida nueva.
 */
export const cerrarCorridaSat = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), run_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);

    const { data: run } = await supabase
      .from("sat_sync_runs")
      .select("id, estado, iniciado_at, solicitudes, errores")
      .eq("id", data.run_id)
      .eq("cliente_id", scope.cliente_id)
      .eq("despacho_id", scope.despacho_id)
      .maybeSingle();
    if (!run) throw new Error("No se encontró la corrida en este expediente.");

    const veredicto = puedeCerrarseManualmente(run as any);
    if (!veredicto.permitido) return { ok: false, mensaje: veredicto.motivo };

    const { cerrarCorridaConError, diagnostico } = await import("@/lib/sat/saneamiento.server");
    await cerrarCorridaConError(
      supabase,
      data.run_id,
      diagnostico({
        codigo: "cerrada_por_usuario",
        etapa: String((run as any).estado),
        folioSat: tieneFolioSat(((run as any).solicitudes ?? []) as SolicitudRegistro[]),
        mensaje: veredicto.motivo,
        accion: "Configura una corrida nueva cuando la e.firma esté conectada y vigente.",
      }),
    );

    await supabase.from("audit_logs").insert({
      user_id: userId,
      despacho_id: scope.despacho_id,
      accion: "sat_sync.cerrar_corrida",
      entidad: "sat_sync_run",
      entidad_id: data.run_id,
      payload: { motivo: veredicto.motivo, minutos_limite: MINUTOS_ATORADA },
    });

    return { ok: true, mensaje: "Corrida cerrada. Ya puedes iniciar una sincronización nueva." };
  });

export const reintentarCorrida = createServerFn({ method: "POST" })

  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), run_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);

    const { data: run } = await supabase
      .from("sat_sync_runs")
      .select("id, estado, solicitudes")
      .eq("id", data.run_id)
      .eq("cliente_id", scope.cliente_id)
      .eq("despacho_id", scope.despacho_id)
      .maybeSingle();

    if (!run) throw new Error("No se encontró la corrida en este expediente.");

    const sols = ((run as any).solicitudes ?? []) as SolicitudRegistro[];
    if (!sols.length) {
      throw new Error(
        "Esta corrida no registró solicitudes en el SAT. Ejecuta una sincronización nueva.",
      );
    }

    const reap = reabrirSolicitudes(sols);
    if (reap.reabiertas === 0) {
      return {
        ok: false,
        reabiertas: 0,
        nuevos: 0,
        terminada: false,
        irrecuperables: reap.irrecuperables,
        mensaje:
          reap.irrecuperables[0]?.motivo ??
          "No hay solicitudes reintentables en esta corrida. Genera una corrida nueva.",
      };
    }

    // Se vuelve a poner en curso ANTES de cosechar: guardarAvanceCorrida
    // sólo escribe sobre corridas vivas.
    const { error: errUp } = await supabase
      .from("sat_sync_runs")
      .update({
        estado: "esperando_sat",
        estatus: estatusLegado("esperando_sat" as EstadoCorrida),
        solicitudes: reap.solicitudes as any,
      })
      .eq("id", (run as any).id);
    if (errUp) {
      throw new Error(
        "No se pudo reabrir la corrida (probablemente ya hay otra en proceso con el mismo periodo).",
      );
    }

    const { cosecharCorrida, guardarAvanceCorrida } = await import(
      "@/lib/sat/sat-directo-runner.server"
    );
    const r = await cosecharCorrida({
      supabase,
      despachoId: scope.despacho_id,
      clienteId: scope.cliente_id,
      runId: (run as any).id as string,
      solicitudes: reap.solicitudes,
    });
    const terminada = await guardarAvanceCorrida(
      supabase,
      (run as any).id,
      r.solicitudes,
      r.resumen,
    );
    if (r.resumen.xml_nuevos > 0) {
      await recalcularYCerrar({
        supabase,
        clienteId: scope.cliente_id,
        despachoId: scope.despacho_id,
        runId: (run as any).id as string,
        resumen: {
          xml_nuevos: r.resumen.xml_nuevos,
          duplicados: r.resumen.duplicados,
          rechazados: r.resumen.rechazados,
        },
      });
    }

    return {
      ok: true,
      reabiertas: reap.reabiertas,
      nuevos: r.resumen.xml_nuevos,
      terminada: !!terminada,
      irrecuperables: reap.irrecuperables,
      mensaje: `Se reabrieron ${reap.reabiertas} solicitud(es) · ${r.resumen.xml_nuevos} CFDI nuevos.`,
    };
  });

/**
 * Consume los avisos `recalculo_pendiente` que dejó el cron y ejecuta la
 * cascada con la sesión del usuario (el cron no tiene permisos de usuario).
 */
export const aplicarRecalculosPendientes = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);
    const { data: pend } = await supabase
      .from("sat_sync_eventos")
      .select("id, run_id")
      .eq("cliente_id", scope.cliente_id)
      .eq("despacho_id", scope.despacho_id)
      .eq("tipo", "recalculo_pendiente")
      .limit(20);
    if (!pend?.length) return { ok: true, recalculado: false };

    await ejecutarCascada(scope.cliente_id, {
      supabase,
      despachoId: scope.despacho_id,
      runId: (pend[0] as any)?.run_id ?? null,
    });
    await supabase
      .from("sat_sync_eventos")
      .update({ tipo: "recalculo_aplicado" })
      .in("id", pend.map((p: any) => p.id));

    // Las corridas que el cron dejó esperando recálculo ya pueden cerrarse:
    // la evidencia de los módulos quedó registrada arriba.
    const { cerrarTrasRecalculo } = await import("@/lib/sat/sat-directo-runner.server");
    const { data: pendientesRun } = await supabase
      .from("sat_sync_runs")
      .select("id, nuevos, duplicados, rechazados")
      .eq("cliente_id", scope.cliente_id)
      .eq("estado", "recalculando");
    for (const r of pendientesRun ?? []) {
      await cerrarTrasRecalculo(supabase, (r as any).id, {
        xml_nuevos: Number((r as any).nuevos ?? 0),
        duplicados: Number((r as any).duplicados ?? 0),
        rechazados: Number((r as any).rechazados ?? 0),
      });
    }
    return { ok: true, recalculado: true, cerradas: (pendientesRun ?? []).length };
  });

// ============= PAUSA / REANUDA =============

export const setSyncActivo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid(), activo: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await assertClienteScope(context.supabase as any, context.userId, data.cliente_id);
    const { error } = await context.supabase
      .from("sat_sync_config")
      .update({ activo: data.activo })
      .eq("cliente_id", scope.cliente_id)
      .eq("despacho_id", scope.despacho_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export { estatusLegado };
