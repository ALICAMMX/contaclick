// ─────────────────────────────────────────────────────────────────────────────
// LABORATORIO SINTÉTICO DE CONCILIACIÓN — EJECUCIÓN Y COMPARACIÓN
//
// Ejecuta el MOTOR REAL de producción (src/lib/conciliacion/motor.ts) sobre los
// archivos generados, leyendo el CSV y el XLSX como lo haría la importación, y
// compara el resultado contra verdad_esperada.json (que el motor nunca ve).
//
// Uso: bun scripts/aceptacion/conciliacion/laboratorio.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { escribir, SALIDA } from "./generador.mjs";
import { conciliarUnoAUno } from "../../../src/lib/conciliacion/motor.ts";
import { aCentavos } from "../../../src/lib/conciliacion/contrato.ts";

function leerCsv(ruta) {
  const texto = readFileSync(ruta, "utf8").trim().split("\n");
  const parseLinea = (l) => l.match(/("([^"]|"")*"|[^,]*)/g).filter((_, i) => i % 2 === 0).map((v) => v.replace(/^"|"$/g, "").replace(/""/g, '"'));
  const [, ...filas] = texto;
  return filas.map(parseLinea).map((f, i) => ({
    fila: i + 1,
    fecha: f[0],
    descripcion: f[1],
    referencia: f[2] || null,
    cargo: Number(f[3] || 0),
    abono: Number(f[4] || 0),
  }));
}

function leerXlsx(ruta) {
  const wb = XLSX.readFile(ruta);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]).map((r, i) => ({
    fila: i + 1,
    fecha: String(r.Fecha),
    descripcion: String(r.Descripcion),
    referencia: r.Referencia ? String(r.Referencia) : null,
    cargo: Number(r.Cargo || 0),
    abono: Number(r.Abono || 0),
  }));
}

function aEntradaMovimientos(filas, movimientos) {
  // El identificador lo asigna la base; aquí lo reconstruimos por posición de fila,
  // igual que hace la importación real con `fila_origen`.
  return filas.map((f, i) => ({
    id: movimientos[i].id,
    fecha: f.fecha,
    importe_centavos: aCentavos(f.abono > 0 ? f.abono : f.cargo),
    direccion: f.abono > 0 ? "abono" : "cargo",
    descripcion: f.descripcion,
    referencia: f.referencia,
    moneda: "MXN",
    ignorado: false,
    no_fiscal: false,
  }));
}

function main() {
  const { manifiesto, cfdi, movimientos, verdad } = escribir();

  const filasCsv = leerCsv(join(SALIDA, "estado_cuenta.csv"));
  const filasXlsx = leerXlsx(join(SALIDA, "estado_cuenta_secundario.xlsx"));
  if (filasCsv.length !== movimientos.length) throw new Error("El CSV no conserva todas las filas.");

  const entradaCfdi = cfdi.map((c) => ({
    id: c.id,
    uuid: c.uuid,
    fecha: c.fecha,
    total_centavos: c.total_centavos,
    direccion: c.direccion,
    tipo_cfdi: c.tipo_cfdi,
    metodo_pago: c.metodo_pago,
    estatus_sat: c.estatus_sat,
    moneda: c.moneda,
    rfc_contraparte: c.rfc_contraparte,
    nombre_contraparte: c.nombre_contraparte,
  }));

  const entrada = { movimientos: aEntradaMovimientos(filasCsv, movimientos), cfdi: entradaCfdi };
  const r = conciliarUnoAUno(entrada);

  // Determinismo: invertir el orden de lectura no cambia el resultado.
  const invertida = {
    movimientos: [...entrada.movimientos].reverse(),
    cfdi: [...entrada.cfdi].reverse(),
  };
  const r2 = conciliarUnoAUno(invertida);
  const determinista =
    JSON.stringify(r.grupos.map((g) => [g.movimiento_id, g.cfdi_id, g.nivel_propuesta]).sort()) ===
    JSON.stringify(r2.grupos.map((g) => [g.movimiento_id, g.cfdi_id, g.nivel_propuesta]).sort());

  const porMov = new Map(r.grupos.map((g) => [g.movimiento_id, g]));

  let altaCorrectas = 0;
  let altaTotal = 0;
  let falsosPositivosAmbiguos = 0;
  let esperadosCorrectos = 0;
  let esperadosTotal = 0;
  const fallos = [];

  for (const v of verdad) {
    if (v.caso === "cfdi_sin_movimiento") {
      if (r.cfdi_sin_movimiento.includes(v.cfdi_id)) esperadosCorrectos += 1;
      else fallos.push({ ...v, obtenido: "asignado indebidamente" });
      esperadosTotal += 1;
      continue;
    }
    const g = porMov.get(v.movimiento_id);
    esperadosTotal += 1;

    if (v.caso === "movimiento_sin_cfdi") {
      if (!g) esperadosCorrectos += 1;
      else fallos.push({ ...v, obtenido: g.cfdi_id });
      continue;
    }
    if (v.caso === "ambiguo") {
      // No debe existir selección engañosa: si propone, debe ser revisión y no alta confianza.
      const ok = !g || (g.estado === "propuesto" && g.nivel_propuesta !== "automatica_alta_confianza");
      if (ok) esperadosCorrectos += 1;
      else {
        falsosPositivosAmbiguos += 1;
        fallos.push({ ...v, obtenido: g.nivel_propuesta });
      }
      continue;
    }
    if (g && g.cfdi_id === v.cfdi_id) esperadosCorrectos += 1;
    else fallos.push({ ...v, obtenido: g ? g.cfdi_id : null });

    if (g && g.nivel_propuesta === "automatica_alta_confianza") {
      altaTotal += 1;
      if (g.cfdi_id === v.cfdi_id) altaCorrectas += 1;
    }
  }

  const confirmadosPorMotor = r.grupos.filter((g) => g.estado !== "propuesto").length;
  const precisionAlta = altaTotal ? (altaCorrectas * 100) / altaTotal : 0;

  const reporte = {
    manifiesto: manifiesto.conteos,
    semilla: manifiesto.semilla,
    version_motor: r.version,
    filas_csv: filasCsv.length,
    filas_xlsx: filasXlsx.length,
    grupos_propuestos: r.grupos.length,
    propuestas_alta_confianza: altaTotal,
    precision_alta_confianza_pct: Number(precisionAlta.toFixed(2)),
    falsos_positivos_en_ambiguos: falsosPositivosAmbiguos,
    casos_esperados: esperadosTotal,
    casos_correctos: esperadosCorrectos,
    exactitud_laboratorio_pct: Number(((esperadosCorrectos * 100) / esperadosTotal).toFixed(2)),
    motor_dejo_confirmados: confirmadosPorMotor,
    determinista_al_invertir_orden: determinista,
    movimientos_sin_candidato: r.movimientos_sin_candidato.length,
    cfdi_sin_movimiento: r.cfdi_sin_movimiento.length,
    fallos: fallos.slice(0, 10),
  };

  console.log(JSON.stringify(reporte, null, 2));

  const ok =
    precisionAlta >= 99 &&
    falsosPositivosAmbiguos === 0 &&
    confirmadosPorMotor === 0 &&
    determinista;
  if (!ok) {
    console.error("LABORATORIO NO SUPERADO");
    process.exit(1);
  }
  console.log("LABORATORIO SUPERADO");
}

main();
