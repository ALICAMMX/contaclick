import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseCfdi } from "@/lib/tools/cfdi-parser";
import {
  calcularImpuestos,
  calcularTotales,
  clasificarDireccion,
  construirFila,
  determinarEstado,
  ESTADO_NO_VERIFICADO,
  procesarZipSeguro,
  validarLimitesZip,
  validarTamanoZip,
  ZIP_MAX_ENTRIES,
  ZIP_MAX_FILE_SIZE_BYTES,
  ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES,
  XML_MAX_FILE_SIZE_BYTES,
} from "./lectura-masiva";

const RFC_ACTIVO = "EKU9003173C9";
const RFC_OTRO = "XAXX010101000";

function cfdi(opts: {
  tipo: string;
  emisor: string;
  receptor: string;
  uuid?: string | null;
  total?: string;
  traslados?: string;
  retenciones?: string;
  conceptoTraslados?: string;
}): string {
  const {
    tipo,
    emisor,
    receptor,
    uuid = "AAAAAAAA-BBBB-CCCC-DDDD-000000000001",
    total = "1160.00",
    traslados = `<cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/>`,
    retenciones = "",
    conceptoTraslados = "",
  } = opts;
  const timbre = uuid
    ? `<cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${uuid}" FechaTimbrado="2024-01-01T10:00:00"/></cfdi:Complemento>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2024-01-01T10:00:00" TipoDeComprobante="${tipo}" SubTotal="1000.00" Total="${total}" Moneda="MXN">
  <cfdi:Emisor Rfc="${emisor}" Nombre="Emisor SA" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${receptor}" Nombre="Receptor SA" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" Descripcion="Servicio" ValorUnitario="1000.00" Importe="1000.00">
      ${conceptoTraslados ? `<cfdi:Impuestos><cfdi:Traslados>${conceptoTraslados}</cfdi:Traslados></cfdi:Impuestos>` : ""}
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="160.00">
    ${retenciones ? `<cfdi:Retenciones>${retenciones}</cfdi:Retenciones>` : ""}
    <cfdi:Traslados>${traslados}</cfdi:Traslados>
  </cfdi:Impuestos>
  ${timbre}
</cfdi:Comprobante>`;
}

describe("estatus ante el SAT", () => {
  it("un CFDI con UUID nunca se marca 'Vigente' automáticamente: queda 'No verificado ante SAT'", () => {
    const xml = cfdi({ tipo: "I", emisor: RFC_ACTIVO, receptor: RFC_OTRO });
    const parsed = parseCfdi(xml);
    expect(parsed.uuid).toBeTruthy();
    const fila = construirFila({ filename: "a.xml", xml, parsed, rfcActivo: RFC_ACTIVO });
    expect(fila.estado).toBe(ESTADO_NO_VERIFICADO);
  });

  it("sólo cambia el estatus si hay evidencia oficial explícita", () => {
    expect(determinarEstado(undefined)).toBe("No verificado ante SAT");
    expect(determinarEstado("vigente")).toBe("Vigente");
    expect(determinarEstado("cancelado")).toBe("Cancelado");
  });
});

describe("desglose de impuestos", () => {
  it("separa IVA (002) de IEPS (003) y no usa totalTrasladados como sinónimo de IVA", () => {
    const traslados = `<cfdi:Traslado Impuesto="002" Importe="160.00"/><cfdi:Traslado Impuesto="003" Importe="80.00"/>`;
    const xml = cfdi({ tipo: "I", emisor: RFC_ACTIVO, receptor: RFC_OTRO, traslados });
    const imp = calcularImpuestos(xml);
    expect(imp.comprobante.iva).toBe(160);
    expect(imp.comprobante.ieps).toBe(80);
    expect(imp.comprobante.iva).not.toBe(imp.comprobante.iva + imp.comprobante.ieps);
  });

  it("separa las retenciones (ISR 001 / IVA 002) de los trasladados", () => {
    const retenciones = `<cfdi:Retencion Impuesto="001" Importe="100.00"/><cfdi:Retencion Impuesto="002" Importe="106.67"/>`;
    const xml = cfdi({ tipo: "I", emisor: RFC_ACTIVO, receptor: RFC_OTRO, retenciones });
    const imp = calcularImpuestos(xml);
    expect(imp.comprobante.isrRetenido).toBe(100);
    expect(imp.comprobante.ivaRetenido).toBe(106.67);
    expect(imp.comprobante.iva).toBe(160);
  });

  it("extrae impuestos también a nivel concepto por separado del nivel comprobante", () => {
    const conceptoTraslados = `<cfdi:Traslado Impuesto="002" Importe="160.00"/>`;
    const xml = cfdi({ tipo: "I", emisor: RFC_ACTIVO, receptor: RFC_OTRO, conceptoTraslados });
    const imp = calcularImpuestos(xml);
    expect(imp.conceptos.iva).toBe(160);
    expect(imp.comprobante.iva).toBe(160); // el resumen a nivel comprobante también trae su Traslado
  });
});

describe("perspectiva del RFC activo", () => {
  it("tipo I emitido por el RFC activo es ingreso", () => {
    expect(clasificarDireccion({ tipo: "I", rfcEmisor: RFC_ACTIVO, rfcReceptor: RFC_OTRO, rfcActivo: RFC_ACTIVO })).toBe("ingreso");
  });

  it("tipo I recibido por el RFC activo es gasto/compra", () => {
    expect(clasificarDireccion({ tipo: "I", rfcEmisor: RFC_OTRO, rfcReceptor: RFC_ACTIVO, rfcActivo: RFC_ACTIVO })).toBe("gasto");
  });

  it("tipo E (egreso) se relaciona con su dirección y no se suma como ingreso/gasto ordinario", () => {
    const emitida = clasificarDireccion({ tipo: "E", rfcEmisor: RFC_ACTIVO, rfcReceptor: RFC_OTRO, rfcActivo: RFC_ACTIVO });
    const recibida = clasificarDireccion({ tipo: "E", rfcEmisor: RFC_OTRO, rfcReceptor: RFC_ACTIVO, rfcActivo: RFC_ACTIVO });
    expect(emitida).toBe("nota_credito_ingreso");
    expect(recibida).toBe("nota_credito_gasto");

    const xml = cfdi({ tipo: "E", emisor: RFC_ACTIVO, receptor: RFC_OTRO, total: "200.00" });
    const parsed = parseCfdi(xml);
    const fila = construirFila({ filename: "nc.xml", xml, parsed, rfcActivo: RFC_ACTIVO });
    const totales = calcularTotales([fila]);
    expect(totales.ingresos).toBe(0);
    expect(totales.gastos).toBe(0);
    expect(totales.notasCreditoIngreso).toBe(200);
  });

  it("nómina y pago no se suman como ingreso ni gasto ordinario", () => {
    const xmlNomina = cfdi({ tipo: "N", emisor: RFC_ACTIVO, receptor: RFC_OTRO, total: "5000.00" });
    const xmlPago = cfdi({ tipo: "P", emisor: RFC_OTRO, receptor: RFC_ACTIVO, total: "0.00" });
    const filaNomina = construirFila({ filename: "n.xml", xml: xmlNomina, parsed: parseCfdi(xmlNomina), rfcActivo: RFC_ACTIVO });
    const filaPago = construirFila({ filename: "p.xml", xml: xmlPago, parsed: parseCfdi(xmlPago), rfcActivo: RFC_ACTIVO });
    expect(filaNomina.direccion).toBe("nomina");
    expect(filaPago.direccion).toBe("pago");
    const totales = calcularTotales([filaNomina, filaPago]);
    expect(totales.ingresos).toBe(0);
    expect(totales.gastos).toBe(0);
    expect(totales.nominaTotal).toBe(5000);
    expect(totales.pagosTotal).toBe(0);
  });

  it("un CFDI de RFC ajeno (ni emisor ni receptor es el activo) no cuenta como ingreso ni gasto", () => {
    const xml = cfdi({ tipo: "I", emisor: RFC_OTRO, receptor: "AAA010101AAA" });
    const fila = construirFila({ filename: "ajeno.xml", xml, parsed: parseCfdi(xml), rfcActivo: RFC_ACTIVO });
    expect(fila.direccion).toBe("otro");
  });
});

describe("límites de seguridad al leer ZIP", () => {
  it("rechaza un ZIP que excede el tamaño máximo permitido", () => {
    const error = validarTamanoZip(ZIP_MAX_FILE_SIZE_BYTES + 1);
    expect(error).toMatch(/máximo permitido/);
  });

  it("rechaza un ZIP con más entradas que el máximo permitido", () => {
    const entries = Array.from({ length: ZIP_MAX_ENTRIES + 1 }, (_, i) => ({
      name: `f${i}.xml`,
      dir: false,
      compressedSize: 10,
      uncompressedSize: 10,
    }));
    const res = validarLimitesZip(entries);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/archivos/);
  });

  it("rechaza cuando el total descomprimido supera el límite global", () => {
    const entries = [
      { name: "a.xml", dir: false, compressedSize: 1000, uncompressedSize: ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES + 1 },
    ];
    const res = validarLimitesZip(entries);
    expect(res.ok).toBe(false);
  });

  it("ignora (con motivo) un XML individual que excede su tamaño máximo", () => {
    const entries = [{ name: "grande.xml", dir: false, compressedSize: 1000, uncompressedSize: XML_MAX_FILE_SIZE_BYTES + 1 }];
    const res = validarLimitesZip(entries);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.entradasValidas).toHaveLength(0);
      expect(res.ignorados[0].motivo).toMatch(/tamaño máximo/);
    }
  });

  it("ignora (con motivo) una entrada con ratio de compresión sospechoso de 'ZIP bomb'", () => {
    const entries = [{ name: "bomba.xml", dir: false, compressedSize: 100, uncompressedSize: 100 * 201 }];
    const res = validarLimitesZip(entries);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.entradasValidas).toHaveLength(0);
      expect(res.ignorados[0].motivo).toMatch(/ZIP bomb/);
    }
  });

  it("reporta archivos que no son XML como ignorados", () => {
    const entries = [{ name: "leeme.txt", dir: false, compressedSize: 10, uncompressedSize: 10 }];
    const res = validarLimitesZip(entries);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ignorados[0].motivo).toMatch(/No es un archivo XML/);
  });

  it("procesarZipSeguro rechaza un ZIP corrupto con mensaje entendible", async () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x50, 0x4b, 0x99, 0x99]);
    const file = { size: bytes.length, arrayBuffer: async () => bytes.buffer };
    const res = await procesarZipSeguro(file);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/dañado|no es un ZIP válido/);
  });

  it("procesarZipSeguro detecta un ZIP bomb real (alta compresión) y lo ignora", async () => {
    const zip = new JSZip();
    // Contenido muy repetitivo: comprime a un ratio alto y disparará la protección.
    const payload = "A".repeat(6_000_000);
    zip.file("bomba.xml", payload, { compression: "DEFLATE", compressionOptions: { level: 9 } });
    const buf = await zip.generateAsync({ type: "uint8array" });
    const file = { size: buf.length, arrayBuffer: async () => buf.buffer };
    const res = await procesarZipSeguro(file);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.archivos).toHaveLength(0);
      expect(res.ignorados.some((i) => /ZIP bomb/.test(i.motivo))).toBe(true);
    }
  });

  it("procesarZipSeguro acepta XMLs válidos dentro de un ZIP normal", async () => {
    const zip = new JSZip();
    const xml = cfdi({ tipo: "I", emisor: RFC_ACTIVO, receptor: RFC_OTRO });
    zip.file("comprobante.xml", xml);
    zip.file("leeme.txt", "hola");
    const buf = await zip.generateAsync({ type: "uint8array" });
    const file = { size: buf.length, arrayBuffer: async () => buf.buffer };
    const res = await procesarZipSeguro(file);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.archivos).toHaveLength(1);
      expect(res.archivos[0].name).toBe("comprobante.xml");
      const texto = await res.archivos[0].getText();
      expect(texto).toContain("cfdi:Comprobante");
      expect(res.ignorados.some((i) => i.archivo === "leeme.txt")).toBe(true);
    }
  });
});

describe("XML inválido", () => {
  it("un XML que no es CFDI produce warnings pero no revienta el parseo", () => {
    const parsed = parseCfdi("<not-a-cfdi/>");
    expect(parsed.warnings.length).toBeGreaterThan(0);
    const fila = construirFila({ filename: "malo.xml", xml: "<not-a-cfdi/>", parsed, rfcActivo: RFC_ACTIVO });
    expect(fila.estado).toBe(ESTADO_NO_VERIFICADO);
    expect(fila.direccion).toBe("otro");
  });
});
