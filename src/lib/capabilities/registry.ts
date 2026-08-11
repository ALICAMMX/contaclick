// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO CENTRAL DE CAPACIDADES DE CONTACLICK
//
// Fuente única de verdad sobre qué existe, en qué estado de madurez está,
// quién puede usarlo y qué dependencias externas consume.
//
// Menús, catálogos, tarjetas, contadores y guardas de ruta DEBEN leer de aquí.
// Está prohibido mantener listas paralelas de herramientas.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlanId } from "@/lib/payments/plans";

export type Madurez =
  | "operativa" // funciona de principio a fin con datos reales
  | "operativa_limitada" // funciona, pero con alcance recortado y documentado
  | "beta" // funciona, resultados sujetos a validación humana
  | "demostracion" // solo muestra datos sintéticos; no produce entregables reales
  | "proximamente" // sin implementación real
  | "obsoleta"; // duplicada o reemplazada; se conserva como alias/redirección

export type Modulo = "contable" | "administrativo" | "legal" | "agentes" | "plataforma";

export type Dependencia = "ia" | "sat" | "pac" | "correo" | "almacenamiento" | "banco" | "ninguna";

export type Permiso = "miembro" | "admin_despacho" | "super_admin";

export type Capability = {
  id: string;
  nombre: string;
  ruta: string;
  modulo: Modulo;
  grupo: string;
  madurez: Madurez;
  /**
   * @deprecated Regla comercial 2026: TODAS las herramientas están incluidas en
   * todos los planes. Debe permanecer vacío; se conserva sólo por compatibilidad
   * de tipos y lo verifica la suite de pruebas.
   */
  planes: PlanId[];

  permiso: Permiso;
  dependencias: Dependencia[];
  /** true si procesa/produce información real del despacho. */
  datosReales: boolean;
  /** true si sus salidas son sintéticas y NO deben tratarse como entregable. */
  datosSinteticos: boolean;
  /** Visible en menús y catálogos generales. */
  visibleEnMenu: boolean;
  /** Mensaje a mostrar cuando la herramienta no está disponible. */
  mensajeNoDisponible: string | null;
  ultimaValidacion: string; // ISO date
  responsable: string;
  descripcion: string;
  /**
   * Criterios registrados y verificables para declarar terminado este paso.
   * Vacío/ausente = ContaClick NO tiene criterio automático: está prohibido
   * que la IA invente uno (umbrales, "sin alertas rojas", estados, etc.).
   */
  criteriosTerminacion?: string[];

};

const HOY = "2026-08-05";

const SIN_IMPL = "Esta función aún no tiene implementación real. No genera resultados ni entregables.";
const SOLO_DEMO =
  "Vista de demostración con datos sintéticos. No refleja información de tus expedientes ni puede exportarse como entregable.";

function cap(c: Partial<Capability> & Pick<Capability, "id" | "nombre" | "ruta" | "modulo" | "grupo" | "madurez" | "descripcion">): Capability {
  const proxima = c.madurez === "proximamente";
  const demo = c.madurez === "demostracion";
  return {
    planes: [],
    permiso: "miembro",
    dependencias: ["ninguna"],
    datosReales: !proxima && !demo,
    datosSinteticos: demo,
    visibleEnMenu: !proxima,
    mensajeNoDisponible: proxima ? SIN_IMPL : demo ? SOLO_DEMO : null,
    ultimaValidacion: HOY,
    responsable: c.modulo,
    ...c,
  } as Capability;
}

// ── Módulo Contable y Fiscal ────────────────────────────────────────────────
const CONTABLE: Capability[] = [
  cap({ id: "csf-parser", nombre: "Lector de Constancia Fiscal", ruta: "/app/tools/csf-parser", modulo: "contable", grupo: "1 · Alta del expediente", madurez: "operativa", dependencias: ["ia", "almacenamiento"], descripcion: "Extrae régimen, obligaciones y domicilio desde la CSF en PDF." }),
  cap({ id: "calendario", nombre: "Calendario fiscal", ruta: "/app/calendario", modulo: "contable", grupo: "1 · Alta del expediente", madurez: "operativa", descripcion: "Obligaciones del expediente con semáforo y autogeneración anual." }),
  cap({ id: "tareas", nombre: "Centro de Tareas", ruta: "/app/tareas", modulo: "contable", grupo: "1 · Alta del expediente", madurez: "operativa", descripcion: "Kanban, lista y productividad del despacho." }),
  cap({ id: "workflows", nombre: "Workflow Automático", ruta: "/app/workflows", modulo: "contable", grupo: "1 · Alta del expediente", madurez: "beta", dependencias: ["ia"], descripcion: "Motor de automatización con triggers y acciones entre módulos." }),
  cap({ id: "salud-fiscal", nombre: "Salud Fiscal", ruta: "/app/salud-fiscal", modulo: "contable", grupo: "1 · Alta del expediente", madurez: "operativa", descripcion: "Score integral 0-100 sobre información real del expediente." }),

  cap({ id: "xml-bulk-reader", nombre: "Lector masivo de XML", ruta: "/app/tools/xml-bulk-reader", modulo: "contable", grupo: "2 · Ingesta de CFDI", madurez: "operativa", descripcion: "Procesa ZIP del SAT y extrae la tabla de comprobantes." }),
  cap({ id: "cfdi-validator", nombre: "Validador CFDI 4.0", ruta: "/app/tools/cfdi-validator", modulo: "contable", grupo: "2 · Ingesta de CFDI", madurez: "operativa", descripcion: "Valida estructura, RFC, totales y UUID." }),
  cap({ id: "cfdi-verifier", nombre: "Verificador de UUID", ruta: "/app/tools/cfdi-verifier", modulo: "contable", grupo: "2 · Ingesta de CFDI", madurez: "operativa_limitada", descripcion: "Valida el formato del UUID y prepara la consulta al SAT. La verificación en línea depende del webservice del SAT." }),
  cap({ id: "cfdi", nombre: "CFDI del expediente", ruta: "/app/cfdi", modulo: "contable", grupo: "2 · Ingesta de CFDI", madurez: "operativa", descripcion: "Bandeja unificada del cliente activo." }),
  cap({ id: "sat-sync", nombre: "Descarga Masiva SAT", ruta: "/app/sat-sync", modulo: "contable", grupo: "2 · Ingesta de CFDI", madurez: "operativa", dependencias: ["sat", "pac", "almacenamiento"], descripcion: "Sincronización de CFDI con el SAT usando credencial del expediente." }),
  cap({
    id: "cierre-mensual",
    nombre: "Centro de cierre mensual (documental + seguimiento de flujo)",
    ruta: "/app/cierre",
    modulo: "contable",
    grupo: "2 · Ingesta de CFDI",
    madurez: "operativa_limitada",
    descripcion:
      "Orquesta el flujo contable mensual en seis etapas (documentos, clasificación, bancos, pólizas, impuestos preliminares y cierre) con estados, dependencias, reapertura en cascada y bitácora inmutable. Sólo la etapa documental está automatizada de extremo a extremo; las demás se declaran manualmente desde su módulo especializado. No presenta declaraciones ni cierra contabilidad de forma automática.",
    criteriosTerminacion: [
      "Todo CFDI del periodo tiene UUID, RFC y tipo legibles.",
      "Ningún CFDI ajeno al RFC del expediente permanece sin decisión.",
      "Duplicados y relaciones PPD/Pago resueltos o aceptados con motivo.",
      "Direcciones descargadas y fecha de corte documentadas.",
      "Sin excepciones bloqueantes pendientes.",
      "Las etapas posteriores dependen de la anterior y sólo las declara una persona.",
      "Pendiente: evaluación automática de clasificación, bancos, pólizas e impuestos, y snapshot inmutable de cierre.",
    ],
  }),



  cap({ id: "express-auditor", nombre: "Auditor express", ruta: "/app/tools/express-auditor", modulo: "contable", grupo: "3 · Auditoría y Conciliación", madurez: "operativa", descripcion: "Duplicados, NC huérfanas, cancelados, PPD sin pago y fuera de periodo." }),
  cap({ id: "conciliacion", nombre: "Conciliador bancario", ruta: "/app/conciliacion", modulo: "contable", grupo: "3 · Auditoría y Conciliación", madurez: "operativa", dependencias: ["banco", "almacenamiento"], descripcion: "Cruza estado de cuenta contra CFDI." }),
  cap({ id: "conciliacion-historial", nombre: "Conciliación del expediente", ruta: "/app/conciliacion/historial", modulo: "contable", grupo: "3 · Auditoría y Conciliación", madurez: "operativa", descripcion: "Histórico mensual con semáforo." }),
  cap({ id: "conciliacion-integral", nombre: "Conciliación SAT vs Contabilidad", ruta: "/app/conciliacion-integral", modulo: "contable", grupo: "3 · Auditoría y Conciliación", madurez: "operativa", descripcion: "Cruza CFDI, pólizas y banco con impacto fiscal." }),
  cap({ id: "polizas", nombre: "Pólizas contables", ruta: "/app/polizas", modulo: "contable", grupo: "3 · Auditoría y Conciliación", madurez: "operativa", descripcion: "Importa, captura y administra pólizas." }),
  cap({ id: "contabilidad-auto", nombre: "Contabilidad automática (CFDI → Pólizas)", ruta: "/app/contabilidad-auto", modulo: "contable", grupo: "3 · Auditoría y Conciliación", madurez: "beta", descripcion: "Genera pólizas borrador desde CFDI. Requiere revisión y aprobación humana." }),

  cap({ id: "isr-iva-calculator", nombre: "Calculadora ISR / IVA — PF", ruta: "/app/tools/isr-iva-calculator", modulo: "contable", grupo: "4 · Cálculo de impuestos", madurez: "operativa", descripcion: "Pago provisional mensual PF con tarifas vigentes 2026." }),
  cap({ id: "isr-iva-pm", nombre: "Calculadora ISR / IVA — PM", ruta: "/app/tools/isr-iva-pm", modulo: "contable", grupo: "4 · Cálculo de impuestos", madurez: "operativa", descripcion: "Pago provisional PM con coeficiente de utilidad." }),
  cap({ id: "resico-calculator", nombre: "Calculadora RESICO PF", ruta: "/app/tools/resico-calculator", modulo: "contable", grupo: "4 · Cálculo de impuestos", madurez: "operativa", descripcion: "ISR mensual RESICO PF." }),
  cap({ id: "precios-transferencia", nombre: "Precios de transferencia", ruta: "/app/tools/precios-transferencia", modulo: "contable", grupo: "4 · Cálculo de impuestos", madurez: "proximamente", descripcion: "Análisis de operaciones con partes relacionadas." }),

  cap({ id: "riesgo", nombre: "Riesgo SAT 2026", ruta: "/app/riesgo", modulo: "contable", grupo: "5 · Defensa SAT", madurez: "operativa", descripcion: "Score sobre los 12 criterios, con cobertura mínima obligatoria." }),
  cap({ id: "deducibility-checker", nombre: "Validador de Deducibilidad", ruta: "/app/tools/deducibility-checker", modulo: "contable", grupo: "5 · Defensa SAT", madurez: "beta", dependencias: ["ia"], descripcion: "Cruza CFDI recibidos contra LISR 27 y 28. Requiere criterio profesional." }),
  cap({ id: "efos-validator", nombre: "Validador 69-B / EFOS", ruta: "/app/tools/efos-validator", modulo: "contable", grupo: "5 · Defensa SAT", madurez: "operativa_limitada", descripcion: "Cruza proveedores contra la lista 69-B cargada en la plataforma; no consulta el portal del SAT en vivo." }),
  cap({ id: "import-prices", nombre: "Validador de Precios de Importación", ruta: "/app/tools/import-prices", modulo: "contable", grupo: "5 · Defensa SAT", madurez: "beta", dependencias: ["ia"], descripcion: "Comparables internos y memo justificativo (LISR 76-A, 179)." }),
  cap({ id: "shadow-payroll", nombre: "Detector de Nómina Oculta", ruta: "/app/tools/shadow-payroll", modulo: "contable", grupo: "5 · Defensa SAT", madurez: "beta", descripcion: "Pagos recurrentes a PF sin CFDI de nómina." }),
  cap({ id: "sat-risk", nombre: "Analizador de Riesgo SAT", ruta: "/app/tools/sat-risk", modulo: "contable", grupo: "5 · Defensa SAT", madurez: "obsoleta", visibleEnMenu: false, descripcion: "Alias histórico. Reemplazado por /app/riesgo." }),

  cap({ id: "reportes", nombre: "Reportes del expediente", ruta: "/app/reportes", modulo: "contable", grupo: "6 · Cierre & Entregables", madurez: "operativa", descripcion: "Papeles de trabajo en PDF y Excel." }),
  cap({ id: "reporte-ejecutivo", nombre: "Reporte Ejecutivo + Agente IA", ruta: "/app/reporte-ejecutivo", modulo: "contable", grupo: "6 · Cierre & Entregables", madurez: "beta", dependencias: ["ia"], descripcion: "Reporte tipo CFO advisor con hallazgos y recomendaciones." }),
  cap({ id: "oficio-generator", nombre: "Generador de oficios SAT", ruta: "/app/tools/oficio-generator", modulo: "contable", grupo: "6 · Cierre & Entregables", madurez: "operativa", descripcion: "Plantillas personalizadas con datos del expediente." }),

  cap({ id: "fiscal-assistant", nombre: "Asistente fiscal IA", ruta: "/app/tools/fiscal-assistant", modulo: "contable", grupo: "7 · IA siempre activa", madurez: "operativa", dependencias: ["ia"], descripcion: "Consulta de legislación con contexto del expediente." }),
  cap({ id: "agentes", nombre: "Mis Agentes IA", ruta: "/app/contable/agentes", modulo: "agentes", grupo: "7 · IA siempre activa", madurez: "operativa_limitada", descripcion: "Panel de agentes: cuatro operativos, el resto en desarrollo." }),
  cap({ id: "mensajes", nombre: "Mensajería IA", ruta: "/app/mensajes", modulo: "contable", grupo: "7 · IA siempre activa", madurez: "operativa", dependencias: ["ia", "correo"], descripcion: "Redacta y envía recordatorios a clientes." }),
  cap({ id: "import-clientes", nombre: "Importar cartera (Excel)", ruta: "/app/tools/import-clientes", modulo: "contable", grupo: "1 · Alta del expediente", madurez: "operativa", descripcion: "Migra cartera desde Excel o CSV sin duplicados." }),
];

// ── Módulo Administrativo & RH ──────────────────────────────────────────────
const ADMINISTRATIVO: Capability[] = [
  cap({ id: "tesoreria", nombre: "Tesorería", ruta: "/app/admin/tesoreria", modulo: "administrativo", grupo: "1 · Operación diaria", madurez: "beta", descripcion: "Flujo de caja y cuentas por cobrar/pagar." }),
  cap({ id: "tramites", nombre: "Gestor de Trámites", ruta: "/app/admin/tramites", modulo: "administrativo", grupo: "1 · Operación diaria", madurez: "operativa", descripcion: "Kanban con semáforo por vencimiento." }),
  cap({ id: "buzon", nombre: "Bandeja de Notificaciones IA", ruta: "/app/admin/buzon", modulo: "administrativo", grupo: "2 · Comunicaciones", madurez: "operativa_limitada", dependencias: ["ia", "almacenamiento"], descripcion: "Analiza PDFs de notificaciones. No se conecta al Buzón Tributario oficial." }),
  cap({ id: "correspondencia", nombre: "Correspondencia & Minutas", ruta: "/app/admin/correspondencia", modulo: "administrativo", grupo: "2 · Comunicaciones", madurez: "operativa", dependencias: ["ia"], descripcion: "Generador de oficios, minutas y respuestas formales." }),
  cap({ id: "nomina", nombre: "Auditor de Nómina + Simulador", ruta: "/app/admin/nomina", modulo: "administrativo", grupo: "3 · Personal & RH", madurez: "operativa_limitada", descripcion: "Audita CFDI de nómina y simula costo patronal. No timbra." }),
  cap({ id: "cumplimiento", nombre: "Cumplimiento Laboral", ruta: "/app/admin/cumplimiento", modulo: "administrativo", grupo: "3 · Personal & RH", madurez: "operativa", descripcion: "Checklist IMSS/INFONAVIT/SAT/STPS con evidencia." }),
  cap({ id: "activos", nombre: "Activos Fijos", ruta: "/app/admin/activos", modulo: "administrativo", grupo: "4 · Patrimonio", madurez: "operativa", descripcion: "MOI, depreciación fiscal y contable, cédula anual." }),
  cap({ id: "inventarios", nombre: "Inventarios", ruta: "/app/admin/inventarios", modulo: "administrativo", grupo: "4 · Patrimonio", madurez: "proximamente", visibleEnMenu: false, descripcion: "Kardex derivado de CFDI. Sin implementación real: la vista actual es una maqueta con datos sintéticos." }),
];

// ── Módulo Inteligencia Legal ───────────────────────────────────────────────
const LEGAL: Capability[] = [
  cap({ id: "legal-consulta-ia", nombre: "Consulta a la Ley (IA)", ruta: "/app/legal/consulta-ia", modulo: "legal", grupo: "Análisis", madurez: "beta", dependencias: ["ia"], descripcion: "Respuesta con cita del artículo (CFF, LISR, LIVA, RMF)." }),
  cap({ id: "legal-lagunas", nombre: "Mapa de Lagunas Legales", ruta: "/app/legal/lagunas", modulo: "legal", grupo: "Análisis", madurez: "operativa_limitada", descripcion: "Catálogo curado de huecos normativos; las defensas que actives sí se guardan en el expediente. El catálogo no se genera analizando tus datos." }),
  cap({ id: "legal-redactor", nombre: "Redactor de Escritos", ruta: "/app/legal/redactor", modulo: "legal", grupo: "Redacción", madurez: "beta", dependencias: ["ia"], descripcion: "Borradores de defensa con fundamento. Requiere revisión de abogado." }),
  cap({ id: "legal-marketplace", nombre: "Marketplace Legal", ruta: "/app/legal/marketplace", modulo: "legal", grupo: "Red profesional", madurez: "demostracion", descripcion: "Directorio ilustrativo. Los despachos mostrados son ejemplos, no proveedores contratables todavía." }),
];

// ── Plataforma (no son herramientas de catálogo) ────────────────────────────
const PLATAFORMA: Capability[] = [
  cap({ id: "expedientes", nombre: "Expedientes", ruta: "/app/clientes", modulo: "plataforma", grupo: "Plataforma", madurez: "operativa", descripcion: "Alta y administración de expedientes." }),
  cap({ id: "equipo", nombre: "Equipo", ruta: "/app/equipo", modulo: "plataforma", grupo: "Plataforma", madurez: "operativa", permiso: "admin_despacho", descripcion: "Miembros, roles e invitaciones." }),
  cap({ id: "configuracion", nombre: "Configuración", ruta: "/app/configuracion", modulo: "plataforma", grupo: "Plataforma", madurez: "operativa", descripcion: "Preferencias del despacho y seguridad." }),
  cap({ id: "admin-panel", nombre: "Panel de administración", ruta: "/app/admin-panel", modulo: "plataforma", grupo: "Plataforma", madurez: "operativa", permiso: "super_admin", visibleEnMenu: false, descripcion: "Operación interna de ContaClick." }),
  cap({ id: "admin-sat-saldo", nombre: "Saldo del servicio SAT", ruta: "/app/admin-sat-saldo", modulo: "plataforma", grupo: "Plataforma", madurez: "operativa", permiso: "super_admin", visibleEnMenu: false, dependencias: ["pac"], descripcion: "Control del saldo operativo de descargas." }),
];

export const CAPABILITIES: Capability[] = [...CONTABLE, ...ADMINISTRATIVO, ...LEGAL, ...PLATAFORMA];

// ── Agentes ─────────────────────────────────────────────────────────────────

export type AgenteEstado = "operativo" | "proximamente";

export type Agente = {
  id: string;
  nombre: string;
  rol: string;
  trigger: string;
  /** ids de capacidades que utiliza. */
  herramientas: string[];
  estado: AgenteEstado;
  ruta: string | null;
  datos: string;
  permiso: Permiso;
  /** Acciones externas que puede ejecutar por sí mismo. */
  accionesExternas: Dependencia[];
  consumeCreditos: boolean;
  requiereAprobacionHumana: boolean;
  tieneBitacora: boolean;
  /** Comportamiento ante error. */
  ante_fallo: string;
  mensajeNoDisponible: string | null;
};

export const AGENTES: Agente[] = [
  {
    id: "cfdi", nombre: "CFDI", rol: "Valida cada XML recibido y emitido", trigger: "Llega un XML nuevo",
    herramientas: ["cfdi-validator", "cfdi-verifier", "express-auditor"], estado: "operativo", ruta: "/app/contable/agente-cfdi",
    datos: "CFDI del expediente activo", permiso: "miembro", accionesExternas: [], consumeCreditos: false,
    requiereAprobacionHumana: true, tieneBitacora: true,
    ante_fallo: "Se detiene, deja el hallazgo en bitácora y no modifica registros.", mensajeNoDisponible: null,
  },
  {
    id: "conciliacion", nombre: "Conciliación", rol: "Cruza bancos contra CFDI", trigger: "Se carga un estado de cuenta",
    herramientas: ["conciliacion"], estado: "operativo", ruta: "/app/contable/agente-conciliacion",
    datos: "Movimientos bancarios y CFDI del expediente activo", permiso: "miembro", accionesExternas: [], consumeCreditos: false,
    requiereAprobacionHumana: true, tieneBitacora: true,
    ante_fallo: "Marca la corrida como incompleta y conserva los movimientos sin conciliar.", mensajeNoDisponible: null,
  },
  {
    id: "auditor", nombre: "Auditor", rol: "Hallazgos preventivos de cierre", trigger: "Ejecución manual o día 25",
    herramientas: ["express-auditor", "deducibility-checker"], estado: "operativo", ruta: "/app/contable/agente-auditor",
    datos: "CFDI y pólizas del expediente activo", permiso: "miembro", accionesExternas: [], consumeCreditos: false,
    requiereAprobacionHumana: true, tieneBitacora: true,
    ante_fallo: "Reporta los hallazgos parciales obtenidos y señala la etapa fallida.", mensajeNoDisponible: null,
  },
  {
    id: "cierre", nombre: "Cierre", rol: "Pre-cierre mensual", trigger: "Ejecución manual o día 28",
    herramientas: ["isr-iva-calculator", "resico-calculator"], estado: "operativo", ruta: "/app/contable/agente-cierre",
    datos: "CFDI del periodo y parámetros fiscales vigentes", permiso: "miembro", accionesExternas: [], consumeCreditos: false,
    requiereAprobacionHumana: true, tieneBitacora: true,
    ante_fallo: "No publica provisión; deja el cálculo en borrador.", mensajeNoDisponible: null,
  },
  {
    id: "fiscal-sat", nombre: "Fiscal SAT", rol: "Vigilancia de los criterios de riesgo", trigger: "Pendiente de implementación",
    herramientas: ["riesgo", "efos-validator"], estado: "proximamente", ruta: null,
    datos: "—", permiso: "miembro", accionesExternas: [], consumeCreditos: false,
    requiereAprobacionHumana: true, tieneBitacora: false,
    ante_fallo: "—", mensajeNoDisponible: "Aún no está implementado. Mientras tanto, usa Riesgo SAT 2026 y el Validador 69-B de forma manual.",
  },
  {
    id: "corporativo", nombre: "Corporativo-Fiscal", rol: "Operaciones con partes relacionadas", trigger: "Pendiente de implementación",
    herramientas: ["precios-transferencia"], estado: "proximamente", ruta: null,
    datos: "—", permiso: "miembro", accionesExternas: [], consumeCreditos: false,
    requiereAprobacionHumana: true, tieneBitacora: false,
    ante_fallo: "—", mensajeNoDisponible: "Depende del módulo de Precios de transferencia, que todavía no existe.",
  },
  {
    id: "defensa", nombre: "Defensa", rol: "Estrategias ante requerimientos", trigger: "Pendiente de implementación",
    herramientas: ["legal-lagunas", "legal-redactor"], estado: "proximamente", ruta: null,
    datos: "—", permiso: "miembro", accionesExternas: [], consumeCreditos: false,
    requiereAprobacionHumana: true, tieneBitacora: false,
    ante_fallo: "—", mensajeNoDisponible: "Aún no está implementado. El Redactor de Escritos (beta) cubre parte del flujo.",
  },
  {
    id: "materialidad", nombre: "Materialidad", rol: "Soporte documental de operaciones", trigger: "Pendiente de implementación",
    herramientas: ["deducibility-checker"], estado: "proximamente", ruta: null,
    datos: "—", permiso: "miembro", accionesExternas: [], consumeCreditos: false,
    requiereAprobacionHumana: true, tieneBitacora: false,
    ante_fallo: "—", mensajeNoDisponible: "Aún no está implementado.",
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

export function getCapability(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}

export function getCapabilityByRoute(ruta: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.ruta === ruta);
}

export function capabilitiesByModule(modulo: Modulo): Capability[] {
  return CAPABILITIES.filter((c) => c.modulo === modulo);
}

/** Herramientas que un catálogo debe mostrar (excluye ocultas y obsoletas). */
export function catalogo(modulo: Modulo): Capability[] {
  return CAPABILITIES.filter((c) => c.modulo === modulo && c.visibleEnMenu && c.madurez !== "obsoleta");
}

export const MADUREZ_LABEL: Record<Madurez, string> = {
  operativa: "Operativa",
  operativa_limitada: "Operativa con limitaciones",
  beta: "Beta",
  demostracion: "Demostración",
  proximamente: "Próximamente",
  obsoleta: "Obsoleta",
};

/** Estados en los que la herramienta produce resultados reales y utilizables. */
export function esUsable(m: Madurez): boolean {
  return m === "operativa" || m === "operativa_limitada" || m === "beta";
}

/** Contadores oficiales para encabezados y tarjetas. */
export function contadores(modulo: Modulo) {
  const items = catalogo(modulo);
  return {
    total: items.length,
    operativas: items.filter((c) => c.madurez === "operativa" || c.madurez === "operativa_limitada").length,
    beta: items.filter((c) => c.madurez === "beta").length,
    demo: items.filter((c) => c.madurez === "demostracion").length,
    proximamente: items.filter((c) => c.madurez === "proximamente").length,
  };
}

export function contadoresAgentes() {
  return {
    total: AGENTES.length,
    operativos: AGENTES.filter((a) => a.estado === "operativo").length,
    proximamente: AGENTES.filter((a) => a.estado === "proximamente").length,
  };
}
