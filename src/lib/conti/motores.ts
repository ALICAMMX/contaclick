// ─────────────────────────────────────────────────────────────────────────────
// HERRAMIENTAS DETERMINISTAS DE CONTI
//
// El modelo NO calcula. Cuando la persona pide una cifra fiscal, Conti llama
// server-side al motor sellado y el modelo únicamente explica la salida.
// Cada herramienta devuelve entradas normalizadas, resultado, conjunto
// normativo, versión, hash, vigencia, fuente, advertencias y limitaciones.
// ─────────────────────────────────────────────────────────────────────────────

import {
  calcularIsrPf,
  calcularIsrPm,
  calcularIva,
  calcularResicoPf,
} from "@/lib/fiscal/normativa/motor";

export type SelloSalida = {
  conjuntoId: string;
  version: string;
  hash: string;
  vigencia: string;
  fuente: string;
  url: string;
  verificacion: string;
  ejercicio: number;
};

export type ResultadoHerramienta = {
  herramienta: string;
  ok: boolean;
  entradas: Record<string, unknown>;
  resultado: Record<string, unknown> | null;
  normativa: SelloSalida | null;
  fundamentos: string[];
  advertencias: string[];
  limitaciones: string[];
  error: string | null;
};

export const HERRAMIENTAS_CONTI_NOMBRES = [
  "conti_calcular_isr_pf",
  "conti_calcular_isr_pm",
  "conti_calcular_resico",
  "conti_calcular_iva",
] as const;

export type HerramientaConti = (typeof HERRAMIENTAS_CONTI_NOMBRES)[number];

const LIMITACIONES_COMUNES = [
  "Resultado de un motor determinista sobre las cifras proporcionadas; no sustituye la revisión del contador responsable.",
  "No considera datos del expediente ni papeles de trabajo que no se hayan capturado en las entradas.",
];

const FUNDAMENTOS: Record<HerramientaConti, string[]> = {
  conti_calcular_isr_pf: ["LISR art. 96 / 106 (pagos provisionales)", "LISR art. 152 (tarifa anual)"],
  conti_calcular_isr_pm: ["LISR art. 9 (tasa)", "LISR art. 14 (pago provisional)"],
  conti_calcular_resico: [
    "LISR art. 113-E (tabla de tasas y tope de ingresos)",
    "LISR art. 113-F (pago mensual definitivo)",
    "LISR art. 113-J (retención 1.25% cuando el receptor es persona moral)",
  ],
  conti_calcular_iva: ["LIVA art. 1 (tasa)", "LIVA art. 5-D (pago mensual definitivo)"],
};

const LIMITACIONES_ESPECIFICAS: Record<HerramientaConti, string[]> = {
  conti_calcular_isr_pf: [],
  conti_calcular_isr_pm: ["El coeficiente de utilidad se toma como dato de entrada; el motor no lo determina."],
  conti_calcular_resico: [
    "Si la retención excede el ISR causado, el motor sólo informa la diferencia aritmética. NO concluye saldo a favor, acreditamiento ni compensación en meses posteriores: ese tratamiento no está resuelto por este motor.",
    "La tabla del art. 113-E LISR no proviene del Anexo 8 de la RMF; no la atribuyas a ese anexo.",
  ],
  conti_calcular_iva: ["No contempla región fronteriza, tasa 0% ni actos exentos."],
};

/** Definición de tools en el formato de la API de chat completions. */
export const HERRAMIENTAS_CONTI = [
  {
    type: "function",
    function: {
      name: "conti_calcular_isr_pf",
      description:
        "Calcula ISR de persona física (régimen general) con la tarifa vigente del periodo. Úsala SIEMPRE que se pida una cifra de ISR de persona física.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          periodo: { type: "string", description: "AAAA-MM para mensual, AAAA para anual" },
          ingresos: { type: "number" },
          deducciones: { type: ["number", "null"] },
          retenciones: { type: ["number", "null"] },
          pagosProvisionalesAnteriores: { type: ["number", "null"] },
        },
        required: ["periodo", "ingresos", "deducciones", "retenciones", "pagosProvisionalesAnteriores"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "conti_calcular_isr_pm",
      description: "Calcula el pago provisional de ISR de persona moral con la tasa vigente del periodo.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          periodo: { type: "string", description: "AAAA-MM" },
          ingresosNominales: { type: "number" },
          coeficienteUtilidad: { type: "number", description: "Decimal, ej. 0.15" },
          perdidasPendientes: { type: ["number", "null"] },
          pagosProvisionalesAnteriores: { type: ["number", "null"] },
          retenciones: { type: ["number", "null"] },
        },
        required: [
          "periodo",
          "ingresosNominales",
          "coeficienteUtilidad",
          "perdidasPendientes",
          "pagosProvisionalesAnteriores",
          "retenciones",
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "conti_calcular_resico",
      description:
        "Calcula el pago mensual de RESICO persona física (art. 113-E/113-F LISR) y la retención del 1.25% del art. 113-J.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          periodo: { type: "string", description: "AAAA-MM" },
          ingresosCobrados: { type: "number" },
          acumuladoAnualPrevio: { type: ["number", "null"] },
          retencionPersonaMoral: { type: ["boolean", "null"] },
          retencionesEfectuadas: { type: ["number", "null"] },
        },
        required: [
          "periodo",
          "ingresosCobrados",
          "acumuladoAnualPrevio",
          "retencionPersonaMoral",
          "retencionesEfectuadas",
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "conti_calcular_iva",
      description: "Calcula el IVA mensual definitivo a cargo o a favor del periodo.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          periodo: { type: "string", description: "AAAA-MM" },
          ivaTrasladado: { type: "number" },
          ivaAcreditable: { type: "number" },
          ivaRetenido: { type: ["number", "null"] },
          saldoAFavorAnterior: { type: ["number", "null"] },
        },
        required: ["periodo", "ivaTrasladado", "ivaAcreditable", "ivaRetenido", "saldoAFavorAnterior"],
      },
    },
  },
] as const;

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function sellar(n: any): SelloSalida {
  return {
    conjuntoId: n.conjuntoId,
    version: n.version,
    hash: n.hash,
    vigencia: n.vigencia,
    fuente: n.fuente,
    url: n.url,
    verificacion: n.verificacion,
    ejercicio: n.ejercicio,
  };
}

function fallo(herramienta: string, entradas: Record<string, unknown>, error: string): ResultadoHerramienta {
  return {
    herramienta,
    ok: false,
    entradas,
    resultado: null,
    normativa: null,
    fundamentos: [],
    advertencias: ["El cálculo se bloqueó: no publiques ninguna cifra."],
    limitaciones: [],
    error,
  };
}

export function esHerramientaConti(name: string): name is HerramientaConti {
  return (HERRAMIENTAS_CONTI_NOMBRES as readonly string[]).includes(name);
}

/** Ejecuta el motor determinista. Nunca lanza: devuelve el fallo tipado. */
export function ejecutarHerramientaConti(
  name: string,
  argsRaw: Record<string, unknown>,
): ResultadoHerramienta {
  if (!esHerramientaConti(name)) return fallo(name, argsRaw, `Herramienta desconocida: ${name}`);
  const advertencias: string[] = [];

  try {
    switch (name) {
      case "conti_calcular_isr_pf": {
        const entradas = {
          periodo: String(argsRaw.periodo ?? ""),
          ingresos: num(argsRaw.ingresos) ?? 0,
          deducciones: num(argsRaw.deducciones) ?? 0,
          retenciones: num(argsRaw.retenciones) ?? 0,
          pagosProvisionalesAnteriores: num(argsRaw.pagosProvisionalesAnteriores) ?? 0,
        };
        const r = calcularIsrPf(entradas);
        return armar(name, entradas, r, advertencias);
      }
      case "conti_calcular_isr_pm": {
        const entradas = {
          periodo: String(argsRaw.periodo ?? ""),
          ingresosNominales: num(argsRaw.ingresosNominales) ?? 0,
          coeficienteUtilidad: num(argsRaw.coeficienteUtilidad) ?? 0,
          perdidasPendientes: num(argsRaw.perdidasPendientes) ?? 0,
          pagosProvisionalesAnteriores: num(argsRaw.pagosProvisionalesAnteriores) ?? 0,
          retenciones: num(argsRaw.retenciones) ?? 0,
        };
        const r = calcularIsrPm(entradas);
        return armar(name, entradas, r, advertencias);
      }
      case "conti_calcular_resico": {
        const entradas = {
          periodo: String(argsRaw.periodo ?? ""),
          ingresosCobrados: num(argsRaw.ingresosCobrados) ?? 0,
          acumuladoAnualPrevio: num(argsRaw.acumuladoAnualPrevio) ?? 0,
          retencionPersonaMoral: argsRaw.retencionPersonaMoral === true,
          retencionesEfectuadas: num(argsRaw.retencionesEfectuadas),
        };
        const r = calcularResicoPf(entradas);
        const dif = Math.round((r.retencion - r.isrCausado) * 100) / 100;
        if (dif > 0) {
          advertencias.push(
            `La retención excede al ISR causado en $${dif.toFixed(2)}. Esa es una diferencia aritmética: el motor no determina si es saldo a favor, acreditable o compensable en meses posteriores.`,
          );
        }
        if (r.bloqueado && r.motivoBloqueo) advertencias.push(r.motivoBloqueo);
        return armar(name, entradas, { ...r, diferenciaRetencionVsCausado: dif }, advertencias);
      }
      case "conti_calcular_iva": {
        const entradas = {
          periodo: String(argsRaw.periodo ?? ""),
          ivaTrasladado: num(argsRaw.ivaTrasladado) ?? 0,
          ivaAcreditable: num(argsRaw.ivaAcreditable) ?? 0,
          ivaRetenido: num(argsRaw.ivaRetenido) ?? 0,
          saldoAFavorAnterior: num(argsRaw.saldoAFavorAnterior) ?? 0,
        };
        const r = calcularIva(entradas);
        return armar(name, entradas, r, advertencias);
      }
    }
  } catch (e) {
    return fallo(name, argsRaw, e instanceof Error ? e.message : "Error del motor determinista.");
  }
  return fallo(name, argsRaw, "Herramienta no implementada.");
}

function armar(
  name: HerramientaConti,
  entradas: Record<string, unknown>,
  r: any,
  advertencias: string[],
): ResultadoHerramienta {
  const { normativa, ...resultado } = r;
  return {
    herramienta: name,
    ok: true,
    entradas,
    resultado,
    normativa: sellar(normativa),
    fundamentos: FUNDAMENTOS[name],
    advertencias,
    limitaciones: [...LIMITACIONES_ESPECIFICAS[name], ...LIMITACIONES_COMUNES],
    error: null,
  };
}

/** Bloque textual que se entrega al modelo como salida de la herramienta. */
export function serializarResultado(r: ResultadoHerramienta): string {
  return JSON.stringify(r);
}

export const REGLA_HERRAMIENTAS = `USO OBLIGATORIO DE MOTORES:
- Si la persona pide una cifra fiscal (ISR, IVA, RESICO, retención, pago mensual), LLAMA a la herramienta correspondiente. No hagas la aritmética tú.
- Publica exclusivamente los importes que devolvió la herramienta, con su fundamento, vigencia y fuente.
- Si la herramienta devuelve error, di que el cálculo está bloqueado y por qué. No estimes.
- No conviertas una diferencia aritmética en un tratamiento fiscal (saldo a favor, acreditamiento, compensación) si la herramienta no lo afirma.`;
