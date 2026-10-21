// ─────────────────────────────────────────────────────────────────────────────
// PUERTA ÚNICA DE IA — sólo servidor.
//
// Todas las llamadas de IA pasan por `aiFetch`. Por defecto sigue usando el
// gateway de Lovable (compatibilidad con el proyecto actual). Fuera de Lovable
// basta con definir variables de entorno, sin tocar código:
//
//   AI_BASE_URL       https://api.openai.com/v1   (cualquier API compatible con OpenAI)
//   AI_API_KEY        llave del proveedor
//   AI_MODEL_FAST     modelo rápido/barato   (default gpt-4.1-mini)
//   AI_MODEL_PRO      modelo de razonamiento  (default gpt-4.1)
//   AI_MODEL_EMBED    modelo de embeddings    (default text-embedding-3-small)
// ─────────────────────────────────────────────────────────────────────────────

const LOVABLE_BASE = "https://ai.gateway.lovable.dev/v1";

function env(nombre: string): string | undefined {
  const v = process.env[nombre];
  return v && v.trim() ? v.trim() : undefined;
}

/** true cuando se usa un proveedor propio en lugar del gateway de Lovable. */
export function usaProveedorPropio(): boolean {
  return !!env("AI_BASE_URL");
}

/** Llave de IA configurada (proveedor propio o Lovable). */
export function aiApiKey(): string | undefined {
  return usaProveedorPropio() ? env("AI_API_KEY") : env("LOVABLE_API_KEY");
}

/**
 * Traduce los nombres de modelo históricos (estilo Lovable "proveedor/modelo")
 * al modelo configurado del proveedor propio.
 */
export function aiModel(solicitado: string): string {
  if (!usaProveedorPropio()) return solicitado;
  const m = solicitado.toLowerCase();
  if (m.includes("embedding")) return env("AI_MODEL_EMBED") ?? "text-embedding-3-small";
  if (m.includes("pro") || m.includes("opus") || m.includes("gpt-5")) return env("AI_MODEL_PRO") ?? "gpt-4.1";
  return env("AI_MODEL_FAST") ?? "gpt-4.1-mini";
}

/** Limpia el cuerpo para APIs compatibles con OpenAI estricto. */
function normalizarCuerpo(body: unknown): unknown {
  if (typeof body !== "string" || !usaProveedorPropio()) return body;
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    if (typeof json.model === "string") json.model = aiModel(json.model);
    // Parámetros propios de Gemini que OpenAI rechaza.
    delete json.maxOutputTokens;
    delete json.thinkingConfig;
    delete json.reasoning;
    return JSON.stringify(json);
  } catch {
    return body;
  }
}

/**
 * `fetch` contra la API de IA. `ruta` es relativa a /v1, p. ej.
 * "chat/completions" o "embeddings". Respeta el resto de `init`.
 */
export async function aiFetch(ruta: string, init: RequestInit = {}): Promise<Response> {
  const base = (env("AI_BASE_URL") ?? LOVABLE_BASE).replace(/\/+$/, "");
  const key = aiApiKey() ?? "";
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${key}`);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${base}/${ruta.replace(/^\/+/, "")}`, {
    ...init,
    headers,
    body: normalizarCuerpo(init.body) as BodyInit | null | undefined,
  });
}
