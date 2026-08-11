import { describe, it, expect } from "vitest";
import { resolverAlcance, etiquetaPeriodoMes } from "./alcance";

type Doc = { uuid: string; fecha: string };

const universo: Doc[] = [
  { uuid: "A", fecha: "2026-07-02T18:00:00Z" },
  { uuid: "B", fecha: "2026-07-15T18:00:00Z" },
  { uuid: "C", fecha: "2026-07-28T18:00:00Z" },
  { uuid: "D", fecha: "2026-07-31T23:00:00Z" }, // 31 de julio 17:00 CDMX
  { uuid: "E", fecha: "2026-08-03T18:00:00Z" },
];

const enRango = (a: { desde: string; hasta: string }) =>
  universo.filter((d) => d.fecha >= a.desde && d.fecha < a.hasta).map((d) => d.uuid);

describe("alcance del validador de deducibilidad", () => {
  it("el alcance mensual acota al mes: 4 comprobantes, no 5", () => {
    const a = resolverAlcance({ periodo: "2026-07" });
    expect(a.modo).toBe("mensual");
    expect(enRango(a)).toEqual(["A", "B", "C", "D"]);
  });

  it("el alcance anual conserva el ejercicio completo", () => {
    const a = resolverAlcance({ year: 2026 });
    expect(a.modo).toBe("anual");
    expect(enRango(a)).toHaveLength(5);
  });

  it("un periodo inválido cae al alcance anual", () => {
    expect(resolverAlcance({ periodo: "2026-13", year: 2026 }).modo).toBe("anual");
  });

  it("etiqueta el periodo en lenguaje del contador", () => {
    expect(etiquetaPeriodoMes("2026-07")).toBe("julio de 2026");
  });
});
