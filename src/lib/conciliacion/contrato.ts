// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO CANÓNICO DE CONCILIACIÓN BANCARIA — Bloque 1
//
// Fuente única de verdad compartida por el motor, las funciones servidoras, la
// interfaz, el Centro de Cierre y las pruebas. Cualquier otro vocabulario
// ("conciliado", "aceptada", "exacto" como sinónimo de confirmado) queda
// prohibido: aquí sólo existen cuatro estados.
// ─────────────────────────────────────────────────────────────────────────────

/** Los cuatro estados posibles de un grupo de conciliación. */
export const ESTADOS_CONCILIACION = ["propuesto", "confirmado", "rechazado", "ignorado"] as const;
export type EstadoConciliacion = (typeof ESTADOS_CONCILIACION)[number];

/** Quién produjo el grupo. Una propuesta del motor NUNCA falsifica una persona. */
export type OrigenConciliacion = "motor" | "humano";

/**
 * Nivel de una propuesta. El motor jamás produce estado `confirmado`:
 * su mejor resultado posible es una propuesta de ALTA CONFIANZA que sigue
 * esperando la decisión de una persona.
 */
export const NIVELES_PROPUESTA = [
  "automatica_alta_confianza",
  "revision_requerida",
  "decision_humana",
] as const;
export type NivelPropuesta = (typeof NIVELES_PROPUESTA)[number];

export const ETIQUETA_NIVEL: Record<NivelPropuesta, string> = {
  automatica_alta_confianza: "Propuesta de alta confianza",
  revision_requerida: "Propuesta para revisión",
  decision_humana: "Decisión humana",
};

/** Formas de agrupación. El Bloque 1 sólo genera uno_a_uno. */
export type TipoGrupo = "uno_a_uno" | "uno_a_varios" | "varios_a_uno";

/** Versión del algoritmo. Cambiar el puntaje o las reglas obliga a subirla. */
export const ALGORITMO_VERSION = "conciliacion-1a1@2";

/**
 * Sólo un grupo confirmado por una persona cuenta como conciliado.
 * `confirmado` significa exclusivamente eso; no existe "confirmado automático".
 */
export function cuentaComoConciliado(estado: EstadoConciliacion, confirmadoPor: string | null): boolean {
  return estado === "confirmado" && !!confirmadoPor;
}


/**
 * Para el Centro de Cierre, la etapa Bancos sólo puede declararse "lista"
 * cuando TODOS los grupos tienen confirmación humana. La automatización
 * reduce trabajo de revisión, no la sustituye.
 */
export function cuentaParaCierre(estado: EstadoConciliacion, confirmadoPor: string | null): boolean {
  return estado === "confirmado" && !!confirmadoPor;
}

/** Un grupo activo reserva sus miembros; rechazado e ignorado los liberan. */
export function reservaMiembros(estado: EstadoConciliacion): boolean {
  return estado === "propuesto" || estado === "confirmado";
}

export const MOTIVO_MINIMO = 10;

export function motivoSuficiente(motivo: string | null | undefined): boolean {
  return (motivo ?? "").trim().length >= MOTIVO_MINIMO;
}

// ── Dinero: SIEMPRE centavos enteros ────────────────────────────────────────

/** Convierte pesos (número decimal o texto) a centavos enteros, sin flotantes residuales. */
export function aCentavos(valor: number | string | null | undefined): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Convierte centavos enteros a pesos para presentación. Nunca para comparar. */
export function aPesos(centavos: number): number {
  return Math.round(centavos) / 100;
}

export function formateaCentavos(centavos: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(aPesos(centavos));
}

// ── Etiquetas en español para la interfaz ───────────────────────────────────

export const ETIQUETA_ESTADO: Record<EstadoConciliacion, string> = {
  propuesto: "Propuesto",
  confirmado: "Confirmado",
  rechazado: "Rechazado",
  ignorado: "Ignorado",
};

export const ETIQUETA_ORIGEN: Record<OrigenConciliacion, string> = {
  motor: "Sugerido por el motor",
  humano: "Confirmado por una persona",
};

// ── Evidencia estructurada de una propuesta ─────────────────────────────────

export type EvidenciaConciliacion = {
  /** true si el importe coincide al centavo. */
  importe_coincide: boolean;
  diferencia_centavos: number;
  dias_separacion: number;
  direccion: "ingreso" | "egreso";
  direccion_coincide: boolean;
  referencia_coincide: boolean;
  uuid_coincide: boolean;
  contraparte_coincide: boolean;
  moneda_coincide: boolean;
  candidatos_alternativos: number;
  candidatos_alternativos_ids: string[];
  senales_fuertes: number;
  regla: string;
  version: string;
};
