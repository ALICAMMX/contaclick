import * as XLSX from "xlsx";
import Papa from "papaparse";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { leerPdfBancario } from "@/lib/conciliacion/bancos/registry";
import type { ElementoPdf, ResultadoAdaptador } from "@/lib/conciliacion/bancos/tipos";

export type DeteccionBancaria = ResultadoAdaptador & { puntaje_deteccion: number };


const MAX_BANK_DESCRIPTION_LENGTH = 450;
const MAX_BANK_REFERENCE_LENGTH = 120;

function normalizeBankDescription(value: unknown): string {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (text || "(sin descripción)").slice(0, MAX_BANK_DESCRIPTION_LENGTH);
}

function normalizeBankReference(value: unknown): string | null {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, MAX_BANK_REFERENCE_LENGTH) : null;
}

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

/**
 * Extracción POSICIONAL: conserva página, texto, X, Y, ancho y alto de cada
 * elemento. Aplanar el PDF a texto pierde la columna (cargo/abono/saldo) y es
 * la causa de que un retiro se registrara como depósito.
 */
async function extractPdfElementos(
  file: File,
): Promise<{ elementos: ElementoPdf[]; texto: string; escaneado: boolean }> {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const elementos: ElementoPdf[] = [];
  const lines: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = (content.items as any[]).filter((it) => typeof it.str === "string" && it.str.trim());
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of items) {
      const y = it.transform?.[5] ?? 0;
      const x = it.transform?.[4] ?? 0;
      elementos.push({
        pagina: i,
        texto: it.str,
        x,
        y,
        ancho: Number(it.width) || it.str.length * 5,
        alto: Number(it.height) || 8,
      });
      const yk = Math.round(y * 2) / 2;
      if (!rows.has(yk)) rows.set(yk, []);
      rows.get(yk)!.push({ x, s: it.str });
    }
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const line = rows.get(y)!.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ").replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
    }
  }
  const clean = lines.join("\n").trim();
  const hasRfc = /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/.test(clean);
  if (clean.length < 200 || !/\d/.test(clean) || (!hasRfc && clean.length < 800)) {
    try {
      const ocr = await ocrPdfPages(pdfjs, doc);
      // El OCR sólo sirve para previsualizar/validar titularidad: sin coordenadas
      // fiables, ningún movimiento puede importarse automáticamente.
      if (ocr.trim().length > clean.length) return { elementos: [], texto: ocr, escaneado: true };
    } catch (e) {
      console.warn("OCR PDF falló:", e);
    }
  }
  return { elementos, texto: clean, escaneado: false };
}

/** Extrae texto de un PDF; si viene vacío (escaneado) hace OCR. */
async function extractPdfText(file: File): Promise<string> {
  return (await extractPdfElementos(file)).texto;
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

/**
 * Expande un año de dos dígitos sólo si es plausible.
 * Los estados de cuenta mexicanos repiten la fecha (p. ej. "31/DIC 31/DIC"
 * = operación y liquidación); ese segundo "31" es un DÍA, no un año. Sin este
 * candado se registraba 2031-12-31. Ante la duda mandan las fechas del documento.
 */
function anioPlausible(token: string | undefined, defaultYear: string): string {
  if (!token) return defaultYear;
  const base = Number(defaultYear);
  const candidato = token.length === 4 ? Number(token) : 2000 + Number(token);
  if (!Number.isFinite(candidato)) return defaultYear;
  // Un estado de cuenta no cubre años lejanos al del propio documento: ni 2002
  // ni 2030/2031 son años válidos en un estado de 2026. Ese "31" es un DÍA
  // (BBVA imprime operación y liquidación: "31/DIC 31/DIC").
  if (candidato < base - 1 || candidato > base + 1) return defaultYear;
  return String(candidato);
}


/** Best-effort parser de movimientos a partir del texto de un PDF de estado de cuenta. */
export function parsePdfMovimientos(text: string): ParsedMovimiento[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // Detecta año predominante del documento (para fechas tipo "15/MAR")
  const anioMatch = text.match(/\b(20\d{2})\b/);
  const defaultYear = anioMatch ? anioMatch[1] : String(new Date().getFullYear());


  const out: ParsedMovimiento[] = [];
  const dateRe = new RegExp(
    // dd/mm/yyyy | dd-mm-yyyy | dd/MES(/yyyy)? | dd MES yyyy
    "^(?:(\\d{1,2})[\\/\\-.](\\d{1,2})(?:[\\/\\-.](\\d{2,4}))?|(\\d{1,2})[\\/\\-.\\s]([A-Za-zÁÉÍÓÚáéíóú]{3,10})(?:[\\/\\-.\\s](20\\d{2}|\\d{2})(?![\\/\\-.][A-Za-zÁÉÍÓÚáéíóú]))?)\\b",
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

  type PendingMovimiento = ParsedMovimiento & { direccion: "cargo" | "abono" | null; monto: number; source: string };
  const pending: PendingMovimiento[] = [];
  for (const line of entries) {
    const dm = line.match(dateRe);
    if (!dm) continue;
    let fecha: string | null = null;
    if (dm[1]) {
      const d = dm[1].padStart(2, "0");
      const mo = dm[2].padStart(2, "0");
      const y = anioPlausible(dm[3], defaultYear);
      fecha = `${y}-${mo}-${d}`;
    } else if (dm[4] && dm[5]) {
      const d = dm[4].padStart(2, "0");
      const mo = MESES_ES[dm[5].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
      if (!mo) continue;
      const y = anioPlausible(dm[6], defaultYear);
      fecha = `${y}-${mo}-${d}`;
    }
    if (!fecha || !isValidIsoDate(fecha)) continue;

    const amounts = line.match(amountRe);
    if (!amounts || amounts.length === 0) continue;
    // En PDFs mexicanos suelen aparecer: cargo, abono, saldo. Si no, toma monto + saldo.
    const nums = amounts.map((a) => parseAmount(a));
    let monto: number;
    let saldo: number | null = null;
    let direccion: "cargo" | "abono" | null = null;
    if (nums.length >= 2) {
      saldo = nums[nums.length - 1];
      if (nums.length >= 3) {
        const cargoCol = Math.abs(nums[nums.length - 3]);
        const abonoCol = Math.abs(nums[nums.length - 2]);
        if (cargoCol > 0 && abonoCol === 0) {
          monto = cargoCol;
          direccion = "cargo";
        } else if (abonoCol > 0 && cargoCol === 0) {
          monto = abonoCol;
          direccion = "abono";
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
    // BBVA imprime fecha de operación y liquidación (p. ej. 02/ENE 02/ENE).
    // La segunda fecha no es un año ni forma parte del concepto.
    const afterDate = line.slice(dm[0].length).trim().replace(
      /^\d{1,2}[\/\-.](?:\d{1,2}|[A-Za-zÁÉÍÓÚáéíóú]{3,10})(?:[\/\-.](?:20\d{2}|\d{2}))?\s+/,
      "",
    );
    const firstAmountIdx = afterDate.search(firstAmountRe);
    const desc = (firstAmountIdx > 0 ? afterDate.slice(0, firstAmountIdx) : afterDate).trim();

    const cargoExplicito = /(-\s*\$|\bretiro\b|\bcargo(?:s)?\b|\bd[eé]bito\b|\bpago\b|\bspei\s+enviado\b|\btransferencia\s+enviada\b|\bcompra\b|\bcomisi[oó]n\b|\biva\s+com\b|\bdisposici[oó]n\b|\bmerpago\b)/i.test(line) || monto < 0;
    const abonoExplicito = /\babono(?:s)?\b|\bdep[oó]sito(?:s)?\b|\bspei\s+recibido\b|\btransferencia\s+recibida\b|\bn[oó]mina\b|\binter[eé]s\s+(?:pagado|abonado)\b/i.test(line);
    if (direccion === null) {
      if (cargoExplicito && !abonoExplicito) direccion = "cargo";
      else if (abonoExplicito && !cargoExplicito) direccion = "abono";
    }
    const abs = Math.abs(monto);
    if (abs === 0) continue;
    pending.push({
      fecha,
      descripcion: normalizeBankDescription(desc),
      referencia: null,
      cargo: 0,
      abono: 0,
      saldo,
      direccion,
      monto: abs,
      source: line,
    });
  }

  // Cuando el PDF no conserva columnas, el cambio de saldo es la evidencia
  // más confiable. Se usa según el orden cronológico visual del estado.
  const ascending = pending.length < 2 || pending[0].fecha <= pending[pending.length - 1].fecha;
  for (let i = 0; i < pending.length; i++) {
    const row = pending[i];
    const neighbor = ascending ? pending[i - 1] : pending[i + 1];
    // El vecino puede no existir (primera/última fila) o no traer saldo.
    if (row.saldo != null && neighbor != null && neighbor.saldo != null) {
      const delta = row.saldo - neighbor.saldo;
      if (Math.abs(Math.abs(delta) - row.monto) <= 0.02 && Math.abs(delta) > 0.001) {
        row.direccion = delta < 0 ? "cargo" : "abono";
      }
    }
  }


  const ambiguos = pending.filter((row) => row.direccion === null);
  if (ambiguos.length > 0) {
    throw new Error(
      `El PDF contiene ${ambiguos.length} movimiento(s) cuyo cargo o depósito no puede determinarse con seguridad. ` +
      "No se importó nada para evitar descuadres. Descarga el estado de cuenta en CSV o Excel desde tu banca en línea.",
    );
  }

  for (const row of pending) {
    const isCargo = row.direccion === "cargo";
    out.push({
      fecha: row.fecha,
      descripcion: row.descripcion,
      referencia: row.referencia,
      cargo: isCargo ? row.monto : 0,
      abono: isCargo ? 0 : row.monto,
      saldo: row.saldo,
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
  /** Trazabilidad del adaptador bancario cuando el PDF fue leído por columnas. */
  deteccion?: DeteccionBancaria;
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

function isValidIsoDate(iso: string): boolean {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 1900 || y > 2999) return false;
  if (mo < 1 || mo > 12) return false;
  const lastDay = new Date(y, mo, 0).getDate();
  return d >= 1 && d <= lastDay;
}

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      const iso = `${d.y.toString().padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
      return isValidIsoDate(iso) ? iso : null;
    }
  }
  const s = String(v).trim();
  // dd/mm/yyyy or dd-mm-yyyy
  const m1 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m1) {
    let [, d, mo, y] = m1;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  // yyyy-mm-dd
  const m2 = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m2) {
    const iso = `${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const iso = d.toISOString().slice(0, 10);
    return isValidIsoDate(iso) ? iso : null;
  }
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
    const desc = colDesc >= 0 ? normalizeBankDescription(r[colDesc]) : "(sin descripción)";
    const ref = colRef >= 0 ? normalizeBankReference(r[colRef]) : null;
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
    const { elementos, texto, escaneado } = await extractPdfElementos(file);
    const text = texto.slice(0, 200_000);

    // 1) Adaptador bancario con lectura posicional (columna = sentido).
    if (!escaneado && elementos.length) {
      const deteccion = leerPdfBancario(elementos);
      if (deteccion.adaptador !== "generico") {
        if (deteccion.auto) {
          return {
            movimientos: deteccion.movimientos.map((m) => ({
              fecha: m.fecha,
              descripcion: m.descripcion,
              referencia: m.referencia,
              cargo: m.cargo,
              abono: m.abono,
              saldo: m.saldo,
            })),
            text,
            deteccion,
          };
        }
        // Formato reconocido pero con filas dudosas: no se importa nada y se
        // muestran únicamente las filas problemáticas con su motivo.
        const detalle = deteccion.problemas
          .slice(0, 6)
          .map((p) => (p.fila_visual ? `· Fila ${p.fila_visual} (pág. ${p.pagina}): ${p.motivo}` : `· ${p.motivo}`))
          .join("\n");
        throw new Error(
          `El estado de cuenta ${deteccion.banco} no pudo comprobarse por completo (${deteccion.problemas.length} punto(s) a revisar). No se importó nada.\n${detalle}`,
        );
      }

      // Un PDF que se identifica claramente como BBVA nunca debe volver al
      // parser lineal: sin columnas demostrables se bloquea con diagnóstico,
      // en lugar de intentar inferir cargo/abono por el texto.
      if (/\b(?:BBVA|BANCOMER)\b/i.test(text)) {
        throw new Error(
          "El estado de cuenta BBVA fue reconocido, pero este formato no expone columnas verificables de cargos, abonos y saldo. No se importó nada. Descárgalo en CSV o Excel desde tu banca en línea.",
        );
      }
    }

    // 2) Fallback genérico: sigue fallando cerrado ante cualquier ambigüedad.
    if (escaneado) {
      throw new Error(
        "El PDF está escaneado: ContaClick no puede comprobar columnas ni saldos, así que no lo importa automáticamente. Descarga el estado de cuenta en CSV o Excel desde tu banca en línea.",
      );
    }
    const rows = parsePdfMovimientos(texto);
    if (rows.length === 0) {
      throw new Error(
        "No pudimos detectar movimientos en el PDF. Descarga el estado de cuenta en formato CSV o Excel (.xlsx) desde tu banca en línea para una lectura más precisa.",
      );
    }
    return { movimientos: rows, text };
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
  // Versión compacta (sin separadores) para tolerar RFC impresos como "TOGL790615-PW3"
  const compact = haystack.replace(/\s+/g, "");
  const rfc = cliente.rfc.toUpperCase().replace(/[^A-Z0-9Ñ&]/g, "");
  const rfcLower = rfc.toLowerCase();
  if (haystack.includes(rfcLower) || compact.includes(rfcLower)) return { match: true };
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

