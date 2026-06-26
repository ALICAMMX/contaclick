// Perfiles de los 5 expedientes demo, calibrados por nivel de cumplimiento.
export const DEMO_TAG = "__DEMO_SHOWROOM__";

export type PerfilDemo = {
  idx: 1 | 2 | 3 | 4 | 5;
  rfc: string;
  razon: string;
  tipo_persona: "fisica" | "moral";
  regimen: string;
  email: string;
  telefono: string;
  semaforo: "verde" | "amarillo" | "rojo";
  score_salud: number;
  estado_mes: string;
  perfil_label: string;
  // Volumen
  cfdi_emitidos: number;
  cfdi_recibidos: number;
  // Distribución de conciliación (porcentaje matcheado)
  conciliacion_pct: number;
  // Alertas
  alertas: Array<{ nivel: "alto" | "medio" | "bajo"; tipo: string; titulo: string; descripcion: string }>;
  // Tareas
  tareas: Array<{ titulo: string; estatus: "pendiente" | "en_progreso" | "completada"; prioridad: "alta" | "media" | "baja" }>;
  // Hallazgos salud fiscal
  hallazgos: Array<{ titulo: string; gravedad: "alta" | "media" | "baja" }>;
  // Resumen ejecutivo IA (texto markdown precargado)
  resumen_ejecutivo: string;
  // Defensas abiertas
  defensas: Array<{ nombre: string; conflicto: string; potencial: string }>;
  // Trámites
  tramites: Array<{ titulo: string; autoridad: string; estado: "pendiente" | "en_proceso" | "resuelto" }>;
};

export const PERFILES_DEMO: PerfilDemo[] = [
  {
    idx: 1,
    rfc: "DEMOCEJ010101AA1",
    razon: "Constructora Ejemplar SA de CV",
    tipo_persona: "moral",
    regimen: "601",
    email: "contacto@constructoraejemplar.demo",
    telefono: "5550100001",
    semaforo: "verde",
    score_salud: 95,
    estado_mes: "Al corriente",
    perfil_label: "Cumplido modelo — 100% en regla",
    cfdi_emitidos: 18,
    cfdi_recibidos: 10,
    conciliacion_pct: 1.0,
    alertas: [],
    tareas: [
      { titulo: "Cierre mensual revisado", estatus: "completada", prioridad: "media" },
      { titulo: "Conciliación bancaria confirmada", estatus: "completada", prioridad: "media" },
      { titulo: "Reporte ejecutivo enviado al cliente", estatus: "completada", prioridad: "baja" },
    ],
    hallazgos: [],
    resumen_ejecutivo: `# Reporte ejecutivo — Constructora Ejemplar SA de CV

**Estado general:** 🟢 Excelente (95/100)

- Todas las obligaciones fiscales presentadas en tiempo y forma.
- Conciliación bancaria al 100%, sin movimientos huérfanos.
- CFDI emitidos y recibidos cuadran con bancos y contabilidad.
- Sin alertas activas, sin operaciones con proveedores en listas 69-B.
- Opinión de cumplimiento positiva vigente.

**Recomendaciones:** Mantener la disciplina actual. Considerar deducciones adicionales por inversiones en activo fijo del último trimestre.`,
    defensas: [],
    tramites: [{ titulo: "Renovación de e.firma", autoridad: "SAT", estado: "resuelto" }],
  },
  {
    idx: 2,
    rfc: "DEMGAR850515HM4",
    razon: "Ana García Rodríguez",
    tipo_persona: "fisica",
    regimen: "626",
    email: "ana.garcia@correo.demo",
    telefono: "5550100002",
    semaforo: "verde",
    score_salud: 82,
    estado_mes: "Al corriente con observaciones menores",
    perfil_label: "Buen contribuyente con detalles menores",
    cfdi_emitidos: 12,
    cfdi_recibidos: 6,
    conciliacion_pct: 0.85,
    alertas: [
      { nivel: "bajo", tipo: "cfdi_revision", titulo: "2 CFDI sin conciliar", descripcion: "Hay 2 CFDI recibidos que aún no se han conciliado con movimientos bancarios." },
    ],
    tareas: [
      { titulo: "Conciliar 2 CFDI pendientes", estatus: "pendiente", prioridad: "baja" },
      { titulo: "Presentar declaración mensual RESICO", estatus: "en_progreso", prioridad: "media" },
    ],
    hallazgos: [
      { titulo: "2 CFDI recibidos sin conciliar", gravedad: "baja" },
    ],
    resumen_ejecutivo: `# Reporte ejecutivo — Ana García Rodríguez (RESICO PF)

**Estado general:** 🟢 Bueno (82/100)

- Cumplimiento general adecuado, declaraciones RESICO al día.
- Conciliación al 85%, 2 CFDI recibidos pendientes de identificar en banco.
- Sin alertas críticas, sin proveedores riesgosos.

**Recomendaciones:** Cerrar las 2 incidencias menores de conciliación. Configurar recordatorio mensual de declaración el día 15.`,
    defensas: [],
    tramites: [],
  },
  {
    idx: 3,
    rfc: "DEMCNO020202BB2",
    razon: "Comercializadora Norte SA",
    tipo_persona: "moral",
    regimen: "601",
    email: "admin@comercializadoranorte.demo",
    telefono: "5550100003",
    semaforo: "amarillo",
    score_salud: 65,
    estado_mes: "Declaración mensual pendiente",
    perfil_label: "Regular — atención requerida",
    cfdi_emitidos: 22,
    cfdi_recibidos: 15,
    conciliacion_pct: 0.70,
    alertas: [
      { nivel: "medio", tipo: "obligacion_vencida", titulo: "Declaración IVA del mes anterior pendiente", descripcion: "No se ha presentado la declaración mensual de IVA del periodo anterior. Plazo vencido hace 3 días." },
      { nivel: "medio", tipo: "complemento_pago", titulo: "5 CFDI PPD sin complemento de pago", descripcion: "Hay 5 facturas en parcialidades que no tienen complemento de pago registrado." },
      { nivel: "bajo", tipo: "cfdi_revision", titulo: "8 movimientos bancarios sin identificar", descripcion: "Hay depósitos en banco sin CFDI asociado." },
    ],
    tareas: [
      { titulo: "Presentar declaración IVA mensual (vencida)", estatus: "pendiente", prioridad: "alta" },
      { titulo: "Generar complementos de pago pendientes", estatus: "pendiente", prioridad: "alta" },
      { titulo: "Identificar 8 depósitos bancarios", estatus: "en_progreso", prioridad: "media" },
      { titulo: "Solicitar XML faltantes a proveedores", estatus: "pendiente", prioridad: "media" },
    ],
    hallazgos: [
      { titulo: "Declaración mensual no presentada", gravedad: "alta" },
      { titulo: "Faltan 5 complementos de pago", gravedad: "media" },
      { titulo: "30% de movimientos bancarios sin identificar", gravedad: "media" },
    ],
    resumen_ejecutivo: `# Reporte ejecutivo — Comercializadora Norte SA

**Estado general:** 🟡 Atención requerida (65/100)

- Declaración mensual de IVA **vencida hace 3 días** — riesgo de multa por extemporaneidad.
- 5 facturas PPD sin complemento de pago — riesgo de no deducibilidad para el cliente.
- 30% de movimientos bancarios sin conciliar — falta visibilidad de flujo.

**Recomendaciones urgentes:**
1. Presentar declaración IVA en las próximas 48h para minimizar multa.
2. Generar complementos de pago faltantes esta semana.
3. Solicitar a proveedores los XML que aún no están en el expediente.`,
    defensas: [],
    tramites: [{ titulo: "Aclaración por declaración extemporánea", autoridad: "SAT", estado: "pendiente" }],
  },
  {
    idx: 4,
    rfc: "DEMLOP750303CC3",
    razon: "Servicios López y Asociados",
    tipo_persona: "fisica",
    regimen: "612",
    email: "j.lopez@servicioslopez.demo",
    telefono: "5550100004",
    semaforo: "rojo",
    score_salud: 42,
    estado_mes: "Múltiples observaciones",
    perfil_label: "En problemas — nómina oculta y EFOS",
    cfdi_emitidos: 30,
    cfdi_recibidos: 25,
    conciliacion_pct: 0.50,
    alertas: [
      { nivel: "alto", tipo: "efos", titulo: "Proveedor en lista 69-B (presunto)", descripcion: "Se detectaron 3 CFDI recibidos del RFC DEMEFOS010101XX1 que aparece en la lista 69-B presuntos del SAT." },
      { nivel: "alto", tipo: "nomina_oculta", titulo: "Patrón de nómina oculta detectado", descripcion: "Se identificaron pagos recurrentes a personas físicas sin CFDI de nómina ni asimilados. Monto estimado: $180,000 MXN." },
      { nivel: "medio", tipo: "deducibilidad", titulo: "12 gastos sin método de pago bancarizado", descripcion: "Gastos mayores a $2,000 pagados en efectivo — no deducibles fiscalmente." },
      { nivel: "medio", tipo: "obligacion_vencida", titulo: "DIOT pendiente", descripcion: "Declaración Informativa de Operaciones con Terceros no presentada." },
    ],
    tareas: [
      { titulo: "Revisar operaciones con proveedor EFOS", estatus: "en_progreso", prioridad: "alta" },
      { titulo: "Regularizar nómina oculta", estatus: "pendiente", prioridad: "alta" },
      { titulo: "Excluir gastos no deducibles del cierre", estatus: "pendiente", prioridad: "alta" },
      { titulo: "Presentar DIOT atrasada", estatus: "pendiente", prioridad: "media" },
      { titulo: "Preparar defensa fiscal preventiva", estatus: "en_progreso", prioridad: "alta" },
    ],
    hallazgos: [
      { titulo: "Operaciones con presunto EFOS (3 CFDI)", gravedad: "alta" },
      { titulo: "Nómina oculta estimada $180,000", gravedad: "alta" },
      { titulo: "12 gastos no deducibles por forma de pago", gravedad: "media" },
      { titulo: "DIOT no presentada", gravedad: "media" },
      { titulo: "50% de bancos sin conciliar", gravedad: "media" },
    ],
    resumen_ejecutivo: `# Reporte ejecutivo — Servicios López y Asociados

**Estado general:** 🟠 EN PROBLEMAS (42/100)

⚠️ **Acción inmediata requerida:**
- 3 CFDI recibidos de proveedor en **lista 69-B presuntos**. Riesgo: no deducibilidad y posible invitación SAT.
- Patrón claro de **nómina oculta** (~$180,000) detectado por análisis de pagos recurrentes a personas físicas sin CFDI.
- 12 gastos sobre el límite pagados en efectivo — **no deducibles**.
- DIOT vencida.

**Plan de acción:**
1. Esta semana: documentar materialidad de operaciones con proveedor 69-B y/o sustituir por proveedor en regla.
2. Próximas 2 semanas: regularizar nómina (alta IMSS, retenciones, CFDI).
3. Excluir del cierre anual los gastos no deducibles identificados.
4. Preparar expediente de defensa preventiva.`,
    defensas: [
      { nombre: "Defensa preventiva operaciones 69-B", conflicto: "3 CFDI recibidos de RFC presunto EFOS", potencial: "Posible invitación SAT, no deducibilidad por $145,000" },
    ],
    tramites: [
      { titulo: "Aclaración operaciones con tercero", autoridad: "SAT", estado: "en_proceso" },
      { titulo: "Inscripción patronal IMSS (nómina oculta)", autoridad: "IMSS", estado: "pendiente" },
    ],
  },
  {
    idx: 5,
    rfc: "DEMTRA950404DD4",
    razon: "Transportes Riesgo Alto SA",
    tipo_persona: "moral",
    regimen: "601",
    email: "contabilidad@transportesriesgo.demo",
    telefono: "5550100005",
    semaforo: "rojo",
    score_salud: 18,
    estado_mes: "CRÍTICO — múltiples omisiones",
    perfil_label: "Crítico — 69-B definitivos, omisiones",
    cfdi_emitidos: 35,
    cfdi_recibidos: 40,
    conciliacion_pct: 0.30,
    alertas: [
      { nivel: "alto", tipo: "efos_definitivo", titulo: "Proveedor en lista 69-B DEFINITIVOS", descripcion: "Se detectaron 7 CFDI por $890,000 de RFC DEMEFDEF010101YY2 publicado en lista 69-B DEFINITIVOS del DOF." },
      { nivel: "alto", tipo: "opinion_negativa", titulo: "Opinión de cumplimiento NEGATIVA", descripcion: "Opinión 32-D emitida con sentido NEGATIVO. Impide contratar con gobierno y obtener créditos." },
      { nivel: "alto", tipo: "declaracion_omisa", titulo: "3 declaraciones mensuales omitidas", descripcion: "ISR e IVA de los últimos 3 meses sin presentar. Riesgo de visita domiciliaria." },
      { nivel: "alto", tipo: "discrepancia_fiscal", titulo: "Discrepancia ingresos CFDI vs declarado", descripcion: "Se declararon $1.2M pero los CFDI emitidos suman $3.8M. Diferencia de $2.6M sin justificar." },
      { nivel: "alto", tipo: "diot_omisa", titulo: "DIOT omitidas (6 meses)", descripcion: "No se ha presentado DIOT en los últimos 6 periodos." },
      { nivel: "medio", tipo: "nomina_oculta", titulo: "Indicios de nómina oculta", descripcion: "Pagos a 8 personas físicas sin CFDI de nómina. Monto $420,000." },
      { nivel: "medio", tipo: "cancelaciones_atipicas", titulo: "Patrón de cancelaciones atípico", descripcion: "23% de los CFDI emitidos fueron cancelados — supera el umbral SAT del 15%." },
    ],
    tareas: [
      { titulo: "🚨 Sustituir operaciones con EFOS definitivo", estatus: "pendiente", prioridad: "alta" },
      { titulo: "🚨 Presentar 3 declaraciones omisas", estatus: "pendiente", prioridad: "alta" },
      { titulo: "🚨 Justificar discrepancia ingresos $2.6M", estatus: "pendiente", prioridad: "alta" },
      { titulo: "Presentar 6 DIOT atrasadas", estatus: "pendiente", prioridad: "alta" },
      { titulo: "Preparar defensa por opinión negativa", estatus: "en_progreso", prioridad: "alta" },
      { titulo: "Estrategia para reducir % de cancelaciones", estatus: "pendiente", prioridad: "media" },
      { titulo: "Regularizar 8 trabajadores fuera de nómina", estatus: "pendiente", prioridad: "alta" },
    ],
    hallazgos: [
      { titulo: "$890,000 con EFOS definitivo — riesgo crédito fiscal", gravedad: "alta" },
      { titulo: "Opinión 32-D negativa", gravedad: "alta" },
      { titulo: "3 meses de declaraciones omisas", gravedad: "alta" },
      { titulo: "Discrepancia ingresos vs CFDI $2.6M", gravedad: "alta" },
      { titulo: "6 DIOT omisas", gravedad: "alta" },
      { titulo: "Nómina oculta $420,000", gravedad: "alta" },
      { titulo: "23% cancelaciones (umbral 15%)", gravedad: "media" },
      { titulo: "70% bancos sin conciliar", gravedad: "media" },
    ],
    resumen_ejecutivo: `# Reporte ejecutivo — Transportes Riesgo Alto SA

**Estado general:** 🔴 CRÍTICO (18/100)

🚨 **ALERTA MÁXIMA — RIESGO DE CRÉDITO FISCAL Y VISITA DOMICILIARIA**

### Hallazgos críticos
1. **$890,000 con proveedor en lista 69-B DEFINITIVOS** (7 CFDI). Estos comprobantes son **NO deducibles** por mandato legal y pueden generar crédito fiscal por el IVA acreditado indebidamente.
2. **Opinión de cumplimiento NEGATIVA** vigente.
3. **3 declaraciones mensuales omitidas** (ISR e IVA).
4. **Discrepancia ingresos**: declarado $1.2M vs CFDI emitidos $3.8M — diferencia de **$2.6M**.
5. **6 DIOT consecutivas omisas**.
6. Patrón de **nómina oculta** ($420,000).
7. **23% de cancelaciones** de CFDI (supera umbral 15%).

### Riesgos fiscales estimados
- Crédito fiscal potencial: **$1.4M - $2.1M** (capital + actualización + recargos + multas).
- Riesgo de embargo precautorio si SAT detecta la discrepancia.
- Imposibilidad de operar con gobierno o instituciones por opinión negativa.

### Plan de emergencia (próximos 30 días)
1. **Días 1-7**: Cuantificar y sustituir operaciones con EFOS definitivo. Documentar materialidad.
2. **Días 8-15**: Presentar las 3 declaraciones omisas con autocorrección.
3. **Días 16-22**: Presentar las 6 DIOT atrasadas.
4. **Días 23-30**: Justificar discrepancia de ingresos o presentar complementarias.
5. Paralelo: regularizar plantilla laboral, preparar defensa preventiva.

**Sin acción inmediata, el riesgo escala a crédito fiscal en 60-90 días.**`,
    defensas: [
      { nombre: "Defensa por operaciones con EFOS definitivo", conflicto: "$890,000 en 7 CFDI no deducibles por mandato legal", potencial: "Crédito fiscal estimado $1.4M-$2.1M" },
      { nombre: "Aclaración por opinión negativa", conflicto: "Opinión 32-D negativa por declaraciones omisas", potencial: "Bloqueo operativo con gobierno e instituciones" },
    ],
    tramites: [
      { titulo: "🚨 Autocorrección declaraciones omisas", autoridad: "SAT", estado: "pendiente" },
      { titulo: "Aclaración discrepancia ingresos", autoridad: "SAT", estado: "pendiente" },
      { titulo: "Defensa preventiva 69-B", autoridad: "SAT", estado: "en_proceso" },
    ],
  },
];

export const EFOS_DEMO_RFCS = {
  presunto: "DEMEFOS010101XX1",
  definitivo: "DEMEFDEF010101YY2",
};
