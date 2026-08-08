// =====================================================================
// Máquina de estados de una corrida de Descarga Masiva SAT.
//
// El SAT es ASÍNCRONO: aceptar la solicitud NO es haber descargado nada.
// Por eso una corrida sólo llega a `completada` cuando todas sus solicitudes
// terminaron y todos sus paquetes fueron procesados.
//
// Módulo puro: sin red, sin base de datos. Se prueba sin tocar el SAT.
// =====================================================================

import type { DireccionDescarga, TipoSolicitudSat } from "./providers/contrato";

export type EstadoCorrida =
  | "preparando"
  | "solicitando"
  | "esperando_sat"
  | "descargando"
  | "ingiriendo"
  | "recalculando"
  | "completada"
  | "parcial"
  | "error"
  | "vencida";

export const ESTADOS_ACTIVOS: EstadoCorrida[] = [
  "preparando",
  "solicitando",
  "esperando_sat",
  "descargando",
  "ingiriendo",
  "recalculando",
];

export const ESTADOS_TERMINALES: EstadoCorrida[] = ["completada", "parcial", "error", "vencida"];

export function esTerminal(e: EstadoCorrida): boolean {
  return ESTADOS_TERMINALES.includes(e);
}

export type EstadoSolicitud = "pendiente" | "listo" | "vacio" | "error" | "vencida";

/** Registro completo por solicitud, tal como se persiste en sat_sync_runs.solicitudes. */
export type SolicitudRegistro = {
  direccion: DireccionDescarga;
  desde: string;
  hasta: string;
  tipo: TipoSolicitudSat;
  id_solicitud: string;
  codigo: string;
  mensaje: string;
  estado: EstadoSolicitud;
  intentos: number;
  siguiente_intento_at: string | null;
  paquetes_encontrados: string[];
  paquetes_procesados: string[];
  xml_encontrados: number;
  xml_nuevos: number;
  duplicados: number;
  rechazados: number;
  error: string | null;
  ultima_consulta_at: string | null;
};

export function nuevaSolicitud(args: {
  direccion: DireccionDescarga;
  desde: string;
  hasta: string;
  id_solicitud: string;
  codigo?: string;
  mensaje?: string;
  estado?: EstadoSolicitud;
  error?: string | null;
}): SolicitudRegistro {
  return {
    direccion: args.direccion,
    desde: args.desde,
    hasta: args.hasta,
    tipo: "CFDI",
    id_solicitud: args.id_solicitud,
    codigo: args.codigo ?? "",
    mensaje: args.mensaje ?? "",
    estado: args.estado ?? "pendiente",
    intentos: 0,
    siguiente_intento_at: null,
    paquetes_encontrados: [],
    paquetes_procesados: [],
    xml_encontrados: 0,
    xml_nuevos: 0,
    duplicados: 0,
    rechazados: 0,
    error: args.error ?? null,
    ultima_consulta_at: null,
  };
}

// ---------------------------------------------------------------------
// Códigos del servicio de Descarga Masiva (rango 5000–5011)
// ---------------------------------------------------------------------

export type SemanticaCodigo = {
  mensaje: string;
  /** ¿Tiene sentido reintentar la MISMA operación? */
  reintentable: boolean;
  /** El SAT ya tiene una solicitud equivalente viva. */
  duplicada: boolean;
  /** La solicitud caducó y hay que volver a crearla. */
  vencida: boolean;
  /**
   * Error terminal de construcción o de datos (familia 3xx). No es una caída
   * del SAT: el request debe corregirse y crearse una corrida nueva.
   */
  terminal?: boolean;
};

export const CODIGOS_SAT: Record<string, SemanticaCodigo> = {
  // --- Familia 3xx: rechazo terminal de construcción/datos ---
  "300": { mensaje: "Usuario no válido para el servicio de descarga masiva.", reintentable: false, duplicada: false, vencida: false, terminal: true },
  "301": { mensaje: "XML mal formado: los criterios enviados no son válidos. Corrige la configuración y crea una corrida nueva.", reintentable: false, duplicada: false, vencida: false, terminal: true },
  "302": { mensaje: "Sello de la solicitud mal formado.", reintentable: false, duplicada: false, vencida: false, terminal: true },
  "303": { mensaje: "El RFC solicitante no coincide con el certificado de la e.firma.", reintentable: false, duplicada: false, vencida: false, terminal: true },
  "304": { mensaje: "Certificado revocado o caduco.", reintentable: false, duplicada: false, vencida: false, terminal: true },
  "305": { mensaje: "Certificado inválido para el servicio de descarga masiva.", reintentable: false, duplicada: false, vencida: false, terminal: true },
  "5000": { mensaje: "Solicitud recibida con éxito.", reintentable: false, duplicada: false, vencida: false },
  "5001": { mensaje: "Tercero no autorizado por el contribuyente.", reintentable: false, duplicada: false, vencida: false },
  "5002": { mensaje: "Se agotaron las solicitudes de por vida para este periodo.", reintentable: false, duplicada: false, vencida: false },
  "5003": { mensaje: "Se alcanzó el tope máximo de CFDI del periodo. Reduce el rango de fechas.", reintentable: false, duplicada: false, vencida: false },
  "5004": { mensaje: "No se encontró información con los criterios enviados.", reintentable: false, duplicada: false, vencida: false },
  "5005": { mensaje: "Ya existe una solicitud equivalente en proceso.", reintentable: false, duplicada: true, vencida: false },
  "5006": { mensaje: "Error interno del SAT durante el proceso.", reintentable: true, duplicada: false, vencida: false },
  "5007": { mensaje: "No se encontraron paquetes para la solicitud.", reintentable: false, duplicada: false, vencida: false },
  "5008": { mensaje: "La solicitud no está lista para descargar.", reintentable: true, duplicada: false, vencida: false },
  "5009": { mensaje: "El SAT rechazó la descarga del paquete.", reintentable: true, duplicada: false, vencida: false },
  "5010": { mensaje: "El servicio del SAT no está disponible en este momento.", reintentable: true, duplicada: false, vencida: false },
  "5011": { mensaje: "La solicitud expiró y debe volver a generarse.", reintentable: false, duplicada: false, vencida: true },
};

export function semanticaCodigo(codigo?: string | null): SemanticaCodigo {
  const c = String(codigo ?? "").trim();
  return (
    CODIGOS_SAT[c] ?? {
      mensaje: c ? `El SAT respondió el código ${c}.` : "El SAT no devolvió un código conocido.",
      reintentable: false,
      duplicada: false,
      vencida: false,
    }
  );
}

/**
 * Traduce EstadoSolicitud del SAT (1..6) + código a nuestro estado interno.
 * 1 aceptada · 2 en proceso · 3 terminada · 4 error · 5 rechazada · 6 vencida
 */
export function estadoDesdeSat(
  estadoSat: number,
  codigo?: string | null,
  numeroCfdis = 0,
): EstadoSolicitud {
  if (semanticaCodigo(codigo).vencida) return "vencida";
  if (estadoSat === 6) return "vencida";
  if (estadoSat === 1 || estadoSat === 2) return "pendiente";
  if (estadoSat >= 4) return "error";
  if (estadoSat === 3) return numeroCfdis > 0 ? "listo" : "vacio";
  return "pendiente";
}

// ---------------------------------------------------------------------
// Resolución del estado de la corrida
// ---------------------------------------------------------------------

export type ResumenCorrida = {
  estado: EstadoCorrida;
  cobertura: "total" | "parcial" | "nula";
  advertencia: string | null;
  xml_encontrados: number;
  xml_nuevos: number;
  duplicados: number;
  rechazados: number;
  paquetes_procesados: number;
};

/**
 * Una corrida sólo queda `completada` si TODAS las solicitudes terminaron
 * correctamente y todos los paquetes encontrados fueron procesados.
 */
export function resolverEstadoCorrida(sols: SolicitudRegistro[]): ResumenCorrida {
  const totales = sols.reduce(
    (a, s) => ({
      xml_encontrados: a.xml_encontrados + (s.xml_encontrados || 0),
      xml_nuevos: a.xml_nuevos + (s.xml_nuevos || 0),
      duplicados: a.duplicados + (s.duplicados || 0),
      rechazados: a.rechazados + (s.rechazados || 0),
      paquetes_procesados: a.paquetes_procesados + (s.paquetes_procesados?.length ?? 0),
    }),
    { xml_encontrados: 0, xml_nuevos: 0, duplicados: 0, rechazados: 0, paquetes_procesados: 0 },
  );

  if (sols.length === 0) {
    return {
      estado: "error",
      cobertura: "nula",
      advertencia: "No se envió ninguna solicitud al SAT.",
      ...totales,
    };
  }

  const pendientes = sols.filter((s) => s.estado === "pendiente");
  const errores = sols.filter((s) => s.estado === "error");
  const vencidas = sols.filter((s) => s.estado === "vencida");
  const okDescarga = sols.filter((s) => s.estado === "listo" || s.estado === "vacio");
  const paquetesPendientes = sols.some(
    (s) => (s.paquetes_encontrados?.length ?? 0) > (s.paquetes_procesados?.length ?? 0),
  );

  if (pendientes.length > 0) {
    return { estado: "esperando_sat", cobertura: "parcial", advertencia: null, ...totales };
  }
  if (paquetesPendientes) {
    return { estado: "descargando", cobertura: "parcial", advertencia: null, ...totales };
  }
  if (vencidas.length === sols.length) {
    return {
      estado: "vencida",
      cobertura: "nula",
      advertencia: "El SAT reportó las solicitudes como vencidas. Vuelve a solicitarlas.",
      ...totales,
    };
  }
  if (okDescarga.length === sols.length) {
    return { estado: "completada", cobertura: "total", advertencia: null, ...totales };
  }
  if (okDescarga.length === 0) {
    return {
      estado: "error",
      cobertura: "nula",
      advertencia: "Ninguna solicitud del SAT terminó correctamente.",
      ...totales,
    };
  }
  const fallidas = [...errores, ...vencidas].map((s) => s.direccion).join(", ");
  return {
    estado: "parcial",
    cobertura: "parcial",
    advertencia:
      `Cobertura parcial: el SAT no entregó ${fallidas}. Los módulos se recalcularon ` +
      "sólo con los CFDI efectivamente descargados.",
    ...totales,
  };
}

/** Compatibilidad con la columna histórica `estatus` de sat_sync_runs. */
export function estatusLegado(estado: EstadoCorrida): "en_curso" | "exitoso" | "parcial" | "error" {
  if (estado === "completada") return "exitoso";
  if (estado === "parcial") return "parcial";
  if (estado === "error" || estado === "vencida") return "error";
  return "en_curso";
}

/**
 * Acumulación idempotente: los conteos y paquetes ya procesados NUNCA se
 * pierden al reintentar una cosecha, y un paquete no se cuenta dos veces.
 */
export function acumularSolicitud(
  previa: SolicitudRegistro,
  delta: Partial<SolicitudRegistro> & { paquetes_procesados?: string[] },
): SolicitudRegistro {
  const procesados = Array.from(
    new Set([...(previa.paquetes_procesados ?? []), ...(delta.paquetes_procesados ?? [])]),
  );
  const encontrados = Array.from(
    new Set([...(previa.paquetes_encontrados ?? []), ...(delta.paquetes_encontrados ?? [])]),
  );
  return {
    ...previa,
    ...delta,
    paquetes_procesados: procesados,
    paquetes_encontrados: encontrados,
    intentos: (previa.intentos ?? 0) + (delta.intentos ?? 0),
    xml_encontrados: (previa.xml_encontrados ?? 0) + (delta.xml_encontrados ?? 0),
    xml_nuevos: (previa.xml_nuevos ?? 0) + (delta.xml_nuevos ?? 0),
    duplicados: (previa.duplicados ?? 0) + (delta.duplicados ?? 0),
    rechazados: (previa.rechazados ?? 0) + (delta.rechazados ?? 0),
  };
}

/** Backoff exponencial acotado para reintentos de consulta/descarga. */
export function siguienteIntento(intentos: number, ahora = Date.now()): string {
  const minutos = Math.min(60, 2 ** Math.max(0, intentos - 1) * 5);
  return new Date(ahora + minutos * 60_000).toISOString();
}

export const MAX_INTENTOS_SOLICITUD = 8;

// ---------------------------------------------------------------------
// Reintento manual de una corrida
// ---------------------------------------------------------------------

export type ReaperturaCorrida = {
  solicitudes: SolicitudRegistro[];
  /** Solicitudes que vuelven a la cola de cosecha. */
  reabiertas: number;
  /** Solicitudes que ya no pueden reintentarse: exigen una corrida nueva. */
  irrecuperables: { direccion: DireccionDescarga; motivo: string }[];
};

/**
 * Reabre las solicitudes de una corrida detenida para volver a cosecharlas.
 *
 * Sólo se reabre lo que el SAT todavía puede entregar: una solicitud con
 * IdSolicitud vivo cuyo código sea reintentable (o sin código, p. ej. un
 * corte de red). Lo ya resuelto (`listo`, `vacio`) NO se toca, y lo vencido
 * o rechazado de origen se reporta como irrecuperable para que el usuario
 * genere una corrida nueva en lugar de esperar en falso.
 */
export function reabrirSolicitudes(
  solicitudes: SolicitudRegistro[],
  ahora = Date.now(),
): ReaperturaCorrida {
  const irrecuperables: { direccion: DireccionDescarga; motivo: string }[] = [];
  let reabiertas = 0;

  const salida = solicitudes.map((s) => {
    if (s.estado === "listo" || s.estado === "vacio") return s;

    if (s.estado === "vencida") {
      irrecuperables.push({
        direccion: s.direccion,
        motivo: "La solicitud expiró en el SAT. Genera una corrida nueva para este periodo.",
      });
      return s;
    }

    if (!s.id_solicitud) {
      irrecuperables.push({
        direccion: s.direccion,
        motivo: "El SAT nunca devolvió un folio de solicitud. Genera una corrida nueva.",
      });
      return s;
    }

    const sem = semanticaCodigo(s.codigo);
    if (s.codigo && !sem.reintentable && s.estado === "error") {
      irrecuperables.push({ direccion: s.direccion, motivo: sem.mensaje });
      return s;
    }

    reabiertas++;
    return {
      ...s,
      estado: "pendiente" as EstadoSolicitud,
      intentos: 0,
      siguiente_intento_at: null,
      error: null,
      mensaje: "Reintento manual: se volverá a consultar el avance en el SAT.",
      ultima_consulta_at: new Date(ahora).toISOString(),
    };
  });

  return { solicitudes: salida, reabiertas, irrecuperables };
}
