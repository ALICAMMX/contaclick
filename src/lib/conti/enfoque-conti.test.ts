import { describe, it, expect } from "vitest";
import { hechosCapacidades } from "./capacidades";
import { pasoGuia, navegacionPara } from "./guia";

describe("Conti respeta el enfoque del producto", () => {
  it("no anuncia herramientas ocultas ni módulos apagados", () => {
    const ids = hechosCapacidades().map((h) => h.id);
    expect(ids).toContain("sat-sync");
    expect(ids).toContain("polizas");
    for (const oculta of ["oficio-generator", "nomina", "legal-redactor", "contabilidad-auto", "agentes"]) {
      expect(ids).not.toContain(oculta);
    }
  });

  it("no da pasos de guía ni navegación hacia pantallas ocultas", () => {
    expect(pasoGuia("oficio-generator")).toBeNull();
    expect(pasoGuia("sat-sync")).not.toBeNull();
    expect(navegacionPara("/app/contabilidad-auto")).toBeNull();
  });
});
