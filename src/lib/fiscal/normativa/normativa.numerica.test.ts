/**
 * Matriz numérica permanente del motor normativo.
 *
 * Reglas de la suite:
 *  - Los importes esperados se calculan de forma INDEPENDIENTE (cuota fija +
 *    excedente × %), no reutilizando el resultado del motor.
 *  - Cubre: límite inferior exacto, un centavo abajo/arriba del cambio de
 *    tramo, ingreso cero, ingresos elevados, subsidio, retenciones, pagos
 *    provisionales, pérdidas fiscales, RESICO, PM e IVA (trasladado,
 *    acreditable, retenido y saldo a favor), redondeos y selección por periodo.
 *  - Ninguna prueba depende de la fecha del servidor ni de servicios externos.
 */
import { describe, it, expect } from "vitest";
import {
  calcularIsrPf,
  calcularIsrPm,
  calcularIsrSalarios,
  calcularResicoPf,
  calcularIva,
  resolverNormativa,
  conjuntoPorId,
  verificarSello,
  inventarioNormativo,
} from "./motor";
import { CATALOGO_NORMATIVO, HASHES_PUBLICADOS, hashConjunto } from "./catalogo";

const c2 = (n: number) => Math.round(n * 100) / 100;
/** Cálculo independiente: cuota fija + (base − LI) × % */
const esperado = (base: number, li: number, cuota: number, pct: number) => c2(cuota + ((base - li) * pct) / 100);

// ─────────────────────────────────────────────────────────────────────────────
describe("Integridad e inmutabilidad del catálogo", () => {
  it("cada conjunto publicado conserva su hash", () => {
    for (const c of CATALOGO_NORMATIVO) {
      expect(hashConjunto(c)).toBe(HASHES_PUBLICADOS[c.id]);
    }
  });

  it("las reglas publicadas están congeladas: no se pueden editar en caliente", () => {
    const c = CATALOGO_NORMATIVO.find((x) => x.id === "isr-pf-mensual-2026-v1")!;
    expect(Object.isFrozen(c)).toBe(true);
    expect(Object.isFrozen(c.cuerpo)).toBe(true);
    expect(() => {
      (c as unknown as Record<string, unknown>)["version"] = "hackeada";
    }).toThrow();
    expect(c.version).toBe("2026.1");
  });

  it("no hay ids duplicados y todos declaran fuente oficial verificada", () => {
    const ids = CATALOGO_NORMATIVO.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CATALOGO_NORMATIVO) {
      expect(c.fuente.url).toMatch(/^https?:\/\//);
      expect(c.fuente.publicacionDOF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.fuente.entradaVigor).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.verificacion.estado).toBe("verificado");
    }
  });

  it("las tarifas son continuas: el LI de cada tramo es el LS anterior + 1 centavo", () => {
    for (const c of CATALOGO_NORMATIVO) {
      if (c.cuerpo.tipo !== "tarifa") continue;
      const tr = c.cuerpo.tramos;
      for (let i = 1; i < tr.length; i++) {
        expect(c2(tr[i]!.limiteInferior)).toBe(c2(tr[i - 1]!.limiteSuperior! + 0.01));
        expect(tr[i]!.porcentaje).toBeGreaterThan(tr[i - 1]!.porcentaje);
      }
      expect(tr[0]!.cuotaFija).toBe(0);
      expect(tr[tr.length - 1]!.limiteSuperior).toBeNull();
    }
  });

  it("la tarifa anual 2026 equivale a 12 × la mensual (tolerancia de redondeo del Anexo 8)", () => {
    const m = CATALOGO_NORMATIVO.find((c) => c.id === "isr-pf-mensual-2026-v1")!;
    const a = CATALOGO_NORMATIVO.find((c) => c.id === "isr-pf-anual-2026-v1")!;
    if (m.cuerpo.tipo !== "tarifa" || a.cuerpo.tipo !== "tarifa") throw new Error("tipo");
    m.cuerpo.tramos.forEach((tm, i) => {
      const ta = a.cuerpo.tipo === "tarifa" ? a.cuerpo.tramos[i]! : null!;
      expect(ta.porcentaje).toBe(tm.porcentaje);
      expect(Math.abs(ta.limiteInferior - tm.limiteInferior * 12)).toBeLessThan(1);
      expect(Math.abs(ta.cuotaFija - tm.cuotaFija * 12)).toBeLessThan(1.5);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Selección por periodo del cálculo (no por fecha del servidor)", () => {
  it("un cálculo de 2024 usa reglas 2024", () => {
    const r = calcularIsrPf({ periodo: "2024-06", ingresos: 20000 });
    expect(r.normativa.ejercicio).toBe(2024);
    expect(r.normativa.conjuntoId).toBe("isr-pf-mensual-2024-v1");
  });

  it("un cálculo de 2025 usa reglas 2025", () => {
    const r = calcularIsrPf({ periodo: "2025-06", ingresos: 20000 });
    expect(r.normativa.ejercicio).toBe(2025);
    expect(r.normativa.conjuntoId).toBe("isr-pf-mensual-2025-v1");
  });

  it("un cálculo de 2026 usa reglas 2026", () => {
    const r = calcularIsrPf({ periodo: "2026-06", ingresos: 20000 });
    expect(r.normativa.ejercicio).toBe(2026);
    expect(r.normativa.conjuntoId).toBe("isr-pf-mensual-2026-v1");
  });

  it("un periodo sin reglas falla cerrado y NO reutiliza el año anterior", () => {
    expect(() => calcularIsrPf({ periodo: "2027-01", ingresos: 20000 })).toThrow(/2027/);
    expect(() => calcularIsrPf({ periodo: "2023-01", ingresos: 20000 })).toThrow();
  });

  it("las tarifas 2026 y 2024 producen resultados distintos con el mismo ingreso", () => {
    const a = calcularIsrPf({ periodo: "2024-06", ingresos: 50000 });
    const b = calcularIsrPf({ periodo: "2026-06", ingresos: 50000 });
    expect(a.isrCausado).not.toBe(b.isrCausado);
    expect(b.isrCausado).toBeLessThan(a.isrCausado); // tarifa 2026 actualizada por inflación
  });

  it("el sello viaja con cada resultado: ejercicio, versión, fuente, hash y fecha", () => {
    const r = calcularIsrPf({ periodo: "2026-03", ingresos: 30000 });
    expect(r.normativa.version).toBe("2026.1");
    expect(r.normativa.hash).toBe(HASHES_PUBLICADOS["isr-pf-mensual-2026-v1"]);
    expect(r.normativa.publicacionDOF).toBe("2025-12-28");
    expect(new Date(r.normativa.calculadoEn).toString()).not.toBe("Invalid Date");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("ISR PF mensual 2026 — bordes exactos de cada tramo", () => {
  const tramos = (() => {
    const c = CATALOGO_NORMATIVO.find((x) => x.id === "isr-pf-mensual-2026-v1")!;
    if (c.cuerpo.tipo !== "tarifa") throw new Error("tipo");
    return c.cuerpo.tramos;
  })();

  it.each(tramos.map((t, i) => [i, t] as const))("tramo %i: límite inferior exacto", (_i, t) => {
    const r = calcularIsrPf({ periodo: "2026-05", ingresos: t.limiteInferior });
    expect(r.isrCausado).toBe(esperado(t.limiteInferior, t.limiteInferior, t.cuotaFija, t.porcentaje));
    expect(r.porcentaje).toBe(t.porcentaje);
  });

  it.each(tramos.slice(0, -1).map((t, i) => [i, t] as const))(
    "tramo %i: un centavo debajo del cambio de rango sigue en el tramo",
    (_i, t) => {
      const base = c2(t.limiteSuperior!);
      const r = calcularIsrPf({ periodo: "2026-05", ingresos: base });
      expect(r.porcentaje).toBe(t.porcentaje);
      expect(r.isrCausado).toBe(esperado(base, t.limiteInferior, t.cuotaFija, t.porcentaje));
    },
  );

  it.each(tramos.slice(1).map((t, i) => [i + 1, t] as const))(
    "tramo %i: un centavo arriba salta al tramo siguiente",
    (_i, t) => {
      const base = c2(t.limiteInferior);
      const r = calcularIsrPf({ periodo: "2026-05", ingresos: base });
      expect(r.porcentaje).toBe(t.porcentaje);
      expect(r.cuotaFija).toBe(t.cuotaFija);
    },
  );

  it("ingreso cero: ISR cero, sin error", () => {
    const r = calcularIsrPf({ periodo: "2026-05", ingresos: 0 });
    expect(r.base).toBe(0);
    expect(r.isrCausado).toBe(0);
    expect(r.tasaEfectiva).toBe(0);
  });

  it("ingreso elevado (5 millones) cae en el último tramo al 35%", () => {
    const r = calcularIsrPf({ periodo: "2026-05", ingresos: 5_000_000 });
    expect(r.porcentaje).toBe(35);
    expect(r.isrCausado).toBe(esperado(5_000_000, 425642.0, 133488.54, 35));
  });

  it("montos negativos o no numéricos se rechazan", () => {
    expect(() => calcularIsrPf({ periodo: "2026-05", ingresos: -1 })).toThrow();
    expect(() => calcularIsrPf({ periodo: "2026-05", ingresos: Number.NaN })).toThrow();
  });

  it("redondeo a centavos en todos los importes devueltos", () => {
    const r = calcularIsrPf({ periodo: "2026-05", ingresos: 33333.333, deducciones: 1111.117 });
    for (const v of [r.base, r.isrCausado, r.isrACargo, r.isrAFavor, r.impuestoMarginal]) {
      expect(c2(v)).toBe(v);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("ISR PF — deducciones, retenciones y pagos provisionales", () => {
  it("la base es ingresos menos deducciones", () => {
    const r = calcularIsrPf({ periodo: "2026-04", ingresos: 60000, deducciones: 20000 });
    expect(r.base).toBe(40000);
    expect(r.isrCausado).toBe(esperado(40000, 35362.84, 5665.16, 23.52));
  });

  it("deducciones mayores a ingresos dejan base en cero (no negativa)", () => {
    const r = calcularIsrPf({ periodo: "2026-04", ingresos: 10000, deducciones: 25000 });
    expect(r.base).toBe(0);
    expect(r.isrCausado).toBe(0);
  });

  it("retenciones y pagos anteriores se restan del causado", () => {
    const r = calcularIsrPf({
      periodo: "2026-04",
      ingresos: 60000,
      deducciones: 20000,
      retenciones: 1000,
      pagosProvisionalesAnteriores: 500,
    });
    const causado = esperado(40000, 35362.84, 5665.16, 23.52);
    expect(r.isrACargo).toBe(c2(causado - 1500));
    expect(r.isrAFavor).toBe(0);
  });

  it("retenciones superiores al causado generan saldo a favor y cero a cargo", () => {
    const r = calcularIsrPf({ periodo: "2026-04", ingresos: 20000, retenciones: 99999 });
    expect(r.isrACargo).toBe(0);
    expect(r.isrAFavor).toBe(c2(99999 - r.isrCausado));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Subsidio para el empleo (salarios) 2026", () => {
  it("ingreso bajo: el subsidio supera al ISR y se entrega diferencia", () => {
    const r = calcularIsrSalarios({ periodo: "2026-03", ingresoGravable: 1500, aplicaSubsidio: true });
    expect(r.isrCausado).toBe(esperado(1500, 844.6, 16.22, 6.4));
    expect(r.subsidioEmpleo).toBe(407.02);
    expect(r.isrARetener).toBe(0);
    expect(r.subsidioEntregado).toBe(c2(407.02 - r.isrCausado));
  });

  it("ingreso medio: el subsidio sólo reduce el ISR a retener", () => {
    const r = calcularIsrSalarios({ periodo: "2026-03", ingresoGravable: 6000, aplicaSubsidio: true });
    expect(r.subsidioEmpleo).toBe(294.63);
    expect(r.isrARetener).toBe(c2(r.isrCausado - 294.63));
  });

  it("arriba del último tramo el subsidio es cero", () => {
    const r = calcularIsrSalarios({ periodo: "2026-03", ingresoGravable: 25000, aplicaSubsidio: true });
    expect(r.subsidioEmpleo).toBe(0);
    expect(r.isrARetener).toBe(r.isrCausado);
  });

  it("sin derecho a subsidio no se aplica y no se sella tabla de subsidio", () => {
    const r = calcularIsrSalarios({ periodo: "2026-03", ingresoGravable: 1500 });
    expect(r.subsidioEmpleo).toBe(0);
    expect(r.normativaSubsidio).toBeNull();
  });

  it("el subsidio no existe para 2024/2025 en el catálogo: falla cerrado", () => {
    expect(() => calcularIsrSalarios({ periodo: "2025-03", ingresoGravable: 1500, aplicaSubsidio: true })).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("ISR Persona Moral", () => {
  it("coeficiente de utilidad y tasa del 30%", () => {
    const r = calcularIsrPm({ periodo: "2026-03", ingresosNominales: 1_000_000, coeficienteUtilidad: 0.15 });
    expect(r.utilidadFiscal).toBe(150000);
    expect(r.tasa).toBe(30);
    expect(r.isrCausado).toBe(45000);
  });

  it("las pérdidas fiscales reducen la base", () => {
    const r = calcularIsrPm({
      periodo: "2026-03",
      ingresosNominales: 1_000_000,
      coeficienteUtilidad: 0.15,
      perdidasPendientes: 50000,
    });
    expect(r.base).toBe(100000);
    expect(r.isrCausado).toBe(30000);
    expect(r.perdidasAplicadas).toBe(50000);
  });

  it("pérdidas mayores a la utilidad dejan base en cero", () => {
    const r = calcularIsrPm({
      periodo: "2026-03",
      ingresosNominales: 100000,
      coeficienteUtilidad: 0.1,
      perdidasPendientes: 999999,
    });
    expect(r.base).toBe(0);
    expect(r.isrCausado).toBe(0);
    expect(r.perdidasAplicadas).toBe(10000);
  });

  it("pagos anteriores y retenciones determinan el saldo a cargo o a favor", () => {
    const base = { periodo: "2026-03", ingresosNominales: 1_000_000, coeficienteUtilidad: 0.15 } as const;
    expect(calcularIsrPm({ ...base, pagosProvisionalesAnteriores: 20000, retenciones: 5000 }).isrACargo).toBe(20000);
    expect(calcularIsrPm({ ...base, pagosProvisionalesAnteriores: 60000 }).isrAFavor).toBe(15000);
  });

  it("el coeficiente debe venir en decimales", () => {
    expect(() => calcularIsrPm({ periodo: "2026-03", ingresosNominales: 1000, coeficienteUtilidad: 15 })).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("RESICO PF", () => {
  const casos: Array<[number, number]> = [
    [25000, 1.0],
    [50000, 1.1],
    [83333.33, 1.5],
    [208333.33, 2.0],
    [3500000 / 12, 2.5],
  ];

  it.each(casos)("ingreso %s aplica tasa %s%%", (ingreso, tasa) => {
    const r = calcularResicoPf({ periodo: "2026-03", ingresosCobrados: ingreso });
    expect(r.tasa).toBe(tasa);
    expect(r.isrCausado).toBe(c2((ingreso * tasa) / 100));
  });

  it("retención del 1.25% cuando factura a persona moral", () => {
    const r = calcularResicoPf({ periodo: "2026-03", ingresosCobrados: 40000, retencionPersonaMoral: true });
    expect(r.retencion).toBe(500);
    // 40,000 × 1.1% = 440 de ISR causado; la retención (500) lo absorbe por completo.
    expect(r.isrCausado).toBe(440);
    expect(r.isrACargo).toBe(0);

    const mayor = calcularResicoPf({ periodo: "2026-03", ingresosCobrados: 200000, retencionPersonaMoral: true });
    expect(mayor.retencion).toBe(2500);
    expect(mayor.isrACargo).toBe(c2(mayor.isrCausado - 2500));
  });

  it("la retención nunca deja el ISR a cargo en negativo", () => {
    const r = calcularResicoPf({ periodo: "2026-03", ingresosCobrados: 10000, retencionPersonaMoral: true });
    expect(r.isrACargo).toBeGreaterThanOrEqual(0);
  });

  it("rebasar el límite anual de 3.5 MDP bloquea el cálculo con motivo", () => {
    const r = calcularResicoPf({ periodo: "2026-11", ingresosCobrados: 100000, acumuladoAnualPrevio: 3_490_000 });
    expect(r.bloqueado).toBe(true);
    expect(r.motivoBloqueo).toMatch(/límite anual/i);
  });

  it("rebasar el último tramo mensual saca al contribuyente del régimen", () => {
    const r = calcularResicoPf({ periodo: "2026-03", ingresosCobrados: 400000 });
    expect(r.excedeTopeMensual).toBe(true);
    expect(r.bloqueado).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("IVA", () => {
  it("IVA a cargo", () => {
    const r = calcularIva({ periodo: "2026-03", ivaTrasladado: 16000, ivaAcreditable: 6000 });
    expect(r.ivaACargo).toBe(10000);
    expect(r.ivaAFavor).toBe(0);
    expect(r.tasaGeneral).toBe(16);
  });

  it("IVA a favor", () => {
    const r = calcularIva({ periodo: "2026-03", ivaTrasladado: 4000, ivaAcreditable: 9000 });
    expect(r.ivaACargo).toBe(0);
    expect(r.ivaAFavor).toBe(5000);
  });

  it("IVA retenido y saldo a favor anterior disminuyen el cargo", () => {
    const r = calcularIva({
      periodo: "2026-03",
      ivaTrasladado: 16000,
      ivaAcreditable: 4000,
      ivaRetenido: 2000,
      saldoAFavorAnterior: 1000,
    });
    expect(r.ivaACargo).toBe(9000);
  });

  it("valores negativos se rechazan", () => {
    expect(() => calcularIva({ periodo: "2026-03", ivaTrasladado: -1, ivaAcreditable: 0 })).toThrow();
    expect(() => calcularIva({ periodo: "2026-03", ivaTrasladado: 0, ivaAcreditable: -5 })).toThrow();
  });

  it("redondeo a centavos", () => {
    const r = calcularIva({ periodo: "2026-03", ivaTrasladado: 1234.567, ivaAcreditable: 234.561 });
    expect(r.ivaACargo).toBe(1000.01);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Historial y reproducibilidad", () => {
  it("un resultado archivado se puede reproducir con su conjunto original", () => {
    const r = calcularIsrPf({ periodo: "2024-06", ingresos: 45000 });
    const v = verificarSello(r.normativa);
    expect(v.reproducible).toBe(true);
    const rehecho = calcularIsrPf({ periodo: "2024-06", ingresos: 45000 });
    expect(rehecho.isrCausado).toBe(r.isrCausado);
    expect(rehecho.normativa.hash).toBe(r.normativa.hash);
  });

  it("publicar reglas nuevas para 2026 no altera un cálculo histórico de 2024", () => {
    const historico = calcularIsrPf({ periodo: "2024-06", ingresos: 45000 });
    const actual = calcularIsrPf({ periodo: "2026-06", ingresos: 45000 });
    expect(historico.normativa.conjuntoId).not.toBe(actual.normativa.conjuntoId);
    expect(historico.isrCausado).toBe(esperado(45000, 31236.5, 5004.12, 23.52));
  });

  it("un hash alterado marca el resultado como NO reproducible", () => {
    const r = calcularIsrPf({ periodo: "2026-06", ingresos: 45000 });
    const v = verificarSello({ conjuntoId: r.normativa.conjuntoId, hash: "fnv1a32:deadbeef" });
    expect(v.reproducible).toBe(false);
    expect(v.reproducible === false && v.motivo).toMatch(/modificado/);
  });

  it("un conjunto inexistente marca el resultado como NO reproducible", () => {
    expect(verificarSello({ conjuntoId: "no-existe", hash: "x" }).reproducible).toBe(false);
    expect(conjuntoPorId("no-existe")).toBeNull();
  });

  it("el inventario público expone versión, fuente, verificación y hash", () => {
    const inv = inventarioNormativo();
    expect(inv.length).toBe(CATALOGO_NORMATIVO.length);
    for (const i of inv) {
      expect(i.hash).toBe(HASHES_PUBLICADOS[i.id]);
      expect(i.verificacion.estado).toBe("verificado");
    }
  });

  it("resolverNormativa exige periodo válido AAAA-MM", () => {
    expect(() => resolverNormativa("ISR", "PF_GENERAL_MENSUAL", "2026-13")).toThrow();
    expect(() => resolverNormativa("ISR", "PF_GENERAL_MENSUAL", "junio")).toThrow();
  });
});
