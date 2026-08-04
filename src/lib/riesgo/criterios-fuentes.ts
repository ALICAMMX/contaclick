// Documentación normativa de cada criterio del Riesgo SAT.
// Cada criterio declara: fundamento legal, fuente oficial, dato utilizado y
// naturaleza (regla determinista vs. análisis generado por IA).

export type FuenteCriterio = {
  fundamento: string;
  url: string;
  datosUtilizados: string;
  naturaleza: "determinista" | "ia";
};

export const RIESGO_METODOLOGIA = {
  version: "2026.1",
  actualizadoAl: "2026-07-25",
  descripcion:
    "Modelo interno de ContaClick de 12 criterios. El score es el promedio simple de los puntos de cada criterio (0–100). " +
    "Todos los criterios se calculan con reglas deterministas sobre los datos del expediente activo; la IA sólo se usa " +
    "para redactar explicaciones, nunca para asignar puntaje.",
  advertencia:
    "No es una calificación oficial del SAT. Es un indicador de exposición basado en los datos cargados y requiere revisión profesional.",
} as const;

export const FUENTES_RIESGO: Record<number, FuenteCriterio> = {
  1: {
    fundamento: "Art. 69-B del Código Fiscal de la Federación (operaciones inexistentes, EFOS/EDOS).",
    url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf",
    datosUtilizados: "RFC emisores de los CFDI recibidos del periodo, cruzados contra el listado 69-B.",
    naturaleza: "determinista",
  },
  2: {
    fundamento: "Art. 57 LISR (pérdidas fiscales) y programas de vigilancia profunda del SAT.",
    url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/LISR.pdf",
    datosUtilizados: "Subtotal de CFDI de ingreso emitidos vs. subtotal de CFDI de ingreso recibidos del periodo.",
    naturaleza: "determinista",
  },
  3: {
    fundamento: "Tasas efectivas de impuesto publicadas por el SAT por sector económico (art. 33 CFF, fracc. I, inciso i).",
    url: "https://www.sat.gob.mx/consultas/78286/tasas-efectivas-de-impuesto",
    datosUtilizados: "IVA trasladado del periodo entre ingresos del periodo, comparado contra un benchmark del 14%.",
    naturaleza: "determinista",
  },
  4: {
    fundamento: "Anexo 20 RMF (validaciones aritméticas del CFDI 4.0).",
    url: "https://www.sat.gob.mx/consultas/97722/comprobante-de-factura-electronica",
    datosUtilizados: "Total del CFDI vs. subtotal + IVA trasladado, con tolerancia de $1.00.",
    naturaleza: "determinista",
  },
  5: {
    fundamento: "Criterio de materialidad y razón de negocios, art. 5-A CFF.",
    url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf",
    datosUtilizados: "Participación de los 3 principales proveedores en el gasto total del periodo.",
    naturaleza: "determinista",
  },
  6: {
    fundamento: "Art. 20 y 21 Ley Federal del Trabajo; art. 27 fracc. V LISR (subcontratación y simulación laboral).",
    url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf",
    datosUtilizados: "Personas físicas (RFC de 13 posiciones) que emitieron 3 o más CFDI al contribuyente en el periodo.",
    naturaleza: "determinista",
  },
  7: {
    fundamento: "Art. 27 LISR y art. 29-A CFF (requisitos de las deducciones y del comprobante).",
    url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/LISR.pdf",
    datosUtilizados: "CFDI recibidos sin método de pago o sin forma de pago registrada.",
    naturaleza: "determinista",
  },
  8: {
    fundamento: "Art. 59 fracc. III CFF (depósitos bancarios no registrados presumidos como ingresos).",
    url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf",
    datosUtilizados: "Abonos bancarios del periodo sin conciliación contra un CFDI emitido.",
    naturaleza: "determinista",
  },
  9: {
    fundamento: "Decretos de estímulos fiscales vigentes y art. 25 LIF.",
    url: "https://www.sat.gob.mx/normatividad/estimulos-fiscales",
    datosUtilizados: "No hay módulo de estímulos cargado en el expediente; criterio informativo.",
    naturaleza: "determinista",
  },
  10: {
    fundamento: "Arts. 76 fracc. IX, 179 y 180 LISR (partes relacionadas y precios de transferencia).",
    url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/LISR.pdf",
    datosUtilizados: "CFDI con RFC genérico de residentes en el extranjero (XEXX010101000 / XAXX010101000).",
    naturaleza: "determinista",
  },
  11: {
    fundamento: "Art. 6 LIVA y art. 22 CFF (saldos a favor y devoluciones).",
    url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf",
    datosUtilizados: "IVA acreditable menos IVA trasladado del periodo, como proporción de los ingresos.",
    naturaleza: "determinista",
  },
  12: {
    fundamento: "Ley Aduanera arts. 64–78 (valor en aduana) y Anexo 24 RGCE.",
    url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf",
    datosUtilizados: "No hay pedimentos cargados en el expediente; criterio informativo.",
    naturaleza: "determinista",
  },
};
