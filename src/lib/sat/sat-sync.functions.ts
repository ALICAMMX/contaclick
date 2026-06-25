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
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";
import {
  assertSatRunPermitido,
  assertFrecuenciaPermitida,
  contarSolicitudesPrevistas,
  registrarConsumoSat,
  type FrecuenciaSat,
} from "@/lib/usage/sat-quota";
import { getPlanLimites } from "@/lib/usage/limits";


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
    const { data: row } = await context.supabase
      .from("sat_sync_config")
      .select("*")
      .eq("cliente_id", data.cliente_id)
      .maybeSingle();
    return row;
  });

export const upsertSatSyncConfig = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => ConfigSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cli } = await supabase.from("clientes").select("despacho_id").eq("id", data.cliente_id).maybeSingle();
    if (!cli?.despacho_id) throw new Error("Expediente no encontrado");
    // Candado: la frecuencia debe estar permitida por el plan
    const limites = await getPlanLimites(supabase, cli.despacho_id);
    assertFrecuenciaPermitida(limites, data.frecuencia as FrecuenciaSat);
    const proxima = calcularProxima(data.frecuencia);

    const { error } = await supabase.from("sat_sync_config").upsert(
      {
        cliente_id: data.cliente_id,
        despacho_id: cli.despacho_id,
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

// ============= DASHBOARD =============

export const dashboardSatSync = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    if (!despachoId) return { conectados: 0, ultima: null, hoy: 0, nuevos: 0, errores: 0, pendientes: 0, actividad: [], desconectados: [], conErrores: [], novedades: [] };

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const [{ count: conectados }, { data: ultima }, { count: hoyCount }, { count: nuevos }, { count: errores }, { count: pendientes }, { data: actividad }, { data: desconectados }, { data: conErrores }, { data: novedades }] =
      await Promise.all([
        supabase.from("sat_credenciales").select("cliente_id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("estatus", "activo"),
        supabase.from("sat_sync_runs").select("iniciado_at, cliente_id, estatus").eq("despacho_id", despachoId).order("iniciado_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("sat_sync_runs").select("id", { count: "exact", head: true }).eq("despacho_id", despachoId).gte("iniciado_at", hoy.toISOString()),
        supabase.from("sat_sync_eventos").select("id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("tipo", "nuevo").gte("created_at", hoy.toISOString()),
        supabase.from("sat_sync_runs").select("id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("estatus", "error").gte("iniciado_at", new Date(Date.now() - 7 * 86400000).toISOString()),
        supabase.from("sat_sync_config").select("cliente_id", { count: "exact", head: true }).eq("despacho_id", despachoId).eq("activo", true).or("ultima_corrida_at.is.null,ultima_corrida_at.lt." + new Date(Date.now() - 2 * 86400000).toISOString()),
        supabase.from("sat_sync_runs").select("id, cliente_id, iniciado_at, finalizado_at, estatus, descargados, nuevos, errores, clientes(rfc, razon_social)").eq("despacho_id", despachoId).order("iniciado_at", { ascending: false }).limit(15),
        supabase.from("sat_credenciales").select("cliente_id, estatus, last_error, clientes(rfc, razon_social)").eq("despacho_id", despachoId).neq("estatus", "activo").limit(10),
        supabase.from("sat_credenciales").select("cliente_id, estatus, last_error, last_sync_at, clientes(rfc, razon_social)").eq("despacho_id", despachoId).eq("estatus", "error").limit(10),
        supabase.from("sat_sync_eventos").select("id, tipo, uuid_cfdi, monto, mensaje, created_at, cliente_id, clientes(rfc, razon_social)").eq("despacho_id", despachoId).order("created_at", { ascending: false }).limit(20),
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
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("sat_sync_runs").select("*, clientes(rfc, razon_social)").order("iniciado_at", { ascending: false }).limit(data.limit);
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const listSyncEventos = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("sat_sync_eventos").select("*, clientes(rfc, razon_social)").order("created_at", { ascending: false }).limit(data.limit);
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    const { data: rows } = await q;
    return rows ?? [];
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
      .select("pac_token, estatus")
      .eq("cliente_id", data.cliente_id)
      .maybeSingle();

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
    if (!cred || cred.estatus !== "activo" || !cred.pac_token) {
      errores.push({ fase: "auth", mensaje: "Expediente no conectado al SAT (sin credencial activa)" });
    } else {
      const isMock = cred.pac_token.startsWith("mock_") || !process.env.SW_USER;
      esMockRun = isMock;
      // ===== Candados de costo PAC =====
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
        let supabaseAdmin: any = null;
        if (!isMock) {
          const mod = await import("@/integrations/supabase/client.server");
          supabaseAdmin = mod.supabaseAdmin;
        }
        await assertSatRunPermitido({
          supabase,
          supabaseAdmin,
          despachoId: cli.despacho_id,
          frecuencia: (cfg?.frecuencia ?? "manual") as FrecuenciaSat,
          previstas: solicitudesPrevistas,
        });
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
          // PAC real: dispara solicitud asíncrona. Polling lo hará el cron de SAT.
          const res = await fetch("https://services.sw.com.mx/cfdi/descargamasiva/solicitud", {
            method: "POST",
            headers: { Authorization: `Bearer ${cred.pac_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              rfc: cli.rfc,
              fechaInicio: desde,
              fechaFin: hasta,
              tipoSolicitud: "CFDI",
            }),
          });
          if (!res.ok) {
            const txt = await res.text();
            errores.push({ fase: "solicitud", mensaje: `PAC ${res.status}: ${txt.slice(0, 200)}` });
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
    const estatus = errores.length === 0 ? "exitoso" : descargados > 0 ? "parcial" : "error";

    await supabase.from("sat_sync_runs").update({
      finalizado_at: new Date(fin).toISOString(),
      duracion_ms: fin - inicio,
      estatus,
      descargados, nuevos, cancelados, duplicados,
      errores: errores as any,
      detalle: estatus === "error" ? "La corrida no pudo completarse" : `Descargados: ${descargados}, nuevos: ${nuevos}, cancelados: ${cancelados}`,
    }).eq("id", runId);

    // Registro de consumo SAT (cuota despacho + saldo PAC si es real)
    if (solicitudesPrevistas > 0 && estatus !== "error") {
      try {
        let supabaseAdmin: any = null;
        if (!esMockRun) {
          const mod = await import("@/integrations/supabase/client.server");
          supabaseAdmin = mod.supabaseAdmin;
        }
        await registrarConsumoSat({
          supabase, supabaseAdmin,
          despachoId: cli.despacho_id,
          solicitudes: solicitudesPrevistas,
          esMock: esMockRun,
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
    const { error } = await context.supabase.from("sat_sync_config").update({ activo: data.activo }).eq("cliente_id", data.cliente_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
