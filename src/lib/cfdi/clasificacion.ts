// ─────────────────────────────────────────────────────────────────────────────
// CLASIFICACIÓN DOCUMENTAL DEL CFDI — servicio PURO y ÚNICO.
//
// Determina dirección, tipo real, método de pago, estado SAT y estado de
// procesamiento a partir de HECHOS del comprobante. No depende de textos de la
// interfaz, no consulta la base y NUNCA usa IA.
// ─────────────────────────────────────────────────────────────────────────────

export type Direccion = "emitido" | "recibido" | "ajeno";

export type ClaseDocumental =
  | "ingreso"
  | "gasto"
  | "nota_credito_emitida"
  | "nota_credito_recibida"
  | "nomina"
  | "pago"
  | "traslado"
  | "indeterminado";

export type EstadoRelacion =
  | "no_aplica"
  | "completo"
  | "padre_faltante"
  | "pago_huerfano"
  | "relacion_inconsistente"
  | "ppd_sin_complemento";

export type EstadoProcesamiento = "listo" | "requiere_revision" | "rechazado";

export type MotivoCodigo =
  | "RFC_AJENO"
  | "SIN_UUID"
  | "SIN_RFC"
  | "TIPO_DESCONOCIDO"
  | "ESTATUS_SAT_DESCONOCIDO"
  | "CANCELADO_SAT"
  | "DETALLE_NO_RECONSTRUIBLE"
  | "PPD_SIN_COMPLEMENTO"
  | "PAGO_HUERFANO"
  | "PAGO_PADRE_FALTANTE"
  | "PAGO_EMISOR_INCONSISTENTE"
  | "PAGO_MONTO_INCONSISTENTE"
  | "DUPLICADO"
  | "PARSEO_INCOMPLETO";

export type Motivo = { codigo: MotivoCodigo; mensaje: string };

export type DocumentoParaClasificar = {
  uuid: string | null;
  tipo_cfdi: string | null;
  rfc_emisor: string | null;
  rfc_receptor: string | null;
  metodo_pago: string | null;
  estatus_sat: string | null;
  detalle_reconstruible?: boolean;
  /** Avisos del normalizador, si los hubo. */
  avisos?: string[];
};

export type ResultadoClasificacion = {
  direccion: Direccion;
  clase: ClaseDocumental;
  metodo: "PUE" | "PPD" | "no_aplica" | "desconocido";
  estatus_sat: "vigente" | "cancelado" | "desconocido";
  fuente_estatus: "consulta_sat" | "sin_evidencia";
  estado_procesamiento: EstadoProcesamiento;
  motivos: Motivo[];
};

const norm = (v: string | null | undefined) => String(v ?? "").trim().toUpperCase();

/** Clasificación de un documento aislado (sin mirar el resto del periodo). */
export function clasificarDocumento(
  doc: DocumentoParaClasificar,
  ctx: { rfcExpediente: string },
): ResultadoClasificacion {
  const motivos: Motivo[] = [];
  const rfcExp = norm(ctx.rfcExpediente);
  const emisor = norm(doc.rfc_emisor);
  const receptor = norm(doc.rfc_receptor);
  const tipo = norm(doc.tipo_cfdi);

  let direccion: Direccion = "ajeno";
  if (rfcExp && emisor === rfcExp) direccion = "emitido";
  else if (rfcExp && receptor === rfcExp) direccion = "recibido";

  if (!emisor || !receptor) {
    motivos.push({ codigo: "SIN_RFC", mensaje: "El comprobante no declara RFC de emisor o receptor." });
  }
  if (!doc.uuid) {
    motivos.push({ codigo: "SIN_UUID", mensaje: "El comprobante no tiene UUID: no está timbrado o el timbre no se pudo leer." });
  }
  if (direccion === "ajeno") {
    motivos.push({
      codigo: "RFC_AJENO",
      mensaje: `Ni el emisor (${emisor || "—"}) ni el receptor (${receptor || "—"}) corresponden al RFC del expediente (${rfcExp || "—"}).`,
    });
  }

  let clase: ClaseDocumental = "indeterminado";
  switch (tipo) {
    case "I":
      clase = direccion === "emitido" ? "ingreso" : "gasto";
      break;
    case "E":
      clase = direccion === "emitido" ? "nota_credito_emitida" : "nota_credito_recibida";
      break;
    case "N":
      clase = "nomina";
      break;
    case "P":
      clase = "pago";
      break;
    case "T":
      clase = "traslado";
      break;
    default:
      motivos.push({ codigo: "TIPO_DESCONOCIDO", mensaje: `Tipo de comprobante no reconocido: "${tipo || "—"}".` });
  }

  const metodoRaw = norm(doc.metodo_pago);
  const metodo: ResultadoClasificacion["metodo"] =
    metodoRaw === "PUE" ? "PUE" : metodoRaw === "PPD" ? "PPD" : tipo === "P" || tipo === "N" || tipo === "T" ? "no_aplica" : "desconocido";

  const estRaw = String(doc.estatus_sat ?? "").toLowerCase();
  const estatus_sat = estRaw === "vigente" ? "vigente" : estRaw === "cancelado" ? "cancelado" : "desconocido";
  const fuente_estatus = estatus_sat === "desconocido" ? "sin_evidencia" : "consulta_sat";
  if (estatus_sat === "desconocido") {
    motivos.push({ codigo: "ESTATUS_SAT_DESCONOCIDO", mensaje: "No hay evidencia de consulta del estado en el SAT para este comprobante." });
  }
  if (estatus_sat === "cancelado") {
    motivos.push({ codigo: "CANCELADO_SAT", mensaje: "El comprobante está cancelado en el SAT." });
  }
  if (doc.detalle_reconstruible === false) {
    motivos.push({
      codigo: "DETALLE_NO_RECONSTRUIBLE",
      mensaje: "El XML original no está disponible: no puede reconstruirse el detalle de impuestos ni el complemento de pagos.",
    });
  }
  for (const aviso of doc.avisos ?? []) {
    motivos.push({ codigo: "PARSEO_INCOMPLETO", mensaje: aviso });
  }

  const rechazado = motivos.some((m) => m.codigo === "SIN_UUID" || m.codigo === "SIN_RFC" || m.codigo === "RFC_AJENO");
  const revisar = motivos.some((m) =>
    m.codigo === "ESTATUS_SAT_DESCONOCIDO" ||
    m.codigo === "CANCELADO_SAT" ||
    m.codigo === "TIPO_DESCONOCIDO" ||
    m.codigo === "DETALLE_NO_RECONSTRUIBLE" ||
    m.codigo === "PARSEO_INCOMPLETO",
  );

  return {
    direccion,
    clase,
    metodo,
    estatus_sat,
    fuente_estatus,
    estado_procesamiento: rechazado ? "rechazado" : revisar ? "requiere_revision" : "listo",
    motivos,
  };
}

export const ETIQUETA_CLASE: Record<ClaseDocumental, string> = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  nota_credito_emitida: "Nota de crédito emitida",
  nota_credito_recibida: "Nota de crédito recibida",
  nomina: "Nómina",
  pago: "Complemento de pago",
  traslado: "Traslado",
  indeterminado: "Sin clasificar",
};
