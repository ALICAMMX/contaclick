// Server-only helpers for Google Calendar OAuth + API.
// Never import this from client modules.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_API = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

export function getClientCreds() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Faltan credenciales de Google OAuth en el servidor.");
  }
  return { clientId, clientSecret };
}

export function buildRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/public/google/callback`;
}

export function buildAuthUrl(params: {
  origin: string;
  state: string;
  loginHint?: string;
}) {
  const { clientId } = getClientCreds();
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", buildRedirectUri(params.origin));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_SCOPES);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", params.state);
  if (params.loginHint) u.searchParams.set("login_hint", params.loginHint);
  return u.toString();
}

export async function exchangeCodeForTokens(code: string, origin: string) {
  const { clientId, clientSecret } = getClientCreds();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: buildRedirectUri(origin),
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Google token exchange falló: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    id_token?: string;
    token_type: string;
  }>;
}

export async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getClientCreds();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Google refresh falló: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; expires_in: number; scope: string }>;
}

export function decodeIdTokenEmail(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    return (json.email as string) || null;
  } catch {
    return null;
  }
}

export async function getValidAccessToken(despachoId: string): Promise<{ token: string; calendarId: string; email: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("despacho_google_tokens")
    .select("*")
    .eq("despacho_id", despachoId)
    .maybeSingle();
  if (!row) return null;

  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (row.access_token && exp - Date.now() > 60_000) {
    return { token: row.access_token, calendarId: row.calendar_id || "primary", email: row.google_email };
  }
  const refreshed = await refreshAccessToken(row.refresh_token);
  const newExp = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("despacho_google_tokens")
    .update({ access_token: refreshed.access_token, expires_at: newExp, updated_at: new Date().toISOString() })
    .eq("despacho_id", despachoId);
  return { token: refreshed.access_token, calendarId: row.calendar_id || "primary", email: row.google_email };
}

export async function upsertEvent(opts: {
  accessToken: string;
  calendarId: string;
  eventId?: string | null;
  summary: string;
  description?: string;
  dateISO: string; // YYYY-MM-DD (all-day)
  reminderMinutes?: number;
}) {
  const body = {
    summary: opts.summary,
    description: opts.description,
    start: { date: opts.dateISO },
    end: { date: opts.dateISO },
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: opts.reminderMinutes ?? 60 * 24 }],
    },
  };
  const url = opts.eventId
    ? `${CAL_API}/calendars/${encodeURIComponent(opts.calendarId)}/events/${encodeURIComponent(opts.eventId)}`
    : `${CAL_API}/calendars/${encodeURIComponent(opts.calendarId)}/events`;
  const res = await fetch(url, {
    method: opts.eventId ? "PUT" : "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (opts.eventId && res.status === 404) {
      // event was deleted — recreate
      return upsertEvent({ ...opts, eventId: null });
    }
    throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ id: string; htmlLink: string }>;
}

export async function deleteEvent(accessToken: string, calendarId: string, eventId: string) {
  const res = await fetch(
    `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Calendar delete ${res.status}: ${await res.text()}`);
  }
}

// ------------- One-off push/delete for a single obligacion -------------
// Best-effort: silently no-op if Google is not connected, logs on failure.

export async function pushObligacionToGoogle(despachoId: string, obligacionId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const conn = await getValidAccessToken(despachoId);
    if (!conn) return { skipped: true as const, reason: "not_connected" };

    const { data: o } = await supabaseAdmin
      .from("obligaciones_fiscales")
      .select("id, nombre, clave, periodicidad, proximo_vencimiento, estatus, notas, cliente_id, periodo")
      .eq("id", obligacionId)
      .maybeSingle();
    if (!o || !o.proximo_vencimiento) return { skipped: true as const, reason: "no_date" };

    const { data: existing } = await supabaseAdmin
      .from("google_calendar_event_map")
      .select("google_event_id")
      .eq("despacho_id", despachoId)
      .eq("obligacion_id", obligacionId)
      .maybeSingle();

    // If already completed, remove event from Google instead.
    if (o.estatus === "cumplida" || o.estatus === "presentada") {
      if (existing?.google_event_id) {
        await deleteEvent(conn.token, conn.calendarId, existing.google_event_id);
        await supabaseAdmin
          .from("google_calendar_event_map")
          .delete()
          .eq("despacho_id", despachoId)
          .eq("obligacion_id", obligacionId);
      }
      return { ok: true as const, removed: true };
    }

    let cli: any = null;
    if (o.cliente_id) {
      const { data: c } = await supabaseAdmin
        .from("clientes")
        .select("id, nombre, rfc")
        .eq("id", o.cliente_id)
        .maybeSingle();
      cli = c;
    }
    const summary = `[ContaClick] ${o.nombre || o.clave || "Obligación"}${cli ? ` · ${cli.nombre}` : ""}`;
    const description = [
      o.clave ? `Clave: ${o.clave}` : null,
      o.periodicidad ? `Periodicidad: ${o.periodicidad}` : null,
      o.periodo ? `Periodo: ${o.periodo}` : null,
      cli?.rfc ? `RFC: ${cli.rfc}` : null,
      o.notas || null,
      "—",
      "Generado automáticamente por ContaClick",
    ].filter(Boolean).join("\n");

    const ev = await upsertEvent({
      accessToken: conn.token,
      calendarId: conn.calendarId,
      eventId: existing?.google_event_id || null,
      summary,
      description,
      dateISO: o.proximo_vencimiento as string,
      reminderMinutes: 60 * 24,
    });

    await supabaseAdmin.from("google_calendar_event_map").upsert(
      {
        despacho_id: despachoId,
        obligacion_id: obligacionId,
        google_event_id: ev.id,
        last_pushed_at: new Date().toISOString(),
      },
      { onConflict: "despacho_id,obligacion_id" }
    );
    return { ok: true as const, eventId: ev.id };
  } catch (e) {
    console.error("[google] pushObligacionToGoogle failed", obligacionId, e);
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function deleteObligacionFromGoogle(despachoId: string, obligacionId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("google_calendar_event_map")
      .select("google_event_id")
      .eq("despacho_id", despachoId)
      .eq("obligacion_id", obligacionId)
      .maybeSingle();
    if (!existing?.google_event_id) return { skipped: true as const };
    const conn = await getValidAccessToken(despachoId);
    if (!conn) return { skipped: true as const, reason: "not_connected" };
    await deleteEvent(conn.token, conn.calendarId, existing.google_event_id);
    await supabaseAdmin
      .from("google_calendar_event_map")
      .delete()
      .eq("despacho_id", despachoId)
      .eq("obligacion_id", obligacionId);
    return { ok: true as const };
  } catch (e) {
    console.error("[google] deleteObligacionFromGoogle failed", obligacionId, e);
    return { ok: false as const, error: (e as Error).message };
  }
}
