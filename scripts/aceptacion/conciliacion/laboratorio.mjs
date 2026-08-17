// ─────────────────────────────────────────────────────────────────────────────
// LABORATORIO SINTÉTICO DE CONCILIACIÓN — EJECUCIÓN Y COMPARACIÓN
//
// Lee el CSV y el XLSX con los PARSERS REALES de la aplicación
// (src/lib/conciliacion/parsers.ts) y ejecuta el MOTOR REAL de producción
// (src/lib/conciliacion/motor.ts) sobre cada uno por separado. Compara el
// resultado contra verdad_esperada.json, que el motor nunca ve.
//
// Uso: bun --preload ./scripts/aceptacion/conciliacion/precarga-url.mjs \
//        scripts/aceptacion/conciliacion/laboratorio.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { escribir, SALIDA } from "./generador.mjs";
import { parseBankFile } from "../../../src/lib/conciliacion/parsers.ts";
import { conciliarUnoAUno } from "../../../src/lib/conciliacion/motor.ts";
import { aCentavos } from "../../../src/lib/conciliacion/contrato.ts";

async function leerConParserReal(ruta, tipo) {
  const bytes = readFileSync(ruta);
  const file = new File([bytes], ruta.split("/").pop(), { type: tipo });
  return parseBankFile(file);
}

function aEntradaMovimientos(filas, movimientos) {
  // El identificador lo asigna la base; aquí lo reconstruimos por posición de
  // fila, igual que hace la importación real con `fila_origen`.
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

/** Huella comparable de un resultado del motor: pares, nivel, importes y exclusiones. */
function huella(r) {
  return JSON.stringify({
    grupos: r.grupos
      .map((g) => [
        g.movimiento_id,
        g.cfdi_id,
        g.nivel_propuesta,
        g.estado,
        g.importe_movimiento_centavos ?? null,
        g.importe_cfdi_centavos ?? null,
        g.diferencia_centavos ?? null,
      ])
      .sort(),
    sin_candidato: [...r.movimientos_sin_candidato].sort(),
    cfdi_sin_movimiento: [...r.cfdi_sin_movimiento].sort(),
    version: r.version,
  });
}

function evaluar(r, verdad) {
  const porMov = new Map(r.grupos.map((g) => [g.movimiento_id, g]));
  let altaCorrectas = 0;
  let altaTotal = 0;
  let falsosPositivosAmbiguos = 0;
  let correctos = 0;
  let total = 0;
  const fallos = [];

  for (const v of verdad) {
    total += 1;
    if (v.caso === "cfdi_sin_movimiento") {
      if (r.cfdi_sin_movimiento.includes(v.cfdi_id)) correctos += 1;
      else fallos.push({ ...v, obtenido: "asignado indebidamente" });
      continue;
    }
    const g = porMov.get(v.movimiento_id);

    if (v.caso === "movimiento_sin_cfdi") {
      if (!g) correctos += 1;
      else fallos.push({ ...v, obtenido: g.cfdi_id });
      continue;
    }
    if (v.caso === "ambiguo") {
      const ok = !g || (g.estado === "propuesto" && g.nivel_propuesta !== "automatica_alta_confianza");
      if (ok) correctos += 1;
      else {
        falsosPositivosAmbiguos += 1;
        fallos.push({ ...v, obtenido: g.nivel_propuesta });
      }
      continue;
    }
    if (g && g.cfdi_id === v.cfdi_id) correctos += 1;
    else fallos.push({ ...v, obtenido: g ? g.cfdi_id : null });

    if (g && g.nivel_propuesta === "automatica_alta_confianza") {
      altaTotal += 1;
      if (g.cfdi_id === v.cfdi_id) altaCorrectas += 1;
    }
  }

  return {
    total,
    correctos,
    exactitud_pct: Number(((correctos * 100) / total).toFixed(2)),
    alta_total: altaTotal,
    alta_correctas: altaCorrectas,
    precision_alta_pct: altaTotal ? Number(((altaCorrectas * 100) / altaTotal).toFixed(2)) : 0,
    falsos_positivos_ambiguos: falsosPositivosAmbiguos,
    confirmados_por_motor: r.grupos.filter((g) => g.estado !== "propuesto").length,
    fallos: fallos.slice(0, 10),
  };
}

async function main() {
  const { manifiesto, cfdi, movimientos, verdad } = escribir();

  const filasCsv = await leerConParserReal(join(SALIDA, "estado_cuenta.csv"), "text/csv");
  const filasXlsx = await leerConParserReal(join(SALIDA, "estado_cuenta.xlsx"), "");

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

  const rCsv = conciliarUnoAUno({ movimientos: aEntradaMovimientos(filasCsv, movimientos), cfdi: entradaCfdi });
  const rXlsx = conciliarUnoAUno({ movimientos: aEntradaMovimientos(filasXlsx, movimientos), cfdi: entradaCfdi });

  const entradaInvertida = {
    movimientos: [...aEntradaMovimientos(filasCsv, movimientos)].reverse(),
    cfdi: [...entradaCfdi].reverse(),
  };
  const rInv = conciliarUnoAUno(entradaInvertida);

  const evalCsv = evaluar(rCsv, verdad);
  const evalXlsx = evaluar(rXlsx, verdad);

  const filasIguales =
    filasCsv.length === filasXlsx.length &&
    filasCsv.every((f, i) => {
      const x = filasXlsx[i];
      return (
        f.fecha === x.fecha &&
        f.descripcion === x.descripcion &&
        (f.referencia ?? null) === (x.referencia ?? null) &&
        Math.round(f.cargo * 100) === Math.round(x.cargo * 100) &&
        Math.round(f.abono * 100) === Math.round(x.abono * 100)
      );
    });

  const equivalenciaCsvXlsx = filasIguales && huella(rCsv) === huella(rXlsx);
  const determinista = huella(rCsv) === huella(rInv);

  const reporte = {
    manifiesto: manifiesto.conteos,
    semilla: manifiesto.semilla,
    version_motor: rCsv.version,
    filas_csv: filasCsv.length,
    filas_xlsx: filasXlsx.length,
    movimientos_esperados: movimientos.length,
    csv: evalCsv,
    xlsx: evalXlsx,
    equivalencia_csv_xlsx: equivalenciaCsvXlsx,
    determinista_al_invertir_orden: determinista,
    movimientos_sin_candidato: rCsv.movimientos_sin_candidato.length,
    cfdi_sin_movimiento: rCsv.cfdi_sin_movimiento.length,
  };

  console.log(JSON.stringify(reporte, null, 2));

  const criterios = {
    filas_csv_completas: filasCsv.length === movimientos.length,
    filas_xlsx_completas: filasXlsx.length === movimientos.length,
    casos_csv_102_de_102: evalCsv.correctos === 102 && evalCsv.total === 102,
    casos_xlsx_102_de_102: evalXlsx.correctos === 102 && evalXlsx.total === 102,
    exactitud_total_100: evalCsv.exactitud_pct === 100 && evalXlsx.exactitud_pct === 100,
    precision_alta_confianza_99: evalCsv.precision_alta_pct >= 99 && evalXlsx.precision_alta_pct >= 99,
    cero_falsos_positivos_ambiguos:
      evalCsv.falsos_positivos_ambiguos === 0 && evalXlsx.falsos_positivos_ambiguos === 0,
    cero_confirmados_por_motor: evalCsv.confirmados_por_motor === 0 && evalXlsx.confirmados_por_motor === 0,
    equivalencia_csv_xlsx: equivalenciaCsvXlsx,
    determinismo: determinista,
  };

  console.log(JSON.stringify({ criterios }, null, 2));

  if (Object.values(criterios).some((v) => v !== true)) {
    console.error("LABORATORIO NO SUPERADO");
    process.exit(1);
  }
  console.log("LABORATORIO SUPERADO");
}

await main();
