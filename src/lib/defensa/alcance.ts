// Alcance del Validador de Deducibilidad: mensual (abierto desde el cierre) o
// anual (acceso directo a la herramienta). El alcance define el rango de fechas
// exigido en la consulta; no es un filtro visual.

import { rangoMensual } from "@/lib/cierre/periodo";

export type Alcance =
  | { modo: "mensual"; periodo: string; desde: string; hasta: string; etiqueta: string }
  | { modo: "anual"; year: number; desde: string; hasta: string; etiqueta: string };

export const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function etiquetaPeriodoMes(periodo: string): string {
  const [y, m] = periodo.split("-");
  return `${MESES[Number(m) - 1]} de ${y}`;
}

/** Resuelve el alcance. El periodo mensual gana siempre sobre el año. */
export function resolverAlcance(input: { periodo?: string | null; year?: number | null }): Alcance {
  const periodo = (input.periodo ?? "").trim();
  if (PERIODO_RE.test(periodo)) {
    const r = rangoMensual(periodo);
    return {
      modo: "mensual",
      periodo,
      desde: r.desde,
      hasta: r.hastaExclusivo,
      etiqueta: `Cierre mensual · ${etiquetaPeriodoMes(periodo)}`,
    };
  }
  const year = input.year ?? new Date().getFullYear();
  return {
    modo: "anual",
    year,
    desde: `${year}-01-01T00:00:00Z`,
    hasta: `${year + 1}-01-01T00:00:00Z`,
    etiqueta: `Análisis anual del ejercicio ${year}`,
  };
}
