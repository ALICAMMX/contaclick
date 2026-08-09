import { describe, expect, it } from "vitest";
import { normalizarCfdi } from "@/lib/cfdi/normalizacion";
import { clasificarDocumento } from "@/lib/cfdi/clasificacion";
import { facturaXml, pagoXml, RFC_EXPEDIENTE, RFC_OTRO, RFC_TERCERO, U } from "./fixtures";

describe("normalización de impuestos", () => {
  it("conserva traslados y retenciones por concepto y a nivel comprobante", () => {
    const xml = facturaXml({
      uuid: U.ingresoPue,
      emisor: RFC_EXPEDIENTE,
      receptor: RFC_TERCERO,
      subtotal: 10000,
      impuestosConcepto: [
        { tipo: "Traslado", impuesto: "002", base: 10000, tasa: 0.16, importe: 1600 },
        { tipo: "Retencion", impuesto: "001", base: 10000, tasa: 0.1, importe: 1000 },
        { tipo: "Retencion", impuesto: "002", base: 10000, tasa: 0.106667, importe: 1066.67 },
      ],
    });
    const n = normalizarCfdi(xml);
    const concepto = n.impuestos.filter((i) => i.nivel === "concepto");
    const global = n.impuestos.filter((i) => i.nivel === "comprobante");
    expect(concepto).toHaveLength(3);
    expect(global).toHaveLength(3);
    expect(concepto.find((i) => i.tipo === "retencion" && i.impuesto === "001")).toMatchObject({
      impuesto_nombre: "ISR",
      base: 10000,
      tipo_factor: "Tasa",
      tasa_cuota: 0.1,
      importe: 1000,
    });
    expect(concepto.every((i) => i.concepto_numero === 1)).toBe(true);
  });

  it("no usa únicamente los totales globales", () => {
    const n = normalizarCfdi(facturaXml({ uuid: U.gastoPue, emisor: RFC_TERCERO, receptor: RFC_EXPEDIENTE }));
    expect(n.impuestos.some((i) => i.nivel === "concepto" && i.base === 1000)).toBe(true);
  });
});

describe("complemento de pagos 2.0", () => {
  it("extrae Pago, DoctoRelacionado e impuestos de ambos ámbitos", () => {
    const n = normalizarCfdi(
      pagoXml({
        uuid: U.pagoTotal,
        emisor: RFC_EXPEDIENTE,
        receptor: RFC_TERCERO,
        monto: 1160,
        documentos: [{ uuid: U.ingresoPpd, parcialidad: 1, saldoAnt: 1160, pagado: 1160, insoluto: 0 }],
      }),
    );
    expect(n.pagos).toHaveLength(1);
    const p = n.pagos[0]!;
    expect(p).toMatchObject({ forma_pago_p: "03", moneda_p: "MXN", tipo_cambio_p: 1, monto: 1160 });
    expect(p.num_operacion).toMatch(/^OP-/);
    expect(p.documentos[0]).toMatchObject({
      id_documento: U.ingresoPpd,
      num_parcialidad: 1,
      imp_saldo_ant: 1160,
      imp_pagado: 1160,
      imp_saldo_insoluto: 0,
      objeto_imp_dr: "02",
    });
    expect(p.impuestos.filter((i) => i.ambito === "DR")).toHaveLength(1);
    expect(p.impuestos.filter((i) => i.ambito === "P")).toHaveLength(1);
    expect(p.impuestos.find((i) => i.ambito === "P")).toMatchObject({ impuesto: "002", tipo_factor: "Tasa", tasa_cuota: 0.16 });
  });

  it("un pago aplicado a varias facturas conserva cada relación", () => {
    const n = normalizarCfdi(
      pagoXml({
        uuid: U.pagoMultiple,
        emisor: RFC_EXPEDIENTE,
        receptor: RFC_TERCERO,
        monto: 2320,
        documentos: [
          { uuid: U.ingresoPpd, parcialidad: 1, saldoAnt: 1160, pagado: 1160, insoluto: 0 },
          { uuid: U.ingresoPpd2, parcialidad: 1, saldoAnt: 1160, pagado: 1160, insoluto: 0 },
        ],
      }),
    );
    expect(n.pagos[0]!.documentos.map((d) => d.id_documento)).toEqual([U.ingresoPpd, U.ingresoPpd2]);
    expect(n.pagos[0]!.impuestos.filter((i) => i.ambito === "DR")).toHaveLength(2);
  });

  it("pago parcial en moneda extranjera preserva equivalencia y saldos", () => {
    const n = normalizarCfdi(
      pagoXml({
        uuid: U.pagoParcial1,
        emisor: RFC_EXPEDIENTE,
        receptor: RFC_TERCERO,
        monto: 500,
        moneda: "USD",
        tipoCambio: 17.5,
        documentos: [{ uuid: U.extranjera, parcialidad: 1, saldoAnt: 1000, pagado: 500, insoluto: 500, moneda: "USD", equivalencia: 1 }],
      }),
    );
    expect(n.pagos[0]).toMatchObject({ moneda_p: "USD", tipo_cambio_p: 17.5 });
    expect(n.pagos[0]!.documentos[0]).toMatchObject({ moneda_dr: "USD", equivalencia_dr: 1, imp_saldo_insoluto: 500 });
  });

  it("es determinista: normalizar dos veces produce lo mismo", () => {
    const xml = pagoXml({
      uuid: U.pagoTotal,
      emisor: RFC_EXPEDIENTE,
      receptor: RFC_TERCERO,
      monto: 1160,
      documentos: [{ uuid: U.ingresoPpd, parcialidad: 1, saldoAnt: 1160, pagado: 1160, insoluto: 0 }],
    });
    expect(JSON.stringify(normalizarCfdi(xml).pagos)).toBe(JSON.stringify(normalizarCfdi(xml).pagos));
  });
});

describe("clasificación documental", () => {
  const base = { estatus_sat: "vigente", detalle_reconstruible: true };
  const clasifica = (doc: any) => clasificarDocumento({ ...base, ...doc }, { rfcExpediente: RFC_EXPEDIENTE });

  it("distingue ingreso, gasto y notas de crédito por dirección", () => {
    expect(clasifica({ uuid: U.ingresoPue, tipo_cfdi: "I", rfc_emisor: RFC_EXPEDIENTE, rfc_receptor: RFC_TERCERO, metodo_pago: "PUE" }).clase).toBe("ingreso");
    expect(clasifica({ uuid: U.gastoPue, tipo_cfdi: "I", rfc_emisor: RFC_TERCERO, rfc_receptor: RFC_EXPEDIENTE, metodo_pago: "PUE" }).clase).toBe("gasto");
    expect(clasifica({ uuid: U.notaCredito, tipo_cfdi: "E", rfc_emisor: RFC_EXPEDIENTE, rfc_receptor: RFC_TERCERO, metodo_pago: "PUE" }).clase).toBe("nota_credito_emitida");
    expect(clasifica({ uuid: U.nomina, tipo_cfdi: "N", rfc_emisor: RFC_EXPEDIENTE, rfc_receptor: RFC_TERCERO, metodo_pago: null }).clase).toBe("nomina");
  });

  it("marca ajeno y lo rechaza", () => {
    const r = clasifica({ uuid: U.ajeno, tipo_cfdi: "I", rfc_emisor: RFC_TERCERO, rfc_receptor: RFC_OTRO, metodo_pago: "PUE" });
    expect(r.direccion).toBe("ajeno");
    expect(r.estado_procesamiento).toBe("rechazado");
    expect(r.motivos.map((m) => m.codigo)).toContain("RFC_AJENO");
  });

  it("sin evidencia de consulta al SAT no declara estado vigente", () => {
    const r = clasifica({ uuid: U.ingresoPue, tipo_cfdi: "I", rfc_emisor: RFC_EXPEDIENTE, rfc_receptor: RFC_TERCERO, metodo_pago: "PUE", estatus_sat: "desconocido" });
    expect(r.estatus_sat).toBe("desconocido");
    expect(r.fuente_estatus).toBe("sin_evidencia");
    expect(r.estado_procesamiento).toBe("requiere_revision");
  });
});
