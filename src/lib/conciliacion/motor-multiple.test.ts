import { describe, expect, it } from "vitest";
import type { CfdiEntrada, MovimientoEntrada } from "./motor";
import {
  combinacionesExactas,
  conciliarMultiple,
  llaveCombinacion,
  mencionaContraparte,
  type PagoComplemento,
} from "./motor-multiple";

const mov = (o: Partial<MovimientoEntrada> & { id: string }): MovimientoEntrada => ({
  fecha: "2026-03-20",
  importe_centavos: 100000,
  direccion: "abono",
  descripcion: null,
  referencia: null,
  moneda: "MXN",
  ignorado: false,
  no_fiscal: false,
  ...o,
});

const cfdi = (o: Partial<CfdiEntrada> & { id: string }): CfdiEntrada => ({
  uuid: null,
  fecha: "2026-03-05",
  total_centavos: 100000,
  direccion: "emitido",
  tipo_cfdi: "I",
  metodo_pago: "PUE",
  estatus_sat: "vigente",
  moneda: "MXN",
  rfc_contraparte: "ACM010101AB1",
  nombre_contraparte: "ACME DISTRIBUCIONES SA DE CV",
  ...o,
});

describe("combinaciones exactas", () => {
  it("encuentra la combinación que suma al centavo y detecta ambigüedad", () => {
    const items = [
      { id: "a", centavos: 500 },
      { id: "b", centavos: 300 },
      { id: "c", centavos: 200 },
      { id: "d", centavos: 700 },
    ];
    const r = combinacionesExactas(items, 1000, 8, 3);
    // 500+300+200 y 300+700 suman 1000
    expect(r.length).toBe(2);
    expect(combinacionesExactas([{ id: "a", centavos: 1000 }], 1000, 8)).toEqual([]); // uno solo no es múltiple
  });
});

describe("contraparte en el texto bancario", () => {
  it("reconoce RFC o nombre sin la forma societaria", () => {
    const m = mov({ id: "m", descripcion: "SPEI RECIBIDO ACME DISTRIBUCIONES" });
    expect(mencionaContraparte(m, "XXX010101XX1", "ACME DISTRIBUCIONES, S.A. DE C.V.")).toBe(true);
    expect(mencionaContraparte(mov({ id: "m2", referencia: "ACM010101AB1 FAC 33" }), "ACM010101AB1", null)).toBe(true);
    expect(mencionaContraparte(mov({ id: "m3", descripcion: "DEPOSITO EN EFECTIVO" }), "ACM010101AB1", "ACME DISTRIBUCIONES")).toBe(false);
  });
});

describe("uno a varios", () => {
  it("un depósito que paga tres facturas de la misma contraparte", () => {
    const r = conciliarMultiple({
      movimientos: [mov({ id: "m1", importe_centavos: 350000, descripcion: "SPEI ACME DISTRIBUCIONES" })],
      cfdi: [
        cfdi({ id: "c1", total_centavos: 100000 }),
        cfdi({ id: "c2", total_centavos: 150000 }),
        cfdi({ id: "c3", total_centavos: 100000, metodo_pago: "PPD" }),
        cfdi({ id: "c4", total_centavos: 99999 }),
      ],
      pagos: [],
    });
    // 100000+150000+100000 = 350000; c4 no entra
    expect(r.grupos).toHaveLength(1);
    const g = r.grupos[0];
    expect(g.tipo).toBe("uno_a_varios");
    expect(g.estado).toBe("propuesto");
    expect(g.cfdi_ids).toEqual(["c1", "c2", "c3"]);
    expect(g.miembros.reduce((s, x) => s + x.asignado_centavos, 0)).toBe(350000);
  });

  it("no mezcla facturas de dos clientes distintos aunque la suma cuadre", () => {
    const r = conciliarMultiple({
      movimientos: [mov({ id: "m1", importe_centavos: 200000, descripcion: "SPEI ACME DISTRIBUCIONES" })],
      cfdi: [
        cfdi({ id: "c1", total_centavos: 100000 }),
        cfdi({ id: "c2", total_centavos: 100000, rfc_contraparte: "OTR020202BB2", nombre_contraparte: "OTRO CLIENTE SA DE CV" }),
      ],
      pagos: [],
    });
    expect(r.grupos).toHaveLength(0);
  });

  it("sin mención de la contraparte en el banco no propone nada", () => {
    const r = conciliarMultiple({
      movimientos: [mov({ id: "m1", importe_centavos: 200000, descripcion: "DEPOSITO" })],
      cfdi: [cfdi({ id: "c1" }), cfdi({ id: "c2" })],
      pagos: [],
    });
    expect(r.grupos).toHaveLength(0);
  });

  it("si hay dos combinaciones posibles queda para revisión", () => {
    const r = conciliarMultiple({
      movimientos: [mov({ id: "m1", importe_centavos: 200000, descripcion: "SPEI ACME DISTRIBUCIONES" })],
      cfdi: [cfdi({ id: "c1" }), cfdi({ id: "c2" }), cfdi({ id: "c3" })],
      pagos: [],
    });
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].nivel_propuesta).toBe("revision_requerida");
    expect(r.grupos[0].evidencia.combinaciones_alternativas).toBeGreaterThan(0);
  });

  it("respeta combinaciones rechazadas por una persona", () => {
    const base = {
      movimientos: [mov({ id: "m1", importe_centavos: 250000, descripcion: "SPEI ACME DISTRIBUCIONES" })],
      cfdi: [cfdi({ id: "c1" }), cfdi({ id: "c2", total_centavos: 150000 })],
      pagos: [],
    };
    expect(conciliarMultiple(base).grupos).toHaveLength(1);
    const r = conciliarMultiple({ ...base, combinaciones_rechazadas: [llaveCombinacion(["m1"], ["c1", "c2"])] });
    expect(r.grupos).toHaveLength(0);
  });

  it("ignora cancelados y facturas fuera de la ventana de crédito", () => {
    const r = conciliarMultiple({
      movimientos: [mov({ id: "m1", importe_centavos: 200000, descripcion: "SPEI ACME DISTRIBUCIONES" })],
      cfdi: [
        cfdi({ id: "c1" }),
        cfdi({ id: "c2", estatus_sat: "cancelado" }),
        cfdi({ id: "c3", fecha: "2025-11-01" }),
      ],
      pagos: [],
    });
    expect(r.grupos).toHaveLength(0);
  });
});

describe("varios a uno", () => {
  it("anticipo más finiquito cubren una factura", () => {
    const r = conciliarMultiple({
      movimientos: [
        mov({ id: "m1", fecha: "2026-03-01", importe_centavos: 50000, descripcion: "SPEI ACME DISTRIBUCIONES ANTICIPO" }),
        mov({ id: "m2", fecha: "2026-03-25", importe_centavos: 66000, descripcion: "SPEI ACME DISTRIBUCIONES" }),
        mov({ id: "m3", fecha: "2026-03-25", importe_centavos: 66000, descripcion: "DEPOSITO" }),
      ],
      cfdi: [cfdi({ id: "c1", total_centavos: 116000, fecha: "2026-03-10" })],
      pagos: [],
    });
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].tipo).toBe("varios_a_uno");
    expect(r.grupos[0].movimiento_ids).toEqual(["m1", "m2"]);
  });

  it("dirección: cargos sólo contra facturas recibidas", () => {
    const r = conciliarMultiple({
      movimientos: [
        mov({ id: "m1", direccion: "cargo", importe_centavos: 50000, descripcion: "PAGO ACME DISTRIBUCIONES" }),
        mov({ id: "m2", direccion: "cargo", importe_centavos: 50000, descripcion: "PAGO ACME DISTRIBUCIONES" }),
      ],
      cfdi: [cfdi({ id: "c1", direccion: "emitido" })],
      pagos: [],
    });
    expect(r.grupos).toHaveLength(0);
  });
});

describe("complementos de pago", () => {
  const p = (o: Partial<PagoComplemento>): PagoComplemento => ({
    cfdi_id: "p1",
    fecha: "2026-03-18",
    monto_centavos: 58000,
    moneda: "MXN",
    num_operacion: null,
    ...o,
  });

  it("empata cada pago declarado con su movimiento usando el número de operación", () => {
    const r = conciliarMultiple({
      movimientos: [
        mov({ id: "m1", fecha: "2026-03-18", importe_centavos: 58000, referencia: "RASTREO 7788990011" }),
        mov({ id: "m2", fecha: "2026-03-18", importe_centavos: 58000, referencia: "OTRA" }),
      ],
      cfdi: [cfdi({ id: "p1", tipo_cfdi: "P", total_centavos: 0 })],
      pagos: [p({ num_operacion: "7788990011" })],
    });
    expect(r.grupos).toHaveLength(1);
    const g = r.grupos[0];
    expect(g.regla).toBe("complemento_pago");
    expect(g.movimiento_ids).toEqual(["m1"]);
    expect(g.evidencia.referencia_coincide).toBe(true);
    expect(g.nivel_propuesta).toBe("automatica_alta_confianza");
  });

  it("si un pago del complemento no aparece en el banco, no propone el complemento a medias", () => {
    const r = conciliarMultiple({
      movimientos: [mov({ id: "m1", fecha: "2026-03-18", importe_centavos: 58000 })],
      cfdi: [cfdi({ id: "p1", tipo_cfdi: "P", total_centavos: 0 })],
      pagos: [p({}), p({ fecha: "2026-03-28", monto_centavos: 12345 })],
    });
    expect(r.grupos).toHaveLength(0);
  });

  it("sin señales fuertes queda para revisión", () => {
    const r = conciliarMultiple({
      movimientos: [mov({ id: "m1", fecha: "2026-03-19", importe_centavos: 58000, descripcion: "DEPOSITO" })],
      cfdi: [cfdi({ id: "p1", tipo_cfdi: "P", total_centavos: 0 })],
      pagos: [p({})],
    });
    expect(r.grupos[0].nivel_propuesta).toBe("revision_requerida");
  });
});

describe("garantías del motor", () => {
  it("nunca confirma y el orden de lectura no cambia el resultado", () => {
    const entrada = {
      movimientos: [
        mov({ id: "m1", importe_centavos: 250000, descripcion: "SPEI ACME DISTRIBUCIONES" }),
        mov({ id: "m2", fecha: "2026-03-01", importe_centavos: 50000, descripcion: "SPEI ACME DISTRIBUCIONES" }),
        mov({ id: "m3", fecha: "2026-03-25", importe_centavos: 66000, descripcion: "SPEI ACME DISTRIBUCIONES" }),
      ],
      cfdi: [cfdi({ id: "c1" }), cfdi({ id: "c2", total_centavos: 150000 }), cfdi({ id: "c3", total_centavos: 116000, fecha: "2026-03-10" })],
      pagos: [],
    };
    const a = conciliarMultiple(entrada);
    const b = conciliarMultiple({
      ...entrada,
      movimientos: [...entrada.movimientos].reverse(),
      cfdi: [...entrada.cfdi].reverse(),
    });
    expect(a.grupos.map((g) => g.idempotency_key)).toEqual(b.grupos.map((g) => g.idempotency_key));
    expect(a.grupos.every((g) => g.estado === "propuesto")).toBe(true);
    // Ningún documento aparece en dos grupos.
    const movs = a.grupos.flatMap((g) => g.movimiento_ids);
    const cfdis = a.grupos.flatMap((g) => g.cfdi_ids);
    expect(new Set(movs).size).toBe(movs.length);
    expect(new Set(cfdis).size).toBe(cfdis.length);
  });

  it("no toca bloqueados, ignorados ni no fiscales", () => {
    const r = conciliarMultiple({
      movimientos: [
        mov({ id: "m1", importe_centavos: 200000, descripcion: "SPEI ACME DISTRIBUCIONES", no_fiscal: true }),
        mov({ id: "m2", importe_centavos: 200000, descripcion: "SPEI ACME DISTRIBUCIONES" }),
      ],
      cfdi: [cfdi({ id: "c1" }), cfdi({ id: "c2" })],
      pagos: [],
      movimientos_bloqueados: ["m2"],
    });
    expect(r.grupos).toHaveLength(0);
  });
});
