// ─────────────────────────────────────────────────────────────────────────────
// SELLO NORMATIVO CANÓNICO
//
// Concatenar dos huellas no es un sello: no es verificable ni deja constancia
// de QUÉ conjuntos normativos se usaron. Aquí se construye un objeto canónico
// con todos los conjuntos realmente aplicados (propósito, id, versión,
// vigencia, fuente, huella del conjunto), se ordena determinísticamente y se
// calcula un SHA-256 real sobre su representación canónica.
//
// Al verificar, el SHA-256 se RECALCULA: un hash no se acepta por ser una
// cadena no vacía.
// ─────────────────────────────────────────────────────────────────────────────

import { sha256Hex } from "@/lib/fiscal/normativa/sha256";
import type { SelloNormativo } from "@/lib/fiscal/normativa/motor";

export type PropositoNormativo = "isr" | "iva";

export type ConjuntoAplicado = {
  proposito: PropositoNormativo;
  conjuntoId: string;
  hash_conjunto: string;
  ejercicio: number;
  version: string;
  vigencia: string;
  verificacion: SelloNormativo["verificacion"];
  fuente: string;
  url: string;
  publicacionDOF: string;
  entradaVigor: string;
  actualizadoAl: string;
};

export type SelloNormativoCanonico = {
  sello_version: "sello-normativo@1";
  conjuntos: ConjuntoAplicado[];
  sha256: string;
};

const desdeSello = (proposito: PropositoNormativo, s: SelloNormativo): ConjuntoAplicado => ({
  proposito,
  conjuntoId: s.conjuntoId,
  hash_conjunto: s.hash,
  ejercicio: s.ejercicio,
  version: s.version,
  vigencia: s.vigencia,
  verificacion: s.verificacion,
  fuente: s.fuente,
  url: s.url,
  publicacionDOF: s.publicacionDOF,
  entradaVigor: s.entradaVigor,
  actualizadoAl: s.actualizadoAl,
});

/** Serialización estable: claves ordenadas, sin espacios, sin instantes de cálculo. */
export function serializacionCanonica(conjuntos: ConjuntoAplicado[]): string {
  const ordenados = [...conjuntos].sort((a, b) =>
    `${a.proposito}|${a.conjuntoId}`.localeCompare(`${b.proposito}|${b.conjuntoId}`),
  );
  const fila = (c: ConjuntoAplicado) =>
    Object.keys(c)
      .sort()
      .map((k) => `${k}=${String((c as unknown as Record<string, unknown>)[k])}`)
      .join(";");
  return ["sello-normativo@1", ...ordenados.map(fila)].join("\n");
}

/** Construye el sello canónico de los conjuntos realmente utilizados. */
export function construirSelloNormativo(
  entradas: Array<{ proposito: PropositoNormativo; sello: SelloNormativo }>,
): SelloNormativoCanonico {
  const conjuntos = entradas.map((e) => desdeSello(e.proposito, e.sello));
  const ordenados = [...conjuntos].sort((a, b) =>
    `${a.proposito}|${a.conjuntoId}`.localeCompare(`${b.proposito}|${b.conjuntoId}`),
  );
  return {
    sello_version: "sello-normativo@1",
    conjuntos: ordenados,
    sha256: sha256Hex(serializacionCanonica(ordenados)),
  };
}

/** Recalcula la huella: cualquier alteración del objeto la invalida. */
export function verificarSelloNormativo(
  sello: Pick<SelloNormativoCanonico, "conjuntos" | "sha256">,
): { valido: boolean; esperado: string } {
  const esperado = sha256Hex(serializacionCanonica(sello.conjuntos ?? []));
  return { valido: esperado === sello.sha256, esperado };
}
