import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type RateLimitResult = {
  allowed: boolean;
  current: number;
  resetAt: Date | null;
};

/**
 * Verifica y consume 1 unidad de un bucket de rate-limit para el usuario actual.
 * Si el RPC falla por cualquier motivo, no bloquea la operación (fail-open) para
 * no romper la app por un problema de infra; el error se loguea.
 */
export async function checkRateLimit(
  supabase: SupabaseClient<Database>,
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabase.rpc("check_rate_limit", {
      _bucket: bucket,
      _max: max,
      _window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rate-limit] rpc error", bucket, error.message);
      return { allowed: true, current: 0, resetAt: null };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { allowed: true, current: 0, resetAt: null };
    return {
      allowed: !!row.allowed,
      current: row.current_count ?? 0,
      resetAt: row.reset_at ? new Date(row.reset_at) : null,
    };
  } catch (e) {
    console.error("[rate-limit] threw", bucket, e);
    return { allowed: true, current: 0, resetAt: null };
  }
}

export function rateLimitMessage(bucket: string, resetAt: Date | null): string {
  const secs = resetAt ? Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)) : 60;
  const min = Math.ceil(secs / 60);
  return `Has alcanzado el límite de uso (${bucket}). Intenta de nuevo en ${min} minuto${min === 1 ? "" : "s"}.`;
}
