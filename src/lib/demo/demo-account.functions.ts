import { createServerFn } from "@tanstack/react-start";

export const DEMO_EMAIL = "demo@contaclick.mx";
export const DEMO_PASSWORD = "Demo2026!";

/**
 * Ensures the shared public demo account exists.
 * Returns the credentials so the client can sign in normally.
 * Idempotent: safe to call every time the "Probar demo" button is pressed.
 */
export const ensureDemoAccount = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Look up by email via listUsers (admin getUserByEmail isn't always available)
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw new Error(listErr.message);

  const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === DEMO_EMAIL);

  if (!existing) {
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: "Cuenta Demo Contaclick",
        despacho_nombre: "Despacho Demo Contaclick",
      },
    });
    if (createErr) throw new Error(createErr.message);
  } else {
    // Ensure password matches in case it was rotated
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (updErr) throw new Error(updErr.message);
  }

  return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
});
