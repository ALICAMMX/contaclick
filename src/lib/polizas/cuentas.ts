// Selección determinista de las cuentas de sistema desde el catálogo del
// expediente. NO inventa cuentas: si el catálogo no tiene una equivalencia,
// devuelve el faltante para que la UI lo diga con claridad.
import type { CuentasSistema } from "./motor";

export type CuentaCatalogo = {
  codigo: string;
  nombre: string;
  naturaleza: string;
  tipo_sat: string | null;
  activa: boolean;
};

/** Agrupadores SAT (Anexo 24) que identifican cada cuenta de sistema. */
const AGRUPADORES: Record<keyof CuentasSistema, string[]> = {
  clientes: ["105.01", "105"],
  proveedores: ["201.01", "201"],
  bancos: ["102.01", "102"],
  iva_trasladado_cobrado: ["209.01", "209"],
  iva_trasladado_pendiente: ["208.01", "208"],
  iva_acreditable_pagado: ["113.01", "113"],
  iva_acreditable_pendiente: ["118.01", "118"],
  ieps_trasladado: ["208.02", "210"],
  iva_retenido: ["216.02", "118.02"],
  isr_retenido: ["216.01", "120.01"],
  descuentos: ["402.01"],
};

export type SeleccionCuentas = {
  cuentas: CuentasSistema;
  faltantes: string[];
};

export function elegirCuentasSistema(rows: CuentaCatalogo[]): SeleccionCuentas {
  const activas = rows.filter((r) => r.activa);
  const faltantes: string[] = [];

  const buscar = (clave: keyof CuentasSistema): string | null => {
    for (const agr of AGRUPADORES[clave]) {
      const exacto = activas.find((r) => (r.tipo_sat ?? "") === agr);
      if (exacto) return exacto.codigo;
    }
    for (const agr of AGRUPADORES[clave]) {
      const prefijo = activas.find((r) => (r.tipo_sat ?? "").startsWith(agr));
      if (prefijo) return prefijo.codigo;
    }
    return null;
  };

  const req = (clave: keyof CuentasSistema): string => {
    const c = buscar(clave);
    if (!c) {
      faltantes.push(clave);
      return "POR IDENTIFICAR";
    }
    return c;
  };

  return {
    cuentas: {
      clientes: req("clientes"),
      proveedores: req("proveedores"),
      bancos: buscar("bancos"),
      iva_trasladado_cobrado: req("iva_trasladado_cobrado"),
      iva_trasladado_pendiente: req("iva_trasladado_pendiente"),
      iva_acreditable_pagado: req("iva_acreditable_pagado"),
      iva_acreditable_pendiente: req("iva_acreditable_pendiente"),
      ieps_trasladado: req("ieps_trasladado"),
      iva_retenido: req("iva_retenido"),
      isr_retenido: req("isr_retenido"),
      descuentos: buscar("descuentos"),
    },
    faltantes,
  };
}
