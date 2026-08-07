// Llaves estables de idempotencia para la Descarga Masiva SAT.
// Módulo puro: se prueba sin base de datos.

import type { DireccionDescarga, ProveedorId, TipoSolicitudSat } from "./providers/contrato";

/**
 * Llave por SOLICITUD:
 *   proveedor + expediente + dirección + tipo + fecha_desde + fecha_hasta
 * Mientras exista una solicitud activa con esta llave no se crea otra.
 */
export function llaveSolicitud(args: {
  proveedor: ProveedorId;
  clienteId: string;
  direccion: DireccionDescarga;
  tipo: TipoSolicitudSat;
  desde: string;
  hasta: string;
}): string {
  return [args.proveedor, args.clienteId, args.direccion, args.tipo, args.desde, args.hasta].join(
    "|",
  );
}

/**
 * Llave por CORRIDA: agrupa las direcciones solicitadas en un solo envío.
 * Dos sesiones simultáneas con la misma configuración producen la misma llave,
 * y el índice único parcial de la base garantiza una sola corrida activa.
 */
export function llaveCorrida(args: {
  proveedor: ProveedorId;
  clienteId: string;
  direcciones: DireccionDescarga[];
  tipo: TipoSolicitudSat;
  desde: string;
  hasta: string;
}): string {
  const dirs = [...args.direcciones].sort().join("+");
  return [args.proveedor, args.clienteId, dirs, args.tipo, args.desde, args.hasta].join("|");
}
