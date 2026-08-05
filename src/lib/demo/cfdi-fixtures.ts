// ─────────────────────────────────────────────────────────────────────────────
// Fixtures CFDI 4.0 SINTÉTICOS para los ejemplos educativos.
//
// No son comprobantes reales ni están timbrados ante el SAT: los sellos,
// certificados y UUID son valores de laboratorio con la ESTRUCTURA correcta,
// para que el validador pueda ejercitar todas sus reglas.
//
// "CFDI íntegro" debe pasar TODAS las validaciones estructurales:
//   Version 4.0 · Sello · NoCertificado · Certificado · Exportacion ·
//   Emisor/Receptor completos (RegimenFiscalReceptor, DomicilioFiscalReceptor,
//   UsoCFDI) · Conceptos con ObjetoImp e impuestos por concepto ·
//   nodo Impuestos con totales · TimbreFiscalDigital con UUID y sellos.
//
// Aritmética: SubTotal − Descuento + Trasladados − Retenidos = Total
//   10,000.00 − 0 + 1,600.00 − 0 = 11,600.00 ✔
// ─────────────────────────────────────────────────────────────────────────────

import { EFOS_DEMO_RFCS } from "./perfiles";

const SELLO_DEMO =
  "kQe1mVnBv0mLPh2vGm7xO0PZ9r3nD1t7Yy5wA0cJqL8sF4hV6bN2mR9tX1zQ7dK3pW5eT8uY0iO2aS4dF6gH8jK0lZ2xC4vB6nM8qW0eR2tY4uI6oP8aS0dF2gH4jK6lZ8xC0vB2nM4qW6eR8tY0uI2oP4aS6dF8gH0jK2lZ4xC6vB8nM0qW2eR4tY6uI8oP0aS2dF4gH6jK8lZ0xC2vB4nM6qW8eR0tY2uI4oP6aS8dF0gH2jK4l==";
const CERT_DEMO =
  "MIIFxTCCA62gAwIBAgIUMDAwMDEwMDAwMDA1MDAwMDAwMDEwDQYJKoZIhvcNAQELBQAwggGyMTgwNgYDVQQDDC9BLkMuIGRlbCBTZXJ2aWNpbyBkZSBBZG1pbmlzdHJhY2nDs24gVHJpYnV0YXJpYQ==";
const SELLO_SAT_DEMO =
  "Xy7pQ2mB4nV6cZ8kJ0hG2fD4sA6qW8eR0tY2uI4oP6aS8dF0gH2jK4lZ6xC8vB0nM2qW4eR6tY8uI0oP2aS4dF6gH8jK0lZ2xC4vB6nM8qW0eR2tY4uI6oP8aS0dF2gH4jK6lZ8xC0vB2nM4qW6eR8tY0uI2oP4aS6dF8gH0jK2lZ4xC6vB8nM0qW2eR4tY6uI8oP0aS2dF4gH6jK8lZ0xC2vB4nM6qW8eR0tY2uI4oP6aS8dF0g==";

/** CFDI 4.0 sintético estructuralmente completo: no debe arrojar hallazgos. */
export const CFDI_INTEGRO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd" Version="4.0" Serie="A" Folio="1001" Fecha="2026-06-15T10:00:00" Sello="${SELLO_DEMO}" NoCertificado="30001000000500000001" Certificado="${CERT_DEMO}" SubTotal="10000.00" Descuento="0.00" Moneda="MXN" Total="11600.00" TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE" FormaPago="03" LugarExpedicion="64000">
  <cfdi:Emisor Rfc="DEMOCEJ010101AA1" Nombre="CONSTRUCTORA EJEMPLAR" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="DEMOTRA950404DD4" Nombre="TRANSPORTES DEMO" DomicilioFiscalReceptor="64000" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="72101500" NoIdentificacion="SERV-01" Cantidad="1" ClaveUnidad="E48" Unidad="Servicio" Descripcion="Servicios de supervisión de obra civil" ValorUnitario="10000.00" Importe="10000.00" Descuento="0.00" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="10000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.00"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="1600.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="10000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="A1B2C3D4-5E6F-4A7B-8C9D-0E1F2A3B4C5D" FechaTimbrado="2026-06-15T10:02:31" RfcProvCertif="DEMOPAC010101AA1" SelloCFD="${SELLO_DEMO}" NoCertificadoSAT="30001000000400000007" SelloSAT="${SELLO_SAT_DEMO}"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

/**
 * CFDI 4.0 sintético con defectos deliberados y verificables:
 *  1. Sin TimbreFiscalDigital (no timbrado, sin UUID)
 *  2. Sello y Certificado vacíos
 *  3. MetodoPago PUE con FormaPago 99 (por definir)
 *  4. Aritmética inconsistente: 50,000 + 8,000 = 58,000 declarado 60,000
 *  5. Emisor en la lista 69-B (definitivo) del listado demo
 */
export const CFDI_RIESGO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="X" Folio="9999" Fecha="2026-06-15T10:00:00" Sello="" NoCertificado="" Certificado="" SubTotal="50000.00" Descuento="0.00" Moneda="MXN" Total="60000.00" TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE" FormaPago="99" LugarExpedicion="64000">
  <cfdi:Emisor Rfc="${EFOS_DEMO_RFCS.definitivo}" Nombre="PROVEEDOR EFOS DEFINITIVO DEMO" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="DEMOTRA950404DD4" Nombre="TRANSPORTES DEMO" DomicilioFiscalReceptor="64000" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="ACT" Descripcion="Servicios profesionales diversos" ValorUnitario="50000.00" Importe="50000.00" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="50000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="8000.00"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="8000.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="50000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="8000.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
</cfdi:Comprobante>`;

export const AVISO_SINTETICO =
  "Comprobante sintético de laboratorio: sirve para conocer la herramienta, no está timbrado ante el SAT y no puede guardarse en un expediente.";
