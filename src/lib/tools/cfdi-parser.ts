// Minimal CFDI 4.0 XML parser. Pure JS, no dependencies, Worker-safe.
// Extracts the most relevant fields. Tolerant to namespaces (cfdi:, tfd:).

export type CfdiParsed = {
  version?: string;
  serie?: string;
  folio?: string;
  fecha?: string;
  formaPago?: string;
  metodoPago?: string;
  moneda?: string;
  tipoComprobante?: string;
  subTotal?: number;
  total?: number;
  descuento?: number;
  emisor: { rfc?: string; nombre?: string; regimenFiscal?: string };
  receptor: { rfc?: string; nombre?: string; usoCFDI?: string; regimenFiscalReceptor?: string; domicilioFiscalReceptor?: string };
  uuid?: string;
  fechaTimbrado?: string;
  conceptos: Array<{ descripcion?: string; cantidad?: number; valorUnitario?: number; importe?: number; claveProdServ?: string }>;
  impuestos: { totalTrasladados?: number; totalRetenidos?: number };
  /** UUIDs relacionados: DoctoRelacionado (Pago 2.0) o CfdiRelacionados. */
  relacionados: Array<{ uuid: string; tipo: "pago" | "relacion"; tipoRelacion?: string }>;
  warnings: string[];
};


function attr(tag: string | undefined, name: string): string | undefined {
  if (!tag) return undefined;
  const re = new RegExp(`\\s${name}="([^"]*)"`);
  const m = tag.match(re);
  return m?.[1];
}

function num(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function findOpenTag(xml: string, localName: string): string | undefined {
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${localName}\\b[^>]*>`);
  return xml.match(re)?.[0];
}

function findAllOpenTags(xml: string, localName: string): string[] {
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${localName}\\b[^>]*\\/?>`, "g");
  return xml.match(re) ?? [];
}

export function parseCfdi(xml: string): CfdiParsed {
  const warnings: string[] = [];
  if (!/Comprobante\b/.test(xml)) warnings.push("No se detectó la etiqueta cfdi:Comprobante.");

  const comprobante = findOpenTag(xml, "Comprobante");
  const emisor = findOpenTag(xml, "Emisor");
  const receptor = findOpenTag(xml, "Receptor");
  const tfd = findOpenTag(xml, "TimbreFiscalDigital");

  const conceptos = findAllOpenTags(xml, "Concepto").map((t) => ({
    descripcion: attr(t, "Descripcion"),
    cantidad: num(attr(t, "Cantidad")),
    valorUnitario: num(attr(t, "ValorUnitario")),
    importe: num(attr(t, "Importe")),
    claveProdServ: attr(t, "ClaveProdServ"),
  }));

  const impuestosTag = findOpenTag(xml, "Impuestos");

  const result: CfdiParsed = {
    version: attr(comprobante, "Version"),
    serie: attr(comprobante, "Serie"),
    folio: attr(comprobante, "Folio"),
    fecha: attr(comprobante, "Fecha"),
    formaPago: attr(comprobante, "FormaPago"),
    metodoPago: attr(comprobante, "MetodoPago"),
    moneda: attr(comprobante, "Moneda"),
    tipoComprobante: attr(comprobante, "TipoDeComprobante"),
    subTotal: num(attr(comprobante, "SubTotal")),
    total: num(attr(comprobante, "Total")),
    descuento: num(attr(comprobante, "Descuento")),
    emisor: {
      rfc: attr(emisor, "Rfc"),
      nombre: attr(emisor, "Nombre"),
      regimenFiscal: attr(emisor, "RegimenFiscal"),
    },
    receptor: {
      rfc: attr(receptor, "Rfc"),
      nombre: attr(receptor, "Nombre"),
      usoCFDI: attr(receptor, "UsoCFDI"),
      regimenFiscalReceptor: attr(receptor, "RegimenFiscalReceptor"),
      domicilioFiscalReceptor: attr(receptor, "DomicilioFiscalReceptor"),
    },
    uuid: attr(tfd, "UUID"),
    fechaTimbrado: attr(tfd, "FechaTimbrado"),
    conceptos,
    impuestos: {
      totalTrasladados: num(attr(impuestosTag, "TotalImpuestosTrasladados")),
      totalRetenidos: num(attr(impuestosTag, "TotalImpuestosRetenidos")),
    },
    warnings,
  };

  if (result.version && result.version !== "4.0") {
    warnings.push(`Versión CFDI ${result.version}. La normativa actual es 4.0.`);
  }
  if (!result.uuid) warnings.push("No se encontró UUID (TimbreFiscalDigital). El comprobante podría no estar timbrado.");
  if (!result.emisor.rfc) warnings.push("Falta RFC del emisor.");
  if (!result.receptor.rfc) warnings.push("Falta RFC del receptor.");
  return result;
}
