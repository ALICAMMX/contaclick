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
