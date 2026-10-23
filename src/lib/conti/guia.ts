// ─────────────────────────────────────────────────────────────────────────────
// PASOS DE GUÍA SELLADOS CAMPO POR CAMPO
//
// El modelo NO redacta pasos operativos de memoria: sólo puede redactar los
// campos que este módulo construye desde el registro de capacidades y el
// registro de ayuda. Todo lo que no esté en un campo, no existe.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CAPABILITIES,
  MADUREZ_LABEL,
  getCapability,
  getCapabilityByRoute,
  type Capability,
  type Madurez,
} from "@/lib/capabilities/registry";
import { nivelDeCapacidad } from "@/lib/capabilities/enfoque";
import { HELP_REGISTRY } from "@/lib/help/registry";
import { advertenciaPorMadurez } from "./capacidades";

export type PasoGuia = {
  capabilityId: string;
  nombre: string;
  ruta: string;
  madurez: Madurez;
  descripcion: string;
  prerequisites: string[];
  availableActions: string[];
  completionCriteria: string[];
  limitations: string[];
  externalDependencies: string[];
  evidenceSource: string;
};

export const SIN_CRITERIO_REGISTRADO =
  "ContaClick todavía no tiene un criterio automático registrado para declarar terminado este paso. Requiere revisión del contador.";

/** Alcance registrado del validador 69-B: nunca se presenta como garantía. */
export const EFOS_ALCANCE =
  "Revisa los proveedores contra el listado disponible. El resultado depende de la fecha de corte y no sustituye la consulta oficial.";

const DEP_LABEL: Record<string, string> = {
  ia: "Inteligencia artificial (consume créditos)",
  sat: "Servicios del SAT",
  pac: "Proveedor autorizado de certificación",
  correo: "Envío de correo",
  almacenamiento: "Almacenamiento de archivos",
  banco: "Archivo de estado de cuenta bancario",
};

/** Contenido de ayuda registrado para una capacidad, si existe. */
function ayudaDe(cap: Capability) {
  return Object.values(HELP_REGISTRY).find((h) => {
    const c = getCapability(h.slug);
    if (c?.id === cap.id) return true;
    return h.title.toLowerCase() === cap.nombre.toLowerCase();
  });
}

export function pasoGuia(capabilityId: string): PasoGuia | null {
  const cap = getCapability(capabilityId);
  if (!cap || cap.madurez === "obsoleta" || nivelDeCapacidad(cap) === "oculta") return null;
  const ayuda = ayudaDe(cap);

  const prerequisites = (ayuda?.dependencias.necesita ?? [])
    .map((d) => `${d.tool}: ${d.motivo}`)
    .concat(ayuda?.dependencias.datosMinimos.map((d) => `Dato mínimo: ${d}`) ?? []);

  const availableActions = (ayuda?.tutorial ?? []).map((p) => p.titulo);

  const limitations = [advertenciaPorMadurez(cap)].filter((x): x is string => Boolean(x));
  if (cap.id === "efos-validator") limitations.push(EFOS_ALCANCE);

  const externalDependencies = cap.dependencias
    .filter((d) => d !== "ninguna")
    .map((d) => DEP_LABEL[d] ?? d);

  return {
    capabilityId: cap.id,
    nombre: cap.nombre,
    ruta: cap.ruta,
    madurez: cap.madurez,
    descripcion: cap.descripcion,
    prerequisites,
    availableActions,
    // El registro no declara criterios automáticos de terminación. Mientras no
    // existan, ningún paso puede presentarse como "terminado" por una métrica.
    completionCriteria: cap.criteriosTerminacion ?? [],
    limitations,
    externalDependencies,
    evidenceSource: `Registro de capacidades de ContaClick (id: ${cap.id}, validado ${cap.ultimaValidacion})${
      ayuda ? ` + guía operativa registrada "${ayuda.title}"` : ""
    }`,
  };
}

/** Todos los pasos disponibles para Guía, en el orden del registro. */
export function pasosGuia(): PasoGuia[] {
  return CAPABILITIES.map((c) => pasoGuia(c.id)).filter((p): p is PasoGuia => p !== null);
}

/** Datos internos que toda recomendación de navegación debe llevar. */
export type Navegacion = {
  capabilityId: string;
  nombre: string;
  ruta: string;
  madurez: Madurez;
};

export function navegacionPara(ruta: string): Navegacion | null {
  const c = getCapabilityByRoute(ruta);
  if (!c || c.madurez === "obsoleta" || nivelDeCapacidad(c) === "oculta") return null;
  return { capabilityId: c.id, nombre: c.nombre, ruta: c.ruta, madurez: c.madurez };
}

function lista(titulo: string, items: string[], vacio: string): string {
  if (items.length === 0) return `  ${titulo}: ${vacio}`;
  return `  ${titulo}:\n${items.map((i) => `    - ${i}`).join("\n")}`;
}

/** Digest sellado que se inyecta al modelo en modo Guía. */
export function digestPasosGuia(): string {
  return pasosGuia()
    .map((p) =>
      [
        `### ${p.nombre} (capabilityId: ${p.capabilityId})`,
        `  ruta: ${p.ruta}`,
        `  madurez: ${MADUREZ_LABEL[p.madurez]}`,
        `  descripcion: ${p.descripcion}`,
        lista("prerequisites", p.prerequisites, "ninguno registrado — no inventes ninguno"),
        lista("availableActions", p.availableActions, "ninguna registrada"),
        lista("completionCriteria", p.completionCriteria, `vacío — responde exactamente: "${SIN_CRITERIO_REGISTRADO}"`),
        lista("limitations", p.limitations, "ninguna registrada"),
        lista("externalDependencies", p.externalDependencies, "ninguna"),
        `  evidenceSource: ${p.evidenceSource}`,
      ].join("\n"),
    )
    .join("\n\n");
}

export const REGLA_PASOS_GUIA = `PASOS DE GUÍA SELLADOS:
- Cada paso que describas debe corresponder a un capabilityId de la lista sellada de abajo. Si no tiene capabilityId, no lo menciones.
- Sólo puedes redactar el contenido de estos campos: nombre, ruta, madurez, descripcion, prerequisites, availableActions, completionCriteria, limitations, externalDependencies.
- PROHIBIDO crear prerrequisitos, cantidades, umbrales, porcentajes de avance, nombres de estados ("Enviado", "Sin alertas rojas"), criterios de terminación, botones, pestañas, módulos, salidas o documentos que no aparezcan literalmente en esos campos.
- Si completionCriteria está vacío, escribe exactamente: "${SIN_CRITERIO_REGISTRADO}"
- Si prerequisites está vacío, di que no hay prerrequisitos registrados. No inventes ninguno.
- Enlaza cada paso con su ruta registrada usando el nombre registrado: [nombre registrado](ruta registrada).
- Sobre el Validador 69-B / EFOS usa exactamente: "${EFOS_ALCANCE}" y nunca prometas que ningún proveedor está en listas negras.`;
