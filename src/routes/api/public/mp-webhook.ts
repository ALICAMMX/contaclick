import { createFileRoute } from "@tanstack/react-router";

// Webhook público de Mercado Pago. MP envía notificaciones de cambios en preapprovals/pagos.
// Documentación: https://www.mercadopago.com.mx/developers/es/docs/your-integrations/notifications/webhooks
export const Route = createFileRoute("/api/public/mp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
        if (!accessToken) return new Response("not configured", { status: 200 });

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          // MP a veces manda forma vacía; respondemos 200 para evitar reintentos infinitos
          return new Response("ok", { status: 200 });
        }

        const type = body?.type || body?.topic;
        const dataId: string | undefined = body?.data?.id || body?.id;
        if (!type || !dataId) return new Response("ok", { status: 200 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Consultar el recurso para conocer el estado real
        const endpoint =
          type === "preapproval"
            ? `https://api.mercadopago.com/preapproval/${dataId}`
            : type === "subscription_preapproval"
              ? `https://api.mercadopago.com/preapproval/${dataId}`
              : null;
        if (!endpoint) return new Response("ok", { status: 200 });

        const resp = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok) return new Response("ok", { status: 200 });
        const pre = (await resp.json()) as {
          id?: string;
          status?: string;
          external_reference?: string;
        };

        let ext: any = {};
        try {
          ext = pre.external_reference ? JSON.parse(pre.external_reference) : {};
        } catch {
          ext = {};
        }
        const despachoId: string | undefined = ext.despacho_id;
        const planId: string | undefined = ext.plan_id;

        // Actualiza la fila de suscripción
        await supabaseAdmin
          .from("mp_subscriptions")
          .update({ status: pre.status ?? "unknown", last_event: body as any })
          .eq("mp_preapproval_id", pre.id ?? dataId);

        // Si está autorizada/activa → activar despacho
        if (despachoId && pre.status && ["authorized", "active"].includes(pre.status)) {
          await supabaseAdmin
            .from("despachos")
            .update({ estado: "activo", plan_id: planId ?? null })
            .eq("id", despachoId);
        }
        if (despachoId && pre.status && ["cancelled", "paused"].includes(pre.status)) {
          await supabaseAdmin
            .from("despachos")
            .update({ estado: "suspendido" })
            .eq("id", despachoId);
        }

        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});
