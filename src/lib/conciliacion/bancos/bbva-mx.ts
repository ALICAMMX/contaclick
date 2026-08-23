// ─────────────────────────────────────────────────────────────────────────────
// ADAPTADOR BBVA MÉXICO — estado de cuenta con columnas OPER / LIQ / CARGOS /
// ABONOS / SALDO (formato "Cheques / Maestra PyME" impreso desde banca en línea).
//
// El sentido de cada movimiento se decide por la COLUMNA en la que el banco
// imprimió el importe (coordenada X), corroborada por la ecuación de saldos.
// La descripción sólo puede ALERTAR, nunca decidir.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  AdaptadorBancario, ColumnaImporte, ElementoPdf, FilaBancaria, ProblemaFila,
  RenglonPdf, ResultadoAdaptador, TotalesResumen,
} from "./tipos";
import {
  agruparRenglones, asignarColumna, centro, esImporte, fechaIsoValida, huellaFormato,
  MESES_ABREV, normaliza, parseImporte, type ColumnaDetectada,
} from "./posicional";

export const BBVA_VERSION = "bbva-mx-2026.08.23";

const RE_OPER = /(?:^|\s)(?:F(?:ECHA)?\.?\s*)?OPER(?:ACION)?\.?(?=\s|$)/;
const RE_LIQ = /(?:^|\s)(?:F(?:ECHA)?\.?\s*)?LIQ(?:UIDACION)?\.?(?=\s|$)/;
const RE_CARGO = /^(CARGOS?|RETIROS?|CARGOS \(-\))$/;
const RE_ABONO = /^(ABONOS?|DEP[OÓ]SITOS?|ABONOS \(\+\))$/;
const RE_SALDO = /^(SALDO|SALDOS)$/;
const RE_FECHA_CORTA = /^(\d{1,2})\/([A-Z]{3})\.?$/;

const NO_MOVIMIENTO =
  /^(SALDO (ANTERIOR|FINAL|INICIAL|PROMEDIO|MINIMO|AL)|TOTAL(ES)?\b|SUBTOTAL|P[AÁ]GINA|ESTADO DE CUENTA|BBVA|BANCOMER|RFC\b|NO\.? DE CUENTA|CLABE|SUCURSAL|N[UÚ]MERO DE CLIENTE|DETALLE DE MOVIMIENTOS|CONTINUA EN|INFORMACION|GAT\b|COMISIONES COBRADAS)/;

const MESES_LARGOS: Record<string, string> = {
  ENERO: "01", FEBRERO: "02", MARZO: "03", ABRIL: "04", MAYO: "05", JUNIO: "06",
  JULIO: "07", AGOSTO: "08", SEPTIEMBRE: "09", OCTUBRE: "10", NOVIEMBRE: "11", DICIEMBRE: "12",
};

const PALABRAS_CARGO =
  /(RETIRO|SPEI ENVIAD|TRANSFERENCIA ENVIAD|PAGO CUENTA DE TERCERO|PAGO TARJETA|COMPRA|COMISION|DISPOSICION|DOMICILIACION)/;
const PALABRAS_ABONO =
  /(SPEI RECIBID|TRANSFERENCIA RECIBID|DEPOSITO|ABONO|NOMINA|INTERESES ABONAD|DEVOLUCION)/;

function ultimoDia(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

/** Periodo explícito del estado de cuenta. Sin periodo no hay año, y sin año no hay importación. */
export function detectarPeriodoBbva(texto: string): { inicio: string; fin: string } | null {
  const t = normaliza(texto);
  const numerico = t.match(/DEL\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+AL\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (numerico) {
    const inicio = `${numerico[3]}-${numerico[2].padStart(2, "0")}-${numerico[1].padStart(2, "0")}`;
    const fin = `${numerico[6]}-${numerico[5].padStart(2, "0")}-${numerico[4].padStart(2, "0")}`;
    if (fechaIsoValida(inicio) && fechaIsoValida(fin)) return { inicio, fin };
  }
  const conMes = t.match(
    /DEL\s+(\d{1,2})\s*[\/ ]\s*([A-Z]{3,10})\s*[\/ ]\s*(\d{4})\s+AL\s+(\d{1,2})\s*[\/ ]\s*([A-Z]{3,10})\s*[\/ ]\s*(\d{4})/,
  );
  if (conMes) {
    const m1 = MESES_LARGOS[conMes[2]] ?? MESES_ABREV[conMes[2].slice(0, 3)];
    const m2 = MESES_LARGOS[conMes[5]] ?? MESES_ABREV[conMes[5].slice(0, 3)];
    if (m1 && m2) {
      const inicio = `${conMes[3]}-${m1}-${conMes[1].padStart(2, "0")}`;
      const fin = `${conMes[6]}-${m2}-${conMes[4].padStart(2, "0")}`;
      if (fechaIsoValida(inicio) && fechaIsoValida(fin)) return { inicio, fin };
    }
  }
  const mesSuelto = t.match(/PERIODO\s*:?\s*(?:DE\s+)?([A-Z]{4,10})\s+(?:DE\s+)?(\d{4})/);
  if (mesSuelto) {
    const mm = MESES_LARGOS[mesSuelto[1]];
    if (mm) {
      const anio = Number(mesSuelto[2]);
      return {
        inicio: `${anio}-${mm}-01`,
        fin: `${anio}-${mm}-${String(ultimoDia(anio, Number(mm))).padStart(2, "0")}`,
      };
    }
  }
  return null;
}

function columnasDeEncabezado(renglon: RenglonPdf): ColumnaDetectada[] | null {
  const cols: ColumnaDetectada[] = [];
  for (const el of renglon.elementos) {
    const t = normaliza(el.texto);
    const clave: ColumnaImporte | null = RE_CARGO.test(t)
      ? "cargo"
      : RE_ABONO.test(t)
        ? "abono"
        : RE_SALDO.test(t)
          ? "saldo"
          : null;
    if (clave && !cols.some((c) => c.clave === clave)) {
      cols.push({ clave, x: el.x, xFin: el.x + el.ancho, etiqueta: t });
    }
  }
  // pdf.js puede entregar OPER y LIQ como elementos separados o fusionarlos
  // dentro de un solo item de texto.
  const textoRenglon = normaliza(renglon.texto);
  const tieneFechas = RE_OPER.test(textoRenglon) && RE_LIQ.test(textoRenglon);
  if (cols.length === 3 && tieneFechas) return cols;
  return null;
}

/**
 * BBVA no siempre guarda el encabezado como un solo renglón PDF: en algunos
 * estados OPER/LIQ quedan una línea arriba de CARGOS/ABONOS/SALDO. La lectura
 * sigue siendo posicional; únicamente reunimos las etiquetas de un bloque
 * visual pequeño de la misma página.
 */
function columnasDeBloqueEncabezado(
  renglon: RenglonPdf,
  renglones: RenglonPdf[],
): ColumnaDetectada[] | null {
  const directa = columnasDeEncabezado(renglon);
  if (directa) return directa;

  const renglonEsEncabezado = renglon.elementos.some((e) => {
    const t = normaliza(e.texto);
    return RE_OPER.test(t) || RE_LIQ.test(t) || RE_CARGO.test(t) || RE_ABONO.test(t) || RE_SALDO.test(t);
  });
  if (!renglonEsEncabezado) return null;

  const cercanos = renglones.filter(
    (otro) => otro.pagina === renglon.pagina && Math.abs(otro.y - renglon.y) <= 24,
  );
  const elementos = cercanos.flatMap((otro) => otro.elementos);
  const textoBloque = normaliza(cercanos.map((otro) => otro.texto).join(" "));
  const tieneOper = RE_OPER.test(textoBloque);
  const tieneLiq = RE_LIQ.test(textoBloque);
  if (!tieneOper || !tieneLiq) return null;

  const cols: ColumnaDetectada[] = [];
  for (const el of elementos) {
    const t = normaliza(el.texto);
    const clave: ColumnaImporte | null = RE_CARGO.test(t)
      ? "cargo"
      : RE_ABONO.test(t)
        ? "abono"
        : RE_SALDO.test(t)
          ? "saldo"
          : null;
    if (clave && !cols.some((c) => c.clave === clave)) {
      cols.push({ clave, x: el.x, xFin: el.x + el.ancho, etiqueta: t });
    }
  }
  return cols.length === 3 ? cols : null;
}

function esFilaIgnorable(texto: string): boolean {
  return NO_MOVIMIENTO.test(normaliza(texto));
}

function anioParaMes(mes: string, dia: string, periodo: { inicio: string; fin: string }): string | null {
  const candidatos = [...new Set([periodo.inicio.slice(0, 4), periodo.fin.slice(0, 4)])];
  for (const y of candidatos) {
    const iso = `${y}-${mes}-${dia}`;
    if (fechaIsoValida(iso) && iso >= periodo.inicio && iso <= periodo.fin) return y;
  }
  return null;
}

type Borrador = FilaBancaria & { _importes: { cargo: number | null; abono: number | null; saldo: number | null } };

function extraerBbva(renglones: RenglonPdf[], texto: string): ResultadoAdaptador {
  const problemas: ProblemaFila[] = [];
  const movimientos: Borrador[] = [];
  const totales: TotalesResumen = { cargos: null, abonos: null, saldo_inicial: null, saldo_final: null };
  const periodo = detectarPeriodoBbva(texto);

  let columnas: ColumnaDetectada[] | null = null;
  const etiquetasEncabezado: string[] = [];
  let actual: Borrador | null = null;

  for (const r of renglones) {
    const posibles = columnasDeBloqueEncabezado(r, renglones);
    if (posibles) {
      // Encabezado (se repite en cada página): reinicia el arrastre de descripciones.
      columnas = posibles;
      if (!etiquetasEncabezado.length) etiquetasEncabezado.push(...posibles.map((c) => c.etiqueta));
      actual = null;
      continue;
    }
    if (!columnas) continue;

    const textoNorm = normaliza(r.texto);
    const importesEl = r.elementos.filter((e) => esImporte(e.texto));

    if (esFilaIgnorable(r.texto)) {
      const valores = importesEl.map((e) => parseImporte(e.texto));
      if (/SALDO ANTERIOR|SALDO INICIAL/.test(textoNorm) && valores.length) totales.saldo_inicial = valores[valores.length - 1];
      if (/SALDO FINAL|SALDO AL/.test(textoNorm) && valores.length) totales.saldo_final = valores[valores.length - 1];
      if (/TOTAL(ES)? (DE )?CARGOS|CARGOS \(-\)/.test(textoNorm) && valores.length) totales.cargos = valores[valores.length - 1];
      if (/TOTAL(ES)? (DE )?ABONOS|ABONOS \(\+\)/.test(textoNorm) && valores.length) totales.abonos = valores[valores.length - 1];
      actual = null;
      continue;
    }

    const fechas = r.elementos.filter((e) => RE_FECHA_CORTA.test(normaliza(e.texto)));
    const xColMin = Math.min(...columnas.map((c) => c.x));

    if (!fechas.length) {
      const importesEnColumna = importesEl.filter((e) => centro(e.x, e.ancho) >= xColMin - 20);
      if (importesEnColumna.length) {
        problemas.push({
          codigo: "IMPORTE_SIN_FECHA",
          pagina: r.pagina,
          fila_visual: r.indice,
          texto: r.texto.slice(0, 60),
          motivo: "Hay un importe en columna de cargo/abono sin fecha de operación en el mismo renglón.",
        });
        actual = null;
        continue;
      }
      // Descripción de varias líneas: se une a SU movimiento por coordenadas.
      if (actual && r.elementos.every((e) => centro(e.x, e.ancho) < xColMin - 20)) {
        actual.descripcion = `${actual.descripcion} ${r.texto}`.replace(/\s+/g, " ").trim().slice(0, 450);
        actual.traza.texto_original = `${actual.traza.texto_original} ${r.texto}`.slice(0, 160);
      }
      continue;
    }

    // ── Fila de movimiento ────────────────────────────────────────────────────
    const mOper = normaliza(fechas[0].texto).match(RE_FECHA_CORTA)!;
    const mLiq = fechas[1] ? normaliza(fechas[1].texto).match(RE_FECHA_CORTA) : null;
    const mes = MESES_ABREV[mOper[2]];
    const dia = mOper[1].padStart(2, "0");
    actual = null;

    if (!mes) {
      problemas.push({
        codigo: "FECHA_INVALIDA", pagina: r.pagina, fila_visual: r.indice,
        texto: r.texto.slice(0, 60), motivo: `Mes no reconocido: ${mOper[2]}.`,
      });
      continue;
    }
    if (!periodo) {
      problemas.push({
        codigo: "PERIODO_NO_DETECTADO", pagina: r.pagina, fila_visual: r.indice,
        texto: r.texto.slice(0, 60),
        motivo: "El estado de cuenta no declara un periodo del que pueda deducirse el año.",
      });
      continue;
    }
    const anio = anioParaMes(mes, dia, periodo);
    if (!anio) {
      problemas.push({
        codigo: "FECHA_FUERA_PERIODO", pagina: r.pagina, fila_visual: r.indice,
        texto: r.texto.slice(0, 60),
        motivo: `La fecha ${dia}/${mOper[2]} no cae dentro del periodo ${periodo.inicio} a ${periodo.fin}.`,
      });
      continue;
    }
    const fecha = `${anio}-${mes}-${dia}`;
    let fechaLiq: string | null = null;
    if (mLiq) {
      const mesL = MESES_ABREV[mLiq[2]];
      const diaL = mLiq[1].padStart(2, "0");
      const anioL = mesL ? anioParaMes(mesL, diaL, periodo) : null;
      if (mesL && anioL) fechaLiq = `${anioL}-${mesL}-${diaL}`;
    }

    const asignados: Record<string, number> = {};
    let sinColumna = false;
    let xCargoAbono: number | null = null;
    let xSaldo: number | null = null;
    for (const el of importesEl) {
      const col = asignarColumna(el, columnas);
      if (!col) { sinColumna = true; continue; }
      const valor = parseImporte(el.texto);
      asignados[col.clave] = (asignados[col.clave] ?? 0) + Math.abs(valor);
      if (col.clave === "saldo") xSaldo = col.x;
      else xCargoAbono = col.x;
      if (col.clave !== "saldo" && valor < 0) {
        // El signo explícito no puede contradecir la columna.
        if (col.clave === "abono") {
          problemas.push({
            codigo: "DOBLE_SENTIDO", pagina: r.pagina, fila_visual: r.indice,
            texto: r.texto.slice(0, 60),
            motivo: "El importe aparece bajo la columna de abonos pero viene con signo negativo.",
          });
        }
      }
    }
    if (sinColumna) {
      problemas.push({
        codigo: "IMPORTE_SIN_COLUMNA", pagina: r.pagina, fila_visual: r.indice,
        texto: r.texto.slice(0, 60),
        motivo: "Un importe no cae claramente bajo cargo, abono ni saldo.",
      });
      continue;
    }
    const cargo = asignados.cargo ?? 0;
    const abono = asignados.abono ?? 0;
    if (cargo > 0 && abono > 0) {
      problemas.push({
        codigo: "DOBLE_SENTIDO", pagina: r.pagina, fila_visual: r.indice,
        texto: r.texto.slice(0, 60), motivo: "El renglón trae importe en cargo y en abono a la vez.",
      });
      continue;
    }
    if (cargo === 0 && abono === 0) {
      problemas.push({
        codigo: "SIN_IMPORTE", pagina: r.pagina, fila_visual: r.indice,
        texto: r.texto.slice(0, 60), motivo: "El renglón tiene fecha pero ningún importe bajo cargo o abono.",
      });
      continue;
    }

    const xDescIni = Math.max(...fechas.map((e) => e.x + e.ancho));
    const descripcion = r.elementos
      .filter((e) => e.x >= xDescIni - 0.5 && centro(e.x, e.ancho) < xColMin - 20)
      .map((e) => e.texto.trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const borrador: Borrador = {
      fecha,
      descripcion: (descripcion || "(sin descripción)").slice(0, 450),
      referencia: (r.texto.match(/\b(?:REF(?:ERENCIA)?\.?\s*)(\w{4,20})\b/i)?.[1] ?? null),
      cargo,
      abono,
      saldo: asignados.saldo ?? null,
      traza: {
        pagina: r.pagina,
        fila_visual: r.indice,
        columna_importe: cargo > 0 ? "cargo" : "abono",
        x_columna: xCargoAbono ?? 0,
        x_saldo: xSaldo,
        texto_original: r.texto.slice(0, 160),
        fecha_operacion: fecha,
        fecha_liquidacion: fechaLiq,
        evidencia_sentido: "columna",
      },
      _importes: { cargo: asignados.cargo ?? null, abono: asignados.abono ?? null, saldo: asignados.saldo ?? null },
    };

    // Corroboración textual: sólo alerta, nunca sustituye la columna.
    const desc = normaliza(borrador.descripcion);
    const sugerido = PALABRAS_CARGO.test(desc) ? "cargo" : PALABRAS_ABONO.test(desc) ? "abono" : null;
    if (sugerido && ((sugerido === "cargo") !== (cargo > 0))) {
      problemas.push({
        codigo: "CONTRADICCION_DESCRIPCION", pagina: r.pagina, fila_visual: r.indice,
        texto: r.texto.slice(0, 60),
        motivo: `El importe está bajo la columna de ${cargo > 0 ? "cargos" : "abonos"} pero el concepto describe un ${sugerido}.`,
      });
    }

    movimientos.push(borrador);
    actual = borrador;
  }

  // ── Comprobación matemática ────────────────────────────────────────────────
  const conSaldos = movimientos.length > 0 && movimientos.every((m) => m.saldo != null);
  let orden: "ascendente" | "descendente" | "desconocido" = "desconocido";
  let saldoInicial: number | null = null;
  let saldoFinal: number | null = null;
  const cargosTot = Math.round(movimientos.reduce((s, m) => s + m.cargo, 0) * 100) / 100;
  const abonosTot = Math.round(movimientos.reduce((s, m) => s + m.abono, 0) * 100) / 100;
  let diferencia = 0;

  if (movimientos.length > 1) {
    orden = movimientos[0].fecha <= movimientos[movimientos.length - 1].fecha ? "ascendente" : "descendente";
  } else if (movimientos.length === 1) {
    orden = "ascendente";
  }

  if (conSaldos) {
    const crono = orden === "descendente" ? [...movimientos].reverse() : movimientos;
    const efecto = (m: Borrador) => m.abono - m.cargo;
    saldoInicial = Math.round((crono[0].saldo! - efecto(crono[0])) * 100) / 100;
    saldoFinal = crono[crono.length - 1].saldo!;
    for (let i = 1; i < crono.length; i += 1) {
      const delta = Math.round((crono[i].saldo! - crono[i - 1].saldo!) * 100);
      const esperado = Math.round(efecto(crono[i]) * 100);
      if (Math.abs(delta - esperado) > 1) {
        problemas.push({
          codigo: "CONTRADICCION_SALDO",
          pagina: crono[i].traza.pagina,
          fila_visual: crono[i].traza.fila_visual,
          texto: crono[i].traza.texto_original.slice(0, 60),
          motivo: `La variación del saldo (${(delta / 100).toFixed(2)}) no corresponde al importe de la columna (${(esperado / 100).toFixed(2)}).`,
        });
      } else {
        crono[i].traza.evidencia_sentido = "columna+saldo";
      }
    }
    diferencia = Math.round((saldoInicial + abonosTot - cargosTot - saldoFinal) * 100) / 100;
    if (Math.abs(diferencia) > 0.01) {
      problemas.push({
        codigo: "ECUACION_SALDOS", pagina: null, fila_visual: null, texto: "",
        motivo: `Saldo inicial + abonos − cargos no coincide con el saldo final. Diferencia: ${diferencia.toFixed(2)}.`,
      });
    }
  } else if (movimientos.length) {
    problemas.push({
      codigo: "SIN_SALDOS", pagina: null, fila_visual: null, texto: "",
      motivo: "El PDF no imprime saldo en todas las filas: la comprobación aritmética no puede hacerse.",
    });
  }

  const comparaResumen = (etiqueta: string, impreso: number | null, calculado: number | null) => {
    if (impreso == null || calculado == null) return;
    if (Math.abs(impreso - calculado) > 0.01) {
      problemas.push({
        codigo: "TOTALES_RESUMEN", pagina: null, fila_visual: null, texto: "",
        motivo: `El resumen impreso de ${etiqueta} (${impreso.toFixed(2)}) no coincide con lo leído (${calculado.toFixed(2)}).`,
      });
    }
  };
  comparaResumen("cargos", totales.cargos, cargosTot);
  comparaResumen("abonos", totales.abonos, abonosTot);
  comparaResumen("saldo inicial", totales.saldo_inicial, saldoInicial);
  comparaResumen("saldo final", totales.saldo_final, saldoFinal);

  if (!periodo) {
    problemas.push({
      codigo: "PERIODO_NO_DETECTADO", pagina: null, fila_visual: null, texto: "",
      motivo: "No se encontró el periodo explícito del estado de cuenta.",
    });
  }
  if (!columnas) {
    problemas.push({
      codigo: "SIN_ENCABEZADOS", pagina: null, fila_visual: null, texto: "",
      motivo: "No se localizaron los encabezados OPER / LIQ / CARGOS / ABONOS / SALDO.",
    });
  }

  const auto = problemas.length === 0 && movimientos.length > 0 && conSaldos && !!periodo;
  return {
    banco: "BBVA México",
    adaptador: "bbva-mx",
    version: BBVA_VERSION,
    huella: huellaFormato(["bbva-mx", ...etiquetasEncabezado, String(columnas?.length ?? 0)]),
    periodo: periodo ? periodo.fin.slice(0, 7) : null,
    periodo_inicio: periodo?.inicio ?? null,
    periodo_fin: periodo?.fin ?? null,
    confianza: auto ? "alta" : movimientos.length ? "revision" : "insuficiente",
    auto,
    movimientos: movimientos.map(({ _importes, ...m }) => m),
    problemas,
    totales_resumen: totales,
    calculado: {
      filas: movimientos.length,
      cargos: cargosTot,
      abonos: abonosTot,
      saldo_inicial: saldoInicial,
      saldo_final: saldoFinal,
      diferencia,
      orden,
    },
    limitaciones: adaptadorBbvaMx.limitaciones,
  };
}

export const adaptadorBbvaMx: AdaptadorBancario = {
  banco: "BBVA México",
  adaptador: "bbva-mx",
  version: BBVA_VERSION,
  encabezados_esperados: ["OPER", "LIQ", "COD. DESCRIPCIÓN / REFERENCIA", "CARGOS", "ABONOS", "SALDO"],
  limitaciones: [
    "Sólo formatos con columnas OPER/LIQ y CARGOS/ABONOS/SALDO impresas como texto.",
    "No soporta estados escaneados (imagen) ni tarjeta de crédito BBVA.",
    "Requiere periodo explícito del estado de cuenta para deducir el año.",
    "No interpreta movimientos en moneda distinta a MXN.",
  ],
  detectar(renglones, texto) {
    const t = normaliza(texto);
    let score = 0;
    if (/\bBBVA\b|\bBANCOMER\b/.test(t)) score += 2;
    if (renglones.some((r) => columnasDeBloqueEncabezado(r, renglones) !== null)) score += 4;
    if (/\d{1,2}\/(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\b/.test(t)) score += 1;
    if (/ESTADO DE CUENTA|NO\.? DE CUENTA|CLABE/.test(t)) score += 1;
    if (detectarPeriodoBbva(texto)) score += 1;
    return score;
  },
  extraer: extraerBbva,
};

/** Atajo para pruebas y para el lector: agrupa y extrae en un paso. */
export function leerBbvaDesdeElementos(elementos: ElementoPdf[]): ResultadoAdaptador {
  const renglones = agruparRenglones(elementos);
  const texto = renglones.map((r) => r.texto).join("\n");
  return extraerBbva(renglones, texto);
}
