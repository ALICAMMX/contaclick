// =====================================================================
// Ciclo asíncrono de la Descarga Masiva, SIN base de datos y SIN red.
//
// Aquí vive la lógica real de "solicitar → verificar → descargar → ingerir"
// que ejecuta producción. El orquestador (`sat-directo-runner.server.ts`)
// sólo le inyecta un cliente que habla con el SAT, un abridor de paquetes y
// un ingestor de XML. Gracias a eso el ciclo completo puede probarse con
// datos sintéticos y sin tocar el SAT.
// =====================================================================

import type { DireccionDescarga } from "./providers/contrato";
import {
  MAX_INTENTOS_SOLICITUD,
  acumularSolicitud,
  estadoDesdeSat,
  nuevaSolicitud,
  resolverEstadoCorrida,
  semanticaCodigo,
  siguienteIntento,
  type ResumenCorrida,
  type SolicitudRegistro,
} from "./maquina-estados";

/** Máximo de XML que se ingieren por paquete en una sola pasada. */
export const MAX_XML_POR_PAQUETE = 5000;

export type RespuestaSolicitud = {
  idSolicitud: string;
  codigo: string;
  mensaje: string;
};

export type RespuestaVerificacion = {
  /** 1 aceptada · 2 en proceso · 3 terminada · 4 error · 5 rechazada · 6 vencida */
  estado: number;
  codigo: string;
  mensaje: string;
  numeroCfdis: number;
  paquetes: string[];
};

/** Cliente mínimo del servicio de descarga. Lo implementa el SAT y el simulador. */
export interface ClienteCiclo {
  solicitar(args: {
    direccion: DireccionDescarga;
    desde: string;
    hasta: string;
  }): Promise<RespuestaSolicitud>;
  verificar(idSolicitud: string): Promise<RespuestaVerificacion>;
  descargar(idPaquete: string): Promise<string>;
}

export type ArchivoPaquete = { nombre: string; xml: string };
export type AbrirPaquete = (zipB64: string) => Promise<ArchivoPaquete[]>;
export type Ingestar = (archivo: ArchivoPaquete) => Promise<{ duplicado: boolean }>;

// ---------------------------------------------------------------------
// Paso A — Solicitar
// ---------------------------------------------------------------------

export async function solicitarCiclo(
  cliente: ClienteCiclo,
  args: { desde: string; hasta: string; direcciones: DireccionDescarga[] },
): Promise<{ solicitudes: SolicitudRegistro[]; errores: string[] }> {
  const solicitudes: SolicitudRegistro[] = [];
  const errores: string[] = [];

  for (const direccion of args.direcciones) {
    try {
      const r = await cliente.solicitar({ direccion, desde: args.desde, hasta: args.hasta });
      const sem = semanticaCodigo(r.codigo);
      if (sem.terminal) {
        // Rechazo terminal de construcción/datos: ni folio ni reintento.
        const mensaje = `${r.codigo} · ${sem.mensaje}`;
        errores.push(`[${direccion}] ${mensaje}`);
        solicitudes.push(
          nuevaSolicitud({
            direccion,
            desde: args.desde,
            hasta: args.hasta,
            id_solicitud: "",
            codigo: r.codigo,
            estado: "error",
            mensaje: sem.mensaje,
            error: `${r.codigo} · ${r.mensaje || sem.mensaje}`,
          }),
        );
        continue;
      }
      solicitudes.push(
        nuevaSolicitud({
          direccion,
          desde: args.desde,
          hasta: args.hasta,
          id_solicitud: r.idSolicitud,
          codigo: r.codigo,
          mensaje: sem.mensaje || r.mensaje,
          estado: sem.vencida ? "vencida" : "pendiente",
        }),
      );
    } catch (e: any) {
      // Errores terminales (rechazo 3xx del SAT o solicitud inválida detectada
      // localmente) llevan código propio y jamás se reintentan.
      const codigo = String(e?.codigo ?? "");
      const mensaje = String(e?.message ?? e).slice(0, 250);
      errores.push(`[${direccion}] ${mensaje}`);
      solicitudes.push(
        nuevaSolicitud({
          direccion,
          desde: args.desde,
          hasta: args.hasta,
          id_solicitud: "",
          codigo,
          estado: "error",
          mensaje: codigo ? semanticaCodigo(codigo).mensaje : mensaje,
          error: mensaje,
        }),
      );
    }
  }
  return { solicitudes, errores };
}

// ---------------------------------------------------------------------
// Paso B — Cosechar una solicitud
// ---------------------------------------------------------------------

export async function cosecharSolicitudCiclo(args: {
  cliente: ClienteCiclo;
  solicitud: SolicitudRegistro;
  abrirPaquete: AbrirPaquete;
  ingestar: Ingestar;
  maxXmlPorPaquete?: number;
  ahora?: () => number;
}): Promise<SolicitudRegistro> {
  const { cliente, solicitud } = args;
  const ahoraMs = (args.ahora ?? Date.now)();
  const ahora = new Date(ahoraMs).toISOString();

  if (!solicitud.id_solicitud) {
    return { ...solicitud, estado: "error", ultima_consulta_at: ahora };
  }

  const v = await cliente.verificar(solicitud.id_solicitud);
  const estado = estadoDesdeSat(v.estado, v.codigo, v.numeroCfdis);
  const sem = semanticaCodigo(v.codigo);

  if (estado === "pendiente") {
    const intentos = (solicitud.intentos ?? 0) + 1;
    const agotado = intentos >= MAX_INTENTOS_SOLICITUD;
    return {
      ...solicitud,
      estado: agotado ? "error" : "pendiente",
      intentos,
      siguiente_intento_at: agotado ? null : siguienteIntento(intentos, ahoraMs),
      ultima_consulta_at: ahora,
      codigo: v.codigo || solicitud.codigo,
      mensaje: agotado
        ? "El SAT no liberó los paquetes dentro del plazo de reintentos. Vuelve a solicitar el periodo."
        : sem.mensaje || v.mensaje || "El SAT sigue procesando la solicitud.",
      error: agotado ? "Plazo de espera agotado" : null,
    };
  }

  if (estado === "error" || estado === "vencida") {
    return {
      ...solicitud,
      estado,
      ultima_consulta_at: ahora,
      codigo: v.codigo || solicitud.codigo,
      mensaje: sem.mensaje || v.mensaje || "El SAT no entregó esta solicitud.",
      error: `${v.codigo} ${v.mensaje}`.trim() || "Solicitud no entregada por el SAT",
    };
  }

  if (estado === "vacio") {
    return {
      ...solicitud,
      estado: "vacio",
      ultima_consulta_at: ahora,
      codigo: v.codigo || solicitud.codigo,
      mensaje: "El SAT no reportó comprobantes en el periodo solicitado.",
      error: null,
    };
  }

  // estado === "listo": descargar únicamente los paquetes que falten.
  let acumulada: SolicitudRegistro = {
    ...solicitud,
    paquetes_encontrados: Array.from(
      new Set([...(solicitud.paquetes_encontrados ?? []), ...v.paquetes]),
    ),
  };
  const procesados = new Set(acumulada.paquetes_procesados ?? []);
  const limite = args.maxXmlPorPaquete ?? MAX_XML_POR_PAQUETE;

  for (const idPaquete of v.paquetes) {
    if (procesados.has(idPaquete)) continue;
    const zipB64 = await cliente.descargar(idPaquete);
    const archivos = (await args.abrirPaquete(zipB64)).slice(0, limite);

    let nuevos = 0;
    let duplicados = 0;
    let rechazados = 0;
    for (const archivo of archivos) {
      try {
        const r = await args.ingestar(archivo);
        if (r.duplicado) duplicados++;
        else nuevos++;
      } catch {
        // XML ilegible o rechazado por el validador: se cuenta, no se pierde en silencio.
        rechazados++;
      }
    }
    acumulada = acumularSolicitud(acumulada, {
      paquetes_procesados: [idPaquete],
      xml_encontrados: archivos.length,
      xml_nuevos: nuevos,
      duplicados,
      rechazados,
    });
    procesados.add(idPaquete);
  }

  return {
    ...acumulada,
    estado: "listo",
    ultima_consulta_at: ahora,
    codigo: v.codigo || acumulada.codigo,
    mensaje: `El SAT entregó ${v.numeroCfdis} comprobantes en ${v.paquetes.length} paquete(s).`,
    error: null,
  };
}

// ---------------------------------------------------------------------
// Paso B' — Cosechar la corrida completa
// ---------------------------------------------------------------------

export async function cosecharCiclo(args: {
  cliente: ClienteCiclo;
  solicitudes: SolicitudRegistro[];
  abrirPaquete: AbrirPaquete;
  ingestar: Ingestar;
  maxXmlPorPaquete?: number;
  ahora?: () => number;
}): Promise<{ solicitudes: SolicitudRegistro[]; resumen: ResumenCorrida }> {
  const ahoraFn = args.ahora ?? Date.now;
  const salida: SolicitudRegistro[] = [];

  for (const s of args.solicitudes) {
    if (s.estado !== "pendiente") {
      salida.push(s);
      continue;
    }
    if (s.siguiente_intento_at && new Date(s.siguiente_intento_at).getTime() > ahoraFn()) {
      salida.push(s);
      continue;
    }
    try {
      salida.push(
        await cosecharSolicitudCiclo({
          cliente: args.cliente,
          solicitud: s,
          abrirPaquete: args.abrirPaquete,
          ingestar: args.ingestar,
          ...(args.maxXmlPorPaquete !== undefined
            ? { maxXmlPorPaquete: args.maxXmlPorPaquete }
            : {}),
          ahora: ahoraFn,
        }),
      );
    } catch (e: any) {
      const mensaje = String(e?.message ?? e).slice(0, 250);
      const intentos = (s.intentos ?? 0) + 1;
      salida.push({
        ...s,
        intentos,
        siguiente_intento_at: siguienteIntento(intentos, ahoraFn()),
        mensaje,
        error: mensaje,
        estado: intentos >= MAX_INTENTOS_SOLICITUD ? "error" : "pendiente",
      });
    }
  }

  return { solicitudes: salida, resumen: resolverEstadoCorrida(salida) };
}
