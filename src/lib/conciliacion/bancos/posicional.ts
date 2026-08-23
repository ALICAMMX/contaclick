// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES POSICIONALES COMUNES A TODOS LOS ADAPTADORES
// Nunca aplanan el PDF: agrupan por Y conservando X, ancho y alto.
// ─────────────────────────────────────────────────────────────────────────────
import type { ElementoPdf, RenglonPdf } from "./tipos";

export const RE_IMPORTE = /^\(?-?\$?\s?-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)?$/;

export function esImporte(texto: string): boolean {
  return RE_IMPORTE.test(texto.trim());
}

export function parseImporte(texto: string): number {
  const s = texto.trim();
  const negativo = /^\(.*\)$/.test(s) || /^-|\$-|-\$/.test(s);
  const n = Number(s.replace(/[()$\s,+-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}

export function normaliza(texto: string): string {
  return texto
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Agrupa elementos en renglones visuales por proximidad de Y, por página. */
export function agruparRenglones(elementos: ElementoPdf[], tolerancia = 2.5): RenglonPdf[] {
  const porPagina = new Map<number, ElementoPdf[]>();
  for (const el of elementos) {
    if (!el || typeof el.texto !== "string" || !el.texto.trim()) continue;
    if (!porPagina.has(el.pagina)) porPagina.set(el.pagina, []);
    porPagina.get(el.pagina)!.push(el);
  }
  const renglones: RenglonPdf[] = [];
  let indice = 0;
  for (const pagina of [...porPagina.keys()].sort((a, b) => a - b)) {
    const items = [...porPagina.get(pagina)!].sort((a, b) => b.y - a.y || a.x - b.x);
    let grupo: ElementoPdf[] = [];
    let yRef = Number.NaN;
    const cerrar = () => {
      if (!grupo.length) return;
      const ordenados = [...grupo].sort((a, b) => a.x - b.x);
      renglones.push({
        pagina,
        y: yRef,
        indice: (indice += 1),
        elementos: ordenados,
        texto: ordenados.map((e) => e.texto.trim()).join(" ").replace(/\s+/g, " ").trim(),
      });
      grupo = [];
    };
    for (const it of items) {
      if (grupo.length && Math.abs(it.y - yRef) > tolerancia) cerrar();
      if (!grupo.length) yRef = it.y;
      grupo.push(it);
    }
    cerrar();
  }
  return renglones;
}

export type ColumnaDetectada = { clave: string; x: number; xFin: number; etiqueta: string };

/** Centro horizontal de un elemento/columna. */
export function centro(x: number, ancho: number): number {
  return x + ancho / 2;
}

/**
 * Asigna un importe a la columna cuyo intervalo (frontera en el punto medio
 * entre centros contiguos) contiene su centro. Devuelve null si queda fuera
 * del margen razonable: ante la duda no se asigna, se bloquea.
 */
export function asignarColumna(
  el: ElementoPdf,
  columnas: ColumnaDetectada[],
): { clave: string; x: number } | null {
  if (!columnas.length) return null;
  const cs = [...columnas].sort((a, b) => centro(a.x, a.xFin - a.x) - centro(b.x, b.xFin - b.x));
  const centros = cs.map((c) => centro(c.x, c.xFin - c.x));
  const cEl = centro(el.x, el.ancho);
  let mejor = 0;
  let mejorDist = Math.abs(cEl - centros[0]);
  for (let i = 1; i < centros.length; i += 1) {
    const d = Math.abs(cEl - centros[i]);
    if (d < mejorDist) {
      mejor = i;
      mejorDist = d;
    }
  }
  const separaciones = centros.slice(1).map((c, i) => c - centros[i]);
  const gap = separaciones.length ? Math.min(...separaciones) : 80;
  // El importe debe caer claramente dentro de su columna.
  if (mejorDist > Math.max(gap * 0.75, 30)) return null;
  return { clave: cs[mejor].clave, x: centros[mejor] };
}

export const MESES_ABREV: Record<string, string> = {
  ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
  JUL: "07", AGO: "08", SEP: "09", OCT: "10", NOV: "11", DIC: "12",
};

export function fechaIsoValida(iso: string): boolean {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12) return false;
  return d >= 1 && d <= new Date(y, mo, 0).getDate();
}

/** Huella estable del formato (no contiene datos del cliente). */
export function huellaFormato(partes: string[]): string {
  const base = partes.join("|");
  let h = 5381;
  for (let i = 0; i < base.length; i += 1) h = ((h << 5) + h + base.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}
