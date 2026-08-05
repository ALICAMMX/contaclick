import { describe, it, expect } from "vitest";
import {
  COBERTURA_MINIMA_SALUD,
  calcularSaludScore,
  type DimensionSalud,
} from "./cobertura";

const dim = (
  key: string,
  peso: number,
  estado: DimensionSalud["estado"],
  score: number | null = null,
): DimensionSalud => ({
  key,
  label: key,
  peso,
  estado,
  score,
  detalles: [],
  faltante: estado === "no_evaluable" ? { que: `falta ${key}`, ruta: `/app/${key}`, cta: "Cargar" } : null,
});

describe("Salud Fiscal — cobertura mínima", () => {
  it("un expediente sin ninguna información devuelve score null y semáforo sin_datos", () => {
    const dims = [
      dim("cumplimiento", 25, "no_evaluable"),
      dim("riesgo_sat", 25, "no_evaluable"),
      dim("cfdi", 15, "no_evaluable"),
      dim("bancos", 15, "no_evaluable"),
      dim("laboral", 10, "no_evaluable"),
      dim("documental", 10, "no_evaluable"),
    ];
    const r = calcularSaludScore(dims);
    expect(r.score).toBeNull();
    expect(r.semaforo).toBe("sin_datos");
    expect(r.cobertura.porcentaje).toBe(0);
    expect(r.cobertura.suficiente).toBe(false);
    expect(r.cobertura.faltantes).toHaveLength(6);
  });

  it("ninguna dimensión obtiene puntos por ausencia de datos", () => {
    const dims = [
      dim("bancos", 15, "no_evaluable"),
      dim("documental", 10, "no_evaluable"),
      dim("riesgo_sat", 25, "no_evaluable"),
    ];
    for (const d of dims) expect(d.score).toBeNull();
    expect(calcularSaludScore(dims).score).toBeNull();
  });

  it("no publica score por debajo del umbral mínimo de cobertura", () => {
    const dims = [
      dim("cfdi", 15, "favorable", 100),
      dim("laboral", 10, "favorable", 100),
      dim("cumplimiento", 25, "no_evaluable"),
      dim("riesgo_sat", 25, "no_evaluable"),
      dim("bancos", 15, "no_evaluable"),
      dim("documental", 10, "no_evaluable"),
    ];
    const r = calcularSaludScore(dims);
    expect(r.cobertura.porcentaje).toBe(25);
    expect(r.cobertura.porcentaje / 100).toBeLessThan(COBERTURA_MINIMA_SALUD);
    expect(r.score).toBeNull();
    expect(r.semaforo).toBe("sin_datos");
  });

  it("renormaliza pesos: las dimensiones no evaluables no cuentan como 0 ni como 100", () => {
    const dims = [
      dim("cumplimiento", 25, "desfavorable", 40),
      dim("riesgo_sat", 25, "favorable", 80),
      dim("cfdi", 15, "no_evaluable"),
      dim("bancos", 15, "no_evaluable"),
      dim("laboral", 10, "no_evaluable"),
      dim("documental", 10, "no_evaluable"),
    ];
    const r = calcularSaludScore(dims);
    expect(r.cobertura.porcentaje).toBe(50);
    expect(r.cobertura.suficiente).toBe(true);
    // (40*25 + 80*25) / 50 = 60 — no 30 (cero implícito) ni 80.
    expect(r.score).toBe(60);
  });

  it("las dimensiones no aplicables salen del denominador de cobertura", () => {
    const dims = [
      dim("cumplimiento", 25, "favorable", 90),
      dim("riesgo_sat", 25, "favorable", 90),
      dim("laboral", 10, "no_aplicable"),
      dim("cfdi", 15, "no_evaluable"),
      dim("bancos", 15, "no_evaluable"),
      dim("documental", 10, "no_evaluable"),
    ];
    const r = calcularSaludScore(dims);
    expect(r.cobertura.pesoAplicable).toBe(90);
    expect(r.cobertura.porcentaje).toBe(56);
    expect(r.score).toBe(90);
    expect(r.semaforo).toBe("verde");
  });

  it("un score bajo con cobertura suficiente sí se publica", () => {
    const dims = [
      dim("cumplimiento", 25, "desfavorable", 20),
      dim("riesgo_sat", 25, "desfavorable", 30),
      dim("cfdi", 15, "desfavorable", 40),
      dim("bancos", 15, "no_evaluable"),
      dim("laboral", 10, "no_evaluable"),
      dim("documental", 10, "no_evaluable"),
    ];
    const r = calcularSaludScore(dims);
    expect(r.cobertura.suficiente).toBe(true);
    expect(r.score).toBe(28);
    expect(r.semaforo).toBe("rojo");
  });
});
