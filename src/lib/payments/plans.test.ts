// Regresión del modelo comercial: precios, IVA, programa fundador y la regla
// de que ningún plan restringe herramientas. Todo en centavos enteros.

import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLANES_COMPRABLES,
  PLANES_ORDEN,
  PROGRAMA_FUNDADOR,
  IVA_RATE,
  calcularImportes,
  esElegibleFundador,
  equivalenteMensualCents,
  ahorroAnualCents,
  precioFundadorAnualCents,
  programaFundadorVigente,
  isValidPlan,
  isValidCycle,
  mxnDesdeCents,
} from "./plans";

const DENTRO = new Date("2026-06-15T12:00:00Z");
const FUERA = new Date("2027-01-05T12:00:00Z");

describe("catálogo de planes", () => {
  it("los RFC por plan son 5 / 25 / 100 / personalizado", () => {
    expect(PLANS.starter.maxRfcs).toBe(5);
    expect(PLANS.pro.maxRfcs).toBe(25);
    expect(PLANS.despacho.maxRfcs).toBe(100);
    expect(PLANS.enterprise.maxRfcs).toBe(-1);
  });

  it("los precios de lista mensuales son 499 / 1290 / 2490 y Enterprise se cotiza", () => {
    expect(PLANS.starter.mensualCents).toBe(49_900);
    expect(PLANS.pro.mensualCents).toBe(129_000);
    expect(PLANS.despacho.mensualCents).toBe(249_000);
    expect(PLANS.enterprise.mensualCents).toBeNull();
  });

  it("la anualidad equivale a 10 mensualidades (2 meses gratis)", () => {
    for (const id of PLANES_COMPRABLES) {
      expect(PLANS[id].anualCents).toBe(PLANS[id].mensualCents! * 10);
      expect(ahorroAnualCents(PLANS[id])).toBe(PLANS[id].mensualCents! * 2);
    }
  });

  it("la capacidad operativa crece con el número de RFC", () => {
    const orden = PLANES_COMPRABLES;
    for (let i = 1; i < orden.length; i++) {
      const a = PLANS[orden[i - 1]].capacidadOperativa;
      const b = PLANS[orden[i]].capacidadOperativa;
      expect(b.ia_msgs).toBeGreaterThan(a.ia_msgs);
      expect(b.sat_solicitudes_mes).toBeGreaterThan(a.sat_solicitudes_mes);
      expect(b.almacenamiento_gb).toBeGreaterThan(a.almacenamiento_gb);
      expect(b.max_miembros).toBeGreaterThan(a.max_miembros);
    }
  });

  it("Enterprise no es contratable en línea", () => {
    expect(isValidPlan("enterprise")).toBe(false);
    expect(PLANES_ORDEN).toContain("enterprise");
    expect(PLANES_COMPRABLES).not.toContain("enterprise" as never);
  });

  it("valida ciclos", () => {
    expect(isValidCycle("mensual")).toBe(true);
    expect(isValidCycle("anual")).toBe(true);
    expect(isValidCycle("trimestral")).toBe(false);
  });
});

describe("importes e IVA", () => {
  it("el precio de lista NO incluye IVA y el IVA se suma al 16%", () => {
    const r = calcularImportes({ plan: PLANS.pro, cycle: "mensual", includeIva: true });
    expect(r.baseCents).toBe(129_000);
    expect(r.ivaCents).toBe(Math.round(129_000 * IVA_RATE));
    expect(r.totalCents).toBe(129_000 + r.ivaCents);
    expect(r.total).toBe(149_640 / 100);
    expect(r.ivaIncluidoEnLista).toBe(false);
  });

  it("sin IVA el total es igual al subtotal", () => {
    const r = calcularImportes({ plan: PLANS.starter, cycle: "anual", includeIva: false });
    expect(r.ivaCents).toBe(0);
    expect(r.totalCents).toBe(r.subtotalCents);
  });

  it("todos los importes son enteros en centavos (sin flotantes)", () => {
    for (const id of PLANES_COMPRABLES) {
      for (const cycle of ["mensual", "anual"] as const) {
        const r = calcularImportes({ plan: PLANS[id], cycle, includeIva: true, cuponPct: 33 });
        for (const v of [r.baseCents, r.descuentoCents, r.subtotalCents, r.ivaCents, r.totalCents]) {
          expect(Number.isInteger(v)).toBe(true);
        }
        expect(r.total).toBe(r.totalCents / 100);
      }
    }
  });

  it("Enterprise no puede calcular importes: se cotiza con ventas", () => {
    expect(() => calcularImportes({ plan: PLANS.enterprise, cycle: "anual", includeIva: true })).toThrow();
  });

  it("formatea pesos desde centavos", () => {
    expect(mxnDesdeCents(129_000)).toBe("$1,290");
    expect(mxnDesdeCents(299_400)).toBe("$2,994");
  });
});

describe("programa fundador", () => {
  it("el precio fundador anual es exactamente 40% menos: 2994 / 7740 / 14940", () => {
    expect(precioFundadorAnualCents(PLANS.starter)).toBe(299_400);
    expect(precioFundadorAnualCents(PLANS.pro)).toBe(774_000);
    expect(precioFundadorAnualCents(PLANS.despacho)).toBe(1_494_000);
    expect(precioFundadorAnualCents(PLANS.enterprise)).toBeNull();
    expect(PROGRAMA_FUNDADOR.descuentoPct).toBe(40);
  });

  it("sólo aplica con registro previo, ciclo anual y dentro de vigencia", () => {
    const base = { planId: "pro" as const, cycle: "anual" as const, hoy: DENTRO };
    expect(esElegibleFundador({ ...base, esFundadorRegistrado: true })).toBe(true);
    // Sin registro backend: jamás aplica, aunque el frontend lo pida.
    expect(esElegibleFundador({ ...base, esFundadorRegistrado: false })).toBe(false);
    // Mensual: nunca.
    expect(esElegibleFundador({ ...base, cycle: "mensual", esFundadorRegistrado: true })).toBe(false);
    // Fuera de la ventana del programa.
    expect(esElegibleFundador({ ...base, hoy: FUERA, esFundadorRegistrado: true })).toBe(false);
    // Enterprise se cotiza aparte.
    expect(esElegibleFundador({ ...base, planId: "enterprise", esFundadorRegistrado: true })).toBe(false);
  });

  it("la vigencia del programa es acotada, no perpetua", () => {
    expect(programaFundadorVigente(DENTRO)).toBe(true);
    expect(programaFundadorVigente(FUERA)).toBe(false);
    expect(PROGRAMA_FUNDADOR.renovacionesCubiertasDefault).toBeGreaterThanOrEqual(1);
  });

  it("el descuento fundador se refleja en el importe y no se acumula con cupones", () => {
    const soloFundador = calcularImportes({
      plan: PLANS.pro, cycle: "anual", includeIva: false, fundadorAplicable: true,
    });
    expect(soloFundador.subtotalCents).toBe(774_000);
    expect(soloFundador.fundadorAplicado).toBe(true);

    // Cupón menor: gana el beneficio mayor, no se suman.
    const conCuponChico = calcularImportes({
      plan: PLANS.pro, cycle: "anual", includeIva: false, cuponPct: 10, fundadorAplicable: true,
    });
    expect(conCuponChico.descuentoPct).toBe(40);
    expect(conCuponChico.subtotalCents).toBe(774_000);

    // Cupón mayor: gana el cupón y deja de marcarse como fundador.
    const conCuponGrande = calcularImportes({
      plan: PLANS.pro, cycle: "anual", includeIva: false, cuponPct: 60, fundadorAplicable: true,
    });
    expect(conCuponGrande.descuentoPct).toBe(60);
    expect(conCuponGrande.fundadorAplicado).toBe(false);
  });

  it("el equivalente mensual fundador se calcula sobre el total con descuento", () => {
    expect(equivalenteMensualCents(774_000)).toBe(64_500);
  });
});
