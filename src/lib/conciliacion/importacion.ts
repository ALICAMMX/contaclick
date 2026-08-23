// ─────────────────────────────────────────────────────────────────────────────
// IMPORTACIÓN BANCARIA SEGURA — lógica determinista y pura
//
// Este módulo NO toca base de datos ni red: recibe las filas interpretadas por
// el lector de archivos y devuelve el resumen que ve el contador y las
// incidencias que bloquean la confirmación. Se prueba sin infraestructura.
// ─────────────────────────────────────────────────────────────────────────────

/** Cambiar esta versión invalida cualquier vista previa pendiente. */
export const PARSER_VERSION = "banco-2026.08.24";

export const ESTADOS_IMPORTACION = [
  "procesando",
  "pendiente_validacion",
  "validada",
  "rechazada",
  "fallida",
] as const;
export type EstadoImportacion = (typeof ESTADOS_IMPORTACION)[number];

export const ETIQUETA_ESTADO_IMPORTACION: Record<EstadoImportacion, string> = {
  procesando: "Procesando",
  pendiente_validacion: "Pendiente de validación",
  validada: "Validada",
  rechazada: "Rechazada",
  fallida: "Fallida",
};

export type FilaImportacion = {
  fecha: string;
  descripcion: string;
  referencia: string | null;
  cargo: number;
  abono: number;
  saldo: number | null;
  moneda?: string | null;
};

export type CodigoIncidencia =
  | "ARCHIVO_VACIO"
  | "PERIODO_NO_IDENTIFICABLE"
  | "CUENTA_NO_SELECCIONADA"
  | "FECHA_INVALIDA"
  | "FECHA_FUERA_PERIODO"
  | "SENTIDO_DOBLE"
  | "SENTIDO_CERO"
  | "SENTIDO_AMBIGUO"
  | "CONTRADICCION_DESCRIPCION"
  | "CONTRADICCION_SALDO"
  | "ECUACION_SALDOS"
  | "SIN_COLUMNA_SALDO"
  | "DUPLICADO_ENTRE_ARCHIVOS";

export type Incidencia = {
  codigo: CodigoIncidencia;
  severidad: "bloqueo" | "aviso";
  fila: number | null;
  mensaje: string;
};

export type ResumenImportacion = {
  movimientos: number;
  fecha_min: string | null;
  fecha_max: string | null;
  cargos_num: number;
  cargos_centavos: number;
  abonos_num: number;
  abonos_centavos: number;
  saldo_inicial_centavos: number | null;
  saldo_final_centavos: number | null;
  ecuacion_evaluable: boolean;
  ecuacion_cuadra: boolean;
  diferencia_centavos: number | null;
  ambiguos: number;
  fuera_periodo: number;
};

export type AnalisisImportacion = {
  resumen: ResumenImportacion;
  incidencias: Incidencia[];
  bloqueada: boolean;
  parser_version: string;
};

export function aCentavos(n: unknown): number {
  return Math.round((Number(n) || 0) * 100);
}

export function esFechaIsoValida(s: string): boolean {
  const m = (s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > new Date().getFullYear() + 1) return false;
  if (mo < 1 || mo > 12) return false;
  return d >= 1 && d <= new Date(y, mo, 0).getDate();
}

const PALABRAS_CARGO =
  /(\bretiro\b|\bcargo(?:s)?\b|\bd[eé]bito\b|\bspei\s+enviad|\btransferencia\s+enviad|\bcompra\b|\bcomisi[oó]n\b|\bdisposici[oó]n\b|\bpago\s+(?:a|de|tarjeta|proveedor|servicio|tercero))/i;
const PALABRAS_ABONO =
  /(\babono(?:s)?\b|\bdep[oó]sito(?:s)?\b|\bspei\s+recibid|\btransferencia\s+recibid|\bn[oó]mina\b|\bcr[eé]dito\b|\bintereses?\s+(?:pagad|abonad))/i;

/** Sentido que sugiere el texto del concepto. Sólo sirve para corroborar. */
export function sentidoPorDescripcion(descripcion: string): "cargo" | "abono" | null {
  const texto = descripcion ?? "";
  const cargo = PALABRAS_CARGO.test(texto);
  const abono = PALABRAS_ABONO.test(texto);
  if (cargo === abono) return null;
  return cargo ? "cargo" : "abono";
}

/** Periodo AAAA-MM dominante en las filas; null si no puede determinarse. */
export function periodoDominante(filas: FilaImportacion[]): string | null {
  const conteo = new Map<string, number>();
  for (const f of filas) {
    if (!esFechaIsoValida(f.fecha)) continue;
    const p = f.fecha.slice(0, 7);
    conteo.set(p, (conteo.get(p) ?? 0) + 1);
  }
  if (!conteo.size) return null;
  return [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/**
 * Serialización canónica de las filas interpretadas. La huella de este texto
 * garantiza que la confirmación incorpore exactamente lo que se mostró.
 */
export function serializacionCanonica(filas: FilaImportacion[]): string {
  return filas
    .map((f, i) =>
      [
        i + 1,
        f.fecha,
        aCentavos(f.cargo),
        aCentavos(f.abono),
        f.saldo == null ? "" : aCentavos(f.saldo),
        (f.descripcion ?? "").replace(/\|/g, "/"),
        (f.referencia ?? "").replace(/\|/g, "/"),
      ].join("|"),
    )
    .join("\n");
}

export function analizarImportacion(input: {
  movimientos: FilaImportacion[];
  periodo_declarado: string | null;
  cuenta_seleccionada?: boolean;
}): AnalisisImportacion {
  const filas = input.movimientos ?? [];
  const incidencias: Incidencia[] = [];
  const push = (i: Incidencia) => incidencias.push(i);

  if (input.cuenta_seleccionada === false) {
    push({
      codigo: "CUENTA_NO_SELECCIONADA",
      severidad: "bloqueo",
      fila: null,
      mensaje: "Selecciona la cuenta bancaria a la que pertenece el estado de cuenta.",
    });
  }

  if (!filas.length) {
    push({
      codigo: "ARCHIVO_VACIO",
      severidad: "bloqueo",
      fila: null,
      mensaje: "El archivo no contiene movimientos legibles.",
    });
  }

  const periodo = input.periodo_declarado ?? periodoDominante(filas);
  if (!periodo || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    push({
      codigo: "PERIODO_NO_IDENTIFICABLE",
      severidad: "bloqueo",
      fila: null,
      mensaje: "No se pudo determinar el periodo del estado de cuenta.",
    });
  }

  let cargosNum = 0;
  let cargosCent = 0;
  let abonosNum = 0;
  let abonosCent = 0;
  let ambiguos = 0;
  let fueraPeriodo = 0;
  const fechasValidas: string[] = [];

  filas.forEach((f, idx) => {
    const fila = idx + 1;
    const cargo = aCentavos(f.cargo);
    const abono = aCentavos(f.abono);

    if (!esFechaIsoValida(f.fecha)) {
      push({
        codigo: "FECHA_INVALIDA",
        severidad: "bloqueo",
        fila,
        mensaje: `Fila ${fila}: la fecha "${f.fecha}" no es una fecha válida.`,
      });
    } else {
      fechasValidas.push(f.fecha);
      if (periodo && f.fecha.slice(0, 7) !== periodo) {
        fueraPeriodo += 1;
        push({
          codigo: "FECHA_FUERA_PERIODO",
          severidad: "bloqueo",
          fila,
          mensaje: `Fila ${fila}: la fecha ${f.fecha} queda fuera del periodo declarado ${periodo}.`,
        });
      }
    }

    if (cargo > 0 && abono > 0) {
      push({
        codigo: "SENTIDO_DOBLE",
        severidad: "bloqueo",
        fila,
        mensaje: `Fila ${fila}: el movimiento trae cargo y abono al mismo tiempo.`,
      });
      ambiguos += 1;
    } else if (cargo === 0 && abono === 0) {
      push({
        codigo: "SENTIDO_CERO",
        severidad: "bloqueo",
        fila,
        mensaje: `Fila ${fila}: el movimiento no tiene importe ni de cargo ni de abono.`,
      });
      ambiguos += 1;
    } else if (cargo < 0 || abono < 0) {
      push({
        codigo: "SENTIDO_AMBIGUO",
        severidad: "bloqueo",
        fila,
        mensaje: `Fila ${fila}: el importe es negativo y su sentido no puede determinarse.`,
      });
      ambiguos += 1;
    } else {
      const sentido = cargo > 0 ? "cargo" : "abono";
      if (sentido === "cargo") {
        cargosNum += 1;
        cargosCent += cargo;
      } else {
        abonosNum += 1;
        abonosCent += abono;
      }
      const sugerido = sentidoPorDescripcion(f.descripcion ?? "");
      if (sugerido && sugerido !== sentido) {
        push({
          codigo: "CONTRADICCION_DESCRIPCION",
          severidad: "bloqueo",
          fila,
          mensaje: `Fila ${fila}: la columna dice ${sentido === "cargo" ? "cargo" : "depósito"} pero el concepto describe un ${sugerido === "cargo" ? "cargo" : "depósito"}.`,
        });
        ambiguos += 1;
      }
    }
  });

  // ── Ecuación bancaria y coherencia del saldo ───────────────────────────────
  const conSaldo = filas.every((f) => f.saldo != null && Number.isFinite(Number(f.saldo)));
  let saldoInicial: number | null = null;
  let saldoFinal: number | null = null;
  let diferencia: number | null = null;
  let ecuacionCuadra = false;

  if (!conSaldo) {
    push({
      codigo: "SIN_COLUMNA_SALDO",
      severidad: "aviso",
      fila: null,
      mensaje:
        "El archivo no trae saldo en todas las filas: la comprobación aritmética contra el estado de cuenta no puede hacerse automáticamente.",
    });
  } else if (filas.length) {
    // El recorrido se hace en orden cronológico real, sin importar cómo venga impreso.
    const orden = filas.map((f, i) => ({ f, i }));
    const descendente =
      orden.length > 1 && esFechaIsoValida(orden[0].f.fecha) &&
      esFechaIsoValida(orden[orden.length - 1].f.fecha) &&
      orden[0].f.fecha > orden[orden.length - 1].f.fecha;
    const crono = descendente ? [...orden].reverse() : orden;

    const efecto = (f: FilaImportacion) => aCentavos(f.abono) - aCentavos(f.cargo);
    saldoInicial = aCentavos(crono[0].f.saldo) - efecto(crono[0].f);
    saldoFinal = aCentavos(crono[crono.length - 1].f.saldo);

    for (let k = 1; k < crono.length; k += 1) {
      const delta = aCentavos(crono[k].f.saldo) - aCentavos(crono[k - 1].f.saldo);
      const esperado = efecto(crono[k].f);
      if (Math.abs(delta - esperado) > 1) {
        push({
          codigo: "CONTRADICCION_SALDO",
          severidad: "bloqueo",
          fila: crono[k].i + 1,
          mensaje: `Fila ${crono[k].i + 1}: la variación del saldo (${(delta / 100).toFixed(2)}) no corresponde al importe registrado (${(esperado / 100).toFixed(2)}).`,
        });
        ambiguos += 1;
      }
    }

    diferencia = saldoInicial + abonosCent - cargosCent - saldoFinal;
    ecuacionCuadra = Math.abs(diferencia) <= 1;
    if (!ecuacionCuadra) {
      push({
        codigo: "ECUACION_SALDOS",
        severidad: "bloqueo",
        fila: null,
        mensaje: `La ecuación saldo inicial + abonos − cargos no coincide con el saldo final. Diferencia: ${(diferencia / 100).toFixed(2)}.`,
      });
    }
  }

  fechasValidas.sort();
  const resumen: ResumenImportacion = {
    movimientos: filas.length,
    fecha_min: fechasValidas[0] ?? null,
    fecha_max: fechasValidas[fechasValidas.length - 1] ?? null,
    cargos_num: cargosNum,
    cargos_centavos: cargosCent,
    abonos_num: abonosNum,
    abonos_centavos: abonosCent,
    saldo_inicial_centavos: saldoInicial,
    saldo_final_centavos: saldoFinal,
    ecuacion_evaluable: conSaldo && filas.length > 0,
    ecuacion_cuadra: ecuacionCuadra,
    diferencia_centavos: diferencia,
    ambiguos,
    fuera_periodo: fueraPeriodo,
  };

  return {
    resumen,
    incidencias,
    bloqueada: incidencias.some((i) => i.severidad === "bloqueo"),
    parser_version: PARSER_VERSION,
  };
}

/** Conteo de incidencias por código, apto para soporte (no lleva datos del cliente). */
export function incidenciasPorCodigo(incidencias: Incidencia[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of incidencias) out[i.codigo] = (out[i.codigo] ?? 0) + 1;
  return out;
}
