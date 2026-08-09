// Condiciones de workflow: FALLO CERRADO. Nada continúa por omisión.

import { describe, expect, it } from "vitest";
import { evaluarCondicion } from "./engine.functions";
import { CONDICIONES_DISPONIBLES, condicionImplementada } from "./catalogo";

describe("evaluación de condiciones", () => {
  it("la condición personalizada no es evaluable y detiene el flujo", () => {
    expect(condicionImplementada("personalizada")).toBe(false);
    const r = evaluarCondicion("personalizada", {}, { score: 99 });
    expect(r.evaluable).toBe(false);
  });

  it("no se ofrece en el constructor lo que no puede evaluarse", () => {
    expect(CONDICIONES_DISPONIBLES.some((c) => c.kind === "personalizada")).toBe(false);
  });

  it("sin dato verificable no pasa: queda no evaluable", () => {
    expect(evaluarCondicion("riesgo_mayor", { umbral: 70 }, {}).evaluable).toBe(false);
    expect(evaluarCondicion("monto_mayor", { monto: 10 }, {}).evaluable).toBe(false);
    expect(evaluarCondicion("tiene_tag", { tag: "x" }, {}).evaluable).toBe(false);
    expect(evaluarCondicion("inventada", {}, {}).evaluable).toBe(false);
  });

  it("con dato verificable evalúa de verdad", () => {
    expect(evaluarCondicion("riesgo_mayor", { umbral: 70 }, { score: 80 })).toEqual({
      evaluable: true,
      pasa: true,
    });
    expect(evaluarCondicion("monto_mayor", { monto: 100 }, { monto: 10 })).toEqual({
      evaluable: true,
      pasa: false,
    });
    expect(evaluarCondicion("tiene_tag", { tag: "a" }, { tags: ["a"] })).toEqual({
      evaluable: true,
      pasa: true,
    });
  });
});
