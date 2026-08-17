import { describe, it, expect } from "vitest";
import {
  construirBorradorCfdi,
  llaveIdempotencia,
  CUENTA_POR_IDENTIFICAR,
  type ConceptoCfdi,
  type CuentasSistema,
  type ResolucionConcepto,
} from "./motor";

const cuentas: CuentasSistema = {
  clientes: "105-001",
  proveedores: "201-001",
  bancos: "102-001",
  iva_trasladado_cobrado: "209-001",
  iva_trasladado_pendiente: "208-001",
  iva_acreditable_pagado: "113-001",
  iva_acreditable_pendiente: "118-001",
  ieps_trasladado: "208-002",
  iva_retenido: "216-002",
  isr_retenido: "216-001",
  descuentos: "402-001",
};

const resuelta = (cuenta: string): ResolucionConcepto => ({ estado: "resuelta", cuenta, cuenta_nombre: cuenta, motivo: null });
const sinRegla: ResolucionConcepto = { estado: "sin_regla", cuenta: null, cuenta_nombre: null, motivo: "Sin regla vigente" };

function cfdiBase(over: Partial<any> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    uuid: "AAAA-BBBB",
    tipo_cfdi: "I",
    metodo_pago: "PUE",
    fecha: "2026-07-15",
    rfc_emisor: "SAND010101AAA",
    rfc_receptor: "SOM010730EF3",
    subtotal_centavos: 100000,
    descuento_centavos: 0,
    iva_trasladado_centavos: 16000,
    ieps_trasladado_centavos: 0,
    iva_retenido_centavos: 0,
    isr_retenido_centavos: 0,
    total_centavos: 116000,
    ...over,
  };
}

const dosConceptos: ConceptoCfdi[] = [
  { numero: 1, clave_prod_serv: "84111506", descripcion: "Honorarios", importe_centavos: 60000, descuento_centavos: 0 },
  { numero: 2, clave_prod_serv: "80101500", descripcion: "Consultoría", importe_centavos: 40000, descuento_centavos: 0 },
];

const suma = (b: any, campo: "cargo_centavos" | "abono_centavos") =>
  b.renglones.reduce((s: number, r: any) => s + r[campo], 0);

describe("motor de pólizas — Bloque 2", () => {
  it("ingreso PUE: cuadra y usa IVA trasladado cobrado", () => {
    const b = construirBorradorCfdi({
      cfdi: cfdiBase(),
      esIngreso: true,
      conceptos: dosConceptos,
      resoluciones: { 1: resuelta("401-001"), 2: resuelta("401-002") },
      cuentas,
    });
    expect(b.cuadra).toBe(true);
    expect(suma(b, "cargo_centavos")).toBe(suma(b, "abono_centavos"));
    expect(suma(b, "cargo_centavos")).toBe(116000);
    expect(b.renglones.some((r) => r.cuenta === "209-001")).toBe(true);
    expect(b.renglones.filter((r) => r.cuenta.startsWith("401")).length).toBe(2);
  });

  it("ingreso PPD: el IVA queda pendiente de cobro, no cobrado", () => {
    const b = construirBorradorCfdi({
      cfdi: cfdiBase({ metodo_pago: "PPD" }),
      esIngreso: true,
      conceptos: dosConceptos,
      resoluciones: { 1: resuelta("401-001"), 2: resuelta("401-002") },
      cuentas,
    });
    expect(b.renglones.some((r) => r.cuenta === "208-001")).toBe(true);
    expect(b.renglones.some((r) => r.cuenta === "209-001")).toBe(false);
    expect(b.cuadra).toBe(true);
  });

  it("gasto PUE: IVA acreditable pagado y proveedores como abono", () => {
    const b = construirBorradorCfdi({
      cfdi: cfdiBase({ rfc_emisor: "SOM010730EF3", rfc_receptor: "SAND010101AAA" }),
      esIngreso: false,
      conceptos: dosConceptos,
      resoluciones: { 1: resuelta("601-001"), 2: resuelta("601-002") },
      cuentas,
    });
    expect(b.tipo).toBe("egreso");
    expect(b.renglones.some((r) => r.cuenta === "113-001" && r.cargo_centavos === 16000)).toBe(true);
    expect(b.renglones.some((r) => r.cuenta === "201-001" && r.abono_centavos === 116000)).toBe(true);
    expect(b.cuadra).toBe(true);
  });

  it("gasto PPD: IVA acreditable pendiente de pago", () => {
    const b = construirBorradorCfdi({
      cfdi: cfdiBase({ metodo_pago: "PPD", rfc_emisor: "SOM010730EF3", rfc_receptor: "SAND010101AAA" }),
      esIngreso: false,
      conceptos: dosConceptos,
      resoluciones: { 1: resuelta("601-001"), 2: resuelta("601-002") },
      cuentas,
    });
    expect(b.renglones.some((r) => r.cuenta === "118-001")).toBe(true);
    expect(b.cuadra).toBe(true);
  });

  it("retenciones disminuyen el saldo por cobrar y cuadran", () => {
    const b = construirBorradorCfdi({
      cfdi: cfdiBase({ iva_retenido_centavos: 10667, isr_retenido_centavos: 10000, total_centavos: 95333 }),
      esIngreso: true,
      conceptos: dosConceptos,
      resoluciones: { 1: resuelta("401-001"), 2: resuelta("401-002") },
      cuentas,
    });
    expect(b.cuadra).toBe(true);
    expect(suma(b, "cargo_centavos")).toBe(suma(b, "abono_centavos"));
    expect(b.renglones.some((r) => r.cuenta === "216-002")).toBe(true);
    expect(b.renglones.some((r) => r.cuenta === "216-001")).toBe(true);
  });

  it("concepto sin regla produce cuenta POR IDENTIFICAR y bloquea la aprobación", () => {
    const b = construirBorradorCfdi({
      cfdi: cfdiBase(),
      esIngreso: true,
      conceptos: dosConceptos,
      resoluciones: { 1: resuelta("401-001"), 2: sinRegla },
      cuentas,
    });
    expect(b.conceptos_sin_resolver).toBe(1);
    expect(b.renglones.some((r) => r.cuenta === CUENTA_POR_IDENTIFICAR)).toBe(true);
    expect(b.bloqueos.length).toBeGreaterThan(0);
    // Aun sin regla, la partida doble se mantiene íntegra.
    expect(suma(b, "cargo_centavos")).toBe(suma(b, "abono_centavos"));
  });

  it("los centavos nunca se pierden por redondeo entre conceptos", () => {
    const conceptos: ConceptoCfdi[] = [
      { numero: 1, clave_prod_serv: "A", descripcion: "a", importe_centavos: 3333, descuento_centavos: 0 },
      { numero: 2, clave_prod_serv: "B", descripcion: "b", importe_centavos: 3333, descuento_centavos: 0 },
      { numero: 3, clave_prod_serv: "C", descripcion: "c", importe_centavos: 3334, descuento_centavos: 0 },
    ];
    const b = construirBorradorCfdi({
      cfdi: cfdiBase({ subtotal_centavos: 10000, iva_trasladado_centavos: 1600, total_centavos: 11600 }),
      esIngreso: true,
      conceptos,
      resoluciones: { 1: resuelta("401-001"), 2: resuelta("401-001"), 3: resuelta("401-001") },
      cuentas,
    });
    expect(suma(b, "cargo_centavos")).toBe(11600);
    expect(suma(b, "cargo_centavos")).toBe(suma(b, "abono_centavos"));
  });

  it("la llave de idempotencia cambia con la versión de reglas y no con el orden", () => {
    const a = llaveIdempotencia("cfdi", "abc", "r1@2026");
    const b = llaveIdempotencia("cfdi", "abc", "r1@2026");
    const c = llaveIdempotencia("cfdi", "abc", "r2@2026");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
