// ─────────────────────────────────────────────────────────────────────────────
// MODOS EXPLÍCITOS DE CONTI
//
// Conti nunca "adivina" en qué terreno está trabajando. Cada respuesta ocurre
// dentro de un modo declarado y visible para el usuario. El modo determina:
//   - qué fuentes de verdad puede consultar,
//   - si puede o no tocar datos de un expediente,
//   - qué debe responder cuando le falta información.
// ─────────────────────────────────────────────────────────────────────────────

export type ContiModo = "guia" | "consulta" | "expediente";

export const MODOS: ContiModo[] = ["guia", "consulta", "expediente"];

export type ModoInfo = {
  id: ContiModo;
  label: string;
  descripcion: string;
  /** Requiere expediente activo para poder operar. */
  requiereExpediente: boolean;
  /** Fuentes de verdad autorizadas en este modo. */
  fuentes: string[];
};

export const MODO_INFO: Record<ContiModo, ModoInfo> = {
  guia: {
    id: "guia",
    label: "Guía de ContaClick",
    descripcion:
      "Cómo funciona la plataforma, qué herramienta usar, en qué orden y qué estado de madurez tiene cada una.",
    requiereExpediente: false,
    fuentes: ["registro de capacidades", "guías de herramientas", "entitlements del despacho"],
  },
  consulta: {
    id: "consulta",
    label: "Consulta fiscal general",
    descripcion:
      "Dudas fiscales, contables y laborales sin datos del expediente. Orientación normativa general.",
    requiereExpediente: false,
    fuentes: ["catálogo normativo versionado", "motores deterministas de cálculo"],
  },
  expediente: {
    id: "expediente",
    label: "Trabajar con expediente",
    descripcion:
      "Consultas sobre el expediente activo, usando exclusivamente lo que los motores de la plataforma ya calcularon.",
    requiereExpediente: true,
    fuentes: [
      "expediente activo (aislado)",
      "Salud Fiscal",
      "Riesgo SAT",
      "motores deterministas de cálculo",
      "catálogo normativo versionado",
    ],
  },
};

/** Etiqueta permanente que la interfaz debe mostrar sobre el estado de Conti. */
export function etiquetaModo(modo: ContiModo, expediente: string | null): string {
  if (modo === "expediente") {
    return expediente ? `Expediente: ${expediente}` : "Sin expediente";
  }
  if (modo === "consulta") return "Consulta general";
  return "Guía de ContaClick";
}

export const SIN_EXPEDIENTE_MSG =
  "Este modo trabaja sobre un expediente concreto y no hay ninguno activo. Selecciona un expediente en el selector superior o cambia al modo **Consulta fiscal general**.";

/**
 * El modo NO se infiere del texto libre: lo elige el usuario. Esta función solo
 * corrige combinaciones imposibles (modo expediente sin expediente activo).
 */
export function normalizarModo(modo: ContiModo, hayExpediente: boolean): ContiModo {
  if (modo === "expediente" && !hayExpediente) return "consulta";
  return modo;
}
