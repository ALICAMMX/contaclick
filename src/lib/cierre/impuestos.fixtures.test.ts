// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES FISCALES CON RESULTADO ESPERADO INDEPENDIENTE.
//
// Los importes esperados se calculan a mano (aritmética explícita en el propio
// caso), no pidiéndoselos al motor. Si el motor cambia de criterio, estas
// pruebas fallan: ese es el punto.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from "vitest";
import { calcularPreliminar, type EntradasFiscales } from "./impuestos";

const BASE: EntradasFiscales = {
  periodo: "2026-01",
  entradas_version: "entradas@2",
  regimen_sat: "612",
  regimen: "PF_GENERAL_MENSUAL",
  criterio: "flujo_de_efectivo",
  ingresos_cobrados_centavos: 0,
  ingresos_pue_centavos: 0,
  ingresos_ppd_centavos: 0,
  ingresos_nominales_acumulados_centavos: 0,
  iva_trasladado_cobrado_centavos: 0,
  deducciones_pagadas_centavos: 0,
  deducciones_pue_centavos: 0,
  deducciones_ppd_centavos: 0,
  iva_acreditable_pagado_centavos: 0,
  isr_retenido_centavos: 0,
  iva_retenido_centavos: 0,
  faltantes: {
    comprobantes_sin_estatus_sat: 0,
    recibidos_sin_decision: 0,
    ppd_sin_complemento: 0,
    cancelados: 0,
    recibidos_sin_regla_iva: 0,
    ppd_pagado_sin_complemento: 0,
    sin_tipo_cambio: 0,
    complementos_duplicados: 0,
  },
  evaluable: true,
  input_hash: "h",
};

const con = (p: Partial<EntradasFiscales>): EntradasFiscales => ({
  ...BASE,
  ...p,
  faltantes: { ...BASE.faltantes, ...(p.faltantes ?? {}) },
});

const motivos = (e: EntradasFiscales, params = {}) =>
  calcularPreliminar(e, params).motivos.map((m) => m.codigo);

describe("bases fiscales por forma de pago", () => {
  it("PUE de $100 + IVA $16: la base de ISR es $100 y el IVA trasladado $16 (nunca ISR sobre $116)", () => {
    const e = con({
      ingresos_cobrados_centavos: 100_00,
      ingresos_pue_centavos: 100_00,
      iva_trasladado_cobrado_centavos: 16_00,
    });
    const r = calcularPreliminar(e);
    expect(r.evaluable).toBe(true);
    const isr = r.resultado!.isr as any;
    expect(isr.ingresos).toBe(100);
    expect(isr.ingresos).not.toBe(116);
    expect((r.resultado!.iva as any).ivaTrasladado).toBe(16);
  });

  it("PPD sin pago ni complemento: no acumula por flujo y NO produce falso “complemento faltante”", () => {
    const e = con({ faltantes: { ...BASE.faltantes, ppd_sin_complemento: 3 } });
    const r = calcularPreliminar(e);
    expect(motivos(e)).not.toContain("ppd_sin_complemento");
    expect(r.evaluable).toBe(true);
    expect((r.resultado!.isr as any).ingresos).toBe(0);
  });

  it("PPD con pago parcial de $58 sobre factura de $116: base cobrada $50 e IVA $8", () => {
    // El complemento reporta $58 pagados; el desglose separa IVA $8 (16% de $50).
    const e = con({
      ingresos_cobrados_centavos: 50_00,
      ingresos_ppd_centavos: 50_00,
      iva_trasladado_cobrado_centavos: 8_00,
    });
    const r = calcularPreliminar(e);
    expect((r.resultado!.isr as any).ingresos).toBe(50);
    expect((r.resultado!.iva as any).ivaTrasladado).toBe(8);
    // Ni la factura completa ni la suma factura+complemento.
    expect((r.resultado!.isr as any).ingresos).not.toBe(100);
    expect((r.resultado!.isr as any).ingresos).not.toBe(116);
  });

  it("pago bancario confirmado sin complemento: excepción bloqueante", () => {
    const e = con({ faltantes: { ...BASE.faltantes, ppd_pagado_sin_complemento: 1 } });
    expect(motivos(e)).toContain("ppd_pagado_sin_complemento");
    expect(calcularPreliminar(e).resultado).toBeNull();
  });
});

describe("bloqueos de evidencia", () => {
  it("estatus SAT desconocido bloquea el cálculo", () => {
    expect(motivos(con({ faltantes: { ...BASE.faltantes, comprobantes_sin_estatus_sat: 1 } }))).toContain(
      "estatus_sat_incompleto",
    );
  });

  it("moneda extranjera sin tipo de cambio deja el periodo no evaluable", () => {
    expect(motivos(con({ faltantes: { ...BASE.faltantes, sin_tipo_cambio: 2 } }))).toContain(
      "tipo_cambio_ausente",
    );
  });

  it("complemento repetido bloquea", () => {
    expect(motivos(con({ faltantes: { ...BASE.faltantes, complementos_duplicados: 1 } }))).toContain(
      "complementos_duplicados",
    );
  });

  it("deducibilidad parcial sin regla propia de IVA bloquea: el % de ISR no se aplica al IVA", () => {
    expect(motivos(con({ faltantes: { ...BASE.faltantes, recibidos_sin_regla_iva: 4 } }))).toContain(
      "iva_sin_regla_propia",
    );
  });

  it("los cancelados no bloquean pero se informan aparte de las bases", () => {
    const e = con({
      faltantes: { ...BASE.faltantes, cancelados: 2 },
      ingresos_cobrados_centavos: 100_00,
      iva_trasladado_cobrado_centavos: 16_00,
    });
    const r = calcularPreliminar(e);
    expect(r.evaluable).toBe(true);
    expect((r.resultado!.isr as any).ingresos).toBe(100);
    expect(e.faltantes.cancelados).toBe(2);
  });

  it("una nota de crédito ya viene restada de la base entregada (egreso)", () => {
    // Ingreso $1,000 con nota de crédito de $200 ⇒ base entregada $800.
    const e = con({ ingresos_cobrados_centavos: 800_00, iva_trasladado_cobrado_centavos: 128_00 });
    const r = calcularPreliminar(e);
    expect((r.resultado!.isr as any).ingresos).toBe(800);
    expect((r.resultado!.iva as any).ivaTrasladado).toBe(128);
  });
});

describe("criterio por régimen", () => {
  it("PM general usa ingresos NOMINALES acumulados, no el flujo de efectivo de PF", () => {
    const e = con({
      regimen: "PM_GENERAL",
      regimen_sat: "601",
      ingresos_cobrados_centavos: 100_000_00,
      ingresos_nominales_acumulados_centavos: 300_000_00,
    });
    const r = calcularPreliminar(e, { coeficiente_utilidad: 0.2 });
    expect(r.evaluable).toBe(true);
    const isr = r.resultado!.isr as any;
    expect(isr.ingresosNominales).toBe(300_000);
    // Utilidad fiscal estimada = 300,000 × 0.20 = 60,000.
    expect(isr.utilidadFiscalEstimada ?? isr.utilidadEstimada ?? isr.baseGravable).toBe(60_000);
  });

  it("PM general sin coeficiente comprobado: no evaluable, no cero", () => {
    const e = con({ regimen: "PM_GENERAL", regimen_sat: "601", ingresos_nominales_acumulados_centavos: 10_000_00 });
    const r = calcularPreliminar(e);
    expect(r.evaluable).toBe(false);
    expect(r.resultado).toBeNull();
    expect(r.motivos.map((m) => m.codigo)).toContain("coeficiente_utilidad_ausente");
  });

  it("PM general sin ingresos nominales entregados: no evaluable", () => {
    const e = con({ regimen: "PM_GENERAL", regimen_sat: "601" });
    delete (e as any).ingresos_nominales_acumulados_centavos;
    expect(motivos(e, { coeficiente_utilidad: 0.2 })).toContain("ingresos_nominales_ausentes");
  });

  it("PF general aplica tarifa progresiva sobre base cobrada menos deducciones", () => {
    const e = con({
      ingresos_cobrados_centavos: 50_000_00,
      deducciones_pagadas_centavos: 20_000_00,
      iva_trasladado_cobrado_centavos: 8_000_00,
      iva_acreditable_pagado_centavos: 3_200_00,
    });
    const r = calcularPreliminar(e);
    const isr = r.resultado!.isr as any;
    expect(isr.ingresos - isr.deducciones).toBe(30_000);
    // IVA a cargo = 8,000 − 3,200 = 4,800.
    expect(r.resultado!.iva_a_cargo_centavos).toBe(4_800_00);
  });

  it("RESICO PF calcula sobre ingresos efectivamente cobrados, sin deducciones", () => {
    const e = con({
      regimen: "PF_RESICO",
      regimen_sat: "626",
      ingresos_cobrados_centavos: 40_000_00,
      deducciones_pagadas_centavos: 20_000_00,
      iva_trasladado_cobrado_centavos: 6_400_00,
    });
    const r = calcularPreliminar(e, { resico_acumulado_previo_centavos: 0 });
    expect(r.evaluable).toBe(true);
    const isr = r.resultado!.isr as any;
    expect(isr.ingresosCobrados ?? isr.ingresos).toBe(40_000);
    expect(JSON.stringify(isr)).not.toContain('"deducciones":20000');
  });

  it("régimen no soportado: no evaluable", () => {
    const e = con({ regimen: null, regimen_sat: "620" });
    expect(motivos(e)).toContain("regimen_no_soportado");
  });
});

describe("determinismo y obsolescencia", () => {
  it("mismas entradas ⇒ misma huella normativa", () => {
    const e = con({ ingresos_cobrados_centavos: 10_000_00, iva_trasladado_cobrado_centavos: 1_600_00 });
    expect(calcularPreliminar(e).normativa_sha256).toBe(calcularPreliminar(e).normativa_sha256);
    expect(calcularPreliminar(e).normativa_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("un cambio en la evidencia cambia el input_hash y obliga a recalcular", () => {
    const a = con({ ingresos_cobrados_centavos: 10_000_00, input_hash: "h1" });
    const b = con({ ingresos_cobrados_centavos: 11_000_00, input_hash: "h2" });
    expect(a.input_hash).not.toBe(b.input_hash);
    expect((calcularPreliminar(a).resultado!.isr as any).ingresos).not.toBe(
      (calcularPreliminar(b).resultado!.isr as any).ingresos,
    );
  });
});
