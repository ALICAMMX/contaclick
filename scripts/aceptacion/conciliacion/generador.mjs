// ─────────────────────────────────────────────────────────────────────────────
// LABORATORIO SINTÉTICO DE CONCILIACIÓN — GENERADOR (semilla fija)
//
// Produce, de forma reproducible: expediente sandbox, un segundo despacho para
// aislamiento, comprobantes CFDI 4.0 sintéticos, estado de cuenta CSV, estado
// de cuenta XLSX, la verdad esperada (en archivo SEPARADO) y un manifiesto.
//
// El motor JAMÁS lee verdad_esperada.json.
// Los comprobantes quedan marcados como sintéticos y NO verificados ante el SAT.
// ─────────────────────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

export const SEMILLA = 20260817;
export const VERSION_LAB = "lab-conciliacion@1";
export const SALIDA = join(process.cwd(), "scripts/aceptacion/conciliacion/salida");

/** PRNG determinista (mulberry32): misma semilla ⇒ mismos datos. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEX = "0123456789ABCDEF";
function uuidSintetico(r) {
  const h = (n) => Array.from({ length: n }, () => HEX[Math.floor(r() * 16)]).join("");
  return `${h(8)}-${h(4)}-${h(4)}-${h(4)}-${h(12)}`;
}

const CONTRAPARTES = [
  ["ACME INDUSTRIAL SA DE CV", "AIN920115AB1"],
  ["DISTRIBUIDORA NORTE SA DE CV", "DNO880420CD2"],
  ["SERVICIOS OMEGA SC", "SOM010730EF3"],
  ["COMERCIAL DELTA SA DE CV", "CDE050612GH4"],
  ["LOGISTICA PENINSULAR SA DE CV", "LPE111122IJ5"],
];

const RFC_SANDBOX = "SAND010101AAA";
const PERIODO = "2026-07";

function fecha(dia) {
  return `2026-07-${String(dia).padStart(2, "0")}`;
}

function cfdiXml({ uuid, fecha: f, total, emitido, contraparte, rfcContraparte }) {
  const emisor = emitido ? { rfc: RFC_SANDBOX, nombre: "EXPEDIENTE SANDBOX CONTACLICK" } : { rfc: rfcContraparte, nombre: contraparte };
  const receptor = emitido ? { rfc: rfcContraparte, nombre: contraparte } : { rfc: RFC_SANDBOX, nombre: "EXPEDIENTE SANDBOX CONTACLICK" };
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- DOCUMENTO SINTETICO DE LABORATORIO: NO VERIFICADO ANTE EL SAT -->
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0" Fecha="${f}T12:00:00" Moneda="MXN" Total="${total.toFixed(2)}" SubTotal="${total.toFixed(2)}"
  TipoDeComprobante="I" MetodoPago="PUE" FormaPago="03" Exportacion="01" LugarExpedicion="64000">
  <cfdi:Emisor Rfc="${emisor.rfc}" Nombre="${emisor.nombre}" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${receptor.rfc}" Nombre="${receptor.nombre}" DomicilioFiscalReceptor="64000" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="ACT" Descripcion="Operacion sintetica de laboratorio" ValorUnitario="${total.toFixed(2)}" Importe="${total.toFixed(2)}" ObjetoImp="02"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${uuid}" FechaTimbrado="${f}T12:05:00" RfcProvCertif="SINTETICO"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

export function generar() {
  const r = prng(SEMILLA);
  const cfdi = [];
  const movimientos = [];
  const verdad = [];
  let nMov = 0;
  let nCfdi = 0;

  const nuevoCfdi = (opts) => {
    nCfdi += 1;
    const id = `cfdi-${String(nCfdi).padStart(3, "0")}`;
    const uuid = uuidSintetico(r);
    const [contraparte, rfcContraparte] = CONTRAPARTES[Math.floor(r() * CONTRAPARTES.length)];
    const reg = {
      id,
      uuid,
      fecha: opts.fecha,
      total: opts.total,
      total_centavos: Math.round(opts.total * 100),
      direccion: opts.emitido ? "emitido" : "recibido",
      tipo_cfdi: "I",
      metodo_pago: "PUE",
      // Nunca fingimos "vigente": es un documento sintético sin verificación SAT.
      estatus_sat: "sintetico_no_verificado",
      moneda: "MXN",
      rfc_contraparte: opts.rfcContraparte ?? rfcContraparte,
      nombre_contraparte: opts.contraparte ?? contraparte,
      xml: "",
    };
    reg.xml = cfdiXml({
      uuid,
      fecha: opts.fecha,
      total: opts.total,
      emitido: opts.emitido,
      contraparte: reg.nombre_contraparte,
      rfcContraparte: reg.rfc_contraparte,
    });
    cfdi.push(reg);
    return reg;
  };

  const nuevoMov = ({ fecha: f, total, emitido, descripcion, referencia }) => {
    nMov += 1;
    const id = `mov-${String(nMov).padStart(3, "0")}`;
    movimientos.push({
      id,
      fila: nMov,
      fecha: f,
      abono: emitido ? total : 0,
      cargo: emitido ? 0 : total,
      importe_centavos: Math.round(total * 100),
      direccion: emitido ? "abono" : "cargo",
      descripcion,
      referencia: referencia ?? null,
      moneda: "MXN",
      ignorado: false,
      no_fiscal: false,
    });
    return movimientos[movimientos.length - 1];
  };

  const importe = () => Math.round((500 + r() * 90000) * 100) / 100;
  const cola = (u) => u.replace(/-/g, "").slice(-8);

  // A. 45 coincidencias uno-a-uno inequívocas (UUID + contraparte en el banco)
  for (let i = 0; i < 45; i += 1) {
    const emitido = i % 2 === 0;
    const dia = 1 + (i % 27);
    const t = importe();
    const c = nuevoCfdi({ fecha: fecha(dia), total: t, emitido });
    const m = nuevoMov({
      fecha: fecha(dia),
      total: t,
      emitido,
      descripcion: `SPEI ${c.nombre_contraparte} ${c.rfc_contraparte}`,
      referencia: `REF${cola(c.uuid)}`,
    });
    verdad.push({ caso: "inequivoco", movimiento_id: m.id, cfdi_id: c.id, nivel: "automatica_alta_confianza" });
  }

  // B. 20 con desplazamiento de fecha de 1–3 días y señales fuertes
  for (let i = 0; i < 20; i += 1) {
    const emitido = i % 2 === 1;
    const dia = 2 + (i % 24);
    const desfase = 1 + (i % 3);
    const t = importe();
    const c = nuevoCfdi({ fecha: fecha(dia), total: t, emitido });
    const m = nuevoMov({
      fecha: fecha(dia + desfase),
      total: t,
      emitido,
      descripcion: `TRANSFERENCIA ${c.nombre_contraparte}`,
      referencia: `REF${cola(c.uuid)}`,
    });
    verdad.push({ caso: "desplazado", dias: desfase, movimiento_id: m.id, cfdi_id: c.id, nivel: "automatica_alta_confianza" });
  }

  // C. 10 importes y fechas iguales, diferenciados por contraparte o referencia
  for (let i = 0; i < 10; i += 1) {
    const emitido = i % 2 === 0;
    const dia = 5 + (i % 20);
    const t = importe();
    const a = CONTRAPARTES[i % CONTRAPARTES.length];
    const b = CONTRAPARTES[(i + 2) % CONTRAPARTES.length];
    const c1 = nuevoCfdi({ fecha: fecha(dia), total: t, emitido, contraparte: a[0], rfcContraparte: a[1] });
    const c2 = nuevoCfdi({ fecha: fecha(dia), total: t, emitido, contraparte: b[0], rfcContraparte: b[1] });
    const m = nuevoMov({
      fecha: fecha(dia),
      total: t,
      emitido,
      descripcion: `PAGO ${c2.nombre_contraparte} ${c2.rfc_contraparte}`,
      referencia: `REF${cola(c2.uuid)}`,
    });
    verdad.push({
      caso: "mismo_importe_distinta_contraparte",
      movimiento_id: m.id,
      cfdi_id: c2.id,
      descartado_id: c1.id,
      nivel: "revision_requerida",
    });
  }

  // D. 10 ambiguos: dos comprobantes indistinguibles, sin señales fuertes
  for (let i = 0; i < 10; i += 1) {
    const emitido = i % 2 === 1;
    const dia = 3 + (i % 22);
    const t = importe();
    const [nombre, rfc] = CONTRAPARTES[i % CONTRAPARTES.length];
    const c1 = nuevoCfdi({ fecha: fecha(dia), total: t, emitido, contraparte: nombre, rfcContraparte: rfc });
    const c2 = nuevoCfdi({ fecha: fecha(dia), total: t, emitido, contraparte: nombre, rfcContraparte: rfc });
    const m = nuevoMov({ fecha: fecha(dia), total: t, emitido, descripcion: "DEPOSITO SIN REFERENCIA", referencia: null });
    verdad.push({ caso: "ambiguo", movimiento_id: m.id, candidatos: [c1.id, c2.id], nivel: "revision_requerida", ambiguo: true });
  }

  // E. 10 movimientos sin comprobante
  for (let i = 0; i < 10; i += 1) {
    const m = nuevoMov({
      fecha: fecha(4 + i),
      total: importe(),
      emitido: i % 2 === 0,
      descripcion: `COMISION BANCARIA ${i + 1}`,
      referencia: null,
    });
    verdad.push({ caso: "movimiento_sin_cfdi", movimiento_id: m.id, cfdi_id: null });
  }

  // F. 2 movimientos legítimos idénticos en el mismo archivo, con 2 comprobantes
  {
    const t = 12345.67;
    const dia = 15;
    const [nombre, rfc] = CONTRAPARTES[0];
    const c1 = nuevoCfdi({ fecha: fecha(dia), total: t, emitido: true, contraparte: nombre, rfcContraparte: rfc });
    const c2 = nuevoCfdi({ fecha: fecha(dia), total: t, emitido: true, contraparte: nombre, rfcContraparte: rfc });
    const m1 = nuevoMov({ fecha: fecha(dia), total: t, emitido: true, descripcion: `SPEI ${nombre} ${rfc}`, referencia: `REF${cola(c1.uuid)}` });
    const m2 = nuevoMov({ fecha: fecha(dia), total: t, emitido: true, descripcion: `SPEI ${nombre} ${rfc}`, referencia: `REF${cola(c2.uuid)}` });
    verdad.push({ caso: "identicos_legitimos", movimiento_id: m1.id, cfdi_id: c1.id, nivel: "automatica_alta_confianza" });
    verdad.push({ caso: "identicos_legitimos", movimiento_id: m2.id, cfdi_id: c2.id, nivel: "automatica_alta_confianza" });
  }

  // G. 5 comprobantes sin movimiento (documentos adicionales, no movimientos)
  for (let i = 0; i < 5; i += 1) {
    const c = nuevoCfdi({ fecha: fecha(20 + i), total: importe(), emitido: i % 2 === 0 });
    verdad.push({ caso: "cfdi_sin_movimiento", cfdi_id: c.id, movimiento_id: null });
  }

  return { cfdi, movimientos, verdad };
}

function csvBancario(movs) {
  const filas = [["Fecha", "Descripcion", "Referencia", "Cargo", "Abono", "Saldo"]];
  let saldo = 1000000;
  for (const m of movs) {
    saldo += m.abono - m.cargo;
    filas.push([
      m.fecha,
      m.descripcion,
      m.referencia ?? "",
      m.cargo ? m.cargo.toFixed(2) : "",
      m.abono ? m.abono.toFixed(2) : "",
      saldo.toFixed(2),
    ]);
  }
  return filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function xlsxBancario(movs, ruta) {
  let saldo = 1000000;
  const rows = movs.map((m) => {
    saldo += m.abono - m.cargo;
    return {
      Fecha: m.fecha,
      Descripcion: m.descripcion,
      Referencia: m.referencia ?? "",
      Cargo: m.cargo ? Number(m.cargo.toFixed(2)) : "",
      Abono: m.abono ? Number(m.abono.toFixed(2)) : "",
      Saldo: Number(saldo.toFixed(2)),
    };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Movimientos");
  XLSX.writeFile(wb, ruta);
}


export function escribir() {
  const { cfdi, movimientos, verdad } = generar();
  mkdirSync(join(SALIDA, "cfdi"), { recursive: true });

  for (const c of cfdi) writeFileSync(join(SALIDA, "cfdi", `${c.id}.xml`), c.xml, "utf8");
  writeFileSync(join(SALIDA, "estado_cuenta.csv"), csvBancario(movimientos), "utf8");
  xlsxBancario(movimientos, join(SALIDA, "estado_cuenta.xlsx"));

  const sinXml = cfdi.map(({ xml, ...resto }) => resto);
  writeFileSync(join(SALIDA, "cfdi.json"), JSON.stringify(sinXml, null, 2));
  writeFileSync(join(SALIDA, "movimientos.json"), JSON.stringify(movimientos, null, 2));
  writeFileSync(join(SALIDA, "verdad_esperada.json"), JSON.stringify(verdad, null, 2));

  const manifiesto = {
    semilla: SEMILLA,
    version_laboratorio: VERSION_LAB,
    periodo: PERIODO,
    rfc_sandbox: RFC_SANDBOX,
    despacho_aislamiento: "SAND020202BBB",
    estatus_sat_documentos: "sintetico_no_verificado",
    conteos: {
      movimientos: movimientos.length,
      cfdi: cfdi.length,
      inequivocos: verdad.filter((v) => v.caso === "inequivoco").length,
      desplazados: verdad.filter((v) => v.caso === "desplazado").length,
      mismo_importe: verdad.filter((v) => v.caso === "mismo_importe_distinta_contraparte").length,
      ambiguos: verdad.filter((v) => v.caso === "ambiguo").length,
      movimientos_sin_cfdi: verdad.filter((v) => v.caso === "movimiento_sin_cfdi").length,
      identicos_legitimos: verdad.filter((v) => v.caso === "identicos_legitimos").length,
      cfdi_sin_movimiento: verdad.filter((v) => v.caso === "cfdi_sin_movimiento").length,
    },
  };
  writeFileSync(join(SALIDA, "manifiesto.json"), JSON.stringify(manifiesto, null, 2));
  return { manifiesto, cfdi, movimientos, verdad };
}

if (import.meta.main) {
  const { manifiesto } = escribir();
  console.log(JSON.stringify(manifiesto, null, 2));
}
