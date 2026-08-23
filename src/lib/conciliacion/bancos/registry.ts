// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO ÚNICO Y VERSIONADO DE ADAPTADORES BANCARIOS
// ─────────────────────────────────────────────────────────────────────────────
import { adaptadorBbvaMx } from "./bbva-mx";
import { adaptadorGenerico } from "./generico";
import { agruparRenglones } from "./posicional";
import type { AdaptadorBancario, ElementoPdf, ResultadoAdaptador } from "./tipos";

export const REGISTRY_VERSION = "bancos-2026.08.23";

/** Adaptadores específicos, en orden de especificidad. El genérico es el último recurso. */
export const ADAPTADORES: AdaptadorBancario[] = [adaptadorBbvaMx];

/** Puntaje mínimo para aceptar que un PDF pertenece a un formato conocido. */
const UMBRAL_DETECCION = 6;

export function detectarAdaptador(elementos: ElementoPdf[]): {
  adaptador: AdaptadorBancario;
  puntaje: number;
} {
  const renglones = agruparRenglones(elementos);
  const texto = renglones.map((r) => r.texto).join("\n");
  let mejor: { adaptador: AdaptadorBancario; puntaje: number } = { adaptador: adaptadorGenerico, puntaje: 0 };
  for (const a of ADAPTADORES) {
    const puntaje = a.detectar(renglones, texto);
    if (puntaje > mejor.puntaje) mejor = { adaptador: a, puntaje };
  }
  if (mejor.puntaje < UMBRAL_DETECCION) return { adaptador: adaptadorGenerico, puntaje: mejor.puntaje };
  return mejor;
}

/** Ejecuta el adaptador que corresponda sobre los elementos posicionales del PDF. */
export function leerPdfBancario(elementos: ElementoPdf[]): ResultadoAdaptador & { puntaje_deteccion: number } {
  const renglones = agruparRenglones(elementos);
  const texto = renglones.map((r) => r.texto).join("\n");
  const { adaptador, puntaje } = detectarAdaptador(elementos);
  const resultado = adaptador.extraer(renglones, texto);
  return { ...resultado, puntaje_deteccion: puntaje };
}
