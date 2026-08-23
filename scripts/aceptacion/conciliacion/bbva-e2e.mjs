// ─────────────────────────────────────────────────────────────────────────────
// ACEPTACIÓN E2E — LECTOR BBVA PDF POR PLANTILLAS
//
// PDF sintético → extracción posicional real (pdf.js) → detección del adaptador
// → validación matemática → filas listas para importar. La verdad esperada
// nunca la ve el adaptador.
//
// Uso: python3 scripts/aceptacion/conciliacion/bbva-generar-pdf.py
//      bun scripts/aceptacion/conciliacion/bbva-e2e.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { leerPdfBancario } from "../../../src/lib/conciliacion/bancos/registry.ts";
import { analizarImportacion, serializacionCanonica } from "../../../src/lib/conciliacion/importacion.ts";

const SALIDA = join(dirname(fileURLToPath(import.meta.url)), "salida");

async function elementosDelPdf(ruta) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(ruta));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false }).promise;
  const elementos = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (typeof it.str !== "string" || !it.str.trim()) continue;
      elementos.push({
        pagina: i,
        texto: it.str,
        x: it.transform[4],
        y: it.transform[5],
        ancho: Number(it.width) || it.str.length * 5,
        alto: Number(it.height) || 8,
      });
    }
  }
  return elementos;
}

const casi = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

async function main() {
  const verdad = JSON.parse(readFileSync(join(SALIDA, "bbva_verdad.json"), "utf8"));
  const elementos = await elementosDelPdf(join(SALIDA, "bbva_sintetico.pdf"));
  const r = leerPdfBancario(elementos);

  const filas = r.movimientos.map((m) => ({
    fecha: m.fecha,
    descripcion: m.descripcion,
    referencia: m.referencia,
    cargo: m.cargo,
    abono: m.abono,
    saldo: m.saldo,
  }));
  const analisis = analizarImportacion({
    movimientos: filas,
    periodo_declarado: null,
    cuenta_seleccionada: true,
    periodo_rango: { inicio: r.periodo_inicio, fin: r.periodo_fin },
  });

  // Reimportación idempotente: misma huella canónica en una segunda lectura.
  const r2 = leerPdfBancario(await elementosDelPdf(join(SALIDA, "bbva_sintetico.pdf")));
  const huella1 = serializacionCanonica(filas);
  const huella2 = serializacionCanonica(
    r2.movimientos.map((m) => ({
      fecha: m.fecha, descripcion: m.descripcion, referencia: m.referencia,
      cargo: m.cargo, abono: m.abono, saldo: m.saldo,
    })),
  );

  const reporte = {
    adaptador: `${r.adaptador}@${r.version}`,
    banco: r.banco,
    huella_formato: r.huella,
    puntaje_deteccion: r.puntaje_deteccion,
    periodo: `${r.periodo_inicio} a ${r.periodo_fin}`,
    confianza: r.confianza,
    auto: r.auto,
    calculado: r.calculado,
    totales_resumen: r.totales_resumen,
    problemas: r.problemas,
    incidencias_importacion: analisis.incidencias.map((i) => i.codigo),
  };
  console.log(JSON.stringify(reporte, null, 2));

  const criterios = {
    adaptador_bbva: r.adaptador === "bbva-mx",
    importacion_automatica: r.auto === true && r.confianza === "alta",
    conteo_exacto: r.movimientos.length === verdad.movimientos.length,
    fechas_exactas: r.movimientos.every((m, i) => m.fecha === verdad.movimientos[i].fecha),
    sentido_exacto: r.movimientos.every(
      (m, i) => casi(m.cargo, verdad.movimientos[i].cargo) && casi(m.abono, verdad.movimientos[i].abono),
    ),
    total_cargos_exacto: casi(r.calculado.cargos, verdad.cargos),
    total_abonos_exacto: casi(r.calculado.abonos, verdad.abonos),
    saldo_inicial_exacto: casi(r.calculado.saldo_inicial, verdad.saldo_inicial),
    saldo_final_exacto: casi(r.calculado.saldo_final, verdad.saldo_final),
    diferencia_cero: casi(r.calculado.diferencia, 0),
    cero_ambiguos: r.problemas.length === 0,
    cero_fechas_fuera_periodo: r.movimientos.every(
      (m) => m.fecha >= verdad.periodo.inicio && m.fecha <= verdad.periodo.fin,
    ),
    cero_anios_implausibles: r.movimientos.every((m) => !/^(2002|2029|2030|2031)/.test(m.fecha)),
    descripcion_multilinea_unida: r.movimientos[0].descripcion.includes("REFERENCIA 0066398014"),
    encabezado_segunda_pagina: r.movimientos.some((m) => m.traza.pagina === 2),
    trazabilidad_por_movimiento: r.movimientos.every(
      (m) => m.traza.x_columna > 0 && m.traza.fecha_operacion === m.fecha,
    ),
    importacion_no_bloqueada: analisis.bloqueada === false,
    reimportacion_idempotente: huella1 === huella2,
  };
  console.log(JSON.stringify({ criterios }, null, 2));

  if (Object.values(criterios).some((v) => v !== true)) {
    console.error("LECTOR_BBVA_PDF_NO_VERIFICADO");
    process.exit(1);
  }
  console.log("LECTOR_BBVA_PDF_VERIFICADO");
}

await main();
