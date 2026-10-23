// ─────────────────────────────────────────────────────────────────────────────
// ENFOQUE DEL PRODUCTO — qué se muestra y qué se oculta, sin borrar código.
//
// ContaClick resuelve el trabajo mensual del despacho: descarga del SAT,
// revisión de CFDI, conciliación bancaria, pólizas exportables y cierre del
// mes para despachos con muchos RFC. Lo que no sirve a ese flujo se oculta de
// menús, inicio y buscador. Las rutas siguen existiendo (nadie pierde datos)
// y cada módulo se puede volver a encender cambiando una sola bandera.
// ─────────────────────────────────────────────────────────────────────────────

import { CAPABILITIES, type Capability, type Modulo } from "./registry";

/** Módulos completos encendidos. Apagar uno lo saca de menús e inicio. */
export const MODULOS_ACTIVOS: Record<Modulo, boolean> = {
  contable: true,
  plataforma: true,
  // Fuera del foco: nómina, tesorería, activos, trámites → candidatos a AdminClick.
  administrativo: false,
  // Fuera del foco: defensa legal → corresponde a AbogaClick.
  legal: false,
  // Los agentes trabajan dentro de cada pantalla; no son un menú aparte.
  agentes: false,
};

/** Las seis pantallas del trabajo mensual, en el orden en que se usan. */
export type PasoFlujo = {
  id: string;
  numero: number;
  titulo: string;
  descripcion: string;
  ruta: string;
};

export const FLUJO_MENSUAL: PasoFlujo[] = [
  { id: "sat-sync", numero: 1, titulo: "Descargar CFDI del SAT", descripcion: "Emitidos y recibidos con la e.firma, todos los días, sin costo de PAC.", ruta: "/app/sat-sync" },
  { id: "cfdi", numero: 2, titulo: "Revisar comprobantes", descripcion: "Validación, 69-B, cancelados y deducibilidad en una sola bandeja.", ruta: "/app/cfdi" },
  { id: "conciliacion", numero: 3, titulo: "Conciliar el banco", descripcion: "Sube el estado de cuenta; el motor propone y tú confirmas.", ruta: "/app/conciliacion" },
  { id: "polizas", numero: 4, titulo: "Pólizas y exportación", descripcion: "Borradores desde CFDI y exportación a CONTPAQi, Aspel COI o XML del SAT.", ruta: "/app/polizas" },
  { id: "cierre-mensual", numero: 5, titulo: "Cerrar el mes", descripcion: "Decisiones pendientes, impuestos preliminares y sello del periodo.", ruta: "/app/cierre" },
  { id: "reportes", numero: 6, titulo: "Entregables", descripcion: "Papeles de trabajo y resumen para tu cliente.", ruta: "/app/reportes" },
];

/**
 * Herramientas de apoyo: útiles, pero no son el camino principal.
 * Se muestran agrupadas y plegadas debajo del flujo.
 */
export const HERRAMIENTAS_APOYO: { grupo: string; ids: string[] }[] = [
  { grupo: "Alta y cartera", ids: ["csf-parser", "import-clientes", "calendario", "tareas"] },
  { grupo: "Revisión fiscal", ids: ["efos-validator", "deducibility-checker", "express-auditor", "conciliacion-integral", "riesgo", "salud-fiscal"] },
  { grupo: "CFDI sueltos", ids: ["xml-bulk-reader", "cfdi-validator"] },
  { grupo: "Cálculo", ids: ["isr-iva-calculator", "isr-iva-pm", "resico-calculator"] },
  { grupo: "Asistente", ids: ["fiscal-assistant"] },
];

/**
 * Capacidades del módulo contable que quedan ocultas aunque el módulo esté
 * encendido: duplicadas por otra pantalla o fuera del foco.
 */
export const OCULTAS: string[] = [
  "contabilidad-auto", // unificada en /app/polizas
  "conciliacion-historial", // vista secundaria de /app/conciliacion
  "cfdi-verifier", // cubierto por el validador y la bandeja de CFDI
  "workflows",
  "mensajes",
  "import-prices",
  "shadow-payroll",
  "oficio-generator",
  "reporte-ejecutivo",
  "agentes",
];

const IDS_FLUJO = new Set(FLUJO_MENSUAL.map((p) => p.id));
const IDS_APOYO = new Set(HERRAMIENTAS_APOYO.flatMap((g) => g.ids));
const IDS_OCULTAS = new Set(OCULTAS);

export type Nivel = "flujo" | "apoyo" | "oculta";

/** Prefijos de ruta que pertenecen a módulos completos. */
const PREFIJOS_MODULO: { prefijo: string; modulo: Modulo }[] = [
  { prefijo: "/app/admin/", modulo: "administrativo" },
  { prefijo: "/app/legal", modulo: "legal" },
  { prefijo: "/app/contable/agente", modulo: "agentes" },
];

export function nivelDeCapacidad(c: Capability): Nivel {
  if (!MODULOS_ACTIVOS[c.modulo]) return "oculta";
  if (!c.visibleEnMenu || c.madurez === "obsoleta" || c.madurez === "proximamente") return "oculta";
  if (IDS_OCULTAS.has(c.id)) return "oculta";
  if (IDS_FLUJO.has(c.id)) return "flujo";
  if (IDS_APOYO.has(c.id)) return "apoyo";
  // Plataforma (expedientes, equipo, configuración) siempre accesible.
  if (c.modulo === "plataforma") return "apoyo";
  return "oculta";
}

/** Nivel de una ruta cualquiera (para menús y buscador). */
export function nivelDeRuta(ruta: string): Nivel {
  const c = CAPABILITIES.find((x) => x.ruta === ruta);
  if (c) return nivelDeCapacidad(c);
  const m = PREFIJOS_MODULO.find((p) => ruta.startsWith(p.prefijo));
  if (m && !MODULOS_ACTIVOS[m.modulo]) return "oculta";
  return "apoyo";
}

export function rutaVisible(ruta: string): boolean {
  return nivelDeRuta(ruta) !== "oculta";
}

/** Herramientas de apoyo resueltas contra el registro (sólo las visibles). */
export function herramientasApoyo(): { grupo: string; items: Capability[] }[] {
  return HERRAMIENTAS_APOYO.map((g) => ({
    grupo: g.grupo,
    items: g.ids
      .map((id) => CAPABILITIES.find((c) => c.id === id))
      .filter((c): c is Capability => !!c && nivelDeCapacidad(c) === "apoyo"),
  })).filter((g) => g.items.length > 0);
}
