import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileBadge, Upload, Save, CheckCircle2, AlertTriangle, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ToolShell } from "@/components/ToolShell";
import { useActiveCliente } from "@/lib/active-cliente";
import { saveToolRun } from "@/lib/tool-runs.functions";

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
  fechaInicioOperaciones?: string;
  estatus?: string;
  fechaUltimoCambio?: string;
  fechaEmision?: string;
  rawTextSample?: string;
  warnings: string[];
};

const PDFJS_VERSION = "4.0.379";

// Lightweight PDF text extraction loaded from the browser only, else fallback
async function extractPdfText(file: File): Promise<string> {
  try {
    const pdfjs: any = await import(
      /* @vite-ignore */ `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`
    );
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it: any) => it.str).join(" ") + "\n";
    }
    return text;
  } catch {
    // Fallback: read as text and strip non-printables (works for some PDFs)
    const buf = await file.arrayBuffer();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    return decoder.decode(buf).replace(/[^\x20-\x7EáéíóúÁÉÍÓÚñÑüÜ\n]/g, " ");
  }
}

function parseCsf(text: string): CsfData {
  // Preserve newlines; collapse only multiple spaces
  const t = text.replace(/[ \t\f\v]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  const flat = t.replace(/\s+/g, " ");
  const out: CsfData = { regimenes: [], obligaciones: [], rawTextSample: t.slice(0, 600), warnings: [] };

  // RFC
  const rfc = flat.match(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/);
  if (rfc) out.rfc = rfc[1];

  // CURP (sólo Persona Física)
  const curp = flat.match(/\b([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\b/);
  if (curp) out.curp = curp[1];

  // Tipo de persona: PM si RFC tiene 3 letras iniciales, PF si tiene 4
  if (out.rfc) {
    const letras = out.rfc.match(/^[A-ZÑ&]+/)?.[0].length ?? 0;
    out.tipoPersona = letras === 3 ? "Moral" : "Física";
  }

  // Nombre / Razón social
  // PM: "Denominación o Razón Social: XXX"
  const razonPM = flat.match(/Denominaci[oó]n\s*\/?\s*o?\s*Raz[oó]n\s+Social[:\s]+([A-ZÁÉÍÓÚÑ0-9&.,\-\s]{3,120}?)\s+(?:R[ée]gimen|RFC|CURP|Fecha|Nombre\s+Comercial|Estatus|Domicilio)/i);
  if (razonPM) out.nombre = razonPM[1].replace(/\s+/g, " ").trim();

  // PF: "Nombre(s): X  Primer Apellido: Y  Segundo Apellido: Z"
  if (!out.nombre) {
    const n = flat.match(/Nombre\s*\(s\)\s*:?\s*([A-ZÁÉÍÓÚÑ\s]{2,60}?)\s+Primer\s+Apellido[:\s]+([A-ZÁÉÍÓÚÑ\s]{2,40}?)\s+Segundo\s+Apellido[:\s]*([A-ZÁÉÍÓÚÑ\s]{0,40}?)\s+(?:Fecha|CURP|RFC|R[ée]gimen|Estatus|Domicilio)/i);
    if (n) out.nombre = [n[1], n[2], n[3]].map(s => s.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
  }

  // Validar nombre: rechazar si contiene dígitos o frases de plantilla
  if (out.nombre) {
    const bad = /\d|VALIDA\s+TU|CONSTANCIA\s+DE\s+SITUACI[OÓ]N|INFORMACI[OÓ]N\s+FISCAL|Lugar\s+y\s+Fecha/i;
    if (bad.test(out.nombre) || out.nombre.length < 3) {
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

  // Domicilio
  const dom = flat.match(/Domicilio\s+(?:Registrado|Fiscal)[:\s]+([A-Z0-9ÁÉÍÓÚÑ ,\.\-#]+?)\s+(?:Actividades|Reg[ií]men|Obligaciones|Fecha|Correo|Tel[eé]fono)/i);
  if (dom) out.domicilio = dom[1].trim();
  else out.warnings.push("No se detectó el domicilio fiscal.");

  return out;
}

function CsfParser() {
  const { cliente } = useActiveCliente();
  const [data, setData] = useState<CsfData | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = useServerFn(saveToolRun);

  const onFile = async (file: File) => {
    setFileName(file.name);
    setBusy(true);
    try {
      const text = await extractPdfText(file);
      setData(parseCsf(text));
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo leer el PDF");
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (!data) return;
    try {
      await save({ data: { cliente_id: cliente?.id ?? null, tool_key: "csf-parser", input: { fileName }, output: data as any, notes: data.rfc ?? null } });
      toast.success("Constancia guardada en el expediente");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    }
  };

  return (
    <ToolShell
      title="Lector de Constancia Fiscal"
      description="Sube la CSF en PDF y extrae régimen, obligaciones y domicilio fiscal."
      icon={<FileBadge className="h-5 w-5 text-primary-foreground" />}
    >
      <label className="block rounded-xl border-2 border-dashed border-border bg-card/30 p-10 text-center hover:border-primary/50 transition-colors cursor-pointer">
        <input type="file" accept="application/pdf,.pdf" className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <div className="h-12 w-12 rounded-xl mx-auto flex items-center justify-center mb-3" style={{ background: "var(--gradient-primary)" }}>
          <Upload className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="font-medium">{busy ? "Procesando…" : "Selecciona la CSF (PDF)"}</div>
        <div className="text-xs text-muted-foreground mt-1">{fileName ?? "Procesamiento local del documento."}</div>
      </label>

      {data && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold flex items-center gap-2">
              {data.warnings.length === 0
                ? <><CheckCircle2 className="h-4 w-4 text-success" /> Datos detectados</>
                : <><AlertTriangle className="h-4 w-4 text-amber-400" /> Datos parcialmente detectados</>}
            </h3>
            <Button variant="glass" size="sm" onClick={onSave}><Save className="h-3.5 w-3.5" /> Guardar en expediente</Button>
          </div>

          {data.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
              <div className="font-medium text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Revisión recomendada — la extracción está incompleta
              </div>
              <ul className="text-amber-200/90 list-disc pl-5 space-y-0.5">
                {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
              <div className="text-muted-foreground pt-1">
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
