import * as XLSX from "xlsx";
import Papa from "papaparse";

export type ParsedMovimiento = {
  fecha: string; // ISO date YYYY-MM-DD
  descripcion: string;
  referencia: string | null;
  cargo: number;
  abono: number;
  saldo: number | null;
};

const HEADER_ALIASES: Record<keyof Omit<ParsedMovimiento, "saldo"> | "saldo" | "monto", string[]> = {
  fecha: ["fecha", "date", "fecha movimiento", "fecha operacion", "fecha de operacion", "fec. mov."],
  descripcion: ["descripcion", "descripción", "concepto", "detalle", "movimiento", "description"],
  referencia: ["referencia", "ref", "folio", "numero", "número", "no. referencia", "reference"],
  cargo: ["cargo", "cargos", "debito", "débito", "retiro", "egreso", "withdrawal", "debit"],
  abono: ["abono", "abonos", "credito", "crédito", "deposito", "depósito", "ingreso", "deposit", "credit"],
  saldo: ["saldo", "balance", "saldo final"],
  monto: ["monto", "importe", "amount"],
};

function norm(s: string) {
  return s.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function findCol(headers: string[], key: keyof typeof HEADER_ALIASES) {
  const aliases = HEADER_ALIASES[key].map(norm);
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i] ?? "");
    if (aliases.some((a) => h === a || h.includes(a))) return i;
  }
  return -1;
}

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y.toString().padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // dd/mm/yyyy or dd-mm-yyyy
  const m1 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m1) {
    let [, d, mo, y] = m1;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // yyyy-mm-dd
  const m2 = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseAmount(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/[$\s]/g, "");
  // (123.45) → -123.45
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "");
  // remove thousand sep
  s = s.replace(/,/g, "");
  const n = Number(s);
  if (!isFinite(n)) return 0;
  return neg ? -n : n;
}

function rowsToMovimientos(rows: unknown[][]): ParsedMovimiento[] {
  if (!rows.length) return [];
  // find header row (first row with at least 'fecha' alias)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const headers = (rows[i] ?? []).map((c) => String(c ?? ""));
    if (findCol(headers, "fecha") >= 0) { headerIdx = i; break; }
  }
  const headers = (rows[headerIdx] ?? []).map((c) => String(c ?? ""));
  const colFecha = findCol(headers, "fecha");
  const colDesc = findCol(headers, "descripcion");
  const colRef = findCol(headers, "referencia");
  const colCargo = findCol(headers, "cargo");
  const colAbono = findCol(headers, "abono");
  const colSaldo = findCol(headers, "saldo");
  const colMonto = findCol(headers, "monto");

  if (colFecha < 0) return [];

  const out: ParsedMovimiento[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const fecha = parseDate(r[colFecha]);
    if (!fecha) continue;
    const desc = colDesc >= 0 ? String(r[colDesc] ?? "").trim() : "";
    const ref = colRef >= 0 ? (String(r[colRef] ?? "").trim() || null) : null;
    let cargo = colCargo >= 0 ? Math.abs(parseAmount(r[colCargo])) : 0;
    let abono = colAbono >= 0 ? Math.abs(parseAmount(r[colAbono])) : 0;
    if (cargo === 0 && abono === 0 && colMonto >= 0) {
      const m = parseAmount(r[colMonto]);
      if (m >= 0) abono = m; else cargo = Math.abs(m);
    }
    if (cargo === 0 && abono === 0) continue;
    const saldo = colSaldo >= 0 ? parseAmount(r[colSaldo]) : null;
    out.push({ fecha, descripcion: desc, referencia: ref, cargo, abono, saldo });
  }
  return out;
}

export async function parseBankFile(file: File): Promise<ParsedMovimiento[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    const text = await file.text();
    const res = Papa.parse<string[]>(text, { skipEmptyLines: true });
    return rowsToMovimientos(res.data as unknown[][]);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    return rowsToMovimientos(rows);
  }
  if (name.endsWith(".pdf")) {
    throw new Error("PDF: convierte el estado de cuenta a Excel/CSV antes de subirlo (la mayoría de bancos lo permiten desde su portal).");
  }
  throw new Error(`Formato no soportado: ${file.name}`);
}

/** Extrae todo el texto plano del archivo (encabezado + filas) para validar titularidad. */
export async function extractBankFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    return (await file.text()).slice(0, 200_000);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: false });
    const parts: string[] = [];
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
      for (const r of rows.slice(0, 80)) parts.push((r ?? []).map((c) => String(c ?? "")).join(" "));
    }
    return parts.join("\n");
  }
  return "";
}

function normalizeForMatch(s: string): string {
  return s.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Verifica que el estado de cuenta pertenezca al contribuyente activo.
 * Busca el RFC o palabras significativas de la razón social en el texto del archivo.
 */
export function bankFileMatchesContribuyente(
  text: string,
  cliente: { rfc: string; razon_social: string },
): { match: boolean; reason?: string } {
  if (!text || text.length < 5) {
    return { match: false, reason: "El archivo está vacío o no se pudo leer texto." };
  }
  const haystack = normalizeForMatch(text);
  const rfc = cliente.rfc.toUpperCase();
  if (haystack.includes(rfc.toLowerCase())) return { match: true };
  // Razón social: requiere al menos 2 palabras significativas (>3 letras) presentes
  const palabras = normalizeForMatch(cliente.razon_social)
    .split(" ")
    .filter((w) => w.length > 3 && !["sapi", "sade", "scvi", "sade", "cvde", "rldc"].includes(w));
  const hits = palabras.filter((w) => haystack.includes(w)).length;
  if (palabras.length > 0 && hits >= Math.min(2, palabras.length)) return { match: true };
  return {
    match: false,
    reason: `No se encontró el RFC ${rfc} ni la razón social "${cliente.razon_social}" dentro del estado de cuenta.`,
  };
}

