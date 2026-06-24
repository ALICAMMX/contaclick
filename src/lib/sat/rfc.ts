// Validador de RFC mexicano.
//
// El algoritmo oficial del SAT calcula el dígito verificador (último carácter
// de la homoclave) usando una tabla de valores y pesos. No todos los RFC
// históricos cumplen el dígito verificador (hay padrón viejo del SAT con
// excepciones reconocidas), por lo que la regla aquí es:
//
//   1. Formato estricto (PM: 12 chars, PF: 13 chars, letras + YYMMDD + 3 alfanuméricos).
//   2. Fecha YYMMDD válida (rechaza 999999 salvo RFC genéricos).
//   3. Dígito verificador correcto **o** RFC en la lista de excepciones conocidas
//      (XAXX010101000 = extranjero, XEXX010101000 = extranjero residente).
//
// El cálculo del dígito verificador es informativo: si falla, se reporta como
// advertencia (no bloquea), porque el SAT acepta RFCs históricos con homoclave
// no calculada por el algoritmo actual. El formato y la fecha sí bloquean.

const RFC_PF_RE = /^[A-ZÑ&]{4}\d{6}[A-Z\d]{3}$/;
const RFC_PM_RE = /^[A-ZÑ&]{3}\d{6}[A-Z\d]{3}$/;
const RFC_GENERICOS = new Set(["XAXX010101000", "XEXX010101000"]);

// Tabla oficial SAT para cálculo del dígito verificador
const SAT_CHARS = "0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ";

function charValue(c: string): number {
  const i = SAT_CHARS.indexOf(c);
  return i < 0 ? 0 : i;
}

function computeVerifier(rfc12or11: string): string {
  // RFC sin el último carácter, padded a 12 con espacios al inicio si es PM (11 chars)
  const padded = rfc12or11.length === 11 ? " " + rfc12or11 : rfc12or11;
  let sum = 0;
  for (let i = 0; i < padded.length; i++) {
    sum += charValue(padded[i]) * (13 - i);
  }
  const mod = (11 - (sum % 11)) % 11;
  if (mod === 10) return "A";
  return String(mod);
}

function isValidDate(yymmdd: string): boolean {
  const y = parseInt(yymmdd.slice(0, 2), 10);
  const m = parseInt(yymmdd.slice(2, 4), 10);
  const d = parseInt(yymmdd.slice(4, 6), 10);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  // Año pivote: 30 → 1930-2029
  const fullYear = y >= 30 ? 1900 + y : 2000 + y;
  const dt = new Date(Date.UTC(fullYear, m - 1, d));
  return dt.getUTCFullYear() === fullYear && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export type RfcCheck = {
  valid: boolean;
  tipo: "fisica" | "moral" | null;
  reason?: string;
  homoclaveOk?: boolean; // false = formato ok pero dígito verificador no coincide (advertencia)
};

export function validateRfc(raw: string): RfcCheck {
  const rfc = (raw ?? "").trim().toUpperCase();
  if (!rfc) return { valid: false, tipo: null, reason: "RFC vacío" };
  if (RFC_GENERICOS.has(rfc)) return { valid: true, tipo: null, homoclaveOk: true };

  const isPF = RFC_PF_RE.test(rfc);
  const isPM = !isPF && RFC_PM_RE.test(rfc);
  if (!isPF && !isPM) {
    return { valid: false, tipo: null, reason: "Formato de RFC inválido (debe ser 12 o 13 caracteres)" };
  }
  const fecha = isPF ? rfc.slice(4, 10) : rfc.slice(3, 9);
  if (!isValidDate(fecha)) {
    return { valid: false, tipo: isPF ? "fisica" : "moral", reason: `Fecha de nacimiento/constitución inválida (${fecha})` };
  }
  const verifier = rfc.slice(-1);
  const base = rfc.slice(0, -1);
  const expected = computeVerifier(base);
  const homoclaveOk = verifier === expected;
  return { valid: true, tipo: isPF ? "fisica" : "moral", homoclaveOk };
}
