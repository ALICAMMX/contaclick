// Resolución pura de acceso a una capacidad. Sin base de datos: se puede probar
// y se puede reutilizar en cliente y servidor para "fallar cerrado" igual en ambos.

import type { PlanId } from "@/lib/payments/plans";
import { getCapability, esUsable, type Capability, type Permiso } from "./registry";

export type MotivoBloqueo =
  | "ok"
  | "no_existe"
  | "sin_implementacion"
  | "solo_demostracion"
  | "obsoleta"
  | "plan_insuficiente"
  | "permiso_insuficiente";

export type AccesoCapability = {
  permitido: boolean;
  /** Puede abrirse la pantalla, aunque no produzca resultados reales. */
  navegable: boolean;
  motivo: MotivoBloqueo;
  mensaje: string | null;
  capability: Capability | null;
};

const RANGO: Record<Permiso, number> = { miembro: 0, admin_despacho: 1, super_admin: 2 };

export function resolverAcceso(input: {
  id: string;
  /** Se recibe sólo para trazabilidad: NINGÚN plan restringe herramientas. */
  plan: PlanId | null;
  permiso: Permiso;
}): AccesoCapability {
  const capability = getCapability(input.id) ?? null;
  if (!capability) {
    return { permitido: false, navegable: false, motivo: "no_existe", mensaje: "Esta herramienta no existe.", capability: null };
  }

  if (RANGO[input.permiso] < RANGO[capability.permiso]) {
    return {
      permitido: false, navegable: false, motivo: "permiso_insuficiente",
      mensaje: "No tienes permisos para usar esta herramienta. Pídeselo al administrador de tu despacho.",
      capability,
    };
  }

  // Regla comercial: todos los planes incluyen todas las herramientas.
  // La diferencia entre planes es capacidad (RFC y cuotas operativas),
  // y esa se aplica en @/lib/entitlements/service, no aquí.


  if (capability.madurez === "obsoleta") {
    return { permitido: false, navegable: false, motivo: "obsoleta", mensaje: "Esta herramienta fue reemplazada.", capability };
  }
  if (capability.madurez === "proximamente") {
    return { permitido: false, navegable: false, motivo: "sin_implementacion", mensaje: capability.mensajeNoDisponible, capability };
  }
  if (capability.madurez === "demostracion") {
    // Se puede ver, pero nunca produce entregables reales.
    return { permitido: false, navegable: true, motivo: "solo_demostracion", mensaje: capability.mensajeNoDisponible, capability };
  }

  return { permitido: esUsable(capability.madurez), navegable: true, motivo: "ok", mensaje: null, capability };
}

/** Controles que la interfaz puede mostrar. Nunca deben coexistir incompatibles. */
export type Control = "ejecutar" | "pausar" | "avisar" | "solo_lectura";

export function controlesPermitidos(estado: "operativo" | "proximamente", activo: boolean): Control[] {
  if (estado === "proximamente") return ["avisar", "solo_lectura"];
  return [activo ? "pausar" : "ejecutar"];
}

export function controlesSonCoherentes(controles: Control[]): boolean {
  const tiene = (c: Control) => controles.includes(c);
  if (tiene("avisar") && (tiene("ejecutar") || tiene("pausar"))) return false;
  if (tiene("ejecutar") && tiene("pausar")) return false;
  return controles.length > 0;
}
