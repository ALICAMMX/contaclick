// Cálculo puro del score de riesgo SAT y su cobertura.
// Vive fuera de *.functions.ts para poder probarse sin tocar la base de datos.

export const COBERTURA_MINIMA = 0.5; // 50% de los criterios deben ser evaluables

export type SemaforoRiesgo = "verde" | "amarillo" | "rojo" | "sin_datos";

export type CriterioScoreable = {
  id: number;
  nombre: string;
  evaluable: boolean;
  puntos?: number;
};

export function nivelPorScore(score: number): "verde" | "amarillo" | "rojo" {
  if (score >= 67) return "rojo";
  if (score >= 34) return "amarillo";
  return "verde";
}

export type Cobertura = {
  evaluables: number;
  total: number;
  porcentaje: number;
  minimo: number;
  suficiente: boolean;
  mensaje: string | null;
  faltantes: string[];
};

/**
 * Un expediente sin información NO es "riesgo bajo": es "sin datos".
 * Sólo publicamos score cuando al menos COBERTURA_MINIMA de los criterios
 * pudieron evaluarse con información real del expediente.
 */
export function calcularScoreRiesgo(criterios: CriterioScoreable[]): {
  score: number | null;
  semaforo: SemaforoRiesgo;
  cobertura: Cobertura;
} {
  const evaluables = criterios.filter((c) => c.evaluable);
  const porcentaje = criterios.length ? evaluables.length / criterios.length : 0;
  const suficiente = evaluables.length > 0 && porcentaje >= COBERTURA_MINIMA;
  const faltantes = criterios.filter((c) => !c.evaluable).map((c) => `#${c.id} ${c.nombre}`);

  const score = suficiente
    ? Math.round(evaluables.reduce((a, c) => a + (c.puntos ?? 0), 0) / evaluables.length)
    : null;

  return {
    score,
    semaforo: score === null ? "sin_datos" : nivelPorScore(score),
    cobertura: {
      evaluables: evaluables.length,
      total: criterios.length,
      porcentaje: Math.round(porcentaje * 100),
      minimo: Math.round(COBERTURA_MINIMA * 100),
      suficiente,
      mensaje: suficiente
        ? null
        : evaluables.length === 0
          ? "Este expediente no tiene información cargada: no es posible determinar su nivel de riesgo SAT."
          : `Solo ${evaluables.length} de ${criterios.length} criterios pudieron evaluarse (mínimo ${Math.round(COBERTURA_MINIMA * 100)}%). El resultado sería engañoso, por eso no se publica un score.`,
      faltantes,
    },
  };
}
