// ─────────────────────────────────────────────────────────────────────────────
// FUENTE DE VERDAD DE CAPACIDADES PARA CONTI
//
// Conti NO puede tener su propia lista de herramientas. Todo lo que afirme
// sobre qué existe, dónde vive y si sirve o no, se deriva del registro central.
// Si una herramienta está en "proximamente" o "demostracion", Conti está
// obligado a decirlo antes de recomendarla.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CAPABILITIES,
  MADUREZ_LABEL,
  esUsable,
  getCapabilityByRoute,
  type Capability,
} from "@/lib/capabilities/registry";
import { nivelDeCapacidad } from "@/lib/capabilities/enfoque";

export type HechoCapacidad = {
  id: string;
  nombre: string;
  ruta: string;
  modulo: string;
  madurez: Capability["madurez"];
  usable: boolean;
  permiso: Capability["permiso"];
  advertencia: string | null;
};

/** Advertencia obligatoria según madurez. null cuando no hace falta ninguna. */
export function advertenciaPorMadurez(c: Capability): string | null {
  switch (c.madurez) {
    case "proximamente":
      return "Aún no está implementada: no genera resultados ni entregables.";
    case "demostracion":
      return "Solo muestra datos sintéticos. No sirve como entregable ni refleja tus expedientes.";
    case "beta":
      return "En beta: los resultados requieren validación humana antes de usarse.";
    case "operativa_limitada":
      return c.mensajeNoDisponible ?? "Operativa con alcance recortado y documentado.";
    case "obsoleta":
      return "Reemplazada por otra herramienta; no la recomiendes.";
    default:
      return null;
  }
}

export function hechosCapacidades(): HechoCapacidad[] {
  return CAPABILITIES.filter((c) => c.madurez !== "obsoleta" && nivelDeCapacidad(c) !== "oculta").map((c) => ({
    id: c.id,
    nombre: c.nombre,
    ruta: c.ruta,
    modulo: c.modulo,
    madurez: c.madurez,
    usable: esUsable(c.madurez),
    permiso: c.permiso,
    advertencia: advertenciaPorMadurez(c),
  }));
}

/** Digest textual inyectado al modelo. Compacto y sin duplicar prosa. */
export function digestCapacidades(): string {
  const porModulo = new Map<string, HechoCapacidad[]>();
  for (const h of hechosCapacidades()) {
    const arr = porModulo.get(h.modulo) ?? [];
    arr.push(h);
    porModulo.set(h.modulo, arr);
  }
  const bloques: string[] = [];
  for (const [modulo, items] of porModulo) {
    const filas = items
      .map((h) => {
        const estado = MADUREZ_LABEL[h.madurez];
        const adv = h.advertencia ? ` | ADVERTENCIA OBLIGATORIA: ${h.advertencia}` : "";
        const permiso = h.permiso !== "miembro" ? ` | requiere: ${h.permiso}` : "";
        return `- [${h.nombre}](${h.ruta}) — estado: ${estado}${permiso}${adv}`;
      })
      .join("\n");
    bloques.push(`#### Módulo ${modulo}\n${filas}`);
  }
  return bloques.join("\n\n");
}

/**
 * Valida una recomendación antes de emitirla. Devuelve el texto de advertencia
 * que debe acompañarla, o `bloqueada` cuando no debe recomendarse en absoluto.
 */
export function validarRecomendacion(ruta: string): {
  existe: boolean;
  bloqueada: boolean;
  advertencia: string | null;
  nombre: string | null;
} {
  const c = getCapabilityByRoute(ruta);
  if (!c) return { existe: false, bloqueada: true, advertencia: null, nombre: null };
  return {
    existe: true,
    bloqueada: c.madurez === "obsoleta" || c.madurez === "proximamente" || nivelDeCapacidad(c) === "oculta",
    advertencia: advertenciaPorMadurez(c),
    nombre: c.nombre,
  };
}
