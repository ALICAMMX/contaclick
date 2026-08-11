import { describe, it, expect } from "vitest";
import { huellaCierre, bloqueosDeCierre, canonicalizar, type EtapaSnapshot, type ResumenCierre } from "./snapshot";
import { ORDEN_ETAPAS, type EstadoEtapa } from "./flujo";

const resumenOk: ResumenCierre = {
  cfdi_total: 12,
  cfdi_emitidos: 5,
  cfdi_recibidos: 7,
  ingresos: 50000,
  egresos: 21000,
  iva_trasladado: 8000,
  iva_acreditable: 3360,
  excepciones_pendientes: 0,
  polizas_bloqueadas: 0,
};

const etapas = (estado: EstadoEtapa = "aprobada"): EtapaSnapshot[] =>
  ORDEN_ETAPAS.map((id) => ({ id, estado, cobertura: 100, version: 1, motivo: null }));

describe("canonicalizar", () => {
  it("es estable ante el orden de las claves", () => {
    expect(canonicalizar({ b: 1, a: [2, { d: 4, c: 3 }] })).toBe(canonicalizar({ a: [2, { c: 3, d: 4 }] , b: 1 }));
  });
});

describe("huellaCierre", () => {
  const base = { clienteId: "cli-1", periodo: "2026-07", etapas: etapas(), resumen: resumenOk, evaluador: "v1" };

  it("es determinista", () => {
    expect(huellaCierre(base)).toBe(huellaCierre({ ...base, etapas: [...base.etapas].reverse() }));
  });

  it("cambia si cambia cualquier fuente", () => {
    expect(huellaCierre({ ...base, resumen: { ...resumenOk, ingresos: 50001 } })).not.toBe(huellaCierre(base));
    expect(huellaCierre({ ...base, periodo: "2026-08" })).not.toBe(huellaCierre(base));
    expect(
      huellaCierre({ ...base, etapas: base.etapas.map((e) => (e.id === "bancos" ? { ...e, version: 2 } : e)) }),
    ).not.toBe(huellaCierre(base));
  });
});

describe("bloqueosDeCierre", () => {
  it("no hay bloqueos con todo aprobado y sin pendientes", () => {
    expect(bloqueosDeCierre({ etapas: etapas(), resumen: resumenOk })).toHaveLength(0);
  });

  it("bloquea etapas no satisfechas", () => {
    const mixtas = etapas().map((e) => (e.id === "polizas" ? { ...e, estado: "en_proceso" as EstadoEtapa } : e));
    const b = bloqueosDeCierre({ etapas: mixtas, resumen: resumenOk });
    expect(b.map((x) => x.codigo)).toContain("etapa_polizas");
  });

  it("“no aplica” sin motivo es bloqueo", () => {
    const sinMotivo = etapas().map((e) => (e.id === "bancos" ? { ...e, estado: "no_aplica" as EstadoEtapa, motivo: "" } : e));
    expect(bloqueosDeCierre({ etapas: sinMotivo, resumen: resumenOk }).map((x) => x.codigo)).toContain("motivo_bancos");
  });

  it("“no aplica” con motivo no bloquea", () => {
    const conMotivo = etapas().map((e) =>
      e.id === "bancos" ? { ...e, estado: "no_aplica" as EstadoEtapa, motivo: "El expediente no opera cuentas bancarias" } : e,
    );
    expect(bloqueosDeCierre({ etapas: conMotivo, resumen: resumenOk })).toHaveLength(0);
  });

  it("bloquea excepciones y pólizas pendientes", () => {
    const b = bloqueosDeCierre({
      etapas: etapas(),
      resumen: { ...resumenOk, excepciones_pendientes: 3, polizas_bloqueadas: 2 },
    });
    expect(b.map((x) => x.codigo)).toEqual(
      expect.arrayContaining(["excepciones_pendientes", "polizas_bloqueadas"]),
    );
  });

  it("un periodo sin comprobantes no se sella", () => {
    const b = bloqueosDeCierre({ etapas: etapas(), resumen: { ...resumenOk, cfdi_total: 0 } });
    expect(b.map((x) => x.codigo)).toContain("sin_documentos");
  });

  it("un periodo intacto (todo no iniciado) está totalmente bloqueado", () => {
    const b = bloqueosDeCierre({ etapas: etapas("no_iniciada"), resumen: { ...resumenOk, cfdi_total: 0 } });
    expect(b.length).toBeGreaterThanOrEqual(6);
  });
});
