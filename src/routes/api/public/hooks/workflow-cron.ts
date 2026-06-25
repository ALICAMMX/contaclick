// Endpoint público invocado por pg_cron para procesar workflows programados.
// Seguridad: requiere apikey (anon key) en headers — el prefijo /api/public/* ya está fuera de auth.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { procesarCronInterno } from "@/lib/workflows/engine.functions";

export const Route = createFileRoute("/api/public/hooks/workflow-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!apiKey || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        // Usamos service role para correr en nombre del sistema sin RLS.
        const url = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        try {
          const r = await procesarCronInterno(supabase);
          return Response.json({ ok: true, ...r });
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, info: "POST con apikey para procesar cron interno" }),
    },
  },
});
