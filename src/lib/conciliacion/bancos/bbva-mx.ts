// ─────────────────────────────────────────────────────────────────────────────
// ADAPTADOR BBVA MÉXICO — lectura POSICIONAL de estados de cuenta.
//
// Soporta las dos familias de encabezado que imprime el banco:
//
//   A) Una sola línea:   OPER | LIQ | DESCRIPCIÓN/REFERENCIA | CARGOS | ABONOS | SALDO
//   B) Dos niveles:      FECHA .............................. SALDO
//                        OPER  LIQ  DESCRIPCION  REFERENCIA  CARGOS  ABONOS  OPERACION  LIQUIDACION
//
// En la variante B hay DOS columnas de saldo (operación y liquidación) y pdf.js
// puede entregar etiquetas fusionadas en un solo elemento de texto
// (p. ej. "ABONOS OPERACION"): se parten proporcionalmente por caracteres.
//
// El sentido de cada movimiento se decide EXCLUSIVAMENTE por la columna
// (coordenada X) en la que el banco imprimió el importe. La descripción sólo
// puede ALERTAR de una contradicción, nunca decidir.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  AdaptadorBancario, ElementoPdf, FilaBancaria, ProblemaFila,
  RenglonPdf, ResultadoAdaptador, TotalesResumen,
} from "./tipos";
import {
  agruparRenglones, asignarColumna, centro, esImporte, fechaIsoValida, huellaFormato,
  MESES_ABREV, normaliza, parseImporte, type ColumnaDetectada,
} from "./posicional";

export const BBVA_VERSION = "bbva-mx-2026.08.24";

const RE_FECHA_CORTA = /^(\d{1,2})\/([A-Z]{3})\.?$/;
/** El bloque de movimientos termina aquí: nada posterior es un movimiento. */
const RE_FIN_MOVIMIENTOS = /^TOTAL(ES)? DE MOVIMIENTOS\b/;

const NO_MOVIMIENTO =
  /^(SALDO (ANTERIOR|FINAL|INICIAL|PROMEDIO|MINIMO|AL|GLOBAL)|TOTAL(ES)?\b|SUBTOTAL|P[AÁ]GINA|ESTADO DE CUENTA|BBVA|BANCOMER|RFC\b|R\.F\.C|NO\.? DE CUENTA|NO\.? CUENTA CLABE|CLABE|SUCURSAL|N[UÚ]MERO DE CLIENTE|NO\.? DE CLIENTE|DETALLE DE MOVIMIENTOS|CONTINUA EN|INFORMACION|GAT\b|COMISIONES COBRADAS|CUADRO RESUMEN|TARJETA )/;

const MESES_LARGOS: Record<string, string> = {
  ENERO: "01", FEBRERO: "02", MARZO: "03", ABRIL: "04", MAYO: "05", JUNIO: "06",
  JULIO: "07", AGOSTO: "08", SEPTIEMBRE: "09", OCTUBRE: "10", NOVIEMBRE: "11", DICIEMBRE: "12",
};

// "PAGO CUENTA DE TERCERO" queda FUERA a propósito: BBVA lo usa igual para
// enviar y para recibir, así que como señal de sentido es falsa.
const PALABRAS_CARGO =
  /(RETIRO|SPEI ENVIAD|TRANSFERENCIA ENVIAD|PAGO TARJETA|COMPRA|COMISION|DISPOSICION|DOMICILIACION)/;

const PALABRAS_ABONO =
  /(SPEI RECIBID|TRANSFERENCIA RECIBID|DEPOSITO|ABONO|NOMINA|INTERESES ABONAD|DEVOLUCION)/;

function ultimoDia(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

const cent = (n: number) => Math.round(n * 100);
const pesos = (c: number) => Math.round(c) / 100;

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

// ── Encabezado ───────────────────────────────────────────────────────────────

type ClaveCaja =
  | "oper" | "liq" | "fecha" | "descripcion" | "referencia"
  | "cargo" | "abono" | "saldo" | "saldo_operacion" | "saldo_liquidacion";

type Caja = {
  clave: ClaveCaja;
  x: number;
  xFin: number;
  etiqueta: string;
  /** Inicio del elemento de texto que la contiene (una etiqueta puede venir
   *  fusionada con otra, p. ej. "COD. DESCRIPCIÓN / REFERENCIA"). */
  xEl: number;
};


type Encabezado = {
  descripcion: Caja | null;
  referencia: Caja | null;
  cargo: Caja;
  abono: Caja;
  saldo_operacion: Caja;
  saldo_liquidacion: Caja | null;
  etiquetas: string[];
  dosNiveles: boolean;
};

/** Alternativas ordenadas de más larga a más corta para no partir palabras. */
const RE_ETIQUETA =
  /(OPERACION|LIQUIDACION|DESCRIPCION|REFERENCIA|CONCEPTO|DEPOSITOS|DEPOSITO|CARGOS|CARGO|RETIROS|ABONOS|ABONO|SALDOS|SALDO|FECHA|OPER|LIQ)/g;

const CLAVE_POR_ETIQUETA: Record<string, ClaveCaja> = {
  OPERACION: "saldo_operacion", LIQUIDACION: "saldo_liquidacion",
  DESCRIPCION: "descripcion", CONCEPTO: "descripcion", REFERENCIA: "referencia",
  CARGOS: "cargo", CARGO: "cargo", RETIROS: "cargo",
  ABONOS: "abono", ABONO: "abono", DEPOSITOS: "abono", DEPOSITO: "abono",
  SALDOS: "saldo", SALDO: "saldo", FECHA: "fecha", OPER: "oper", LIQ: "liq",
};

/**
 * Parte un elemento de texto en cajas por etiqueta. pdf.js puede fusionar
 * "ABONOS" y "OPERACION" en un solo item: el ancho se reparte proporcional a
 * los caracteres, que es exactamente como lo dibujó el PDF.
 */
function cajasDeElemento(el: ElementoPdf): Caja[] {
  const t = normaliza(el.texto);
  if (!t) return [];
  const out: Caja[] = [];
  RE_ETIQUETA.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_ETIQUETA.exec(t)) !== null) {
    const clave = CLAVE_POR_ETIQUETA[m[1]];
    if (!clave) continue;
    const x = el.x + (el.ancho * m.index) / t.length;
    const xFin = el.x + (el.ancho * (m.index + m[1].length)) / t.length;
    out.push({ clave, x, xFin, etiqueta: m[1], xEl: el.x });
  }
  return out;
}

/** Elementos del bloque visual de encabezado (mismo bloque de la misma página). */
function elementosDeBloque(renglon: RenglonPdf, renglones: RenglonPdf[]): ElementoPdf[] {
  return renglones
    .filter((o) => o.pagina === renglon.pagina && Math.abs(o.y - renglon.y) <= 24)
    .flatMap((o) => o.elementos);
}

function interpretarEncabezado(elementos: ElementoPdf[]): Encabezado | null {
  const cajas = elementos.flatMap(cajasDeElemento);
  if (!cajas.length) return null;
  const primera = (c: ClaveCaja) => cajas.filter((k) => k.clave === c).sort((a, b) => a.x - b.x)[0] ?? null;

  const cargo = primera("cargo");
  const abono = primera("abono");
  if (!cargo || !abono || abono.x <= cargo.x) return null;

  const tieneOper = cajas.some((c) => c.clave === "oper");
  const tieneLiq = cajas.some((c) => c.clave === "liq");
  if (!tieneOper || !tieneLiq) return null;

  // Las cajas de saldo deben quedar a la DERECHA de abonos: así "LIQ" (fecha)
  // nunca puede confundirse con "LIQUIDACION" (saldo).
  const aDerecha = (c: Caja | null) => (c && c.x > abono.x ? c : null);
  const saldoOperacion = aDerecha(cajas.filter((k) => k.clave === "saldo_operacion").sort((a, b) => a.x - b.x)[0] ?? null);
  const saldoLiquidacion = aDerecha(cajas.filter((k) => k.clave === "saldo_liquidacion").sort((a, b) => a.x - b.x)[0] ?? null);
  const saldoSimple = aDerecha(primera("saldo"));

  const base = saldoOperacion ?? saldoSimple;
  if (!base) return null;
  const liq = saldoLiquidacion && saldoLiquidacion.x > base.x ? saldoLiquidacion : null;

  return {
    descripcion: primera("descripcion"),
    referencia: primera("referencia"),
    cargo,
    abono,
    saldo_operacion: base,
    saldo_liquidacion: liq,
    etiquetas: [cargo.etiqueta, abono.etiqueta, base.etiqueta, ...(liq ? [liq.etiqueta] : [])],
    dosNiveles: !!liq,
  };
}

function encabezadoDeRenglon(renglon: RenglonPdf, renglones: RenglonPdf[]): Encabezado | null {
  const propio = interpretarEncabezado(renglon.elementos);
  if (propio) return propio;
  const tocaEncabezado = renglon.elementos.some((e) =>
    cajasDeElemento(e).some((c) => c.clave === "cargo" || c.clave === "abono" || c.clave === "oper"),
  );
  if (!tocaEncabezado) return null;
  return interpretarEncabezado(elementosDeBloque(renglon, renglones));
}

// ── Columnas de importe ──────────────────────────────────────────────────────

type ColumnaImporteBbva = { clave: "cargo" | "abono" | "saldo_operacion" | "saldo_liquidacion"; ref: number };

function columnasDelEncabezado(enc: Encabezado): ColumnaDetectada[] {
  const cols: ColumnaDetectada[] = [
    { clave: "cargo", x: enc.cargo.x, xFin: enc.cargo.xFin, etiqueta: enc.cargo.etiqueta },
    { clave: "abono", x: enc.abono.x, xFin: enc.abono.xFin, etiqueta: enc.abono.etiqueta },
    { clave: "saldo_operacion", x: enc.saldo_operacion.x, xFin: enc.saldo_operacion.xFin, etiqueta: enc.saldo_operacion.etiqueta },
  ];
  if (enc.saldo_liquidacion) {
    cols.push({
      clave: "saldo_liquidacion",
      x: enc.saldo_liquidacion.x,
      xFin: enc.saldo_liquidacion.xFin,
      etiqueta: enc.saldo_liquidacion.etiqueta,
    });
  }
  return cols;
}

/**
 * BBVA imprime los importes alineados a la derecha. Cuando los bordes derechos
 * forman exactamente tantos grupos como columnas del encabezado, esos bordes
 * son la referencia más fiel (mucho más que la posición del rótulo). Si no,
 * se conserva la asignación por cercanía al rótulo.
 */
function columnasPorDatos(importes: ElementoPdf[], enc: Encabezado): ColumnaImporteBbva[] | null {
  const esperadas = columnasDelEncabezado(enc).map((c) => c.clave as ColumnaImporteBbva["clave"]);
  const bordes = importes.map((e) => e.x + e.ancho).sort((a, b) => a - b);
  if (bordes.length < esperadas.length * 2) return null;
  const grupos: number[][] = [];
  for (const b of bordes) {
    const ult = grupos[grupos.length - 1];
    if (ult && Math.abs(b - ult[ult.length - 1]) <= 2) ult.push(b);
    else grupos.push([b]);
  }
  const solidos = grupos.filter((g) => g.length >= 2);
  if (solidos.length !== esperadas.length) return null;
  const centros = solidos.map((g) => g.reduce((s, v) => s + v, 0) / g.length);
  for (let i = 1; i < centros.length; i += 1) if (centros[i] - centros[i - 1] < 8) return null;
  return esperadas.map((clave, i) => ({ clave, ref: centros[i] }));
}

function asignarPorBordeDerecho(
  el: ElementoPdf,
  cols: ColumnaImporteBbva[],
): { clave: ColumnaImporteBbva["clave"]; x: number } | null {
  const borde = el.x + el.ancho;
  let mejor = 0;
  let dist = Math.abs(borde - cols[0].ref);
  for (let i = 1; i < cols.length; i += 1) {
    const d = Math.abs(borde - cols[i].ref);
    if (d < dist) { mejor = i; dist = d; }
  }
  const gaps = cols.slice(1).map((c, i) => c.ref - cols[i].ref);
  const tolerancia = Math.min(gaps.length ? Math.min(...gaps) / 2 : 20, 20);
  if (dist > tolerancia) return null;
  return { clave: cols[mejor].clave, x: cols[mejor].ref };
}

// ── Totales impresos ─────────────────────────────────────────────────────────

type ResumenImpreso = TotalesResumen & { num_cargos: number | null; num_abonos: number | null };

const RE_SALDO_INICIAL = /^SALDO (ANTERIOR|INICIAL)$/;
const RE_SALDO_FINAL = /^SALDO FINAL$/;
const RE_TOT_ABONOS = /^(DEP[OÓ]SITOS? ?\/ ?ABONOS?( \(\+\))?|TOTAL(ES)? (DE )?ABONOS|TOTAL IMPORTE ABONOS)$/;
const RE_TOT_CARGOS = /^(RETIROS? ?\/ ?CARGOS?( \(-\))?|TOTAL(ES)? (DE )?CARGOS|TOTAL IMPORTE CARGOS)$/;

const RE_NUM_ABONOS = /^TOTAL MOVIMIENTOS ABONOS$/;
const RE_NUM_CARGOS = /^TOTAL MOVIMIENTOS CARGOS$/;

function resumenImpreso(renglones: RenglonPdf[]): ResumenImpreso {
  const out: ResumenImpreso = {
    cargos: null, abonos: null, saldo_inicial: null, saldo_final: null,
    num_cargos: null, num_abonos: null,
  };
  for (const r of renglones) {
    for (const el of r.elementos) {
      const t = normaliza(el.texto).replace(/:$/, "");
      const aLaDerecha = r.elementos.filter((o) => o.x > el.x + el.ancho / 2);
      const importe = aLaDerecha.find((o) => esImporte(o.texto));
      const entero = aLaDerecha.find((o) => /^\d{1,4}$/.test(o.texto.trim()));
      if (out.saldo_inicial == null && RE_SALDO_INICIAL.test(t) && importe) out.saldo_inicial = parseImporte(importe.texto);
      else if (out.saldo_final == null && RE_SALDO_FINAL.test(t) && importe) out.saldo_final = parseImporte(importe.texto);
      else if (out.abonos == null && RE_TOT_ABONOS.test(t) && importe) {
        out.abonos = Math.abs(parseImporte(importe.texto));
        if (entero) out.num_abonos = Number(entero.texto.trim());
      } else if (out.cargos == null && RE_TOT_CARGOS.test(t) && importe) {
        out.cargos = Math.abs(parseImporte(importe.texto));
        if (entero) out.num_cargos = Number(entero.texto.trim());
      } else if (out.num_abonos == null && RE_NUM_ABONOS.test(t) && entero) out.num_abonos = Number(entero.texto.trim());
      else if (out.num_cargos == null && RE_NUM_CARGOS.test(t) && entero) out.num_cargos = Number(entero.texto.trim());
    }
  }
  return out;
}

// ── Extracción ───────────────────────────────────────────────────────────────

function anioParaMes(mes: string, dia: string, periodo: { inicio: string; fin: string }): string | null {
  const candidatos = [...new Set([periodo.inicio.slice(0, 4), periodo.fin.slice(0, 4)])];
  for (const y of candidatos) {
    const iso = `${y}-${mes}-${dia}`;
    if (fechaIsoValida(iso) && iso >= periodo.inicio && iso <= periodo.fin) return y;
  }
  return null;
}

function esFilaIgnorable(texto: string): boolean {
  return NO_MOVIMIENTO.test(normaliza(texto));
}

function textoEnZona(r: RenglonPdf, desde: number, hasta: number): string {
  return r.elementos
    .filter((e) => e.x >= desde - 0.5 && centro(e.x, e.ancho) < hasta)
    .map((e) => e.texto.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function resultadoVacio(
  periodo: { inicio: string; fin: string } | null,
  problemas: ProblemaFila[],
  totales: TotalesResumen,
): ResultadoAdaptador {
  return {
    banco: "BBVA México",
    adaptador: "bbva-mx",
    version: BBVA_VERSION,
    huella: huellaFormato(["bbva-mx", "sin-encabezado"]),
    periodo: periodo ? periodo.fin.slice(0, 7) : null,
    periodo_inicio: periodo?.inicio ?? null,
    periodo_fin: periodo?.fin ?? null,
    confianza: "insuficiente",
    auto: false,
    movimientos: [],
    problemas,
    totales_resumen: totales,
    calculado: { filas: 0, cargos: 0, abonos: 0, saldo_inicial: null, saldo_final: null, diferencia: 0, orden: "desconocido" },
    limitaciones: adaptadorBbvaMx.limitaciones,
  };
}

function extraerBbva(renglones: RenglonPdf[], texto: string): ResultadoAdaptador {
  const problemas: ProblemaFila[] = [];
  const periodo = detectarPeriodoBbva(texto);
  const resumen = resumenImpreso(renglones);
  const totales: TotalesResumen = {
    cargos: resumen.cargos, abonos: resumen.abonos,
    saldo_inicial: resumen.saldo_inicial, saldo_final: resumen.saldo_final,
  };

  // 1) Encabezado (variante A o B). Sin él no se lee absolutamente nada.
  let enc: Encabezado | null = null;
  let iEnc = -1;
  for (let i = 0; i < renglones.length; i += 1) {
    const candidato = encabezadoDeRenglon(renglones[i], renglones);
    if (candidato) { enc = candidato; iEnc = i; break; }
  }
  if (!enc) {
    problemas.push({
      codigo: "SIN_ENCABEZADOS", pagina: null, fila_visual: null, texto: "",
      motivo: "No se localizaron los encabezados OPER / LIQ / CARGOS / ABONOS / SALDO.",
    });
    if (!periodo) {
      problemas.push({
        codigo: "PERIODO_NO_DETECTADO", pagina: null, fila_visual: null, texto: "",
        motivo: "No se encontró el periodo explícito del estado de cuenta.",
      });
    }
    return resultadoVacio(periodo, problemas, totales);
  }

  // 2) Cuerpo: del encabezado hasta "Total de Movimientos". Las coordenadas
  //    detectadas se conservan para las páginas continuadoras (BBVA no repite
  //    el encabezado en cada hoja).
  const cuerpo: RenglonPdf[] = [];
  let enBloqueEncabezado = true;
  for (let i = iEnc + 1; i < renglones.length; i += 1) {
    const r = renglones[i];
    if (RE_FIN_MOVIMIENTOS.test(normaliza(r.texto))) break;
    if (enBloqueEncabezado) {
      // El segundo nivel del encabezado (OPER/LIQ/CARGOS/ABONOS/…) sigue siendo
      // encabezado; el bloque termina en el primer renglón con datos.
      const tieneDato =
        r.elementos.some((e) => esImporte(e.texto)) ||
        r.elementos.some((e) => RE_FECHA_CORTA.test(normaliza(e.texto)));
      if (!tieneDato && r.elementos.some((e) => cajasDeElemento(e).length > 0)) continue;
      enBloqueEncabezado = false;
    }
    cuerpo.push(r);
  }


  const xNumIni = enc.cargo.x - 25;
  const importesDeRenglon = (r: RenglonPdf) =>
    r.elementos.filter((e) => esImporte(e.texto) && e.x + e.ancho >= xNumIni);

  const colsDatos = columnasPorDatos(cuerpo.flatMap(importesDeRenglon), enc);
  const colsEncabezado = columnasDelEncabezado(enc);
  const asignar = (el: ElementoPdf) =>
    colsDatos
      ? asignarPorBordeDerecho(el, colsDatos)
      : (asignarColumna(el, colsEncabezado) as { clave: ColumnaImporteBbva["clave"]; x: number } | null);

  // La zona de descripción arranca donde arranca su ELEMENTO de encabezado:
  // si el banco imprime "COD. DESCRIPCIÓN / REFERENCIA" como un solo texto,
  // no existen dos columnas y el corte debe ser el de los importes.
  const xDescIni = enc.descripcion?.xEl ?? 0;
  const xRefIni =
    enc.referencia && enc.descripcion && enc.referencia.xEl === enc.descripcion.xEl
      ? null
      : (enc.referencia?.xEl ?? null);
  const xDescFin = xRefIni ?? xNumIni;


  type Borrador = FilaBancaria & { _saldoEfectivo: number | null };
  const movimientos: Borrador[] = [];
  let actual: Borrador | null = null;

  for (const r of cuerpo) {
    // Encabezado repetido en otra página: se reconoce y se ignora.
    if (encabezadoDeRenglon(r, renglones)) { actual = null; continue; }
    if (esFilaIgnorable(r.texto)) { actual = null; continue; }

    const importesEl = importesDeRenglon(r);
    const fechas = r.elementos.filter(
      (e) => RE_FECHA_CORTA.test(normaliza(e.texto)) && (!enc.descripcion || e.x < enc.descripcion.x),
    );

    if (!fechas.length) {
      const enCargoAbono = importesEl.filter((e) => {
        const c = asignar(e);
        return c && (c.clave === "cargo" || c.clave === "abono");
      });
      if (enCargoAbono.length) {
        problemas.push({
          codigo: "IMPORTE_SIN_FECHA", pagina: r.pagina, fila_visual: r.indice,
          texto: "", motivo: "Hay un importe en columna de cargo/abono sin fecha de operación en el mismo renglón.",
        });
        actual = null;
        continue;
      }
      // Continuación de descripción / referencia del movimiento anterior.
      if (actual) {
        const d = textoEnZona(r, xDescIni, xDescFin);
        if (d) actual.descripcion = `${actual.descripcion} ${d}`.replace(/\s+/g, " ").trim().slice(0, 450);
        if (xRefIni != null) {
          const ref = textoEnZona(r, xRefIni, xNumIni).replace(/^REFERENCIA\s*/i, "").trim();
          if (ref) actual.referencia = `${actual.referencia ?? ""} ${ref}`.replace(/\s+/g, " ").trim().slice(0, 120);
        }
      }
      continue;
    }

    // ── Renglón de movimiento ────────────────────────────────────────────────
    actual = null;
    const mOper = normaliza(fechas[0].texto).match(RE_FECHA_CORTA)!;
    const mLiq = fechas[1] ? normaliza(fechas[1].texto).match(RE_FECHA_CORTA) : null;
    const mes = MESES_ABREV[mOper[2]];
    const dia = mOper[1].padStart(2, "0");

    if (!mes) {
      problemas.push({
        codigo: "FECHA_INVALIDA", pagina: r.pagina, fila_visual: r.indice,
        texto: "", motivo: `Mes no reconocido: ${mOper[2]}.`,
      });
      continue;
    }
    if (!periodo) {
      problemas.push({
        codigo: "PERIODO_NO_DETECTADO", pagina: r.pagina, fila_visual: r.indice,
        texto: "", motivo: "El estado de cuenta no declara un periodo del que pueda deducirse el año.",
      });
      continue;
    }
    const anio = anioParaMes(mes, dia, periodo);
    if (!anio) {
      problemas.push({
        codigo: "FECHA_FUERA_PERIODO", pagina: r.pagina, fila_visual: r.indice,
        texto: "", motivo: `La fecha ${dia}/${mOper[2]} no cae dentro del periodo ${periodo.inicio} a ${periodo.fin}.`,
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

    const asignados: Partial<Record<ColumnaImporteBbva["clave"], number>> = {};
    let sinColumna = false;
    let xCargoAbono: number | null = null;
    let xSaldo: number | null = null;
    for (const el of importesEl) {
      const col = asignar(el);
      if (!col) { sinColumna = true; continue; }
      const valor = parseImporte(el.texto);
      const esSaldo = col.clave === "saldo_operacion" || col.clave === "saldo_liquidacion";
      asignados[col.clave] = esSaldo ? valor : (asignados[col.clave] ?? 0) + Math.abs(valor);
      if (esSaldo) xSaldo = col.x;
      else xCargoAbono = col.x;
      if (col.clave === "abono" && valor < 0) {
        problemas.push({
          codigo: "DOBLE_SENTIDO", pagina: r.pagina, fila_visual: r.indice,
          texto: "", motivo: "El importe aparece bajo la columna de abonos pero viene con signo negativo.",
        });
      }
    }
    if (sinColumna) {
      problemas.push({
        codigo: "IMPORTE_SIN_COLUMNA", pagina: r.pagina, fila_visual: r.indice,
        texto: "", motivo: "Un importe no cae claramente bajo cargo, abono ni saldo.",
      });
      continue;
    }
    const cargo = asignados.cargo ?? 0;
    const abono = asignados.abono ?? 0;
    if (cargo > 0 && abono > 0) {
      problemas.push({
        codigo: "DOBLE_SENTIDO", pagina: r.pagina, fila_visual: r.indice,
        texto: "", motivo: "El renglón trae importe en cargo y en abono a la vez.",
      });
      continue;
    }
    if (cargo === 0 && abono === 0) {
      problemas.push({
        codigo: "SIN_IMPORTE", pagina: r.pagina, fila_visual: r.indice,
        texto: "", motivo: "El renglón tiene fecha pero ningún importe bajo cargo o abono.",
      });
      continue;
    }

    const inicioDesc = Math.max(xDescIni, ...fechas.map((e) => e.x + e.ancho));
    const descripcion = textoEnZona(r, inicioDesc, xDescFin);
    const refZona =
      xRefIni != null ? textoEnZona(r, xRefIni, xNumIni).replace(/^REFERENCIA\s*/i, "").trim() : "";
    const referencia =
      refZona || r.texto.match(/\b(?:REF(?:ERENCIA)?\.?\s*)([\w*]{4,20})\b/i)?.[1] || null;

    const saldoOperacion = asignados.saldo_operacion ?? null;
    const saldoLiquidacion = asignados.saldo_liquidacion ?? null;
    // El renglón se imprime en orden de FECHA DE OPERACIÓN: la cadena aritmética
    // debe recorrerse con el saldo de operación. El de liquidación se conserva
    // aparte y es el que se guarda como saldo del movimiento.
    const saldoCadena = saldoOperacion ?? saldoLiquidacion;

    const borrador: Borrador = {
      fecha,
      descripcion: (descripcion || "(sin descripción)").slice(0, 450),
      referencia: referencia ? referencia.slice(0, 120) : null,
      cargo,
      abono,
      saldo: saldoLiquidacion ?? saldoOperacion,
      saldo_operacion: saldoOperacion,
      saldo_liquidacion: saldoLiquidacion,
      traza: {
        pagina: r.pagina,
        fila_visual: r.indice,
        columna_importe: cargo > 0 ? "cargo" : "abono",
        x_columna: xCargoAbono ?? 0,
        x_saldo: xSaldo,
        texto_original: "",
        fecha_operacion: fecha,
        fecha_liquidacion: fechaLiq,
        evidencia_sentido: "columna",
      },
      _saldoEfectivo: saldoCadena,
    };


    movimientos.push(borrador);
    actual = borrador;
  }




  // 4) Comprobación matemática con SALDOS DISPERSOS: no se exige saldo por fila,
  //    se exige que cada tramo entre dos saldos impresos cuadre.
  const cargosCent = movimientos.reduce((s, m) => s + cent(m.cargo), 0);
  const abonosCent = movimientos.reduce((s, m) => s + cent(m.abono), 0);
  let orden: "ascendente" | "descendente" | "desconocido" = "desconocido";
  if (movimientos.length > 1) {
    orden = movimientos[0].fecha <= movimientos[movimientos.length - 1].fecha ? "ascendente" : "descendente";
  } else if (movimientos.length === 1) orden = "ascendente";

  const crono = orden === "descendente" ? [...movimientos].reverse() : movimientos;
  const efecto = (m: Borrador) => cent(m.abono) - cent(m.cargo);
  const puntos = crono
    .map((m, i) => ({ i, saldo: m._saldoEfectivo }))
    .filter((p): p is { i: number; saldo: number } => p.saldo != null);

  let saldoInicialCent: number | null = null;
  let saldoFinalCent: number | null = null;

  if (!movimientos.length) {
    problemas.push({
      codigo: "FORMATO_NO_RECONOCIDO", pagina: null, fila_visual: null, texto: "",
      motivo: "Se localizó el encabezado BBVA pero ningún renglón de movimiento verificable.",
    });
  } else if (!puntos.length) {
    problemas.push({
      codigo: "SIN_SALDOS", pagina: null, fila_visual: null, texto: "",
      motivo: "El PDF no imprime ningún saldo: la comprobación aritmética no puede hacerse.",
    });
  } else {
    let acum = 0;
    for (let k = 0; k <= puntos[0].i; k += 1) acum += efecto(crono[k]);
    saldoInicialCent = cent(puntos[0].saldo) - acum;

    for (let p = 1; p < puntos.length; p += 1) {
      let esperado = 0;
      for (let k = puntos[p - 1].i + 1; k <= puntos[p].i; k += 1) esperado += efecto(crono[k]);
      const delta = cent(puntos[p].saldo) - cent(puntos[p - 1].saldo);
      if (Math.abs(delta - esperado) > 1) {
        problemas.push({
          codigo: "CONTRADICCION_SALDO",
          pagina: crono[puntos[p].i].traza.pagina,
          fila_visual: crono[puntos[p].i].traza.fila_visual,
          texto: "",
          motivo: `Entre dos saldos impresos la variación (${pesos(delta).toFixed(2)}) no corresponde a los importes registrados (${pesos(esperado).toFixed(2)}).`,
        });
      } else {
        for (let k = puntos[p - 1].i + 1; k <= puntos[p].i; k += 1) {
          crono[k].traza.evidencia_sentido = "columna+saldo";
        }
      }
    }
    let cola = 0;
    for (let k = puntos[puntos.length - 1].i + 1; k < crono.length; k += 1) cola += efecto(crono[k]);
    saldoFinalCent = cent(puntos[puntos.length - 1].saldo) + cola;
  }

  // Corroboración textual: sólo alerta, y sólo cuando la aritmética NO probó el
  // renglón. La columna y el saldo mandan sobre cualquier palabra del concepto.
  for (const m of movimientos) {
    if (m.traza.evidencia_sentido === "columna+saldo") continue;
    const desc = normaliza(m.descripcion);
    const sugerido = PALABRAS_CARGO.test(desc) ? "cargo" : PALABRAS_ABONO.test(desc) ? "abono" : null;
    if (sugerido && (sugerido === "cargo") !== (m.cargo > 0)) {
      problemas.push({
        codigo: "CONTRADICCION_DESCRIPCION", pagina: m.traza.pagina, fila_visual: m.traza.fila_visual,
        texto: "",
        motivo: `El importe está bajo la columna de ${m.cargo > 0 ? "cargos" : "abonos"} pero el concepto describe un ${sugerido}.`,
      });
    }
  }


  const diferenciaCent =
    saldoInicialCent == null || saldoFinalCent == null
      ? 0
      : saldoInicialCent + abonosCent - cargosCent - saldoFinalCent;
  if (Math.abs(diferenciaCent) > 1) {
    problemas.push({
      codigo: "ECUACION_SALDOS", pagina: null, fila_visual: null, texto: "",
      motivo: `Saldo inicial + abonos − cargos no coincide con el saldo final. Diferencia: ${pesos(diferenciaCent).toFixed(2)}.`,
    });
  }

  const compara = (etiqueta: string, impresoCent: number | null, calculadoCent: number | null) => {
    if (impresoCent == null || calculadoCent == null) return;
    if (Math.abs(impresoCent - calculadoCent) > 1) {
      problemas.push({
        codigo: "TOTALES_RESUMEN", pagina: null, fila_visual: null, texto: "",
        motivo: `El resumen impreso de ${etiqueta} (${pesos(impresoCent).toFixed(2)}) no coincide con lo leído (${pesos(calculadoCent).toFixed(2)}).`,
      });
    }
  };
  compara("cargos", totales.cargos == null ? null : cent(totales.cargos), cargosCent);
  compara("abonos", totales.abonos == null ? null : cent(totales.abonos), abonosCent);
  compara("saldo inicial", totales.saldo_inicial == null ? null : cent(totales.saldo_inicial), saldoInicialCent);
  compara("saldo final", totales.saldo_final == null ? null : cent(totales.saldo_final), saldoFinalCent);

  const numCargos = movimientos.filter((m) => m.cargo > 0).length;
  const numAbonos = movimientos.filter((m) => m.abono > 0).length;
  if (resumen.num_cargos != null && resumen.num_cargos !== numCargos) {
    problemas.push({
      codigo: "TOTALES_RESUMEN", pagina: null, fila_visual: null, texto: "",
      motivo: `El estado de cuenta declara ${resumen.num_cargos} cargos y se leyeron ${numCargos}.`,
    });
  }
  if (resumen.num_abonos != null && resumen.num_abonos !== numAbonos) {
    problemas.push({
      codigo: "TOTALES_RESUMEN", pagina: null, fila_visual: null, texto: "",
      motivo: `El estado de cuenta declara ${resumen.num_abonos} abonos y se leyeron ${numAbonos}.`,
    });
  }

  if (!periodo) {
    problemas.push({
      codigo: "PERIODO_NO_DETECTADO", pagina: null, fila_visual: null, texto: "",
      motivo: "No se encontró el periodo explícito del estado de cuenta.",
    });
  }

  const auto = problemas.length === 0 && movimientos.length > 0 && puntos.length > 0 && !!periodo;
  return {
    banco: "BBVA México",
    adaptador: "bbva-mx",
    version: BBVA_VERSION,
    huella: huellaFormato(["bbva-mx", ...enc.etiquetas, enc.dosNiveles ? "2n" : "1n"]),
    periodo: periodo ? periodo.fin.slice(0, 7) : null,
    periodo_inicio: periodo?.inicio ?? null,
    periodo_fin: periodo?.fin ?? null,
    confianza: auto ? "alta" : movimientos.length ? "revision" : "insuficiente",
    auto,
    movimientos: movimientos.map(({ _saldoEfectivo, ...m }) => m),
    problemas,
    totales_resumen: totales,
    calculado: {
      filas: movimientos.length,
      cargos: pesos(cargosCent),
      abonos: pesos(abonosCent),
      saldo_inicial: saldoInicialCent == null ? null : pesos(saldoInicialCent),
      saldo_final: saldoFinalCent == null ? null : pesos(saldoFinalCent),
      diferencia: pesos(diferenciaCent),
      orden,
    },
    limitaciones: adaptadorBbvaMx.limitaciones,
  };
}

export const adaptadorBbvaMx: AdaptadorBancario = {
  banco: "BBVA México",
  adaptador: "bbva-mx",
  version: BBVA_VERSION,
  encabezados_esperados: ["OPER", "LIQ", "DESCRIPCIÓN", "REFERENCIA", "CARGOS", "ABONOS", "SALDO OPERACIÓN", "SALDO LIQUIDACIÓN"],
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
    if (renglones.some((r) => encabezadoDeRenglon(r, renglones) !== null)) score += 4;
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
