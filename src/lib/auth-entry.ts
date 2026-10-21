// Destination helpers for the sign-in round trip.
//
// The Google round trip leaves the app (full-page redirect through the auth
// broker) and comes back to a public landing page. The page that launched the
// flow stores the intended destination here so the landing page can hand the
// user to the right place instead of leaving them at the site home.
//
// Browser-safe module: no server imports, no Supabase client.

const RETURN_KEY = "contaclick.auth.return";

/**
 * Accepts only a sanitized same-origin path. Anything else (external URL,
 * protocol-relative URL, junk) falls back to the given default.
 */
export function safeNext(next: string | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

/** Remembers where the user wanted to go before leaving for an external sign-in. */
export function rememberReturnPath(next: string | undefined): void {
  if (typeof window === "undefined") return;
  try {
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      window.sessionStorage.setItem(RETURN_KEY, next);
    } else {
      window.sessionStorage.removeItem(RETURN_KEY);
    }
  } catch {
    // Private-mode storage failures must never block sign-in.
  }
}

/** Reads and clears the remembered destination (one-shot). */
export function takeReturnPath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.sessionStorage.getItem(RETURN_KEY);
    if (value) window.sessionStorage.removeItem(RETURN_KEY);
    return value ?? undefined;
  } catch {
    return undefined;
  }
}
