// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES SINTÉTICOS DEL BLOQUE 2 (PÓLIZAS)
//
// Sólo construye insumos: catálogo contable pequeño (CSV y XLSX equivalentes),
// despachos/expedientes sandbox y CFDI SINTÉTICOS marcados como no verificados.
// No contacta SAT, PAC, IA, correo ni exportadores externos.
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID, createHash } from "node:crypto";
import * as XLSX from "xlsx";

/** Catálogo mínimo con los agrupadores SAT que exige el motor de pólizas. */
export const CATALOGO = [
  ["102", "Bancos", "deudora", "", "102", 1],
  ["102-001", "Bancos moneda nacional", "deudora", "102", "102.01", 2],
  ["105", "Clientes", "deudora", "", "105", 1],
  ["105-001", "Clientes nacionales", "deudora", "105", "105.01", 2],
  ["113", "IVA acreditable pagado", "deudora", "", "113", 1],
  ["113-001", "IVA acreditable efectivamente pagado", "deudora", "113", "113.01", 2],
  ["118", "IVA acreditable pendiente", "deudora", "", "118", 1],
  ["118-001", "IVA acreditable pendiente de pago", "deudora", "118", "118.01", 2],
  ["201", "Proveedores", "acreedora", "", "201", 1],
  ["201-001", "Proveedores nacionales", "acreedora", "201", "201.01", 2],
  ["208", "IVA trasladado no cobrado", "acreedora", "", "208", 1],
  ["208-001", "IVA trasladado pendiente de cobro", "acreedora", "208", "208.01", 2],
  ["208-002", "IEPS trasladado", "acreedora", "208", "208.02", 2],
  ["209", "IVA trasladado cobrado", "acreedora", "", "209", 1],
  ["209-001", "IVA trasladado efectivamente cobrado", "acreedora", "209", "209.01", 2],
  ["216", "Impuestos retenidos por enterar", "acreedora", "", "216", 1],
  ["216-001", "ISR retenido", "acreedora", "216", "216.01", 2],
  ["216-002", "IVA retenido", "acreedora", "216", "216.02", 2],
  ["401", "Ingresos", "acreedora", "", "400", 1],
  ["401-001", "Ingresos por servicios profesionales", "acreedora", "401", "401.01", 2],
  ["401-002", "Ingresos por servicios de laboratorio", "acreedora", "401", "401.02", 2],
  ["601", "Gastos", "deudora", "", "600", 1],
  ["601-001", "Gastos de operacion", "deudora", "601", "601.01", 2],
];

const ENCABEZADO = ["codigo", "nombre", "naturaleza", "codigo_padre", "agrupador_sat", "nivel", "moneda", "activa"];

export function catalogoCsv() {
  const filas = CATALOGO.map((c) => [...c, "MXN", "si"].join(","));
  return `${ENCABEZADO.join(",")}\n${filas.join("\n")}\n`;
}

export function catalogoXlsx() {
  const aoa = [ENCABEZADO, ...CATALOGO.map((c) => [...c, "MXN", "si"])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "catalogo");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

/** Archivo inválido: naturaleza inexistente, nombre vacío y código duplicado. */
export function catalogoInvalidoCsv() {
  return [
    ENCABEZADO.join(","),
    "701-001,Cuenta invalida,patrimonial,,701.01,2,MXN,si",
    "702-001,,deudora,,702.01,2,MXN,si",
    "703-001,Repetida,deudora,,703.01,2,MXN,si",
    "703-001,Repetida otra vez,deudora,,703.01,2,MXN,si",
    "",
  ].join("\n");
}

export const CLAVE_INGRESO = "84111506";
export const CLAVE_GASTO = "80101500";
export const CLAVE_SIN_REGLA = "99999999";

const c = (n) => Number(n.toFixed(2));

/**
 * Comprobantes sintéticos del periodo. Todos quedan marcados como laboratorio
 * y su estatus SAT proviene de una fuente sintética, nunca de evidencia real.
 */
export function comprobantes(periodo, rfcExpediente) {
  const fecha = `${periodo}-15`;
  const base = {
    version: "4.0",
    moneda: "MXN",
    fecha,
    fecha_timbrado: `${fecha}T12:05:00Z`,
    forma_pago: "03",
    uso_cfdi: "G03",
    periodo,
    estado_procesamiento: "normalizado",
    estatus_sat: "vigente",
    estatus_sat_fuente: "laboratorio_sintetico_no_verificado",
    origen: "laboratorio_qa_polizas",
  };
  const emitido = (extra) => ({
    ...base,
    direccion: "emitido",
    clase_documental: "ingreso",
    rfc_emisor: rfcExpediente,
    nombre_emisor: "EXPEDIENTE SANDBOX",
    rfc_receptor: "XAXX010101000",
    nombre_receptor: "CLIENTE SINTETICO",
    ...extra,
  });
  const recibido = (extra) => ({
    ...base,
    direccion: "recibido",
    clase_documental: "gasto",
    rfc_emisor: "XAXX010101000",
    nombre_emisor: "PROVEEDOR SINTETICO",
    rfc_receptor: rfcExpediente,
    nombre_receptor: "EXPEDIENTE SANDBOX",
    ...extra,
  });

  return {
    // F1 · ingreso pagado en una sola exhibición
    f1: {
      fila: emitido({ tipo_cfdi: "I", metodo_pago: "PUE", subtotal: c(1000), iva_trasladado: c(160), total: c(1160) }),
      conceptos: [{ numero: 1, clave_prod_serv: CLAVE_INGRESO, descripcion: "Servicio profesional sintetico", cantidad: 1, valor_unitario: c(1000), importe: c(1000), descuento: 0 }],
    },
    // F2 · gasto pagado en una sola exhibición
    f2: {
      fila: recibido({ tipo_cfdi: "I", metodo_pago: "PUE", subtotal: c(500), iva_trasladado: c(80), total: c(580) }),
      conceptos: [{ numero: 1, clave_prod_serv: CLAVE_GASTO, descripcion: "Gasto de operacion sintetico", cantidad: 1, valor_unitario: c(500), importe: c(500), descuento: 0 }],
    },
    // F3 · ingreso en parcialidades, sin complemento al inicio
    f3: {
      fila: emitido({ tipo_cfdi: "I", metodo_pago: "PPD", subtotal: c(2000), iva_trasladado: c(320), total: c(2320) }),
      conceptos: [{ numero: 1, clave_prod_serv: CLAVE_INGRESO, descripcion: "Servicio profesional en parcialidades", cantidad: 1, valor_unitario: c(2000), importe: c(2000), descuento: 0 }],
    },
    // F4 · ingreso con varios servicios en un mismo comprobante
    f4: {
      fila: emitido({ tipo_cfdi: "I", metodo_pago: "PUE", subtotal: c(1000), iva_trasladado: c(160), total: c(1160) }),
      conceptos: [
        { numero: 1, clave_prod_serv: CLAVE_INGRESO, descripcion: "Servicio A", cantidad: 1, valor_unitario: c(300), importe: c(300), descuento: 0 },
        { numero: 2, clave_prod_serv: CLAVE_INGRESO, descripcion: "Servicio B", cantidad: 1, valor_unitario: c(400), importe: c(400), descuento: 0 },
        { numero: 3, clave_prod_serv: CLAVE_INGRESO, descripcion: "Servicio C", cantidad: 1, valor_unitario: c(300), importe: c(300), descuento: 0 },
      ],
    },
    // F5 · gasto cuyo concepto no tiene regla contable
    f5: {
      fila: recibido({ tipo_cfdi: "I", metodo_pago: "PUE", subtotal: c(700), iva_trasladado: c(112), total: c(812) }),
      conceptos: [{ numero: 1, clave_prod_serv: CLAVE_SIN_REGLA, descripcion: "Concepto sin regla contable", cantidad: 1, valor_unitario: c(700), importe: c(700), descuento: 0 }],
    },
    // P1 · complemento de pago de F3
    p1: {
      fila: emitido({ tipo_cfdi: "P", metodo_pago: null, subtotal: 0, iva_trasladado: 0, total: c(2320), fecha: `${periodo}-20`, fecha_timbrado: `${periodo}-20T12:05:00Z`, clase_documental: "pago" }),
      conceptos: [],
    },
  };
}

export function uuidSintetico() {
  return randomUUID().toUpperCase();
}

export function hashSintetico(semilla) {
  return createHash("sha256").update(`sintetico:${semilla}`).digest("hex");
}
