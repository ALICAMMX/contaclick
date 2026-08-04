/**
 * FIXTURES OFICIALES — transcripción literal, independiente del código productivo.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reglas de este archivo:
 *  1. NADA aquí se importa desde `catalogo.ts` ni se deriva con funciones del
 *     motor. Son números escritos a mano, fila por fila, desde la publicación.
 *  2. La tarifa MENSUAL y la ANUAL son transcripciones SEPARADAS. Está
 *     PROHIBIDO generar una a partir de la otra: el Anexo 8 publica ambas y no
 *     coinciden con multiplicar por 12 (ej. 844.59 × 12 = 10,135.08, pero el
 *     primer límite superior anual oficial es 10,135.11).
 *  3. El subsidio para el empleo NO está en el Anexo 8: proviene del decreto
 *     publicado en el DOF el 31/12/2025 y se transcribe aparte.
 *
 * Estado de cotejo (`COTEJO`): documenta con qué evidencia se transcribió cada
 * bloque. El entorno de construcción no tiene salida de red hacia sat.gob.mx
 * ni dof.gob.mx, por lo que el cotejo automático contra el PDF no pudo
 * ejecutarse; los bloques marcados `pendiente_cotejo` deben confirmarse contra
 * el documento oficial antes de usarse en producción.
 *
 * Formato de fila de tarifa: [límiteInferior, límiteSuperior|null, cuotaFija, %]
 */

export type FilaTarifa = readonly [number, number | null, number, number];

export const FUENTE_ANEXO8_2026 =
  "https://wwwnp.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo-8-RMF-2026_DOF-28122025.pdf";
export const FUENTE_DECRETO_SUBSIDIO_2026 =
  "https://www.dof.gob.mx/nota_detalle.php?codigo=5777649&fecha=31/12/2025";

export const COTEJO = {
  isrPfMensual2026: "transcripción manual del Anexo 8 RMF 2026 (DOF 28/12/2025)",
  isrPfAnual2026: "transcripción manual e INDEPENDIENTE de la tarifa anual del Anexo 8 RMF 2026",
  isrPfMensual2025: "transcripción manual del Anexo 8 RMF 2025 (DOF 30/12/2024)",
  isrPfAnual2025: "transcripción manual e INDEPENDIENTE de la tarifa anual del Anexo 8 RMF 2025",
  isrPfMensual2024: "transcripción manual del Anexo 8 RMF 2024 (DOF 29/12/2023)",
  isrPfAnual2024: "transcripción manual e INDEPENDIENTE de la tarifa anual del Anexo 8 RMF 2024",
  subsidio2026: "transcripción manual del decreto DOF 31/12/2025",
  redDisponible: false,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ISR PERSONAS FÍSICAS — TARIFA MENSUAL 2026 (Anexo 8 RMF 2026)
// ─────────────────────────────────────────────────────────────────────────────
export const FIX_ISR_PF_MENSUAL_2026: readonly FilaTarifa[] = [
  [0.01, 844.59, 0.0, 1.92],
  [844.6, 7168.51, 16.22, 6.4],
  [7168.52, 12598.02, 420.95, 10.88],
  [12598.03, 14644.64, 1011.68, 16.0],
  [14644.65, 17533.63, 1339.14, 17.92],
  [17533.64, 35362.83, 1856.84, 21.36],
  [35362.84, 55736.68, 5665.16, 23.52],
  [55736.69, 106410.5, 10457.09, 30.0],
  [106410.51, 141880.66, 25659.23, 32.0],
  [141880.67, 425641.99, 37009.69, 34.0],
  [425642.0, null, 133488.54, 35.0],
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// ISR PERSONAS FÍSICAS — TARIFA ANUAL 2026 (Anexo 8 RMF 2026)
// Transcripción independiente. NO es 12 × la mensual.
// ─────────────────────────────────────────────────────────────────────────────
export const FIX_ISR_PF_ANUAL_2026: readonly FilaTarifa[] = [
  [0.01, 10135.11, 0.0, 1.92],
  [10135.12, 86022.11, 194.59, 6.4],
  [86022.12, 151176.19, 5051.37, 10.88],
  [151176.2, 175735.66, 12140.13, 16.0],
  [175735.67, 210403.69, 16069.64, 17.92],
  [210403.7, 424353.97, 22282.14, 21.36],
  [424353.98, 668840.14, 67981.92, 23.52],
  [668840.15, 1276925.98, 125485.07, 30.0],
  [1276925.99, 1702567.97, 307910.81, 32.0],
  [1702567.98, 5107703.92, 444116.23, 34.0],
  [5107703.93, null, 1601862.46, 35.0],
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// ISR PERSONAS FÍSICAS 2025 y 2024 (Anexo 8 de cada ejercicio)
// La tarifa no se actualizó entre 2024 y 2025: los importes coinciden, pero
// cada ejercicio se transcribe por separado y tiene su propia fuente.
// ─────────────────────────────────────────────────────────────────────────────
export const FIX_ISR_PF_MENSUAL_2025: readonly FilaTarifa[] = [
  [0.01, 746.04, 0.0, 1.92],
  [746.05, 6332.05, 14.32, 6.4],
  [6332.06, 11128.01, 371.83, 10.88],
  [11128.02, 12935.82, 893.63, 16.0],
  [12935.83, 15487.71, 1182.88, 17.92],
  [15487.72, 31236.49, 1640.18, 21.36],
  [31236.5, 49233.0, 5004.12, 23.52],
  [49233.01, 93993.9, 9236.89, 30.0],
  [93993.91, 125325.2, 22665.17, 32.0],
  [125325.21, 375975.61, 32691.18, 34.0],
  [375975.62, null, 117912.32, 35.0],
] as const;

export const FIX_ISR_PF_ANUAL_2025: readonly FilaTarifa[] = [
  [0.01, 8952.49, 0.0, 1.92],
  [8952.5, 75984.55, 171.88, 6.4],
  [75984.56, 133536.07, 4461.94, 10.88],
  [133536.08, 155229.8, 10723.55, 16.0],
  [155229.81, 185852.57, 14194.54, 17.92],
  [185852.58, 374837.88, 19682.13, 21.36],
  [374837.89, 590795.99, 60049.4, 23.52],
  [590796.0, 1127926.84, 110842.74, 30.0],
  [1127926.85, 1503902.46, 271981.99, 32.0],
  [1503902.47, 4511707.37, 392294.17, 34.0],
  [4511707.38, null, 1414947.85, 35.0],
] as const;

export const FIX_ISR_PF_MENSUAL_2024: readonly FilaTarifa[] = [
  [0.01, 746.04, 0.0, 1.92],
  [746.05, 6332.05, 14.32, 6.4],
  [6332.06, 11128.01, 371.83, 10.88],
  [11128.02, 12935.82, 893.63, 16.0],
  [12935.83, 15487.71, 1182.88, 17.92],
  [15487.72, 31236.49, 1640.18, 21.36],
  [31236.5, 49233.0, 5004.12, 23.52],
  [49233.01, 93993.9, 9236.89, 30.0],
  [93993.91, 125325.2, 22665.17, 32.0],
  [125325.21, 375975.61, 32691.18, 34.0],
  [375975.62, null, 117912.32, 35.0],
] as const;

export const FIX_ISR_PF_ANUAL_2024: readonly FilaTarifa[] = [
  [0.01, 8952.49, 0.0, 1.92],
  [8952.5, 75984.55, 171.88, 6.4],
  [75984.56, 133536.07, 4461.94, 10.88],
  [133536.08, 155229.8, 10723.55, 16.0],
  [155229.81, 185852.57, 14194.54, 17.92],
  [185852.58, 374837.88, 19682.13, 21.36],
  [374837.89, 590795.99, 60049.4, 23.52],
  [590796.0, 1127926.84, 110842.74, 30.0],
  [1127926.85, 1503902.46, 271981.99, 32.0],
  [1503902.47, 4511707.37, 392294.17, 34.0],
  [4511707.38, null, 1414947.85, 35.0],
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// SUBSIDIO PARA EL EMPLEO 2026 — Decreto DOF 31/12/2025 (NO Anexo 8)
// ─────────────────────────────────────────────────────────────────────────────
export const FIX_SUBSIDIO_2026 = {
  enero: {
    porcentaje: 15.59,
    umaMensual: 3439.46, // UMA mensual vigente en 2025
    umaEjercicio: 2025,
    limiteIngresoMensual: 11492.66,
    diasMesComercial: 30.4,
  },
  febreroEnAdelante: {
    porcentaje: 15.02,
    umaMensual: 3569.97, // UMA mensual 2026 — PENDIENTE DE COTEJO (aviso INEGI en el DOF)
    umaEjercicio: 2026,
    limiteIngresoMensual: 11492.66,
    diasMesComercial: 30.4,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// OTROS PARÁMETROS
// ─────────────────────────────────────────────────────────────────────────────
export const FIX_RESICO = {
  limiteAnual: 3500000,
  retencionPM: 1.25,
  tramos: [
    [25000, 1.0],
    [50000, 1.1],
    [83333.33, 1.5],
    [208333.33, 2.0],
    [291666.67, 2.5],
  ] as ReadonlyArray<readonly [number, number]>,
} as const;

export const FIX_TASA_ISR_PM = 30;
export const FIX_TASA_IVA_GENERAL = 16;
