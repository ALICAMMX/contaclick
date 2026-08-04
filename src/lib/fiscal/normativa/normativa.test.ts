import { describe, it, expect } from "vitest";
import {
  resolverNormativa,
  calcularIsrPf,
  calcularIsrPm,
  calcularResicoPf,
  calcularIva,
  aplicarTarifa,
  round2,
  rangoPeriodo,
  inventarioNormativo,
  NormativaNoVigenteError,
} from "./motor";
import { CATALOGO_NORMATIVO } from "./catalogo";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Resolución normativa por periodo — sin fallback silencioso
// ─────────────────────────────────────────────────────────────────────────────
describe("resolución normativa por periodo", () => {
  it("2026-07 usa la tabla del Anexo 8 RMF 2026", () => {
    const c = resolverNormativa("ISR", "PF_GENERAL_MENSUAL", "2026-07");
    expect(c.ejercicio).toBe(2026);
    expect(c.version).toBe("2026.1");
    expect(c.fuente.publicacionDOF).toBe("2025-12-28");
  });

  it("2025-11 usa la tabla 2025, no la 2026", () => {
    const c = resolverNormativa("ISR", "PF_GENERAL_MENSUAL", "2025-11");
    expect(c.ejercicio).toBe(2025);
  });

  it("bloquea (no cae a la última tabla) un ejercicio sin tabla cargada", () => {
    expect(() => resolverNormativa("ISR", "PF_GENERAL_MENSUAL", "2027-01")).toThrow(
      NormativaNoVigenteError,
    );
    expect(() => resolverNormativa("ISR", "PF_GENERAL_MENSUAL", "2023-05")).toThrow(
      /No hay tabla normativa vigente/,
    );
  });

  it("rechaza periodos con formato inválido", () => {
    expect(() => rangoPeriodo("2026-13")).toThrow();
    expect(() => rangoPeriodo("julio")).toThrow();
  });

  it("calcula correctamente el rango del periodo (bisiesto incluido)", () => {
    expect(rangoPeriodo("2026-02").hasta).toBe("2026-02-28");
    expect(rangoPeriodo("2028-02").hasta).toBe("2028-02-29");
    expect(rangoPeriodo("2026")).toEqual({ desde: "2026-01-01", hasta: "2026-12-31", ejercicio: 2026 });
  });

  it("todo conjunto del catálogo declara fuente, URL, DOF y vigencia", () => {
    for (const c of CATALOGO_NORMATIVO) {
      expect(c.fuente.url).toMatch(/^https:\/\//);
      expect(c.fuente.publicacionDOF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.fuente.entradaVigor).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.actualizadoAl).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.version.length).toBeGreaterThan(0);
    }
    expect(inventarioNormativo().length).toBe(CATALOGO_NORMATIVO.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ISR PF — límites inferior, exacto y superior de CADA tramo (2026)
// ─────────────────────────────────────────────────────────────────────────────
describe("ISR PF 2026 — fronteras de todos los tramos", () => {
  const tramos = (() => {
    const c = resolverNormativa("ISR", "PF_GENERAL_MENSUAL", "2026-06");
    if (c.cuerpo.tipo !== "tarifa") throw new Error("tipo inválido");
    return c.cuerpo.tramos;
  })();

  it("en el límite inferior exacto el ISR es la cuota fija", () => {
    for (const t of tramos) {
      const r = aplicarTarifa(t.limiteInferior, tramos);
      expect(r.tramo.limiteInferior).toBe(t.limiteInferior);
      expect(r.impuesto).toBe(round2(t.cuotaFija));
    }
  });

  it("en el límite superior el impuesto empalma con la cuota fija del siguiente tramo (±$0.05)", () => {
    for (let i = 0; i < tramos.length - 1; i++) {
      const t = tramos[i]!;
      const sig = tramos[i + 1]!;
      const r = aplicarTarifa(t.limiteSuperior!, tramos);
      expect(Math.abs(r.impuesto - sig.cuotaFija)).toBeLessThanOrEqual(0.05);
    }
  });

  it("un peso por encima del límite superior cambia de tramo y sube la tasa marginal", () => {
    for (let i = 0; i < tramos.length - 1; i++) {
      const t = tramos[i]!;
      const r = aplicarTarifa(t.limiteSuperior! + 0.01, tramos);
      expect(r.tramo.porcentaje).toBeGreaterThan(t.porcentaje);
    }
  });

  it("caso conocido: base $50,000 en 2026", () => {
    // Tramo 35,362.84–55,736.68 · cuota 5,665.16 · 23.52%
    const r = calcularIsrPf({ periodo: "2026-06", ingresos: 50000 });
    expect(r.base).toBe(50000);
    expect(r.porcentaje).toBe(23.52);
    expect(r.isrCausado).toBe(round2(5665.16 + (50000 - 35362.84) * 0.2352));
    expect(r.isrCausado).toBe(9107.82);
  });

  it("mismo importe en 2025 produce OTRO resultado (no se mezclan tablas)", () => {
    const a = calcularIsrPf({ periodo: "2026-06", ingresos: 50000 });
    const b = calcularIsrPf({ periodo: "2025-06", ingresos: 50000 });
    expect(b.normativa.ejercicio).toBe(2025);
    expect(b.isrCausado).not.toBe(a.isrCausado);
    expect(b.isrCausado).toBe(round2(9236.89 + (50000 - 49233.0) * 0.3));
  });

  it("deducciones, retenciones y pagos provisionales se restan del causado", () => {
    const r = calcularIsrPf({
      periodo: "2026-06",
      ingresos: 80000,
      deducciones: 30000,
      retenciones: 3000,
      pagosProvisionalesAnteriores: 2000,
    });
    expect(r.base).toBe(50000);
    expect(r.isrACargo).toBe(round2(r.isrCausado - 5000));
    expect(r.isrAFavor).toBe(0);
  });

  it("si retenciones exceden el causado hay saldo a favor y el cargo es cero", () => {
    const r = calcularIsrPf({ periodo: "2026-06", ingresos: 10000, retenciones: 5000 });
    expect(r.isrACargo).toBe(0);
    expect(r.isrAFavor).toBe(round2(5000 - r.isrCausado));
  });

  it("base cero e ingresos menores a deducciones no producen ISR negativo", () => {
    const r = calcularIsrPf({ periodo: "2026-06", ingresos: 1000, deducciones: 9000 });
    expect(r.base).toBe(0);
    expect(r.isrCausado).toBe(0);
    expect(r.isrACargo).toBe(0);
  });

  it("rechaza montos negativos o no numéricos", () => {
    expect(() => calcularIsrPf({ periodo: "2026-06", ingresos: -1 })).toThrow(/no admite valores negativos/);
    expect(() => calcularIsrPf({ periodo: "2026-06", ingresos: Number.NaN })).toThrow(/no es un número válido/);
  });

  it("bloquea el cálculo cuando no hay tabla del ejercicio", () => {
    expect(() => calcularIsrPf({ periodo: "2027-03", ingresos: 50000 })).toThrow(NormativaNoVigenteError);
  });

  it("sella el resultado con ejercicio, versión y fuente", () => {
    const r = calcularIsrPf({ periodo: "2026-06", ingresos: 50000 });
    expect(r.normativa.ejercicio).toBe(2026);
    expect(r.normativa.version).toBe("2026.1");
    expect(r.normativa.naturaleza).toBe("determinista");
    expect(r.normativa.requiereRevisionProfesional).toBe(true);
    expect(r.normativa.url).toContain("sat.gob.mx");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ISR PM
// ─────────────────────────────────────────────────────────────────────────────
describe("ISR PM — coeficiente, pérdidas, pagos anteriores y retenciones", () => {
  it("utilidad fiscal = ingresos × coeficiente − pérdidas; ISR = 30%", () => {
    const r = calcularIsrPm({
      periodo: "2026-06",
      ingresosNominales: 1_000_000,
      coeficienteUtilidad: 0.15,
      perdidasPendientes: 50_000,
    });
    expect(r.utilidadFiscal).toBe(150000);
    expect(r.base).toBe(100000);
    expect(r.tasa).toBe(30);
    expect(r.isrCausado).toBe(30000);
    expect(r.isrACargo).toBe(30000);
  });

  it("pérdidas mayores a la utilidad no generan base negativa", () => {
    const r = calcularIsrPm({
      periodo: "2026-06",
      ingresosNominales: 100_000,
      coeficienteUtilidad: 0.1,
      perdidasPendientes: 500_000,
    });
    expect(r.base).toBe(0);
    expect(r.isrCausado).toBe(0);
    expect(r.perdidasAplicadas).toBe(10000);
  });

  it("pagos provisionales y retenciones generan saldo a favor", () => {
    const r = calcularIsrPm({
      periodo: "2026-06",
      ingresosNominales: 1_000_000,
      coeficienteUtilidad: 0.1,
      pagosProvisionalesAnteriores: 25_000,
      retenciones: 10_000,
    });
    expect(r.isrCausado).toBe(30000);
    expect(r.isrACargo).toBe(0);
    expect(r.isrAFavor).toBe(5000);
  });

  it("rechaza coeficiente expresado en porcentaje", () => {
    expect(() =>
      calcularIsrPm({ periodo: "2026-06", ingresosNominales: 1000, coeficienteUtilidad: 15 }),
    ).toThrow(/decimales/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. RESICO PF
// ─────────────────────────────────────────────────────────────────────────────
describe("RESICO PF — todas las tasas, retención 1.25% y tope anual", () => {
  const casos: Array<[number, number]> = [
    [25_000, 1.0],
    [25_000.01, 1.1],
    [50_000, 1.1],
    [50_000.01, 1.5],
    [83_333.33, 1.5],
    [83_333.34, 2.0],
    [208_333.33, 2.0],
    [208_333.34, 2.5],
    [291_666.66, 2.5],
  ];

  it.each(casos)("ingreso %s → tasa %s%%", (ingreso, tasa) => {
    const r = calcularResicoPf({ periodo: "2026-06", ingresosCobrados: ingreso });
    expect(r.tasa).toBe(tasa);
    expect(r.isrCausado).toBe(round2((ingreso * tasa) / 100));
  });

  it("por encima del último tramo se bloquea el cálculo", () => {
    const r = calcularResicoPf({ periodo: "2026-06", ingresosCobrados: 400_000 });
    expect(r.tasa).toBeNull();
    expect(r.bloqueado).toBe(true);
    expect(r.motivoBloqueo).toMatch(/sale de RESICO/);
  });

  it("retención del 1.25% cuando factura a personas morales", () => {
    const r = calcularResicoPf({
      periodo: "2026-06",
      ingresosCobrados: 40_000,
      retencionPersonaMoral: true,
    });
    expect(r.retencion).toBe(500);
    expect(r.isrCausado).toBe(440);
    expect(r.isrACargo).toBe(0); // la retención supera el causado
  });

  it("controla el límite anual de $3,500,000", () => {
    const ok = calcularResicoPf({ periodo: "2026-12", ingresosCobrados: 100_000, acumuladoAnualPrevio: 3_300_000 });
    expect(ok.bloqueado).toBe(false);
    const fuera = calcularResicoPf({ periodo: "2026-12", ingresosCobrados: 250_000, acumuladoAnualPrevio: 3_300_000 });
    expect(fuera.excedeTopeAnual).toBe(true);
    expect(fuera.motivoBloqueo).toMatch(/límite anual/);
  });

  it("rechaza ingresos negativos", () => {
    expect(() => calcularResicoPf({ periodo: "2026-06", ingresosCobrados: -100 })).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. IVA
// ─────────────────────────────────────────────────────────────────────────────
describe("IVA", () => {
  it("IVA a cargo", () => {
    const r = calcularIva({ periodo: "2026-06", ivaTrasladado: 16_000, ivaAcreditable: 6_000 });
    expect(r.ivaACargo).toBe(10000);
    expect(r.ivaAFavor).toBe(0);
    expect(r.tasaGeneral).toBe(16);
  });

  it("IVA a favor", () => {
    const r = calcularIva({ periodo: "2026-06", ivaTrasladado: 4_000, ivaAcreditable: 9_500 });
    expect(r.ivaACargo).toBe(0);
    expect(r.ivaAFavor).toBe(5500);
  });

  it("descuenta IVA retenido y saldo a favor anterior", () => {
    const r = calcularIva({
      periodo: "2026-06",
      ivaTrasladado: 16_000,
      ivaAcreditable: 4_000,
      ivaRetenido: 1_000,
      saldoAFavorAnterior: 2_000,
    });
    expect(r.ivaACargo).toBe(9000);
  });

  it("rechaza valores negativos", () => {
    expect(() => calcularIva({ periodo: "2026-06", ivaTrasladado: -1, ivaAcreditable: 0 })).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Redondeo a dos decimales
// ─────────────────────────────────────────────────────────────────────────────
describe("redondeo", () => {
  it("siempre a dos decimales", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    const r = calcularIsrPf({ periodo: "2026-06", ingresos: 33_333.33 });
    for (const v of [r.base, r.isrCausado, r.isrACargo, r.isrAFavor]) {
      expect(round2(v)).toBe(v);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Regresivos congelados — si estos valores cambian, hubo cambio normativo
// ─────────────────────────────────────────────────────────────────────────────
describe("casos regresivos congelados", () => {
  const esperados = [
    { periodo: "2026-01", ingresos: 15_000, isr: 1402.82 },
    { periodo: "2026-01", ingresos: 120_000, isr: 30007.87 },
    { periodo: "2025-01", ingresos: 15_000, isr: 1552.78 },
  ];
  it.each(esperados)("$periodo · $ingresos", ({ periodo, ingresos, isr }) => {
    expect(calcularIsrPf({ periodo, ingresos }).isrCausado).toBe(isr);
  });
});
