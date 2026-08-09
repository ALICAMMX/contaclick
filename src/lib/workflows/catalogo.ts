// Catálogo de triggers, acciones y templates para el Workflow Automático.
// Esta es la fuente única de verdad de los bloques disponibles en el builder.

import {
  FileCode2,
  Inbox,
  CalendarClock,
  AlertTriangle,
  Banknote,
  FileSearch,
  Sparkles,
  ListChecks,
  BellRing,
  FileBarChart,
  Calculator,
  ShieldAlert,
  MessageSquare,
  Mail,
  Upload,
  Timer,
  GitBranch,
  type LucideIcon,
} from "lucide-react";

export type TriggerKind =
  | "xml_uploaded"
  | "obligacion_creada"
  | "buzon_notif"
  | "tarea_vencida"
  | "estado_bancario_subido"
  | "documento_cliente_subido"
  | "riesgo_alto_detectado"
  | "cron";

export type ActionKind =
  // núcleo
  | "validar_cfdi"
  | "auditor_express"
  | "conciliacion_bancaria"
  | "calcular_isr"
  | "calcular_iva"
  | "actualizar_score_riesgo"
  | "generar_tarea"
  | "crear_alerta"
  | "generar_reporte"
  // comunicación
  | "solicitar_documento_cliente"
  | "notificar_responsable";

export type ConditionKind = "riesgo_mayor" | "monto_mayor" | "tiene_tag" | "personalizada";

export type NodeType = "trigger" | "action" | "condition";

export interface CatalogEntry {
  kind: string;
  label: string;
  descripcion: string;
  icon: LucideIcon;
  tipo: NodeType;
  /**
   * false = la acción NO está implementada. No se ofrece en el constructor y el
   * servidor la rechaza (falla cerrado). Nunca devuelve resultados simulados.
   */
  implementada?: boolean;
  paramsSchema?: Record<string, { label: string; type: "text" | "number" | "select" | "boolean"; options?: string[]; default?: any }>;
}


export const TRIGGERS: Record<TriggerKind, CatalogEntry> = {
  xml_uploaded: { kind: "xml_uploaded", tipo: "trigger", label: "XML cargado", icon: Upload, descripcion: "Se dispara al subir un CFDI nuevo." },
  obligacion_creada: { kind: "obligacion_creada", tipo: "trigger", label: "Nueva obligación", icon: CalendarClock, descripcion: "Al crear una obligación fiscal." },
  buzon_notif: { kind: "buzon_notif", tipo: "trigger", label: "Notificación SAT", icon: Inbox, descripcion: "Cuando llega una notificación al Buzón." },
  tarea_vencida: { kind: "tarea_vencida", tipo: "trigger", label: "Tarea vencida", icon: AlertTriangle, descripcion: "Al detectar tareas pasadas de su fecha." },
  estado_bancario_subido: { kind: "estado_bancario_subido", tipo: "trigger", label: "Estado bancario subido", icon: Banknote, descripcion: "Al cargar un estado de cuenta." },
  documento_cliente_subido: { kind: "documento_cliente_subido", tipo: "trigger", label: "Documento del cliente", icon: FileCode2, descripcion: "Cuando el cliente sube algo al portal." },
  riesgo_alto_detectado: { kind: "riesgo_alto_detectado", tipo: "trigger", label: "Riesgo SAT alto", icon: ShieldAlert, descripcion: "Cuando el score de riesgo rebasa el umbral." },
  cron: {
    kind: "cron",
    tipo: "trigger",
    label: "Programado",
    icon: Timer,
    descripcion: "Cada cierta frecuencia (cron interno).",
    paramsSchema: {
      frecuencia: { label: "Frecuencia", type: "select", options: ["cada_hora", "cada_2_horas", "diario", "diario_9am", "semanal_lunes", "ultimo_dia_mes"], default: "diario" },
    },
  },
};

export const ACTIONS: Record<ActionKind, CatalogEntry> = {
  // ── SIN IMPLEMENTACIÓN ──────────────────────────────────────────────────
  // Estas acciones nunca ejecutaron nada real: devolvían un texto fijo. Se
  // conservan en el tipo para que los workflows guardados sigan leyéndose,
  // pero no se ofrecen y el motor las rechaza.
  validar_cfdi: { kind: "validar_cfdi", tipo: "action", implementada: false, label: "Validar CFDI", icon: FileCode2, descripcion: "Sin implementación automática. Usa el Validador CFDI." },
  auditor_express: { kind: "auditor_express", tipo: "action", implementada: false, label: "Auditor Express", icon: Sparkles, descripcion: "Sin implementación automática. Ejecútalo desde su herramienta." },
  conciliacion_bancaria: { kind: "conciliacion_bancaria", tipo: "action", implementada: false, label: "Conciliación bancaria", icon: Banknote, descripcion: "Sin implementación automática. Usa el módulo de Conciliación." },
  calcular_isr: { kind: "calcular_isr", tipo: "action", implementada: false, label: "Calcular ISR", icon: Calculator, descripcion: "Sin implementación automática. Usa la calculadora ISR/IVA." },
  calcular_iva: { kind: "calcular_iva", tipo: "action", implementada: false, label: "Calcular IVA", icon: Calculator, descripcion: "Sin implementación automática. Usa la calculadora ISR/IVA." },
  actualizar_score_riesgo: { kind: "actualizar_score_riesgo", tipo: "action", implementada: false, label: "Actualizar score", icon: ShieldAlert, descripcion: "Sin implementación automática. Recalcula desde Riesgo SAT." },

  generar_tarea: {
    kind: "generar_tarea",
    tipo: "action",
    label: "Generar tarea",
    icon: ListChecks,
    descripcion: "Crea una tarea en el Centro de Tareas.",
    paramsSchema: {
      titulo: { label: "Título", type: "text", default: "Tarea automática" },
      prioridad: { label: "Prioridad", type: "select", options: ["baja", "media", "alta", "critica"], default: "media" },
      tipo: { label: "Tipo", type: "select", options: ["declaracion", "conciliacion", "tramite_sat", "requerimiento", "otro"], default: "otro" },
    },
  },
  crear_alerta: {
    kind: "crear_alerta",
    tipo: "action",
    label: "Crear alerta",
    icon: BellRing,
    descripcion: "Levanta una alerta interna.",
    paramsSchema: {
      titulo: { label: "Título", type: "text", default: "Alerta automática" },
      nivel: { label: "Nivel", type: "select", options: ["info", "advertencia", "critico"], default: "advertencia" },
    },
  },
  generar_reporte: { kind: "generar_reporte", tipo: "action", implementada: false, label: "Generar reporte", icon: FileBarChart, descripcion: "Sin implementación automática. Genera el reporte desde su módulo." },
  solicitar_documento_cliente: {
    kind: "solicitar_documento_cliente",
    tipo: "action",
    label: "Solicitar documento",
    icon: MessageSquare,
    descripcion: "Envía mensaje al portal del cliente pidiendo un documento.",
    paramsSchema: {
      documento: { label: "Documento solicitado", type: "text", default: "Estado de cuenta del mes" },
    },
  },
  notificar_responsable: {
    kind: "notificar_responsable",
    tipo: "action",
    label: "Notificar responsable",
    icon: Mail,
    descripcion: "Notifica internamente al responsable del expediente.",
    paramsSchema: {
      asunto: { label: "Asunto", type: "text", default: "Nueva automatización ejecutada" },
    },
  },
};

export const CONDITIONS: Record<ConditionKind, CatalogEntry> = {
  riesgo_mayor: {
    kind: "riesgo_mayor",
    tipo: "condition",
    label: "Si riesgo SAT >",
    icon: GitBranch,
    descripcion: "Bifurca según el score de riesgo del cliente.",
    paramsSchema: { umbral: { label: "Umbral", type: "number", default: 70 } },
  },
  monto_mayor: {
    kind: "monto_mayor",
    tipo: "condition",
    label: "Si monto >",
    icon: GitBranch,
    descripcion: "Bifurca según el monto del CFDI / movimiento.",
    paramsSchema: { monto: { label: "Monto MXN", type: "number", default: 100000 } },
  },
  tiene_tag: {
    kind: "tiene_tag",
    tipo: "condition",
    label: "Si tiene etiqueta",
    icon: GitBranch,
    descripcion: "Verifica si el expediente lleva cierta etiqueta.",
    paramsSchema: { tag: { label: "Etiqueta", type: "text", default: "" } },
  },
  personalizada: {
    kind: "personalizada",
    tipo: "condition",
    label: "Condición personalizada",
    icon: GitBranch,
    descripcion: "Texto libre evaluado por la IA supervisora.",
    paramsSchema: { expresion: { label: "Expresión", type: "text", default: "" } },
  },
};

// -------- Templates listos --------

export interface WorkflowNode {
  id: string;
  type: NodeType;
  kind: string;
  params?: Record<string, any>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  from: string;
  to: string;
}

export interface WorkflowTemplate {
  key: string;
  nombre: string;
  descripcion: string;
  trigger_type: TriggerKind;
  trigger_config?: Record<string, any>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  tag: "alta" | "media" | "baja";
}

export const TEMPLATES: WorkflowTemplate[] = [
  {
    key: "carga_xml",
    nombre: "Carga de XML",
    descripcion: "Cuando se sube un CFDI: lo valida, corre auditor, revisa deducibilidad y actualiza riesgo.",
    trigger_type: "xml_uploaded",
    tag: "alta",
    nodes: [
      { id: "t1", type: "trigger", kind: "xml_uploaded", position: { x: 40, y: 60 } },
      { id: "a1", type: "action", kind: "validar_cfdi", position: { x: 260, y: 60 } },
      { id: "a2", type: "action", kind: "auditor_express", position: { x: 480, y: 60 } },
      { id: "a3", type: "action", kind: "actualizar_score_riesgo", position: { x: 700, y: 60 } },
      { id: "c1", type: "condition", kind: "riesgo_mayor", params: { umbral: 70 }, position: { x: 920, y: 60 } },
      { id: "a4", type: "action", kind: "generar_tarea", params: { titulo: "Revisar CFDI de riesgo alto", prioridad: "alta", tipo: "requerimiento" }, position: { x: 1140, y: 60 } },
    ],
    edges: [
      { from: "t1", to: "a1" },
      { from: "a1", to: "a2" },
      { from: "a2", to: "a3" },
      { from: "a3", to: "c1" },
      { from: "c1", to: "a4" },
    ],
  },
  {
    key: "buzon_tributario",
    nombre: "Buzón Tributario",
    descripcion: "Cuando llega una notificación SAT: la analiza, clasifica, crea tarea y alerta al responsable.",
    trigger_type: "buzon_notif",
    tag: "alta",
    nodes: [
      { id: "t1", type: "trigger", kind: "buzon_notif", position: { x: 40, y: 60 } },
      { id: "a1", type: "action", kind: "auditor_express", position: { x: 260, y: 60 } },
      { id: "a2", type: "action", kind: "actualizar_score_riesgo", position: { x: 480, y: 60 } },
      { id: "a3", type: "action", kind: "generar_tarea", params: { titulo: "Atender notificación SAT", prioridad: "critica", tipo: "requerimiento" }, position: { x: 700, y: 60 } },
      { id: "a4", type: "action", kind: "notificar_responsable", params: { asunto: "Notificación SAT recibida" }, position: { x: 920, y: 60 } },
    ],
    edges: [
      { from: "t1", to: "a1" },
      { from: "a1", to: "a2" },
      { from: "a2", to: "a3" },
      { from: "a3", to: "a4" },
    ],
  },
  {
    key: "cierre_mensual",
    nombre: "Cierre mensual",
    descripcion: "Último día del mes: concilia bancos, calcula ISR e IVA, genera reporte y crea tareas pendientes.",
    trigger_type: "cron",
    trigger_config: { frecuencia: "ultimo_dia_mes" },
    tag: "alta",
    nodes: [
      { id: "t1", type: "trigger", kind: "cron", params: { frecuencia: "ultimo_dia_mes" }, position: { x: 40, y: 60 } },
      { id: "a1", type: "action", kind: "conciliacion_bancaria", position: { x: 260, y: 60 } },
      { id: "a2", type: "action", kind: "calcular_isr", position: { x: 480, y: 60 } },
      { id: "a3", type: "action", kind: "calcular_iva", position: { x: 700, y: 60 } },
      { id: "a4", type: "action", kind: "generar_reporte", position: { x: 920, y: 60 } },
      { id: "a5", type: "action", kind: "generar_tarea", params: { titulo: "Revisar cierre del mes", prioridad: "alta", tipo: "declaracion" }, position: { x: 1140, y: 60 } },
    ],
    edges: [
      { from: "t1", to: "a1" },
      { from: "a1", to: "a2" },
      { from: "a2", to: "a3" },
      { from: "a3", to: "a4" },
      { from: "a4", to: "a5" },
    ],
  },
  {
    key: "doc_cliente",
    nombre: "Documento recibido del cliente",
    descripcion: "Cuando el cliente sube un documento al portal: clasifica, notifica responsable y crea tarea de revisión.",
    trigger_type: "documento_cliente_subido",
    tag: "media",
    nodes: [
      { id: "t1", type: "trigger", kind: "documento_cliente_subido", position: { x: 40, y: 60 } },
      { id: "a1", type: "action", kind: "notificar_responsable", params: { asunto: "Documento del cliente recibido" }, position: { x: 260, y: 60 } },
      { id: "a2", type: "action", kind: "generar_tarea", params: { titulo: "Revisar documento del cliente", prioridad: "media", tipo: "otro" }, position: { x: 480, y: 60 } },
    ],
    edges: [
      { from: "t1", to: "a1" },
      { from: "a1", to: "a2" },
    ],
  },
  {
    key: "riesgo_alto",
    nombre: "Riesgo alto detectado",
    descripcion: "Cuando el score de riesgo del cliente sube de 80: crea alerta crítica y solicita documentación.",
    trigger_type: "riesgo_alto_detectado",
    tag: "alta",
    nodes: [
      { id: "t1", type: "trigger", kind: "riesgo_alto_detectado", position: { x: 40, y: 60 } },
      { id: "a1", type: "action", kind: "crear_alerta", params: { titulo: "Riesgo SAT alto", nivel: "critico" }, position: { x: 260, y: 60 } },
      { id: "a2", type: "action", kind: "solicitar_documento_cliente", params: { documento: "Estado de cuenta y CFDI faltantes" }, position: { x: 480, y: 60 } },
      { id: "a3", type: "action", kind: "generar_tarea", params: { titulo: "Plan de mitigación de riesgo", prioridad: "critica", tipo: "defensa" }, position: { x: 700, y: 60 } },
    ],
    edges: [
      { from: "t1", to: "a1" },
      { from: "a1", to: "a2" },
      { from: "a2", to: "a3" },
    ],
  },
];

// Mapeo frecuencia → minutos para programador
export function nextRunFromFrecuencia(frecuencia: string, base: Date = new Date()): Date {
  const d = new Date(base);
  switch (frecuencia) {
    case "cada_hora":
      d.setHours(d.getHours() + 1, 0, 0, 0);
      return d;
    case "cada_2_horas":
      d.setHours(d.getHours() + 2, 0, 0, 0);
      return d;
    case "diario":
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      return d;
    case "diario_9am": {
      const nd = new Date(d);
      nd.setHours(9, 0, 0, 0);
      if (nd <= d) nd.setDate(nd.getDate() + 1);
      return nd;
    }
    case "semanal_lunes": {
      const nd = new Date(d);
      const day = nd.getDay();
      const diff = (8 - day) % 7 || 7;
      nd.setDate(nd.getDate() + diff);
      nd.setHours(9, 0, 0, 0);
      return nd;
    }
    case "ultimo_dia_mes": {
      const nd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 0, 0, 0);
      if (nd <= d) {
        nd.setMonth(nd.getMonth() + 1);
        nd.setDate(0);
      }
      return nd;
    }
    default:
      d.setDate(d.getDate() + 1);
      return d;
  }
}

export function catalogEntry(type: NodeType, kind: string): CatalogEntry | null {
  if (type === "trigger") return (TRIGGERS as any)[kind] ?? null;
  if (type === "action") return (ACTIONS as any)[kind] ?? null;
  if (type === "condition") return (CONDITIONS as any)[kind] ?? null;
  return null;
}

/** Acciones realmente ejecutables por el motor. Fuente única. */
export function accionImplementada(kind: string): boolean {
  const e = (ACTIONS as any)[kind] as CatalogEntry | undefined;
  return !!e && e.implementada !== false;
}

/** Acciones ofrecidas en el constructor: sólo las implementadas. */
export const ACCIONES_DISPONIBLES: CatalogEntry[] = Object.values(ACTIONS).filter((a) => a.implementada !== false);

/**
 * Quita de una plantilla los nodos cuya acción no está implementada y vuelve a
 * unir la cadena, para que las plantillas nunca creen automatizaciones falsas.
 */
export function sanitizarPlantilla(tpl: WorkflowTemplate): { nodes: WorkflowNode[]; edges: WorkflowEdge[]; omitidos: string[] } {
  const omitidos = tpl.nodes.filter((n) => n.type === "action" && !accionImplementada(n.kind)).map((n) => n.id);
  if (!omitidos.length) return { nodes: tpl.nodes, edges: tpl.edges, omitidos };

  const fuera = new Set(omitidos);
  const nodes = tpl.nodes.filter((n) => !fuera.has(n.id));

  const salidas = new Map<string, string[]>();
  for (const e of tpl.edges) salidas.set(e.from, [...(salidas.get(e.from) ?? []), e.to]);
  const destinosVivos = (id: string, visto = new Set<string>()): string[] => {
    if (visto.has(id)) return [];
    visto.add(id);
    return (salidas.get(id) ?? []).flatMap((to) => (fuera.has(to) ? destinosVivos(to, visto) : [to]));
  };

  const vistos = new Set<string>();
  const edges: WorkflowEdge[] = [];
  for (const n of nodes) {
    for (const to of destinosVivos(n.id)) {
      const k = `${n.id}->${to}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      edges.push({ from: n.id, to });
    }
  }
  return { nodes, edges, omitidos };
}

