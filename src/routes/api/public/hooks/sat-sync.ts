// Endpoint público invocado por pg_cron para el módulo de Descarga Masiva SAT.
//
// Hace dos cosas:
//   1. COSECHAR: consulta al SAT las corridas vivas y descarga los paquetes
//      que ya liberó. Esto es lo más importante: el SAT es asíncrono.
//   2. SOLICITAR: crea nuevas corridas para las configuraciones programadas
//      cuya próxima corrida ya venció.
//
// Corre con privilegios de servicio (sin RLS). La cascada de recálculos NO se
// ejecuta aquí: se registra un aviso que la sesión autenticada consume.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { direccionesDe, proveedorActivo } from "@/lib/sat/providers/contrato";
import { contarSolicitudes, rangoValido } from "@/lib/sat/consumo";
import { llaveCorrida } from "@/lib/sat/idempotencia";
import { resolverEstadoCorrida } from "@/lib/sat/maquina-estados";

function resolverRango(cfg: {
  periodo?: string | null;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
}) {
  const hoy = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (cfg.periodo === "personalizado" && cfg.fecha_desde && cfg.fecha_hasta) {
    return { desde: cfg.fecha_desde, hasta: cfg.fecha_hasta };
  }
  if (cfg.periodo === "30d") {
    const d = new Date(hoy);
    d.setDate(d.getDate() - 30);
    return { desde: fmt(d), hasta: fmt(hoy) };
  }
  if (cfg.periodo === "ejercicio") {
    return { desde: `${hoy.getFullYear()}-01-01`, hasta: fmt(hoy) };
  }
  return { desde: fmt(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: fmt(hoy) };
}

export const Route = createFileRoute("/api/public/hooks/sat-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
        if (!apiKey || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const url = process.env["SUPABASE_URL"]!;
        const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
        const supabase = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { cosecharPendientes, solicitarDescargas, guardarAvanceCorrida } = await import(
          "@/lib/sat/sat-directo-runner.server"
        );

        // ---- 0. Saneamiento: cerrar corridas que nunca llegaron al SAT ----
        let saneo = { revisadas: 0, cerradas: 0, reencauzadas: 0 };
        try {
          const { sanearCorridasAtoradas } = await import("@/lib/sat/saneamiento.server");
          saneo = await sanearCorridasAtoradas(supabase, 50);
        } catch (e) {
          console.error("[cron sat] saneamiento:", (e as Error)?.message);
        }

        // ---- 1. Cosecha de las corridas vivas -------------------------
        let cosecha = { revisadas: 0, nuevos: 0, completadas: 0 };
        try {
          cosecha = await cosecharPendientes(supabase, 25);
        } catch (e) {
          console.error("[cron sat] cosecha:", (e as Error)?.message);
        }


        // ---- 2. Nuevas corridas programadas ---------------------------
        const ahora = new Date().toISOString();
        const { data: pendientes } = await supabase
          .from("sat_sync_config")
          .select(
            "cliente_id, despacho_id, proveedor, periodo, fecha_desde, fecha_hasta, frecuencia, emitidos, recibidos",
          )
          .eq("activo", true)
          .neq("frecuencia", "manual")
          .or(`proxima_corrida_at.is.null,proxima_corrida_at.lte.${ahora}`)
          .limit(50);

        let procesados = 0;
        let iniciadas = 0;
        let omitidas = 0;

        for (const cfg of pendientes ?? []) {
          procesados++;
          const proveedor = proveedorActivo((cfg as any).proveedor);
          const direcciones = direccionesDe(cfg as any);
          const { desde, hasta } = resolverRango(cfg as any);

          const avanzarProxima = async () => {
            const next = new Date();
            if (cfg.frecuencia === "diaria") next.setDate(next.getDate() + 1);
            else if (cfg.frecuencia === "semanal") next.setDate(next.getDate() + 7);
            else if (cfg.frecuencia === "mensual") next.setMonth(next.getMonth() + 1);
            await supabase
              .from("sat_sync_config")
              .update({
                ultima_corrida_at: new Date().toISOString(),
                proxima_corrida_at: next.toISOString(),
              })
              .eq("cliente_id", cfg.cliente_id);
          };

          if (
            proveedor !== "sat_directo" ||
            direcciones.length === 0 ||
            !rangoValido(desde, hasta)
          ) {
            omitidas++;
            await avanzarProxima();
            continue;
          }

          // La e.firma es obligatoria: sin ella no se envía nada al SAT.
          const { data: cred } = await supabase
            .from("sat_credenciales")
            .select("estatus, efirma_cer, efirma_key_enc")
            .eq("cliente_id", cfg.cliente_id)
            .maybeSingle();
          if (!cred || cred.estatus !== "activo" || !cred.efirma_cer || !cred.efirma_key_enc) {
            omitidas++;
            await avanzarProxima();
            continue;
          }

          const { data: cli } = await supabase
            .from("clientes")
            .select("rfc")
            .eq("id", cfg.cliente_id)
            .maybeSingle();
          if (!cli?.rfc) {
            omitidas++;
            await avanzarProxima();
            continue;
          }

          const idem = llaveCorrida({
            proveedor,
            clienteId: cfg.cliente_id as string,
            direcciones,
            tipo: "CFDI",
            desde,
            hasta,
          });

          const inicio = Date.now();
          const { data: runIns, error: runErr } = await supabase
            .from("sat_sync_runs")
            .insert({
              despacho_id: cfg.despacho_id,
              cliente_id: cfg.cliente_id,
              origen: "cron",
              proveedor,
              tipo: direcciones.length === 2 ? "ambos" : direcciones[0],
              desde,
              hasta,
              estado: "solicitando",
              estatus: "en_curso",
              idempotency_key: idem,
            })
            .select("id")
            .single();

          // 23505 = ya hay una corrida activa con la misma llave: no duplicar.
          if (runErr || !runIns) {
            omitidas++;
            await avanzarProxima();
            continue;
          }
          const runId = runIns.id as string;

          try {
            const envio = await solicitarDescargas({
              supabase,
              clienteId: cfg.cliente_id as string,
              rfc: String(cli.rfc),
              desde,
              hasta,
              direcciones,
            });
            const resumen = resolverEstadoCorrida(envio.solicitudes);
            await guardarAvanceCorrida(supabase, runId, envio.solicitudes, resumen);
            await supabase
              .from("sat_sync_runs")
              .update({
                duracion_ms: Date.now() - inicio,
                errores: envio.errores.map((m) => ({ fase: "solicitud", mensaje: m })) as any,
              })
              .eq("id", runId);

            // Consumo de cuota del plan por solicitudes efectivamente enviadas.
            const enviadas = envio.solicitudes.filter((s) => !!s.id_solicitud).length;
            if (enviadas > 0) {
              await supabase.rpc("incrementar_uso_sat", {
                _despacho: cfg.despacho_id,
                _periodo: new Date().toISOString().slice(0, 7),
                _solicitudes: enviadas,
                _costo_centavos: 0,
              });
              iniciadas++;
            }
          } catch (e) {
            await supabase
              .from("sat_sync_runs")
              .update({
                estado: "error",
                estatus: "error",
                cobertura: "nula",
                finalizado_at: new Date().toISOString(),
                duracion_ms: Date.now() - inicio,
                errores: [
                  { fase: "solicitud", mensaje: String((e as Error)?.message ?? e).slice(0, 300) },
                ] as any,
              })
              .eq("id", runId);
          }

          await avanzarProxima();
          // Estimación informativa del costo en cuota (no se cobra saldo).
          contarSolicitudes({ direcciones, desde, hasta });
        }

        return Response.json({ ok: true, cosecha, procesados, iniciadas, omitidas });
      },
      GET: async () =>
        Response.json({
          ok: true,
          info: "POST con apikey para cosechar corridas SAT vivas y lanzar las programadas.",
        }),
    },
  },
});
