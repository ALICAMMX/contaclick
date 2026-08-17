import { describe, expect, it } from "vitest";
import { resolverEvidencia, distribuirComplemento, agruparPorNivel } from "./evidencia";
import { construirBorradorCfdi, construirBorradorComplementoPago, type CuentasSistema } from "./motor";

const cuentas: CuentasSistema = {
  clientes: "105-01",
  proveedores: "201-01",
  bancos: "102-01",
  iva_trasladado_cobrado: "208-01",
  iva_trasladado_pendiente: "209-01",
  iva_acreditable_pagado: "113-01",
  iva_acreditable_pendiente: "118-01",
  ieps_trasladado: "208-02",
  iva_retenido: "216-01",
  isr_retenido: "216-02",
  descuentos: null,
};

const cfdi = (over: Partial<any> = {}) => ({
  id: "cfdi-1",
  uuid: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
  tipo_cfdi: "I",
  metodo_pago: "PUE",
  fecha: "2026-07-10",
  rfc_emisor: "SAND010101AAA",
  rfc_receptor: "SOM010730EF3",
  total_centavos: 116000,
  subtotal_centavos: 100000,
  descuento_centavos: 0,
  iva_trasladado_centavos: 16000,
  ieps_trasladado_centavos: 0,
  iva_retenido_centavos: 0,
  isr_retenido_centavos: 0,
  ...over,
});

describe("niveles de evidencia", () => {
  it("un PPD sin complemento ni banco no reconoce flujo", () => {
    const r = resolverEvidencia({ metodo_pago: "PPD" });
    expect(r.evidencia.nivel).toBe("sin_evidencia");
    expect(r.evidencia.reconoce_flujo).toBe(false);
  });

  it("un PUE es evidencia documental, nunca conciliación bancaria", () => {
    const r = resolverEvidencia({ metodo_pago: "PUE" });
    expect(r.evidencia.nivel).toBe("documental_pue");
    expect(r.evidencia.leyenda).toMatch(/no confirmado con banco/i);
  });

  it("el banco confirmado gana y el complemento queda como refuerzo, sin duplicar", () => {
    const r = resolverEvidencia({
      metodo_pago: "PPD",
      complemento: { cfdi_pago_id: "p1", importe_centavos: 116000 },
      banco_confirmado: { movimiento_bancario_id: "m1", actor: "u1", fecha: "2026-07-15" },
    });
    expect(r.evidencia.nivel).toBe("banco_confirmado");
    expect(r.refuerzos).toEqual(["complemento_pago"]);
  });

  it("marca la contradicción de un PUE que además trae complemento", () => {
    const r = resolverEvidencia({
      metodo_pago: "PUE",
      complemento: { cfdi_pago_id: "p1", importe_centavos: 100 },
    });
    expect(r.incidencias.join(" ")).toMatch(/complemento/i);
  });

  it("marca banco confirmado sin complemento en un PPD", () => {
    const r = resolverEvidencia({
      metodo_pago: "PPD",
      banco_confirmado: { movimiento_bancario_id: "m1" },
    });
    expect(r.incidencias.join(" ")).toMatch(/falta el comprobante de pago/i);
  });
});

describe("distribución de complementos", () => {
  it("no reparte más de lo pagado y absorbe el redondeo en el último documento", () => {
    const d = distribuirComplemento(100000, [
      { cfdi_id: "a", saldo_centavos: 40000 },
      { cfdi_id: "b", saldo_centavos: 40000 },
    ]);
    expect(d.map((x) => x.aplicado_centavos)).toEqual([40000, 60000]);
    expect(d.reduce((s, x) => s + x.aplicado_centavos, 0)).toBe(100000);
  });

  it("agrupa importes por nivel para publicar su procedencia", () => {
    const g = agruparPorNivel([
      { nivel: "banco_confirmado", importe_centavos: 500 },
      { nivel: "banco_confirmado", importe_centavos: 300 },
      { nivel: "sin_evidencia", importe_centavos: 100 },
    ]);
    expect(g.banco_confirmado).toBe(800);
    expect(g.complemento_pago).toBe(0);
  });
});

describe("motor con evidencia", () => {
  const conceptos = [
    { numero: 1, clave_prod_serv: "01010101", descripcion: "Servicio", importe_centavos: 100000, descuento_centavos: 0 },
  ];
  const resoluciones = {
    1: { estado: "resuelta" as const, cuenta: "401-01", cuenta_nombre: "Ingresos", regla_id: "r1", version: 1 },
  };

  it("un CFDI PPD queda con IVA pendiente y sin evidencia de flujo", () => {
    const b = construirBorradorCfdi({
      cfdi: cfdi({ metodo_pago: "PPD" }),
      esIngreso: true,
      conceptos,
      resoluciones,
      cuentas,
    });
    expect(b.cuadra).toBe(true);
    expect(b.evidencia.nivel).toBe("sin_evidencia");
    expect(b.renglones.some((r) => r.cuenta === cuentas.iva_trasladado_pendiente)).toBe(true);
  });

  it("un complemento de pago ya no se bloquea por falta de conciliación", () => {
    const b = construirBorradorComplementoPago({
      cfdi: cfdi({ tipo_cfdi: "P", metodo_pago: null }),
      esIngreso: true,
      cuentas,
    });
    expect(b.cuadra).toBe(true);
    expect(b.bloqueos).toHaveLength(0);
    expect(b.evidencia.nivel).toBe("complemento_pago");
  });

  it("con conciliación confirmada el complemento sube a banco confirmado", () => {
    const b = construirBorradorComplementoPago({
      cfdi: cfdi({ tipo_cfdi: "P", metodo_pago: null }),
      esIngreso: true,
      cuentas,
      conciliacion: { confirmada: true, movimiento_bancario_id: "m1" },
    });
    expect(b.evidencia.nivel).toBe("banco_confirmado");
    expect(b.refuerzos).toContain("complemento_pago");
    expect(b.renglones.every((r) => r.movimiento_bancario_id === "m1")).toBe(true);
  });

  it("cada concepto produce exactamente un renglón de resultado", () => {
    const b = construirBorradorCfdi({
      cfdi: cfdi(),
      esIngreso: true,
      conceptos: [
        { numero: 1, clave_prod_serv: "a", descripcion: "Uno", importe_centavos: 60000, descuento_centavos: 0 },
        { numero: 2, clave_prod_serv: "b", descripcion: "Dos", importe_centavos: 40000, descuento_centavos: 0 },
      ],
      resoluciones: {
        1: { estado: "resuelta", cuenta: "401-01", cuenta_nombre: "Ingresos A", regla_id: "r1", version: 1 },
        2: { estado: "resuelta", cuenta: "401-02", cuenta_nombre: "Ingresos B", regla_id: "r2", version: 1 },
      },
      cuentas,
    });
    expect(b.renglones.filter((r) => r.cuenta.startsWith("401-"))).toHaveLength(2);
    expect(b.cuadra).toBe(true);
  });
});
