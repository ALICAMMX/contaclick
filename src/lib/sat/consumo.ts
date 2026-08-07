// =====================================================================
// Matriz de consumo: CUOTA DEL PLAN vs SALDO DEL PROVEEDOR.
//
// Son dos conceptos distintos y hasta ahora estaban mezclados: "SAT directo"
// se trataba como simulación para no tocar el saldo PAC, y por eso tampoco
// registraba uso del plan. Aquí quedan separados de forma explícita.
//
//   sat_directo -> consumeCuotaPlan = true,  consumeSaldoProveedor = false, costo 0
//   pac         -> consumeCuotaPlan = true,  consumeSaldoProveedor = true
//
// Módulo puro.
// =====================================================================

import {
  ETIQUETA_COSTO_SAT_DIRECTO,
  PROVEEDORES,
  type DireccionDescarga,
  type ProveedorId,
} from "./providers/contrato";

export type MatrizConsumo = {
  proveedor: ProveedorId;
  consumeCuotaPlan: boolean;
  consumeSaldoProveedor: boolean;
  costoProveedorCentavos: number;
  etiqueta: string;
};

export function matrizConsumo(proveedor: ProveedorId): MatrizConsumo {
  const meta = PROVEEDORES[proveedor];
  return {
    proveedor,
    consumeCuotaPlan: meta.consumeCuotaPlan,
    consumeSaldoProveedor: meta.consumeSaldoProveedor,
    costoProveedorCentavos: meta.costoProveedorCentavos,
    etiqueta: proveedor === "sat_directo" ? ETIQUETA_COSTO_SAT_DIRECTO : meta.etiquetaCosto,
  };
}

/** Meses calendario cubiertos por el rango (el SAT parte las solicitudes por mes). */
export function mesesEnRango(desde?: string | null, hasta?: string | null): number {
  if (!desde || !hasta) return 1;
  const d1 = new Date(desde);
  const d2 = new Date(hasta);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 < d1) return 1;
  return Math.max(
    1,
    (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 +
      (d2.getUTCMonth() - d1.getUTCMonth()) +
      1,
  );
}

/**
 * Solicitudes previstas = direcciones activas × meses del rango.
 * Nómina, pagos y retenciones NO son solicitudes independientes.
 */
export function contarSolicitudes(args: {
  direcciones: DireccionDescarga[];
  desde?: string | null;
  hasta?: string | null;
}): number {
  if (args.direcciones.length === 0) return 0;
  return args.direcciones.length * mesesEnRango(args.desde, args.hasta);
}

/** Rango válido: fechas reales, desde <= hasta y no futuro lejano. */
export function rangoValido(desde?: string | null, hasta?: string | null): boolean {
  if (!desde || !hasta) return false;
  const d1 = new Date(`${desde}T00:00:00Z`);
  const d2 = new Date(`${hasta}T00:00:00Z`);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
  if (d2 < d1) return false;
  return true;
}
