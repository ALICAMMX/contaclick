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
  exportacion?: string;
  /** Sello digital del emisor (cadena base64). Vacío = comprobante no sellado. */
  sello?: string;
  noCertificado?: string;
  certificado?: string;
  subTotal?: number;
  total?: number;
  descuento?: number;
  emisor: { rfc?: string; nombre?: string; regimenFiscal?: string };
  receptor: { rfc?: string; nombre?: string; usoCFDI?: string; regimenFiscalReceptor?: string; domicilioFiscalReceptor?: string };
  uuid?: string;
  fechaTimbrado?: string;
  /** Datos del timbre (sólo presentes si el CFDI está timbrado). */
  selloSAT?: string;
  noCertificadoSAT?: string;
  conceptos: Array<{ descripcion?: string; cantidad?: number; valorUnitario?: number; importe?: number; claveProdServ?: string; objetoImp?: string }>;
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

function extractRelacionados(xml: string): Array<{ uuid: string; tipo: "pago" | "relacion"; tipoRelacion?: string }> {
  const out: Array<{ uuid: string; tipo: "pago" | "relacion"; tipoRelacion?: string }> = [];
  // Pago 2.0: <pago20:DoctoRelacionado IdDocumento="UUID" .../>
  for (const tag of findAllOpenTags(xml, "DoctoRelacionado")) {
    const id = attr(tag, "IdDocumento");
    if (id) out.push({ uuid: id.toLowerCase(), tipo: "pago" });
  }
  // CfdiRelacionados (egresos, sustituciones, etc.)
  const rels = findOpenTag(xml, "CfdiRelacionados");
  const tipoRel = attr(rels, "TipoRelacion");
  for (const tag of findAllOpenTags(xml, "CfdiRelacionado")) {
    const id = attr(tag, "UUID");
    if (id) out.push({ uuid: id.toLowerCase(), tipo: "relacion", tipoRelacion: tipoRel });
  }
  return out;
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
    objetoImp: attr(t, "ObjetoImp"),
  }));

  // Puede haber varios <Impuestos>: uno por Concepto y el resumen a nivel Comprobante.
  // Elegimos el que trae los totales (TotalImpuestosTrasladados/Retenidos).
  const impuestosTags = findAllOpenTags(xml, "Impuestos");
  const impuestosTag =
    impuestosTags.find((t) => /TotalImpuestos(Trasladados|Retenidos)=/.test(t)) ??
    impuestosTags[impuestosTags.length - 1];

  const result: CfdiParsed = {
    version: attr(comprobante, "Version"),
    serie: attr(comprobante, "Serie"),
    folio: attr(comprobante, "Folio"),
    fecha: attr(comprobante, "Fecha"),
    formaPago: attr(comprobante, "FormaPago"),
    metodoPago: attr(comprobante, "MetodoPago"),
    moneda: attr(comprobante, "Moneda"),
    tipoComprobante: attr(comprobante, "TipoDeComprobante"),
    exportacion: attr(comprobante, "Exportacion"),
    sello: attr(comprobante, "Sello"),
    noCertificado: attr(comprobante, "NoCertificado"),
    certificado: attr(comprobante, "Certificado"),
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
    selloSAT: attr(tfd, "SelloSAT"),
    noCertificadoSAT: attr(tfd, "NoCertificadoSAT"),
    conceptos,
    impuestos: {
      totalTrasladados: num(attr(impuestosTag, "TotalImpuestosTrasladados")),
      totalRetenidos: num(attr(impuestosTag, "TotalImpuestosRetenidos")),
    },
    relacionados: extractRelacionados(xml),
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
