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
import {
  ESTADOS_ACTIVOS,
  estatusLegado,
  reabrirSolicitudes,
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
      supabase.from("sat_sync_runs").select("iniciado_at, cliente_id, estado, estatus").eq("despacho_id", despachoId).eq("cliente_id", clienteId).order("iniciado_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("sat_sync_runs").select("id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("cliente_id", clienteId).gte("iniciado_at", hoy.toISOString()),
      supabase.from("sat_sync_eventos").select("id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("cliente_id", clienteId).eq("tipo", "nuevo").gte("created_at", hoy.toISOString()),
      supabase.from("sat_sync_runs").select("id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("cliente_id", clienteId).in("estado", ["error", "vencida"]).gte("iniciado_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      supabase.from("sat_sync_runs").select("id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("cliente_id", clienteId).in("estado", ESTADOS_ACTIVOS),
      supabase.from("sat_sync_runs").select("id, cliente_id, iniciado_at, finalizado_at, estado, estatus, cobertura, advertencia, descargados, nuevos, duplicados, rechazados, errores, clientes(rfc, razon_social)").eq("despacho_id", despachoId).eq("cliente_id", clienteId).order("iniciado_at", { ascending: false }).limit(15),
      supabase.from("sat_credenciales").select("cliente_id, estatus, last_error, clientes(rfc, razon_social)").eq("despacho_id", despachoId).eq("cliente_id", clienteId).neq("estatus", "activo").limit(10),
      supabase.from("sat_credenciales").select("cliente_id, estatus, last_error, last_sync_at, clientes(rfc, razon_social)").eq("despacho_id", despachoId).eq("cliente_id", clienteId).eq("estatus", "error").limit(10),
      supabase.from("sat_sync_eventos").select("id, tipo, uuid_cfdi, monto, mensaje, created_at, cliente_id, clientes(rfc, razon_social)").eq("despacho_id", despachoId).eq("cliente_id", clienteId).order("created_at", { ascending: false }).limit(20),
    ]);

    return {
      conectados: conectados ?? 0,
      ultima: ultima?.iniciado_at ?? null,
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
  efirma_vence_at: string | null;
  corrida_activa: { id: string; estado: EstadoCorrida; iniciado_at: string } | null;
  /** Sólo para super-admin: estado interno del proveedor con saldo. */
  servicio?: { disponible: number; reservado: number; umbral_critico: number; nivel: string };
};

/** Núcleo compartido por `estadoServicioSat` y `runSyncNow`. */
async function calcularEstado(
  supabase: any,
  userId: string,
  scope: { cliente_id: string; despacho_id: string },
): Promise<EstadoServicioSat> {
  const ent = await getEntitlements(supabase, scope.despacho_id);

  const [{ data: cfg }, { data: cred }, { data: sa }] = await Promise.all([
    supabase
      .from("sat_sync_config")
      .select("proveedor, emitidos, recibidos, periodo, fecha_desde, fecha_hasta")
      .eq("cliente_id", scope.cliente_id)
      .eq("despacho_id", scope.despacho_id)
      .maybeSingle(),
    supabase
      .from("sat_credenciales")
      .select("estatus, vigencia_hasta, efirma_cer, efirma_key_enc")
      .eq("cliente_id", scope.cliente_id)
      .eq("despacho_id", scope.despacho_id)
      .maybeSingle(),
    supabase.from("user_roles").select("user_id").eq("user_id", userId).eq("role", "super_admin").limit(1),
  ]);

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

  const credencialActiva =
    (cred as any)?.estatus === "activo" &&
    !!(cred as any)?.efirma_cer &&
    !!(cred as any)?.efirma_key_enc;
  const efirmaVenceAt = ((cred as any)?.vigencia_hasta ?? null) as string | null;

  const { data: activa } = await supabase
    .from("sat_sync_runs")
    .select("id, estado, iniciado_at, desde, hasta")
    .eq("cliente_id", scope.cliente_id)
    .eq("despacho_id", scope.despacho_id)
    .in("estado", ESTADOS_ACTIVOS)
    .order("iniciado_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const mismaVentana =
    !!activa && (activa as any).desde === rango.desde && (activa as any).hasta === rango.hasta;

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
    efirma_vence_at: efirmaVenceAt,
    corrida_activa: activa
      ? {
          id: (activa as any).id as string,
          estado: (activa as any).estado as EstadoCorrida,
          iniciado_at: (activa as any).iniciado_at as string,
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

  const previo = decidirEstadoSat(entrada);
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
    ...decidirEstadoSat({ ...entrada, nivelServicio: nivel }),
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

export const runSyncNow = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => RunSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const inicio = Date.now();

    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);
    const { data: cli } = await supabase
      .from("clientes")
      .select("id, rfc, razon_social, despacho_id")
      .eq("id", scope.cliente_id)
      .maybeSingle();
    if (!cli?.despacho_id || !cli.rfc) throw new Error("Expediente no encontrado o sin RFC.");

    // 1) Candado único. Si no se puede ejecutar NO se crea corrida ni se consume nada.
    const estado = await calcularEstado(supabase, userId, scope);
    if (!estado.puede_ejecutar) {
      throw new Error(
        [estado.motivo, estado.accion].filter(Boolean).join(" ") ||
          "La descarga SAT no está disponible en este momento.",
      );
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
      throw new Error(mensaje);
    }

    const errores: { fase: string; mensaje: string }[] = [];
    let solicitudes: SolicitudRegistro[] = [];
    let resumen = resolverEstadoCorrida([]);

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
        solicitudes,
      });
      solicitudes = cosecha.solicitudes;
      resumen = cosecha.resumen;
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
        last_error: errores.length ? errores.map((e) => e.mensaje).join("; ").slice(0, 500) : null,
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
      await ejecutarCascada(cli.id);
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

async function ejecutarCascada(clienteId: string) {
  const safe = async (fn: () => Promise<any>, label: string) => {
    try {
      await fn();
    } catch (e: any) {
      console.warn(`[sat-sync cascada] ${label} falló:`, e?.message ?? e);
    }
  };
  await safe(() => computeSaludFiscal({ data: { cliente_id: clienteId } }), "Salud Fiscal");
  await safe(() => computeRiesgoSAT({ data: { cliente_id: clienteId } }), "Riesgo SAT");
  await safe(() => runExpressAudit({ data: { cliente_id: clienteId } }), "Auditor Express");
  await safe(() => scanClienteEfos({ data: { cliente_id: clienteId } }), "EFOS");
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
        solicitudes: sols,
      });
      nuevos += r.resumen.xml_nuevos;
      if (await guardarAvanceCorrida(supabase, (run as any).id, r.solicitudes, r.resumen)) {
        terminadas++;
      }
    }
    if (nuevos > 0) await ejecutarCascada(scope.cliente_id);
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
      solicitudes: reap.solicitudes,
    });
    const terminada = await guardarAvanceCorrida(
      supabase,
      (run as any).id,
      r.solicitudes,
      r.resumen,
    );
    if (r.resumen.xml_nuevos > 0) await ejecutarCascada(scope.cliente_id);

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
      .select("id")
      .eq("cliente_id", scope.cliente_id)
      .eq("despacho_id", scope.despacho_id)
      .eq("tipo", "recalculo_pendiente")
      .limit(20);
    if (!pend?.length) return { ok: true, recalculado: false };

    await ejecutarCascada(scope.cliente_id);
    await supabase
      .from("sat_sync_eventos")
      .update({ tipo: "recalculo_aplicado" })
      .in("id", pend.map((p: any) => p.id));
    return { ok: true, recalculado: true };
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
