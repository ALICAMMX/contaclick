// ─────────────────────────────────────────────────────────────────────────────
// AISLAMIENTO DE CONTEXTO POR MODO (server-side)
//
// El prompt es una instrucción; esto es una barrera. El payload que llega al
// modelo se CONSTRUYE por modo: en Guía y Consulta el expediente no existe
// como dato, no como recomendación. Además el modo forma parte de la llave de
// la conversación: cambiar de modo no arrastra el contexto anterior.
// ─────────────────────────────────────────────────────────────────────────────

import type { ContiModo } from "./modos";

export type ExpedienteContexto = {
  clienteId: string;
  rfc: string;
  razonSocial: string | null;
  regimenFiscal: string | null;
  tipoPersona: string | null;
};

export type PayloadConti = {
  modo: ContiModo;
  /** Registro de capacidades, rutas, madurez, prerrequisitos. */
  capacidades: boolean;
  /** Guías operativas (pasos, dependencias, datos mínimos). */
  guias: boolean;
  /** Catálogo normativo versionado y motores publicados. */
  normativa: boolean;
  /** Datos del expediente. SOLO puede ser distinto de null en modo expediente. */
  expediente: ExpedienteContexto | null;
};

/**
 * Única función autorizada para decidir qué ve el modelo.
 * Recibe el expediente ya validado por `assertClienteScope` y lo descarta
 * cuando el modo no lo admite.
 */
export function construirPayloadConti(
  modo: ContiModo,
  expediente: ExpedienteContexto | null,
): PayloadConti {
  if (modo === "expediente") {
    return { modo, capacidades: true, guias: true, normativa: true, expediente: expediente ?? null };
  }
  if (modo === "guia") {
    return { modo, capacidades: true, guias: true, normativa: false, expediente: null };
  }
  return { modo, capacidades: false, guias: false, normativa: true, expediente: null };
}

/** Texto del expediente que se inyecta al prompt. Vacío fuera del modo expediente. */
export function textoExpediente(p: PayloadConti): string | null {
  if (p.modo !== "expediente" || !p.expediente) return null;
  const e = p.expediente;
  return [
    `Razón social: ${e.razonSocial ?? "—"}`,
    `RFC: ${e.rfc}`,
    e.regimenFiscal ? `Régimen fiscal: ${e.regimenFiscal}` : null,
    e.tipoPersona ? `Tipo de persona: ${e.tipoPersona}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Depuración del historial ────────────────────────────────────────────────

/** RFC mexicano (PF 13 / PM 12) en texto libre. */
const RFC_RE = /\b[A-ZÑ&]{3,4}\d{6}(?:[A-Z\d]{3})\b/g;

const MENCION_EXPEDIENTE_RE =
  /(expediente activo|contribuyente activo|cliente activo|raz[oó]n social)/gi;

export type MensajeConti = { role: "user" | "assistant"; content: string };

/**
 * En Guía y Consulta ningún mensaje del historial puede transportar datos de
 * expediente (aunque provengan de un turno anterior en modo Expediente).
 */
export function depurarHistorial(
  mensajes: MensajeConti[],
  modo: ContiModo,
  expediente: ExpedienteContexto | null,
): MensajeConti[] {
  if (modo === "expediente") return mensajes;
  const nombres = [expediente?.razonSocial, expediente?.rfc].filter(
    (x): x is string => Boolean(x && x.trim().length > 2),
  );
  return mensajes.map((m) => {
    let c = m.content.replace(RFC_RE, "[RFC omitido]");
    for (const n of nombres) c = c.split(n).join("[expediente omitido]");
    c = c.replace(MENCION_EXPEDIENTE_RE, "[contexto no disponible en este modo]");
    return { role: m.role, content: c };
  });
}

/** true si el texto todavía filtra datos identificables del expediente. */
export function filtraExpediente(
  texto: string,
  expediente: ExpedienteContexto | null,
): boolean {
  const t = String(texto ?? "");
  if (new RegExp(RFC_RE.source).test(t)) return true;
  if (/expediente activo|contribuyente activo/i.test(t)) return true;
  if (expediente?.razonSocial && expediente.razonSocial.length > 2 && t.includes(expediente.razonSocial))
    return true;
  if (expediente?.rfc && t.includes(expediente.rfc)) return true;
  return false;
}

/**
 * Llave de conversación: el modo forma parte de ella. Si el hilo abierto se
 * creó en otro modo, no se reutiliza.
 */
export function mismaConversacion(
  threadModo: string | null | undefined,
  modo: ContiModo,
): boolean {
  return threadModo === modo;
}
