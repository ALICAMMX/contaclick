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
};

export function getHelp(slug: string): HelpContent | null {
  return HELP_REGISTRY[slug] ?? null;
}
