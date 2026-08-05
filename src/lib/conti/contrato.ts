// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO DE RESPUESTA DE CONTI
//
// Toda respuesta técnica tiene la misma anatomía. El contrato es lo que permite
// auditar a Conti: si falta la base de evidencia o si aparece un porcentaje de
// confianza inventado, la respuesta se corrige antes de mostrarse.
// ─────────────────────────────────────────────────────────────────────────────

import {
  bloqueEvidencia,
  contieneConfianzaNumerica,
  limpiarConfianza,
  type NivelEvidencia,
} from "./evidencia";
import { MODO_INFO, type ContiModo } from "./modos";

export const CONTRATO_RESPUESTA = `Toda respuesta técnica debe seguir esta anatomía, en este orden:
1. **Respuesta directa** — qué es, en una o dos frases.
2. **Fundamento** — ordenamiento aplicable (LISR, LIVA, CFF, RMF, LSS) y el razonamiento. Sin números de artículo si no los tienes verificados.
3. **Qué hacer en ContaClick** — la ruta concreta, con su estado de madurez cuando no sea "Operativa".
4. **Qué falta / supuestos** — la información que no tienes y que cambiaría la respuesta.
5. **Base de la respuesta** — de dónde sale lo que afirmaste.

Nunca omitas el punto 4 cuando estés suponiendo algo.`;

export type RespuestaContiMeta = {
  modo: ContiModo;
  evidencia: NivelEvidencia;
  expediente: string | null;
  saneada: boolean;
};

/**
 * Aplica el contrato al texto devuelto por el modelo:
 *  - elimina cualquier porcentaje de confianza,
 *  - garantiza el bloque "Base de la respuesta".
 */
export function aplicarContrato(
  bruto: string,
  opts: { modo: ContiModo; evidencia: NivelEvidencia; detalleEvidencia?: string | null },
): { content: string; meta: Omit<RespuestaContiMeta, "expediente"> } {
  const tenia = contieneConfianzaNumerica(bruto);
  let content = limpiarConfianza(bruto);

  if (content && !/\*\*Base de la respuesta:\*\*/i.test(content)) {
    const detalle =
      opts.detalleEvidencia ?? `Modo ${MODO_INFO[opts.modo].label.toLowerCase()}`;
    content = `${content}\n\n${bloqueEvidencia(opts.evidencia, detalle)}`;
  }

  return {
    content,
    meta: { modo: opts.modo, evidencia: opts.evidencia, saneada: tenia },
  };
}
