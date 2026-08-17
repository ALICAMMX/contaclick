// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 2 · Importación del catálogo de cuentas del contador.
//
// Módulo PURO (sin red ni Supabase): normaliza encabezados, mapea columnas,
// valida filas y calcula la huella de importación. La escritura real es
// atómica y ocurre en el RPC `catalogo_importar_lote`.
//
// El código de cuenta SIEMPRE se trata como texto: conserva ceros a la
// izquierda. La normalización sólo elimina separadores para comparar.
// ─────────────────────────────────────────────────────────────────────────────

export type NaturalezaCuenta = "deudora" | "acreedora";

export type FilaCatalogo = {
  codigo: string;
  nombre: string;
  naturaleza: NaturalezaCuenta | "";
  nivel?: number | null;
  codigo_padre?: string | null;
  agrupador_sat?: string | null;
  moneda?: string | null;
  activa?: boolean;
  external_id?: string | null;
};

export type ErrorFila = { fila: number; codigo: string; error: string };

export type CampoCatalogo = {
  key: keyof FilaCatalogo;
  label: string;
  requerido: boolean;
  alias: string[];
  ejemplo: string;
  nota?: string;
};

/** Campos canónicos mínimos del catálogo, con los alias que se autodetectan. */
export const CAMPOS_CATALOGO: CampoCatalogo[] = [
  { key: "codigo", label: "Código", requerido: true, ejemplo: "102-01",
    alias: ["codigo", "código", "cuenta", "numcta", "num cta", "no. cuenta", "clave"],
    nota: "Se conserva tal cual, incluyendo ceros a la izquierda." },
  { key: "nombre", label: "Nombre", requerido: true, ejemplo: "Bancos",
    alias: ["nombre", "descripcion", "descripción", "desc", "desccta", "nombre de la cuenta"] },
  { key: "naturaleza", label: "Naturaleza", requerido: true, ejemplo: "deudora",
    alias: ["naturaleza", "natur", "tipo saldo", "naturaleza contable"],
    nota: "deudora / acreedora (también acepta D y A, cargo/abono)." },
  { key: "nivel", label: "Nivel", requerido: false, ejemplo: "2",
    alias: ["nivel", "level", "tipo", "jerarquia", "jerarquía"] },
  { key: "codigo_padre", label: "Cuenta padre", requerido: false, ejemplo: "102",
    alias: ["codigo padre", "código padre", "cuenta padre", "padre", "cuenta mayor", "subcuenta de"] },
  { key: "agrupador_sat", label: "Código agrupador SAT", requerido: false, ejemplo: "102.01",
    alias: ["agrupador", "codagrup", "código agrupador sat", "codigo agrupador sat", "agrupador sat", "sat"] },
  { key: "moneda", label: "Moneda", requerido: false, ejemplo: "MXN",
    alias: ["moneda", "divisa", "currency"] },
  { key: "activa", label: "Activa", requerido: false, ejemplo: "sí",
    alias: ["activa", "activo", "estatus", "estado", "vigente"] },
  { key: "external_id", label: "Identificador externo", requerido: false, ejemplo: "CTPQ-1020001",
    alias: ["id externo", "identificador externo", "external id", "id sistema", "id contpaqi"] },
];

/** Misma normalización que `public.cc_normalizar_codigo` en la base. */
export function normalizarCodigo(codigo: string): string {
  return String(codigo ?? "").replace(/[\s._-]/g, "").toUpperCase();
}

const slug = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Detecta el mapeo encabezado → campo canónico. Devuelve el encabezado usado. */
export function detectarMapeo(encabezados: string[]): Record<string, string | null> {
  const mapeo: Record<string, string | null> = {};
  const usados = new Set<string>();
  for (const campo of CAMPOS_CATALOGO) {
    const objetivo = [slug(campo.label), ...campo.alias.map(slug), slug(campo.key)];
    const encontrado = encabezados.find(
      (h) => !usados.has(h) && objetivo.includes(slug(h)),
    );
    mapeo[campo.key] = encontrado ?? null;
    if (encontrado) usados.add(encontrado);
  }
  return mapeo;
}

export function normalizarNaturaleza(valor: unknown): NaturalezaCuenta | "" {
  const v = slug(String(valor ?? ""));
  if (["deudora", "deudor", "d", "cargo", "debe", "deudoras"].includes(v)) return "deudora";
  if (["acreedora", "acreedor", "a", "abono", "haber", "acreedoras"].includes(v)) return "acreedora";
  return "";
}

export function normalizarActiva(valor: unknown): boolean {
  if (valor === undefined || valor === null || valor === "") return true;
  const v = slug(String(valor));
  return !["no", "n", "0", "false", "inactiva", "inactivo", "baja", "cancelada"].includes(v);
}

/** Celdas que Excel interpretaría como fórmula: se rechazan siempre. */
export function esFormulaPeligrosa(valor: unknown): boolean {
  return /^[=+@]/.test(String(valor ?? "").trim());
}

/** Convierte una fila cruda del archivo en la fila canónica del catálogo. */
export function filaCanonica(
  cruda: Record<string, unknown>,
  mapeo: Record<string, string | null>,
): FilaCatalogo {
  const leer = (k: string) => {
    const h = mapeo[k];
    if (!h) return "";
    const v = cruda[h];
    return v === undefined || v === null ? "" : String(v).trim();
  };
  const nivelTxt = leer("nivel");
  const nivel = /^\d+$/.test(nivelTxt) ? Number(nivelTxt) : null;
  return {
    codigo: leer("codigo"),
    nombre: leer("nombre"),
    naturaleza: normalizarNaturaleza(leer("naturaleza")),
    nivel,
    codigo_padre: leer("codigo_padre") || null,
    agrupador_sat: leer("agrupador_sat") || null,
    moneda: (leer("moneda") || "MXN").toUpperCase().slice(0, 3),
    activa: normalizarActiva(mapeo["activa"] ? cruda[mapeo["activa"]!] : ""),
    external_id: leer("external_id") || null,
  };
}

/**
 * Validación previa (misma semántica que el RPC) para mostrar el reporte antes
 * de escribir. `existentes` son los códigos ya presentes en el expediente.
 */
export function validarFilas(filas: FilaCatalogo[], existentes: string[] = []): {
  errores: ErrorFila[];
  nuevas: number;
  repetidas: number;
} {
  const errores: ErrorFila[] = [];
  const enBase = new Set(existentes.map(normalizarCodigo));
  const vistos = new Set<string>();
  const padres = new Map<string, string>();
  let nuevas = 0;
  let repetidas = 0;

  filas.forEach((f, i) => {
    const fila = i + 1;
    const norm = normalizarCodigo(f.codigo);
    if (!f.codigo.trim()) errores.push({ fila, codigo: f.codigo, error: "Código de cuenta vacío." });
    else if (vistos.has(norm)) errores.push({ fila, codigo: f.codigo, error: "Código duplicado dentro del archivo." });
    if (!f.nombre.trim()) errores.push({ fila, codigo: f.codigo, error: "Nombre vacío." });
    if (f.naturaleza !== "deudora" && f.naturaleza !== "acreedora") {
      errores.push({ fila, codigo: f.codigo, error: "Naturaleza inválida (use deudora o acreedora)." });
    }
    if (esFormulaPeligrosa(f.codigo) || esFormulaPeligrosa(f.nombre) || esFormulaPeligrosa(f.codigo_padre ?? "")) {
      errores.push({ fila, codigo: f.codigo, error: "Contenido peligroso: la celda comienza con = + o @." });
    }
    if (f.codigo_padre && normalizarCodigo(f.codigo_padre) === norm) {
      errores.push({ fila, codigo: f.codigo, error: "La cuenta no puede ser su propia cuenta padre." });
    }
    if (f.codigo.trim()) {
      vistos.add(norm);
      padres.set(norm, f.codigo_padre ? normalizarCodigo(f.codigo_padre) : "");
      if (enBase.has(norm)) repetidas += 1;
      else nuevas += 1;
    }
  });

  // Padre inexistente (ni en el archivo ni en el catálogo del expediente).
  filas.forEach((f, i) => {
    if (!f.codigo_padre) return;
    const p = normalizarCodigo(f.codigo_padre);
    if (!vistos.has(p) && !enBase.has(p)) {
      errores.push({
        fila: i + 1,
        codigo: f.codigo,
        error: `La cuenta padre ${f.codigo_padre} no existe en el archivo ni en el catálogo.`,
      });
    }
  });

  // Ciclos jerárquicos dentro del archivo.
  for (const inicio of vistos) {
    let cur = inicio;
    let pasos = 0;
    while (true) {
      cur = padres.get(cur) ?? "";
      if (!cur || !padres.has(cur)) break;
      pasos += 1;
      if (cur === inicio || pasos > 50) {
        errores.push({ fila: 0, codigo: inicio, error: "Ciclo jerárquico entre cuentas padre." });
        break;
      }
    }
  }

  return { errores, nuevas, repetidas };
}

/** Huella estable del contenido importado (FNV-1a, suficiente para idempotencia). */
export function huellaImportacion(filas: FilaCatalogo[]): string {
  const texto = filas
    .map((f) =>
      [normalizarCodigo(f.codigo), f.nombre.trim(), f.naturaleza, f.codigo_padre ?? "", f.agrupador_sat ?? "", f.moneda ?? ""].join("|"),
    )
    .join("\n");
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `cat_${h.toString(16).padStart(8, "0")}_${filas.length}`;
}

// ─────────────────────────── Lectura del archivo (navegador) ─────────────────
export const PLANTILLA_CATALOGO_CSV = `codigo,nombre,naturaleza,codigo_padre,agrupador_sat,nivel,moneda,activa
100,Activo,deudora,,100,1,MXN,si
102-001,Bancos moneda nacional,deudora,100,102.01,3,MXN,si
105-001,Clientes nacionales,deudora,100,105.01,3,MXN,si
113-001,IVA acreditable pagado,deudora,100,113.01,3,MXN,si
118-001,IVA acreditable pendiente de pago,deudora,100,118.01,3,MXN,si
201-001,Proveedores nacionales,acreedora,200,201.01,3,MXN,si
208-001,IVA trasladado no cobrado,acreedora,200,208.01,3,MXN,si
209-001,IVA trasladado cobrado,acreedora,200,209.01,3,MXN,si
216-001,ISR retenido por terceros,acreedora,200,216.01,3,MXN,si
216-002,IVA retenido por terceros,acreedora,200,216.02,3,MXN,si
401-001,Ingresos por servicios,acreedora,400,401.01,3,MXN,si
601-001,Gastos de operacion,deudora,600,601.01,3,MXN,si
`;

export type ResultadoLectura = { filas: FilaCatalogo[]; huella: string; avisos: string[] };

/**
 * Lee un CSV o XLSX del navegador y devuelve las filas canónicas.
 * No escribe nada: la validación dura vive en el RPC atómico.
 */
export async function parsearCatalogo(file: File): Promise<ResultadoLectura> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  let crudas: Record<string, unknown>[] = [];

  if (ext === "csv" || ext === "txt") {
    const Papa = (await import("papaparse")).default;
    const texto = await file.text();
    const res = Papa.parse<Record<string, unknown>>(texto, { header: true, skipEmptyLines: true });
    crudas = res.data ?? [];
  } else {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
  }

  const encabezados = Object.keys(crudas[0] ?? {});
  const mapeo = detectarMapeo(encabezados);
  const avisos: string[] = [];
  for (const campo of CAMPOS_CATALOGO) {
    if (campo.requerido && !mapeo[campo.key]) {
      avisos.push(`No se reconoció la columna obligatoria “${campo.label}”.`);
    }
  }

  const filas = crudas.map((c) => filaCanonica(c, mapeo)).filter((f) => f.codigo.trim() || f.nombre.trim());
  if (filas.length > 5000) avisos.push("El archivo excede 5000 cuentas: sólo se enviarán las primeras 5000.");

  const recorte = filas.slice(0, 5000);
  return { filas: recorte, huella: huellaImportacion(recorte), avisos };
}
