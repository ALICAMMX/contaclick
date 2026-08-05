// ─────────────────────────────────────────────────────────────────────────────
// Cobertura y score de Salud Fiscal — cálculo puro, sin base de datos.
//
// REGLA CENTRAL (misma que Riesgo SAT):
//   La ausencia de información NUNCA otorga puntos positivos.
//
// Cada dimensión declara uno de cuatro estados:
//   - "favorable"     : hay información y es buena          → aporta score
//   - "desfavorable"  : hay información y es mala           → aporta score
//   - "no_evaluable"  : falta información para juzgarla     → NO aporta score
//   - "no_aplicable"  : no corresponde al expediente        → sale del cálculo
//
// FÓRMULA
//   pesoAplicable  = Σ peso(d) para d con estado ≠ "no_aplicable"
//   pesoEvaluado   = Σ peso(d) para d con estado ∈ {favorable, desfavorable}
//   cobertura      = pesoEvaluado / pesoAplicable
//   score          = Σ (score(d) · peso(d)) / pesoEvaluado        [renormalizado]
//
//   Los pesos de las dimensiones NO evaluables no se interpretan como 0 ni
//   como 100: se excluyen del denominador (renormalización).
//
// UMBRAL MÍNIMO
//   Sólo se publica score cuando cobertura ≥ COBERTURA_MINIMA_SALUD (50%).
//   Por debajo del umbral: score = null y semáforo "sin_datos".
// ─────────────────────────────────────────────────────────────────────────────

export const COBERTURA_MINIMA_SALUD = 0.5;

export type EstadoDimension = "favorable" | "desfavorable" | "no_evaluable" | "no_aplicable";

export type SemaforoSalud = "verde" | "amarillo" | "naranja" | "rojo" | "sin_datos";

export type FaltanteSalud = {
  /** Qué información hace falta para poder evaluar la dimensión. */
  que: string;
  /** Ruta interna de la herramienta con la que se carga esa información. */
  ruta: string;
  /** Texto del enlace. */
  cta: string;
};

export type DimensionSalud = {
  key: string;
  label: string;
  peso: number;
  estado: EstadoDimension;
  /** 0..100 sólo cuando la dimensión es evaluable; null en cualquier otro caso. */
  score: number | null;
  detalles: string[];
  faltante: FaltanteSalud | null;
};

export type CoberturaSalud = {
  pesoEvaluado: number;
  pesoAplicable: number;
  porcentaje: number;
  minimo: number;
  suficiente: boolean;
  dimensionesEvaluadas: number;
  dimensionesAplicables: number;
  mensaje: string | null;
  faltantes: FaltanteSalud[];
};

export function semaforoSaludPorScore(score: number): Exclude<SemaforoSalud, "sin_datos"> {
  if (score >= 85) return "verde";
  if (score >= 70) return "amarillo";
  if (score >= 50) return "naranja";
  return "rojo";
}

export function esEvaluable(d: DimensionSalud): boolean {
  return (d.estado === "favorable" || d.estado === "desfavorable") && d.score !== null;
}

export function calcularSaludScore(dimensiones: DimensionSalud[]): {
  score: number | null;
  semaforo: SemaforoSalud;
  cobertura: CoberturaSalud;
} {
  const aplicables = dimensiones.filter((d) => d.estado !== "no_aplicable");
  const evaluadas = aplicables.filter(esEvaluable);

  const pesoAplicable = aplicables.reduce((a, d) => a + d.peso, 0);
  const pesoEvaluado = evaluadas.reduce((a, d) => a + d.peso, 0);
  const ratio = pesoAplicable > 0 ? pesoEvaluado / pesoAplicable : 0;
  const suficiente = pesoEvaluado > 0 && ratio >= COBERTURA_MINIMA_SALUD;

  const score = suficiente
    ? Math.round(evaluadas.reduce((a, d) => a + (d.score as number) * d.peso, 0) / pesoEvaluado)
    : null;

  const faltantes = aplicables
    .filter((d) => d.estado === "no_evaluable" && d.faltante)
    .map((d) => d.faltante as FaltanteSalud);

  return {
    score,
    semaforo: score === null ? "sin_datos" : semaforoSaludPorScore(score),
    cobertura: {
      pesoEvaluado,
      pesoAplicable,
      porcentaje: Math.round(ratio * 100),
      minimo: Math.round(COBERTURA_MINIMA_SALUD * 100),
      suficiente,
      dimensionesEvaluadas: evaluadas.length,
      dimensionesAplicables: aplicables.length,
      mensaje: suficiente
        ? null
        : pesoEvaluado === 0
          ? "Este expediente no tiene información cargada: no es posible determinar su salud fiscal."
          : `Sólo se pudo evaluar el ${Math.round(ratio * 100)}% del modelo (mínimo ${Math.round(
              COBERTURA_MINIMA_SALUD * 100,
            )}%). Publicar un score con esta cobertura sería engañoso.`,
      faltantes,
    },
  };
}

export const TEXTO_SIN_DATOS = "Sin información suficiente";
