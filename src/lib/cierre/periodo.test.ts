// Corrida SINTÉTICA COMPLETA del bloque documental:
// XML → normalización → relaciones → contadores del periodo → excepciones →
// resolución/aceptación → etapa documental lista.
//
// Sin SAT, sin e.firma, sin PAC, sin IA, sin correo y sin datos fiscales reales.

import { describe, expect, it } from "vitest";
import { normalizarCfdi } from "@/lib/cfdi/normalizacion";
import { evaluarPeriodo, periodoDeFecha, rangoMensual, type DocumentoPagoPeriodo, type DocumentoPeriodo } from "./periodo";
import { facturaXml, pagoXml, RFC_EXPEDIENTE, RFC_OTRO, RFC_TERCERO, U } from "./fixtures";

const PERIODO = "2026-07";

/** Convierte un XML sintético en la fila que vería el evaluador. */
function fila(xml: string, extra: Partial<DocumentoPeriodo> = {}): DocumentoPeriodo {
  const n = normalizarCfdi(xml);
  const e = n.encabezado;
  return {
    id: `id-${e.uuid}`,
    uuid: e.uuid ?? null,
    tipo_cfdi: e.tipoComprobante ?? null,
    rfc_emisor: e.emisor.rfc ?? null,
    rfc_receptor: e.receptor.rfc ?? null,
    metodo_pago: e.metodoPago ?? null,
    estatus_sat: "vigente",
    fecha: e.fecha ?? null,
    periodo: PERIODO,
    total: e.total ?? 0,
    moneda: e.moneda ?? "MXN",
    archivo_hash: `hash-${e.uuid}`,
    detalle_reconstruible: true,
    avisos: [],
    fecha_carga: "2026-08-01T10:00:00Z",
    ...extra,
  };
}

function pagoFila(xml: string): DocumentoPagoPeriodo[] {
  const n = normalizarCfdi(xml);
  return n.pagos.map((p) => ({
    cfdi_id: `id-${n.encabezado.uuid}`,
    numero_pago: p.numero_pago,
    monto: p.monto,
    documentos: p.documentos.map((d) => ({
      id_documento: d.id_documento,
      num_parcialidad: d.num_parcialidad,
      imp_saldo_ant: d.imp_saldo_ant,
      imp_pagado: d.imp_pagado,
      imp_saldo_insoluto: d.imp_saldo_insoluto,
    })),
  }));
}

const XML = {
  ingresoPue: facturaXml({ uuid: U.ingresoPue, emisor: RFC_EXPEDIENTE, receptor: RFC_TERCERO, metodoPago: "PUE" }),
  gastoPue: facturaXml({ uuid: U.gastoPue, emisor: RFC_TERCERO, receptor: RFC_EXPEDIENTE, metodoPago: "PUE" }),
  ingresoPpd: facturaXml({ uuid: U.ingresoPpd, emisor: RFC_EXPEDIENTE, receptor: RFC_TERCERO, metodoPago: "PPD" }),
  ingresoPpd2: facturaXml({ uuid: U.ingresoPpd2, emisor: RFC_EXPEDIENTE, receptor: RFC_TERCERO, metodoPago: "PPD" }),
  extranjera: facturaXml({ uuid: U.extranjera, emisor: RFC_EXPEDIENTE, receptor: RFC_TERCERO, metodoPago: "PPD", moneda: "USD", tipoCambio: 17.5, subtotal: 1000 }),
  notaCredito: facturaXml({ uuid: U.notaCredito, emisor: RFC_EXPEDIENTE, receptor: RFC_TERCERO, tipo: "E", subtotal: 100 }),
  nomina: facturaXml({ uuid: U.nomina, emisor: RFC_EXPEDIENTE, receptor: RFC_TERCERO, tipo: "N", subtotal: 5000 }),
  ajeno: facturaXml({ uuid: U.ajeno, emisor: RFC_TERCERO, receptor: RFC_OTRO }),
  pagoTotal: pagoXml({
    uuid: U.pagoTotal, emisor: RFC_EXPEDIENTE, receptor: RFC_TERCERO, monto: 1160,
    documentos: [{ uuid: U.ingresoPpd, parcialidad: 1, saldoAnt: 1160, pagado: 1160, insoluto: 0 }],
  }),
  pagoParcial1: pagoXml({
    uuid: U.pagoParcial1, emisor: RFC_EXPEDIENTE, receptor: RFC_TERCERO, monto: 500,
    documentos: [{ uuid: U.ingresoPpd2, parcialidad: 1, saldoAnt: 1160, pagado: 500, insoluto: 660 }],
  }),
  pagoParcial2: pagoXml({
    uuid: U.pagoParcial2, emisor: RFC_EXPEDIENTE, receptor: RFC_TERCERO, monto: 660,
    documentos: [{ uuid: U.ingresoPpd2, parcialidad: 2, saldoAnt: 660, pagado: 660, insoluto: 0 }],
  }),
  pagoExtranjero: pagoXml({
    uuid: U.pagoMultiple, emisor: RFC_EXPEDIENTE, receptor: RFC_TERCERO, monto: 1160, moneda: "USD", tipoCambio: 17.5,
    documentos: [{ uuid: U.extranjera, parcialidad: 1, saldoAnt: 1160, pagado: 1160, insoluto: 0, moneda: "USD" }],
  }),
  pagoHuerfano: pagoXml({
    uuid: U.pagoHuerfano, emisor: RFC_EXPEDIENTE, receptor: RFC_TERCERO, monto: 1160,
    documentos: [{ uuid: U.fantasma, parcialidad: 1, saldoAnt: 1160, pagado: 1160, insoluto: 0 }],
  }),
};

const CORTE_OK = { corte_at: "2026-08-05T12:00:00Z", direcciones: ["emitidos", "recibidos"] };

function corridaBase(overrides: { documentos?: DocumentoPeriodo[]; pagos?: DocumentoPagoPeriodo[]; decisiones?: any[]; corte?: any } = {}) {
  const documentos = overrides.documentos ?? [
    fila(XML.ingresoPue), fila(XML.gastoPue), fila(XML.ingresoPpd), fila(XML.ingresoPpd2),
    fila(XML.extranjera), fila(XML.notaCredito), fila(XML.nomina),
    fila(XML.pagoTotal), fila(XML.pagoParcial1), fila(XML.pagoParcial2), fila(XML.pagoExtranjero),
  ];
  const pagos = overrides.pagos ?? [
    ...pagoFila(XML.pagoTotal), ...pagoFila(XML.pagoParcial1), ...pagoFila(XML.pagoParcial2), ...pagoFila(XML.pagoExtranjero),
  ];
  return evaluarPeriodo({
    rfcExpediente: RFC_EXPEDIENTE,
    periodo: PERIODO,
    documentos,
    pagos,
    decisiones: overrides.decisiones ?? [],
    corte: overrides.corte ?? CORTE_OK,
  });
}

describe("periodo: cálculo de la fecha", () => {
  it("usa la hora del centro de México", () => {
    expect(periodoDeFecha("2026-08-01T05:26:04Z")).toBe("2026-07"); // 31/07 23:26 centro
    expect(periodoDeFecha(null)).toBeNull();
  });
});

describe("rango mensual en America/Mexico_City", () => {
  it("cuenta 28, 29, 30 y 31 días naturales", () => {
    expect(rangoMensual("2026-02").dias).toBe(28);
    expect(rangoMensual("2024-02").dias).toBe(29);
    expect(rangoMensual("2026-04").dias).toBe(30);
    expect(rangoMensual("2026-07").dias).toBe(31);
  });

  it("el fin es exclusivo y coincide con el inicio del mes siguiente", () => {
    expect(rangoMensual("2026-07").hastaExclusivo).toBe(rangoMensual("2026-08").desde);
  });

  it("cruza diciembre a enero sin perder el año", () => {
    const dic = rangoMensual("2025-12");
    expect(dic.desde).toBe("2025-12-01T06:00:00.000Z");
    expect(dic.hastaExclusivo).toBe(rangoMensual("2026-01").desde);
    expect(rangoMensual("2026-01").desde).toBe("2026-01-01T06:00:00.000Z");
  });

  it("incluye el último segundo del mes en hora local", () => {
    const jul = rangoMensual("2026-07");
    // 31/07/2026 23:59:59 hora del centro = 01/08/2026 05:59:59 UTC.
    expect(jul.ultimoInstante).toBe("2026-08-01T05:59:59.000Z");
    expect(periodoDeFecha(jul.ultimoInstante)).toBe("2026-07");
    expect(periodoDeFecha(jul.hastaExclusivo)).toBe("2026-08");
  });

  it("caso real: CFDI del 31 de julio entre 18:00 y 23:59 local pertenece a julio", () => {
    for (const hora of ["18:00:00", "20:30:00", "23:59:00", "23:59:59"]) {
      expect(periodoDeFecha(`2026-07-31T${hora}-06:00`)).toBe("2026-07");
    }
    // El mismo instante expresado en UTC ya cae en agosto del calendario UTC:
    // si el rango no fuera local, estos comprobantes se perderían.
    expect(new Date("2026-07-31T23:59:59-06:00").toISOString()).toBe("2026-08-01T05:59:59.000Z");
  });

  it("rechaza periodos mal formados", () => {
    expect(() => rangoMensual("2026-13")).toThrow();
    expect(() => rangoMensual("julio")).toThrow();
  });
});


describe("corrida sintética completa", () => {
  it("clasifica todo el periodo y no deja excepciones bloqueantes", () => {
    const r = corridaBase();
    expect(r.contadores.total).toBe(11);
    expect(r.contadores.emitidos).toBe(10);
    expect(r.contadores.recibidos).toBe(1);
    expect(r.contadores.ajenos).toBe(0);
    expect(r.contadores.porClase.ingreso).toBe(4);
    expect(r.contadores.porClase.gasto).toBe(1);
    expect(r.contadores.porClase.nota_credito_emitida).toBe(1);
    expect(r.contadores.porClase.nomina).toBe(1);
    expect(r.contadores.porClase.pago).toBe(4);
    expect(r.contadores.pue).toBe(3); // ingreso PUE, gasto PUE y la nota de crédito
    expect(r.contadores.ppd).toBe(3);
    expect(r.contadores.ppdSinComplemento).toBe(0);
    expect(r.puedeDeclararse).toBe(true);
  });

  it("varios pagos sobre una factura y un pago sobre varias facturas son consistentes", () => {
    const r = corridaBase();
    expect(r.excepciones.filter((e) => e.codigo === "PAGO_MONTO_INCONSISTENTE")).toHaveLength(0);
  });

  it("una factura PPD sin complemento se reporta como advertencia, no bloquea", () => {
    const sinPago = corridaBase({
      documentos: [fila(XML.ingresoPue), fila(XML.ingresoPpd)],
      pagos: [],
    });
    expect(sinPago.contadores.ppdSinComplemento).toBe(1);
    const exc = sinPago.excepciones.find((e) => e.codigo === "PPD_SIN_COMPLEMENTO")!;
    expect(exc.severidad).toBe("advertencia");
    // Advertencia: no es bloqueante, pero mientras siga PENDIENTE impide declarar.
    expect(sinPago.puedeDeclararse).toBe(false);
    const aceptado = corridaBase({
      documentos: [fila(XML.ingresoPpd)],
      pagos: [],
      decisiones: [{ codigo: "PPD_SIN_COMPLEMENTO", cfdi_id: exc.cfdi_id, estado: "aceptada" }],
    });
    expect(aceptado.puedeDeclararse).toBe(true);
  });
});

describe("excepciones bloqueantes", () => {
  it("pago huérfano bloquea hasta que se acepta con motivo", () => {
    const docs = [fila(XML.ingresoPue), fila(XML.pagoHuerfano)];
    const pagos = pagoFila(XML.pagoHuerfano);
    const bloqueado = corridaBase({ documentos: docs, pagos });
    expect(bloqueado.contadores.pagosHuerfanos).toBe(1);
    expect(bloqueado.puedeDeclararse).toBe(false);
    expect(bloqueado.criterios.find((c) => c.id === "relaciones")!.cumplido).toBe(false);

    const liberado = corridaBase({
      documentos: docs,
      pagos,
      decisiones: [{ codigo: "PAGO_HUERFANO", cfdi_id: `id-${U.pagoHuerfano}`, estado: "aceptada" }],
    });
    expect(liberado.puedeDeclararse).toBe(true);
  });

  it("CFDI ajeno al RFC bloquea", () => {
    const r = corridaBase({ documentos: [fila(XML.ingresoPue), fila(XML.ajeno)], pagos: [] });
    expect(r.contadores.ajenos).toBe(1);
    expect(r.contadores.rechazados).toBe(1);
    expect(r.criterios.find((c) => c.id === "rfc_ajeno")!.cumplido).toBe(false);
    expect(r.puedeDeclararse).toBe(false);
  });

  it("duplicados por UUID bloquean hasta decidir", () => {
    const a = fila(XML.ingresoPue);
    const b = { ...fila(XML.ingresoPue), id: "id-duplicado" };
    const r = corridaBase({ documentos: [a, b], pagos: [] });
    expect(r.contadores.duplicados).toBe(2);
    expect(r.criterios.find((c) => c.id === "duplicados")!.cumplido).toBe(false);
    const resuelto = corridaBase({
      documentos: [a, b],
      pagos: [],
      decisiones: [{ codigo: "DUPLICADO", cfdi_id: a.id, estado: "resuelta" }],
    });
    expect(resuelto.criterios.find((c) => c.id === "duplicados")!.cumplido).toBe(true);
  });

  it("importes de pago inconsistentes bloquean", () => {
    const pagos: DocumentoPagoPeriodo[] = [{
      cfdi_id: `id-${U.pagoTotal}`, numero_pago: 1, monto: 2000,
      documentos: [{ id_documento: U.ingresoPpd, num_parcialidad: 1, imp_saldo_ant: 1160, imp_pagado: 2000, imp_saldo_insoluto: 0 }],
    }];
    const r = corridaBase({ documentos: [fila(XML.ingresoPpd), fila(XML.pagoTotal)], pagos });
    expect(r.excepciones.some((e) => e.codigo === "PAGO_MONTO_INCONSISTENTE")).toBe(true);
    expect(r.puedeDeclararse).toBe(false);
  });

  it("sin corte documentado no puede declararse la etapa", () => {
    const r = corridaBase({ corte: { corte_at: null, direcciones: [] } });
    expect(r.criterios.find((c) => c.id === "corte")!.cumplido).toBe(false);
    expect(r.excepciones.some((e) => e.codigo === "CORTE_NO_DOCUMENTADO")).toBe(true);
    expect(r.puedeDeclararse).toBe(false);
  });

  it("un CFDI sin XML original es informativo pero debe decidirse", () => {
    const documentos = [fila(XML.ingresoPue, { detalle_reconstruible: false })];
    const r = corridaBase({ documentos, pagos: [] });
    const exc = r.excepciones.find((e) => e.codigo === "DETALLE_NO_RECONSTRUIBLE")!;
    expect(exc.severidad).toBe("informativa");
    expect(r.puedeDeclararse).toBe(false);
    const aceptado = corridaBase({
      documentos,
      pagos: [],
      decisiones: [{ codigo: "DETALLE_NO_RECONSTRUIBLE", cfdi_id: exc.cfdi_id, estado: "aceptada" }],
    });
    expect(aceptado.puedeDeclararse).toBe(true);
  });

  it("estado SAT desconocido se agrupa una sola vez y debe decidirse", () => {
    const documentos = [fila(XML.ingresoPue, { estatus_sat: "desconocido" }), fila(XML.gastoPue, { estatus_sat: "desconocido" })];
    const r = corridaBase({ documentos, pagos: [] });
    const exc = r.excepciones.filter((e) => e.codigo === "ESTATUS_SAT_DESCONOCIDO");
    expect(exc).toHaveLength(1);
    expect(exc[0]!.detalle).toMatchObject({ comprobantes: 2 });
    expect(r.contadores.estatusDesconocido).toBe(2);
    expect(r.puedeDeclararse).toBe(false);
    const aceptado = corridaBase({
      documentos,
      pagos: [],
      decisiones: [{ codigo: "ESTATUS_SAT_DESCONOCIDO", cfdi_id: exc[0]!.cfdi_id, estado: "aceptada" }],
    });
    expect(aceptado.puedeDeclararse).toBe(true);
  });
});

describe("aislamiento entre expedientes", () => {
  it("los mismos documentos evaluados con otro RFC quedan todos ajenos", () => {
    const documentos = [fila(XML.ingresoPue), fila(XML.gastoPue)];
    const propio = evaluarPeriodo({ rfcExpediente: RFC_EXPEDIENTE, periodo: PERIODO, documentos, pagos: [], corte: CORTE_OK });
    const otro = evaluarPeriodo({ rfcExpediente: RFC_OTRO, periodo: PERIODO, documentos, pagos: [], corte: CORTE_OK });
    expect(propio.contadores.ajenos).toBe(0);
    expect(otro.contadores.ajenos).toBe(2);
    expect(otro.puedeDeclararse).toBe(false);
  });

  it("un pago no se vincula con facturas que no están en el universo del expediente", () => {
    const r = evaluarPeriodo({
      rfcExpediente: RFC_EXPEDIENTE,
      periodo: PERIODO,
      documentos: [fila(XML.pagoTotal)],
      universoUuids: [],
      pagos: pagoFila(XML.pagoTotal),
      corte: CORTE_OK,
    });
    expect(r.contadores.pagosHuerfanos).toBe(1);
  });
});

describe("idempotencia de la evaluación", () => {
  it("evaluar dos veces produce el mismo resultado", () => {
    const a = corridaBase();
    const b = corridaBase();
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
