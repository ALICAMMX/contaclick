import { describe, it, expect } from "vitest";
import {
  coberturaClasificacion,
  validarDecision,
  exigePorRevisar,
  type CfdiClasificable,
  type DecisionRegistrada,
} from "./decisiones";

const cfdi = (id: string, extra: Partial<CfdiClasificable> = {}): CfdiClasificable => ({
  id,
  uuid: `UUID-${id}`,
  fecha: "2026-07-15T12:00:00Z",
  total: 1000,
  rfc_emisor: "AAA010101AAA",
  nombre_emisor: "Proveedor",
  clase_documental: "gasto",
  estatus_sat: "vigente",
  ...extra,
});

const dec = (cfdi_id: string, extra: Partial<DecisionRegistrada> = {}): DecisionRegistrada => ({
  cfdi_id,
  decision: "deducible",
  porcentaje_deducible: 100,
  motivo: null,
  fundamento: "Gasto estrictamente indispensable",
  origen: "humano",
  ...extra,
});

describe("validarDecision", () => {
  it("exige fundamento para deducir", () => {
    expect(validarDecision({ decision: "deducible" }).ok).toBe(false);
    expect(validarDecision({ decision: "deducible", fundamento: "Art. 27 LISR" }).ok).toBe(true);
  });

  it("exige motivo largo al rechazar", () => {
    expect(validarDecision({ decision: "no_deducible", motivo: "no" }).ok).toBe(false);
    const ok = validarDecision({ decision: "no_deducible", motivo: "Gasto personal del socio" });
    expect(ok.ok).toBe(true);
    expect(ok.porcentaje).toBe(0);
  });

  it("acota el porcentaje parcial", () => {
    expect(validarDecision({ decision: "parcial", porcentaje_deducible: 100, motivo: "Uso mixto del vehículo" }).ok).toBe(false);
    expect(validarDecision({ decision: "parcial", porcentaje_deducible: 0, motivo: "Uso mixto del vehículo" }).ok).toBe(false);
    expect(validarDecision({ decision: "parcial", porcentaje_deducible: 50, motivo: "Uso mixto del vehículo" }).ok).toBe(true);
  });

  it("normaliza deducible al 100%", () => {
    expect(validarDecision({ decision: "deducible", porcentaje_deducible: 40, fundamento: "x" }).porcentaje).toBe(100);
  });
});

describe("exigePorRevisar", () => {
  it("marca todo lo que no está vigente ante el SAT", () => {
    expect(exigePorRevisar({ estatus_sat: "vigente" })).toBe(false);
    expect(exigePorRevisar({ estatus_sat: "desconocido" })).toBe(true);
    expect(exigePorRevisar({ estatus_sat: null })).toBe(true);
    expect(exigePorRevisar({ estatus_sat: "cancelado" })).toBe(true);
  });
});

describe("coberturaClasificacion", () => {
  it("sin comprobantes la cobertura es 0 y NUNCA está lista", () => {
    const c = coberturaClasificacion([], []);
    expect(c.cobertura).toBe(0);
    expect(c.listo).toBe(false);
  });

  it("cuenta sólo decisiones reales", () => {
    const c = coberturaClasificacion([cfdi("a"), cfdi("b")], [dec("a")]);
    expect(c.decididos).toBe(1);
    expect(c.sinDecision).toBe(1);
    expect(c.cobertura).toBe(50);
    expect(c.listo).toBe(false);
  });

  it("“por revisar” no suma cobertura", () => {
    const c = coberturaClasificacion([cfdi("a")], [dec("a", { decision: "por_revisar", porcentaje_deducible: 0 })]);
    expect(c.porRevisar).toBe(1);
    expect(c.cobertura).toBe(0);
    expect(c.listo).toBe(false);
  });

  it("detecta contradicciones con la evidencia SAT", () => {
    const c = coberturaClasificacion([cfdi("a", { estatus_sat: "desconocido" })], [dec("a")]);
    expect(c.inconsistentes).toEqual(["UUID-a"]);
    expect(c.listo).toBe(false);
  });

  it("acepta no deducible aun sin evidencia SAT vigente", () => {
    const c = coberturaClasificacion(
      [cfdi("a", { estatus_sat: "desconocido" })],
      [dec("a", { decision: "no_deducible", porcentaje_deducible: 0, motivo: "Gasto personal del socio" })],
    );
    expect(c.inconsistentes).toHaveLength(0);
    expect(c.listo).toBe(true);
    expect(c.montoDeducible).toBe(0);
  });

  it("calcula el monto deducible con porcentajes parciales", () => {
    const c = coberturaClasificacion(
      [cfdi("a"), cfdi("b", { total: 500 })],
      [dec("a"), dec("b", { decision: "parcial", porcentaje_deducible: 50, motivo: "Uso mixto" })],
    );
    expect(c.montoDeducible).toBe(1250);
    expect(c.listo).toBe(true);
    expect(c.cobertura).toBe(100);
  });
});
