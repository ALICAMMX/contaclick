// ─────────────────────────────────────────────────────────────────────────────
// RUTA GUIADA DEL EXPEDIENTE — lógica pura.
//
// El contador sólo carga 5 cosas (CSF, expediente, e.firma, XML, banco).
// Todo lo demás se deriva. Este módulo traduce un "snapshot" de datos reales
// del expediente a los pasos de la ruta, SIN inventar estados: si no hay dato,
// el paso queda "pendiente", nunca "listo".
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoPaso = "listo" | "pendiente" | "bloqueado" | "atencion";

export type PasoRuta = {
  id: string;
  numero: number;
  titulo: string;
  descripcion: string;
  /** Qué se desbloquea automáticamente al completarlo. */
  desbloquea: string[];
  ruta: string;
  accion: string;
  estado: EstadoPaso;
  detalle: string;
  /** Motivo por el que está bloqueado (sólo cuando estado === "bloqueado"). */
  bloqueadoPor?: string;
};

export type SnapshotRuta = {
  /** Datos fiscales del expediente ya capturados (régimen y domicilio). */
  regimenFiscal: string | null;
  domicilioFiscal: string | null;
  codigoPostal: string | null;
  csfUltimaEmision: string | null;
  obligaciones: number;
  /** Credencial e.firma del expediente. */
  efirmaEstatus: string | null;
  /** Veredicto del resolvedor central de e.firma (fuente única de verdad). */
  efirmaUtilizable?: boolean | null;
  /** Mensaje del resolvedor cuando la credencial existe pero no es utilizable. */
  efirmaMensaje?: string | null;
  efirmaVenceAt: string | null;
  efirmaUltimaSync: string | null;
  /** Comprobantes del periodo. */
  cfdiPeriodo: number;
  cfdiSinOriginal: number;
  /** Movimientos bancarios del periodo. */
  movimientosPeriodo: number;
  cuentasBancarias: number;
  /** Estado del cierre mensual por etapa (etapa → estado). */
  etapas: Record<string, string>;
  /** Decisiones fiscales que aún requieren criterio humano. */
  decisionesPendientes: number;
  /** Pólizas borrador sin aprobar. */
  polizasBorrador: number;
};

function fechaVencida(iso: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t < Date.now();
}

/** Construye los pasos en el orden real de trabajo del contador. */
export function construirRuta(s: SnapshotRuta): PasoRuta[] {
  // 1 · Constancia de Situación Fiscal
  const csfListo = !!s.regimenFiscal;
  const paso1: PasoRuta = {
    id: "csf",
    numero: 1,
    titulo: "Cargar la Constancia de Situación Fiscal",
    descripcion: "Sube el PDF de la CSF. De ahí se extraen régimen, obligaciones y domicilio fiscal.",
    desbloquea: ["Régimen fiscal del expediente", "Calendario de obligaciones", "Motores de impuestos por régimen"],
    ruta: "/app/tools/csf-parser",
    accion: csfListo ? "Volver a leer la CSF" : "Leer CSF",
    estado: csfListo ? "listo" : "pendiente",
    detalle: csfListo
      ? `Régimen ${s.regimenFiscal}${s.obligaciones > 0 ? ` · ${s.obligaciones} obligaciones` : ""}`
      : "Sin régimen fiscal registrado.",
  };

  // 2 · Datos del expediente
  const datosListo = csfListo && !!s.domicilioFiscal && !!s.codigoPostal;
  const paso2: PasoRuta = {
    id: "expediente",
    numero: 2,
    titulo: "Completar el expediente",
    descripcion: "Verifica razón social, domicilio y código postal. Se autollenan desde la CSF.",
    desbloquea: ["Emisión de reportes y papeles de trabajo", "Aislamiento de datos por expediente"],
    ruta: "/app/clientes",
    accion: "Revisar expediente",
    estado: datosListo ? "listo" : csfListo ? "pendiente" : "bloqueado",
    bloqueadoPor: csfListo ? undefined : "Falta leer la CSF (paso 1).",
    detalle: datosListo
      ? "Domicilio fiscal y código postal capturados."
      : csfListo
        ? "Falta domicilio fiscal o código postal."
        : "Se completa solo al leer la CSF.",
  };

  // 3 · e.firma — no depende del domicilio: sólo del material criptográfico.
  // El veredicto viene del resolvedor central; los estatus de texto son respaldo.
  const efirmaVencida = fechaVencida(s.efirmaVenceAt);
  const efirmaActiva =
    s.efirmaUtilizable === true ||
    (s.efirmaUtilizable == null &&
      (s.efirmaEstatus === "activo" || s.efirmaEstatus === "activa" || s.efirmaEstatus === "conectada"));
  const efirmaAtencion = !efirmaActiva && (efirmaVencida || (s.efirmaUtilizable === false && !!s.efirmaEstatus));
  const paso3: PasoRuta = {
    id: "efirma",
    numero: 3,
    titulo: "Conectar la e.firma",
    descripcion: "Sube .cer, .key y contraseña. Se guardan cifrados y habilitan la descarga directa con el SAT.",
    desbloquea: ["Descarga Masiva SAT sin costo de PAC", "Evidencia SAT de cada comprobante"],
    ruta: "/app/sat-sync",
    accion: efirmaActiva ? "Administrar credencial" : "Conectar e.firma",
    estado: efirmaActiva ? "listo" : efirmaAtencion ? "atencion" : csfListo ? "pendiente" : "bloqueado",
    bloqueadoPor: csfListo ? undefined : "Falta leer la CSF (paso 1).",
    detalle: efirmaActiva
      ? s.efirmaUltimaSync
        ? `Última sincronización: ${new Date(s.efirmaUltimaSync).toLocaleString("es-MX")}`
        : "Credencial conectada. Aún no se ejecuta una descarga."
      : efirmaVencida
        ? "El certificado está vencido. Renueva la e.firma en el SAT y vuelve a cargarla."
        : efirmaAtencion
          ? (s.efirmaMensaje ?? "La credencial registrada no es utilizable.")
          : "Sin credencial. Puedes seguir sin ella cargando los XML a mano.",
  };

  // 4 · CFDI del periodo
  const hayCfdi = s.cfdiPeriodo > 0;
  const paso4: PasoRuta = {
    id: "cfdi",
    numero: 4,
    titulo: "Traer los CFDI del mes",
    descripcion: "Descarga masiva con el SAT o carga tus XML. Se normalizan y clasifican automáticamente.",
    desbloquea: ["Clasificación fiscal", "Validador de deducibilidad", "Pólizas borrador", "Impuestos preliminares"],
    ruta: efirmaActiva && !efirmaVencida ? "/app/sat-sync" : "/app/cfdi",
    accion: efirmaActiva && !efirmaVencida ? "Descargar del SAT" : "Cargar XML",
    estado: hayCfdi ? (s.cfdiSinOriginal > 0 ? "atencion" : "listo") : csfListo ? "pendiente" : "bloqueado",
    bloqueadoPor: csfListo ? undefined : "Falta leer la CSF (paso 1).",
    detalle: hayCfdi
      ? s.cfdiSinOriginal > 0
        ? `${s.cfdiPeriodo} comprobantes · ${s.cfdiSinOriginal} sin XML original verificado`
        : `${s.cfdiPeriodo} comprobantes con XML original verificado`
      : "Sin comprobantes en este periodo.",
  };

  // 5 · Bancos
  const hayBanco = s.movimientosPeriodo > 0;
  const paso5: PasoRuta = {
    id: "bancos",
    numero: 5,
    titulo: "Subir el estado de cuenta",
    descripcion: "Carga los movimientos del mes. El conciliador los cruza contra los CFDI.",
    desbloquea: ["Conciliación bancaria", "Diagnóstico de flujo", "Etapa de bancos del cierre"],
    ruta: "/app/conciliacion",
    accion: hayBanco ? "Ver conciliación" : "Subir estado de cuenta",
    estado: hayBanco ? "listo" : hayCfdi ? "pendiente" : "bloqueado",
    bloqueadoPor: hayCfdi ? undefined : "Primero trae los CFDI del mes (paso 4).",
    detalle: hayBanco
      ? `${s.movimientosPeriodo} movimientos en el periodo · ${s.cuentasBancarias} cuenta(s)`
      : s.cuentasBancarias > 0
        ? "Cuentas registradas, sin movimientos en este periodo."
        : "Sin cuentas bancarias registradas.",
  };

  // 6 · Revisión humana + cierre
  const cerrado = s.etapas["cierre"] === "sellado" || s.etapas["cierre"] === "lista";
  const pendientesHumanos = s.decisionesPendientes + s.polizasBorrador;
  const paso6: PasoRuta = {
    id: "cierre",
    numero: 6,
    titulo: "Revisar y cerrar el mes",
    descripcion: "Lo único que exige tu criterio: deducibilidad dudosa, aprobación de pólizas y sellado del periodo.",
    desbloquea: ["Impuestos preliminares", "Manifiesto sellado del periodo", "Reportes y entregables"],
    ruta: "/app/cierre",
    accion: "Abrir Centro de Cierre",
    estado: cerrado ? "listo" : pendientesHumanos > 0 ? "atencion" : hayCfdi ? "pendiente" : "bloqueado",
    bloqueadoPor: hayCfdi ? undefined : "Primero trae los CFDI del mes (paso 4).",
    detalle: cerrado
      ? "Periodo sellado."
      : pendientesHumanos > 0
        ? `${s.decisionesPendientes} decisiones de deducibilidad y ${s.polizasBorrador} pólizas borrador esperan tu revisión.`
        : hayCfdi
          ? "Sin pendientes de criterio humano registrados."
          : "Se habilita cuando haya comprobantes.",
  };

  return [paso1, paso2, paso3, paso4, paso5, paso6];
}

/** Progreso honesto: sólo cuentan los pasos realmente completos. */
export function progresoRuta(pasos: PasoRuta[]): { listos: number; total: number; porcentaje: number } {
  const listos = pasos.filter((p) => p.estado === "listo").length;
  const total = pasos.length;
  return { listos, total, porcentaje: Math.round((listos / total) * 100) };
}

/** Siguiente acción sugerida: el primer paso accionable en orden. */
export function siguientePaso(pasos: PasoRuta[]): PasoRuta | null {
  return pasos.find((p) => p.estado === "pendiente" || p.estado === "atencion") ?? null;
}
