import { describe, it, expect } from "vitest";
import { detectarIncidencias, tasaIsrEstimada, type CfdiIn, type EntradaDeteccion } from "./detectar";

const RFC = "GORJ781201BK3";

const cfdi = (o: Partial<CfdiIn> & { id: string }): CfdiIn => ({
  uuid: o.id.toUpperCase(),
  tipo_cfdi: "I",
  fecha: "2026-07-15T12:00:00",
  total: 1160,
  subtotal: 1000,
  iva_trasladado: 160,
  rfc_emisor: RFC,
  rfc_receptor: "XAXX010101000",
  estatus_sat: "vigente",
  metodo_pago: "PUE",
  ...o,
});

const base = (o: Partial<EntradaDeteccion> = {}): EntradaDeteccion => ({
  rfcCliente: RFC,
  regimenFiscal: "612",
  tipoPersona: "fisica",
  cfdi: [],
  polizas: [],
  movimientos: [],
  movimientosConfirmados: new Set(),
  cfdiConfirmados: new Set(),
  ...o,
});

const tipos = (e: EntradaDeteccion) => detectarIncidencias(e).incidencias.map((i) => i.tipo).sort();

describe("conciliación integral: sin falsas alarmas", () => {
  it("sin pólizas en el periodo no acusa ingresos omitidos (datos insuficientes)", () => {
    const r = detectarIncidencias(base({ cfdi: [cfdi({ id: "a" }), cfdi({ id: "b" })] }));
    expect(r.incidencias).toHaveLength(0);
    expect(r.suficiencia.hay_contabilidad).toBe(false);
    expect(r.suficiencia.hay_banco).toBe(false);
  });

  it("con contabilidad, una póliza canónica (renglón con cfdi_id) cuenta como registrada", () => {
    const e = base({
      cfdi: [cfdi({ id: "a" }), cfdi({ id: "b" })],
      polizas: [{ id: "p1", fecha: "2026-07-15", estado: "aprobada", cfdi_ids: ["a"], monto: 1160 }],
    });
    const r = detectarIncidencias(e);
    expect(r.incidencias.map((i) => i.cfdi_id)).toEqual(["b"]);
    expect(r.incidencias[0].tipo).toBe("ingreso_sat_sin_poliza");
  });

  it("pólizas rechazadas no cuentan como contabilidad", () => {
    const e = base({
      cfdi: [cfdi({ id: "a" })],
      polizas: [{ id: "p1", fecha: "2026-07-15", estado: "rechazada", cfdi_ids: ["a"], monto: 1160 }],
    });
    expect(detectarIncidencias(e).suficiencia.hay_contabilidad).toBe(false);
  });

  it("un cargo bancario que empata con un CFDI recibido NO es 'pago sin CFDI'", () => {
    const recibido = cfdi({ id: "r", rfc_emisor: "PROV010101AAA", rfc_receptor: RFC, total: 2320, metodo_pago: "PPD" });
    const e = base({
      cfdi: [recibido],
      movimientos: [{ id: "m1", fecha: "2026-07-17", descripcion: "SPEI PROVEEDOR", cargo: 2320, abono: 0 }],
    });
    expect(tipos(e)).toEqual([]);
  });

  it("un cargo sin CFDI sí se reporta, y lo ya confirmado por el contador no", () => {
    const mov = { id: "m1", fecha: "2026-07-17", descripcion: "PAGO X", cargo: 5800, abono: 0 };
    expect(tipos(base({ movimientos: [mov] }))).toEqual(["pago_banco_sin_cfdi"]);
    expect(tipos(base({ movimientos: [mov], movimientosConfirmados: new Set(["m1"]) }))).toEqual([]);
  });

  it("CFDI emitido PUE cobrado en banco no se acusa", () => {
    const e = base({
      cfdi: [cfdi({ id: "a", total: 1160 })],
      movimientos: [{ id: "m1", fecha: "2026-07-16", descripcion: "DEPOSITO", cargo: 0, abono: 1160 }],
    });
    expect(tipos(e)).toEqual([]);
  });

  it("persona física con tarifa progresiva: no inventa impacto ISR", () => {
    const r = detectarIncidencias(
      base({ movimientos: [{ id: "m1", fecha: "2026-07-17", descripcion: "X", cargo: 11600, abono: 0 }] }),
    );
    expect(r.suficiencia.isr_estimable).toBe(false);
    expect(r.incidencias[0].impacto_isr).toBe(0);
  });

  it("tasas de estimación por régimen", () => {
    expect(tasaIsrEstimada("601", null)).toBe(0.3);
    expect(tasaIsrEstimada("626", "fisica")).toBe(0.025);
    expect(tasaIsrEstimada("612", "fisica")).toBeNull();
    expect(tasaIsrEstimada(null, "moral")).toBe(0.3);
  });

  it("persona moral: el impacto se calcula sobre la base sin IVA", () => {
    const r = detectarIncidencias(
      base({
        regimenFiscal: "601",
        tipoPersona: "moral",
        movimientos: [{ id: "m1", fecha: "2026-07-17", descripcion: "X", cargo: 11600, abono: 0 }],
      }),
    );
    expect(r.incidencias[0].impacto_isr).toBe(3000);
    expect(r.incidencias[0].impacto_iva).toBe(1600);
  });
});
