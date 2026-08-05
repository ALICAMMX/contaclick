import { describe, it, expect } from "vitest";
import { parseCfdi } from "@/lib/tools/cfdi-parser";
import { analyzeCfdi, maxLevel } from "@/lib/cfdi/risk";
import { CFDI_INTEGRO_XML, CFDI_RIESGO_XML } from "./cfdi-fixtures";
import { EFOS_DEMO_RFCS } from "./perfiles";

describe("Fixture CFDI 4.0 íntegro", () => {
  const c = parseCfdi(CFDI_INTEGRO_XML);

  it("se parsea con todos los datos estructurales del CFDI 4.0", () => {
    expect(c.version).toBe("4.0");
    expect(c.uuid).toBe("A1B2C3D4-5E6F-4A7B-8C9D-0E1F2A3B4C5D");
    expect(c.sello).toBeTruthy();
    expect(c.certificado).toBeTruthy();
    expect(c.noCertificado).toBe("30001000000500000001");
    expect(c.selloSAT).toBeTruthy();
    expect(c.exportacion).toBe("01");
    expect(c.receptor.regimenFiscalReceptor).toBe("601");
    expect(c.receptor.domicilioFiscalReceptor).toBe("64000");
    expect(c.conceptos).toHaveLength(1);
    expect(c.conceptos[0].objetoImp).toBe("02");
    expect(c.impuestos.totalTrasladados).toBe(1600);
  });

  it("la aritmética cuadra: subtotal − descuento + trasladados = total", () => {
    expect((c.subTotal ?? 0) - (c.descuento ?? 0) + (c.impuestos.totalTrasladados ?? 0)).toBe(c.total);
  });

  it("no arroja ningún hallazgo ni advertencia", () => {
    expect(c.warnings).toEqual([]);
    const findings = analyzeCfdi(c);
    expect(findings.map((f) => f.code)).toEqual([]);
    expect(maxLevel(findings)).toBe("ok");
  });
});

describe("Fixture CFDI 4.0 en riesgo", () => {
  const c = parseCfdi(CFDI_RIESGO_XML);
  const codes = analyzeCfdi(c).map((f) => f.code);

  it("detecta cada defecto declarado en el caso", () => {
    expect(codes).toContain("SIN_TIMBRE");
    expect(codes).toContain("SIN_SELLO");
    expect(codes).toContain("SIN_CERTIFICADO");
    expect(codes).toContain("PUE_FORMA_99");
    expect(codes).toContain("DIF_MATEMATICA");
  });

  it("el emisor es un RFC de la lista 69-B demo", () => {
    expect(c.emisor.rfc).toBe(EFOS_DEMO_RFCS.definitivo);
  });

  it("el nivel máximo del análisis es alto", () => {
    expect(maxLevel(analyzeCfdi(c))).toBe("alto");
  });
});
