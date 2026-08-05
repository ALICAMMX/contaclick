// ─────────────────────────────────────────────────────────────────────────────
// VALIDADOR ESTRUCTURAL DE RESPUESTAS DE CONTI
//
// El prompt pide; el validador exige. Antes de mostrar cualquier respuesta se
// revisa: modo, contexto permitido, motores ejecutados, umbrales inventados y
// afirmaciones fiscales prohibidas. Lo que no pasa, no se publica.
// ─────────────────────────────────────────────────────────────────────────────

import { getCapabilityByRoute } from "@/lib/capabilities/registry";
import { filtraExpediente, type ExpedienteContexto } from "./contexto";
import type { ContiModo } from "./modos";

export type Violacion = {
  regla: string;
  detalle: string;
  accion: "regenerar" | "eliminado" | "sustituido";
};

type ReglaTexto = {
  regla: string;
  detalle: string;
  re: RegExp;
  /** null = se elimina la frase; string = se sustituye por ese texto. */
  sustituto: string | null;
};

/** Afirmaciones que ningún registro respalda y que el modelo tiende a inventar. */
const REGLAS_TEXTO: ReglaTexto[] = [
  {
    regla: "umbral_salud_no_registrado",
    detalle: "Salud Fiscal > 80 no es criterio oficial de cierre.",
    re: /[^.\n]*salud\s+fiscal[^.\n]*(?:mayor|superior|arriba|por encima|>|≥|mínim[oa])[^.\n]*\d{2}[^.\n]*\.?/gi,
    sustituto: null,
  },
  {
    regla: "umbral_conciliacion_no_registrado",
    detalle: "No existe una meta registrada de conciliación (95% u otra).",
    re: /[^.\n]*conciliaci[oó]n[^.\n]*(?:mayor|superior|al menos|>|≥)\s*(?:al?\s*)?\d{2,3}\s*%[^.\n]*\.?/gi,
    sustituto: null,
  },
  {
    regla: "incidencias_cero_no_registrado",
    detalle: "Cero incidencias críticas no es criterio universal de terminación.",
    re: /[^.\n]*(?:incidencias|hallazgos|alertas)\s+(?:cr[ií]tic[ao]s?)[^.\n]*(?:=\s*0|en\s+cero|igual\s+a\s+cero|sin\s+incidencias)[^.\n]*\.?/gi,
    sustituto: null,
  },
  {
    regla: "efos_deduccion_automatica",
    detalle: "Un EFOS definitivo no invalida automáticamente toda deducción.",
    re: /[^.\n]*efos[^.\n]*(?:definitiv[oa])[^.\n]*(?:no\s+(?:es|ser[aá]n?)\s+deducibles?|invalida|anula|pierde[sn]?\s+la\s+deducci[oó]n|deducci[oó]n\s+(?:queda\s+)?(?:invalidada|improcedente))[^.\n]*\.?/gi,
    sustituto:
      "Un proveedor en la lista definitiva del art. 69-B CFF obliga a revisar materialidad, efectos fiscales dados y, en su caso, regularización; no implica por sí solo que toda deducción quede invalidada.",
  },
  {
    regla: "efectivo_regla_general",
    detalle: "El límite de pagos en efectivo depende del supuesto fiscal.",
    re: /[^.\n]*(?:efectivo)[^.\n]*(?:\$?\s*2[,.]?000|\$?\s*2\s?k\b)[^.\n]*\.?/gi,
    sustituto:
      "El límite de pagos en efectivo depende del supuesto (concepto, tipo de erogación y régimen); identifica la norma y la excepción aplicables antes de aplicarlo.",
  },
  {
    regla: "capacidad_inexistente_presua",
    detalle: "El registro de capacidades no declara generación de pre-SUA.",
    re: /[^.\n]*\bpre-?\s?sua\b[^.\n]*\.?/gi,
    sustituto: null,
  },
  {
    regla: "riesgo_sat_cierre_seguro",
    detalle: "Riesgo SAT no puede declarar un cierre seguro.",
    re: /[^.\n]*riesgo\s+sat[^.\n]*(?:cierre\s+segur[oa]|puedes\s+cerrar|listo\s+para\s+cerrar|sin\s+riesgo)[^.\n]*\.?/gi,
    sustituto: null,
  },
  {
    regla: "resico_anexo_8",
    detalle: "La tabla de RESICO proviene de la LISR (art. 113-E), no del Anexo 8 de la RMF.",
    re: /[^.\n]*anexo\s*8[^.\n]*\.?/gi,
    sustituto: null,
  },
  {
    regla: "secreto_interno",
    detalle: "Nombres internos y secretos no se publican.",
    re: /[^.\n]*(?:pac_token|service_role|SUPABASE_[A-Z_]+|LOVABLE_API_KEY)[^.\n]*\.?/gi,
    sustituto: null,
  },
];

/** Sólo se aplican dentro del modo consulta/guía (no hay expediente). */
const REGLAS_SIN_EXPEDIENTE: ReglaTexto[] = [
  {
    regla: "contexto_de_otro_modo",
    detalle: "Guía y Consulta no pueden declarar base en el expediente activo.",
    re: /[^.\n]*\*\*Base de la respuesta:\*\*[^.\n]*expediente[^.\n]*\.?/gi,
    sustituto: "**Base de la respuesta:** Registro de capacidades de ContaClick",
  },
];

/** Cifras presentadas como resultado de un cálculo. */
const CIFRA_CALCULADA =
  /\b(ISR\s+causado|ISR\s+a\s+cargo|pago\s+mensual|retenci[oó]n|IVA\s+a\s+cargo|IVA\s+a\s+favor|impuesto\s+a\s+pagar)\b\s*[:=]\s*\$?\s?[\d,]+(?:\.\d{2})?/gi;

export type ResultadoValidacion = {
  content: string;
  violaciones: Violacion[];
  /** true cuando la respuesta filtró contexto de otro modo y debe regenerarse. */
  requiereRegeneracion: boolean;
};

export function validarRespuestaConti(
  bruto: string,
  opts: {
    modo: ContiModo;
    expediente: ExpedienteContexto | null;
    /** Nombres de motores realmente ejecutados en este turno. */
    motoresEjecutados: string[];
  },
): ResultadoValidacion {
  let content = String(bruto ?? "");
  const violaciones: Violacion[] = [];

  // 1. Fuga de contexto entre modos → se rechaza la respuesta completa.
  const sinExpediente = opts.modo !== "expediente";
  const requiereRegeneracion = sinExpediente && filtraExpediente(content, opts.expediente);
  if (requiereRegeneracion) {
    violaciones.push({
      regla: "fuga_de_contexto",
      detalle: `El modo ${opts.modo} no admite datos de expediente y la respuesta los incluyó.`,
      accion: "regenerar",
    });
  }

  // 2. Afirmaciones sin respaldo registrado.
  const reglas = sinExpediente ? [...REGLAS_TEXTO, ...REGLAS_SIN_EXPEDIENTE] : REGLAS_TEXTO;
  for (const r of reglas) {
    const re = new RegExp(r.re.source, r.re.flags);
    if (!re.test(content)) continue;
    content = content.replace(new RegExp(r.re.source, r.re.flags), r.sustituto ?? "");
    violaciones.push({
      regla: r.regla,
      detalle: r.detalle,
      accion: r.sustituto ? "sustituido" : "eliminado",
    });
  }

  // 3. Rutas internas que no existen en el registro de capacidades.
  const RUTA_MD = /\[([^\]]+)\]\((\/app\/[^)\s]*)\)/g;
  const inexistentes = new Set<string>();
  content = content.replace(RUTA_MD, (_m, texto: string, ruta: string) => {
    const limpia = ruta.replace(/[).,]+$/, "");
    if (getCapabilityByRoute(limpia)) return `[${texto}](${limpia})`;
    inexistentes.add(limpia);
    return texto;
  });
  if (inexistentes.size > 0) {
    violaciones.push({
      regla: "ruta_inexistente",
      detalle: `Rutas no registradas retiradas: ${[...inexistentes].join(", ")}.`,
      accion: "eliminado",
    });
  }

  // 4. Cifras publicadas sin ejecución de motor.
  if (opts.motoresEjecutados.length === 0 && CIFRA_CALCULADA.test(content)) {
    content = content.replace(
      new RegExp(CIFRA_CALCULADA.source, CIFRA_CALCULADA.flags),
      (m) => `${m.split(/[:=]/)[0]!.trim()}: No calculado`,
    );
    violaciones.push({
      regla: "cifra_sin_motor",
      detalle: "Se publicaron importes sin ejecutar un motor determinista.",
      accion: "sustituido",
    });
  }

  content = content
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { content, violaciones, requiereRegeneracion };
}

export const REGLA_GROUNDING = `GROUNDING DE CAPACIDADES (obligatorio en modo Guía):
- Cada afirmación operativa debe apoyarse en un campo del registro: nombre de la capacidad, ruta, estado de madurez, prerrequisito registrado o limitación registrada. Si no puedes vincularla a esos campos, no la escribas.
- Está PROHIBIDO inventar: umbrales de score, metas de conciliación, porcentajes de avance, "cero incidencias" como criterio de cierre, nombres de estados, documentos generados, conexiones externas o funciones de envío que el registro no declare.
- No existe criterio oficial "Salud Fiscal mayor a 80" ni equivalente. No lo uses como señal de terminación.
- El cierre se declara terminado únicamente por los pasos registrados de cada herramienta, no por una métrica inventada.
- No menciones nombres internos, tokens ni configuración.`;
