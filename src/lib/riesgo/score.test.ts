import { describe, it, expect } from "vitest";
import { calcularScoreRiesgo, COBERTURA_MINIMA } from "./score";

const c = (id: number, evaluable: boolean, puntos?: number) => ({
  id, nombre: `Criterio ${id}`, evaluable, puntos,
});

describe("Riesgo SAT — cobertura mínima", () => {
  it("un expediente sin información es sin_datos, nunca riesgo bajo", () => {
    const r = calcularScoreRiesgo(Array.from({ length: 12 }, (_, i) => c(i + 1, false)));
    expect(r.score).toBeNull();
    expect(r.semaforo).toBe("sin_datos");
    expect(r.cobertura.suficiente).toBe(false);
    expect(r.cobertura.faltantes).toHaveLength(12);
  });

  it("no publica score por debajo de la cobertura mínima", () => {
    const criterios = Array.from({ length: 10 }, (_, i) => c(i + 1, i < 4, 0));
    const r = calcularScoreRiesgo(criterios);
    expect(r.cobertura.porcentaje).toBe(40);
    expect(r.cobertura.porcentaje / 100).toBeLessThan(COBERTURA_MINIMA);
    expect(r.score).toBeNull();
    expect(r.semaforo).toBe("sin_datos");
  });

  it("publica score cuando hay cobertura suficiente y promedia solo evaluables", () => {
    const criterios = [
      ...Array.from({ length: 6 }, (_, i) => c(i + 1, true, 80)),
      ...Array.from({ length: 4 }, (_, i) => c(i + 7, false)),
    ];
    const r = calcularScoreRiesgo(criterios);
    expect(r.cobertura.suficiente).toBe(true);
    expect(r.score).toBe(80);
    expect(r.semaforo).toBe("rojo");
  });

  it("los criterios no evaluables no diluyen el score hacia verde", () => {
    const criterios = [
      ...Array.from({ length: 5 }, (_, i) => c(i + 1, true, 70)),
      ...Array.from({ length: 5 }, (_, i) => c(i + 6, false)),
    ];
    expect(calcularScoreRiesgo(criterios).score).toBe(70);
  });
});
