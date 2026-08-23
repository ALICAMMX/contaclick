// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO DE ADAPTADORES BANCARIOS (lectura posicional de PDF)
//
// Un adaptador NUNCA adivina: o demuestra fechas, sentido, importes y saldos,
// o devuelve el problema que impide importar. La IA/OCR jamás deciden si un
// importe es cargo o abono.
// ─────────────────────────────────────────────────────────────────────────────

/** Elemento de texto tal como lo entrega el PDF, con su posición real. */
export type ElementoPdf = {
  pagina: number;
  texto: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
};

/** Renglón visual: elementos agrupados por proximidad de Y, conservando X. */
export type RenglonPdf = {
  pagina: number;
  y: number;
  indice: number;
  elementos: ElementoPdf[];
  texto: string;
};

export type ColumnaImporte = "cargo" | "abono" | "saldo";

export type TrazaFila = {
  pagina: number;
  fila_visual: number;
  columna_importe: Exclude<ColumnaImporte, "saldo">;
  x_columna: number;
  x_saldo: number | null;
  texto_original: string;
  fecha_operacion: string;
  fecha_liquidacion: string | null;
  evidencia_sentido: "columna" | "columna+saldo";
};

export type FilaBancaria = {
  fecha: string;
  descripcion: string;
  referencia: string | null;
  cargo: number;
  abono: number;
  /** Saldo usado para validar: liquidación si existe, si no operación. */
  saldo: number | null;
  /** BBVA imprime dos columnas de saldo; se conservan por separado. */
  saldo_operacion?: number | null;
  saldo_liquidacion?: number | null;
  traza: TrazaFila;
};


export type CodigoProblema =
  | "PERIODO_NO_DETECTADO"
  | "SIN_ENCABEZADOS"
  | "IMPORTE_SIN_COLUMNA"
  | "IMPORTE_SIN_FECHA"
  | "SIN_IMPORTE"
  | "DOBLE_SENTIDO"
  | "FECHA_INVALIDA"
  | "FECHA_FUERA_PERIODO"
  | "CONTRADICCION_SALDO"
  | "CONTRADICCION_DESCRIPCION"
  | "ECUACION_SALDOS"
  | "TOTALES_RESUMEN"
  | "SIN_SALDOS"
  | "PDF_ESCANEADO"
  | "FORMATO_NO_RECONOCIDO";

export type ProblemaFila = {
  codigo: CodigoProblema;
  pagina: number | null;
  fila_visual: number | null;
  texto: string;
  motivo: string;
};

export type TotalesResumen = {
  cargos: number | null;
  abonos: number | null;
  saldo_inicial: number | null;
  saldo_final: number | null;
};

export type NivelConfianza = "alta" | "revision" | "insuficiente";

export type ResultadoAdaptador = {
  banco: string;
  adaptador: string;
  version: string;
  huella: string;
  periodo: string | null;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  confianza: NivelConfianza;
  /** Sólo true cuando TODO está demostrado matemáticamente. */
  auto: boolean;
  movimientos: FilaBancaria[];
  problemas: ProblemaFila[];
  totales_resumen: TotalesResumen;
  calculado: {
    filas: number;
    cargos: number;
    abonos: number;
    saldo_inicial: number | null;
    saldo_final: number | null;
    diferencia: number;
    orden: "ascendente" | "descendente" | "desconocido";
  };
  limitaciones: string[];
};

export type AdaptadorBancario = {
  banco: string;
  adaptador: string;
  version: string;
  encabezados_esperados: string[];
  limitaciones: string[];
  /** Puntaje de detección por señales combinadas (no sólo el nombre del banco). */
  detectar(renglones: RenglonPdf[], texto: string): number;
  extraer(renglones: RenglonPdf[], texto: string): ResultadoAdaptador;
};
