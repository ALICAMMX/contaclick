import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const origin = url.origin;
        const redirectBack = (qs: string) =>
          Response.redirect(`${origin}/app/configuracion?${qs}`, 302);

        if (error) return redirectBack(`google=error&reason=${encodeURIComponent(error)}`);
        if (!code || !state) return redirectBack("google=error&reason=missing_params");

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { exchangeCodeForTokens, decodeIdTokenEmail } = await import("@/lib/google-calendar/google.server");

          const { data: st, error: stErr } = await supabaseAdmin
            .from("google_oauth_states")
            .select("*")
            .eq("state", state)
            .maybeSingle();
          if (stErr || !st) return redirectBack("google=error&reason=invalid_state");

          // Single-use
          await supabaseAdmin.from("google_oauth_states").delete().eq("state", state);

          const tokens = await exchangeCodeForTokens(code, origin);
          if (!tokens.refresh_token) {
            return redirectBack("google=error&reason=no_refresh_token");
          }
          const email = decodeIdTokenEmail(tokens.id_token) || "desconocido@gmail.com";
          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

          await supabaseAdmin.from("despacho_google_tokens").upsert(
            {
              despacho_id: st.despacho_id,
              google_email: email,
              refresh_token: tokens.refresh_token,
              access_token: tokens.access_token,
              expires_at: expiresAt,
              scope: tokens.scope,
              calendar_id: "primary",
              connected_by: st.user_id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "despacho_id" }
          );

          return redirectBack(`google=connected&email=${encodeURIComponent(email)}`);
        } catch (e) {
          console.error("Google OAuth callback error:", e);
          return redirectBack(`google=error&reason=${encodeURIComponent((e as Error).message)}`);
        }
      },
    },
  },
});
