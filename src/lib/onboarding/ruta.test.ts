import { describe, it, expect } from "vitest";
import { construirRuta, progresoRuta, siguientePaso, type SnapshotRuta } from "./ruta";

const vacio: SnapshotRuta = {
  regimenFiscal: null,
  domicilioFiscal: null,
  codigoPostal: null,
  csfUltimaEmision: null,
  obligaciones: 0,
  efirmaEstatus: null,
  efirmaVenceAt: null,
  efirmaUltimaSync: null,
  cfdiPeriodo: 0,
  cfdiSinOriginal: 0,
  movimientosPeriodo: 0,
  cuentasBancarias: 0,
  etapas: {},
  decisionesPendientes: 0,
  polizasBorrador: 0,
};

const estado = (s: SnapshotRuta, id: string) => construirRuta(s).find((p) => p.id === id)!.estado;

describe("ruta guiada del expediente", () => {
  it("expediente vacío: sólo la CSF es accionable, el resto queda bloqueado", () => {
    const pasos = construirRuta(vacio);
    expect(pasos.map((p) => p.estado)).toEqual([
      "pendiente", "bloqueado", "bloqueado", "bloqueado", "bloqueado", "bloqueado",
    ]);
    expect(siguientePaso(pasos)?.id).toBe("csf");
    expect(progresoRuta(pasos).listos).toBe(0);
  });

  it("no marca un paso como listo sin dato real", () => {
    const s = { ...vacio, regimenFiscal: "601" };
    expect(estado(s, "csf")).toBe("listo");
    expect(estado(s, "expediente")).toBe("pendiente");
    expect(estado(s, "efirma")).toBe("bloqueado");
  });

  it("e.firma vencida se reporta como atención, no como lista", () => {
    const s: SnapshotRuta = {
      ...vacio,
      regimenFiscal: "601",
      domicilioFiscal: "Calle 1",
      codigoPostal: "44100",
      efirmaEstatus: "activa",
      efirmaVenceAt: "2020-01-01T00:00:00Z",
    };
    expect(estado(s, "efirma")).toBe("atencion");
  });

  it("CFDI sin original verificado no cuenta como paso completo", () => {
    const base: SnapshotRuta = {
      ...vacio, regimenFiscal: "601", domicilioFiscal: "Calle 1", codigoPostal: "44100", cfdiPeriodo: 8,
    };
    expect(estado(base, "cfdi")).toBe("listo");
    expect(estado({ ...base, cfdiSinOriginal: 3 }, "cfdi")).toBe("atencion");
  });

  it("bancos se desbloquea con CFDI y cierre exige revisión humana pendiente", () => {
    const s: SnapshotRuta = {
      ...vacio,
      regimenFiscal: "601", domicilioFiscal: "Calle 1", codigoPostal: "44100",
      cfdiPeriodo: 8, movimientosPeriodo: 40, cuentasBancarias: 1,
      decisionesPendientes: 2, polizasBorrador: 5,
    };
    expect(estado(s, "bancos")).toBe("listo");
    expect(estado(s, "cierre")).toBe("atencion");
    expect(siguientePaso(construirRuta(s))?.id).toBe("cierre");
  });

  it("periodo sellado deja la ruta completa", () => {
    const s: SnapshotRuta = {
      ...vacio,
      regimenFiscal: "601", domicilioFiscal: "Calle 1", codigoPostal: "44100",
      efirmaEstatus: "activa", efirmaVenceAt: "2030-01-01T00:00:00Z",
      cfdiPeriodo: 8, movimientosPeriodo: 40, cuentasBancarias: 1,
      etapas: { cierre: "sellado" },
    };
    const pasos = construirRuta(s);
    expect(progresoRuta(pasos)).toEqual({ listos: 6, total: 6, porcentaje: 100 });
    expect(siguientePaso(pasos)).toBeNull();
  });
});
