// Lector mínimo de elementos XML con jerarquía, tolerante a prefijos de
// espacio de nombres (cfdi:, pago20:, nomina12:, tfd:). Puro y sin dependencias.
//
// No sustituye al parser de encabezado (`src/lib/tools/cfdi-parser.ts`):
// lo complementa cuando se necesita el CONTENIDO de un elemento (conceptos con
// sus impuestos, complemento de pagos con sus documentos relacionados).

export type Elemento = {
  nombre: string;
  attrs: Record<string, string>;
  /** Contenido entre la etiqueta de apertura y la de cierre. Vacío si es auto-cerrada. */
  inner: string;
  /** Texto completo del elemento, incluyendo sus etiquetas. */
  outer: string;
};

const ATTR_RE = /([A-Za-z_][\w.:-]*)\s*=\s*"([^"]*)"/g;

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(raw))) {
    const key = m[1]!.includes(":") ? m[1]!.split(":").pop()! : m[1]!;
    out[key] = decodeEntities(m[2] ?? "");
  }
  return out;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Devuelve todos los elementos con ese nombre local presentes en `xml`,
 * respetando anidamiento del mismo nombre (toma el cierre correspondiente).
 */
export function elementos(xml: string, localName: string): Elemento[] {
  const out: Elemento[] = [];
  const open = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${localName}(\\s[^>]*?)?(/?)>`, "g");
  let m: RegExpExecArray | null;
  while ((m = open.exec(xml))) {
    const attrs = parseAttrs(m[1] ?? "");
    const start = m.index;
    if (m[2] === "/") {
      out.push({ nombre: localName, attrs, inner: "", outer: m[0] });
      continue;
    }
    // Buscar el cierre correspondiente contando aperturas anidadas homónimas.
    const scan = new RegExp(`<(/?)(?:[A-Za-z0-9_.-]+:)?${localName}(\\s[^>]*?)?(/?)>`, "g");
    scan.lastIndex = open.lastIndex;
    let depth = 1;
    let end = -1;
    let innerEnd = -1;
    let s: RegExpExecArray | null;
    while ((s = scan.exec(xml))) {
      if (s[1] === "/") {
        depth -= 1;
        if (depth === 0) { innerEnd = s.index; end = s.index + s[0].length; break; }
      } else if (s[3] !== "/") {
        depth += 1;
      }
    }
    if (end === -1) continue; // XML mal formado: se ignora ese nodo
    out.push({
      nombre: localName,
      attrs,
      inner: xml.slice(open.lastIndex, innerEnd),
      outer: xml.slice(start, end),
    });
    open.lastIndex = end;

  }
  return out;
}

/** Igual que `elementos`, pero devuelve sólo el primero (o undefined). */
export function elemento(xml: string, localName: string): Elemento | undefined {
  return elementos(xml, localName)[0];
}

/** Quita del texto todos los bloques de ese nombre (para aislar el nivel actual). */
export function sinBloques(xml: string, localName: string): string {
  let out = xml;
  for (const el of elementos(xml, localName)) out = out.replace(el.outer, "");
  return out;
}

export function numero(v: string | undefined): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function entero(v: string | undefined): number | undefined {
  const n = numero(v);
  return n === undefined ? undefined : Math.trunc(n);
}
