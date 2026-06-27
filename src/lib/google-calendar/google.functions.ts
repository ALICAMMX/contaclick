import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function ensureOwner(supabase: any, userId: string): Promise<{ despachoId: string }> {
  const { data, error } = await supabase
    .from("despachos")
    .select("id, owner_user_id")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Solo el dueño del despacho puede conectar Google Calendar.");
  return { despachoId: data.id };
}

function getOrigin(): string {
  const envOrigin = process.env.PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envOrigin) return envOrigin;
  // fallback: published domain
  return "https://contaclick.cloud";
}

export const startGoogleAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { origin?: string }) => d ?? {})
  .handler(async ({ data, context }) => {
    const { despachoId } = await ensureOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildAuthUrl } = await import("./google.server");
    const state = crypto.randomUUID() + "." + crypto.randomUUID();
    await supabaseAdmin.from("google_oauth_states").insert({
      state,
      despacho_id: despachoId,
      user_id: context.userId,
    });
    const origin = data.origin || getOrigin();
    return { authUrl: buildAuthUrl({ origin, state }) };
  });

export const getGoogleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: desp } = await context.supabase
      .from("despachos")
      .select("id, owner_user_id")
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (!desp) return { connected: false, isOwner: false };
    const { data: row } = await context.supabase
      .from("despacho_google_tokens")
      .select("google_email, last_sync_at, calendar_id, created_at")
      .eq("despacho_id", desp.id)
      .maybeSingle();
    return {
      connected: !!row,
      isOwner: true,
      email: row?.google_email ?? null,
      calendarId: row?.calendar_id ?? "primary",
      lastSyncAt: row?.last_sync_at ?? null,
      connectedAt: row?.created_at ?? null,
    };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { despachoId } = await ensureOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("despacho_google_tokens").delete().eq("despacho_id", despachoId);
    await supabaseAdmin.from("google_calendar_event_map").delete().eq("despacho_id", despachoId);
    return { ok: true };
  });

export const syncObligacionesToGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { daysAhead?: number } | undefined) => z.object({ daysAhead: z.number().min(1).max(365).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { despachoId } = await ensureOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getValidAccessToken, upsertEvent } = await import("./google.server");

    const conn = await getValidAccessToken(despachoId);
    if (!conn) throw new Error("Google Calendar no está conectado.");

    const days = data.daysAhead ?? 120;
    const limite = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

    const { data: oblig, error } = await supabaseAdmin
      .from("obligaciones_fiscales")
      .select("id, nombre, clave, periodicidad, proximo_vencimiento, estatus, notas, cliente_id, periodo")
      .eq("despacho_id", despachoId)
      .not("proximo_vencimiento", "is", null)
      .lte("proximo_vencimiento", limite)
      .neq("estatus", "cumplida");
    if (error) throw error;

    const ids = (oblig ?? []).map((o) => o.id);
    const { data: maps } = await supabaseAdmin
      .from("google_calendar_event_map")
      .select("obligacion_id, google_event_id")
      .eq("despacho_id", despachoId)
      .in("obligacion_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const mapByOblig = new Map((maps ?? []).map((m) => [m.obligacion_id, m.google_event_id]));

    const clientIds = Array.from(new Set((oblig ?? []).map((o) => o.cliente_id).filter(Boolean))) as string[];
    const { data: clientes } = clientIds.length
      ? await supabaseAdmin.from("clientes").select("id, nombre, rfc").in("id", clientIds)
      : { data: [] as any[] };
    const cliMap = new Map((clientes ?? []).map((c: any) => [c.id, c]));

    let created = 0;
    let updated = 0;
    let failed = 0;
    for (const o of oblig ?? []) {
      try {
        const cli = o.cliente_id ? cliMap.get(o.cliente_id) : null;
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
          eventId: mapByOblig.get(o.id) || null,
          summary,
          description,
          dateISO: o.proximo_vencimiento as string,
          reminderMinutes: 60 * 24,
        });
        if (mapByOblig.has(o.id)) updated++;
        else {
          created++;
          await supabaseAdmin.from("google_calendar_event_map").upsert(
            { despacho_id: despachoId, obligacion_id: o.id, google_event_id: ev.id, last_pushed_at: new Date().toISOString() },
            { onConflict: "despacho_id,obligacion_id" }
          );
        }
      } catch (e) {
        failed++;
        console.error("Calendar push failed", o.id, e);
      }
    }
    await supabaseAdmin
      .from("despacho_google_tokens")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("despacho_id", despachoId);

    return { created, updated, failed, total: (oblig ?? []).length };
  });
