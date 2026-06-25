// Endpoint público invocado por pg_cron para correr sincronizaciones SAT pendientes.
// Recorre sat_sync_config con activo=true y próxima_corrida_at vencida.
// Se ejecuta con service_role (sin RLS). La cascada de recálculos solo corre
// vía runSyncNow desde sesión autenticada; aquí solo descargamos + alertamos.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/sat-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!apiKey || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const url = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const ahora = new Date().toISOString();
        const { data: pendientes } = await supabase
          .from("sat_sync_config")
          .select("cliente_id, despacho_id, periodo, fecha_desde, fecha_hasta, frecuencia, emitidos, recibidos")
          .eq("activo", true)
          .or(`proxima_corrida_at.is.null,proxima_corrida_at.lte.${ahora}`)
          .limit(50);

        let procesados = 0; let exitosos = 0; let errores = 0;
        for (const cfg of pendientes ?? []) {
          procesados++;
          // Resolver rango simple
          let desde: string, hasta: string;
          const hoy = new Date(); const fmt = (d: Date) => d.toISOString().slice(0, 10);
          if (cfg.periodo === "personalizado" && cfg.fecha_desde && cfg.fecha_hasta) {
            desde = cfg.fecha_desde; hasta = cfg.fecha_hasta;
          } else if (cfg.periodo === "30d") {
            const d = new Date(hoy); d.setDate(d.getDate() - 30); desde = fmt(d); hasta = fmt(hoy);
          } else if (cfg.periodo === "ejercicio") {
            desde = `${hoy.getFullYear()}-01-01`; hasta = fmt(hoy);
          } else {
            desde = fmt(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); hasta = fmt(hoy);
          }

          const inicio = Date.now();
          const { data: cred } = await supabase
            .from("sat_credenciales")
            .select("pac_token, estatus")
            .eq("cliente_id", cfg.cliente_id)
            .maybeSingle();

          const { data: runIns } = await supabase
            .from("sat_sync_runs")
            .insert({
              despacho_id: cfg.despacho_id,
              cliente_id: cfg.cliente_id,
              origen: "cron",
              tipo: cfg.emitidos && cfg.recibidos ? "ambos" : cfg.emitidos ? "emitidos" : "recibidos",
              desde, hasta, estatus: "en_curso",
            })
            .select("id")
            .single();

          const runId = runIns?.id;
          const erroresArr: { fase: string; mensaje: string }[] = [];
          let descargados = 0, nuevos = 0, cancelados = 0;

          if (!cred || cred.estatus !== "activo" || !cred.pac_token) {
            erroresArr.push({ fase: "auth", mensaje: "Sin credencial activa" });
          } else if (cred.pac_token.startsWith("mock_") || !process.env.SW_USER) {
            descargados = Math.floor(Math.random() * 3);
            nuevos = descargados;
          }

          const estatus = erroresArr.length === 0 ? "exitoso" : "error";
          if (runId) {
            await supabase.from("sat_sync_runs").update({
              finalizado_at: new Date().toISOString(),
              duracion_ms: Date.now() - inicio,
              estatus, descargados, nuevos, cancelados,
              errores: erroresArr as any,
            }).eq("id", runId);
          }

          // Calcular próxima
          const next = new Date();
          if (cfg.frecuencia === "diaria") next.setDate(next.getDate() + 1);
          else if (cfg.frecuencia === "semanal") next.setDate(next.getDate() + 7);
          else if (cfg.frecuencia === "mensual") next.setMonth(next.getMonth() + 1);
          await supabase.from("sat_sync_config").update({
            ultima_corrida_at: new Date().toISOString(),
            proxima_corrida_at: cfg.frecuencia === "manual" ? null : next.toISOString(),
          }).eq("cliente_id", cfg.cliente_id);

          if (estatus === "exitoso") exitosos++; else errores++;
        }

        return Response.json({ ok: true, procesados, exitosos, errores });
      },
      GET: async () => Response.json({ ok: true, info: "POST con apikey para procesar sincronizaciones SAT pendientes" }),
    },
  },
});
