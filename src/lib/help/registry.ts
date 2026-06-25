import type { HelpContent } from "./types";

/**
 * Registro central de ayuda contextual por herramienta.
 *
 * Reglas para escribir contenido:
 *  1. Usa los nombres EXACTOS de los botones/pestañas/campos tal como aparecen en pantalla.
 *  2. Tutorial: pasos numerados, cada uno con una acción concreta y verificable.
 *  3. Resultados: explica qué significa cada KPI/columna/semáforo (rangos cuando aplique).
 *  4. Dependencias: sé explícito sobre qué se carga antes y qué se alimenta después.
 *  5. No uses lenguaje técnico de programador — es para contadores.
 */
export const HELP_REGISTRY: Record<string, HelpContent> = {
  // ============================================================
  // SALUD FISCAL
  // ============================================================
  "salud-fiscal": {
    slug: "salud-fiscal",
    title: "Dashboard de Salud Fiscal",
    queHace:
      "Calcula un score de 0 a 100 que resume el estado fiscal integral del cliente cruzando seis áreas: cumplimiento de declaraciones, riesgo SAT, calidad de CFDI, conciliación bancaria, situación laboral y documentación. Te da una radiografía completa en una sola pantalla con semáforo, comparativo mensual, tendencia a 12 meses, alertas y recomendaciones accionables.",
    cuandoUsar:
      "Al cierre de cada mes para detectar focos rojos antes de que se conviertan en problemas, en juntas con el cliente para mostrar avances medibles, o cuando recibes un cliente nuevo para diagnosticar su estado inicial.",
    tutorial: [
      {
        n: 1,
        titulo: "Selecciona el expediente activo",
        detalle:
          "En la barra superior elige el RFC del cliente que quieres analizar. La herramienta calcula automáticamente al detectar el cliente.",
        tip: "Si el RFC es de demostración (no es UUID real), la pantalla te avisará. Crea o selecciona un expediente real desde /app/clientes.",
      },
      {
        n: 2,
        titulo: "Espera el cálculo automático",
        detalle:
          "El sistema cruza CFDI, declaraciones, bancos, riesgo SAT y documentación. Tarda unos segundos. Verás el spinner 'Calculando salud fiscal…'.",
      },
      {
        n: 3,
        titulo: "Lee el Score Hero",
        detalle:
          "El círculo grande es el score global (0-100). A su lado está el semáforo (verde/amarillo/naranja/rojo) y la variación vs el mes anterior (+/- puntos).",
      },
      {
        n: 4,
        titulo: "Revisa los Subscores por área",
        detalle:
          "Cada tarjeta muestra una de las 6 áreas con su peso porcentual y los detalles que la afectaron. Las que estén en rojo o naranja son tus prioridades.",
      },
      {
        n: 5,
        titulo: "Compara mensual y tendencia",
        detalle:
          "La tabla 'Comparativo mensual' contrasta ingresos, egresos, utilidad, ISR e IVA contra el mes anterior. La gráfica 'Evolución 12 meses' muestra cómo se mueve el score en el año.",
      },
      {
        n: 6,
        titulo: "(Opcional) Analiza con IA",
        detalle:
          "Botón 'Analizar con IA' — usa Gemini para enriquecer hallazgos con análisis cualitativo. Aparecerán en la sección 'Hallazgos' marcados como IA.",
        tip: "Esta acción consume créditos de IA. Úsala cuando quieras un análisis más profundo, no en cada recálculo.",
      },
      {
        n: 7,
        titulo: "Convierte recomendaciones en tareas",
        detalle:
          "En 'Recomendaciones accionables', cada fila tiene botón 'Crear tarea' que la manda al Centro de Tareas con prioridad alta. Otras llevan a 'Solicitar docs' (Mensajes) o 'Generar estrategia' (Redactor legal).",
      },
      {
        n: 8,
        titulo: "Descarga el reporte ejecutivo",
        detalle:
          "Botón 'Reporte ejecutivo' genera un PDF con score, subscores, comparativo, hallazgos y recomendaciones — listo para enviar al cliente.",
      },
    ],
    resultados: [
      {
        campo: "Score global (0-100)",
        significado: "Promedio ponderado de los 6 subscores. Mientras más alto, más sano fiscalmente está el cliente.",
        rango: "85-100 verde (excelente) · 70-84 amarillo (estable) · 50-69 naranja (riesgo moderado) · 0-49 rojo (riesgo alto)",
      },
      {
        campo: "Variación vs mes anterior",
        significado: "Cuántos puntos subió o bajó el score respecto al cierre del mes pasado. Mide si el cliente está mejorando o empeorando.",
      },
      {
        campo: "Subscores (6 tarjetas)",
        significado:
          "Cumplimiento · Riesgo SAT · CFDI · Bancos · Laboral · Documental. Cada uno con su propio score 0-100 y el peso que tiene en el global.",
      },
      {
        campo: "Comparativo mensual",
        significado:
          "Ingresos, egresos, utilidad, ISR estimado, IVA trasladado, IVA acreditable y margen operativo del mes actual vs el anterior. Las diferencias en verde son favorables; en rojo, desfavorables.",
      },
      {
        campo: "Alertas inteligentes",
        significado: "Eventos que requieren atención antes del cierre. Nivel crítica/alta = riesgo inmediato; media = revisar; informativa = nota.",
      },
      {
        campo: "Hallazgos",
        significado:
          "Patrones detectados: 'oportunidad' (verde, ahorro fiscal posible), 'inconsistencia' (amarillo, dato que no cuadra) o 'riesgo' (azul, atender).",
      },
      {
        campo: "Recomendaciones accionables",
        significado: "Acciones concretas sugeridas con botón para convertirlas en tarea, solicitud de documentos o estrategia legal.",
      },
    ],
    dependencias: {
      necesita: [
        { tool: "Descarga Masiva SAT", ruta: "/app/sat-sync", motivo: "Para tener CFDI emitidos y recibidos del mes actual y anteriores." },
        { tool: "Pólizas contables", ruta: "/app/polizas", motivo: "Para calcular utilidad, margen e ISR estimado con datos reales." },
        { tool: "Conciliación Integral", ruta: "/app/conciliacion-integral", motivo: "Aporta el subscore de Bancos y la calidad de los CFDI." },
      ],
      alimenta: [
        { tool: "Centro de Tareas", ruta: "/app/tareas", motivo: "Las recomendaciones convertidas en tareas aterrizan aquí con prioridad alta." },
        { tool: "Reporte Ejecutivo", ruta: "/app/reporte-ejecutivo", motivo: "Los subscores y hallazgos se incorporan al reporte mensual del cliente." },
      ],
      datosMinimos: [
        "1 RFC activo con datos del mes en curso",
        "Al menos 1 mes de CFDI sincronizados",
        "Para subscore de Bancos: estado de cuenta cargado o conciliación corrida",
      ],
    },
    costos: "Cálculo base: sin costo (consulta a tu base). 'Analizar con IA' consume ~1 crédito de IA por corrida.",
  },

  // ============================================================
  // CONCILIACIÓN INTEGRAL (SAT vs Contabilidad vs Bancos)
  // ============================================================
  "conciliacion-integral": {
    slug: "conciliacion-integral",
    title: "Conciliación SAT vs Contabilidad",
    queHace:
      "Cruza automáticamente tres fuentes: CFDI del SAT, pólizas contables y movimientos bancarios. Detecta 7 tipos de incidencias — ingresos omitidos, gastos sin registrar, pagos sin CFDI, CFDI sin movimiento bancario, diferencias de monto, duplicados y cancelados no ajustados — y te entrega un score de conciliación con timeline y filtros.",
    cuandoUsar:
      "Antes de cada cierre mensual para asegurar que SAT, contabilidad y banco cuadran. También al recibir un cliente nuevo para detectar inconsistencias históricas.",
    tutorial: [
      {
        n: 1,
        titulo: "Selecciona el expediente",
        detalle: "Elige RFC en la barra superior. Si dejas sin expediente, el dashboard muestra agregado de todos los clientes del despacho.",
      },
      {
        n: 2,
        titulo: "Ejecuta una conciliación",
        detalle:
          "Botón principal 'Ejecutar conciliación'. El motor compara CFDI vs pólizas vs movimientos bancarios con ventana de ±3 días para fechas y tolerancia configurable en montos. Tarda 5-30 segundos según volumen.",
        tip: "Si no aparecen incidencias y esperas que sí, revisa que tengas CFDI sincronizados (Descarga Masiva SAT) y pólizas cargadas (módulo Pólizas).",
      },
      {
        n: 3,
        titulo: "Revisa los KPIs",
        detalle:
          "Arriba verás: total de incidencias, score de conciliación (0-100), monto en riesgo y desglose por gravedad (crítica/media/baja).",
      },
      {
        n: 4,
        titulo: "Filtra incidencias",
        detalle:
          "3 selectores: Tipo (los 7 tipos), Gravedad (crítica/media/baja), Estatus (abierta/en proceso/resuelta/descartada). Por defecto muestra 'abierta'.",
      },
      {
        n: 5,
        titulo: "Abre el detalle de una incidencia",
        detalle:
          "Click en la fila — se abre un Sheet lateral con timeline, monto, referencias (UUID, póliza, movimiento) y botón 'Explicar con IA' que genera una recomendación contextual.",
      },
      {
        n: 6,
        titulo: "Acciona la incidencia",
        detalle:
          "Desde el detalle puedes: cambiar estatus (en proceso/resuelta/descartada), crear tarea para el equipo, o aplicar la recomendación IA.",
      },
    ],
    resultados: [
      {
        campo: "Score de conciliación (0-100)",
        significado: "Qué tan alineadas están SAT, contabilidad y bancos. 100 = todo cuadra; baja según volumen y gravedad de incidencias.",
        rango: "85-100 verde · 60-84 amarillo · <60 rojo",
      },
      {
        campo: "Monto en riesgo",
        significado: "Suma de los montos involucrados en incidencias críticas + medias. Es tu exposición potencial ante el SAT.",
      },
      {
        campo: "Ingreso SAT sin póliza",
        significado: "Hay un CFDI emitido que el cliente no registró contablemente. Riesgo: ingreso omitido para ISR/IVA.",
        rango: "Gravedad crítica si >$10K, media si menor.",
      },
      {
        campo: "Gasto SAT sin póliza",
        significado: "CFDI recibido sin póliza. Riesgo: pierdes la deducción y el acreditamiento de IVA.",
      },
      {
        campo: "Pago banco sin CFDI",
        significado: "Movimiento bancario sin CFDI que lo respalde. Riesgo: gasto no deducible o ingreso sin facturar.",
      },
      {
        campo: "CFDI sin movimiento bancario",
        significado: "CFDI emitido o recibido sin movimiento bancario asociado. Posible operación no cobrada/no pagada o pagada en efectivo (>$2K = no deducible).",
      },
      {
        campo: "Diferencia de monto",
        significado: "CFDI y movimiento existen pero los montos no cuadran. Revisar tipo de cambio, retenciones o descuentos.",
      },
      {
        campo: "CFDI duplicado / CFDI cancelado no ajustado",
        significado: "Higiene contable: registros que se contabilizaron dos veces o cancelaciones del SAT que no se reflejaron en pólizas.",
      },
    ],
    dependencias: {
      necesita: [
        { tool: "Descarga Masiva SAT", ruta: "/app/sat-sync", motivo: "Sin CFDI sincronizados no hay nada que conciliar contra el SAT." },
        { tool: "Pólizas contables", ruta: "/app/polizas", motivo: "Sin pólizas cargadas, todos los CFDI saldrán como 'sin póliza' (falsos positivos)." },
        { tool: "Conciliación bancaria", ruta: "/app/conciliacion", motivo: "Aporta los movimientos bancarios. Sin ellos no se detectan pagos sin CFDI." },
      ],
      alimenta: [
        { tool: "Salud Fiscal", ruta: "/app/salud-fiscal", motivo: "El score de conciliación se usa en los subscores de CFDI y Bancos." },
        { tool: "Centro de Tareas", ruta: "/app/tareas", motivo: "Las incidencias accionadas crean tareas con prioridad por gravedad." },
        { tool: "Contabilidad Automática", ruta: "/app/contabilidad-auto", motivo: "Incidencias tipo 'sin póliza' se pueden resolver generando pólizas desde ahí." },
      ],
      datosMinimos: [
        "≥ 1 mes de CFDI sincronizados",
        "≥ 1 mes de pólizas cargadas (CSV o manual)",
        "Para detectar pagos sin CFDI: estado de cuenta importado",
      ],
    },
  },

  // ============================================================
  // PÓLIZAS CONTABLES
  // ============================================================
  "polizas": {
    slug: "polizas",
    title: "Pólizas contables",
    queHace:
      "Captura y administra las pólizas contables del cliente (diario, ingreso, egreso) que son la fuente para conciliación, ISR estimado y reporte ejecutivo. Permite importar masivamente desde CSV, alta manual y consulta de historial con eliminación.",
    cuandoUsar: "Cada vez que registres movimientos contables o cuando importes el catálogo histórico de un cliente nuevo.",
    tutorial: [
      {
        n: 1,
        titulo: "Decide cómo cargar: CSV o manual",
        detalle:
          "Pestaña 'Importar CSV' para cargas masivas (recomendado para histórico) · 'Alta manual' para pólizas sueltas · 'Historial' para consultar/eliminar.",
      },
      {
        n: 2,
        titulo: "Importación CSV — descarga la plantilla",
        detalle:
          "Botón 'Descargar plantilla' baja un CSV con los encabezados correctos: fecha, tipo, concepto, monto, cuenta_cargo, cuenta_abono, uuid_cfdi (opcional).",
        tip: "Si tu CSV tiene encabezados distintos a la plantilla, las filas se ignorarán silenciosamente. Usa siempre la plantilla como base.",
      },
      {
        n: 3,
        titulo: "Sube el CSV y revisa el preview",
        detalle:
          "Arrastra el archivo o usa el selector. Verás cuántas filas se detectaron antes de confirmar. Si dice 'CSV vacío o sin encabezados válidos' revisa formato.",
      },
      {
        n: 4,
        titulo: "Confirma la importación",
        detalle: "Botón 'Importar' inserta todas las pólizas en la base. Aparece toast con el número insertado.",
      },
      {
        n: 5,
        titulo: "Alta manual de una póliza",
        detalle:
          "Llena fecha, tipo (diario/ingreso/egreso), concepto, monto y opcionalmente el UUID del CFDI relacionado. Útil para conciliar después con CFDI específicos.",
        tip: "Asociar UUID es lo que permite que el motor de conciliación vincule la póliza con el CFDI exacto y evite falsos positivos.",
      },
      {
        n: 6,
        titulo: "Consulta y elimina en Historial",
        detalle: "Tabla con todas las pólizas del cliente. Botón papelera por fila para eliminar (irreversible).",
      },
    ],
    resultados: [
      { campo: "Pólizas importadas (toast)", significado: "Confirma cuántas filas se insertaron en la base." },
      { campo: "Tabla Historial", significado: "Lista todas las pólizas del cliente con fecha, tipo, concepto, monto y UUID asociado." },
    ],
    dependencias: {
      necesita: [
        { tool: "Expedientes / Clientes", ruta: "/app/clientes", motivo: "Las pólizas se cargan por RFC. Necesitas el cliente creado y seleccionado." },
      ],
      alimenta: [
        { tool: "Conciliación Integral", ruta: "/app/conciliacion-integral", motivo: "Sin pólizas, todos los CFDI aparecen como 'sin póliza' (incidencias falsas)." },
        { tool: "Salud Fiscal", ruta: "/app/salud-fiscal", motivo: "Cálculo de utilidad, ISR estimado y margen operativo." },
        { tool: "Reporte Ejecutivo", ruta: "/app/reporte-ejecutivo", motivo: "KPIs financieros del reporte mensual." },
      ],
      datosMinimos: ["CSV con encabezados de la plantilla, o 1 póliza creada manualmente"],
    },
  },

  // ============================================================
  // CONTABILIDAD AUTOMÁTICA
  // ============================================================
  "contabilidad-auto": {
    slug: "contabilidad-auto",
    title: "Contabilidad Automática",
    queHace:
      "Motor que genera pólizas contables borrador a partir de CFDI sincronizados y movimientos bancarios, aplicando catálogo de cuentas (Anexo 24 SAT) y reglas configurables por RFC, tipo, keyword o monto. Permite confirmar/rechazar pólizas en lote y exportar a XML Anexo 24 (SAT) o TXT CONTPAQi.",
    cuandoUsar:
      "Cuando quieras automatizar el registro contable mensual sin capturar manualmente cada CFDI. Ideal para despachos con alto volumen.",
    tutorial: [
      {
        n: 1,
        titulo: "Configura tu catálogo (primera vez)",
        detalle:
          "Pestaña 'Catálogo' — botón 'Sembrar catálogo SAT base' para arrancar con cuentas Anexo 24. Después puedes agregar/editar cuentas propias del cliente.",
        tip: "Cada cliente puede tener su propio catálogo. Sembrar es opcional pero ahorra horas de captura.",
      },
      {
        n: 2,
        titulo: "Define reglas (opcional pero recomendado)",
        detalle:
          "Pestaña 'Reglas' — crea reglas por RFC emisor, tipo de CFDI (I/E/P), keyword en descripción o rango de monto. Cada regla define a qué cuentas mandar el cargo/abono. Se aplican por prioridad (1 = mayor).",
        tip: "Ejemplo de regla: 'CFDI tipo I del RFC TEL010101AAA → cargo a 601-001 Teléfono'. Sin reglas, el motor usa cuentas por defecto del Anexo 24.",
      },
      {
        n: 3,
        titulo: "Genera pólizas desde CFDI",
        detalle:
          "Pestaña 'Pendientes' (CFDI sin póliza) — selecciona filas y botón 'Generar pólizas'. Aparecen como 'borrador' en la siguiente pestaña.",
      },
      {
        n: 4,
        titulo: "Genera pólizas desde Bancos",
        detalle:
          "Pestaña 'Bancos' — lista movimientos bancarios sin póliza. Selecciona y 'Generar pólizas'. Si el movimiento matchea una regla se aplica; si no, va a cuenta 'por identificar'.",
      },
      {
        n: 5,
        titulo: "Revisa y edita borradores",
        detalle:
          "Pestaña 'Borrador' — click en una fila para abrir el editor de asientos. Puedes agregar/quitar líneas. El sistema valida que cargo = abono antes de guardar.",
      },
      {
        n: 6,
        titulo: "Confirma o rechaza en lote",
        detalle:
          "Selecciona pólizas en 'Borrador' y usa botones 'Confirmar' (pasan a 'Confirmadas') o 'Rechazar' (descartadas). Acción masiva ideal para cierre.",
      },
      {
        n: 7,
        titulo: "Exporta para tu sistema contable",
        detalle:
          "Pestaña 'Exportar' — elige periodo y formato: XML Anexo 24 (Pólizas v1.3 con CompNal por UUID, válido SAT) o TXT CONTPAQi (importable directo). Descarga el archivo.",
      },
    ],
    resultados: [
      {
        campo: "Pendientes",
        significado: "CFDI sincronizados que aún no tienen póliza asociada. Es tu cola de trabajo.",
      },
      {
        campo: "Borrador",
        significado: "Pólizas generadas por el motor que esperan tu revisión. Editables y eliminables.",
      },
      {
        campo: "Confirmadas",
        significado: "Pólizas validadas que ya forman parte de la contabilidad oficial. Aparecen en Pólizas, Conciliación y Salud Fiscal.",
      },
      {
        campo: "XML Anexo 24",
        significado: "Archivo válido para el SAT (Pólizas v1.3) con referencia CompNal a cada UUID. Se entrega en revisiones electrónicas.",
      },
      {
        campo: "TXT CONTPAQi",
        significado: "Formato importable directo a CONTPAQi Contabilidad. Útil si el cliente trabaja en ese sistema.",
      },
    ],
    dependencias: {
      necesita: [
        { tool: "Descarga Masiva SAT", ruta: "/app/sat-sync", motivo: "Los CFDI son el insumo principal del motor. Sin sincronización, no hay pendientes." },
        { tool: "Conciliación bancaria", ruta: "/app/conciliacion", motivo: "Para generar pólizas desde la pestaña Bancos necesitas movimientos importados." },
      ],
      alimenta: [
        { tool: "Pólizas", ruta: "/app/polizas", motivo: "Las pólizas confirmadas viven en este módulo." },
        { tool: "Conciliación Integral", ruta: "/app/conciliacion-integral", motivo: "Al confirmar pólizas, las incidencias 'sin póliza' se resuelven automáticamente." },
        { tool: "Salud Fiscal", ruta: "/app/salud-fiscal", motivo: "Mejora subscores de CFDI y cumplimiento contable." },
      ],
      datosMinimos: [
        "CFDI sincronizados del periodo a contabilizar",
        "Catálogo sembrado (recomendado)",
        "Reglas configuradas (opcional — mejora precisión)",
      ],
    },
  },

  // ============================================================
  // RIESGO SAT 2026
  // ============================================================
  "riesgo-sat": {
    slug: "riesgo-sat",
    title: "Riesgo SAT 2026",
    queHace:
      "Evalúa al cliente contra los 12 criterios del Plan Maestro de Fiscalización 2026 del SAT y entrega un score 0-100 con semáforo. Por cada criterio muestra hallazgos específicos del contribuyente y la acción recomendada.",
    cuandoUsar:
      "Trimestralmente para anticipar riesgos antes de que el SAT actúe, o cuando recibes un cliente nuevo para diagnosticar su exposición.",
    tutorial: [
      {
        n: 1,
        titulo: "Selecciona el expediente",
        detalle: "Elige un RFC real (no demo) en la barra superior. La herramienta calcula automáticamente.",
      },
      {
        n: 2,
        titulo: "Espera el cálculo",
        detalle: "El motor cruza CFDI, movimientos, declaraciones y datos del contribuyente contra los 12 criterios. Tarda pocos segundos.",
      },
      {
        n: 3,
        titulo: "Lee el score global",
        detalle: "Tarjeta superior con score y semáforo. Mensaje contextual indica si hay riesgo alto/moderado/bajo y qué tan urgente es accionar.",
      },
      {
        n: 4,
        titulo: "Revisa los 12 criterios",
        detalle:
          "Grid de tarjetas, cada una un criterio del Plan Maestro: nivel (verde/amarillo/rojo), puntos asignados, descripción, hallazgos específicos del cliente y acción recomendada.",
      },
      {
        n: 5,
        titulo: "Recalcula cuando cargues datos nuevos",
        detalle: "Botón 'Recalcular' en la esquina superior. Útil tras sincronizar más CFDI o cargar declaraciones.",
      },
      {
        n: 6,
        titulo: "Exporta a Excel",
        detalle: "Botón 'Excel' baja un .xlsx con dos hojas: Resumen (cliente, score, semáforo, periodo) y Criterios (los 12 con todos los hallazgos).",
      },
    ],
    resultados: [
      {
        campo: "Score de Riesgo SAT (0-100)",
        significado: "Mientras MÁS ALTO peor — indica mayor probabilidad de ser fiscalizado u observado por SAT.",
        rango: "0-30 verde (riesgo bajo) · 31-70 amarillo (moderado) · 71-100 rojo (alto, atención inmediata)",
      },
      {
        campo: "Criterios (12 tarjetas)",
        significado:
          "Cada criterio del Plan Maestro 2026 con su nivel individual, puntos contribuidos al score total y los hallazgos concretos del cliente que lo activaron.",
      },
      {
        campo: "Acción recomendada (por criterio)",
        significado: "Lo que debes hacer para mitigar ese criterio específico. Acciona en orden de criterios rojos primero.",
      },
    ],
    dependencias: {
      necesita: [
        { tool: "Descarga Masiva SAT", ruta: "/app/sat-sync", motivo: "CFDI sincronizados son la base de la mayoría de los criterios." },
        { tool: "Conciliación bancaria", ruta: "/app/conciliacion", motivo: "Algunos criterios miden discrepancias banco vs CFDI." },
      ],
      alimenta: [
        { tool: "Salud Fiscal", ruta: "/app/salud-fiscal", motivo: "El score de Riesgo SAT es uno de los 6 subscores que componen la salud global." },
        { tool: "Reporte Ejecutivo", ruta: "/app/reporte-ejecutivo", motivo: "El reporte mensual incluye el score de riesgo y los criterios en rojo." },
      ],
      datosMinimos: ["Expediente real (no demo)", "Al menos 1 mes de CFDI sincronizados"],
    },
  },

  // ============================================================
  // REPORTE EJECUTIVO + AGENTE FISCAL IA
  // ============================================================
  "reporte-ejecutivo": {
    slug: "reporte-ejecutivo",
    title: "Reporte Ejecutivo + Agente Fiscal IA",
    queHace:
      "Genera reportes mensuales/trimestrales/anuales con KPIs financieros, hallazgos y recomendaciones priorizadas por un agente IA. Permite simular escenarios fiscales (ej. cambio a RESICO, diferimiento de gastos, deducciones extra) y exportar a PDF o JSON.",
    cuandoUsar:
      "Al cierre de cada mes para enviar al cliente · al hacer planeación fiscal de fin de año · cuando el cliente pide un análisis ejecutivo para socios o banco.",
    tutorial: [
      {
        n: 1,
        titulo: "Genera un reporte nuevo",
        detalle:
          "Botón 'Generar reporte' en la cabecera. Selecciona el cliente del select y confirma. La IA analiza CFDI, pólizas, conciliación, salud fiscal y produce el reporte (60-90 segundos).",
        tip: "Consume créditos de IA. No generes uno por cliente cada día — úsalo al cierre.",
      },
      {
        n: 2,
        titulo: "Revisa la pestaña Dashboard",
        detalle:
          "KPIs agregados de todos los reportes: total generados, enviados, hallazgos críticos abiertos. Sirve para dashboard de despacho.",
      },
      {
        n: 3,
        titulo: "Abre un reporte de la pestaña Reportes",
        detalle:
          "Lista todos los reportes generados. Click en una fila o botón 'Ver' abre el detalle completo: KPIs, comparativos, hallazgos clasificados y recomendaciones IA.",
      },
      {
        n: 4,
        titulo: "Exporta PDF o JSON",
        detalle:
          "Dentro del reporte: botón 'PDF' descarga formato ejecutivo listo para enviar al cliente · botón 'JSON' baja datos crudos para integraciones.",
        tip: "Si el PDF parece no descargar, revisa que el navegador no esté bloqueando descargas automáticas en la pestaña.",
      },
      {
        n: 5,
        titulo: "Marca como enviado",
        detalle:
          "Botón 'Marcar enviado' actualiza el estatus. Útil para llevar control en despachos con varios contadores.",
      },
      {
        n: 6,
        titulo: "Acciona recomendaciones IA",
        detalle:
          "Pestaña 'Recomendaciones IA' — cada recomendación tiene 3 botones: 'Crear tarea' (manda al Centro de Tareas), 'Implementada' (marca completada), 'Descartar' (la archiva).",
      },
      {
        n: 7,
        titulo: "Simula un escenario fiscal",
        detalle:
          "Botón 'Simular escenario' — selecciona cliente, nombra el escenario (ej. 'Migración a RESICO') y define parámetros en formato clave=valor (ej. 'deduccion_extra=50000', 'diferir_gastos=true'). La IA calcula impacto en ISR/IVA/utilidad.",
        tip: "Guarda simulaciones para comparar planes alternativos en una sola pantalla.",
      },
    ],
    resultados: [
      { campo: "KPIs del Dashboard", significado: "Métricas agregadas del despacho: reportes generados, enviados, hallazgos críticos pendientes." },
      {
        campo: "Hallazgos (por reporte)",
        significado: "Patrones detectados por la IA clasificados como crítico/alto/medio/bajo según impacto fiscal y económico.",
      },
      {
        campo: "Recomendaciones IA",
        significado: "Acciones priorizadas con beneficio estimado, dificultad y tiempo. Estado: pendiente / implementada / descartada.",
      },
      {
        campo: "Simulación fiscal",
        significado: "Compara escenarios contra el baseline actual: diferencia en ISR, IVA, flujo y utilidad bajo los parámetros que definiste.",
      },
      {
        campo: "PDF exportado",
        significado: "Documento ejecutivo paginado con KPIs, gráficas, hallazgos y recomendaciones — listo para enviar al cliente.",
      },
    ],
    dependencias: {
      necesita: [
        { tool: "Salud Fiscal", ruta: "/app/salud-fiscal", motivo: "Los subscores nutren el resumen ejecutivo." },
        { tool: "Riesgo SAT", ruta: "/app/riesgo", motivo: "El score de riesgo entra como sección dedicada del reporte." },
        { tool: "Conciliación Integral", ruta: "/app/conciliacion-integral", motivo: "Las incidencias críticas aparecen como hallazgos del reporte." },
        { tool: "Descarga Masiva SAT", ruta: "/app/sat-sync", motivo: "Datos crudos para KPIs de ingresos/egresos/utilidad." },
      ],
      alimenta: [
        { tool: "Centro de Tareas", ruta: "/app/tareas", motivo: "Las recomendaciones IA se convierten en tareas asignables." },
        { tool: "Cliente final (Portal)", ruta: "/portal", motivo: "PDF enviado al cliente como entregable mensual." },
      ],
      datosMinimos: [
        "Mínimo 1 mes de operación con CFDI",
        "Recomendado: Salud Fiscal y Riesgo SAT calculados previamente",
      ],
    },
    costos: "Generar reporte: ~3-5 créditos IA · Simular escenario: ~2 créditos IA · Acciones manuales (marcar, exportar PDF/JSON): sin costo.",
  },

  // ============================================================
  // DESCARGA MASIVA SAT
  // ============================================================
  "sat-sync": {
    slug: "sat-sync",
    title: "Descarga Masiva SAT",
    queHace:
      "Motor de actualización fiscal automática: descarga CFDI emitidos, recibidos, nómina, pagos y retenciones del SAT por cada cliente conectado. Detecta novedades y dispara módulos en cascada (Conciliación, Salud Fiscal, Contabilidad Auto). Soporta sincronización manual y programada.",
    cuandoUsar:
      "Una vez al configurar credenciales por cliente. Después se ejecuta sola en automático o cuando hagas 'Sincronizar ahora' manualmente.",
    tutorial: [
      {
        n: 1,
        titulo: "Conecta credenciales del cliente",
        detalle:
          "Pestaña 'Sincronización SAT'. Por cada RFC, captura los datos del PAC autorizado (SW Sapien). El sistema guarda el pac_token de forma cifrada — nunca verás la clave en plano.",
        tip: "Las credenciales son únicas por cliente. Si el cliente cambia de e.firma, hay que actualizar aquí.",
      },
      {
        n: 2,
        titulo: "Ejecuta primera sincronización manual",
        detalle:
          "Botón 'Sincronizar ahora' en la fila del cliente. Trae todos los CFDI del periodo configurado (por defecto 30 días). Aparece toast con cuántos XML descargó y cuántos son nuevos.",
        tip: "La primera sincronización de un cliente puede tardar varios minutos si tiene mucho histórico. Consume saldo PAC.",
      },
      {
        n: 3,
        titulo: "Activa/pausa sincronización automática",
        detalle:
          "Botón 'Pausar' / 'Reanudar' por cliente. Cuando está activa, el cron corre automáticamente según frecuencia configurada.",
      },
      {
        n: 4,
        titulo: "Revisa el Dashboard",
        detalle:
          "Pestaña 'Dashboard' — KPIs: RFC conectados, última sincronización, corridas hoy, CFDI nuevos hoy, errores 7d, pendientes. Más actividad reciente con estatus por corrida.",
      },
      {
        n: 5,
        titulo: "Consulta Actividad detallada",
        detalle:
          "Pestaña 'Actividad' — log completo de corridas: cliente, fecha, descargados, nuevos, errores, duración. Útil para auditar consumo PAC.",
      },
      {
        n: 6,
        titulo: "Revisa Novedades",
        detalle:
          "Pestaña 'Novedades' — CFDI nuevos detectados desde la última sincronización. Click para abrir el detalle del CFDI.",
      },
    ],
    resultados: [
      { campo: "RFC conectados", significado: "Cuántos clientes tienen credenciales válidas y sincronizando." },
      { campo: "Última sincronización", significado: "Fecha/hora de la corrida más reciente exitosa." },
      { campo: "CFDI nuevos hoy", significado: "Comprobantes detectados en sincronizaciones del día actual." },
      { campo: "Errores (7d)", significado: "Corridas fallidas en la última semana. Si >0, revisa credenciales caducas o saldo PAC agotado." },
      { campo: "Pendientes", significado: "CFDI descargados que esperan ser procesados por contabilidad/conciliación." },
      {
        campo: "Estatus de corrida",
        significado: "exitoso (verde) · error (rojo, revisar log) · parcial (amarillo, hubo problemas pero descargó algo).",
      },
    ],
    dependencias: {
      necesita: [
        { tool: "Expedientes / Clientes", ruta: "/app/clientes", motivo: "Cada RFC debe existir como cliente antes de conectar credenciales." },
        { tool: "Credenciales PAC", motivo: "El despacho debe tener configurado SW Sapien con saldo disponible (Super-Admin)." },
      ],
      alimenta: [
        { tool: "Contabilidad Automática", ruta: "/app/contabilidad-auto", motivo: "Los CFDI descargados son el insumo principal del motor de pólizas." },
        { tool: "Conciliación Integral", ruta: "/app/conciliacion-integral", motivo: "Lado SAT del cruce contra contabilidad y bancos." },
        { tool: "Salud Fiscal", ruta: "/app/salud-fiscal", motivo: "Alimenta subscores de CFDI, cumplimiento y patrones de operación." },
        { tool: "Riesgo SAT", ruta: "/app/riesgo", motivo: "12 criterios del Plan Maestro se calculan sobre CFDI sincronizados." },
      ],
      datosMinimos: [
        "Cliente creado con RFC válido",
        "Credenciales SAT del cliente (e.firma vía PAC)",
        "Saldo PAC disponible en la cuenta del despacho",
      ],
    },
    costos:
      "Consumo PAC por cada CFDI descargado (se descuenta del saldo del despacho). Ver consumo y límites por plan en tu perfil o en /app/admin-sat-saldo.",
  },

  // ============================================================
  // LOTE 2 — Herramientas individuales (Contable / Fiscal / Defensa)
  // ============================================================

  "cfdi-validator": {
    slug: "cfdi-validator",
    title: "Validador CFDI 4.0",
    queHace:
      "Lee un XML CFDI individual, lo parsea conforme al estándar 4.0 y verifica estructura, sellos, UUID, conceptos, impuestos y totales. Devuelve un resumen visual del comprobante y permite guardarlo dentro del expediente activo para consulta posterior.",
    cuandoUsar: "Cuando recibes un CFDI suelto y necesitas confirmar que es válido y se puede deducir/acreditar antes de archivarlo.",
    tutorial: [
      { n: 1, titulo: "Selecciona un expediente activo", detalle: "En la barra superior elige el RFC del cliente al que pertenecerá la validación." },
      { n: 2, titulo: "Arrastra o sube el XML", detalle: "Usa la caja punteada al centro de la pantalla para arrastrar el archivo .xml del CFDI, o haz click para abrir el selector." },
      { n: 3, titulo: "Revisa el resultado", detalle: "Verás tarjetas con datos del Comprobante (emisor, receptor, fecha, folio) y Totales (subtotal, IVA, total). Cualquier error de sello o estructura se marca en rojo." },
      { n: 4, titulo: "Guarda en el expediente", detalle: "Botón 'Guardar en expediente' archiva la validación en el cliente activo para auditoría futura.", tip: "Si no seleccionaste expediente, te avisa antes de validar." },
    ],
    resultados: [
      { campo: "Comprobante", significado: "Datos del CFDI: emisor, receptor, fecha de emisión y timbrado, folio fiscal." },
      { campo: "Totales", significado: "Subtotal, descuentos, IVA trasladado/retenido, ISR retenido, total final." },
      { campo: "Estatus del XML", significado: "Válido (verde) o con errores estructurales/sello (rojo)." },
    ],
    dependencias: {
      necesita: [{ tool: "Expediente activo", ruta: "/app/clientes", motivo: "Para guardar la validación dentro del cliente correcto." }],
      alimenta: [{ tool: "Expedientes", ruta: "/app/clientes", motivo: "La validación queda en el historial del cliente." }],
      datosMinimos: ["Archivo XML CFDI 4.0"],
    },
  },

  "cfdi-verifier": {
    slug: "cfdi-verifier",
    title: "Verificador CFDI ante SAT",
    queHace:
      "Consulta el estatus real del CFDI directamente en el SAT (vigente / cancelado / no encontrado). Soporta autollenado escaneando el QR del comprobante o capturando manualmente RFC emisor, RFC receptor, UUID y total.",
    cuandoUsar: "Antes de pagar a un proveedor, antes de declarar una deducción importante, o cuando sospechas que un CFDI fue cancelado.",
    tutorial: [
      { n: 1, titulo: "Captura o escanea", detalle: "Pega el QR del CFDI para autollenado, o ingresa manualmente: RFC emisor, RFC receptor, UUID (folio fiscal) y total exacto." },
      { n: 2, titulo: "Consulta al SAT", detalle: "El botón principal envía la consulta al servicio público del SAT. Tarda unos segundos." },
      { n: 3, titulo: "Lee el estatus", detalle: "Verde = vigente; Rojo = cancelado; Gris = no encontrado en el SAT (revisa los datos)." },
      { n: 4, titulo: "Guarda la verificación", detalle: "Botón 'Guardar' archiva el resultado en el expediente — útil como evidencia ante una revisión." },
    ],
    resultados: [
      { campo: "Estatus SAT", significado: "Vigente / Cancelado / No encontrado.", rango: "Vigente = se puede deducir/acreditar · Cancelado = corregir contabilidad · No encontrado = datos incorrectos" },
      { campo: "Fecha de cancelación", significado: "Si está cancelado, indica cuándo se canceló." },
    ],
    dependencias: {
      necesita: [{ tool: "Expediente activo", ruta: "/app/clientes", motivo: "Para guardar la verificación en el cliente." }],
      alimenta: [{ tool: "Conciliación Integral", ruta: "/app/conciliacion-integral", motivo: "Las verificaciones ayudan a clasificar incidencias de CFDI cancelados." }],
      datosMinimos: ["RFC emisor, RFC receptor, UUID, total"],
    },
  },

  "efos-validator": {
    slug: "efos-validator",
    title: "Validador 69-B / EFOS",
    queHace:
      "Verifica si un RFC aparece en las listas del SAT publicadas conforme al artículo 69-B del CFF: Presunto, Definitivo, Sentencia Favorable o Desvirtuado. Operar con un EFOS Definitivo invalida deducciones e implica riesgo penal.",
    cuandoUsar: "Antes de dar de alta un proveedor nuevo, antes de deducir un CFDI de monto alto, y en auditorías periódicas a tu cartera de proveedores.",
    tutorial: [
      { n: 1, titulo: "Captura el RFC", detalle: "Ingresa el RFC del proveedor o emisor que quieres verificar (PF o PM)." },
      { n: 2, titulo: "Ejecuta la consulta", detalle: "El sistema compara contra la lista vigente del SAT (actualizada periódicamente)." },
      { n: 3, titulo: "Lee el dictamen", detalle: "Si el RFC aparece, verás la categoría (Presunto/Definitivo/Sentencia Favorable/Desvirtuado) y la fecha de publicación." },
    ],
    resultados: [
      { campo: "Dictamen 69-B", significado: "Presunto = riesgo medio; Definitivo = NO deducir, alto riesgo penal; Desvirtuado/Sentencia Favorable = se restablece deducibilidad.", rango: "Definitivo = bloquear · Presunto = exigir defensa documental · Limpio = sin observación" },
    ],
    dependencias: {
      necesita: [],
      alimenta: [
        { tool: "Validador de Deducibilidad", ruta: "/app/tools/deducibility-checker", motivo: "Un EFOS detectado bloquea automáticamente la deducción." },
        { tool: "Riesgo SAT", ruta: "/app/riesgo", motivo: "Operar con EFOS sube el score de riesgo." },
      ],
      datosMinimos: ["RFC a verificar"],
    },
  },

  "deducibility-checker": {
    slug: "deducibility-checker",
    title: "Validador de Deducibilidad IA",
    queHace:
      "Analiza todos los CFDI de gastos del cliente y los clasifica con IA en: deducibles, por revisar y no deducibles. Aplica reglas del CFF/LISR/RMF (forma de pago, método, uso CFDI, EFOS, tope de efectivo $2K, etc.) y calcula el monto en riesgo.",
    cuandoUsar: "Antes del cierre mensual para limpiar deducciones improcedentes, y en la planeación anual para identificar partidas que el SAT puede rechazar.",
    tutorial: [
      { n: 1, titulo: "Configura el año fiscal", detalle: "Selector 'Año fiscal' arriba a la izquierda. Por defecto el año en curso." },
      { n: 2, titulo: "Ejecuta o actualiza el análisis", detalle: "Botón principal 'Volver a analizar' (variant hero). Procesa todos los CFDI gastos del periodo. Tarda según volumen." },
      { n: 3, titulo: "Filtra por nivel", detalle: "Tarjetas KPI clickeables: 'CFDI gastos' (todos), 'No deducibles' (alta), 'Por revisar' (media). Click filtra la lista de abajo." },
      { n: 4, titulo: "Acciona cada CFDI", detalle: "En la tabla puedes ver el motivo (ej. 'Pagado en efectivo >$2K', 'Forma 99 no permitida', 'EFOS Definitivo') y abrir el detalle." },
    ],
    resultados: [
      { campo: "CFDI gastos", significado: "Total de CFDI recibidos del periodo analizados." },
      { campo: "No deducibles", significado: "CFDI que el SAT rechazaría con la regla aplicada. Acción: corregir o no incluir en la declaración." },
      { campo: "Por revisar", significado: "CFDI con indicios pero que requieren juicio humano (uso CFDI dudoso, monto inusual)." },
      { campo: "Monto en riesgo", significado: "Suma de los importes de los CFDI no deducibles + por revisar." },
    ],
    dependencias: {
      necesita: [
        { tool: "Descarga Masiva SAT", ruta: "/app/sat-sync", motivo: "Sin CFDI sincronizados no hay nada que analizar." },
        { tool: "Validador EFOS", ruta: "/app/tools/efos-validator", motivo: "Cruzar lista negra es uno de los criterios de no deducibilidad." },
      ],
      alimenta: [
        { tool: "Salud Fiscal", ruta: "/app/salud-fiscal", motivo: "El monto no deducible reduce el subscore de CFDI." },
        { tool: "Reporte Ejecutivo", ruta: "/app/reporte-ejecutivo", motivo: "Hallazgos críticos sobre deducciones improcedentes." },
      ],
      datosMinimos: ["≥ 1 mes de CFDI gastos sincronizados"],
    },
    costos: "Análisis con IA: consume créditos proporcional al volumen de CFDI procesados.",
  },

  "isr-iva-calculator": {
    slug: "isr-iva-calculator",
    title: "Calculadora ISR / IVA — Persona Física",
    queHace:
      "Calcula pagos provisionales mensuales de ISR e IVA para personas físicas (actividad empresarial / profesional / RESICO PF). Permite importar automáticamente CFDI emitidos y recibidos del expediente para llenar ingresos y deducciones.",
    cuandoUsar: "Cada mes antes del día 17 para preparar el pago provisional, y para simular el impacto fiscal de operaciones nuevas.",
    tutorial: [
      { n: 1, titulo: "Selecciona expediente y periodo", detalle: "RFC arriba (barra superior), mes/año en el panel de la calculadora." },
      { n: 2, titulo: "Importa CFDI del expediente", detalle: "Botón 'Importar del expediente' trae ingresos y gastos del periodo. También puedes capturar manualmente." },
      { n: 3, titulo: "Revisa subtotales", detalle: "Verás ingresos gravados, deducciones autorizadas, base gravable, ISR causado y retenciones." },
      { n: 4, titulo: "Lee los resultados", detalle: "Tarjetas finales con ISR e IVA a pagar (o saldo a favor) del periodo." },
    ],
    resultados: [
      { campo: "ISR del periodo", significado: "Importe a pagar (rojo) o saldo a favor (verde) de ISR del mes calculado." },
      { campo: "IVA del periodo", significado: "IVA trasladado − IVA acreditable − retenciones = a cargo o a favor." },
      { campo: "Base gravable", significado: "Ingresos − deducciones autorizadas, antes de aplicar tarifa." },
    ],
    dependencias: {
      necesita: [{ tool: "Descarga Masiva SAT", ruta: "/app/sat-sync", motivo: "Para autocompletar ingresos y deducciones desde CFDI." }],
      alimenta: [{ tool: "Salud Fiscal", ruta: "/app/salud-fiscal", motivo: "ISR estimado entra en KPIs fiscales mensuales." }],
      datosMinimos: ["RFC + ingresos del periodo (manual o por CFDI)"],
    },
  },

  "isr-iva-pm": {
    slug: "isr-iva-pm",
    title: "Calculadora ISR / IVA — Persona Moral",
    queHace:
      "Calcula pagos provisionales mensuales de ISR e IVA para personas morales del régimen general (601) o RESICO PM (626). Aplica coeficiente de utilidad, amortiza pérdidas fiscales y descuenta pagos provisionales anteriores.",
    cuandoUsar: "Cada mes para el pago provisional y para simular el efecto de operaciones extraordinarias en el cálculo acumulado.",
    tutorial: [
      { n: 1, titulo: "Selecciona expediente y periodo", detalle: "RFC en barra superior, periodo (mes/año) en el panel." },
      { n: 2, titulo: "Importa del expediente (opcional)", detalle: "Botón 'Importar del expediente' trae los CFDI del periodo para sembrar ingresos." },
      { n: 3, titulo: "Captura los parámetros clave", detalle: "Ingresos nominales del mes y acumulados, coeficiente de utilidad (de la declaración anual previa), pérdidas fiscales pendientes, pagos provisionales anteriores y retenciones ISR." },
      { n: 4, titulo: "Revisa el resultado", detalle: "Cálculo del ISR provisional y del IVA del mes según las cifras capturadas." },
    ],
    resultados: [
      { campo: "Base gravable estimada", significado: "Ingresos acumulados × coeficiente − pérdidas." },
      { campo: "ISR provisional a pagar", significado: "ISR causado − pagos provisionales anteriores − retenciones." },
      { campo: "IVA del mes", significado: "IVA trasladado − acreditable − retenciones." },
    ],
    dependencias: {
      necesita: [{ tool: "Descarga Masiva SAT", ruta: "/app/sat-sync", motivo: "CFDI emitidos = ingresos nominales del mes." }],
      alimenta: [{ tool: "Salud Fiscal", ruta: "/app/salud-fiscal", motivo: "El ISR estimado alimenta el comparativo mensual." }],
      datosMinimos: ["Coeficiente de utilidad de la última declaración anual", "Ingresos del mes (manual o por CFDI)"],
    },
  },

  "resico-calculator": {
    slug: "resico-calculator",
    title: "Calculadora RESICO Persona Física",
    queHace:
      "Calcula la tasa efectiva del Régimen Simplificado de Confianza para PF según los ingresos mensuales: 1.00% hasta $25K, 1.10% hasta $50K, 1.50% hasta $83.33K, 2.00% hasta $208.33K, 2.50% hasta $3.5M.",
    cuandoUsar: "Para decidir si conviene cambiar a RESICO, para calcular pago mensual y para proyectar ingreso máximo antes de cambiar de tramo.",
    tutorial: [
      { n: 1, titulo: "Captura ingresos del mes", detalle: "Solo necesitas el monto de ingresos cobrados (efectivamente percibidos) en el mes." },
      { n: 2, titulo: "Revisa la tasa aplicable", detalle: "La calculadora identifica automáticamente el tramo y muestra el porcentaje aplicado." },
      { n: 3, titulo: "Lee el ISR a pagar", detalle: "Importe que se entera al SAT a más tardar el día 17 del mes siguiente." },
    ],
    resultados: [
      { campo: "Tasa efectiva", significado: "Porcentaje aplicado según el tramo de ingresos.", rango: "1.00% · 1.10% · 1.50% · 2.00% · 2.50%" },
      { campo: "ISR mensual", significado: "Ingresos del mes × tasa." },
    ],
    dependencias: { necesita: [], alimenta: [], datosMinimos: ["Ingresos cobrados del mes"] },
  },

  "express-auditor": {
    slug: "express-auditor",
    title: "Auditor Express",
    queHace:
      "Hace una pre-auditoría rápida de un expediente: cruza CFDI vs declaraciones esperadas, detecta omisiones, observaciones documentales y riesgos comunes. Entrega un PDF ejecutivo con hallazgos priorizados.",
    cuandoUsar: "Al recibir un cliente nuevo para diagnóstico inicial, o cada trimestre como salud checkup ligero.",
    tutorial: [
      { n: 1, titulo: "Selecciona el expediente", detalle: "RFC en barra superior. El auditor lee CFDI y datos del cliente." },
      { n: 2, titulo: "Carga los datos", detalle: "Botón principal — procesa el cruce y construye los hallazgos." },
      { n: 3, titulo: "Exporta el PDF", detalle: "Botón 'Exportar PDF' (requiere que los datos estén cargados, si no muestra error)." },
    ],
    resultados: [
      { campo: "Hallazgos", significado: "Lista priorizada de observaciones (alta/media/baja)." },
      { campo: "PDF ejecutivo", significado: "Documento listo para enviar al cliente con el diagnóstico." },
    ],
    dependencias: {
      necesita: [{ tool: "Descarga Masiva SAT", ruta: "/app/sat-sync", motivo: "Requiere CFDI sincronizados para encontrar omisiones." }],
      alimenta: [{ tool: "Reporte Ejecutivo", ruta: "/app/reporte-ejecutivo", motivo: "Los hallazgos pueden documentarse en el reporte mensual." }],
      datosMinimos: ["Expediente con CFDI cargados"],
    },
  },

  "sat-risk": {
    slug: "sat-risk",
    title: "Calculadora Riesgo SAT",
    queHace:
      "Versión rápida del análisis de Riesgo SAT 2026 — calcula un score puntual sin necesidad de cargar todo el módulo completo. Útil para revisiones puntuales.",
    cuandoUsar: "Cuando quieres una estimación rápida sin abrir el módulo completo de Riesgo SAT.",
    tutorial: [
      { n: 1, titulo: "Selecciona el expediente", detalle: "RFC en barra superior." },
      { n: 2, titulo: "Lee el score", detalle: "Resultado numérico 0-100 con semáforo (mientras más alto, peor)." },
    ],
    resultados: [
      { campo: "Score Riesgo SAT", significado: "0-30 verde · 31-70 amarillo · 71-100 rojo." },
    ],
    dependencias: {
      necesita: [{ tool: "Descarga Masiva SAT", ruta: "/app/sat-sync", motivo: "Base de CFDI para evaluar criterios." }],
      alimenta: [{ tool: "Riesgo SAT 2026", ruta: "/app/riesgo", motivo: "El módulo completo da el desglose por los 12 criterios." }],
      datosMinimos: ["CFDI sincronizados"],
    },
  },

  "csf-parser": {
    slug: "csf-parser",
    title: "Lector de Constancia de Situación Fiscal",
    queHace:
      "Lee un PDF de Constancia de Situación Fiscal del SAT y extrae automáticamente RFC, razón social, régimen fiscal, código postal, domicilio y obligaciones. Ahorra captura manual al dar de alta clientes.",
    cuandoUsar: "Al dar de alta un cliente nuevo cuando te envía su CSF, o para verificar que los datos del expediente coinciden con la versión vigente del SAT.",
    tutorial: [
      { n: 1, titulo: "Sube el PDF de la CSF", detalle: "Arrastra el archivo o usa el selector. Acepta solo PDFs originales del SAT (no escaneos)." },
      { n: 2, titulo: "Revisa los datos extraídos", detalle: "Se muestran RFC, razón social, régimen, CP y obligaciones detectadas." },
      { n: 3, titulo: "Usa los datos para alta", detalle: "Copia los datos al alta de cliente en Expedientes." },
    ],
    resultados: [
      { campo: "Datos del contribuyente", significado: "RFC, razón social, régimen fiscal vigente, CP, domicilio." },
      { campo: "Obligaciones", significado: "Lista de declaraciones a las que está obligado el RFC según el SAT." },
    ],
    dependencias: {
      necesita: [],
      alimenta: [{ tool: "Expedientes / Clientes", ruta: "/app/clientes", motivo: "Datos para alta o actualización del expediente." }],
      datosMinimos: ["PDF original de CSF del SAT"],
    },
  },

  "xml-bulk-reader": {
    slug: "xml-bulk-reader",
    title: "Lector masivo de XML CFDI",
    queHace:
      "Carga decenas o cientos de XML CFDI en una sola pasada, los parsea y los guarda en el expediente activo. Ideal cuando el cliente te entrega un ZIP/carpeta con XML históricos.",
    cuandoUsar: "Al onboarding de un cliente nuevo que aún no tiene credenciales de Descarga Masiva configuradas, o para cargar XML que no provienen del SAT (de PAC propio del cliente).",
    tutorial: [
      { n: 1, titulo: "Selecciona expediente activo", detalle: "RFC en barra superior — todos los CFDI se guardan ahí." },
      { n: 2, titulo: "Sube los XML", detalle: "Selecciona múltiples archivos .xml. El sistema valida UUID y descarta inválidos." },
      { n: 3, titulo: "Guarda en lote", detalle: "Botón 'Guardar' inserta los válidos. Si algún XML no tiene UUID se omite y te avisa." },
    ],
    resultados: [
      { campo: "CFDI parseados", significado: "Cuántos archivos se leyeron correctamente." },
      { campo: "CFDI guardados", significado: "Cuántos se insertaron en el expediente (los duplicados se omiten)." },
    ],
    dependencias: {
      necesita: [{ tool: "Expediente activo", ruta: "/app/clientes", motivo: "Los XML se asocian al cliente seleccionado." }],
      alimenta: [
        { tool: "Conciliación Integral", ruta: "/app/conciliacion-integral", motivo: "CFDI cargados entran al cruce contra contabilidad y bancos." },
        { tool: "Contabilidad Automática", ruta: "/app/contabilidad-auto", motivo: "Insumo para generar pólizas borrador." },
      ],
      datosMinimos: ["Archivos .xml CFDI con UUID válido"],
    },
  },

  "bank-reconciler": {
    slug: "bank-reconciler",
    title: "Conciliador Bancario",
    queHace:
      "Importa el estado de cuenta del banco (CSV / TXT / XLS según formato), normaliza los movimientos y los cruza contra CFDI y pólizas para detectar conciliados, pendientes y discrepancias.",
    cuandoUsar: "Cada vez que cierras un mes contable, antes de declarar, y como evidencia de control interno.",
    tutorial: [
      { n: 1, titulo: "Selecciona el expediente", detalle: "RFC en barra superior." },
      { n: 2, titulo: "Sube el estado de cuenta", detalle: "Acepta formatos comunes de bancos mexicanos (BBVA, Banorte, Santander, HSBC, etc.). Se parsea automáticamente." },
      { n: 3, titulo: "Revisa el cruce", detalle: "Tabla con movimientos: matched (verde), pendientes (amarillo), discrepancias (rojo)." },
    ],
    resultados: [
      { campo: "Movimientos conciliados", significado: "Tienen CFDI y póliza asociados con monto y fecha coincidentes." },
      { campo: "Pendientes", significado: "Sin CFDI o sin póliza — requieren acción." },
    ],
    dependencias: {
      necesita: [
        { tool: "Descarga Masiva SAT", ruta: "/app/sat-sync", motivo: "Para cruzar contra CFDI." },
        { tool: "Pólizas", ruta: "/app/polizas", motivo: "Para cruzar contra registros contables." },
      ],
      alimenta: [
        { tool: "Conciliación Integral", ruta: "/app/conciliacion-integral", motivo: "Lado bancario del cruce triple." },
        { tool: "Contabilidad Automática", ruta: "/app/contabilidad-auto", motivo: "Pestaña Bancos genera pólizas desde movimientos no conciliados." },
      ],
      datosMinimos: ["Estado de cuenta del banco en formato compatible"],
    },
  },

  "shadow-payroll": {
    slug: "shadow-payroll",
    title: "Detector de Nómina Oculta",
    queHace:
      "Analiza movimientos bancarios buscando patrones recurrentes (mismo monto + misma frecuencia + mismo beneficiario) que sugieran nómina pagada fuera del recibo CFDI — práctica de alto riesgo ante SAT e IMSS.",
    cuandoUsar: "En auditorías internas y antes de presentar el dictamen fiscal, para que el cliente regularice antes que el SAT lo detecte.",
    tutorial: [
      { n: 1, titulo: "Configura año y monto mínimo", detalle: "'Año fiscal' y 'Monto mínimo' (filtra pagos chicos)." },
      { n: 2, titulo: "Ejecuta análisis", detalle: "Botón 'Volver a analizar' (hero). Procesa cargos del periodo." },
      { n: 3, titulo: "Lee KPIs", detalle: "Cargos analizados · Patrones recurrentes · Sospechosos críticos · Monto sin respaldo." },
      { n: 4, titulo: "Revisa los patrones", detalle: "Lista de transferencias recurrentes con mismo beneficiario sin CFDI nómina asociado." },
    ],
    resultados: [
      { campo: "Patrones recurrentes", significado: "Transferencias periódicas a un mismo destinatario." },
      { campo: "Sospechosos críticos", significado: "Patrones de alta confianza de ser nómina oculta." },
      { campo: "Monto sin respaldo", significado: "Suma de transferencias sin CFDI de nómina." },
    ],
    dependencias: {
      necesita: [
        { tool: "Conciliador Bancario", ruta: "/app/tools/bank-reconciler", motivo: "Necesita movimientos bancarios importados." },
        { tool: "Descarga Masiva SAT", ruta: "/app/sat-sync", motivo: "Para verificar CFDI nómina existentes." },
      ],
      alimenta: [
        { tool: "Salud Fiscal", ruta: "/app/salud-fiscal", motivo: "Reduce subscore laboral." },
        { tool: "Reporte Ejecutivo", ruta: "/app/reporte-ejecutivo", motivo: "Hallazgos críticos para el cliente." },
      ],
      datosMinimos: ["Estado de cuenta del año", "CFDI nómina sincronizados (para descartar legítimos)"],
    },
  },

  "import-prices": {
    slug: "import-prices",
    title: "Validador de Precios de Importación",
    queHace:
      "Detecta CFDI con precios atípicos (muy por encima o por debajo del promedio del SKU/concepto), patrón asociado a sub-valuación aduanera o triangulación. Configurable por umbral de desviación.",
    cuandoUsar: "Para clientes con operaciones de comercio exterior, antes del dictamen y en revisiones aduaneras.",
    tutorial: [
      { n: 1, titulo: "Configura año y umbral", detalle: "'Año fiscal' y 'Umbral desviación' (ej. 30 = marca todo lo que se aleje >30% del promedio)." },
      { n: 2, titulo: "Ejecuta análisis", detalle: "Botón 'Volver a analizar'. Agrupa CFDI por concepto y calcula desviaciones." },
      { n: 3, titulo: "Revisa anomalías", detalle: "Lista de CFDI con precio fuera del rango — revisa cada uno." },
    ],
    resultados: [
      { campo: "CFDI atípicos", significado: "Comprobantes con precio fuera del umbral configurado." },
    ],
    dependencias: {
      necesita: [{ tool: "Descarga Masiva SAT", ruta: "/app/sat-sync", motivo: "CFDI sincronizados con detalle de conceptos." }],
      alimenta: [{ tool: "Reporte Ejecutivo", ruta: "/app/reporte-ejecutivo", motivo: "Hallazgos de comercio exterior." }],
      datosMinimos: ["CFDI con conceptos repetidos a lo largo del año"],
    },
  },

  "import-clientes": {
    slug: "import-clientes",
    title: "Importar cartera de clientes",
    queHace:
      "Da de alta masiva expedientes desde un CSV. Acepta clientes, proveedores y acreedores. Permite mapear columnas y previsualiza errores antes de insertar.",
    cuandoUsar: "Al onboarding de un despacho que ya tiene cartera, para migrar desde Excel u otro sistema sin captura manual.",
    tutorial: [
      { n: 1, titulo: "Descarga la plantilla", detalle: "Botón con la estructura: rfc, razón social, tipo persona, régimen fiscal, CP, email, teléfono, tipo (cliente/proveedor/acreedor)." },
      { n: 2, titulo: "Llena tu CSV", detalle: "RFC es obligatorio (13 caracteres PF / 12 PM). Razón social obligatoria. Resto opcional." },
      { n: 3, titulo: "Sube y revisa preview", detalle: "El sistema valida filas y te muestra errores antes de insertar." },
      { n: 4, titulo: "Confirma importación", detalle: "Toast indica cuántos se importaron OK y cuántos con error." },
    ],
    resultados: [
      { campo: "Registros importados", significado: "Filas insertadas correctamente." },
      { campo: "Errores", significado: "Filas rechazadas (RFC inválido, duplicado, datos faltantes)." },
    ],
    dependencias: {
      necesita: [],
      alimenta: [{ tool: "Expedientes", ruta: "/app/clientes", motivo: "Los RFC importados ya están listos para conectar a herramientas." }],
      datosMinimos: ["CSV con columnas rfc y razón social"],
    },
  },

  "oficio-generator": {
    slug: "oficio-generator",
    title: "Generador de Oficios",
    queHace:
      "Genera oficios y escritos fiscales personalizados al cliente y al asunto: respuestas a invitaciones SAT, aclaraciones, promociones, recursos de revocación. Usa IA para redactar con tono jurídico y completar datos del expediente.",
    cuandoUsar: "Al responder un requerimiento SAT, solicitar una aclaración, o presentar un escrito promocional.",
    tutorial: [
      { n: 1, titulo: "Selecciona el tipo de oficio", detalle: "Catálogo con plantillas: respuesta a invitación, aclaración, promoción, etc." },
      { n: 2, titulo: "Captura los datos del asunto", detalle: "Número de oficio del SAT, fecha, dependencia, hechos. La IA enriquece el cuerpo." },
      { n: 3, titulo: "Genera y descarga", detalle: "El resultado se previsualiza editable. Descarga como PDF o Word." },
    ],
    resultados: [
      { campo: "Borrador generado", significado: "Texto del oficio listo para revisión y firma." },
    ],
    dependencias: {
      necesita: [{ tool: "Expediente activo", ruta: "/app/clientes", motivo: "Datos del contribuyente para encabezado y representación." }],
      alimenta: [{ tool: "Buzón / Correspondencia", ruta: "/app/admin/correspondencia", motivo: "El oficio se archiva como salida del despacho." }],
      datosMinimos: ["Datos del oficio SAT recibido (si aplica)", "Expediente activo"],
    },
    costos: "Generación con IA: consume créditos por oficio.",
  },

  "fiscal-assistant": {
    slug: "fiscal-assistant",
    title: "Asistente Fiscal IA",
    queHace:
      "Chat especializado en materia fiscal mexicana (CFF, LISR, LIVA, RMF). Resuelve dudas técnicas, explica artículos, propone interpretaciones y cita fundamentos. NO sustituye opinión legal — es apoyo para el contador.",
    cuandoUsar: "Cuando tienes una duda puntual de criterio fiscal, necesitas redactar una postura técnica, o quieres entender una reforma reciente.",
    tutorial: [
      { n: 1, titulo: "Escribe tu pregunta", detalle: "Caja de chat: 'Pregunta sobre CFDI, ISR, IVA, RESICO...'. Sé específico (incluye RFC tipo persona, supuesto, monto)." },
      { n: 2, titulo: "Envía", detalle: "Botón hero envía. La IA responde con explicación y fundamentos legales cuando aplica." },
      { n: 3, titulo: "Continúa la conversación", detalle: "El chat mantiene contexto — puedes refinar la pregunta sin repetir el supuesto." },
    ],
    resultados: [
      { campo: "Respuesta IA", significado: "Explicación técnica con referencias a artículos cuando aplica." },
    ],
    dependencias: {
      necesita: [],
      alimenta: [],
      datosMinimos: ["Pregunta clara con contexto suficiente"],
    },
    costos: "Cada pregunta consume créditos IA. Las preguntas largas / con varias iteraciones consumen más.",
  },

  // ============================================================
  // LEGAL · REDACTOR DE ESCRITOS IA
  // ============================================================
  "legal-redactor": {
    slug: "legal-redactor",
    title: "Redactor de Escritos IA",
    queHace:
      "Genera escritos fiscales y de defensa (recurso de revocación, juicio contencioso TFJA, amparo, solicitud de devolución, respuesta a invitación SAT, etc.) con calidad de despacho boutique: proemio, hechos numerados, agravios con fundamento (CFF, LISR, LIVA, LFPCA, LA), jurisprudencia aplicable, pretensiones, pruebas y fórmula de protesta. Tres niveles de profundidad según urgencia y complejidad.",
    cuandoUsar:
      "Cuando recibes un oficio del SAT y tienes plazo legal corriendo, cuando preparas defensa de una determinación, o cuando necesitas un borrador estructurado para revisar con tu equipo antes de firmar.",
    tutorial: [
      { n: 1, titulo: "Elige el tipo de escrito", detalle: "En el panel izquierdo, selecciona en 'Tipo de escrito' la materia (recurso, juicio, amparo, etc.). Abajo verás el fundamento y la autoridad competente que la IA usará." },
      { n: 2, titulo: "Selecciona profundidad", detalle: "Estándar (800-1.2K palabras, rápido), Robusto (1.5-2.5K, equilibrio) o Premium (3-4.5K, Gemini Pro). Premium consume más créditos pero da el máximo desarrollo argumentativo." },
      { n: 3, titulo: "Captura datos del promovente", detalle: "Razón social, RFC y monto controvertido. Si tienes expediente activo, razón social y RFC se llenan solos. Agrega domicilio fiscal, representante legal y oficio referenciado para que el escrito quede listo para firma." },
      { n: 4, titulo: "Describe el expediente", detalle: "En 'Hechos' captura la narrativa cronológica (mínimo 20 caracteres, recomendado 200+). En 'Agravios' tu tesis de defensa si ya la tienes — si no, la IA la propone. En 'Pretensiones' qué pides y en 'Pruebas' qué documentales tienes.", tip: "Entre más detalle en hechos y pruebas, mejor calidad. La IA no inventa hechos: trabaja con lo que le des." },
      { n: 5, titulo: "Genera y revisa", detalle: "Pulsa 'Generar escrito con IA'. Tarda 15-45 segundos según nivel. El borrador aparece a la derecha en formato profesional. Usa 'Copiar' o 'Descargar .md' para llevarlo a Word.", tip: "Siempre revisa: la IA es asistente, no sustituye criterio jurídico. Verifica fechas, montos y vigencia de jurisprudencias citadas." },
    ],
    resultados: [
      { campo: "Borrador del escrito", significado: "Texto formal con proemio, hechos, agravios, fundamentos, pretensiones, pruebas y protesta. Listo para revisar, ajustar y presentar." },
      { campo: "Conteo de palabras", significado: "Aparece junto al título cuando termina. Te ayuda a verificar que el nivel produjo el desarrollo esperado." },
      { campo: "Botones Copiar / .md", significado: "Copiar lleva el texto al portapapeles. Descargar genera un archivo Markdown que puedes abrir en Word." },
    ],
    dependencias: {
      necesita: [
        { tool: "Expediente del cliente", ruta: "/app/clientes", motivo: "Para auto-llenar razón social y RFC. Opcional pero recomendado." },
        { tool: "Oficio o resolución", motivo: "Necesitas el número y fecha del acto que estás impugnando." },
      ],
      alimenta: [
        { tool: "Lagunas Legales", ruta: "/app/legal/lagunas", motivo: "Una vez presentado el escrito, registra el caso para seguimiento." },
        { tool: "Marketplace Legal", ruta: "/app/legal/marketplace", motivo: "Si el caso te rebasa, contacta un despacho que firme la estrategia." },
      ],
      datosMinimos: ["Tipo de escrito", "Razón social y RFC", "Hechos (mínimo 20 caracteres)"],
    },
    costos: "Consume créditos IA. Estándar y Robusto usan Gemini Flash (más barato). Premium usa Gemini 2.5 Pro (mayor costo, mejor argumentación).",
  },

  // ============================================================
  // LEGAL · LAGUNAS / CASOS DE DEFENSA
  // ============================================================
  "legal-lagunas": {
    slug: "legal-lagunas",
    title: "Lagunas Legales y Casos de Defensa",
    queHace:
      "Catálogo de 8 lagunas jurídico-fiscales con mayor retorno histórico (materialidad 69-B, devolución IVA preoperativo, acreditamiento en gastos no esenciales, pagos al extranjero, pérdidas por reestructura, REPSE, gastos de representación, IVA de activos mixtos) más un gestor de casos activos: registra defensa, sigue estatus, mide recuperación y mantiene historial por cliente.",
    cuandoUsar:
      "Después de una auditoría de Salud Fiscal o Riesgo SAT que detecte exposición. Al iniciar la defensa de una determinación. Para evaluar potencial de devolución antes de cobrar honorarios contingentes.",
    tutorial: [
      { n: 1, titulo: "Selecciona expediente", detalle: "En la barra superior elige el cliente. La pantalla filtra automáticamente los casos de ese RFC." },
      { n: 2, titulo: "Explora el catálogo", detalle: "Revisa las 8 lagunas con su conflicto normativo, rango de recuperación, % éxito histórico y estrategia recomendada." },
      { n: 3, titulo: "Registra un caso", detalle: "Pulsa el botón '+' y captura: laguna aplicable, estatus (activa, en proceso, resuelta favorable/desfavorable, archivada), notas internas y monto estimado." },
      { n: 4, titulo: "Actualiza estatus", detalle: "Conforme avanza el caso, edita el registro para reflejar cambios. El historial queda para reportes y honorarios." },
      { n: 5, titulo: "Archiva o elimina", detalle: "Casos cerrados pásalos a 'archivada' para mantener limpia la vista. Eliminar es permanente; archivar conserva el historial." },
    ],
    resultados: [
      { campo: "% Éxito histórico", significado: "Porcentaje de casos similares que resultaron favorables en TFJA / SCJN.", rango: "55%-87% según laguna" },
      { campo: "Rango recuperación", significado: "Importe típico recuperado o multa evitada en casos similares." },
      { campo: "Estatus del caso", significado: "Activa (en estrategia), En proceso (escrito presentado), Resuelta favorable/desfavorable, Archivada." },
    ],
    dependencias: {
      necesita: [
        { tool: "Riesgo SAT", ruta: "/app/riesgo", motivo: "Identifica exposiciones que pueden defenderse con estas lagunas." },
        { tool: "Redactor IA", ruta: "/app/legal/redactor", motivo: "Para preparar el escrito de defensa una vez decidida la estrategia." },
      ],
      alimenta: [
        { tool: "Reporte Ejecutivo", ruta: "/app/reporte-ejecutivo", motivo: "Casos y recuperaciones se reflejan en el reporte mensual del cliente." },
      ],
      datosMinimos: ["Expediente activo", "Laguna aplicable seleccionada"],
    },
  },

  // ============================================================
  // LEGAL · MARKETPLACE
  // ============================================================
  "legal-marketplace": {
    slug: "legal-marketplace",
    title: "Marketplace Legal",
    queHace:
      "Directorio de despachos verificados por especialidad (devoluciones IVA, materialidad 69-B, precios de transferencia, juicio contencioso, penal fiscal, aduanal). Pensado para cuando un caso supera tu especialidad: la IA prepara el expediente, el despacho firma y defiende.",
    cuandoUsar:
      "Cuando un caso requiere firma de abogado especialista (amparo, juicio TFJA, penal fiscal) y no tienes a la persona en casa. Cuando quieres una segunda opinión antes de presentar.",
    tutorial: [
      { n: 1, titulo: "Filtra por especialidad", detalle: "Revisa la lista de despachos. Cada tarjeta muestra especialidad, ciudad, rating, casos atendidos y rango de honorarios." },
      { n: 2, titulo: "Solicita cotización", detalle: "Pulsa 'Solicitar cotización' en el despacho elegido. El expediente preparado en ContaClick (redactor, lagunas, salud fiscal) se comparte con el despacho seleccionado." },
      { n: 3, titulo: "Acuerda alcance", detalle: "Negocia directamente con el despacho honorarios, plazos y entregables. ContaClick no es parte del contrato." },
    ],
    resultados: [
      { campo: "Rating del despacho", significado: "Promedio de calificaciones de clientes anteriores en la plataforma." },
      { campo: "Casos atendidos", significado: "Número total de casos verificados que ha llevado el despacho." },
      { campo: "Rango de honorarios", significado: "Estimado típico — la cotización final depende de la complejidad." },
    ],
    dependencias: {
      necesita: [
        { tool: "Redactor IA", ruta: "/app/legal/redactor", motivo: "Para llegar al despacho con expediente y borrador preparado." },
      ],
      alimenta: [],
      datosMinimos: ["Expediente del cliente listo para defensa"],
    },
  },

  // ============================================================
  // ADMIN · TESORERÍA
  // ============================================================
  "admin-tesoreria": {
    slug: "admin-tesoreria",
    title: "Tesorería y Flujo de Caja",
    queHace:
      "Maneja cuentas por cobrar (CXC) y por pagar (CXP) del despacho o del cliente. Calcula KPIs de 30 y 90 días, vencidos, flujo neto y dibuja la curva de proyección diaria a 30 días para anticipar faltantes de caja.",
    cuandoUsar:
      "Semanalmente para cobranza, antes de comprometer pagos grandes y al cierre mensual para validar liquidez vs obligaciones fiscales.",
    tutorial: [
      { n: 1, titulo: "Carga datos", detalle: "Usa '+ CXC' / '+ CXP' para alta manual, 'Importar CXC' / 'Importar CXP' para subir CSV/Excel (columnas: contraparte, concepto, monto, moneda, fecha_emision, fecha_vencimiento, estado), o 'Cargar demo' para probar." },
      { n: 2, titulo: "Lee los KPIs", detalle: "Por cobrar 30d, Por pagar 30d, Flujo neto 90d y Vencidos por cobrar. Si Flujo neto es negativo en rojo: alerta de liquidez." },
      { n: 3, titulo: "Revisa la proyección", detalle: "La curva muestra saldo acumulado neto día a día durante 30 días. Las caídas marcan días críticos donde sale más de lo que entra." },
      { n: 4, titulo: "Marca pagados", detalle: "Cuando se cobre/pague, usa el botón check verde para marcar como cobrado/pagado. Los KPIs y la curva se recalculan automáticamente." },
    ],
    resultados: [
      { campo: "Por cobrar 30d", significado: "Suma de CXC pendientes que vencen en los próximos 30 días naturales." },
      { campo: "Flujo neto 90d", significado: "(CXC 90d) − (CXP 90d). Positivo = superávit; negativo = déficit proyectado.", rango: "Verde si ≥0, rojo si <0" },
      { campo: "Vencidos por cobrar", significado: "CXC pendientes cuya fecha de vencimiento ya pasó. Cobranza prioritaria." },
      { campo: "Proyección 30 días", significado: "Curva del saldo acumulado neto día a día. Bajadas pronunciadas = días de presión de caja." },
    ],
    dependencias: {
      necesita: [],
      alimenta: [
        { tool: "Reporte Ejecutivo", ruta: "/app/reporte-ejecutivo", motivo: "Liquidez y antigüedad de saldos se integran al reporte mensual." },
      ],
      datosMinimos: ["Al menos un CXC o CXP con contraparte, monto y fecha de vencimiento"],
    },
  },

  // ============================================================
  // ADMIN · TRÁMITES
  // ============================================================
  "admin-tramites": {
    slug: "admin-tramites",
    title: "Trámites Administrativos",
    queHace:
      "Tablero de seguimiento de trámites ante SAT, IMSS, INFONAVIT, STPS y dependencias estatales: altas, bajas, modificaciones, opiniones de cumplimiento, devoluciones, avisos. Cada trámite lleva responsable, fecha límite, estatus y documentos asociados.",
    cuandoUsar:
      "Cada vez que abres un trámite nuevo, para no perder folios ni plazos. En juntas de equipo para repartir cargas. Al cierre de mes para reportar al cliente qué se gestionó.",
    tutorial: [
      { n: 1, titulo: "Da de alta el trámite", detalle: "Captura tipo (alta IMSS, opinión cumplimiento, devolución IVA, etc.), cliente, autoridad, folio, fecha de presentación y plazo legal." },
      { n: 2, titulo: "Asigna responsable", detalle: "Selecciona miembro del equipo. La persona recibe el pendiente en su panel y notificaciones de vencimiento." },
      { n: 3, titulo: "Actualiza estatus", detalle: "Conforme avanza: 'En proceso', 'Esperando autoridad', 'Concluido', 'Negado'. Adjunta acuses y resoluciones." },
      { n: 4, titulo: "Cierra el trámite", detalle: "Al concluir, marca como 'Concluido' con resultado y observaciones. Queda en historial para auditoría." },
    ],
    resultados: [
      { campo: "Estatus", significado: "En proceso, Esperando autoridad, Concluido, Negado o Vencido." },
      { campo: "Días restantes", significado: "Cálculo automático del plazo legal vs hoy. En rojo si negativo (vencido)." },
      { campo: "Responsable", significado: "Miembro del equipo encargado de empujar el trámite hasta cierre." },
    ],
    dependencias: {
      necesita: [
        { tool: "Equipo", ruta: "/app/equipo", motivo: "Para asignar responsables." },
        { tool: "Expediente del cliente", ruta: "/app/clientes", motivo: "Cada trámite va ligado a un RFC." },
      ],
      alimenta: [
        { tool: "Reporte Ejecutivo", ruta: "/app/reporte-ejecutivo", motivo: "Trámites concluidos y en curso aparecen en el reporte mensual del cliente." },
      ],
      datosMinimos: ["Tipo de trámite", "Cliente", "Autoridad", "Fecha presentación"],
    },
  },

  // ============================================================
  // ADMIN · BUZÓN TRIBUTARIO
  // ============================================================
  "admin-buzon": {
    slug: "admin-buzon",
    title: "Lector de Buzón Tributario",
    queHace:
      "Lee cada notificación recibida en el Buzón Tributario (SAT, IMSS, INFONAVIT), la interpreta con IA, identifica riesgo legal, calcula el plazo legal (días naturales o hábiles), propone acción recomendada y prepara borrador de respuesta. Evita perder oficios entre la bandeja del cliente.",
    cuandoUsar:
      "Diariamente como primera revisión del día. Inmediatamente al recibir notificación urgente (invitación, requerimiento, multa).",
    tutorial: [
      { n: 1, titulo: "Revisa la bandeja", detalle: "Las notificaciones aparecen ordenadas por fecha. Las marcadas con triángulo ámbar son urgentes." },
      { n: 2, titulo: "Abre un mensaje", detalle: "Al seleccionar uno, a la derecha aparece el análisis IA: riesgo legal, plazo restante, acción recomendada y defensa alterna si aplica." },
      { n: 3, titulo: "Genera respuesta", detalle: "Pulsa 'Generar respuesta con IA' para crear un borrador formal listo para revisar y firmar." },
      { n: 4, titulo: "Da seguimiento", detalle: "Cuando presentes la respuesta, marca el mensaje como atendido y registra el folio en Trámites." },
    ],
    resultados: [
      { campo: "Riesgo legal", significado: "Bajo (informativo), Medio (invitación previa), Alto (requerimiento/determinación)." },
      { campo: "Plazo", significado: "Días restantes para responder según el tipo de acto (10, 15, 20 días según fundamento)." },
      { campo: "Acción recomendada", significado: "Lo que la IA propone hacer y por qué. Siempre revisa con criterio profesional." },
    ],
    dependencias: {
      necesita: [
        { tool: "e.firma del cliente", motivo: "Para autenticar en Buzón Tributario y sincronizar mensajes." },
      ],
      alimenta: [
        { tool: "Trámites", ruta: "/app/admin/tramites", motivo: "Cada respuesta presentada se registra como trámite con folio." },
        { tool: "Redactor IA", ruta: "/app/legal/redactor", motivo: "Si la respuesta requiere escrito formal, el borrador se completa allí." },
      ],
      datosMinimos: ["Conexión activa al Buzón Tributario del cliente"],
    },
    costos: "Análisis IA y generación de respuestas consume créditos.",
  },

  // ============================================================
  // ADMIN · CORRESPONDENCIA
  // ============================================================
  "admin-correspondencia": {
    slug: "admin-correspondencia",
    title: "Correspondencia y Minutas",
    queHace:
      "Generador asistido de oficios, minutas de reunión, cartas de aceptación de servicio, recordatorios de pago, actas de entrega y notificaciones de cambios normativos. Tono profesional, fundamento legal cuando aplica, exportable a Word y PDF.",
    cuandoUsar:
      "Después de cada reunión con cliente, al iniciar un servicio, al notificar reforma fiscal, o al gestionar cobranza.",
    tutorial: [
      { n: 1, titulo: "Elige plantilla", detalle: "Lista a la izquierda. Cada plantilla tiene tono y estructura predefinida según el caso de uso." },
      { n: 2, titulo: "Captura los datos", detalle: "El editor inteligente carga campos clave (destinatario, asunto, fecha, puntos). La IA completa el cuerpo con fundamento si aplica." },
      { n: 3, titulo: "Genera y exporta", detalle: "Pulsa 'Generar con IA'. Revisa el borrador y exporta a Word o PDF para enviar al cliente." },
    ],
    resultados: [
      { campo: "Documento final", significado: "Texto formal listo para impresión o envío digital, con membrete del despacho." },
    ],
    dependencias: {
      necesita: [],
      alimenta: [
        { tool: "Mensajes", ruta: "/app/mensajes", motivo: "Los documentos generados pueden enviarse al cliente desde el módulo de mensajes." },
      ],
      datosMinimos: ["Plantilla seleccionada", "Datos básicos del destinatario"],
    },
    costos: "Cada generación IA consume créditos según largo del documento.",
  },

  // ============================================================
  // ADMIN · CUMPLIMIENTO LABORAL
  // ============================================================
  "admin-cumplimiento": {
    slug: "admin-cumplimiento",
    title: "Cumplimiento Laboral",
    queHace:
      "Checklist en tiempo real de obligaciones ante IMSS, INFONAVIT, SAT (laboral) y STPS: cuotas mensuales/bimestrales, SUA, declaración de riesgos, CFDI de nómina, DIM, NOM-035, Comisiones mixtas. Detecta cambios normativos y ajusta el calendario automáticamente.",
    cuandoUsar:
      "Diariamente como dashboard del área laboral. Antes del día 17 (corte IMSS) y antes de cierres bimestrales INFONAVIT.",
    tutorial: [
      { n: 1, titulo: "Lee el % de cumplimiento", detalle: "Indicador global de qué tan al día estás. Verde = todo OK, ámbar = pendientes próximos, rojo = vencidos." },
      { n: 2, titulo: "Revisa por área", detalle: "Tarjetas separadas para IMSS, INFONAVIT, SAT y STPS con cada obligación, fecha de cumplimiento y estatus." },
      { n: 3, titulo: "Atiende las alertas activas", detalle: "Los pendientes con plazo <7 días aparecen marcados con icono ámbar; los vencidos en rojo. Atiéndelos primero." },
    ],
    resultados: [
      { campo: "% Cumplimiento", significado: "Obligaciones OK / total. Mide la salud del área laboral.", rango: "≥90% verde, 70-89% ámbar, <70% rojo" },
      { campo: "Alertas activas", significado: "Obligaciones vencidas o por vencer en los próximos 7 días." },
      { campo: "Próximas 30 días", significado: "Para planificar carga del equipo del mes." },
    ],
    dependencias: {
      necesita: [
        { tool: "Catálogo de empleados del cliente", motivo: "Para validar movimientos afiliatorios y SUA." },
      ],
      alimenta: [
        { tool: "Calendario Fiscal", ruta: "/app/calendario", motivo: "Las obligaciones se reflejan en el calendario unificado." },
      ],
      datosMinimos: ["Cliente con régimen laboral activo"],
    },
  },

  // ============================================================
  // ADMIN · NÓMINA
  // ============================================================
  "admin-nomina": {
    slug: "admin-nomina",
    title: "Nómina y Recursos Humanos",
    queHace:
      "Vista operativa de la nómina del cliente: cálculo y timbrado de CFDI 4.0 de nómina, percepciones y deducciones, ISR retenido, subsidio al empleo, cuotas obrero-patronales, finiquitos y constancias. Integrado con IMSS para SUA y con Cumplimiento Laboral.",
    cuandoUsar:
      "En cada periodo de pago (semanal, quincenal, mensual) y cuando hay altas, bajas o modificaciones salariales.",
    tutorial: [
      { n: 1, titulo: "Carga el periodo", detalle: "Selecciona periodo de pago. El sistema trae empleados activos del cliente con su salario base." },
      { n: 2, titulo: "Aplica percepciones y deducciones", detalle: "Captura horas extra, bonos, faltas, préstamos. El sistema recalcula ISR, IMSS e INFONAVIT." },
      { n: 3, titulo: "Timbra los CFDI", detalle: "Genera y timbra los CFDI 4.0 de nómina con el PAC. Cada timbrado consume saldo PAC." },
      { n: 4, titulo: "Genera SUA", detalle: "Al cierre de mes, descarga el pre-SUA listo para subir a IMSS." },
    ],
    resultados: [
      { campo: "ISR retenido", significado: "Suma de retenciones del periodo. Se acumula para la declaración mensual del cliente." },
      { campo: "Cuotas obrero-patronales", significado: "IMSS (patrón) + IMSS (trabajador) + INFONAVIT. Se integra a SUA." },
      { campo: "Estatus CFDI", significado: "Pendiente, Timbrado, Cancelado. Solo los timbrados son fiscalmente válidos." },
    ],
    dependencias: {
      necesita: [
        { tool: "e.firma del cliente", motivo: "Para timbrar CFDI de nómina con el PAC." },
        { tool: "Catálogo de empleados", motivo: "Con NSS, RFC y salario diario integrado." },
      ],
      alimenta: [
        { tool: "Cumplimiento Laboral", ruta: "/app/admin/cumplimiento", motivo: "El timbrado correcto cierra la obligación CFDI-nómina del mes." },
        { tool: "Conciliación Integral", ruta: "/app/conciliacion-integral", motivo: "Los CFDI de nómina entran al cruce SAT vs contabilidad." },
      ],
      datosMinimos: ["Empleados activos", "Periodo y conceptos del periodo"],
    },
    costos: "Cada CFDI timbrado consume saldo PAC del cliente.",
  },

  // ============================================================
  // ADMIN · ACTIVOS FIJOS
  // ============================================================
  "admin-activos": {
    slug: "admin-activos",
    title: "Activos Fijos",
    queHace:
      "Registro y depreciación de activos fijos del cliente conforme a tasas LISR: inmuebles, mobiliario, equipo de cómputo, vehículos, maquinaria. Calcula depreciación contable y fiscal, valor en libros, y exporta la cédula para la declaración anual.",
    cuandoUsar:
      "Al adquirir o dar de baja un activo, mensualmente para depreciación, y obligatoriamente al cierre anual.",
    tutorial: [
      { n: 1, titulo: "Da de alta el activo", detalle: "Captura descripción, fecha de adquisición, MOI (Monto Original de la Inversión), tipo de activo y método de depreciación." },
      { n: 2, titulo: "Aplica % LISR", detalle: "El sistema sugiere la tasa de depreciación según tipo (10% mobiliario, 25% autos, 30% cómputo, etc.). Puedes ajustar." },
      { n: 3, titulo: "Cierra el mes", detalle: "Cada mes el sistema calcula la depreciación acumulada y el valor en libros." },
      { n: 4, titulo: "Exporta cédula anual", detalle: "Para la declaración anual del cliente, descarga la cédula con MOI, depreciación del ejercicio y acumulada." },
    ],
    resultados: [
      { campo: "MOI", significado: "Monto Original de la Inversión. Base de la depreciación fiscal." },
      { campo: "Depreciación acumulada", significado: "Suma de la depreciación desde la adquisición hasta el periodo actual." },
      { campo: "Valor en libros", significado: "MOI − Depreciación acumulada. Cuando llega a 0 el activo está totalmente depreciado." },
    ],
    dependencias: {
      necesita: [
        { tool: "CFDI de adquisición", motivo: "Para soportar el MOI." },
      ],
      alimenta: [
        { tool: "Contabilidad Automática", ruta: "/app/contabilidad-auto", motivo: "La depreciación mensual genera póliza de provisión." },
        { tool: "Reporte Ejecutivo", ruta: "/app/reporte-ejecutivo", motivo: "El valor en libros aparece en el balance del cliente." },
      ],
      datosMinimos: ["Descripción", "Fecha de adquisición", "MOI", "Tipo de activo"],
    },
  },

  // ============================================================
  // ADMIN · INVENTARIOS
  // ============================================================
  "admin-inventarios": {
    slug: "admin-inventarios",
    title: "Inventarios",
    queHace:
      "Control de inventarios del cliente con método PEPS o costo promedio: entradas, salidas, ajustes y existencia. Útil para clientes con régimen general que deducen costo de lo vendido y para evitar discrepancias en revisiones SAT.",
    cuandoUsar:
      "Cuando el cliente vende mercancías y necesita controlar costo de ventas. Al cierre mensual y obligatoriamente al cierre anual.",
    tutorial: [
      { n: 1, titulo: "Crea el catálogo", detalle: "Da de alta SKUs con código, descripción, unidad y costo inicial." },
      { n: 2, titulo: "Registra movimientos", detalle: "Entradas (compras), salidas (ventas) y ajustes (mermas, conteos). El sistema actualiza existencia y costo promedio." },
      { n: 3, titulo: "Concilia con CFDI", detalle: "Cruza salidas vs CFDI emitidos de venta para validar congruencia." },
      { n: 4, titulo: "Cierra el periodo", detalle: "Al cierre mensual genera reporte de existencia valorada que alimenta el balance." },
    ],
    resultados: [
      { campo: "Existencia", significado: "Unidades disponibles por SKU." },
      { campo: "Costo promedio / PEPS", significado: "Valor unitario para calcular costo de ventas conforme al método elegido." },
      { campo: "Existencia valorada", significado: "Existencia × costo. Se refleja en el balance como inventarios." },
    ],
    dependencias: {
      necesita: [
        { tool: "CFDI de compras", motivo: "Para alimentar entradas con costo unitario real." },
      ],
      alimenta: [
        { tool: "Contabilidad Automática", ruta: "/app/contabilidad-auto", motivo: "Salidas generan póliza de costo de ventas." },
        { tool: "Conciliación Integral", ruta: "/app/conciliacion-integral", motivo: "Salidas vs CFDI emitidos validan congruencia operación-fiscal." },
      ],
      datosMinimos: ["Catálogo de SKU con costo inicial", "Movimientos de entrada y salida"],
    },
  },

  // ============================================================
  // CALENDARIO FISCAL
  // ============================================================
  "calendario-fiscal": {
    slug: "calendario-fiscal",
    title: "Calendario Fiscal",
    queHace:
      "Calendario de obligaciones fiscales por expediente: pagos provisionales, definitivos, DIOT, declaración anual, retenciones, ISN, etc. Autogenera el calendario a partir del régimen y obligaciones del cliente (CSF) y permite editar, marcar cumplidas, posponer y configurar alertas.",
    cuandoUsar:
      "Al dar de alta un cliente nuevo (autogenerar) y de forma diaria/semanal para revisar próximas obligaciones y evitar recargos.",
    tutorial: [
      { n: 1, titulo: "Selecciona expediente", detalle: "Elige el RFC en el selector superior. El calendario es por cliente." },
      { n: 2, titulo: "Autogenera obligaciones", detalle: "Pulsa \"Autogenerar\" para que el sistema cree todas las obligaciones del año con base en el régimen y obligaciones de la CSF.", tip: "Si la CSF aún no está cargada, súbela primero en el expediente; sin ella la autogeneración usa solo el régimen." },
      { n: 3, titulo: "Filtra y navega", detalle: "Usa los botones de mes/año y el buscador para ubicar la obligación." },
      { n: 4, titulo: "Marca el estatus", detalle: "Sobre cada obligación: \"Cumplida\", \"Posponer\" (con fecha nueva), o editar título/fecha/responsable." },
      { n: 5, titulo: "Configura alertas", detalle: "En \"Alertas\" define a cuántos días recordar y por qué canal (correo / WhatsApp / portal)." },
    ],
    resultados: [
      { campo: "Pendiente / Cumplida / Vencida", significado: "Estatus de cada obligación. Vencida = fecha pasada sin marcar cumplida.", rango: "verde = cumplida · ámbar = próxima · rojo = vencida" },
      { campo: "Próximas (7d)", significado: "Obligaciones que vencen en los siguientes 7 días — base para crear tareas." },
      { campo: "Responsable", significado: "Colaborador asignado a esa obligación; alimenta la carga por persona en Centro de Tareas." },
    ],
    dependencias: {
      necesita: [
        { tool: "Constancia de Situación Fiscal", ruta: "/app/tools/csf-parser", motivo: "Régimen y obligaciones precisas para que la autogeneración sea correcta." },
      ],
      alimenta: [
        { tool: "Centro de Tareas", ruta: "/app/tareas", motivo: "Las obligaciones próximas se convierten en tareas asignables al equipo." },
        { tool: "Workflows", ruta: "/app/workflows", motivo: "Triggers de calendario disparan recordatorios y acciones automáticas." },
      ],
      datosMinimos: ["RFC con régimen registrado", "Obligaciones de la CSF (opcional pero recomendado)"],
    },
  },

  // ============================================================
  // CENTRO DE TAREAS
  // ============================================================
  "centro-tareas": {
    slug: "centro-tareas",
    title: "Centro de Tareas",
    queHace:
      "Kanban + lista + dashboard de todo el trabajo operativo del despacho: declaraciones, conciliaciones, trámites SAT, requerimientos, nómina, etc. Las tareas pueden crearse manualmente o generarse automáticamente desde Calendario Fiscal, Buzón SAT, Riesgo SAT, CFDI o Auditor.",
    cuandoUsar:
      "Diario, como pizarra operativa del despacho. Es el panel principal del responsable / socio para repartir trabajo y vigilar atrasos.",
    tutorial: [
      { n: 1, titulo: "Revisa el Dashboard", detalle: "KPIs (total, pendientes, vencidas, sin asignar) + próximas a vencer + carga por colaborador." },
      { n: 2, titulo: "Genera desde calendario", detalle: "Con un expediente activo, pulsa \"Generar desde calendario\" para convertir obligaciones próximas en tareas asignables." },
      { n: 3, titulo: "Crea tarea manual", detalle: "\"Nueva tarea\": título, tipo, cliente, responsable, prioridad, fecha límite." },
      { n: 4, titulo: "Mueve en el Kanban", detalle: "Cambia estado: Pendiente → En proceso → Esperando cliente → En revisión → Finalizado.", tip: "\"Esperando cliente\" detiene el conteo de productividad — úsalo cuando depende de información externa." },
      { n: 5, titulo: "Registra tiempo y comentarios", detalle: "Abre el detalle de la tarea para sumar tiempo trabajado y agregar comentarios visibles al equipo." },
    ],
    resultados: [
      { campo: "KPIs", significado: "Total, pendientes, en proceso, vencidas, sin asignar, finalizadas — del despacho completo." },
      { campo: "Carga por colaborador", significado: "Activas, vencidas y tasa de cumplimiento por persona del equipo." },
      { campo: "Prioridad", significado: "Color del badge: gris=baja · azul=media · ámbar=alta · rojo=crítica." },
    ],
    dependencias: {
      necesita: [
        { tool: "Calendario Fiscal", ruta: "/app/calendario", motivo: "Origen recomendado de tareas recurrentes." },
        { tool: "Equipo", ruta: "/app/equipo", motivo: "Para poder asignar responsables." },
      ],
      alimenta: [
        { tool: "Workflows", ruta: "/app/workflows", motivo: "Workflows pueden crear / mover tareas automáticamente." },
        { tool: "Portal del cliente", motivo: "Tareas marcadas \"Esperando cliente\" se exponen al portal para recolectar información." },
      ],
      datosMinimos: ["Al menos un expediente y un miembro del equipo"],
    },
  },

  // ============================================================
  // WORKFLOWS
  // ============================================================
  "workflows": {
    slug: "workflows",
    title: "Workflow Automático",
    queHace:
      "Motor de automatizaciones del despacho: une triggers (CFDI nuevo, obligación próxima, riesgo SAT, mensaje del cliente, cron) con acciones (crear tarea, enviar mensaje, marcar obligación, generar reporte). Incluye templates listos y sugerencias IA basadas en patrones detectados.",
    cuandoUsar:
      "Cuando detectes trabajo repetitivo (ej. recordar pago provisional, avisar al cliente cuando llega CFDI, abrir tarea cuando hay buzón sin leer). Se configura una vez y trabaja solo.",
    tutorial: [
      { n: 1, titulo: "Empieza por template", detalle: "Pestaña \"Templates\": aplica uno de los flujos pre-armados (recordatorio mensual, alerta de buzón, etc.)." },
      { n: 2, titulo: "Builder personalizado", detalle: "\"Nuevo workflow\": define trigger, condiciones y acciones encadenadas." },
      { n: 3, titulo: "Activa", detalle: "Cambia el estatus a \"Activo\" — recién entonces se ejecuta. Pausa cuando lo necesites." },
      { n: 4, titulo: "Vigila Historial y Errores", detalle: "Pestañas \"Historial\" (runs exitosos) y \"Errores\" (fallidos) para depurar.", tip: "Si un workflow falla 3 veces seguidas se pausa automáticamente." },
      { n: 5, titulo: "Sugerencias IA", detalle: "La pestaña \"IA\" propone automatizaciones nuevas analizando tu operación reciente." },
    ],
    resultados: [
      { campo: "Activos / Ejecutados hoy / Exitosos / Fallidos", significado: "KPIs operativos del motor — ojo a \"Fallidos\" para corregir flujos." },
      { campo: "Minutos ahorrados", significado: "Estimación acumulada de tiempo manual evitado." },
    ],
    dependencias: {
      necesita: [
        { tool: "Calendario / CFDI / Buzón / Tareas", motivo: "Fuentes de los triggers." },
      ],
      alimenta: [
        { tool: "Centro de Tareas", ruta: "/app/tareas", motivo: "Crea o mueve tareas." },
        { tool: "Mensajería IA", ruta: "/app/mensajes", motivo: "Envía recordatorios al cliente." },
      ],
      datosMinimos: ["Al menos un trigger y una acción configurados"],
    },
  },

  // ============================================================
  // CFDI – EXPEDIENTES (módulo principal)
  // ============================================================
  "cfdi-expedientes": {
    slug: "cfdi-expedientes",
    title: "CFDI · Comprobantes fiscales",
    queHace:
      "Repositorio central de CFDI del expediente: emitidos, recibidos, nómina y pagos. Permite cargar ZIP/XML, ver totales, filtrar por tipo y exportar. Es la base sobre la que operan Conciliación, Salud Fiscal, Contabilidad Automática, Reporte Ejecutivo, Resumen Fiscal y los Agentes IA.",
    cuandoUsar:
      "Al inicio de cada mes (subir lote del periodo) y siempre que descargues XML nuevos del SAT con Descarga Masiva.",
    tutorial: [
      { n: 1, titulo: "Selecciona expediente", detalle: "El módulo opera sobre un RFC a la vez." },
      { n: 2, titulo: "Carga XML / ZIP", detalle: "Arrastra el ZIP descargado del SAT o XML sueltos. El sistema detecta duplicados y los rechaza con motivo." },
      { n: 3, titulo: "Revisa KPIs", detalle: "Comprobantes, ingresos, egresos e IVA del rango cargado." },
      { n: 4, titulo: "Filtra y selecciona", detalle: "Por tipo (I/E/N/P), fechas y emisor/receptor. Selecciona filas para exportar el subconjunto." },
      { n: 5, titulo: "Exporta", detalle: "\"Exportar\" descarga Excel del listado actual o de la selección." },
    ],
    resultados: [
      { campo: "Tipo CFDI", significado: "I = Ingreso · E = Egreso (nota de crédito) · N = Nómina · P = Pago (REP) · T = Traslado." },
      { campo: "Estatus SAT", significado: "Vigente / Cancelado según última consulta al webservice." },
      { campo: "Tiene CRP", significado: "Para CFDI tipo I PPD: indica si ya existe el REP (complemento de pago) asociado." },
    ],
    dependencias: {
      necesita: [
        { tool: "Descarga Masiva SAT", ruta: "/app/sat-sync", motivo: "Fuente automática de XML." },
      ],
      alimenta: [
        { tool: "Conciliación bancaria", ruta: "/app/conciliacion", motivo: "Cruza CFDI vs movimientos del banco." },
        { tool: "Contabilidad Automática", ruta: "/app/contabilidad-auto", motivo: "Genera pólizas a partir de cada CFDI." },
        { tool: "Salud Fiscal", ruta: "/app/salud-fiscal", motivo: "Métricas y score se calculan de aquí." },
        { tool: "Resumen Fiscal del mes", ruta: "/app/reportes/resumen-fiscal", motivo: "ISR/IVA del periodo se obtienen de estos CFDI." },
      ],
      datosMinimos: ["RFC del expediente", "Al menos 1 XML cargado o sincronizado"],
    },
  },

  // ============================================================
  // CONCILIACIÓN BANCARIA (índice)
  // ============================================================
  "conciliacion-bancaria": {
    slug: "conciliacion-bancaria",
    title: "Conciliación bancaria IA",
    queHace:
      "Carga estados de cuenta del cliente (PDF/Excel/CSV) y los cruza contra CFDI emitidos y recibidos para detectar diferencias: movimientos sin CFDI (posibles ingresos omitidos), CFDI sin pago y montos discrepantes. Incluye análisis IA del resultado.",
    cuandoUsar:
      "Mensual, después de cargar los CFDI del periodo y al recibir el estado de cuenta del banco.",
    tutorial: [
      { n: 1, titulo: "Da de alta la cuenta", detalle: "Selecciona banco y alias (ej. \"BBVA Principal\"). Captura los últimos 4 dígitos para validar." },
      { n: 2, titulo: "Sube el estado de cuenta", detalle: "Arrastra el archivo. El parser valida que el RFC coincida con el contribuyente; si no, lo rechaza con motivo." },
      { n: 3, titulo: "Ejecuta conciliación", detalle: "\"Ejecutar conciliación\" cruza movimientos vs CFDI con ventana de ±3 días y tolerancia de monto." },
      { n: 4, titulo: "Analiza resultado", detalle: "Revisa KPIs y la tabla; usa \"Analizar con IA\" para una interpretación cualitativa con focos rojos." },
      { n: 5, titulo: "Exporta y archiva", detalle: "Descarga CSV o Excel para papel de trabajo. El resultado queda en el historial mensual." },
    ],
    resultados: [
      { campo: "Tasa de conciliación", significado: "% de movimientos bancarios cruzados con CFDI.", rango: "≥90% sano · 70-90% revisar · <70% riesgo" },
      { campo: "Sin CFDI", significado: "Depósitos bancarios sin comprobante emitido — posible ingreso omitido (riesgo SAT alto)." },
      { campo: "CFDI sin pago", significado: "CFDI emitidos PPD sin movimiento bancario que los respalde." },
    ],
    dependencias: {
      necesita: [
        { tool: "CFDI", ruta: "/app/cfdi", motivo: "Sin CFDI no hay con qué cruzar." },
      ],
      alimenta: [
        { tool: "Historial de conciliación", ruta: "/app/conciliacion/historial", motivo: "Cada corrida queda como mes cerrado." },
        { tool: "Agente Conciliación", ruta: "/app/contable/agente-conciliacion", motivo: "Vigila la tasa y alerta caídas." },
        { tool: "Conciliación Integral", ruta: "/app/conciliacion-integral", motivo: "Suma una tercera vía: pólizas contables." },
      ],
      datosMinimos: ["1 cuenta bancaria registrada", "Estado de cuenta del periodo", "CFDI del periodo cargados"],
    },
    costos: "El análisis IA consume créditos de Lovable AI (1 corrida ≈ 1 crédito chico).",
  },

  // ============================================================
  // CONCILIACIÓN — HISTORIAL
  // ============================================================
  "conciliacion-historial": {
    slug: "conciliacion-historial",
    title: "Historial de conciliación",
    queHace:
      "Vista anual y mensual de todas las conciliaciones cerradas del expediente. Compara ingresos/egresos CFDI vs banco mes a mes y calcula la diferencia acumulada del año.",
    cuandoUsar:
      "Al cierre mensual para revisar evolución y al cierre anual para preparar la declaración.",
    tutorial: [
      { n: 1, titulo: "Elige el año", detalle: "Botones < y > navegan entre ejercicios." },
      { n: 2, titulo: "Lee el resumen anual", detalle: "Ingresos CFDI, egresos CFDI, ingresos bancarios y diferencia anual." },
      { n: 3, titulo: "Abre un mes", detalle: "Clic en cualquier card mensual para ver detalle: matches, sin CFDI, CFDI sin pago." },
      { n: 4, titulo: "Vuelve al conciliador", detalle: "\"Ir al conciliador\" para volver a correr o ajustar un mes." },
    ],
    resultados: [
      { campo: "Diferencia mensual", significado: "Ingresos bancarios − Ingresos CFDI del mes. Si |diferencia| > 1 se marca en ámbar." },
      { campo: "Diferencia anual", significado: "Sumatoria — útil para detectar tendencia de ingresos no facturados." },
    ],
    dependencias: {
      necesita: [
        { tool: "Conciliación bancaria", ruta: "/app/conciliacion", motivo: "Origina los meses cerrados que aparecen aquí." },
      ],
      alimenta: [
        { tool: "Reporte Ejecutivo", ruta: "/app/reporte-ejecutivo", motivo: "La evolución mensual entra al reporte." },
      ],
      datosMinimos: ["Al menos un mes conciliado en el año seleccionado"],
    },
  },

  // ============================================================
  // MENSAJERÍA IA
  // ============================================================
  "mensajes": {
    slug: "mensajes",
    title: "Mensajería IA",
    queHace:
      "Generador de mensajes para clientes con plantillas y redacción IA: recordatorios de pago, avisos de obligación, requerimientos de documentación, felicitaciones. Envía por WhatsApp, correo o copia al portapapeles.",
    cuandoUsar:
      "Cada vez que necesites comunicarte con un cliente — sustituye redactar manualmente desde cero.",
    tutorial: [
      { n: 1, titulo: "Elige plantilla", detalle: "Selecciona el tipo (recordatorio, requerimiento, felicitación, etc.) y pulsa \"Cargar plantilla\"." },
      { n: 2, titulo: "Llena variables", detalle: "Captura los datos que la plantilla pide (monto, fecha, RFC, periodo)." },
      { n: 3, titulo: "Personaliza con IA", detalle: "Edita el tono o pide a la IA que reformule. Revisa el resultado antes de enviar." },
      { n: 4, titulo: "Envía", detalle: "WhatsApp abre el chat con el texto listo; correo manda directo desde el sistema." },
    ],
    resultados: [
      { campo: "Mensaje final", significado: "Texto listo para enviar. Queda en historial del cliente." },
    ],
    dependencias: {
      necesita: [
        { tool: "Expediente con contacto", ruta: "/app/clientes", motivo: "Teléfono y correo del cliente para el envío directo." },
      ],
      alimenta: [
        { tool: "Workflows", ruta: "/app/workflows", motivo: "Se pueden disparar mensajes automáticos al cumplir condiciones." },
      ],
      datosMinimos: ["Cliente con teléfono / correo"],
    },
    costos: "Cada generación con IA consume créditos chicos de Lovable AI.",
  },

  // ============================================================
  // RESUMEN FISCAL DEL MES
  // ============================================================
  "resumen-fiscal": {
    slug: "resumen-fiscal",
    title: "Resumen fiscal del mes",
    queHace:
      "Cálculo automático de ISR e IVA del periodo a partir de los CFDI cargados del expediente. Sirve como pre-cálculo rápido antes de ir a la calculadora detallada según régimen.",
    cuandoUsar:
      "Después del día 5 del mes (ya con CFDI cerrados del mes anterior) para visualizar la carga fiscal estimada.",
    tutorial: [
      { n: 1, titulo: "Selecciona expediente y periodo", detalle: "Usa el selector de mes (input \"month\")." },
      { n: 2, titulo: "Revisa el resumen", detalle: "Ingresos, egresos, IVA trasladado, IVA acreditable, ISR estimado." },
      { n: 3, titulo: "Ir a la calculadora", detalle: "Botón \"Ir a la calculadora\" abre la herramienta detallada (PF/PM/RESICO según régimen)." },
    ],
    resultados: [
      { campo: "ISR estimado", significado: "Pre-cálculo grueso. La cifra final sale de la calculadora del régimen." },
      { campo: "IVA por pagar / a favor", significado: "Trasladado − Acreditable del mes." },
    ],
    dependencias: {
      necesita: [
        { tool: "CFDI", ruta: "/app/cfdi", motivo: "Base de cálculo." },
      ],
      alimenta: [
        { tool: "Calculadora ISR/IVA", motivo: "Como semilla para la calculadora detallada." },
      ],
      datosMinimos: ["CFDI del mes cargados", "Régimen del cliente registrado"],
    },
  },

  // ============================================================
  // EXPEDIENTES
  // ============================================================
  "expedientes": {
    slug: "expedientes",
    title: "Expedientes (Clientes)",
    queHace:
      "Listado central de RFC del despacho. Cada expediente es la unidad sobre la que operan TODAS las herramientas. Aquí se da de alta, importa desde Excel, asocia RFC vinculados y se accede al detalle del cliente (CSF, credenciales, contactos, historial).",
    cuandoUsar:
      "Al onboarding del despacho (importación masiva) y cada vez que se incorpora un cliente nuevo.",
    tutorial: [
      { n: 1, titulo: "Importar Excel", detalle: "\"Importar Excel\" abre el asistente: hasta 500 RFC por carga, sin duplicados." },
      { n: 2, titulo: "Nuevo expediente", detalle: "\"Nuevo expediente\": RFC, razón social, régimen. Lo demás se completa con la CSF." },
      { n: 3, titulo: "Abrir detalle", detalle: "Clic en una fila para entrar al cliente: CSF, credenciales SAT, equipo asignado, historial." },
      { n: 4, titulo: "RFC vinculados", detalle: "\"RFC vinculados\" gestiona RFC adicionales (por ejemplo socios o relacionados)." },
    ],
    resultados: [
      { campo: "Total de expedientes", significado: "Cuenta consumida vs el plan contratado." },
      { campo: "Régimen / Estatus", significado: "Régimen fiscal y si el RFC está activo / suspendido en SAT." },
    ],
    dependencias: {
      necesita: [],
      alimenta: [
        { tool: "Todas las herramientas", motivo: "Operan por expediente. Sin RFC no hay sobre qué trabajar." },
      ],
      datosMinimos: ["RFC válido"],
    },
  },

  // ============================================================
  // AGENTES IA
  // ============================================================
  "agente-auditor": {
    slug: "agente-auditor",
    title: "Agente Auditor IA",
    queHace:
      "Agente autónomo que audita el expediente buscando hallazgos preventivos de cierre: deducciones débiles, gastos no deducibles, inconsistencias documentales, exposición fiscal estimada. Corre automáticamente cada 90 s mientras esté activo.",
    cuandoUsar:
      "Durante todo el mes en modo activo para detectar problemas antes del cierre, y obligatoriamente antes de presentar declaración mensual/anual.",
    tutorial: [
      { n: 1, titulo: "Selecciona expediente", detalle: "El agente opera por RFC." },
      { n: 2, titulo: "Activar", detalle: "Botón \"Activar\" pone al agente en modo continuo (refresh 90 s)." },
      { n: 3, titulo: "Ejecutar ahora", detalle: "Fuerza una corrida inmediata sin esperar al ciclo." },
      { n: 4, titulo: "Revisa hallazgos", detalle: "Lista priorizada por severidad: alta (atender ya), media, baja." },
    ],
    resultados: [
      { campo: "Severidad", significado: "Alta = riesgo fiscal inmediato · Media = revisar · Baja = informativo." },
      { campo: "Exposición estimada", significado: "Monto MXN flagged como potencialmente cuestionable por SAT." },
    ],
    dependencias: {
      necesita: [
        { tool: "CFDI", ruta: "/app/cfdi", motivo: "Base de la auditoría." },
      ],
      alimenta: [
        { tool: "Centro de Tareas", ruta: "/app/tareas", motivo: "Hallazgos altos generan tarea." },
        { tool: "Reporte Ejecutivo", ruta: "/app/reporte-ejecutivo", motivo: "Hallazgos se integran al reporte mensual." },
      ],
      datosMinimos: ["CFDI del periodo cargados"],
    },
    costos: "Cada corrida consume créditos IA. Activarlo 24/7 puede gastar créditos rápido — úsalo en horarios laborales o ajusta el intervalo.",
  },

  "agente-cfdi": {
    slug: "agente-cfdi",
    title: "Agente CFDI IA",
    queHace:
      "Agente que vigila los CFDI del expediente en tiempo real: detecta cancelaciones, faltantes de REP en PPD, duplicados, emisores en lista negra (EFOS), montos atípicos y consistencia con régimen.",
    cuandoUsar:
      "En modo activo durante la operación diaria de captura/descarga de CFDI.",
    tutorial: [
      { n: 1, titulo: "Activa", detalle: "Botón \"Activar\" — refresh automático cada 60 s." },
      { n: 2, titulo: "Revisa bitácora", detalle: "Lista de eventos detectados desde la última corrida." },
      { n: 3, titulo: "Acciona", detalle: "Cada hallazgo permite \"Crear tarea\" o \"Marcar revisado\"." },
    ],
    resultados: [
      { campo: "Eventos críticos", significado: "Requieren acción inmediata (EFOS, cancelaciones)." },
      { campo: "Advertencias", significado: "Posibles errores u omisiones (REP faltante, duplicados)." },
    ],
    dependencias: {
      necesita: [
        { tool: "CFDI", ruta: "/app/cfdi", motivo: "Origen de los eventos." },
        { tool: "EFOS 69-B", ruta: "/app/tools/efos-validator", motivo: "Lista negra que consulta." },
      ],
      alimenta: [
        { tool: "Centro de Tareas", ruta: "/app/tareas", motivo: "Eventos accionables se convierten en tareas." },
      ],
      datosMinimos: ["CFDI cargados al expediente"],
    },
    costos: "Créditos IA por corrida.",
  },

  "agente-cierre": {
    slug: "agente-cierre",
    title: "Agente Cierre IA",
    queHace:
      "Agente que ejecuta el pre-cierre mensual del expediente: provisión de ISR e IVA del periodo, papel de trabajo, validación de deducibilidad y detección de partidas faltantes. Sirve como checklist automático antes de la declaración.",
    cuandoUsar:
      "Del día 1 al 16 del mes para preparar la declaración del mes anterior.",
    tutorial: [
      { n: 1, titulo: "Elige periodo", detalle: "Input mes/año en la barra de acciones." },
      { n: 2, titulo: "Activar / Ejecutar ahora", detalle: "Auto-refresh cada 120 s o corrida manual." },
      { n: 3, titulo: "Revisa KPIs", detalle: "Ingresos, deducciones, utilidad, ISR provisional, IVA del periodo." },
      { n: 4, titulo: "Confirma cierre", detalle: "Cuando los números cuadran, marca el periodo como cerrado para que no se modifique." },
    ],
    resultados: [
      { campo: "Utilidad", significado: "Ingresos − Deducciones del mes." },
      { campo: "ISR provisional / IVA por pagar", significado: "Pre-cálculo del agente; verifica contra la calculadora del régimen antes de declarar." },
    ],
    dependencias: {
      necesita: [
        { tool: "CFDI del mes", ruta: "/app/cfdi", motivo: "Materia prima del cierre." },
        { tool: "Conciliación bancaria", ruta: "/app/conciliacion", motivo: "Validar ingresos cobrados (flujo)." },
      ],
      alimenta: [
        { tool: "Resumen Fiscal", ruta: "/app/reportes/resumen-fiscal", motivo: "Cifras consolidadas del mes." },
        { tool: "Reporte Ejecutivo", ruta: "/app/reporte-ejecutivo", motivo: "Cierre alimenta el reporte mensual al cliente." },
      ],
      datosMinimos: ["CFDI y banco del periodo"],
    },
    costos: "Créditos IA por corrida.",
  },

  "agente-conciliacion": {
    slug: "agente-conciliacion",
    title: "Agente Conciliación IA",
    queHace:
      "Agente que cruza continuamente movimientos bancarios contra CFDI del expediente y reporta la tasa de conciliación, ingresos sin CFDI (riesgo de omisión) y CFDI PPD sin pago bancario.",
    cuandoUsar:
      "Activo durante el mes para detectar desviaciones tempranamente, no al cierre.",
    tutorial: [
      { n: 1, titulo: "Activa", detalle: "Auto-refresh cada 60 s." },
      { n: 2, titulo: "Lee la tasa", detalle: "Verde ≥90%, ámbar 70-90%, rojo <70%." },
      { n: 3, titulo: "Bitácora", detalle: "Lista cronológica de matches y discrepancias detectadas." },
    ],
    resultados: [
      { campo: "Tasa de conciliación", significado: "% de movimientos cruzados con CFDI." },
      { campo: "Movs sin CFDI", significado: "Posibles ingresos no facturados — riesgo fiscal alto." },
      { campo: "CFDI sin pago", significado: "PPD pendientes de cobro o REP no emitido." },
    ],
    dependencias: {
      necesita: [
        { tool: "Conciliación bancaria", ruta: "/app/conciliacion", motivo: "Cuentas y estados de cuenta cargados." },
        { tool: "CFDI", ruta: "/app/cfdi", motivo: "Universo a cruzar." },
      ],
      alimenta: [
        { tool: "Centro de Tareas", ruta: "/app/tareas", motivo: "Discrepancias relevantes abren tarea." },
      ],
      datosMinimos: ["1 cuenta bancaria con movimientos", "CFDI del periodo"],
    },
    costos: "Créditos IA por corrida.",
  },
};

export function getHelp(slug: string): HelpContent | null {
  return HELP_REGISTRY[slug] ?? null;
}
