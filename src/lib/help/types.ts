// Tipos del sistema de ayuda contextual por herramienta.
// El contenido vive en `registry.ts` para que sea fácil de auditar/editar.

export type HelpPaso = {
  /** Número del paso (1, 2, 3…) */
  n: number;
  /** Título corto del paso */
  titulo: string;
  /** Explicación detallada — puede incluir nombres exactos de botones entre comillas */
  detalle: string;
  /** Tip opcional para evitar errores comunes */
  tip?: string;
};

export type HelpResultado = {
  /** Nombre del campo, KPI, columna o sección que aparece en pantalla */
  campo: string;
  /** Qué significa y cómo leerlo */
  significado: string;
  /** Rangos / valores posibles cuando aplica (semáforos, scores, estatus) */
  rango?: string;
};

export type HelpDependenciaLink = {
  /** Nombre humano de la herramienta */
  tool: string;
  /** Ruta interna (TanStack) — si es link, se renderiza clickable */
  ruta?: string;
  /** Por qué la necesitas / qué le entrega */
  motivo: string;
};

export type HelpDependencias = {
  /** Lo que debe estar cargado antes de usar esta herramienta */
  necesita: HelpDependenciaLink[];
  /** Herramientas que consumen el resultado de esta */
  alimenta: HelpDependenciaLink[];
  /** Datos mínimos que la herramienta exige para arrojar resultado */
  datosMinimos: string[];
};

export type HelpContent = {
  /** Slug único (debe coincidir con el usado en <HerramientaHelp />) */
  slug: string;
  /** Título de la herramienta tal como aparece en pantalla */
  title: string;
  /** Resumen ejecutivo en lenguaje de contador (1-2 párrafos) */
  queHace: string;
  /** Cuándo usarla en el ciclo mensual/anual */
  cuandoUsar?: string;
  /** Tutorial paso a paso con nombres exactos de botones/campos */
  tutorial: HelpPaso[];
  /** Qué arroja la herramienta y cómo interpretarlo */
  resultados: HelpResultado[];
  /** Dependencias con otras herramientas y datos mínimos */
  dependencias: HelpDependencias;
  /** Consumo de créditos / costos a tener en cuenta */
  costos?: string;
};
