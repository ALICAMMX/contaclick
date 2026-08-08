// =====================================================================
// Constructor ÚNICO y PURO de la solicitud del Web Service de
// Descarga Masiva del SAT.
//
// Módulo puro: sin red, sin Node, sin base de datos, sin e.firma. Aquí se
// decide QUÉ se le pide al SAT; el firmado y el envío ocurren después y
// SÓLO si esta validación pasa.
//
// Regla oficial que originó este módulo (rechazo real, código 301
// "XML Mal Formado / No se permite la descarga de xml que se encuentren
// cancelados"): una solicitud de tipo CFDI (XML) NO puede pedir
// comprobantes cancelados. Si el atributo EstadoComprobante se omite, el
// servicio asume "Todos" — que incluye cancelados — y rechaza la petición.
// Por eso el estado es OBLIGATORIO y explícito en toda solicitud XML.
// =====================================================================

export type DireccionSolicitud = "emitidos" | "recibidos";
export type TipoDescargaSat = "CFDI" | "Metadata";
export type EstadoComprobante = "Vigente" | "Cancelado" | "Todos";

export const ESTADOS_COMPROBANTE: readonly EstadoComprobante[] = [
  "Vigente",
  "Cancelado",
  "Todos",
] as const;

export const NS_DESCARGA_MASIVA = "http://DescargaMasivaTerceros.sat.gob.mx";

/**
 * Estados admitidos por combinación dirección/tipo.
 *
 * - XML recibidos: SÓLO vigentes. El receptor nunca puede descargar el XML
 *   de un comprobante cancelado.
 * - XML emitidos: vigentes por defecto; cancelados sólo con elección
 *   explícita del usuario (el emisor sí conserva su XML cancelado).
 * - Metadata: admite vigentes, cancelados y todos.
 */
export const ESTADOS_ADMITIDOS: Record<
  TipoDescargaSat,
  Record<DireccionSolicitud, readonly EstadoComprobante[]>
> = {
  CFDI: {
    recibidos: ["Vigente"],
    emitidos: ["Vigente", "Cancelado"],
  },
  Metadata: {
    recibidos: ["Vigente", "Cancelado", "Todos"],
    emitidos: ["Vigente", "Cancelado", "Todos"],
  },
};

/** Valor seguro por defecto: siempre comprobantes vigentes. */
export const ESTADO_POR_DEFECTO: EstadoComprobante = "Vigente";

export function estadosAdmitidos(
  tipo: TipoDescargaSat,
  direccion: DireccionSolicitud,
): readonly EstadoComprobante[] {
  return ESTADOS_ADMITIDOS[tipo]?.[direccion] ?? [ESTADO_POR_DEFECTO];
}

export function estadoPorDefecto(): EstadoComprobante {
  return ESTADO_POR_DEFECTO;
}

// ---------------------------------------------------------------------
// Entrada tipada
// ---------------------------------------------------------------------

export type EntradaSolicitud = {
  direccion: DireccionSolicitud;
  tipo: TipoDescargaSat;
  /** Si se omite se usa el valor seguro (Vigente). Vacío o desconocido falla. */
  estado?: EstadoComprobante | null;
  /** RFC del contribuyente cuyos comprobantes se descargan. */
  rfc: string;
  /** RFC que firma la solicitud (dueño de la e.firma). */
  rfcSolicitante: string;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
};

export type ErrorConstruccion = {
  campo: string;
  valor: string;
  motivo: string;
};

export class SolicitudInvalidaError extends Error {
  readonly detalle: ErrorConstruccion;
  constructor(detalle: ErrorConstruccion) {
    super(`${detalle.campo}="${detalle.valor}" — ${detalle.motivo}`);
    this.name = "SolicitudInvalidaError";
    this.detalle = detalle;
  }
}

export type SolicitudConstruida = {
  operacion: "SolicitaDescargaEmitidos" | "SolicitaDescargaRecibidos";
  accionSoap: string;
  /** Atributos en orden alfabético, tal como exige la canonicalización. */
  atributos: string;
  /** Elemento `des:solicitud` canónico (lo que se firma). */
  canonical: string;
  /** Sobre SOAP SIN firma, listo para insertar la Signature. */
  plantillaEnvelope: (signature: string) => string;
  /** Representación saneada para auditoría: sin material sensible. */
  saneado: string;
  estado: EstadoComprobante;
  campos: Record<string, string>;
};

const RFC_RE = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function exigir(cond: boolean, detalle: ErrorConstruccion): asserts cond {
  if (!cond) throw new SolicitudInvalidaError(detalle);
}

function normRfc(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

// ---------------------------------------------------------------------
// Validación de la combinación dirección / tipo / estado
// ---------------------------------------------------------------------

export type ResultadoValidacionCombinacion =
  | { ok: true; estado: EstadoComprobante }
  | { ok: false; error: ErrorConstruccion };

export function validarCombinacion(args: {
  direccion: unknown;
  tipo: unknown;
  estado?: unknown;
}): ResultadoValidacionCombinacion {
  const direccion = args.direccion;
  const tipo = args.tipo;

  if (direccion !== "emitidos" && direccion !== "recibidos") {
    return {
      ok: false,
      error: {
        campo: "direccion",
        valor: String(direccion ?? ""),
        motivo: "Dirección desconocida. Sólo se admite 'emitidos' o 'recibidos'.",
      },
    };
  }
  if (tipo !== "CFDI" && tipo !== "Metadata") {
    return {
      ok: false,
      error: {
        campo: "TipoSolicitud",
        valor: String(tipo ?? ""),
        motivo: "Tipo de descarga desconocido. Sólo se admite 'CFDI' o 'Metadata'.",
      },
    };
  }

  const admitidos = estadosAdmitidos(tipo, direccion);

  // Ausencia total => valor seguro. Cadena vacía o valor desconocido => falla cerrado.
  let estado: EstadoComprobante;
  if (args.estado === undefined || args.estado === null) {
    estado = ESTADO_POR_DEFECTO;
  } else if (typeof args.estado !== "string" || args.estado.trim() === "") {
    return {
      ok: false,
      error: {
        campo: "EstadoComprobante",
        valor: String(args.estado ?? ""),
        motivo:
          "El estado del comprobante no puede ir vacío. Debe declararse explícitamente.",
      },
    };
  } else if ((ESTADOS_COMPROBANTE as readonly string[]).includes(args.estado)) {
    estado = args.estado as EstadoComprobante;
  } else {
    return {
      ok: false,
      error: {
        campo: "EstadoComprobante",
        valor: args.estado,
        motivo: `Valor no reconocido por el esquema del SAT. Admitidos: ${ESTADOS_COMPROBANTE.join(", ")}.`,
      },
    };
  }

  if (!admitidos.includes(estado)) {
    const motivo =
      tipo === "CFDI" && direccion === "recibidos"
        ? "El SAT no permite descargar el XML de comprobantes cancelados recibidos. Para conocer los cancelados usa Metadata o la validación de estado."
        : `Combinación no permitida: ${tipo} ${direccion} sólo admite ${admitidos.join(", ")}.`;
    return { ok: false, error: { campo: "EstadoComprobante", valor: estado, motivo } };
  }

  return { ok: true, estado };
}

// ---------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------

export function construirSolicitudDescarga(entrada: EntradaSolicitud): SolicitudConstruida {
  const comb = validarCombinacion(entrada);
  if (!comb.ok) throw new SolicitudInvalidaError(comb.error);
  const estado = comb.estado;
  const direccion = entrada.direccion;
  const tipo = entrada.tipo;

  const rfc = normRfc(entrada.rfc);
  const rfcSolicitante = normRfc(entrada.rfcSolicitante);
  exigir(RFC_RE.test(rfc), {
    campo: direccion === "emitidos" ? "RfcEmisor" : "RfcReceptor",
    valor: rfc,
    motivo: "RFC inválido.",
  });
  exigir(RFC_RE.test(rfcSolicitante), {
    campo: "RfcSolicitante",
    valor: rfcSolicitante,
    motivo: "RFC solicitante inválido.",
  });

  const desde = String(entrada.desde ?? "").trim();
  const hasta = String(entrada.hasta ?? "").trim();
  exigir(FECHA_RE.test(desde), {
    campo: "FechaInicial",
    valor: desde,
    motivo: "Fecha inicial inválida. Formato esperado AAAA-MM-DD.",
  });
  exigir(FECHA_RE.test(hasta), {
    campo: "FechaFinal",
    valor: hasta,
    motivo: "Fecha final inválida. Formato esperado AAAA-MM-DD.",
  });
  exigir(desde <= hasta, {
    campo: "FechaInicial",
    valor: `${desde}..${hasta}`,
    motivo: "La fecha inicial no puede ser posterior a la final.",
  });

  const operacion =
    direccion === "emitidos" ? "SolicitaDescargaEmitidos" : "SolicitaDescargaRecibidos";
  const rfcAttr = direccion === "emitidos" ? "RfcEmisor" : "RfcReceptor";

  // El SAT trabaja en hora local del centro de México; el servicio espera
  // fecha-hora SIN zona horaria (xs:dateTime local).
  const fechaInicial = `${desde}T00:00:00`;
  const fechaFinal = `${hasta}T23:59:59`;

  // Orden ALFABÉTICO estricto: lo exige la canonicalización exclusiva.
  const campos: Record<string, string> = {
    EstadoComprobante: estado,
    FechaFinal: fechaFinal,
    FechaInicial: fechaInicial,
    [rfcAttr]: rfc,
    RfcSolicitante: rfcSolicitante,
    TipoSolicitud: tipo,
  };

  const nombresOrdenados = Object.keys(campos).sort();
  const atributos = nombresOrdenados.map((k) => `${k}="${campos[k]}"`).join(" ");

  const canonical = `<des:solicitud xmlns:des="${NS_DESCARGA_MASIVA}" ${atributos}></des:solicitud>`;

  // Validación contra el esquema oficial (WSDL/XSD) ANTES de sellar.
  // Si algo no cumple, no se firma nada y no se contacta al SAT.
  const violaciones = validarContraEsquema(canonical, operacion);
  if (violaciones.length > 0) {
    const v = violaciones[0]!;
    throw new SolicitudInvalidaError({
      campo: v.atributo,
      valor: v.valor,
      motivo: `${v.motivo} (validación WSDL/XSD local, ${violaciones.length} incidencia(s))`,
    });
  }

  const plantillaEnvelope = (signature: string) =>
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:des="${NS_DESCARGA_MASIVA}" xmlns:xd="http://www.w3.org/2000/09/xmldsig#">` +
    `<s:Header/><s:Body><des:${operacion}>` +
    `<des:solicitud ${atributos}>${signature}</des:solicitud>` +
    `</des:${operacion}></s:Body></s:Envelope>`;


  return {
    operacion,
    accionSoap: `${NS_DESCARGA_MASIVA}/ISolicitaDescargaService/${operacion}`,

    atributos,
    canonical,
    plantillaEnvelope,
    saneado: plantillaEnvelope("<Signature>[OMITIDA]</Signature>"),
    estado,
    campos,
  };
}

/** Versión no lanzable, útil para validar en la interfaz antes de firmar. */
export function intentarConstruir(
  entrada: EntradaSolicitud,
): { ok: true; solicitud: SolicitudConstruida } | { ok: false; error: ErrorConstruccion } {
  try {
    return { ok: true, solicitud: construirSolicitudDescarga(entrada) };
  } catch (e) {
    if (e instanceof SolicitudInvalidaError) return { ok: false, error: e.detalle };
    return {
      ok: false,
      error: { campo: "solicitud", valor: "", motivo: String((e as Error)?.message ?? e) },
    };
  }
}

/** Texto de interfaz para lo que realmente se descargará. */
export function descripcionAlcance(
  direccion: DireccionSolicitud,
  tipo: TipoDescargaSat,
  estado: EstadoComprobante = ESTADO_POR_DEFECTO,
): string {
  const que = tipo === "CFDI" ? "CFDI (XML)" : "metadata de CFDI";
  const est =
    estado === "Vigente" ? "vigentes" : estado === "Cancelado" ? "cancelados" : "vigentes y cancelados";
  return `Se descargarán ${que} ${est} ${direccion}.`;
}
