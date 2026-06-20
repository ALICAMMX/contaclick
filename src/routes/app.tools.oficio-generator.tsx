import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileSignature, Save, Copy, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToolShell } from "@/components/ToolShell";
import { useActiveCliente } from "@/lib/active-cliente";
import { saveToolRun } from "@/lib/tool-runs.functions";

export const Route = createFileRoute("/app/tools/oficio-generator")({
  component: OficioGenerator,
});

type Vars = {
  rfc: string;
  razonSocial: string;
  domicilioFiscal: string;
  fecha: string;
  ciudad: string;
  folio: string;
  destinatario: string;
  cargoDestinatario: string;
  motivo: string;
  firmante: string;
  cargo: string;
  correo: string;
  telefono: string;
};

type Plantilla = {
  key: string;
  name: string;
  asunto: string;
  /** Devuelve secciones del oficio en orden lógico */
  build: (v: Vars) => Section[];
};

type Section =
  | { type: "proem"; text: string }
  | { type: "asunto"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

const PLANTILLAS: Plantilla[] = [
  {
    key: "respuesta-invitacion",
    name: "Respuesta a carta invitación SAT",
    asunto: "Respuesta a carta invitación",
    build: (v) => [
      { type: "asunto", text: `Respuesta a carta invitación, folio ${v.folio || "[FOLIO]"}.` },
      { type: "proem", text: `${v.destinatario || "SERVICIO DE ADMINISTRACIÓN TRIBUTARIA"}\n${v.cargoDestinatario || "Administración Desconcentrada de Recaudación"}\nP r e s e n t e.` },
      { type: "heading", text: "I. Antecedentes" },
      { type: "paragraph", text: `${v.razonSocial || "[RAZÓN SOCIAL]"}, contribuyente con Registro Federal de Contribuyentes ${v.rfc || "[RFC]"}, con domicilio fiscal en ${v.domicilioFiscal || "[DOMICILIO FISCAL]"}, por conducto de su representante legal que al calce suscribe, comparece respetuosamente ante esa H. Autoridad a efecto de dar respuesta en tiempo y forma a la carta invitación referida al rubro.` },
      { type: "heading", text: "II. Hechos y manifestaciones" },
      { type: "paragraph", text: v.motivo || "[Exponer los hechos, periodos observados y aclaraciones que desvirtúan la observación realizada por la autoridad. Indicar montos, CFDI, declaraciones y soportes documentales que se acompañan.]" },
      { type: "heading", text: "III. Fundamentos de derecho" },
      { type: "paragraph", text: "Con fundamento en los artículos 8°, 14 y 16 de la Constitución Política de los Estados Unidos Mexicanos; 33 fracción IV, 41-A, 42 y 134 del Código Fiscal de la Federación; y demás relativos aplicables, se atiende la invitación formulada y se manifiesta lo conducente." },
      { type: "heading", text: "IV. Petitorios" },
      { type: "list", items: [
        "Tener por presentada en tiempo y forma la presente respuesta a la carta invitación.",
        "Tener por exhibida la documentación soporte que se acompaña como anexo.",
        "Tener por desvirtuada la observación señalada por esa H. Autoridad.",
      ]},
    ],
  },
  {
    key: "aviso-suspension",
    name: "Aviso de suspensión de actividades",
    asunto: "Aviso de suspensión de actividades",
    build: (v) => [
      { type: "asunto", text: "Aviso de suspensión de actividades." },
      { type: "proem", text: `${v.destinatario || "SERVICIO DE ADMINISTRACIÓN TRIBUTARIA"}\nP r e s e n t e.` },
      { type: "paragraph", text: `${v.firmante || "[NOMBRE DEL REPRESENTANTE]"}, en mi calidad de ${v.cargo || "representante legal"} de ${v.razonSocial || "[RAZÓN SOCIAL]"}, con Registro Federal de Contribuyentes ${v.rfc || "[RFC]"} y domicilio fiscal en ${v.domicilioFiscal || "[DOMICILIO FISCAL]"}, comparezco respetuosamente para presentar AVISO DE SUSPENSIÓN DE ACTIVIDADES, con efectos a partir del ${v.fecha}.` },
      { type: "heading", text: "Motivación" },
      { type: "paragraph", text: v.motivo || "[Indicar las causas que originan la suspensión de actividades: cierre temporal de operaciones, reestructura corporativa, ausencia de ingresos en el periodo, etc.]" },
      { type: "heading", text: "Fundamento legal" },
      { type: "paragraph", text: "Con fundamento en los artículos 27, apartado B, fracción II del Código Fiscal de la Federación y 29 fracción V, así como 30 fracción IV, inciso a) de su Reglamento, y la regla 2.5.10 de la Resolución Miscelánea Fiscal vigente, se presenta el aviso correspondiente." },
      { type: "heading", text: "Petitorios" },
      { type: "list", items: [
        "Tener por presentado en tiempo y forma el presente aviso de suspensión de actividades.",
        "Tener por acreditada la personalidad con la documentación que se acompaña.",
        "Emitir acuse correspondiente para los efectos legales a que haya lugar.",
      ]},
    ],
  },
  {
    key: "aclaracion-buzon",
    name: "Aclaración por buzón tributario",
    asunto: "Aclaración",
    build: (v) => [
      { type: "asunto", text: `Aclaración, folio ${v.folio || "[FOLIO]"}.` },
      { type: "proem", text: `${v.destinatario || "SERVICIO DE ADMINISTRACIÓN TRIBUTARIA"}\nP r e s e n t e.` },
      { type: "paragraph", text: `${v.razonSocial || "[RAZÓN SOCIAL]"}, con Registro Federal de Contribuyentes ${v.rfc || "[RFC]"}, por conducto de su representante legal que al calce suscribe, comparece respetuosamente a presentar la siguiente ACLARACIÓN.` },
      { type: "heading", text: "Hechos" },
      { type: "paragraph", text: v.motivo || "[Describir cronológicamente los hechos, periodos, montos, CFDI o referencias del requerimiento. Anexar evidencia documental.]" },
      { type: "heading", text: "Fundamentos legales" },
      { type: "paragraph", text: "Con apoyo en los artículos 17-K, 33-A y 33 fracción II del Código Fiscal de la Federación, así como la ficha de trámite correspondiente del Anexo 1-A de la Resolución Miscelánea Fiscal, se solicita la atención de la presente." },
      { type: "heading", text: "Petitorios" },
      { type: "list", items: [
        "Tener por presentada esta aclaración en tiempo y forma.",
        "Resolver conforme a derecho y notificar a través del buzón tributario.",
      ]},
    ],
  },
  {
    key: "solicitud-devolucion",
    name: "Solicitud de devolución de saldo a favor",
    asunto: "Solicitud de devolución",
    build: (v) => [
      { type: "asunto", text: "Solicitud de devolución de saldo a favor." },
      { type: "proem", text: `${v.destinatario || "SERVICIO DE ADMINISTRACIÓN TRIBUTARIA"}\nAdministración Desconcentrada de Auditoría Fiscal\nP r e s e n t e.` },
      { type: "paragraph", text: `${v.razonSocial || "[RAZÓN SOCIAL]"}, contribuyente con Registro Federal de Contribuyentes ${v.rfc || "[RFC]"} y domicilio fiscal en ${v.domicilioFiscal || "[DOMICILIO FISCAL]"}, por conducto de su representante legal, comparece respetuosamente para solicitar la DEVOLUCIÓN DE SALDO A FAVOR en términos siguientes:` },
      { type: "heading", text: "Concepto" },
      { type: "paragraph", text: v.motivo || "[Indicar impuesto (ISR/IVA), periodo, ejercicio fiscal y monto del saldo a favor. Referenciar la declaración presentada.]" },
      { type: "heading", text: "Fundamento legal" },
      { type: "paragraph", text: "Con fundamento en el artículo 22, 22-A, 22-B y 22-C del Código Fiscal de la Federación, en relación con la ficha de trámite correspondiente del Anexo 1-A de la Resolución Miscelánea Fiscal vigente, se solicita el reintegro a la cuenta bancaria registrada (CLABE que se acompaña)." },
      { type: "heading", text: "Petitorios" },
      { type: "list", items: [
        "Tener por presentada en tiempo y forma la solicitud de devolución.",
        "Resolver favorablemente y ordenar el depósito en la CLABE proporcionada.",
        "Tener por exhibidos los anexos y documentación soporte.",
      ]},
    ],
  },
];

function OficioGenerator() {
  const { cliente } = useActiveCliente();
  const save = useServerFn(saveToolRun);
  const [tplKey, setTplKey] = useState(PLANTILLAS[0].key);
  const [vars, setVars] = useState<Vars>({
    rfc: cliente?.rfc ?? "",
    razonSocial: cliente?.razon_social ?? "",
    domicilioFiscal: "",
    fecha: new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }),
    ciudad: "Ciudad de México",
    folio: "",
    destinatario: "Servicio de Administración Tributaria",
    cargoDestinatario: "Administración Desconcentrada",
    motivo: "",
    firmante: "",
    cargo: "Representante Legal",
    correo: "",
    telefono: "",
  });

  const tpl = useMemo(() => PLANTILLAS.find((p) => p.key === tplKey)!, [tplKey]);
  const sections = useMemo(() => tpl.build(vars), [tpl, vars]);
  const plainText = useMemo(() => sectionsToText(sections, tpl, vars), [sections, tpl, vars]);

  const update = (k: keyof Vars) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setVars((s) => ({ ...s, [k]: e.target.value }));

  const onCopy = async () => {
    await navigator.clipboard.writeText(plainText);
    toast.success("Oficio copiado al portapapeles");
  };

  const onDownloadTxt = () => {
    const blob = new Blob([plainText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tpl.key}-${vars.rfc || "oficio"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onDownloadPDF = () => {
    generarOficioPDF(sections, tpl, vars);
    toast.success("PDF generado");
  };

  const onPrint = () => window.print();

  const onSave = async () => {
    try {
      await save({ data: { cliente_id: cliente?.id ?? null, tool_key: "oficio-generator", input: { tplKey, vars }, output: { texto: plainText } as any, notes: tpl.asunto } });
      toast.success("Oficio guardado en el expediente");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    }
  };

  return (
    <ToolShell
      title="Generador de oficios SAT"
      description="Documento formal con estructura jurídica (antecedentes, fundamentos, petitorios) y exportación PDF lista para firma e impresión."
      icon={<FileSignature className="h-5 w-5 text-primary-foreground" />}
    >
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .oficio-paper, .oficio-paper * { visibility: visible !important; }
          .oficio-paper { position: absolute; left: 0; top: 0; box-shadow: none !important; }
        }
      `}</style>

      <div className="grid lg:grid-cols-[420px_1fr] gap-6">
        {/* Formulario */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Plantilla</Label>
            <Select value={tplKey} onValueChange={setTplKey}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLANTILLAS.map((p) => <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/30 p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datos del contribuyente</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>RFC</Label><Input value={vars.rfc} onChange={update("rfc")} className="font-mono uppercase" /></div>
              <div className="space-y-1.5"><Label>Folio</Label><Input value={vars.folio} onChange={update("folio")} placeholder="(opcional)" /></div>
              <div className="space-y-1.5 col-span-2"><Label>Razón social</Label><Input value={vars.razonSocial} onChange={update("razonSocial")} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Domicilio fiscal</Label><Input value={vars.domicilioFiscal} onChange={update("domicilioFiscal")} placeholder="Calle, número, colonia, CP, alcaldía/municipio…" /></div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/30 p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Encabezado</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Ciudad</Label><Input value={vars.ciudad} onChange={update("ciudad")} /></div>
              <div className="space-y-1.5"><Label>Fecha</Label><Input value={vars.fecha} onChange={update("fecha")} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Destinatario</Label><Input value={vars.destinatario} onChange={update("destinatario")} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Cargo / unidad administrativa</Label><Input value={vars.cargoDestinatario} onChange={update("cargoDestinatario")} placeholder="p. ej. Administración Desconcentrada de Recaudación" /></div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/30 p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cuerpo</div>
            <div className="space-y-1.5">
              <Label>Hechos / motivo</Label>
              <Textarea rows={6} value={vars.motivo} onChange={update("motivo")} placeholder="Describe los hechos, fundamentos y referencias documentales…" />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/30 p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Firma</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label>Firmante</Label><Input value={vars.firmante} onChange={update("firmante")} placeholder="Nombre completo" /></div>
              <div className="space-y-1.5"><Label>Cargo</Label><Input value={vars.cargo} onChange={update("cargo")} /></div>
              <div className="space-y-1.5"><Label>Teléfono</Label><Input value={vars.telefono} onChange={update("telefono")} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Correo</Label><Input value={vars.correo} onChange={update("correo")} /></div>
            </div>
          </div>
        </div>

        {/* Preview tipo papel + acciones */}
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-foreground/90">Vista previa del documento</h3>
            <div className="flex gap-2 flex-wrap">
              <Button variant="glass" size="sm" onClick={onCopy}><Copy className="h-3.5 w-3.5" /> Copiar</Button>
              <Button variant="glass" size="sm" onClick={onDownloadTxt}><Download className="h-3.5 w-3.5" /> .TXT</Button>
              <Button variant="glass" size="sm" onClick={onPrint}><Printer className="h-3.5 w-3.5" /> Imprimir</Button>
              <Button variant="hero" size="sm" onClick={onDownloadPDF}><Download className="h-3.5 w-3.5" /> PDF</Button>
              <Button variant="outline" size="sm" onClick={onSave}><Save className="h-3.5 w-3.5" /> Guardar</Button>
            </div>
          </div>

          <PaperPreview sections={sections} tpl={tpl} vars={vars} />
        </div>
      </div>
    </ToolShell>
  );
}

/* ============ Vista de papel ============ */
function PaperPreview({ sections, tpl, vars }: { sections: Section[]; tpl: Plantilla; vars: Vars }) {
  return (
    <div className="oficio-paper mx-auto bg-white text-[#1b2233] shadow-2xl rounded-md overflow-hidden"
      style={{ maxWidth: "820px", fontFamily: "'Georgia', 'Times New Roman', serif" }}>
      {/* Banda de cabecera */}
      <div className="px-12 py-6 text-white flex items-center justify-between"
        style={{ background: "linear-gradient(135deg, #0f1b3d 0%, #1e3a5f 100%)" }}>
        <div>
          <div className="text-[10px] uppercase tracking-[0.32em] opacity-80">{vars.razonSocial || "Contribuyente"}</div>
          <div className="font-semibold text-lg leading-tight mt-0.5">{tpl.name}</div>
        </div>
        <div className="text-right text-[11px] opacity-90">
          <div>{vars.ciudad}</div>
          <div>{vars.fecha}</div>
          {vars.folio && <div className="mt-1 font-mono">Folio: {vars.folio}</div>}
        </div>
      </div>

      <div className="px-14 py-10 space-y-5 leading-[1.65]" style={{ textAlign: "justify" }}>
        {/* Asunto */}
        {sections.filter(s => s.type === "asunto").map((s, i) => (
          <div key={`a${i}`} className="text-[15px]">
            <span className="font-semibold">Asunto: </span>
            <span>{(s as any).text}</span>
          </div>
        ))}

        {/* Proem (destinatario) */}
        {sections.filter(s => s.type === "proem").map((s, i) => (
          <div key={`p${i}`} className="whitespace-pre-line text-[15px] font-semibold mt-2 not-italic" style={{ textAlign: "left" }}>
            {(s as any).text}
          </div>
        ))}

        {/* Cuerpo */}
        {sections.filter(s => s.type !== "asunto" && s.type !== "proem").map((s, i) => {
          if (s.type === "heading") return (
            <h4 key={`h${i}`} className="text-[13px] font-bold uppercase tracking-[0.18em] mt-4 mb-1"
              style={{ color: "#0f1b3d", borderBottom: "1px solid #d6dbe5", paddingBottom: 3 }}>
              {s.text}
            </h4>
          );
          if (s.type === "paragraph") return (
            <p key={`pp${i}`} className="text-[14.5px] indent-8">{s.text}</p>
          );
          if (s.type === "list") return (
            <ol key={`l${i}`} className="list-decimal pl-8 text-[14.5px] space-y-1">
              {s.items.map((it, j) => <li key={j}>{it}</li>)}
            </ol>
          );
          return null;
        })}

        {/* Cierre */}
        <p className="text-[14.5px] indent-8 pt-2">
          Sin otro particular y agradeciendo de antemano la atención que se sirva brindar al presente, quedo de usted.
        </p>

        {/* Bloque firma */}
        <div className="pt-12 flex flex-col items-center text-center text-[13.5px]">
          <div className="font-semibold tracking-wider">ATENTAMENTE</div>
          <div className="h-16" />
          <div style={{ borderTop: "1px solid #1b2233", width: 280 }} />
          <div className="mt-1 font-semibold">{vars.firmante || "[Nombre del firmante]"}</div>
          <div className="text-[12px] text-[#52607a]">{vars.cargo}</div>
          <div className="text-[12px] text-[#52607a]">{vars.razonSocial} {vars.rfc ? `· RFC ${vars.rfc}` : ""}</div>
          {(vars.correo || vars.telefono) && (
            <div className="text-[11px] text-[#7a8499] mt-1">
              {vars.correo}{vars.correo && vars.telefono ? " · " : ""}{vars.telefono}
            </div>
          )}
        </div>
      </div>

      <div className="px-12 py-3 text-[10px] uppercase tracking-[0.22em] text-[#7a8499] border-t border-[#e4e8ef] flex items-center justify-between">
        <span>Generado con ContaClick IA</span>
        <span>Documento formal · Listo para firma</span>
      </div>
    </div>
  );
}

/* ============ Texto plano (copiar / .txt) ============ */
function sectionsToText(sections: Section[], tpl: Plantilla, v: Vars): string {
  const lines: string[] = [];
  lines.push(`${v.ciudad}, a ${v.fecha}.`);
  if (v.folio) lines.push(`Folio: ${v.folio}`);
  lines.push("");
  for (const s of sections) {
    if (s.type === "asunto") lines.push(`Asunto: ${s.text}`, "");
    else if (s.type === "proem") lines.push(s.text, "");
    else if (s.type === "heading") lines.push(s.text.toUpperCase(), "");
    else if (s.type === "paragraph") lines.push(s.text, "");
    else if (s.type === "list") { s.items.forEach((it, i) => lines.push(`${i + 1}. ${it}`)); lines.push(""); }
  }
  lines.push("Sin otro particular y agradeciendo de antemano la atención que se sirva brindar al presente, quedo de usted.", "");
  lines.push("ATENTAMENTE", "", "_________________________________");
  lines.push(v.firmante || "[Nombre del firmante]");
  lines.push(`${v.cargo} · ${v.razonSocial}`);
  if (v.rfc) lines.push(`RFC: ${v.rfc}`);
  if (v.correo || v.telefono) lines.push([v.correo, v.telefono].filter(Boolean).join(" · "));
  return lines.join("\n");
}

/* ============ PDF elegante ============ */
function generarOficioPDF(sections: Section[], tpl: Plantilla, v: Vars) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MX = 64; // margen lateral
  const contentW = W - MX * 2;
  let y = 0;

  // Banda superior
  doc.setFillColor(15, 27, 61); // #0f1b3d
  doc.rect(0, 0, W, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text((v.razonSocial || "CONTRIBUYENTE").toUpperCase(), MX, 38);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(tpl.name, MX, 58);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const right = `${v.ciudad}  ·  ${v.fecha}${v.folio ? `  ·  Folio ${v.folio}` : ""}`;
  doc.text(right, W - MX, 58, { align: "right" });

  y = 130;
  doc.setTextColor(27, 34, 51);
  doc.setFont("times", "normal");

  const ensure = (h: number) => {
    if (y + h > H - 110) {
      drawFooter(doc, v);
      doc.addPage();
      y = 90;
    }
  };

  const drawParagraph = (text: string, opts: { bold?: boolean; size?: number; indent?: number; align?: "left" | "justify" | "center" } = {}) => {
    const size = opts.size ?? 11;
    doc.setFont("times", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const indent = opts.indent ?? 0;
    const lines = doc.splitTextToSize(text, contentW - indent);
    for (const line of lines) {
      ensure(size + 4);
      doc.text(line, MX + indent, y, { align: opts.align === "center" ? "center" : undefined, maxWidth: contentW - indent });
      y += size + 4;
    }
  };

  const drawHeading = (text: string) => {
    ensure(30);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 27, 61);
    doc.text(text.toUpperCase(), MX, y);
    y += 4;
    doc.setDrawColor(214, 219, 229);
    doc.line(MX, y, W - MX, y);
    y += 12;
    doc.setTextColor(27, 34, 51);
  };

  // Asunto
  const asunto = sections.find(s => s.type === "asunto") as any;
  if (asunto) {
    ensure(20);
    doc.setFont("times", "bold"); doc.setFontSize(11);
    doc.text("Asunto: ", MX, y);
    doc.setFont("times", "normal");
    const asuntoText = asunto.text as string;
    const lines = doc.splitTextToSize(asuntoText, contentW - 50);
    doc.text(lines, MX + 50, y);
    y += lines.length * 14 + 10;
  }

  // Proem
  const proem = sections.find(s => s.type === "proem") as any;
  if (proem) {
    doc.setFont("times", "bold"); doc.setFontSize(11);
    for (const line of (proem.text as string).split("\n")) {
      ensure(14);
      doc.text(line, MX, y);
      y += 14;
    }
    y += 8;
  }

  // Cuerpo
  for (const s of sections) {
    if (s.type === "asunto" || s.type === "proem") continue;
    if (s.type === "heading") drawHeading(s.text);
    else if (s.type === "paragraph") drawParagraph(s.text, { indent: 24 });
    else if (s.type === "list") {
      doc.setFont("times", "normal"); doc.setFontSize(11);
      s.items.forEach((it, i) => {
        const lines = doc.splitTextToSize(`${i + 1}.  ${it}`, contentW - 24);
        for (const ln of lines) {
          ensure(15);
          doc.text(ln, MX + 24, y);
          y += 14;
        }
        y += 2;
      });
    }
  }

  // Cierre
  y += 6;
  drawParagraph("Sin otro particular y agradeciendo de antemano la atención que se sirva brindar al presente, quedo de usted.", { indent: 24 });

  // Firma
  ensure(140);
  y += 30;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.setTextColor(27, 34, 51);
  doc.text("ATENTAMENTE", W / 2, y, { align: "center" });
  y += 60;
  doc.setDrawColor(27, 34, 51);
  doc.line(W / 2 - 130, y, W / 2 + 130, y);
  y += 14;
  doc.setFont("times", "bold"); doc.setFontSize(11);
  doc.text(v.firmante || "[Nombre del firmante]", W / 2, y, { align: "center" });
  y += 14;
  doc.setFont("times", "normal"); doc.setFontSize(10);
  doc.setTextColor(82, 96, 122);
  doc.text(`${v.cargo} · ${v.razonSocial}`, W / 2, y, { align: "center" });
  y += 12;
  if (v.rfc) { doc.text(`RFC: ${v.rfc}`, W / 2, y, { align: "center" }); y += 12; }
  if (v.correo || v.telefono) {
    doc.setFontSize(9);
    doc.text([v.correo, v.telefono].filter(Boolean).join(" · "), W / 2, y, { align: "center" });
  }

  drawFooter(doc, v);
  doc.save(`${tpl.key}-${v.rfc || "oficio"}.pdf`);
}

function drawFooter(doc: jsPDF, _v: Vars) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setDrawColor(228, 232, 239);
  doc.line(40, H - 50, W - 40, H - 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(122, 132, 153);
  doc.text("Generado con ContaClick IA · Documento formal", 40, H - 34);
  const pages = (doc as any).internal.getNumberOfPages?.() ?? 1;
  const cur = (doc as any).internal.getCurrentPageInfo?.().pageNumber ?? 1;
  doc.text(`Página ${cur} de ${pages}`, W - 40, H - 34, { align: "right" });
}
