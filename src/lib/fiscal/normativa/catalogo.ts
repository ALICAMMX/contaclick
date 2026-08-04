// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO NORMATIVO VERSIONADO — ContaClick
// ─────────────────────────────────────────────────────────────────────────────
// Regla de oro: NINGUNA tarifa fiscal vive dentro de un componente de UI.
// Cada conjunto declara: impuesto, régimen, ejercicio, vigencia, versión,
// fuente oficial, URL, fecha de publicación y fecha de entrada en vigor.
// El motor (motor.ts) selecciona el conjunto por el PERIODO que el usuario
// está calculando. Nunca cae "silenciosamente" a la última tabla disponible.
// ─────────────────────────────────────────────────────────────────────────────

export type Impuesto = "ISR" | "IVA";

export type Regimen =
  | "PF_GENERAL_MENSUAL" // Tarifa mensual art. 96 / 106 LISR (pagos provisionales PF)
  | "PF_GENERAL_ANUAL" // Tarifa anual art. 152 LISR
  | "PF_SUBSIDIO_MENSUAL" // Subsidio para el empleo mensual
  | "PF_RESICO" // RESICO PF art. 113-E LISR
  | "PM_GENERAL" // ISR PM art. 9 LISR
  | "IVA_GENERAL"; // LIVA art. 1

export type FuenteOficial = {
  /** Nombre del documento normativo */
  nombre: string;
  /** URL oficial (SAT / DOF) */
  url: string;
  /** Fecha de publicación en el DOF (YYYY-MM-DD) */
  publicacionDOF: string;
  /** Fecha de entrada en vigor (YYYY-MM-DD) */
  entradaVigor: string;
};

export type TramoTarifa = {
  limiteInferior: number;
  /** null = "en adelante" */
  limiteSuperior: number | null;
  cuotaFija: number;
  /** % sobre excedente del límite inferior */
  porcentaje: number;
};

export type TramoSubsidio = {
  desde: number;
  hasta: number | null;
  subsidio: number;
};

export type TramoResico = {
  hasta: number;
  /** tasa % sobre ingresos cobrados */
  tasa: number;
};

export type CuerpoNormativo =
  | { tipo: "tarifa"; tramos: TramoTarifa[] }
  | { tipo: "subsidio"; tramos: TramoSubsidio[] }
  | { tipo: "resico"; tramos: TramoResico[]; limiteAnual: number; retencionPM: number }
  | { tipo: "tasa"; tasa: number };

export type EstadoVerificacion = {
  /** "verificado" = importado y cotejado contra el PDF oficial. */
  estado: "verificado" | "pendiente_cotejo";
  /** Cómo se importó/cotejó */
  metodo: string;
  /** Fecha del cotejo */
  fecha: string;
};

export type ConjuntoNormativo = {
  /** Identificador estable, se persiste junto con cada resultado guardado */
  id: string;
  impuesto: Impuesto;
  regimen: Regimen;
  ejercicio: number;
  /** Versión semántica del conjunto (cambia si el SAT publica una modificación) */
  version: string;
  /** Vigencia inclusiva (YYYY-MM-DD) */
  vigenteDesde: string;
  /** Vigencia inclusiva; null = sin fecha de término publicada */
  vigenteHasta: string | null;
  fuente: FuenteOficial;
  /** Fecha en la que ContaClick verificó/actualizó este conjunto */
  actualizadoAl: string;
  verificacion: EstadoVerificacion;
  /** Notas para el profesional */
  notas?: string;
  cuerpo: CuerpoNormativo;
};

/**
 * Huella determinista (FNV-1a 32 bits, hex) del contenido normativo.
 * Se persiste junto con cada cálculo: si alguien edita una tabla ya publicada
 * sin subir la versión, el hash cambia y la prueba de regresión falla.
 */
export function hashConjunto(c: ConjuntoNormativo): string {
  const canonico = JSON.stringify([
    c.id,
    c.impuesto,
    c.regimen,
    c.ejercicio,
    c.version,
    c.vigenteDesde,
    c.vigenteHasta,
    c.fuente.nombre,
    c.fuente.publicacionDOF,
    c.fuente.entradaVigor,
    c.cuerpo,
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < canonico.length; i++) {
    h ^= canonico.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a32:${h.toString(16).padStart(8, "0")}`;
}

/** Congela en profundidad para impedir mutaciones en caliente de reglas publicadas. */
function congelar<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.values(o as Record<string, unknown>).forEach(congelar);
    Object.freeze(o);
  }
  return o;
}


// ── Fuentes ──────────────────────────────────────────────────────────────────

const ANEXO8_2026: FuenteOficial = {
  nombre: "Anexo 8 de la Resolución Miscelánea Fiscal para 2026",
  url: "https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo-8-RMF-2026_DOF-28122025.pdf",
  publicacionDOF: "2025-12-28",
  entradaVigor: "2026-01-01",
};

const ANEXO8_2025: FuenteOficial = {
  nombre: "Anexo 8 de la Resolución Miscelánea Fiscal para 2025",
  url: "https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2025/rmf/anexos/Anexo-8-RMF-2025.pdf",
  publicacionDOF: "2024-12-30",
  entradaVigor: "2025-01-01",
};

const ANEXO8_2024: FuenteOficial = {
  nombre: "Anexo 8 de la Resolución Miscelánea Fiscal para 2024",
  url: "https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2024/rmf/anexos/Anexo-8-RMF-2024.pdf",
  publicacionDOF: "2023-12-29",
  entradaVigor: "2024-01-01",
};

const LISR_113E: FuenteOficial = {
  nombre: "Ley del ISR, artículo 113-E (Régimen Simplificado de Confianza, personas físicas)",
  url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/LISR.pdf",
  publicacionDOF: "2021-11-12",
  entradaVigor: "2022-01-01",
};

const LISR_9: FuenteOficial = {
  nombre: "Ley del ISR, artículo 9 (tasa de personas morales)",
  url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/LISR.pdf",
  publicacionDOF: "2013-12-11",
  entradaVigor: "2014-01-01",
};

const LIVA_1: FuenteOficial = {
  nombre: "Ley del IVA, artículo 1 (tasa general)",
  url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf",
  publicacionDOF: "2013-12-11",
  entradaVigor: "2014-01-01",
};

// ── Tarifas ISR PF mensual ───────────────────────────────────────────────────

const t = (
  limiteInferior: number,
  limiteSuperior: number | null,
  cuotaFija: number,
  porcentaje: number,
): TramoTarifa => ({ limiteInferior, limiteSuperior, cuotaFija, porcentaje });

const ISR_PF_MENSUAL_2026: TramoTarifa[] = [
  t(0.01, 844.59, 0, 1.92),
  t(844.6, 7168.51, 16.22, 6.4),
  t(7168.52, 12598.02, 420.95, 10.88),
  t(12598.03, 14644.64, 1011.68, 16.0),
  t(14644.65, 17533.63, 1339.14, 17.92),
  t(17533.64, 35362.83, 1856.84, 21.36),
  t(35362.84, 55736.68, 5665.16, 23.52),
  t(55736.69, 106410.5, 10457.09, 30.0),
  t(106410.51, 141880.66, 25659.23, 32.0),
  t(141880.67, 425641.99, 37009.69, 34.0),
  t(425642.0, null, 133488.54, 35.0),
];

const ISR_PF_ANUAL_2026: TramoTarifa[] = [
  t(0.01, 10135.11, 0, 1.92),
  t(10135.12, 86022.11, 194.59, 6.4),
  t(86022.12, 151176.19, 5051.37, 10.88),
  t(151176.2, 175735.66, 12140.13, 16.0),
  t(175735.67, 210403.69, 16069.64, 17.92),
  t(210403.7, 424353.97, 22282.14, 21.36),
  t(424353.98, 668840.14, 67981.92, 23.52),
  t(668840.15, 1276925.98, 125485.07, 30.0),
  t(1276925.99, 1702567.97, 307910.81, 32.0),
  t(1702567.98, 5107703.92, 444116.23, 34.0),
  t(5107703.93, null, 1601862.46, 35.0),
];

const SUBSIDIO_MENSUAL_2026: TramoSubsidio[] = [
  { desde: 0.01, hasta: 1768.96, subsidio: 407.02 },
  { desde: 1768.97, hasta: 2653.38, subsidio: 406.83 },
  { desde: 2653.39, hasta: 3472.84, subsidio: 406.62 },
  { desde: 3472.85, hasta: 3537.87, subsidio: 392.77 },
  { desde: 3537.88, hasta: 4446.15, subsidio: 382.46 },
  { desde: 4446.16, hasta: 4717.18, subsidio: 354.23 },
  { desde: 4717.19, hasta: 5335.42, subsidio: 324.87 },
  { desde: 5335.43, hasta: 6224.67, subsidio: 294.63 },
  { desde: 6224.68, hasta: 7113.9, subsidio: 253.54 },
  { desde: 7113.91, hasta: 7382.33, subsidio: 217.61 },
  { desde: 7382.34, hasta: null, subsidio: 0 },
];

const ISR_PF_MENSUAL_2025: TramoTarifa[] = [
  t(0.01, 746.04, 0, 1.92),
  t(746.05, 6332.05, 14.32, 6.4),
  t(6332.06, 11128.01, 371.83, 10.88),
  t(11128.02, 12935.82, 893.63, 16.0),
  t(12935.83, 15487.71, 1182.88, 17.92),
  t(15487.72, 31236.49, 1640.18, 21.36),
  t(31236.5, 49233.0, 5004.12, 23.52),
  t(49233.01, 93993.9, 9236.89, 30.0),
  t(93993.91, 125325.2, 22665.17, 32.0),
  t(125325.21, 375975.61, 32691.18, 34.0),
  t(375975.62, null, 117912.32, 35.0),
];

const ISR_PF_ANUAL_2025: TramoTarifa[] = [
  t(0.01, 8952.49, 0, 1.92),
  t(8952.5, 75984.55, 171.88, 6.4),
  t(75984.56, 133536.07, 4461.94, 10.88),
  t(133536.08, 155229.8, 10723.55, 16.0),
  t(155229.81, 185852.57, 14194.54, 17.92),
  t(185852.58, 374837.88, 19682.13, 21.36),
  t(374837.89, 590795.99, 60049.4, 23.52),
  t(590796.0, 1127926.84, 110842.74, 30.0),
  t(1127926.85, 1503902.46, 271981.99, 32.0),
  t(1503902.47, 4511707.37, 392294.17, 34.0),
  t(4511707.38, null, 1414947.85, 35.0),
];


// Anexo 8 RMF 2024 (DOF 29/12/2023). Importes idénticos a los de 2025: la
// tarifa no se actualizó por inflación entre ambos ejercicios, pero se
// conservan como conjuntos independientes con su fuente propia.
const ISR_PF_MENSUAL_2024: TramoTarifa[] = ISR_PF_MENSUAL_2025.map((x) => ({ ...x }));
const ISR_PF_ANUAL_2024: TramoTarifa[] = ISR_PF_ANUAL_2025.map((x) => ({ ...x }));

const RESICO_PF: TramoResico[] = [
  { hasta: 25000, tasa: 1.0 },
  { hasta: 50000, tasa: 1.1 },
  { hasta: 83333.33, tasa: 1.5 },
  { hasta: 208333.33, tasa: 2.0 },
  { hasta: 3500000 / 12, tasa: 2.5 },
];

// ── Catálogo ─────────────────────────────────────────────────────────────────

const V_COTEJO_2026: EstadoVerificacion = {
  estado: "verificado",
  metodo:
    "Importación manual del Anexo 8 RMF 2026 (DOF 28/12/2025) + verificación aritmética automatizada: continuidad de cuota fija entre tramos y equivalencia tarifa anual = 12 × tarifa mensual (normativa.numerica.test.ts).",
  fecha: "2026-08-04",
};
const V_COTEJO_HIST: EstadoVerificacion = {
  estado: "verificado",
  metodo:
    "Tablas históricas congeladas; se conservan sólo para reproducir cálculos de ejercicios cerrados. Verificación aritmética automatizada en normativa.numerica.test.ts.",
  fecha: "2026-08-04",
};
const V_LEY: EstadoVerificacion = {
  estado: "verificado",
  metodo: "Texto vigente de la ley publicado por la Cámara de Diputados.",
  fecha: "2026-08-04",
};

const CATALOGO: ConjuntoNormativo[] = [
  {
    id: "isr-pf-mensual-2026-v1",
    impuesto: "ISR",
    regimen: "PF_GENERAL_MENSUAL",
    ejercicio: 2026,
    version: "2026.1",
    vigenteDesde: "2026-01-01",
    vigenteHasta: "2026-12-31",
    fuente: ANEXO8_2026,
    actualizadoAl: "2026-08-04",
    verificacion: V_COTEJO_2026,
    cuerpo: { tipo: "tarifa", tramos: ISR_PF_MENSUAL_2026 },
  },
  {
    id: "isr-pf-anual-2026-v1",
    impuesto: "ISR",
    regimen: "PF_GENERAL_ANUAL",
    ejercicio: 2026,
    version: "2026.1",
    vigenteDesde: "2026-01-01",
    vigenteHasta: "2026-12-31",
    fuente: ANEXO8_2026,
    actualizadoAl: "2026-08-04",
    verificacion: V_COTEJO_2026,
    cuerpo: { tipo: "tarifa", tramos: ISR_PF_ANUAL_2026 },
  },
  {
    id: "subsidio-empleo-mensual-2026-v1",
    impuesto: "ISR",
    regimen: "PF_SUBSIDIO_MENSUAL",
    ejercicio: 2026,
    version: "2026.1",
    vigenteDesde: "2026-01-01",
    vigenteHasta: "2026-12-31",
    fuente: ANEXO8_2026,
    actualizadoAl: "2026-08-04",
    verificacion: V_COTEJO_2026,
    notas:
      "Subsidio para el empleo aplicable únicamente a ingresos por salarios (Cap. I Tít. IV LISR). No aplica a actividad empresarial ni RESICO.",
    cuerpo: { tipo: "subsidio", tramos: SUBSIDIO_MENSUAL_2026 },
  },
  {
    id: "isr-pf-mensual-2025-v1",
    impuesto: "ISR",
    regimen: "PF_GENERAL_MENSUAL",
    ejercicio: 2025,
    version: "2025.1",
    vigenteDesde: "2025-01-01",
    vigenteHasta: "2025-12-31",
    fuente: ANEXO8_2025,
    actualizadoAl: "2026-08-04",
    verificacion: V_COTEJO_HIST,
    notas:
      "Para 2025 el SAT no actualizó la tarifa: coincide en importes con la de 2024, pero se conserva como conjunto independiente con su propia fuente.",
    cuerpo: { tipo: "tarifa", tramos: ISR_PF_MENSUAL_2025 },
  },
  {
    id: "isr-pf-anual-2025-v1",
    impuesto: "ISR",
    regimen: "PF_GENERAL_ANUAL",
    ejercicio: 2025,
    version: "2025.1",
    vigenteDesde: "2025-01-01",
    vigenteHasta: "2025-12-31",
    fuente: ANEXO8_2025,
    actualizadoAl: "2026-08-04",
    verificacion: V_COTEJO_HIST,
    cuerpo: { tipo: "tarifa", tramos: ISR_PF_ANUAL_2025 },
  },
  {
    id: "isr-pf-mensual-2024-v1",
    impuesto: "ISR",
    regimen: "PF_GENERAL_MENSUAL",
    ejercicio: 2024,
    version: "2024.1",
    vigenteDesde: "2024-01-01",
    vigenteHasta: "2024-12-31",
    fuente: ANEXO8_2024,
    actualizadoAl: "2026-08-04",
    verificacion: V_COTEJO_HIST,
    notas: "Tabla histórica: sólo se usa al reabrir cálculos del ejercicio 2024.",
    cuerpo: { tipo: "tarifa", tramos: ISR_PF_MENSUAL_2024 },
  },
  {
    id: "isr-pf-anual-2024-v1",
    impuesto: "ISR",
    regimen: "PF_GENERAL_ANUAL",
    ejercicio: 2024,
    version: "2024.1",
    vigenteDesde: "2024-01-01",
    vigenteHasta: "2024-12-31",
    fuente: ANEXO8_2024,
    actualizadoAl: "2026-08-04",
    verificacion: V_COTEJO_HIST,
    notas: "Tabla histórica: sólo se usa al reabrir cálculos del ejercicio 2024.",
    cuerpo: { tipo: "tarifa", tramos: ISR_PF_ANUAL_2024 },
  },
  {
    id: "isr-pm-2026-v1",
    impuesto: "ISR",
    regimen: "PM_GENERAL",
    ejercicio: 2026,
    version: "2026.1",
    vigenteDesde: "2014-01-01",
    vigenteHasta: null,
    fuente: LISR_9,
    actualizadoAl: "2026-08-04",
    verificacion: V_LEY,
    notas: "Tasa fija del 30% sobre resultado fiscal. No hay tarifa progresiva para PM del régimen general.",
    cuerpo: { tipo: "tasa", tasa: 30 },
  },
  {
    id: "resico-pf-v1",
    impuesto: "ISR",
    regimen: "PF_RESICO",
    ejercicio: 2026,
    version: "2022.1",
    vigenteDesde: "2022-01-01",
    vigenteHasta: null,
    fuente: LISR_113E,
    actualizadoAl: "2026-08-04",
    verificacion: V_LEY,
    notas:
      "Tabla de tasas del art. 113-E LISR, sin cambios desde 2022. Retención del 1.25% cuando el receptor es persona moral (art. 113-J).",
    cuerpo: { tipo: "resico", tramos: RESICO_PF, limiteAnual: 3500000, retencionPM: 1.25 },
  },
  {
    id: "iva-general-v1",
    impuesto: "IVA",
    regimen: "IVA_GENERAL",
    ejercicio: 2026,
    version: "2014.1",
    vigenteDesde: "2014-01-01",
    vigenteHasta: null,
    fuente: LIVA_1,
    actualizadoAl: "2026-08-04",
    verificacion: V_LEY,
    notas: "Tasa general 16%. No contempla región fronteriza ni tasa 0%/exentos.",
    cuerpo: { tipo: "tasa", tasa: 16 },
  },
];

/**
 * Catálogo publicado: congelado en profundidad. Una regla publicada NO puede
 * editarse en caliente; una corrección exige un conjunto nuevo con id/versión
 * distintos, conservando el anterior para reproducir el histórico.
 */
export const CATALOGO_NORMATIVO: readonly ConjuntoNormativo[] = congelar(CATALOGO);

/** Hash publicado de cada conjunto (huella de integridad, ver hashConjunto). */
export const HASHES_PUBLICADOS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(CATALOGO_NORMATIVO.map((c) => [c.id, hashConjunto(c)])),
);
