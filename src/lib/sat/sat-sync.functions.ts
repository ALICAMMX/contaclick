// Módulo Descarga Masiva SAT — sincronización automática.
// Construye sobre src/lib/sat/sat.functions.ts (SW Sapien) y registra:
//   - sat_sync_config (preferencias por expediente)
//   - sat_sync_runs   (bitácora de corridas)
//   - sat_sync_eventos (novedades detectadas: nuevos, cancelados, etc.)
// Tras cada corrida exitosa dispara recálculo en cascada (Salud, Riesgo, Auditor).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";
import { computeSaludFiscal } from "@/lib/salud/salud.functions";
import { computeRiesgoSAT } from "@/lib/riesgo/riesgo.functions";
import { runExpressAudit } from "@/lib/auditor/auditor.functions";
import { scanClienteEfos } from "@/lib/efos/efos.functions";
import { assertClienteScope, assertRecordScope } from "@/lib/despacho/scope";
import {
  assertSatRunPermitido,
  contarSolicitudesPrevistas,
  devolverReservaPac,
  leerSaldoPac,
  registrarConsumoSat,
  type FrecuenciaSat,
} from "@/lib/usage/sat-quota";
import { assertFrecuencia, getEntitlements, limiteDe, usadoDe } from "@/lib/entitlements/service";


export type Frecuencia = "manual" | "diaria" | "semanal" | "mensual";
export type Periodo = "30d" | "mes_actual" | "ejercicio" | "personalizado";

const ConfigSchema = z.object({
  cliente_id: z.string().uuid(),
  emitidos: z.boolean(),
  recibidos: z.boolean(),
  nomina: z.boolean(),
  pagos: z.boolean(),
  retenciones: z.boolean(),
  frecuencia: z.enum(["manual", "diaria", "semanal", "mensual"]),
  periodo: z.enum(["30d", "mes_actual", "ejercicio", "personalizado"]),
  fecha_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  fecha_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  activo: z.boolean().default(true),
});

function resolverRango(periodo: Periodo, desde?: string | null, hasta?: string | null): { desde: string; hasta: string } {
  const hoy = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (periodo === "personalizado" && desde && hasta) return { desde, hasta };
  if (periodo === "30d") {
    const d = new Date(hoy); d.setDate(d.getDate() - 30);
    return { desde: fmt(d), hasta: fmt(hoy) };
  }
  if (periodo === "ejercicio") {
    return { desde: `${hoy.getFullYear()}-01-01`, hasta: fmt(hoy) };
  }
  // mes_actual
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

// ============= READ =============

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
    // Candado: la cuenta debe estar vigente y la frecuencia permitida por el plan
    const ent = await getEntitlements(supabase, scope.despacho_id);
    assertFrecuencia(ent, data.frecuencia as FrecuenciaSat);
    const proxima = calcularProxima(data.frecuencia);

    const { error } = await supabase.from("sat_sync_config").upsert(
      {
        cliente_id: scope.cliente_id,
        despacho_id: scope.despacho_id,
        emitidos: data.emitidos,
        recibidos: data.recibidos,
        nomina: data.nomina,
        pagos: data.pagos,
        retenciones: data.retenciones,
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

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const [{ count: conectados }, { data: ultima }, { count: hoyCount }, { count: nuevos }, { count: errores }, { count: pendientes }, { data: actividad }, { data: desconectados }, { data: conErrores }, { data: novedades }] =
      await Promise.all([
        supabase.from("sat_credenciales").select("cliente_id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("cliente_id", clienteId).eq("estatus", "activo"),
        supabase.from("sat_sync_runs").select("iniciado_at, cliente_id, estatus").eq("despacho_id", despachoId).eq("cliente_id", clienteId).order("iniciado_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("sat_sync_runs").select("id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("cliente_id", clienteId).gte("iniciado_at", hoy.toISOString()),
        supabase.from("sat_sync_eventos").select("id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("cliente_id", clienteId).eq("tipo", "nuevo").gte("created_at", hoy.toISOString()),
        supabase.from("sat_sync_runs").select("id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("cliente_id", clienteId).eq("estatus", "error").gte("iniciado_at", new Date(Date.now() - 7 * 86400000).toISOString()),
        supabase.from("sat_sync_config").select("cliente_id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("cliente_id", clienteId).eq("activo", true).or("ultima_corrida_at.is.null,ultima_corrida_at.lt." + new Date(Date.now() - 2 * 86400000).toISOString()),
        supabase.from("sat_sync_runs").select("id, cliente_id, iniciado_at, finalizado_at, estatus, descargados, nuevos, errores, clientes(rfc, razon_social)").eq("despacho_id", despachoId).eq("cliente_id", clienteId).order("iniciado_at", { ascending: false }).limit(15),
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
      pendientes: pendientes ?? 0,
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

// ============= ESTADO DEL SERVICIO (candado previo a ejecutar) =============

export type EstadoServicioSat = {
  puede_ejecutar: boolean;
  motivo: string | null;
  /** ok | sin_credencial | cuenta_bloqueada | cuota_agotada | servicio_sin_saldo | sin_seleccion */
  causa:
    | "ok"
    | "sin_credencial"
    | "cuenta_bloqueada"
    | "cuota_agotada"
    | "servicio_sin_saldo"
    | "sin_seleccion";
  /** Solicitudes que consumirá la corrida con la configuración guardada. */
  previstas: number;
  rango: { desde: string; hasta: string };
  cuota: { usado: number; limite: number; ilimitado: boolean; restante: number | null };
  es_sandbox: boolean;
  credencial_activa: boolean;
  /** Sólo para super-admin: estado real del proveedor. */
  servicio?: { disponible: number; reservado: number; umbral_critico: number; nivel: string };
};

/**
 * Superficie única del candado de descargas SAT: la UI NUNCA decide por su
 * cuenta si se puede sincronizar. Devuelve el costo estimado en solicitudes,
 * la cuota del plan y el motivo exacto de bloqueo (incluido saldo del PAC).
 */
export const estadoServicioSat = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<EstadoServicioSat> => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);
    const ent = await getEntitlements(supabase, scope.despacho_id);

    const [{ data: cfg }, { data: cred }, { data: sa }] = await Promise.all([
      supabase
        .from("sat_sync_config")
        .select("emitidos, recibidos, nomina, pagos, retenciones, periodo, fecha_desde, fecha_hasta")
        .eq("cliente_id", scope.cliente_id)
        .eq("despacho_id", scope.despacho_id)
        .maybeSingle(),
      supabase
        .from("sat_credenciales")
        .select("estatus")
        .eq("cliente_id", scope.cliente_id)
        .eq("despacho_id", scope.despacho_id)
        .maybeSingle(),
      supabase.from("user_roles").select("user_id").eq("user_id", userId).eq("role", "super_admin").limit(1),
    ]);

    const c = (cfg ?? {
      emitidos: true, recibidos: true, nomina: true, pagos: true, retenciones: false,
      periodo: "mes_actual", fecha_desde: null, fecha_hasta: null,
    }) as any;

    const rango = resolverRango(c.periodo as Periodo, c.fecha_desde, c.fecha_hasta);
    const previstas = contarSolicitudesPrevistas({
      emitidos: !!c.emitidos,
      recibidos: !!c.recibidos,
      nomina: !!c.nomina,
      pagos: !!c.pagos,
      retenciones: !!c.retenciones,
      fecha_desde: rango.desde,
      fecha_hasta: rango.hasta,
    });

    const limite = limiteDe(ent, "sat_solicitudes");
    const usado = usadoDe(ent, "sat_solicitudes");
    const ilimitado = limite < 0;
    const restante = ilimitado ? null : Math.max(0, limite - usado);
    const credencialActiva = (cred as any)?.estatus === "activo";

    const cuota = { usado, limite, ilimitado, restante };
    const base = {
      previstas,
      rango,
      cuota,
      es_sandbox: ent.es_sandbox,
      credencial_activa: credencialActiva,
    };

    if (!ent.acceso) {
      return { ...base, puede_ejecutar: false, causa: "cuenta_bloqueada", motivo: ent.motivo_bloqueo };
    }
    if (previstas <= 0) {
      return {
        ...base,
        puede_ejecutar: false,
        causa: "sin_seleccion",
        motivo: "Selecciona al menos un tipo de comprobante para descargar.",
      };
    }
    if (!credencialActiva) {
      return {
        ...base,
        puede_ejecutar: false,
        causa: "sin_credencial",
        motivo: "Este expediente no tiene una credencial SAT activa (e.firma o CIEC). Conéctala antes de sincronizar.",
      };
    }
    if (!ilimitado && restante !== null && previstas > restante) {
      return {
        ...base,
        puede_ejecutar: false,
        causa: "cuota_agotada",
        motivo: `Esta corrida requiere ${previstas} solicitudes y a tu plan le quedan ${restante} en el periodo ${ent.periodo}. Reduce el rango o los tipos de comprobante, o mejora tu plan.`,
      };
    }

    // Sandbox/demo no toca el saldo real del proveedor.
    if (ent.es_sandbox) {
      return { ...base, puede_ejecutar: true, causa: "ok", motivo: null };
    }

    // El saldo global del PAC es información interna: se lee con privilegios y
    // sólo se devuelve en detalle al super-admin.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pac = await leerSaldoPac(supabaseAdmin as any);
    const esSuperAdmin = !!(sa as any[])?.length;
    const nivel =
      pac.disponible <= 0 ? "agotado" : pac.disponible < previstas ? "insuficiente"
        : pac.disponible <= pac.umbral_critico ? "critico" : "ok";
    const servicio = esSuperAdmin
      ? { disponible: pac.disponible, reservado: pac.reservado, umbral_critico: pac.umbral_critico, nivel }
      : undefined;

    if (nivel === "agotado" || nivel === "insuficiente") {
      return {
        ...base,
        servicio,
        puede_ejecutar: false,
        causa: "servicio_sin_saldo",
        motivo:
          "El servicio de descarga masiva SAT está temporalmente sin saldo operativo. " +
          "No se consumirá nada de tu cuota: el administrador ya fue notificado y podrás reintentar en cuanto se recargue.",
      };
    }

    return { ...base, servicio, puede_ejecutar: true, causa: "ok", motivo: null };
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

    await assertClienteScope(supabase as any, userId, data.cliente_id);
    const { data: cli } = await supabase
      .from("clientes")
      .select("id, rfc, razon_social, despacho_id")
      .eq("id", data.cliente_id)
      .maybeSingle();
    if (!cli?.despacho_id) throw new Error("Expediente no encontrado");

    // Config (o defaults)
    const { data: cfg } = await supabase
      .from("sat_sync_config")
      .select("*")
      .eq("cliente_id", data.cliente_id)
      .maybeSingle();
    const periodo = (cfg?.periodo ?? "mes_actual") as Periodo;
    const { desde, hasta } = resolverRango(periodo, cfg?.fecha_desde, cfg?.fecha_hasta);

    // Credencial
    const { data: cred } = await supabase
      .from("sat_credenciales")
      .select("pac_token, estatus, proveedor, efirma_cer, efirma_key_enc")
      .eq("cliente_id", data.cliente_id)
      .maybeSingle();
    const usaSatDirecto = !!cred?.efirma_cer && !!cred?.efirma_key_enc;


    // Crear run
    const { data: runIns, error: runErr } = await supabase
      .from("sat_sync_runs")
      .insert({
        despacho_id: cli.despacho_id,
        cliente_id: cli.id,
        origen: data.origen,
        tipo: cfg?.emitidos && cfg?.recibidos ? "ambos" : cfg?.emitidos ? "emitidos" : cfg?.recibidos ? "recibidos" : "ambos",
        desde, hasta,
        estatus: "en_curso",
        triggered_by: userId,
      })
      .select("id")
      .single();
    if (runErr || !runIns) throw new Error(runErr?.message ?? "No se pudo registrar la corrida");
    const runId = runIns.id as string;

    const errores: { fase: string; mensaje: string }[] = [];
    let descargados = 0, nuevos = 0, cancelados = 0, duplicados = 0;

    let solicitudesPrevistas = 0;
    let esMockRun = false;
    let reservaKey: string | null = null;

    if (!cred || cred.estatus !== "activo") {
      errores.push({
        fase: "credencial",
        mensaje: "El expediente no tiene credenciales SAT activas (e.firma o CIEC).",
      });
    } else {
    // Con e.firma propia la descarga es directa contra el SAT: costo $0, sin PAC.
    const isMock = !usaSatDirecto && (cred.pac_token?.startsWith("mock_") || !process.env.SW_USER);
    esMockRun = !!isMock;

    // ===== Candados de uso: acceso, frecuencia, cuota del plan y saldo del PAC =====
    try {
      solicitudesPrevistas = contarSolicitudesPrevistas({
        emitidos: !!cfg?.emitidos,
        recibidos: !!cfg?.recibidos,
        nomina: !!cfg?.nomina,
        pagos: !!cfg?.pagos,
        retenciones: !!cfg?.retenciones,
        fecha_desde: desde,
        fecha_hasta: hasta,
      });
      if (solicitudesPrevistas === 0) solicitudesPrevistas = 1; // sin tipos: al menos 1

      const res = await assertSatRunPermitido({
        supabase,
        despachoId: cli.despacho_id,
        frecuencia: (cfg?.frecuencia ?? "manual") as FrecuenciaSat,
        previstas: solicitudesPrevistas,
        runId,
        // SAT directo (e.firma) y demo no consumen saldo del proveedor.
        esMock: !!isMock || usaSatDirecto,
      });
      reservaKey = res.reservaKey;
    } catch (e: any) {
      errores.push({ fase: "cuota", mensaje: String(e?.message ?? e).slice(0, 300) });
    }

      try {
        if (errores.length > 0) {
          // hubo error de cuota: no llamamos al PAC
        } else if (isMock) {

          // Simulación realista: insertar entre 0-4 CFDI "descubiertos" como eventos.
          descargados = Math.floor(Math.random() * 5);
          nuevos = descargados;
          cancelados = Math.random() > 0.85 ? 1 : 0;
          for (let i = 0; i < descargados; i++) {
            const uuid = crypto.randomUUID();
            await supabase.from("sat_sync_eventos").insert({
              despacho_id: cli.despacho_id, cliente_id: cli.id, run_id: runId,
              tipo: "nuevo", uuid_cfdi: uuid, monto: Math.round(Math.random() * 50000) / 10,
              mensaje: "CFDI detectado en descarga masiva (demo)",
            });
          }
          if (cancelados > 0) {
            await supabase.from("sat_sync_eventos").insert({
              despacho_id: cli.despacho_id, cliente_id: cli.id, run_id: runId,
              tipo: "cancelado", uuid_cfdi: crypto.randomUUID(),
              mensaje: "CFDI con estatus cancelado en SAT",
            });
          }
        } else {
          // SAT directo con e.firma: se envían las solicitudes (asíncronas, costo $0).
          // El cron de SAT verifica y descarga los paquetes cuando el SAT los libera.
          const { solicitarDescargas, cosecharSolicitud } = await import(
            "@/lib/sat/sat-directo-runner.server"
          );
          const { solicitudes, errores: errSol } = await solicitarDescargas({
            supabase,
            clienteId: cli.id,
            rfc: cli.rfc!,
            desde,
            hasta,
            emitidos: cfg?.emitidos ?? true,
            recibidos: cfg?.recibidos ?? true,
          });
          for (const m of errSol) errores.push({ fase: "solicitud", mensaje: m });

          // Primer intento de cosecha inmediata (a veces el SAT responde en segundos)
          const estado: any[] = [];
          for (const s of solicitudes) {
            try {
              const r = await cosecharSolicitud({
                supabase,
                despachoId: cli.despacho_id,
                clienteId: cli.id,
                solicitud: s,
              });
              estado.push(r.solicitud);
              nuevos += r.nuevos;
              descargados += r.nuevos + r.duplicados;
              duplicados += r.duplicados;
            } catch (e: any) {
              estado.push({ ...s, mensaje: String(e?.message ?? e).slice(0, 250) });
            }
          }
          await supabase
            .from("sat_sync_runs")
            .update({ proveedor: "sat_directo", solicitudes: estado })
            .eq("id", runId);
          if (estado.some((s) => s.estado === "pendiente")) {
            errores.length === 0 &&
              (await supabase.from("sat_sync_eventos").insert({
                despacho_id: cli.despacho_id,
                cliente_id: cli.id,
                run_id: runId,
                tipo: "info",
                mensaje:
                  "Solicitud enviada al SAT. La descarga se completará automáticamente cuando el SAT libere los paquetes (puede tardar de minutos a horas).",
              }));
          }
        }


        // Detección de duplicados: cualquier hash repetido en cfdi_xml del expediente
        const { data: dupHashes } = await supabase
          .from("cfdi_xml")
          .select("archivo_hash")
          .eq("cliente_id", cli.id)
          .gte("fecha", desde)
          .lte("fecha", hasta);
        const seen = new Set<string>();
        for (const h of dupHashes ?? []) {
          if (h.archivo_hash && seen.has(h.archivo_hash)) duplicados++;
          if (h.archivo_hash) seen.add(h.archivo_hash);
        }
      } catch (e: any) {
        errores.push({ fase: "ejecucion", mensaje: String(e?.message ?? e).slice(0, 300) });
      }
    }

    const fin = Date.now();
    // Si el SAT dejó solicitudes en proceso, la corrida sigue "en_curso": el cron la cosecha.
    const { data: runActual } = await supabase
      .from("sat_sync_runs")
      .select("solicitudes")
      .eq("id", runId)
      .maybeSingle();
    const esperandoSat = ((runActual?.solicitudes ?? []) as any[]).some(
      (s) => s?.estado === "pendiente",
    );
    const estatus = esperandoSat
      ? "en_curso"
      : errores.length === 0
        ? "exitoso"
        : descargados > 0
          ? "parcial"
          : "error";

    await supabase.from("sat_sync_runs").update({
      finalizado_at: esperandoSat ? null : new Date(fin).toISOString(),
      duracion_ms: fin - inicio,
      estatus,
      descargados, nuevos, cancelados, duplicados,
      errores: errores as any,
      detalle: esperandoSat
        ? "Solicitud enviada al SAT. Se completará automáticamente al liberar los paquetes."
        : estatus === "error"
          ? "La corrida no pudo completarse"
          : `Descargados: ${descargados}, nuevos: ${nuevos}, cancelados: ${cancelados}`,
    }).eq("id", runId);


    // Liquidación: consumo real del despacho + cierre de la reserva del PAC.
    // Si la corrida falló, se devuelve la reserva completa (no se cobra nada).
    if (estatus === "error") {
      if (reservaKey) {
        await devolverReservaPac(supabase, reservaKey, "Corrida SAT fallida");
      }
    } else if (solicitudesPrevistas > 0) {
      try {
        await registrarConsumoSat({
          supabase,
          despachoId: cli.despacho_id,
          solicitudes: solicitudesPrevistas,
          esMock: esMockRun || usaSatDirecto,
          reservaKey,
          runId,
        });
      } catch (e: any) {
        console.warn("[sat-sync] registrar consumo falló:", e?.message ?? e);
      }
    }


    if (cfg) {
      await supabase.from("sat_sync_config").update({
        ultima_corrida_at: new Date(fin).toISOString(),
        proxima_corrida_at: calcularProxima(cfg.frecuencia as Frecuencia, new Date(fin)),
      }).eq("cliente_id", cli.id);
    }

    if (cred && cred.estatus === "activo") {
      await supabase.from("sat_credenciales").update({
        last_sync_at: new Date(fin).toISOString(),
        last_error: errores.length ? errores.map((e) => e.mensaje).join("; ").slice(0, 500) : null,
        estatus: errores.length ? "error" : "activo",
      }).eq("cliente_id", cli.id);
    }

    // Alertas in-app por novedades
    if (nuevos > 0) {
      await supabase.from("alertas").insert({
        despacho_id: cli.despacho_id, cliente_id: cli.id,
        nivel: "bajo", tipo: "sat_sync",
        titulo: `${nuevos} CFDI nuevos detectados`,
        descripcion: `Descarga masiva ${desde} → ${hasta} (${cli.rfc})`,
      });
    }
    if (cancelados > 0) {
      await supabase.from("alertas").insert({
        despacho_id: cli.despacho_id, cliente_id: cli.id,
        nivel: "medio", tipo: "sat_sync_cancelado",
        titulo: `${cancelados} CFDI cancelados`,
        descripcion: `Revisa el efecto contable en el expediente ${cli.rfc}`,
      });
    }
    if (errores.length) {
      await supabase.from("alertas").insert({
        despacho_id: cli.despacho_id, cliente_id: cli.id,
        nivel: "alto", tipo: "sat_sync_error",
        titulo: "Falla de sincronización SAT",
        descripcion: errores.map((e) => `[${e.fase}] ${e.mensaje}`).join(" · ").slice(0, 500),
      });
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: userId, despacho_id: cli.despacho_id,
      accion: "sat_sync.run", entidad: "cliente", entidad_id: cli.id,
      payload: { run_id: runId, estatus, descargados, nuevos, cancelados, duplicados, errores },
    });

    // Cascada de recálculos (best-effort, no rompe la corrida)
    if (data.cascade && estatus !== "error") {
      const safe = async (fn: () => Promise<any>, label: string) => {
        try { await fn(); } catch (e: any) {
          console.warn(`[sat-sync cascada] ${label} falló:`, e?.message ?? e);
        }
      };
      await safe(() => computeSaludFiscal({ data: { cliente_id: cli.id } }), "Salud Fiscal");
      await safe(() => computeRiesgoSAT({ data: { cliente_id: cli.id } }), "Riesgo SAT");
      await safe(() => runExpressAudit({ data: { cliente_id: cli.id } }), "Auditor Express");
      await safe(() => scanClienteEfos({ data: { cliente_id: cli.id } }), "EFOS");
    }

    return { ok: estatus !== "error", run_id: runId, estatus, descargados, nuevos, cancelados, duplicados, errores };
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
