// Despachador ÚNICO de programaciones de Descarga Masiva SAT.
//
// Corre cada minuto. No es un segundo runner: sólo decide QUÉ programaciones
// están vencidas y llama a `ejecutarCorridaSat`, el mismo núcleo que usa el
// botón "Sincronizar ahora" (mismo preflight, misma e.firma, mismas cuotas,
// mismo candado, mismos estados y misma bitácora de corridas).
//
// No hay un cron por expediente: hay un cron para todo el sistema.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  decidirOcurrencia,
  llaveOcurrencia,
  proximaEjecucion,
  resolverPeriodoProgramado,
  type PeriodoOpcion,
} from "@/lib/sat/programacion";

/** Tope global de corridas lanzadas por tick: nunca cientos a la vez. */
const MAX_CONCURRENTES = 3;
/** Cuántas programaciones vencidas se revisan por tick. */
const MAX_REVISADAS = 25;
export const DESPACHADOR_VERSION = "sat-programaciones@1";

type Resultado = {
  programacion_id: string;
  estado: "ejecutada" | "omitida" | "encolada" | "fallida";
  retraso_ms: number;
  run_id: string | null;
  motivo: string;
};

export const Route = createFileRoute("/api/public/hooks/sat-programaciones")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          version: DESPACHADOR_VERSION,
          info: "POST con apikey para despachar las programaciones SAT vencidas.",
        }),

      POST: async ({ request }) => {
        const inicio = Date.now();
        const inicioIso = new Date().toISOString();
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
        if (!apiKey || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabase = createClient(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const ahora = new Date();
        const resultados: Resultado[] = [];
        const fallos: string[] = [];
        let lanzadas = 0;

        // Reclamo con bloqueo transaccional (FOR UPDATE SKIP LOCKED): dos
        // workers simultáneos nunca reciben la misma programación.
        const { data: debidas, error: claimErr } = await supabase.rpc(
          "sat_programaciones_reclamar",
          { _ahora: ahora.toISOString(), _limite: MAX_REVISADAS },
        );
        if (claimErr) {
          return Response.json(
            { ok: false, version: DESPACHADOR_VERSION, error: claimErr.message },
            { status: 500 },
          );
        }

        for (const p of (debidas ?? []) as any[]) {
          const programada = new Date(p.proxima_ejecucion_at);
          const clave = llaveOcurrencia(p.id, programada);
          const registrar = async (
            accion: string,
            extra: Record<string, unknown> = {},
            resultado?: string,
            runId?: string | null,
            retraso = 0,
          ) => {
            await supabase.from("sat_programacion_bitacora").insert({
              programacion_id: p.id,
              despacho_id: p.despacho_id,
              cliente_id: p.cliente_id,
              accion,
              programada_at: programada.toISOString(),
              retraso_ms: retraso,
              run_id: runId ?? null,
              resultado: resultado ?? null,
              // Sin secretos: sólo calendario y resultado operativo.
              detalle: { ocurrencia: clave, ...extra },
            });
          };

          // Siguiente ocurrencia: como máximo se recupera UNA. Nunca se
          // ejecutan acumuladas varias ocurrencias antiguas.
          const siguiente = proximaEjecucion(p as any, ahora);
          const avanzar = async (campos: Record<string, unknown>) => {
            await supabase
              .from("sat_programaciones")
              .update({
                bloqueo_at: null,
                ultima_ocurrencia_key: clave,
                ultima_programada_at: programada.toISOString(),
                proxima_ejecucion_at:
                  p.tipo === "unica" ? null : siguiente ? siguiente.toISOString() : null,
                activa: p.tipo === "unica" ? false : p.activa,
                ...campos,
              })
              .eq("id", p.id);
          };

          try {
            // Idempotencia por ocurrencia: si esta misma ocurrencia ya se
            // resolvió (doble ciclo del cron), no se repite.
            if (p.ultima_ocurrencia_key === clave) {
              await avanzar({});
              resultados.push({
                programacion_id: p.id,
                estado: "omitida",
                retraso_ms: 0,
                run_id: null,
                motivo: "Ocurrencia ya resuelta en un ciclo anterior.",
              });
              continue;
            }

            const decision = decidirOcurrencia({
              programada_at: programada,
              ahora,
              tolerancia_minutos: p.tolerancia_minutos,
              politica: p.politica_retraso,
            });

            if (decision.accion === "omitir") {
              await registrar("omision", { motivo: decision.motivo }, "omitida", null, decision.retraso_ms);
              await avanzar({
                ultimo_resultado: "omitida",
                ultimo_detalle: decision.motivo,
                ultimo_retraso_ms: decision.retraso_ms,
              });
              resultados.push({
                programacion_id: p.id,
                estado: "omitida",
                retraso_ms: decision.retraso_ms,
                run_id: null,
                motivo: decision.motivo,
              });
              continue;
            }

            // Límite global de concurrencia: si ya se lanzaron las permitidas,
            // la ocurrencia queda EN COLA (no se pierde ni se adelanta) y se
            // reintenta en el siguiente minuto, dentro de su tolerancia.
            if (lanzadas >= MAX_CONCURRENTES) {
              await registrar("encolada", { motivo: "Límite global de concurrencia alcanzado." });
              await supabase
                .from("sat_programaciones")
                .update({
                  bloqueo_at: null,
                  ultimo_resultado: "en_cola",
                  ultimo_detalle: "En cola por límite global de solicitudes simultáneas.",
                  ultimo_retraso_ms: decision.retraso_ms,
                })
                .eq("id", p.id);
              resultados.push({
                programacion_id: p.id,
                estado: "encolada",
                retraso_ms: decision.retraso_ms,
                run_id: null,
                motivo: "Límite global de concurrencia.",
              });
              continue;
            }

            // Ventana a solicitar. "Desde la última descarga exitosa" usa la
            // última corrida completada del expediente más un solapamiento.
            const { data: ultima } = await supabase
              .from("sat_sync_runs")
              .select("hasta")
              .eq("cliente_id", p.cliente_id)
              .in("estado", ["completada", "parcial"])
              .order("finalizado_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            const rango = resolverPeriodoProgramado({
              opcion: p.periodo_opcion as PeriodoOpcion,
              zona_horaria: p.zona_horaria,
              ahora,
              ultima_exitosa_hasta: (ultima as any)?.hasta ?? null,
              solapamiento_dias: p.solapamiento_dias,
              rango_desde: p.rango_desde,
              rango_hasta: p.rango_hasta,
            });

            // Actor: el usuario que administra la programación. Se ejecuta con
            // su alcance real, de modo que el aislamiento por despacho y
            // expediente es exactamente el de la ejecución manual.
            const actor = p.actualizado_por ?? p.creado_por;
            if (!actor) {
              await registrar("fallo", { motivo: "La programación no tiene actor válido." }, "fallida");
              await avanzar({ ultimo_resultado: "fallida", ultimo_detalle: "Sin actor válido." });
              resultados.push({
                programacion_id: p.id,
                estado: "fallida",
                retraso_ms: decision.retraso_ms,
                run_id: null,
                motivo: "Sin actor válido.",
              });
              continue;
            }

            lanzadas++;
            const { ejecutarCorridaSat } = await import("@/lib/sat/corrida.server");
            const salida = await ejecutarCorridaSat({
              supabase,
              userId: actor,
              cliente_id: p.cliente_id,
              origen: "cron",
              cascade: true,
              rangoOverride: { desde: rango.desde, hasta: rango.hasta },
            });

            if (salida?.ok === false) {
              // Preflight/cuota fallidos: no hay corrida huérfana ni contacto
              // con el SAT. Se conserva la siguiente recurrencia.
              const err = salida.error ?? {};
              await registrar(
                "fallo",
                { etapa: err.etapa, codigo: err.codigo, accion: err.accion, rango },
                "fallida",
                err.run_id ?? null,
                decision.retraso_ms,
              );
              await avanzar({
                ultimo_resultado: "fallida",
                ultimo_detalle: String(err.mensaje ?? "").slice(0, 300),
                ultimo_retraso_ms: decision.retraso_ms,
                ultima_ejecucion_at: new Date().toISOString(),
                ultima_corrida_id: err.run_id ?? null,
              });
              resultados.push({
                programacion_id: p.id,
                estado: "fallida",
                retraso_ms: decision.retraso_ms,
                run_id: err.run_id ?? null,
                motivo: String(err.mensaje ?? "Fallo de preflight."),
              });
              continue;
            }

            await registrar(
              "ejecucion",
              {
                rango,
                nota_rango: rango.nota,
                estado_corrida: salida?.estado ?? null,
                duplicada: !!salida?.duplicada,
              },
              salida?.estado ?? "en_curso",
              salida?.run_id ?? null,
              decision.retraso_ms,
            );
            await avanzar({
              ultimo_resultado: salida?.duplicada ? "duplicada" : (salida?.estado ?? "en_curso"),
              ultimo_detalle: String(salida?.mensaje ?? "").slice(0, 300),
              ultimo_retraso_ms: decision.retraso_ms,
              ultima_ejecucion_at: new Date().toISOString(),
              ultima_corrida_id: salida?.run_id ?? null,
            });
            resultados.push({
              programacion_id: p.id,
              estado: "ejecutada",
              retraso_ms: decision.retraso_ms,
              run_id: salida?.run_id ?? null,
              motivo: decision.motivo,
            });
          } catch (e) {
            // Una programación que falla no detiene a las demás.
            const mensaje = String((e as Error)?.message ?? e).slice(0, 300);
            fallos.push(`${p.id}: ${mensaje}`);
            try {
              await registrar("fallo", { motivo: mensaje }, "fallida");
              await avanzar({ ultimo_resultado: "fallida", ultimo_detalle: mensaje });
            } catch (e2) {
              console.error("[sat-prog] no se pudo registrar el fallo:", (e2 as Error)?.message);
            }
            resultados.push({
              programacion_id: p.id,
              estado: "fallida",
              retraso_ms: 0,
              run_id: null,
              motivo: mensaje,
            });
          }
        }

        const duracion = Date.now() - inicio;
        const cuerpo = {
          ok: fallos.length === 0,
          version: DESPACHADOR_VERSION,
          revisadas: (debidas ?? []).length,
          ejecutadas: resultados.filter((r) => r.estado === "ejecutada").length,
          omitidas: resultados.filter((r) => r.estado === "omitida").length,
          encoladas: resultados.filter((r) => r.estado === "encolada").length,
          fallidas: resultados.filter((r) => r.estado === "fallida").length,
          retraso_max_ms: resultados.reduce((a, r) => Math.max(a, r.retraso_ms), 0),
          duracion_ms: duracion,
          resultados,
          errores: fallos,
        };

        // Latido: el despachador deja huella incluso cuando no hay trabajo.
        try {
          await supabase.from("sat_cron_heartbeat").insert({
            inicio_at: inicioIso,
            fin_at: new Date().toISOString(),
            duracion_ms: duracion,
            http_status: 200,
            version: DESPACHADOR_VERSION,
            runs_revisados: cuerpo.revisadas,
            corridas_iniciadas: cuerpo.ejecutadas,
            ok: cuerpo.ok,
            error: fallos.length ? fallos.join(" | ").slice(0, 500) : null,
          });
        } catch (e) {
          console.error("[sat-prog] heartbeat:", (e as Error)?.message);
        }

        return Response.json(cuerpo);
      },
    },
  },
});
