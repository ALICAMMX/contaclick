// ─────────────────────────────────────────────────────────────────────────────
// FUENTE ÚNICA del flujo contable mensual de ContaClick.
//
// Ninguna pantalla, capacidad o función servidora debe mantener su propia lista
// de etapas: todo se deriva de `ETAPAS`. Las rutas especializadas siguen
// existiendo; aquí sólo se declara el orden, las dependencias y los criterios.
// ─────────────────────────────────────────────────────────────────────────────

export const EVALUADOR_VERSION = "flujo-mensual@1";

export type EtapaId =
  | "documentos"
  | "clasificacion"
  | "bancos"
  | "polizas"
  | "impuestos"
  | "cierre";

export type EstadoEtapa =
  | "no_iniciada"
  | "en_proceso"
  | "bloqueada"
  | "lista"
  | "aprobada"
  | "reabierta"
  | "no_aplica";

export type Madurez = "operativa" | "beta" | "en_construccion";

export type Etapa = {
  id: EtapaId;
  nombre: string;
  orden: number;
  capacidad: string;
  ruta: string;
  dependencias: EtapaId[];
  criterios: string[];
  acciones: string[];
  limitaciones: string[];
  madurez: Madurez;
  permiteNoAplica: boolean;
};

export const ETAPAS: Etapa[] = [
  {
    id: "documentos",
    nombre: "Documentos",
    orden: 1,
    capacidad: "cierre-mensual",
    ruta: "/app/cfdi",
    dependencias: [],
    criterios: [
      "Corte documentado con las direcciones descargadas",
      "CFDI del periodo normalizados desde su XML original",
      "Sin excepciones documentales pendientes de decisión",
    ],
    acciones: ["Registrar corte", "Reprocesar XML", "Decidir excepciones"],
    limitaciones: ["No certifica que el SAT no vaya a entregar comprobantes posteriores."],
    madurez: "operativa",
    permiteNoAplica: false,
  },
  {
    id: "clasificacion",
    nombre: "Clasificación fiscal",
    orden: 2,
    capacidad: "deducibility-checker",
    ruta: "/app/tools/deducibility-checker",
    dependencias: ["documentos"],
    criterios: [
      "Cada CFDI recibido del periodo tiene una decisión fiscal vigente",
      "Ninguna decisión proviene únicamente de una sugerencia de IA",
      "Los CFDI con estatus desconocido quedan como por revisar",
    ],
    acciones: ["Revisar deducibilidad", "Registrar decisión humana"],
    limitaciones: [
      "El validador de deducibilidad usa IA: sus salidas son sugerencias, nunca decisiones.",
      "La persistencia estructurada de decisiones fiscales aún no está implementada (etapa manual).",
    ],
    madurez: "beta",
    permiteNoAplica: false,
  },
  {
    id: "bancos",
    nombre: "Bancos y conciliación",
    orden: 3,
    capacidad: "conciliacion",
    ruta: "/app/conciliacion",
    dependencias: ["clasificacion"],
    criterios: [
      "Estados de cuenta cargados para el periodo",
      "Movimientos conciliados, aceptados con motivo o marcados como pendientes",
      "Tolerancias configuradas y visibles",
    ],
    acciones: ["Cargar estado de cuenta", "Conciliar", "Aceptar diferencia con motivo"],
    limitaciones: [
      "Sin movimientos cargados la cobertura es 0%, nunca 100%.",
      "Una conciliación automática es una propuesta hasta su confirmación humana.",
    ],
    madurez: "operativa",
    permiteNoAplica: true,
  },
  {
    id: "polizas",
    nombre: "Pólizas",
    orden: 4,
    capacidad: "contabilidad-auto",
    ruta: "/app/polizas",
    dependencias: ["bancos"],
    criterios: [
      "Toda póliza propuesta cuadra al centavo (debe = haber)",
      "Ninguna póliza queda con cuenta “por identificar”",
      "Las pólizas necesarias están confirmadas por una persona",
    ],
    acciones: ["Generar propuestas", "Aprobar póliza", "Rechazar con motivo"],
    limitaciones: [
      "Contabilidad automática es beta: genera únicamente borradores.",
      "Las cuentas genéricas “por identificar” bloquean la aprobación.",
    ],
    madurez: "beta",
    permiteNoAplica: true,
  },
  {
    id: "impuestos",
    nombre: "Impuestos preliminares",
    orden: 5,
    capacidad: "isr-iva-calculator",
    ruta: "/app/reportes/resumen-fiscal",
    dependencias: ["polizas"],
    criterios: [
      "Régimen del expediente confirmado y soportado",
      "Cálculo preliminar vigente con normativa sellada",
      "Sin entradas estimadas ni ceros por ausencia de datos",
    ],
    acciones: ["Calcular preliminar", "Confirmar parámetros"],
    limitaciones: [
      "No presenta declaraciones ni promete el monto definitivo.",
      "Régimen ausente o no soportado ⇒ “no evaluable”, nunca un motor por aproximación.",
    ],
    madurez: "beta",
    permiteNoAplica: false,
  },
  {
    id: "cierre",
    nombre: "Revisión y cierre",
    orden: 6,
    capacidad: "cierre-mensual",
    ruta: "/app/cierre",
    dependencias: ["impuestos"],
    criterios: [
      "Todas las etapas previas listas, aprobadas o “no aplica” justificado",
      "Sin pólizas bloqueadas y sin excepciones pendientes",
      "Confirmación humana con motivo y huella de las fuentes",
    ],
    acciones: ["Revisar resumen", "Cerrar periodo", "Reabrir con motivo"],
    limitaciones: [
      "El cierre es documental y contable interno: no envía nada al SAT.",
      "El snapshot inmutable del cierre aún no está implementado.",
    ],
    madurez: "en_construccion",
    permiteNoAplica: false,
  },
];

export const ETAPAS_POR_ID = Object.fromEntries(ETAPAS.map((e) => [e.id, e])) as Record<EtapaId, Etapa>;

export const ORDEN_ETAPAS: EtapaId[] = ETAPAS.map((e) => e.id);

/** Estados que cuentan como “dependencia satisfecha”. */
export const ESTADOS_SATISFECHOS: EstadoEtapa[] = ["lista", "aprobada", "no_aplica"];

export function dependenciasSatisfechas(
  etapa: EtapaId,
  estados: Partial<Record<EtapaId, EstadoEtapa>>,
): { ok: boolean; faltantes: EtapaId[] } {
  const faltantes = ETAPAS_POR_ID[etapa].dependencias.filter(
    (d) => !ESTADOS_SATISFECHOS.includes(estados[d] ?? "no_iniciada"),
  );
  return { ok: faltantes.length === 0, faltantes };
}

export type Disparador = "cfdi" | "clasificacion" | "banco" | "poliza" | "parametro_fiscal";

/** Etapas que se reabren en cascada por cada tipo de cambio (espejo del RPC). */
export const CASCADA: Record<Disparador, EtapaId[]> = {
  cfdi: ["documentos", "clasificacion", "bancos", "polizas", "impuestos", "cierre"],
  clasificacion: ["clasificacion", "polizas", "impuestos", "cierre"],
  banco: ["bancos", "polizas", "impuestos", "cierre"],
  poliza: ["polizas", "impuestos", "cierre"],
  parametro_fiscal: ["impuestos", "cierre"],
};

/** Sólo se reabre lo que estaba declarado; nunca se pierde la bitácora previa. */
export function etapasAReabrir(
  disparador: Disparador,
  estados: Partial<Record<EtapaId, EstadoEtapa>>,
): EtapaId[] {
  return CASCADA[disparador].filter((e) => {
    const est = estados[e];
    return est === "lista" || est === "aprobada";
  });
}

/** Siguiente acción recomendada: primera etapa que no está satisfecha. */
export function siguienteAccion(estados: Partial<Record<EtapaId, EstadoEtapa>>): Etapa | null {
  for (const etapa of ETAPAS) {
    const estado = estados[etapa.id] ?? "no_iniciada";
    if (!ESTADOS_SATISFECHOS.includes(estado)) return etapa;
  }
  return null;
}

/** Tono visual honesto: nunca verde por ausencia de datos. */
export function tonoEstado(estado: EstadoEtapa): "exito" | "advertencia" | "peligro" | "neutro" {
  switch (estado) {
    case "aprobada":
    case "lista":
      return "exito";
    case "bloqueada":
      return "peligro";
    case "reabierta":
    case "en_proceso":
      return "advertencia";
    case "no_aplica":
    case "no_iniciada":
    default:
      return "neutro";
  }
}

export const ETIQUETA_ESTADO: Record<EstadoEtapa, string> = {
  no_iniciada: "No iniciada",
  en_proceso: "En proceso",
  bloqueada: "Bloqueada",
  lista: "Lista",
  aprobada: "Aprobada",
  reabierta: "Reabierta",
  no_aplica: "No aplica",
};
