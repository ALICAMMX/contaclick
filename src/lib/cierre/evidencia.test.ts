import { describe, it, expect } from "vitest";
import {
  decisionesPermitidas,
  evaluarEvidencia,
  estadoAnalisis,
  xmlOriginalDisponible,
} from "./evidencia";
import { VERSION_RECUPERACION_ENCABEZADO } from "./reparacion";

const conXml = {
  estatus_sat: "vigente",
  detalle_reconstruible: true,
  normalizacion_version: "normalizacion@3",
};

describe("evidencia del comprobante", () => {
  it("exige XML original real, no recuperado del encabezado", () => {
    expect(xmlOriginalDisponible(conXml)).toBe(true);
    expect(
      xmlOriginalDisponible({ ...conXml, normalizacion_version: VERSION_RECUPERACION_ENCABEZADO }),
    ).toBe(false);
    expect(xmlOriginalDisponible({ ...conXml, detalle_reconstruible: false })).toBe(false);
  });

  it("lista las limitaciones concretas", () => {
    const ev = evaluarEvidencia({ estatus_sat: null, detalle_reconstruible: false });
    expect(ev.suficiente).toBe(false);
    expect(ev.limitaciones).toHaveLength(2);
  });
});

describe("decisiones permitidas", () => {
  it("con evidencia completa permite las cuatro", () => {
    const p = decisionesPermitidas(conXml);
    expect(p.deducible.permitida).toBe(true);
    expect(p.parcial.permitida).toBe(true);
  });

  it("sin estatus SAT vigente bloquea deducible y parcial", () => {
    const p = decisionesPermitidas({ ...conXml, estatus_sat: "desconocido" });
    expect(p.deducible.permitida).toBe(false);
    expect(p.parcial.permitida).toBe(false);
    expect(p.no_deducible.permitida).toBe(true);
    expect(p.por_revisar.permitida).toBe(true);
    expect(p.deducible.motivo).toBeTruthy();
  });

  it("sin XML original bloquea deducir aunque el SAT diga vigente", () => {
    const p = decisionesPermitidas({ ...conXml, detalle_reconstruible: false });
    expect(p.deducible.permitida).toBe(false);
  });
});

describe("estado del análisis", () => {
  it("nunca declara éxito sin comprobantes evaluables", () => {
    expect(estadoAnalisis({ analizado: true, total: 4, evaluables: 0, hallazgos: 0 })).toBe("no_evaluable");
    expect(estadoAnalisis({ analizado: true, total: 0, evaluables: 0, hallazgos: 0 })).toBe("no_analizado");
    expect(estadoAnalisis({ analizado: false, total: 4, evaluables: 4, hallazgos: 0 })).toBe("no_analizado");
  });

  it("distingue hallazgos de ausencia de hallazgos", () => {
    expect(estadoAnalisis({ analizado: true, total: 4, evaluables: 4, hallazgos: 2 })).toBe("con_hallazgos");
    expect(estadoAnalisis({ analizado: true, total: 4, evaluables: 4, hallazgos: 0 })).toBe(
      "sin_hallazgos_detectados",
    );
  });
});
