import { describe, expect, it } from "vitest";
import { construirReporte, type MovReporte, type CfdiReporte } from "./reporte";

const mov = (o: Partial<MovReporte> & { id: string }): MovReporte => ({
  fecha: "2026-03-05",
  descripcion: "MOV",
  cargo: 0,
  abono: 0,
  saldo: null,
  cuenta_id: "c1",
  ...o,
});
const cfdi = (o: Partial<CfdiReporte> & { id: string }): CfdiReporte => ({
  uuid: o.id,
  fecha: "2026-03-03",
  total: 1000,
  direccion: "emitido",
  tipo_cfdi: "I",
  metodo_pago: "PUE",
  estatus_sat: "vigente",
  contraparte: "CLIENTE SA",
  ...o,
});

const base = () => ({
  periodo: "2026-03",
  cuentas: [{ id: "c1", banco: "Banco", alias: "Operativa", numero_cuenta_mask: "****1234" }],
  movimientos: [
    mov({ id: "m1", fecha: "2026-03-02", abono: 1160, saldo: 11160 }),
    mov({ id: "m2", fecha: "2026-03-04", cargo: 50, saldo: 11110, categoria_sin_cfdi: "comision_bancaria", ignorado_at: "x" }),
    mov({ id: "m3", fecha: "2026-03-06", abono: 300.5, saldo: 11410.5 }),
    mov({ id: "m4", fecha: "2026-03-08", cargo: 3000, saldo: 8410.5 }),
    mov({ id: "m5", fecha: "2026-03-09", cargo: 200, saldo: 8210.5 }),
  ],
  cfdi: [
    cfdi({ id: "f1", total: 1160 }),
    cfdi({ id: "f2", total: 500 }),
    cfdi({ id: "f3", total: 700, metodo_pago: "PPD" }),
    cfdi({ id: "f4", total: 200, direccion: "recibido" }),
    cfdi({ id: "f5", total: 99, estatus_sat: "Cancelado" }),
  ],
  grupos: [
    { id: "g1", estado: "confirmado", diferencia_centavos: 0 },
    { id: "g2", estado: "propuesto", diferencia_centavos: 0 },
  ],
  miembros: [
    { grupo_id: "g1", movimiento_id: "m1", cfdi_id: "f1" },
    { grupo_id: "g2", movimiento_id: "m5", cfdi_id: "f4" },
  ],
});

describe("reporte formal de conciliación", () => {
  it("explica cada peso del banco y cuadra contra el total", () => {
    const r = construirReporte(base());
    expect(r.banco.cuadra).toBe(true);
    expect(r.banco.total_abonos).toBe(1460.5);
    expect(r.banco.total_cargos).toBe(3250);
    const c = Object.fromEntries(r.banco.renglones.map((x) => [x.concepto, x]));
    expect(c["Conciliados con CFDI (confirmados)"].abonos).toBe(1160);
    expect(c["Sin factura, clasificados"].cargos).toBe(50);
    expect(c["Depósitos sin identificar"].abonos).toBe(300.5);
    expect(c["Cargos sin comprobante"].cargos).toBe(3000);
    expect(c["Con propuesta pendiente de revisar"].cargos).toBe(200);
  });

  it("saldos por cuenta: inicial, final y comprobación", () => {
    const [c] = construirReporte(base()).cuentas;
    expect(c.saldo_inicial).toBe(10000);
    expect(c.saldo_final).toBe(8210.5);
    expect(c.saldos_cuadran).toBe(true);
  });

  it("detecta saldos que no cuadran", () => {
    const b = base();
    b.movimientos[4] = { ...b.movimientos[4], saldo: 9999 };
    expect(construirReporte(b).cuentas[0].saldos_cuadran).toBe(false);
  });

  it("CFDI: cobrados, PUE sin cobro, PPD aparte y cancelados fuera de totales", () => {
    const r = construirReporte(base());
    const c = Object.fromEntries(r.cfdi.renglones.map((x) => [x.concepto, x]));
    expect(c["Emitidos cobrados en banco"].abonos).toBe(1160);
    expect(c["Emitidos PUE sin cobro en banco"].abonos).toBe(500);
    expect(c["Emitidos PPD (a crédito, esperan complemento)"].abonos).toBe(700);
    expect(r.cfdi.emitidos_total).toBe(2360);
    expect(r.cfdi.recibidos_total).toBe(200);
  });

  it("bandeja de excepciones ordenada: lo grave primero", () => {
    const r = construirReporte(base());
    const tipos = r.excepciones.map((e) => e.tipo);
    expect(tipos[0]).toBe("cargo_sin_comprobante"); // 3,000: alta
    expect(tipos).toContain("deposito_sin_identificar");
    expect(tipos).toContain("cfdi_sin_cobro");
    expect(tipos).toContain("propuesta_pendiente");
    // El PPD no es excepción: espera complemento.
    expect(r.excepciones.find((e) => e.cfdi_id === "f3")).toBeUndefined();
    expect(tipos.indexOf("propuesta_pendiente")).toBe(tipos.length - 1);
  });

  it("alerta un CFDI cancelado que quedó conciliado", () => {
    const b = base();
    b.miembros.push({ grupo_id: "g1", movimiento_id: null as any, cfdi_id: "f5" });
    const r = construirReporte(b);
    expect(r.excepciones[0].tipo).toBe("cfdi_cancelado_conciliado");
  });

  it("avance: movimientos con explicación confirmada", () => {
    const r = construirReporte(base());
    expect(r.avance.movimientos_explicados_pct).toBe(40);
    expect(r.avance.pendientes).toBe(3);
  });
});
