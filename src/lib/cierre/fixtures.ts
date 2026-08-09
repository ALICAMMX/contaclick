// Fixtures SINTÉTICOS de CFDI 4.0 para pruebas del cierre mensual.
// No contienen datos fiscales reales, no se timbran y sus sellos son ficticios.

export const RFC_EXPEDIENTE = "AAA010101AAA";
export const RFC_TERCERO = "BBB020202BB2";
export const RFC_OTRO = "CCC030303CC3";

type Imp = { tipo: "Traslado" | "Retencion"; impuesto: string; base: number; tasa: number; importe: number };

export function facturaXml(o: {
  uuid: string;
  emisor: string;
  receptor: string;
  fecha?: string;
  tipo?: "I" | "E" | "N" | "T";
  metodoPago?: "PUE" | "PPD";
  subtotal?: number;
  total?: number;
  moneda?: string;
  tipoCambio?: number;
  impuestosConcepto?: Imp[];
}): string {
  const sub = o.subtotal ?? 1000;
  const imps = o.impuestosConcepto ?? [
    { tipo: "Traslado" as const, impuesto: "002", base: sub, tasa: 0.16, importe: +(sub * 0.16).toFixed(2) },
  ];
  const traslados = imps.filter((i) => i.tipo === "Traslado");
  const retenciones = imps.filter((i) => i.tipo === "Retencion");
  const bloque = (arr: Imp[], etiqueta: "Traslados" | "Retenciones") =>
    arr.length
      ? `<cfdi:${etiqueta}>${arr
          .map((i) =>
            i.tipo === "Traslado"
              ? `<cfdi:Traslado Base="${i.base}" Impuesto="${i.impuesto}" TipoFactor="Tasa" TasaOCuota="${i.tasa.toFixed(6)}" Importe="${i.importe}"/>`
              : `<cfdi:Retencion Base="${i.base}" Impuesto="${i.impuesto}" TipoFactor="Tasa" TasaOCuota="${i.tasa.toFixed(6)}" Importe="${i.importe}"/>`,
          )
          .join("")}</cfdi:${etiqueta}>`
      : "";
  const total =
    o.total ?? +(sub + traslados.reduce((a, b) => a + b.importe, 0) - retenciones.reduce((a, b) => a + b.importe, 0)).toFixed(2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="A" Folio="1" Fecha="${o.fecha ?? "2026-07-15T10:00:00"}" Sello="SELLO_SINTETICO" FormaPago="03" NoCertificado="00000000000000000000" Certificado="CERT" SubTotal="${sub.toFixed(2)}" Moneda="${o.moneda ?? "MXN"}"${o.tipoCambio ? ` TipoCambio="${o.tipoCambio}"` : ""} Total="${total.toFixed(2)}" TipoDeComprobante="${o.tipo ?? "I"}"${o.tipo === "N" || o.tipo === "T" ? "" : ` MetodoPago="${o.metodoPago ?? "PUE"}"`} LugarExpedicion="64000" Exportacion="01">
  <cfdi:Emisor Rfc="${o.emisor}" Nombre="EMISOR SINTETICO" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${o.receptor}" Nombre="RECEPTOR SINTETICO" DomicilioFiscalReceptor="64000" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="E48" Descripcion="Servicio sintético" ValorUnitario="${sub.toFixed(2)}" Importe="${sub.toFixed(2)}" ObjetoImp="02">
      <cfdi:Impuestos>${bloque(traslados, "Traslados")}${bloque(retenciones, "Retenciones")}</cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${traslados.reduce((a, b) => a + b.importe, 0).toFixed(2)}" TotalImpuestosRetenidos="${retenciones.reduce((a, b) => a + b.importe, 0).toFixed(2)}">
    ${bloque(traslados, "Traslados")}${bloque(retenciones, "Retenciones")}
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${o.uuid}" FechaTimbrado="${o.fecha ?? "2026-07-15T10:05:00"}" RfcProvCertif="DEMO000101000" SelloCFD="X" NoCertificadoSAT="00000000000000000000" SelloSAT="X"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

export type DoctoFixture = {
  uuid: string;
  parcialidad: number;
  saldoAnt: number;
  pagado: number;
  insoluto: number;
  moneda?: string;
  equivalencia?: number;
};

export function pagoXml(o: {
  uuid: string;
  emisor: string;
  receptor: string;
  fecha?: string;
  fechaPago?: string;
  monto: number;
  moneda?: string;
  tipoCambio?: number;
  documentos: DoctoFixture[];
}): string {
  const docs = o.documentos
    .map(
      (d) => `<pago20:DoctoRelacionado IdDocumento="${d.uuid}" Serie="A" Folio="1" MonedaDR="${d.moneda ?? "MXN"}"${d.equivalencia ? ` EquivalenciaDR="${d.equivalencia}"` : ' EquivalenciaDR="1"'} NumParcialidad="${d.parcialidad}" ImpSaldoAnt="${d.saldoAnt.toFixed(2)}" ImpPagado="${d.pagado.toFixed(2)}" ImpSaldoInsoluto="${d.insoluto.toFixed(2)}" ObjetoImpDR="02">
          <pago20:ImpuestosDR>
            <pago20:TrasladosDR>
              <pago20:TrasladoDR BaseDR="${(d.pagado / 1.16).toFixed(2)}" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000" ImporteDR="${(d.pagado - d.pagado / 1.16).toFixed(2)}"/>
            </pago20:TrasladosDR>
          </pago20:ImpuestosDR>
        </pago20:DoctoRelacionado>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="P" Folio="1" Fecha="${o.fecha ?? "2026-07-20T12:00:00"}" Sello="SELLO_SINTETICO" NoCertificado="00000000000000000000" Certificado="CERT" SubTotal="0" Moneda="XXX" Total="0" TipoDeComprobante="P" LugarExpedicion="64000" Exportacion="01">
  <cfdi:Emisor Rfc="${o.emisor}" Nombre="EMISOR SINTETICO" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${o.receptor}" Nombre="RECEPTOR SINTETICO" DomicilioFiscalReceptor="64000" RegimenFiscalReceptor="601" UsoCFDI="CP01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales MontoTotalPagos="${o.monto.toFixed(2)}"/>
      <pago20:Pago FechaPago="${o.fechaPago ?? "2026-07-20T12:00:00"}" FormaDePagoP="03" MonedaP="${o.moneda ?? "MXN"}"${o.tipoCambio ? ` TipoCambioP="${o.tipoCambio}"` : ' TipoCambioP="1"'} Monto="${o.monto.toFixed(2)}" NumOperacion="OP-${o.uuid.slice(0, 6)}">
        ${docs}
        <pago20:ImpuestosP>
          <pago20:TrasladosP>
            <pago20:TrasladoP BaseP="${(o.monto / 1.16).toFixed(2)}" ImpuestoP="002" TipoFactorP="Tasa" TasaOCuotaP="0.160000" ImporteP="${(o.monto - o.monto / 1.16).toFixed(2)}"/>
          </pago20:TrasladosP>
        </pago20:ImpuestosP>
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${o.uuid}" FechaTimbrado="${o.fecha ?? "2026-07-20T12:05:00"}" RfcProvCertif="DEMO000101000" SelloCFD="X" NoCertificadoSAT="00000000000000000000" SelloSAT="X"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

export const U = {
  ingresoPue: "11111111-1111-4111-8111-111111111111",
  gastoPue: "22222222-2222-4222-8222-222222222222",
  ingresoPpd: "33333333-3333-4333-8333-333333333333",
  ingresoPpd2: "44444444-4444-4444-8444-444444444444",
  pagoTotal: "55555555-5555-4555-8555-555555555555",
  pagoParcial1: "66666666-6666-4666-8666-666666666666",
  pagoParcial2: "77777777-7777-4777-8777-777777777777",
  pagoMultiple: "88888888-8888-4888-8888-888888888888",
  pagoHuerfano: "99999999-9999-4999-8999-999999999999",
  notaCredito: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
  nomina: "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB",
  extranjera: "CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC",
  ajeno: "DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD",
  fantasma: "EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE",
} as const;
