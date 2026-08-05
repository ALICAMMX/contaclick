// ─────────────────────────────────────────────────────────────────────────────
// EVIDENCIA Y SANEAMIENTO DE RESPUESTAS DE CONTI
//
// Regla de confianza: está PROHIBIDO publicar porcentajes de certeza. Un número
// como "95-100%" es una invención del modelo: no procede de ninguna medición.
// En su lugar Conti declara SOBRE QUÉ se apoyó (evidencia) y qué le faltó.
// ─────────────────────────────────────────────────────────────────────────────

export type NivelEvidencia =
  | "normativa" // catálogo normativo versionado de la plataforma
  | "motor" // motor determinista de ContaClick (ISR, IVA, RESICO, riesgo, salud)
  | "plataforma" // registro de capacidades / datos del expediente
  | "general" // conocimiento fiscal general, sin fuente verificada en plataforma
  | "insuficiente"; // no hay elementos para responder

export const EVIDENCIA_LABEL: Record<NivelEvidencia, string> = {
  normativa: "Catálogo normativo de ContaClick (vigencia verificada)",
  motor: "Motor determinista de ContaClick",
  plataforma: "Registro de la plataforma / expediente activo",
  general: "Criterio fiscal general — requiere verificación en fuente oficial",
  insuficiente: "Sin información suficiente",
};

export const TEXTO_SIN_EVIDENCIA =
  "No tengo información suficiente para responder eso con responsabilidad.";

/** Patrones que el modelo tiende a inventar y que no deben llegar al usuario. */
const PATRONES_CONFIANZA: RegExp[] = [
  // Bloques completos "Nivel de confianza: ..." en cualquier variante,
  // incluyendo viñetas, citas y emojis de semáforo antepuestos.
  /^[^\S\r\n]*[>*\-\s]*(?:[^\w\s]{1,6}[^\S\r\n]*)?\*{0,2}Nivel de (?:confianza|certeza)\*{0,2}[^\S\r\n]*:.*$/gim,

  // "confianza: 92%", "certeza del 80 %", "precisión: 99%"
  /\b(?:confianza|certeza|precisi[oó]n|exactitud)\s*(?:de[l]?\s*)?:?\s*~?\d{1,3}\s*(?:[–\-—]\s*\d{1,3}\s*)?%/gi,
  // "(95–100%)" pegado a una afirmación de seguridad
  /\(\s*\d{1,3}\s*[–\-—]\s*\d{1,3}\s*%\s*\)/g,
  // "100% seguro", "99 % preciso"
  /\b\d{1,3}\s*%\s*(?:de\s+)?(?:seguro|segura|confiable|preciso|precisa|exacto|exacta|garantizad[oa])\b/gi,
];

/**
 * Elimina cualquier afirmación de confianza numérica generada por el modelo.
 * Se aplica SIEMPRE, aunque el prompt ya lo prohíba: el prompt es una
 * instrucción, esto es una garantía.
 */
export function limpiarConfianza(texto: string): string {
  let out = String(texto ?? "");
  for (const re of PATRONES_CONFIANZA) out = out.replace(re, "");
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** true si el texto todavía contiene un porcentaje de confianza. */
export function contieneConfianzaNumerica(texto: string): boolean {
  return PATRONES_CONFIANZA.some((re) => {
    const r = new RegExp(re.source, re.flags.replace("g", ""));
    return r.test(texto);
  });
}

/** Bloque de cierre estandarizado que sustituye al porcentaje de confianza. */
export function bloqueEvidencia(nivel: NivelEvidencia, detalle?: string | null): string {
  const base = `**Base de la respuesta:** ${EVIDENCIA_LABEL[nivel]}`;
  return detalle ? `${base} — ${detalle}` : base;
}
