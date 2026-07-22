import * as XLSX from "xlsx";
import Papa from "papaparse";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

async function loadPdfjs(): Promise<any> {
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  return pdfjs;
}

async function ocrPdfPages(pdfjs: any, doc: any): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("spa+eng", 1, {
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
  });
  let text = "";
  try {
    const maxPages = Math.min(doc.numPages, 8);
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const { data } = await worker.recognize(canvas);
      text += data.text + "\n";
    }
  } finally {
    await worker.terminate();
  }
  return text;
}

/** Extrae texto de un PDF; si viene vacío (escaneado) hace OCR. */
async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const lines: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Agrupa items por coordenada Y para reconstruir renglones
    const items = (content.items as any[]).filter((it) => typeof it.str === "string");
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of items) {
      const y = Math.round((it.transform?.[5] ?? 0) * 2) / 2;
      const x = it.transform?.[4] ?? 0;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, s: it.str });
    }
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const line = rows.get(y)!.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ").replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
    }
  }
  const clean = lines.join("\n").trim();
  const hasRfc = /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/.test(clean);
  if (clean.length < 200 || !/\d/.test(clean) || !hasRfc && clean.length < 800) {
    try {
      const ocr = await ocrPdfPages(pdfjs, doc);
      if (ocr.trim().length > clean.length) return ocr;
    } catch (e) {
      console.warn("OCR PDF falló:", e);
    }
  }
  return clean;
}

const MESES_ES: Record<string, string> = {
  ene: "01", enero: "01",
  feb: "02", febrero: "02",
  mar: "03", marzo: "03",
  abr: "04", abril: "04",
  may: "05", mayo: "05",
  jun: "06", junio: "06",
  jul: "07", julio: "07",
  ago: "08", agosto: "08",
  sep: "09", sept: "09", septiembre: "09",
  oct: "10", octubre: "10",
  nov: "11", noviembre: "11",
  dic: "12", diciembre: "12",
};

/** Best-effort parser de movimientos a partir del texto de un PDF de estado de cuenta. */
function parsePdfMovimientos(text: string): ParsedMovimiento[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // Detecta año predominante del documento (para fechas tipo "15/MAR")
  const anioMatch = text.match(/\b(20\d{2})\b/);
  const defaultYear = anioMatch ? anioMatch[1] : String(new Date().getFullYear());

  const out: ParsedMovimiento[] = [];
  const dateRe = new RegExp(
    // dd/mm/yyyy | dd-mm-yyyy | dd/MES(/yyyy)? | dd MES yyyy
    "^(?:(\\d{1,2})[\\/\\-.](\\d{1,2})(?:[\\/\\-.](\\d{2,4}))?|(\\d{1,2})[\\/\\-.\\s]([A-Za-zÁÉÍÓÚáéíóú]{3,10})(?:[\\/\\-.\\s](\\d{2,4}))?)\\b",
  );
  const amountRe = /\(?-?\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)?/g;
  const firstAmountRe = /\(?-?\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)?/;

  // Muchos PDFs bancarios separan concepto, cargo/abono y saldo en líneas distintas.
  // Agrupamos desde una línea con fecha hasta antes de la siguiente fecha.
  const entries: string[] = [];
  let current = "";
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (dateRe.test(line)) {
      if (current) entries.push(current);
      current = line;
    } else if (current) {
      current += ` ${line}`;
    }
  }
  if (current) entries.push(current);

  for (const line of entries) {
    const dm = line.match(dateRe);
    if (!dm) continue;
    let fecha: string | null = null;
    if (dm[1]) {
      const d = dm[1].padStart(2, "0");
      const mo = dm[2].padStart(2, "0");
      const y = (dm[3] && dm[3].length === 4) ? dm[3] : dm[3] ? "20" + dm[3] : defaultYear;
      fecha = `${y}-${mo}-${d}`;
    } else if (dm[4] && dm[5]) {
      const d = dm[4].padStart(2, "0");
      const mo = MESES_ES[dm[5].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
      if (!mo) continue;
      const y = (dm[6] && dm[6].length === 4) ? dm[6] : dm[6] ? "20" + dm[6] : defaultYear;
      fecha = `${y}-${mo}-${d}`;
    }
    if (!fecha) continue;

    const amounts = line.match(amountRe);
    if (!amounts || amounts.length === 0) continue;
    // En PDFs mexicanos suelen aparecer: cargo, abono, saldo. Si no, toma monto + saldo.
    const nums = amounts.map((a) => parseAmount(a));
    let monto: number;
    let saldo: number | null = null;
    let forcedCargo: boolean | null = null;
    if (nums.length >= 2) {
      saldo = nums[nums.length - 1];
      if (nums.length >= 3) {
        const cargoCol = Math.abs(nums[nums.length - 3]);
        const abonoCol = Math.abs(nums[nums.length - 2]);
        if (cargoCol > 0 && abonoCol === 0) {
          monto = cargoCol;
          forcedCargo = true;
        } else if (abonoCol > 0 && cargoCol === 0) {
          monto = abonoCol;
          forcedCargo = false;
        } else {
          monto = nums[nums.length - 2] || nums[nums.length - 3];
        }
      } else {
        monto = nums[0];
      }
      saldo = nums[nums.length - 1];
    } else {
      monto = nums[0];
    }

    // Descripción = texto entre la fecha y el primer número
    const afterDate = line.slice(dm[0].length).trim();
    const firstAmountIdx = afterDate.search(firstAmountRe);
    const desc = (firstAmountIdx > 0 ? afterDate.slice(0, firstAmountIdx) : afterDate).trim();

    // Determina cargo/abono: si hay marca de retiro/cargo o signo, se toma como cargo.
    const isCargo = forcedCargo ?? (/(-\s*\$|\bretiro\b|\bcargo\b|\bcargos\b|\bdebito\b|\bdébito\b|\bpago\b|\btransferencia enviada\b|\bcompra\b|\bcomision\b|\bcomisión\b|\biva com\b|\bdisposicion\b|\bdisposición\b)/i.test(line) || monto < 0);
    const abs = Math.abs(monto);
    if (abs === 0) continue;
    out.push({
      fecha,
      descripcion: desc || "(sin descripción)",
      referencia: null,
      cargo: isCargo ? abs : 0,
      abono: isCargo ? 0 : abs,
      saldo,
    });
  }
  return out;
}

export type ParsedMovimiento = {
  fecha: string; // ISO date YYYY-MM-DD
  descripcion: string;
  referencia: string | null;
  cargo: number;
  abono: number;
  saldo: number | null;
};

export type ParsedBankFileResult = {
  movimientos: ParsedMovimiento[];
  text: string;
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
  let s = String(v).trim().replace(/[+$\s]/g, "");
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

export async function parseBankFileWithText(file: File): Promise<ParsedBankFileResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    const text = await file.text();
    const res = Papa.parse<string[]>(text, { skipEmptyLines: true });
    return { movimientos: rowsToMovimientos(res.data as unknown[][]), text: text.slice(0, 200_000) };
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    const text = rows.slice(0, 80).map((r) => (r ?? []).map((c) => String(c ?? "")).join(" ")).join("\n");
    return { movimientos: rowsToMovimientos(rows), text };
  }
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const text = await extractPdfText(file);
    const rows = parsePdfMovimientos(text);
    if (rows.length === 0) {
      throw new Error(
        "No pudimos detectar movimientos en el PDF. Descarga el estado de cuenta en formato CSV o Excel (.xlsx) desde tu banca en línea para una lectura más precisa.",
      );
    }
    return { movimientos: rows, text: text.slice(0, 200_000) };
  }
  throw new Error(`Formato no soportado: ${file.name}`);
}

export async function parseBankFile(file: File): Promise<ParsedMovimiento[]> {
  return (await parseBankFileWithText(file)).movimientos;
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
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    try {
      const text = await extractPdfText(file);
      return text.slice(0, 200_000);
    } catch (e) {
      console.warn("extractPdfText falló:", e);
      return "";
    }
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

