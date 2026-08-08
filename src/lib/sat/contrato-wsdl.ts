// =====================================================================
// Contrato oficial (WSDL/XSD) del Web Service de Descarga Masiva SAT,
// expresado como esquema declarativo y verificable en local.
//
// Sirve para UNA cosa: validar el elemento `des:solicitud` ANTES de
// sellarlo. Si el elemento no cumple el esquema no se firma, no se
// consume cuota y no se contacta al SAT.
//
// Fuente: SolicitaDescargaService.svc?wsdl y el XSD embebido
// (namespace http://DescargaMasivaTerceros.sat.gob.mx), operaciones
// SolicitaDescargaEmitidos / SolicitaDescargaRecibidos.
// =====================================================================

export const NS_SOLICITUD = "http://DescargaMasivaTerceros.sat.gob.mx";

export type OperacionSolicitud = "SolicitaDescargaEmitidos" | "SolicitaDescargaRecibidos";

type ReglaAtributo = {
  requerido: boolean;
  enum?: readonly string[];
  patron?: RegExp;
};

const RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/**
 * Atributos admitidos por operación. Cualquier atributo fuera de esta
 * lista es una violación del XSD (el SAT responde 301 XML Mal Formado).
 *
 * `EstadoComprobante` es requerido en nuestra implementación aunque el XSD
 * lo declare opcional: omitirlo hace que el servicio asuma "Todos", que
 * incluye cancelados, y rechace las solicitudes de tipo CFDI.
 */
export const ESQUEMA_SOLICITUD: Record<
  OperacionSolicitud,
  { elemento: string; atributos: Record<string, ReglaAtributo> }
> = {
  SolicitaDescargaEmitidos: {
    elemento: "des:solicitud",
    atributos: {
      EstadoComprobante: { requerido: true, enum: ["Vigente", "Cancelado", "Todos"] },
      FechaFinal: { requerido: true, patron: DATETIME_LOCAL },
      FechaInicial: { requerido: true, patron: DATETIME_LOCAL },
      RfcEmisor: { requerido: true, patron: RFC },
      RfcReceptor: { requerido: false, patron: RFC },
      RfcSolicitante: { requerido: true, patron: RFC },
      TipoSolicitud: { requerido: true, enum: ["CFDI", "Metadata"] },
      Folio: { requerido: false },
      RfcACuentaTerceros: { requerido: false, patron: RFC },
      Complemento: { requerido: false },
    },
  },
  SolicitaDescargaRecibidos: {
    elemento: "des:solicitud",
    atributos: {
      EstadoComprobante: { requerido: true, enum: ["Vigente", "Cancelado", "Todos"] },
      FechaFinal: { requerido: true, patron: DATETIME_LOCAL },
      FechaInicial: { requerido: true, patron: DATETIME_LOCAL },
      RfcEmisor: { requerido: false, patron: RFC },
      RfcReceptor: { requerido: true, patron: RFC },
      RfcSolicitante: { requerido: true, patron: RFC },
      TipoSolicitud: { requerido: true, enum: ["CFDI", "Metadata"] },
      Folio: { requerido: false },
      RfcACuentaTerceros: { requerido: false, patron: RFC },
      Complemento: { requerido: false },
    },
  },
};

/**
 * Combinaciones que el servicio rechaza aunque el XSD las admita.
 * Regla oficial: el receptor no puede obtener el XML de un cancelado.
 */
export function combinacionProhibida(
  operacion: OperacionSolicitud,
  tipoSolicitud: string,
  estado: string,
): string | null {
  if (tipoSolicitud !== "CFDI") return null;
  if (estado === "Todos") {
    return "TipoSolicitud=CFDI no admite EstadoComprobante=Todos: incluiría comprobantes cancelados.";
  }
  if (operacion === "SolicitaDescargaRecibidos" && estado === "Cancelado") {
    return "El SAT no permite descargar el XML de comprobantes cancelados recibidos.";
  }
  return null;
}

export type ViolacionEsquema = { atributo: string; valor: string; motivo: string };

function leerAtributos(xml: string): Record<string, string> | null {
  const m = /<des:solicitud\b([^>]*?)\/?>/.exec(xml);
  if (!m) return null;
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z:_][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let a: RegExpExecArray | null;
  while ((a = re.exec(m[1] ?? "")) !== null) attrs[a[1]!] = a[2]!;
  return attrs;
}

/**
 * Valida el elemento `des:solicitud` (canónico o dentro del sobre) contra el
 * esquema oficial. Devuelve todas las violaciones encontradas.
 */
export function validarContraEsquema(
  xmlSolicitud: string,
  operacion: OperacionSolicitud,
): ViolacionEsquema[] {
  const fallas: ViolacionEsquema[] = [];
  const esquema = ESQUEMA_SOLICITUD[operacion];
  const attrs = leerAtributos(xmlSolicitud);
  if (!attrs) {
    return [
      { atributo: "des:solicitud", valor: "", motivo: "No se encontró el elemento des:solicitud." },
    ];
  }

  const ns = attrs["xmlns:des"];
  if (ns !== undefined && ns !== NS_SOLICITUD) {
    fallas.push({
      atributo: "xmlns:des",
      valor: ns,
      motivo: `Namespace incorrecto. Se espera ${NS_SOLICITUD}.`,
    });
  }

  for (const [nombre, valor] of Object.entries(attrs)) {
    if (nombre.startsWith("xmlns")) continue;
    const regla = esquema.atributos[nombre];
    if (!regla) {
      fallas.push({
        atributo: nombre,
        valor,
        motivo: `Atributo no declarado en el XSD de ${operacion}.`,
      });
      continue;
    }
    if (regla.enum && !regla.enum.includes(valor)) {
      fallas.push({
        atributo: nombre,
        valor,
        motivo: `Valor fuera del enumerado. Admitidos: ${regla.enum.join(", ")}.`,
      });
    }
    if (regla.patron && !regla.patron.test(valor)) {
      fallas.push({ atributo: nombre, valor, motivo: "Valor con formato inválido." });
    }
  }

  for (const [nombre, regla] of Object.entries(esquema.atributos)) {
    if (regla.requerido && attrs[nombre] === undefined) {
      fallas.push({
        atributo: nombre,
        valor: "",
        motivo:
          nombre === "EstadoComprobante"
            ? "Atributo ausente: el servicio asume 'Todos' (incluye cancelados) y rechaza con 301."
            : "Atributo obligatorio ausente.",
      });
    }
  }

  const tipo = attrs["TipoSolicitud"] ?? "";
  const estado = attrs["EstadoComprobante"] ?? "";
  const prohibida = combinacionProhibida(operacion, tipo, estado);
  if (prohibida && estado) {
    fallas.push({ atributo: "EstadoComprobante", valor: estado, motivo: prohibida });
  }

  // Orden alfabético estricto: requisito de la canonicalización exclusiva.
  const orden = Object.keys(attrs).filter((k) => !k.startsWith("xmlns"));
  const ordenado = [...orden].sort();
  if (orden.join(",") !== ordenado.join(",")) {
    fallas.push({
      atributo: "orden",
      valor: orden.join(","),
      motivo: "Los atributos deben ir en orden alfabético estricto.",
    });
  }

  return fallas;
}
