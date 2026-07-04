import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { FileBadge, Upload, Save, CheckCircle2, AlertTriangle, Eye, FolderOpen, UserPlus, Truck, Receipt, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ToolShell } from "@/components/ToolShell";
import { useActiveCliente } from "@/lib/active-cliente";
import { saveToolRun } from "@/lib/tool-runs.functions";
import { listRfcsVinculados, upsertClienteFromCsf } from "@/lib/clientes.functions";


export const Route = createFileRoute("/app/tools/csf-parser")({
  component: CsfParser,
});

type CsfData = {
  rfc?: string;
  curp?: string;
  nombre?: string;
  tipoPersona?: "Física" | "Moral";
  regimenes: string[];
  obligaciones: string[];
  domicilio?: string;
  codigoPostal?: string;
  fechaInicioOperaciones?: string;
  estatus?: string;
  fechaUltimoCambio?: string;
  fechaEmision?: string;
  rawTextSample?: string;
  warnings: string[];
};

// Reconstruye el texto de una página respetando líneas (Y) y orden de lectura (X).
// En CSF del SAT muchos valores están a la derecha de su etiqueta en el mismo renglón;
// por eso NO separamos columnas: hacerlo deja etiquetas y valores en bloques distintos.
function reconstructPageText(items: any[]): string {
  if (!items?.length) return "";
  const rows = items
    .filter((it) => typeof it?.str === "string" && it.str.length > 0 && it.transform)
    .map((it) => ({ x: it.transform[4] as number, y: it.transform[5] as number, w: (it.width as number) || 0, s: it.str as string }));
  if (!rows.length) return "";

  // Agrupa por Y (tolerancia ±3pt)
  const lines: { y: number; items: typeof rows }[] = [];
  for (const r of rows) {
    const line = lines.find((l) => Math.abs(l.y - r.y) < 3);
    if (line) line.items.push(r);
    else lines.push({ y: r.y, items: [r] });
  }
  lines.sort((a, b) => b.y - a.y); // top -> bottom

  const out: string[] = [];
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    // Une con espacio; añade doble espacio cuando hay gap grande (etiqueta/valor)
    let lineStr = "";
    for (let i = 0; i < l.items.length; i++) {
      const cur = l.items[i];
      if (i === 0) lineStr = cur.s;
      else {
        const prev = l.items[i - 1];
        const gap = cur.x - (prev.x + prev.w);
        lineStr += gap > 8 ? "  " + cur.s : (cur.s.startsWith(" ") || lineStr.endsWith(" ") ? cur.s : " " + cur.s);
      }
    }
    out.push(lineStr.trim());
  }
  return out.filter(Boolean).join("\n");
}

async function loadPdfjs(): Promise<any> {
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  return pdfjs;
}

// OCR fallback for scanned CSF: renders each PDF page to canvas and runs Tesseract (spa+eng)
async function ocrPdf(pdfjs: any, doc: any, onProgress?: (msg: string) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("spa+eng", 1, {
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
  });
  let text = "";
  try {
    const maxPages = Math.min(doc.numPages, 3); // CSF suele ser 1-2 páginas
    for (let i = 1; i <= maxPages; i++) {
      onProgress?.(`OCR página ${i} de ${maxPages}…`);
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

// Devuelve texto extraído. Si el PDF no tiene capa de texto útil, cae a OCR.
async function extractPdfText(file: File, onProgress?: (msg: string) => void): Promise<string> {
  try {
    const pdfjs = await loadPdfjs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += reconstructPageText(content.items) + "\n";
    }
    // Heurística: si el texto extraído es muy corto o no contiene un RFC candidato,
    // el PDF probablemente es escaneado -> intentar OCR.
    const clean = text.replace(/\s+/g, " ").trim();
    const hasRfc = /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/.test(clean);
    if (clean.length < 200 || !hasRfc) {
      onProgress?.("PDF sin texto — iniciando OCR (puede tardar 10-30s)…");
      try {
        const ocrText = await ocrPdf(pdfjs, doc, onProgress);
        if (ocrText.replace(/\s+/g, " ").trim().length > clean.length) return ocrText;
      } catch (e) {
        console.warn("OCR fallback falló:", e);
      }
    }
    return text;
  } catch {
    const buf = await file.arrayBuffer();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    return decoder.decode(buf).replace(/[^\x20-\x7EáéíóúÁÉÍÓÚñÑüÜ\n]/g, " ");
  }
}

const FIELD_STOP_RE = /^\s*(?:RFC\b|CURP\b|Nombre\s*\(?s\)?\b|Primer\s+Apellido\b|Segundo\s+Apellido\b|Denominaci[oó]n\b|Raz[oó]n\s+Social\b|R[ée]gimen\b|Fecha\b|Estatus\b|Nombre\s+Comercial\b|Domicilio\b|Actividades\b|Obligaciones\b|C[oó]digo\s+Postal\b|Tipo\s+de\s+Vialidad\b|Nombre\s+de\s+(?:la\s+)?(?:Vialidad|Colonia|Localidad|Entidad)\b|Nombre\s+del?\s+Municipio\b|N[uú]mero\s+(?:Exterior|Interior)\b|Entre\s+Calle\b|Y\s+Calle\b|Correo\b|Tel[eé]fono\b|Datos\s+de\b|C[eé]dula\b|CONSTANCIA\b)/i;

function cleanExtractedValue(value: string): string {
  return value
    .replace(/^[\s:;\-–—]+/, "")
    .replace(/\s+(?:Primer\s+Apellido|Segundo\s+Apellido|RFC|CURP|R[ée]gimen\s+(?:Capital|Fiscal)|Fecha\s+(?:de\s+)?(?:inicio|[úu]ltimo|emisi[oó]n)|Estatus|Nombre\s+Comercial|Domicilio|Actividades|Obligaciones|Datos\s+de\b|Lugar\s+y\s+Fecha)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/[,;:.\-–—\s]+$/, "")
    .trim();
}

function hasUsefulLetters(value: string): boolean {
  return /[A-ZÁÉÍÓÚÑ&]{2,}/i.test(value) && !/^(?:RFC|CURP|FECHA|ESTATUS|R[ÉE]GIMEN|DATOS|CONSTANCIA)$/i.test(value.trim());
}

function getLabelValue(lines: string[], labels: RegExp[], maxFollowingLines = 2): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (!line) continue;
    for (const label of labels) {
      const m = line.match(label);
      if (!m) continue;

      const inline = cleanExtractedValue(line.slice((m.index ?? 0) + m[0].length));
      if (inline && hasUsefulLetters(inline) && !FIELD_STOP_RE.test(inline)) return inline;

      const pieces: string[] = [];
      for (let j = i + 1; j < lines.length && pieces.length < maxFollowingLines; j++) {
        const next = lines[j]?.trim() ?? "";
        if (!next) continue;
        if (FIELD_STOP_RE.test(next)) break;
        if (/^(?:SAT|Servicio\s+de\s+Administraci[oó]n|CONSTANCIA|C[eé]dula|Lugar\s+y\s+Fecha|VALIDA\s+TU)/i.test(next)) continue;
        pieces.push(next);
      }
      const fromNextLines = cleanExtractedValue(pieces.join(" "));
      if (fromNextLines && hasUsefulLetters(fromNextLines)) return fromNextLines;
    }
  }
  return undefined;
}

function findCurp(text: string): string | undefined {
  const flat = text.replace(/\s+/g, " ").toUpperCase();
  const direct = flat.match(/\b(?:CURP[:\s]*)?([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\b/);
  if (direct) return direct[1];
  for (const line of text.split(/\r?\n/)) {
    const compact = line.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const m = compact.match(/[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/);
    if (m) return m[0];
  }
  return undefined;
}

function findBestRfc(text: string, curp?: string): string | undefined {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidates: { rfc: string; score: number }[] = [];
  const add = (raw: string | undefined, score: number) => {
    if (!raw) return;
    const rfc = raw.toUpperCase().replace(/[^A-ZÑ&0-9]/g, "");
    if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) return;
    // Evita confundir los primeros 13 caracteres de la CURP con el RFC, salvo si venía de una línea etiquetada como RFC.
    if (curp && rfc === curp.slice(0, 13) && score < 50) return;
    candidates.push({ rfc, score });
  };

  const flat = text.replace(/\s+/g, " ").toUpperCase();
  for (const m of flat.matchAll(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/g)) add(m[1], 20);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const labelled = /\b(?:RFC|Registro\s+Federal\s+de\s+Contribuyentes)\b/i.test(line);
    const valuePart = labelled
      ? line.replace(/^.*?\b(?:RFC|Registro\s+Federal\s+de\s+Contribuyentes)\b\s*[:\-–—]?\s*/i, "")
      : line;
    const compact = valuePart.toUpperCase().replace(/[^A-ZÑ&0-9]/g, "");
    for (const m of compact.matchAll(/[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}/g)) add(m[0], labelled ? 100 : 10);
    if (labelled) {
      add(lines[i + 1], 90);
      add(lines[i + 2], 70);
    }
  }

  return candidates.sort((a, b) => b.score - a.score)[0]?.rfc;
}

function parseCsf(text: string): CsfData {
  // Preserve newlines; collapse only multiple spaces
  const t = text.replace(/[ \t\f\v]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  const flat = t.replace(/\s+/g, " ");
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: CsfData = { regimenes: [], obligaciones: [], rawTextSample: t.slice(0, 4000), warnings: [] };

  // CURP (sólo Persona Física). Acepta etiqueta pegada al valor: "CURPABCD..."
  out.curp = findCurp(t);

  // RFC. Soporta líneas separadas como "RFC:" + valor en el renglón siguiente y texto con espacios entre caracteres.
  out.rfc = findBestRfc(t, out.curp);

  // Tipo de persona: PM si RFC tiene 3 letras iniciales, PF si tiene 4
  if (out.rfc) {
    const letras = out.rfc.match(/^[A-ZÑ&]+/)?.[0].length ?? 0;
    out.tipoPersona = letras === 3 ? "Moral" : "Física";
  }

  // Nombre / Razón social
  // PM: "Denominación/Razón Social", "Denominación o Razón Social" o "Nombre, denominación o razón social".
  out.nombre = getLabelValue(lines, [
    /(?:Nombre,?\s*)?Denominaci[oó]n\s*\/?\s*(?:o\s*)?Raz[oó]n\s+Social\s*:?/i,
    /Nombre,?\s*denominaci[oó]n\s*o\s*raz[oó]n\s+social\s*:?/i,
  ], 3);

  if (!out.nombre) {
    const razonPM = flat.match(/(?:Nombre,?\s*)?Denominaci[oó]n\s*\/?\s*(?:o\s*)?Raz[oó]n\s+Social[:\s]+([A-ZÁÉÍÓÚÑ0-9&.,\-\s]{3,160}?)\s+(?:R[ée]gimen|RFC|CURP|Fecha|Nombre\s+Comercial|Estatus|Domicilio|Actividades|Obligaciones)/i);
    if (razonPM) out.nombre = cleanExtractedValue(razonPM[1]);
  }

  // PF: "Nombre(s): X  Primer Apellido: Y  Segundo Apellido: Z"
  if (!out.nombre) {
    const nombre = getLabelValue(lines, [/Nombre\s*\(?s\)?\s*:?/i], 2);
    const primerApellido = getLabelValue(lines, [/Primer\s+Apellido\s*:?/i], 1);
    const segundoApellido = getLabelValue(lines, [/Segundo\s+Apellido\s*:?/i], 1);
    if (nombre && primerApellido) {
      out.nombre = [nombre, primerApellido, segundoApellido].map(s => s?.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
    }
  }

  if (!out.nombre) {
    const n = flat.match(/Nombre\s*\(?s\)?\s*:?\s*([A-ZÁÉÍÓÚÑ\s]{2,80}?)\s+Primer\s+Apellido[:\s]+([A-ZÁÉÍÓÚÑ\s]{2,50}?)\s+Segundo\s+Apellido[:\s]*([A-ZÁÉÍÓÚÑ\s]{0,50}?)\s+(?:Fecha|CURP|RFC|R[ée]gimen|Estatus|Domicilio)/i);
    if (n) out.nombre = [n[1], n[2], n[3]].map(s => s.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
  }

  // Validar nombre: no bloquear dígitos porque muchas razones sociales legítimas los contienen.
  if (out.nombre) {
    out.nombre = cleanExtractedValue(out.nombre);
    const bad = /VALIDA\s+TU|CONSTANCIA\s+DE\s+SITUACI[OÓ]N|INFORMACI[OÓ]N\s+FISCAL|Lugar\s+y\s+Fecha|C[eé]dula\s+de\s+Identificaci[oó]n|Servicio\s+de\s+Administraci[oó]n/i;
    if (bad.test(out.nombre) || !hasUsefulLetters(out.nombre) || out.nombre.length < 3) {
      out.warnings.push("No se pudo identificar con certeza el nombre o razón social (formato de CSF no reconocido).");
      out.nombre = undefined;
    }
  } else {
    out.warnings.push("No se detectó nombre o razón social.");
  }

  // Fecha de inicio de operaciones (varios formatos)
  const fIni = flat.match(/Fecha\s+(?:de\s+)?inicio\s+de\s+operaciones[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóú]+\s+de\s+\d{4})/i);
  if (fIni) out.fechaInicioOperaciones = fIni[1].trim();
  else out.warnings.push("No se detectó la fecha de inicio de operaciones.");

  // Estatus
  const estatus = flat.match(/Estatus\s+(?:en\s+el\s+padr[oó]n|del\s+contribuyente)[:\s]+([A-Za-zÁÉÍÓÚáéíóúñÑ ]{3,30})/i);
  if (estatus) out.estatus = estatus[1].trim().replace(/\s+(?:Fecha|R[ée]gimen|Nombre).*$/i, "");

  // Fecha de último cambio
  const ultimo = flat.match(/Fecha\s+de\s+[úu]ltimo\s+cambio[^:]*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóú]+\s+de\s+\d{4})/i);
  if (ultimo) out.fechaUltimoCambio = ultimo[1].trim();

  // Fecha de emisión: "Lugar y Fecha de Emisión ... DD DE MES DE AAAA"
  const emision = flat.match(/Lugar\s+y\s+Fecha\s+de\s+Emisi[oó]n[^A-Z0-9]*?(\d{1,2}\s+DE\s+[A-ZÁÉÍÓÚ]+\s+DE\s+\d{4})/i);
  if (emision) out.fechaEmision = emision[1].trim();

  // Regímenes conocidos
  const regList = [
    "Régimen Simplificado de Confianza",
    "Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios",
    "Régimen de Actividades Empresariales y Profesionales",
    "Régimen de Incorporación Fiscal",
    "Régimen de Arrendamiento",
    "Régimen General de Ley Personas Morales",
    "Régimen de las Personas Morales con Fines no Lucrativos",
    "Régimen de Plataformas Tecnológicas",
    "Régimen de los Ingresos por Dividendos",
    "Régimen de los Ingresos por Intereses",
    "Régimen de los demás ingresos",
    "Régimen de Enajenación o Adquisición de Bienes",
  ];
  for (const r of regList) {
    if (new RegExp(r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(flat)) out.regimenes.push(r);
  }
  if (!out.regimenes.length) out.warnings.push("No se detectaron regímenes fiscales.");

  // Obligaciones
  const obs = flat.match(/(Declaraci[oó]n[^.;]+?(mensual|anual|provisional|bimestral)[^.;]*?)[.;]/gi);
  if (obs) out.obligaciones = Array.from(new Set(obs.map((s) => s.replace(/[.;]$/, "").trim()))).slice(0, 10);
  if (!out.obligaciones.length) out.warnings.push("No se detectaron obligaciones declaradas.");

  // ---- Domicilio fiscal ----
  // Estrategia 1: extraer campos individuales típicos de la CSF y componer
  const grab = (label: RegExp): string | undefined => {
    const m = flat.match(label);
    if (!m) return undefined;
    return m[1].replace(/\s+/g, " ").trim().replace(/[,;.]+$/, "");
  };
  const stop = "(?=\\s+(?:C[oó]digo\\s+Postal|Tipo\\s+de\\s+Vialidad|Nombre\\s+de\\s+(?:la\\s+)?(?:Vialidad|Colonia|Localidad|Municipio|Demarcaci[oó]n|Entidad)|N[uú]mero\\s+(?:Exterior|Interior)|Entre\\s+Calle|Y\\s+Calle|Correo|Tel[eé]fono|Actividades|Reg[ií]menes?|Obligaciones|Fecha|$))";
  const cpField   = grab(new RegExp(`C[oó]digo\\s+Postal[:\\s-]*?(\\d{5})`, "i"));
  const vialTipo  = grab(new RegExp(`Tipo\\s+de\\s+Vialidad[:\\s-]*([A-ZÁÉÍÓÚÑ ]{2,40}?)${stop}`, "i"));
  const vialNom   = grab(new RegExp(`Nombre\\s+de\\s+(?:la\\s+)?Vialidad[:\\s-]*([A-Z0-9ÁÉÍÓÚÑ \\.\\-#&]{2,80}?)${stop}`, "i"));
  const numExt    = grab(new RegExp(`N[uú]mero\\s+Exterior[:\\s-]*([A-Z0-9\\-\\/]{1,15}?)${stop}`, "i"));
  const numInt    = grab(new RegExp(`N[uú]mero\\s+Interior[:\\s-]*([A-Z0-9\\-\\/]{1,15}?)${stop}`, "i"));
  const colonia   = grab(new RegExp(`Nombre\\s+de\\s+la\\s+Colonia[:\\s-]*([A-Z0-9ÁÉÍÓÚÑ \\.\\-#&]{2,80}?)${stop}`, "i"));
  const localidad = grab(new RegExp(`Nombre\\s+de\\s+la\\s+Localidad[:\\s-]*([A-Z0-9ÁÉÍÓÚÑ \\.\\-#&]{2,80}?)${stop}`, "i"));
  const municipio = grab(new RegExp(`Nombre\\s+del?\\s+Municipio(?:\\s+o\\s+Demarcaci[oó]n\\s+Territorial)?[:\\s-]*([A-Z0-9ÁÉÍÓÚÑ \\.\\-#&]{2,80}?)${stop}`, "i"));
  const entidad   = grab(new RegExp(`Nombre\\s+de\\s+la\\s+Entidad\\s+Federativa[:\\s-]*([A-Z0-9ÁÉÍÓÚÑ \\.\\-#&]{2,80}?)${stop}`, "i"));

  if (cpField) out.codigoPostal = cpField;

  const partes = [
    [vialTipo, vialNom].filter(Boolean).join(" "),
    numExt ? `No. Ext. ${numExt}` : "",
    numInt ? `Int. ${numInt}` : "",
    colonia ? `Col. ${colonia}` : "",
    localidad,
    municipio,
    entidad,
    out.codigoPostal ? `C.P. ${out.codigoPostal}` : "",
  ].map(s => (s ?? "").trim()).filter(Boolean);

  if (partes.length >= 2) {
    out.domicilio = partes.join(", ");
  } else {
    // Estrategia 2: bloque corrido tras "Domicilio Fiscal/Registrado"
    const dom = flat.match(/Domicilio\s+(?:Fiscal|Registrado|del\s+Contribuyente)?[:\s-]+([A-Z0-9ÁÉÍÓÚÑ ,\.\-#°ºªN()\/]+?)\s+(?:Actividades|Reg[ií]menes?|Obligaciones|Fecha|Correo|Tel[eé]fono)/i);
    if (dom) out.domicilio = dom[1].replace(/\s+/g, " ").trim();
  }

  if (!out.domicilio) out.warnings.push("No se detectó el domicilio fiscal.");

  // Fallback CP: "C.P. 12345" en cualquier parte
  if (!out.codigoPostal) {
    const cp = flat.match(/\bC\.?\s*P\.?\s*[:\s]*(\d{5})\b/i);
    if (cp) out.codigoPostal = cp[1];
  }

  return out;
}

// Convierte "02 DE ABRIL DE 2026" o "02/04/2026" a "YYYY-MM-DD"
function toIsoDate(s?: string): string | null {
  if (!s) return null;
  const meses: Record<string, string> = {
    enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
    julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
  };
  const m1 = s.match(/(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+de\s+(\d{4})/i);
  if (m1) {
    const mes = meses[m1[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
    if (mes) return `${m1[3]}-${mes}-${m1[1].padStart(2, "0")}`;
  }
  const m2 = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m2) {
    const yyyy = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
    return `${yyyy}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  }
  const m3 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m3) return s;
  return null;
}

type UpsertResult = { accion: "creado" | "actualizado"; cliente: { id: string; razon_social: string; rfc: string }; diferencias: string[]; tipo_relacion: "cliente" | "proveedor" | "acreedor" };

const RELACION_LABEL: Record<UpsertResult["tipo_relacion"], string> = {
  cliente: "cliente",
  proveedor: "proveedor vinculado",
  acreedor: "acreedor vinculado",
};

function CsfParser() {
  const { cliente } = useActiveCliente();
  const [data, setData] = useState<CsfData | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [result, setResult] = useState<UpsertResult | null>(null);
  const [acting, setActing] = useState<null | "cliente" | "proveedor" | "acreedor">(null);
  const save = useServerFn(saveToolRun);
  const upsert = useServerFn(upsertClienteFromCsf);
  const listRfcs = useServerFn(listRfcsVinculados);
  const permisos = useQuery({ queryKey: ["rfcs-vinculados", "permisos"], queryFn: () => listRfcs(), staleTime: 60_000 });
  const canManageExpedientes = !!permisos.data?.canManageExpedientes;

  const onFile = async (file: File) => {
    setFileName(file.name);
    setBusy(true);
    setProgress("Leyendo PDF…");
    setResult(null);
    try {
      const text = await extractPdfText(file, (msg) => setProgress(msg));
      setData(parseCsf(text));
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo leer el PDF");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const onUpsert = async (tipo: "cliente" | "proveedor" | "acreedor") => {
    if (!data) return;
    if (!data.rfc || !data.nombre) {
      toast.error("La CSF no contiene RFC o razón social válidos");
      return;
    }
    setActing(tipo);
    try {
      const r = await upsert({
        data: {
          rfc: data.rfc,
          razon_social: data.nombre,
          regimen_fiscal: data.regimenes.join(" · ") || null,
          curp: data.curp ?? null,
          tipo_persona: data.tipoPersona === "Física" ? "fisica" : data.tipoPersona === "Moral" ? "moral" : null,
          domicilio_fiscal: data.domicilio ?? null,
          codigo_postal: data.codigoPostal ?? null,
          csf_ultima_emision: toIsoDate(data.fechaEmision),
          tipo_relacion: tipo,
          cliente_padre_id: null,
        },
      });
      setResult({ ...(r as any), tipo_relacion: tipo });
      // Respaldo documental en el historial (en el propio registro)
      try {
        await save({ data: { cliente_id: r.cliente.id, tool_key: "csf-parser", input: { fileName, tipo_relacion: tipo }, output: data as any, notes: `${tipo} · ${data.rfc}` } });
      } catch { /* historial es opcional */ }
      toast.success(
        r.accion === "creado"
          ? `Guardado en RFC vinculados como ${RELACION_LABEL[tipo]}`
          : `Actualizado en RFC vinculados (${RELACION_LABEL[tipo]})`
      );
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo procesar");
    } finally {
      setActing(null);
    }
  };

  const onSaveSolo = async () => {
    if (!data) return;
    try {
      await save({ data: { cliente_id: cliente?.id ?? null, tool_key: "csf-parser", input: { fileName }, output: data as any, notes: data.rfc ?? null } });
      toast.success("Constancia guardada en el historial");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    }
  };

  return (
    <ToolShell helpSlug="csf-parser"
      title="Lector de Constancia Fiscal"
      description="Sube la CSF en PDF y crea o actualiza expedientes a partir de los datos extraídos."
      icon={<FileBadge className="h-5 w-5 text-primary-foreground" />}
    >
      <label className="block rounded-xl border-2 border-dashed border-border bg-card/30 p-10 text-center hover:border-primary/50 transition-colors cursor-pointer">
        <input type="file" accept="application/pdf,.pdf" className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <div className="h-12 w-12 rounded-xl mx-auto flex items-center justify-center mb-3" style={{ background: "var(--gradient-primary)" }}>
          <Upload className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="font-medium">{busy ? (progress || "Procesando…") : "Selecciona la CSF (PDF)"}</div>
        <div className="text-xs text-muted-foreground mt-1">{fileName ?? "Procesamiento local del documento."}</div>
      </label>

      {data && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold flex items-center gap-2">
              {data.warnings.length === 0
                ? <><CheckCircle2 className="h-4 w-4 text-success" /> Datos detectados</>
                : <><AlertTriangle className="h-4 w-4 text-sky-600 dark:text-sky-300" /> Datos parcialmente detectados</>}
            </h3>
          </div>

          {/* Acciones sobre el expediente */}
          <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
            {canManageExpedientes ? (
              <>
                <div className="text-sm font-medium">Guardar en RFC vinculados como:</div>
                <div className="grid sm:grid-cols-3 gap-2">
                  <Button variant="hero" disabled={!!acting} onClick={() => onUpsert("cliente")}>
                    <UserPlus className="h-4 w-4" />
                    {acting === "cliente" ? "Guardando…" : "Cliente"}
                  </Button>
                  <Button variant="outline" disabled={!!acting} onClick={() => onUpsert("proveedor")}>
                    <Truck className="h-4 w-4" />
                    {acting === "proveedor" ? "Guardando…" : "Proveedor"}
                  </Button>
                  <Button variant="outline" disabled={!!acting} onClick={() => onUpsert("acreedor")}>
                    <Receipt className="h-4 w-4" />
                    {acting === "acreedor" ? "Guardando…" : "Acreedor"}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Todos los RFC se depositan en <strong>RFC vinculados</strong>. Solo los que marques como <strong>Cliente</strong> aparecen además en <strong>Expedientes</strong> con sus herramientas completas. Los proveedores y acreedores se invocarán automáticamente cuando una herramienta los necesite.
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Tu rol permite consultar y trabajar sólo con los RFC asignados; no puede crear nuevos expedientes.</div>
            )}
            <div className="pt-1">
              <Button variant="ghost" size="sm" onClick={onSaveSolo}>
                <Save className="h-3.5 w-3.5" /> Solo guardar en historial (sin crear registro)
              </Button>
            </div>
          </div>

          {result && (
            <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span>
                  Registro <strong>{result.accion}</strong> como <strong>{RELACION_LABEL[result.tipo_relacion]}</strong>:{" "}
                  <strong>{result.cliente.razon_social}</strong> ({result.cliente.rfc})
                </span>
              </div>
              {result.accion === "actualizado" && result.diferencias.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Campos actualizados: {result.diferencias.join(", ")}
                </div>
              )}
              {result.accion === "actualizado" && result.diferencias.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  La CSF no introdujo cambios respecto a los datos ya registrados.
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Link to="/app/rfcs-vinculados">
                  <Button variant="outline" size="sm"><ListChecks className="h-3.5 w-3.5" /> Ver en RFC vinculados</Button>
                </Link>
                {result.tipo_relacion === "cliente" && (
                  <Link to="/app/clientes/$id" params={{ id: result.cliente.id }}>
                    <Button variant="outline" size="sm"><FolderOpen className="h-3.5 w-3.5" /> Abrir expediente</Button>
                  </Link>
                )}
              </div>
            </div>
          )}



          {data.warnings.length > 0 && (
            <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 dark:bg-sky-400/10 p-3 text-xs space-y-1">
              <div className="font-medium text-sky-700 dark:text-sky-200 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Revisión recomendada — la extracción está incompleta
              </div>
              <ul className="text-sky-800/90 dark:text-sky-100/90 list-disc pl-5 space-y-0.5">
                {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
              <div className="text-sky-700/80 dark:text-sky-200/70 pt-1">
                Es probable que tu CSF tenga un formato distinto al esperado. Verifica los datos manualmente antes de guardar.
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <Card title="Identificación">
              <Row k="RFC" v={data.rfc} mono />
              <Row k="Tipo" v={data.tipoPersona ? `Persona ${data.tipoPersona}` : undefined} />
              <Row k="CURP" v={data.curp} mono />
              <Row k="Nombre" v={data.nombre} />
              <Row k="Estatus" v={data.estatus} />
              <Row k="Inicio operaciones" v={data.fechaInicioOperaciones} />
              <Row k="Último cambio" v={data.fechaUltimoCambio} />
              <Row k="Emisión CSF" v={data.fechaEmision} />
            </Card>
            <Card title="Domicilio">
              <div className="text-sm">{data.domicilio ?? "—"}</div>
              <div className="pt-2"><Row k="Código Postal" v={data.codigoPostal} mono /></div>
            </Card>
            <Card title="Regímenes">
              {data.regimenes.length ? (
                <ul className="text-sm space-y-1">{data.regimenes.map((r, i) => <li key={i}>• {r}</li>)}</ul>
              ) : <div className="text-sm text-muted-foreground">No detectados</div>}
            </Card>
            <Card title="Obligaciones">
              {data.obligaciones.length ? (
                <ul className="text-sm space-y-1">{data.obligaciones.map((o, i) => <li key={i}>• {o}</li>)}</ul>
              ) : <div className="text-sm text-muted-foreground">No detectadas</div>}
            </Card>
          </div>

          <details className="rounded-lg border border-border/60 bg-card/40 p-3 text-xs">
            <summary className="cursor-pointer flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <Eye className="h-3.5 w-3.5" /> Ver texto extraído del PDF (depuración)
            </summary>
            <pre className="mt-2 whitespace-pre-wrap text-[11px] text-muted-foreground max-h-64 overflow-auto">{data.rawTextSample}</pre>
          </details>
        </div>
      )}
    </ToolShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function Row({ k, v, mono }: { k: string; v?: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className={`${mono ? "font-mono text-xs" : ""} text-right truncate`}>{v ?? "—"}</span>
    </div>
  );
}
