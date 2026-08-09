// Catálogo ÚNICO de motivos de excepción documental del cierre mensual.
// Cada código tiene severidad fija y un mensaje entendible para el contador.

export type SeveridadExcepcion = "bloqueante" | "advertencia" | "informativa";

export type CodigoExcepcion =
  | "PARSEO_FALLIDO"
  | "RFC_AJENO"
  | "DUPLICADO"
  | "PAGO_HUERFANO"
  | "PAGO_PADRE_FALTANTE"
  | "PAGO_EMISOR_INCONSISTENTE"
  | "PAGO_MONTO_INCONSISTENTE"
  | "PPD_SIN_COMPLEMENTO"
  | "CANCELADO_SAT"
  | "ESTATUS_SAT_DESCONOCIDO"
  | "DETALLE_NO_RECONSTRUIBLE"
  | "CORTE_NO_DOCUMENTADO";

export type DefinicionExcepcion = {
  codigo: CodigoExcepcion;
  severidad: SeveridadExcepcion;
  titulo: string;
  quePasa: string;
  queHacer: string;
  /** Impide declarar la etapa documental lista mientras siga pendiente. */
  bloquea: boolean;
};

export const MOTIVOS_EXCEPCION: Record<CodigoExcepcion, DefinicionExcepcion> = {
  PARSEO_FALLIDO: {
    codigo: "PARSEO_FALLIDO",
    severidad: "bloqueante",
    titulo: "El XML no pudo leerse por completo",
    quePasa: "Falta el UUID, el RFC del emisor o el del receptor.",
    queHacer: "Vuelve a cargar el XML original o solicítalo al emisor.",
    bloquea: true,
  },
  RFC_AJENO: {
    codigo: "RFC_AJENO",
    severidad: "bloqueante",
    titulo: "CFDI ajeno al expediente",
    quePasa: "Ni el emisor ni el receptor corresponden al RFC del expediente activo.",
    queHacer: "Muévelo al expediente correcto o acéptalo con motivo si su presencia está justificada.",
    bloquea: true,
  },
  DUPLICADO: {
    codigo: "DUPLICADO",
    severidad: "bloqueante",
    titulo: "Comprobante duplicado",
    quePasa: "El mismo UUID o el mismo archivo existe más de una vez en el expediente.",
    queHacer: "Decide cuál conservar. Mientras no haya decisión, los importes del periodo pueden estar inflados.",
    bloquea: true,
  },
  PAGO_HUERFANO: {
    codigo: "PAGO_HUERFANO",
    severidad: "bloqueante",
    titulo: "Complemento de pago sin factura padre",
    quePasa: "El complemento paga un UUID que no existe en el expediente.",
    queHacer: "Descarga o carga la factura padre, o acepta la excepción indicando por qué no está disponible.",
    bloquea: true,
  },
  PAGO_PADRE_FALTANTE: {
    codigo: "PAGO_PADRE_FALTANTE",
    severidad: "bloqueante",
    titulo: "Factura padre fuera del expediente",
    quePasa: "El UUID pagado existe pero no está vinculado a este expediente.",
    queHacer: "Verifica el expediente al que pertenece la factura padre.",
    bloquea: true,
  },
  PAGO_EMISOR_INCONSISTENTE: {
    codigo: "PAGO_EMISOR_INCONSISTENTE",
    severidad: "bloqueante",
    titulo: "Relación de pago inconsistente",
    quePasa: "El emisor del complemento no coincide con el emisor de la factura pagada.",
    queHacer: "Confirma con el emisor. Un pago mal aplicado altera cuentas por cobrar y por pagar.",
    bloquea: true,
  },
  PAGO_MONTO_INCONSISTENTE: {
    codigo: "PAGO_MONTO_INCONSISTENTE",
    severidad: "bloqueante",
    titulo: "Importes del pago inconsistentes",
    quePasa: "El importe pagado no cuadra con el saldo anterior y el saldo insoluto declarados.",
    queHacer: "Revisa la parcialidad. Si el complemento es correcto, acepta la excepción con motivo.",
    bloquea: true,
  },
  PPD_SIN_COMPLEMENTO: {
    codigo: "PPD_SIN_COMPLEMENTO",
    severidad: "advertencia",
    titulo: "Factura PPD sin complemento de pago",
    quePasa: "La factura se emitió en parcialidades o diferido y aún no tiene complemento relacionado.",
    queHacer: "Es normal si el pago aún no ocurre. Si ya se cobró, exige o emite el complemento.",
    bloquea: false,
  },
  CANCELADO_SAT: {
    codigo: "CANCELADO_SAT",
    severidad: "advertencia",
    titulo: "Comprobante cancelado en el SAT",
    quePasa: "El comprobante está cancelado y no debe considerarse en la determinación.",
    queHacer: "Confirma que no se registró en contabilidad.",
    bloquea: false,
  },
  ESTATUS_SAT_DESCONOCIDO: {
    codigo: "ESTATUS_SAT_DESCONOCIDO",
    severidad: "informativa",
    titulo: "Comprobantes sin verificación de estado en el SAT",
    quePasa: "No hay evidencia de consulta del estado vigente/cancelado.",
    queHacer: "Ejecuta la verificación de estado antes de la determinación definitiva.",
    bloquea: false,
  },
  DETALLE_NO_RECONSTRUIBLE: {
    codigo: "DETALLE_NO_RECONSTRUIBLE",
    severidad: "informativa",
    titulo: "Detalle no reconstruible",
    quePasa: "Se conserva el registro del CFDI pero no el XML original, por lo que no puede extraerse el detalle de impuestos ni el complemento de pagos.",
    queHacer: "Vuelve a cargar el XML original si lo conservas. ContaClick no inventa pagos, impuestos ni relaciones.",
    bloquea: false,
  },
  CORTE_NO_DOCUMENTADO: {
    codigo: "CORTE_NO_DOCUMENTADO",
    severidad: "bloqueante",
    titulo: "Falta documentar el corte del periodo",
    quePasa: "No se registró la fecha de corte ni las direcciones descargadas (emitidos y/o recibidos).",
    queHacer: "Registra el corte desde el Centro de cierre mensual antes de declarar la etapa documental.",
    bloquea: true,
  },
};

export function definicion(codigo: string): DefinicionExcepcion | undefined {
  return MOTIVOS_EXCEPCION[codigo as CodigoExcepcion];
}
