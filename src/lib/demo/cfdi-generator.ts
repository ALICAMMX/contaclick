// Generador de CFDI 4.0 ficticios para demo. NO oficiales, sello dummy.
// Usar exclusivamente para sembrar datos de muestra.

export type CfdiInput = {
  serie: string;
  folio: number;
  fecha: Date;
  tipoComprobante: "I" | "E" | "P" | "N"; // I=Ingreso, E=Egreso, P=Pago, N=Nómina
  rfcEmisor: string;
  nombreEmisor: string;
  regimenEmisor: string;
  rfcReceptor: string;
  nombreReceptor: string;
  regimenReceptor: string;
  usoCFDI: string;
  metodoPago: "PUE" | "PPD";
  formaPago: string;
  subtotal: number;
  conceptos: Array<{
    claveProdServ: string;
    descripcion: string;
    cantidad: number;
    valorUnitario: number;
  }>;
};

export type GeneratedCfdi = {
  xml: string;
  uuid: string;
  hash: string;
  total: number;
  subtotal: number;
  iva: number;
};

function toIsoLocal(d: Date): string {
  // CFDI requires local time without TZ
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function generateDemoCfdi(input: CfdiInput): Promise<GeneratedCfdi> {
  const subtotal = +input.subtotal.toFixed(2);
  const iva = +(subtotal * 0.16).toFixed(2);
  const total = +(subtotal + iva).toFixed(2);
  const uuid = crypto.randomUUID().toUpperCase();
  const fechaIso = toIsoLocal(input.fecha);

  const conceptosXml = input.conceptos.map((c) => {
    const importe = +(c.cantidad * c.valorUnitario).toFixed(2);
    const cIva = +(importe * 0.16).toFixed(2);
    return `<cfdi:Concepto ClaveProdServ="${c.claveProdServ}" Cantidad="${c.cantidad}" ClaveUnidad="E48" Descripcion="${esc(c.descripcion)}" ValorUnitario="${c.valorUnitario.toFixed(2)}" Importe="${importe.toFixed(2)}" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${importe.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${cIva.toFixed(2)}"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="${input.serie}" Folio="${input.folio}" Fecha="${fechaIso}" Sello="SELLO_DEMO_NO_VALIDO_NO_OFICIAL" FormaPago="${input.formaPago}" NoCertificado="00000000000000000000" Certificado="CERT_DEMO" SubTotal="${subtotal.toFixed(2)}" Moneda="MXN" Total="${total.toFixed(2)}" TipoDeComprobante="${input.tipoComprobante}" MetodoPago="${input.metodoPago}" LugarExpedicion="64000" Exportacion="01">
  <cfdi:Emisor Rfc="${input.rfcEmisor}" Nombre="${esc(input.nombreEmisor)}" RegimenFiscal="${input.regimenEmisor}"/>
  <cfdi:Receptor Rfc="${input.rfcReceptor}" Nombre="${esc(input.nombreReceptor)}" DomicilioFiscalReceptor="64000" RegimenFiscalReceptor="${input.regimenReceptor}" UsoCFDI="${input.usoCFDI}"/>
  <cfdi:Conceptos>${conceptosXml}</cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva.toFixed(2)}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="${subtotal.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva.toFixed(2)}"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${uuid}" FechaTimbrado="${fechaIso}" RfcProvCertif="DEMO000101000" SelloCFD="SELLO_DEMO_NO_VALIDO" NoCertificadoSAT="00000000000000000000" SelloSAT="SELLO_SAT_DEMO_NO_VALIDO"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

  const hash = await sha256Hex(xml);
  return { xml, uuid, hash, total, subtotal, iva };
}
