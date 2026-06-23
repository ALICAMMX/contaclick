/**
 * Anonymizer for AI prompts.
 *
 * Used by the desktop build (and optionally the web build) before sending any
 * prompt to Lovable AI Gateway. Replaces sensitive Mexican fiscal entities
 * (RFC, CURP, razón social, montos exactos) with stable tokens, and keeps a
 * reversible map so we can re-hydrate the model's response client-side.
 *
 * The map NEVER leaves the device.
 */

const RFC_RE = /\b([A-ZÑ&]{3,4}\d{6}[A-Z\d]{3})\b/g;
const CURP_RE = /\b([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d)\b/g;
const MONEY_RE = /\$\s?(\d{1,3}(?:[,.\s]\d{3})*(?:\.\d{1,2})?)/g;

export interface AnonContext {
  map: Map<string, string>;
  reverse: Map<string, string>;
  counters: Record<string, number>;
}

export function createAnonContext(): AnonContext {
  return { map: new Map(), reverse: new Map(), counters: {} };
}

function tokenFor(ctx: AnonContext, kind: string, value: string): string {
  if (ctx.map.has(value)) return ctx.map.get(value)!;
  ctx.counters[kind] = (ctx.counters[kind] ?? 0) + 1;
  const token = `${kind}_${String(ctx.counters[kind]).padStart(3, "0")}`;
  ctx.map.set(value, token);
  ctx.reverse.set(token, value);
  return token;
}

function bucketAmount(n: number): string {
  if (n < 1_000) return "MONTO_<1K";
  if (n < 10_000) return "MONTO_1K-10K";
  if (n < 100_000) return "MONTO_10K-100K";
  if (n < 1_000_000) return "MONTO_100K-1M";
  return "MONTO_>1M";
}

export function anonymize(input: string, ctx: AnonContext = createAnonContext()): { text: string; ctx: AnonContext } {
  let out = input
    .replace(RFC_RE, (_m, rfc) => tokenFor(ctx, "RFC", rfc))
    .replace(CURP_RE, (_m, curp) => tokenFor(ctx, "CURP", curp))
    .replace(MONEY_RE, (_m, raw) => {
      const n = Number(String(raw).replace(/[,\s]/g, ""));
      return Number.isFinite(n) ? bucketAmount(n) : "MONTO";
    });
  return { text: out, ctx };
}

/** Re-hydrate tokens in a model response with the original values. */
export function dehydrate(text: string, ctx: AnonContext): string {
  let out = text;
  for (const [token, value] of ctx.reverse.entries()) {
    out = out.split(token).join(value);
  }
  return out;
}
