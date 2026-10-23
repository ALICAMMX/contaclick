import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

// Content Security Policy + cabeceras de seguridad.
// Limita orígenes de scripts/estilos/imágenes/conexiones para mitigar XSS
// (un script inyectado no podría exfiltrar tokens a un dominio externo).
// El origen de Supabase sale de la configuración del entorno (pruebas,
// producción, VPS). Si no hay ninguna, se usa el proyecto de producción.
function supabaseOrigin(): string {
  const desdeProceso = typeof process !== "undefined" ? process.env?.SUPABASE_URL : undefined;
  const desdeBuild = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SUPABASE_URL;
  const url = (desdeProceso || desdeBuild || "https://kootsuhxbtzqfmnokjsx.supabase.co").trim();
  try {
    return new URL(url).origin;
  } catch {
    return "https://kootsuhxbtzqfmnokjsx.supabase.co";
  }
}
const SUPABASE_ORIGIN = supabaseOrigin();
const SUPABASE_WS = SUPABASE_ORIGIN.replace(/^https:/, "wss:");

function buildCsp(): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-inline' es necesario porque TanStack Start inyecta payloads de
    // hidratación inline; 'unsafe-eval' lo requieren algunas libs (zod/jsx-runtime en dev).
    "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.mercadopago.com", "https://sdk.mercadopago.com"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "connect-src": [
      "'self'",
      SUPABASE_ORIGIN,
      SUPABASE_WS,
      "https://api.mercadopago.com",
      "https://api.mercadolibre.com",
      "https://www.googleapis.com",
      "https://oauth2.googleapis.com",
      "https://generativelanguage.googleapis.com",
    ],
    "frame-src": ["'self'", "https://www.mercadopago.com", "https://www.mercadopago.com.mx", "https://accounts.google.com"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", "https://www.mercadopago.com", "https://www.mercadopago.com.mx"],
    "frame-ancestors": ["'self'"],
    "upgrade-insecure-requests": [],
  };
  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(" ")}` : k))
    .join("; ");
}

const CSP_VALUE = buildCsp();

const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": CSP_VALUE,
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

function applySecurityHeaders(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function brandedErrorResponse(): Response {
  return applySecurityHeaders(
    new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  );
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return applySecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
