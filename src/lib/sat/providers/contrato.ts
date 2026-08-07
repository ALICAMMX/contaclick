// =====================================================================
// Contrato central de proveedores de Descarga Masiva de CFDI.
//
// Sólo existe UNA arquitectura de proveedores. Hoy el único proveedor
// implementado y disponible es `sat_directo` (web service oficial del SAT
// firmado con la e.firma del contribuyente). `pac` queda REGISTRADO pero
// NO DISPONIBLE, detrás de un feature flag, para poder conectarlo después
// sin volver a tocar el orquestador.
//
// Este archivo es puro (sin Node, sin Supabase, sin React): lo consumen por
// igual el backend, las pruebas y la interfaz.
// =====================================================================

export type ProveedorId = "sat_directo" | "pac";

/** Direcciones que el SAT acepta como solicitudes independientes. */
export type DireccionDescarga = "emitidos" | "recibidos";

/**
 * Tipo de solicitud SAT. La primera versión operativa sólo emite solicitudes
 * de tipo CFDI (XML). `Metadata` queda declarado pero NO implementado.
 */
export type TipoSolicitudSat = "CFDI";

export type ResultadoValidacion = {
  ok: boolean;
  rfc: string | null;
  vence_at: string | null;
  motivo: string | null;
};

export type SolicitudProveedor = {
  id_solicitud: string;
  direccion: DireccionDescarga;
  tipo: TipoSolicitudSat;
  desde: string;
  hasta: string;
  codigo: string;
  mensaje: string;
};

export type EstadoSolicitud = {
  /** 1 aceptada · 2 en proceso · 3 terminada · 4 error · 5 rechazada · 6 vencida */
  estado_sat: number;
  codigo: string;
  mensaje: string;
  numero_cfdis: number;
  paquetes: string[];
};

export type PaqueteDescarga = {
  id_paquete: string;
  /** ZIP en base64. Nunca debe registrarse en logs. */
  zip_b64: string;
};

/**
 * Contrato que debe cumplir cualquier proveedor de descarga masiva.
 * `sat_directo` lo implementa; `pac` lo implementará cuando se contrate.
 */
export interface ProveedorDescargaCfdi {
  id: ProveedorId;
  validarCredencial(args: {
    cer_b64: string;
    key_b64: string;
    password: string;
    rfcEsperado: string;
  }): Promise<ResultadoValidacion>;
  solicitar(args: {
    credencial: unknown;
    rfc: string;
    desde: string;
    hasta: string;
    direcciones: DireccionDescarga[];
    tipo: TipoSolicitudSat;
  }): Promise<SolicitudProveedor[]>;
  consultarEstado(args: { credencial: unknown; idSolicitud: string }): Promise<EstadoSolicitud>;
  descargarPaquetes(args: {
    credencial: unknown;
    idsPaquetes: string[];
  }): Promise<PaqueteDescarga[]>;
  estimarSolicitudes(args: {
    direcciones: DireccionDescarga[];
    desde: string;
    hasta: string;
  }): number;
  /** ¿Descontar del saldo contratado con el proveedor? */
  consumeSaldoProveedor: boolean;
  /** ¿Está operativo hoy? */
  disponible: boolean;
}

// ---------------------------------------------------------------------
// Registro de proveedores
// ---------------------------------------------------------------------

export const MENSAJE_PAC_NO_DISPONIBLE =
  "Proveedor PAC pendiente de configuración. Actualmente la descarga utiliza el servicio web oficial del SAT.";

export const ETIQUETA_COSTO_SAT_DIRECTO =
  "Sin costo de proveedor · utiliza el servicio oficial del SAT";

/**
 * Feature flag del PAC. Mientras sea `false` el proveedor `pac` no puede
 * seleccionarse ni ejecutarse, y la interfaz muestra MENSAJE_PAC_NO_DISPONIBLE.
 * No se simula que esté conectado.
 */
export const PAC_HABILITADO = false;

export type MetaProveedor = {
  id: ProveedorId;
  nombre: string;
  descripcion: string;
  disponible: boolean;
  /** Toda descarga real cuenta contra la cuota de solicitudes del plan. */
  consumeCuotaPlan: boolean;
  /** Sólo el PAC descuenta saldo contratado con un tercero. */
  consumeSaldoProveedor: boolean;
  costoProveedorCentavos: number;
  etiquetaCosto: string;
  mensajeNoDisponible: string | null;
};

export const PROVEEDORES: Record<ProveedorId, MetaProveedor> = {
  sat_directo: {
    id: "sat_directo",
    nombre: "SAT directo (e.firma)",
    descripcion:
      "Servicio web oficial de Descarga Masiva del SAT, firmado con la e.firma del contribuyente.",
    disponible: true,
    consumeCuotaPlan: true,
    consumeSaldoProveedor: false,
    costoProveedorCentavos: 0,
    etiquetaCosto: ETIQUETA_COSTO_SAT_DIRECTO,
    mensajeNoDisponible: null,
  },
  pac: {
    id: "pac",
    nombre: "PAC autorizado",
    descripcion: "Proveedor Autorizado de Certificación. Pendiente de contratar y configurar.",
    disponible: PAC_HABILITADO,
    consumeCuotaPlan: true,
    consumeSaldoProveedor: true,
    costoProveedorCentavos: 0,
    etiquetaCosto: "Consume saldo contratado con el PAC",
    mensajeNoDisponible: PAC_HABILITADO ? null : MENSAJE_PAC_NO_DISPONIBLE,
  },
};

/** Proveedor por defecto de todo expediente nuevo. */
export const PROVEEDOR_POR_DEFECTO: ProveedorId = "sat_directo";

/**
 * Cada expediente tiene UN proveedor activo. Si la configuración guardada
 * apunta a un proveedor desconocido o no disponible, se cae al predeterminado.
 */
export function proveedorActivo(guardado?: string | null): ProveedorId {
  if (guardado === "pac" && PROVEEDORES.pac.disponible) return "pac";
  return PROVEEDOR_POR_DEFECTO;
}

export function metaProveedor(id: ProveedorId): MetaProveedor {
  return PROVEEDORES[id];
}

/** Direcciones activas según la configuración del expediente. */
export function direccionesDe(cfg: {
  emitidos?: boolean | null;
  recibidos?: boolean | null;
}): DireccionDescarga[] {
  const out: DireccionDescarga[] = [];
  if (cfg.emitidos) out.push("emitidos");
  if (cfg.recibidos) out.push("recibidos");
  return out;
}
