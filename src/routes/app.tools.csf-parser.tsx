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
  regimenes: string[];
  obligaciones: string[];
  domicilio?: string;
  fechaInicioOperaciones?: string;
  estatus?: string;
  fechaEmision?: string;
  rawTextSample?: string;
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
  const out: CsfData = { regimenes: [], obligaciones: [], rawTextSample: text.slice(0, 200) };
  const t = text.replace(/\s+/g, " ");

  const rfc = t.match(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/);
  if (rfc) out.rfc = rfc[1];

  const curp = t.match(/\b([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\b/);
  if (curp) out.curp = curp[1];

  const nombre = t.match(/(?:Denominaci[oó]n\/Raz[oó]n Social|Nombre[s]?[^:]*?):\s*([A-ZÁÉÍÓÚÑ0-9 ,\.&-]{4,})\s+(?:RFC|CURP|Régimen|Regimen|Fecha)/i);
  if (nombre) out.nombre = nombre[1].trim();

  const fIni = t.match(/Fecha de inicio de operaciones:\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4}|\d{4}-\d{2}-\d{2})/i);
  if (fIni) out.fechaInicioOperaciones = fIni[1];

  const estatus = t.match(/Estatus en el padr[oó]n:\s*([A-Za-zÁÉÍÓÚáéíóúñÑ ]{3,30})/i);
  if (estatus) out.estatus = estatus[1].trim();

  const emision = t.match(/Lugar y Fecha de Emisi[oó]n[^0-9]*([0-9]{1,2}[^0-9]+\w+[^0-9]+\d{4})/i);
  if (emision) out.fechaEmision = emision[1].trim();

  // Regímenes: cadenas conocidas
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
  ];
  for (const r of regList) {
    if (new RegExp(r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(t)) out.regimenes.push(r);
  }

  // Obligaciones (líneas que comienzan con "Declaración" o "Pago" o contengan "mensual"/"anual")
  const obs = t.match(/(Declaraci[oó]n[^.;]+?(mensual|anual|provisional)[^.;]*?)[.;]/gi);
  if (obs) out.obligaciones = Array.from(new Set(obs.map((s) => s.replace(/[.;]$/, "").trim()))).slice(0, 8);

  // Domicilio: heurística
  const dom = t.match(/Domicilio Fiscal[:\s]+([A-Z0-9ÁÉÍÓÚÑ ,\.\-#]+?)\s+(?:Actividades|Reg[ií]men|Obligaciones|Fecha)/i);
  if (dom) out.domicilio = dom[1].trim();

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
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> Datos detectados</h3>
            <Button variant="glass" size="sm" onClick={onSave}><Save className="h-3.5 w-3.5" /> Guardar en expediente</Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Card title="Identificación">
              <Row k="RFC" v={data.rfc} mono />
              <Row k="CURP" v={data.curp} mono />
              <Row k="Nombre" v={data.nombre} />
              <Row k="Estatus" v={data.estatus} />
              <Row k="Inicio operaciones" v={data.fechaInicioOperaciones} />
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
