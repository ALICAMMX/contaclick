import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileSignature, Save, Copy, Download } from "lucide-react";
import { toast } from "sonner";
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

type Plantilla = {
  key: string;
  name: string;
  asunto: string;
  build: (v: Vars) => string;
};

type Vars = {
  rfc: string;
  razonSocial: string;
  fecha: string;
  folio: string;
  destinatario: string;
  motivo: string;
  firmante: string;
  cargo: string;
};

const PLANTILLAS: Plantilla[] = [
  {
    key: "respuesta-invitacion",
    name: "Respuesta a invitación / carta invitación SAT",
    asunto: "Respuesta a carta invitación",
    build: (v) => `${v.fecha}

${v.destinatario}
P R E S E N T E

Asunto: Respuesta a carta invitación, folio ${v.folio || "[FOLIO]"}.

Por medio del presente, el contribuyente ${v.razonSocial} con RFC ${v.rfc}, en atención a la carta invitación referida, manifiesta lo siguiente:

${v.motivo || "[Exponer hechos, fundamentos y aclaraciones correspondientes a la situación fiscal observada por la autoridad]"}.

Se acompaña la documentación soporte que acredita lo aquí manifestado y se solicita se tenga por desvirtuada la observación realizada.

Sin otro particular, agradezco la atención.

Atentamente,

${v.firmante || "[Nombre del firmante]"}
${v.cargo || "Representante Legal"}
${v.razonSocial}
RFC: ${v.rfc}`,
  },
  {
    key: "aviso-suspension",
    name: "Aviso de suspensión de actividades",
    asunto: "Aviso de suspensión de actividades",
    build: (v) => `${v.fecha}

${v.destinatario || "Servicio de Administración Tributaria"}
P R E S E N T E

Asunto: Aviso de suspensión de actividades.

El que suscribe, ${v.firmante || "[Nombre]"}, en representación de ${v.razonSocial} con RFC ${v.rfc}, comparezco respetuosamente para presentar AVISO DE SUSPENSIÓN DE ACTIVIDADES, con efectos a partir de ${v.fecha}, por las siguientes razones:

${v.motivo || "[Indicar las razones de la suspensión de actividades]"}.

Se acompañan los documentos soporte y se solicita se tenga por presentado en tiempo y forma el presente aviso.

Atentamente,

${v.firmante || "[Nombre del firmante]"}
${v.cargo || "Representante Legal"}
RFC: ${v.rfc}`,
  },
  {
    key: "aclaracion-buzon",
    name: "Aclaración por buzón tributario",
    asunto: "Aclaración",
    build: (v) => `${v.fecha}

${v.destinatario || "Servicio de Administración Tributaria"}
P R E S E N T E

Asunto: Aclaración, folio ${v.folio || "[FOLIO]"}.

${v.razonSocial} con RFC ${v.rfc}, presenta la siguiente aclaración:

${v.motivo || "[Describir hechos, periodos, montos y referencias del CFDI o requerimiento]"}.

Se solicita atentamente se tenga por presentada esta aclaración y se resuelva conforme a derecho.

Atentamente,

${v.firmante || "[Nombre del firmante]"}
${v.cargo || "Representante Legal"}
${v.razonSocial}
RFC: ${v.rfc}`,
  },
  {
    key: "solicitud-devolucion",
    name: "Solicitud de devolución de saldo a favor",
    asunto: "Solicitud de devolución",
    build: (v) => `${v.fecha}

${v.destinatario || "Servicio de Administración Tributaria"}
P R E S E N T E

Asunto: Solicitud de devolución de saldo a favor.

${v.razonSocial} con RFC ${v.rfc}, solicita la devolución del saldo a favor por el siguiente concepto:

${v.motivo || "[Indicar impuesto, periodo y monto del saldo a favor]"}.

Se acompañan los anexos correspondientes y los datos de la cuenta bancaria CLABE para el depósito.

Atentamente,

${v.firmante || "[Nombre del firmante]"}
${v.cargo || "Representante Legal"}
RFC: ${v.rfc}`,
  },
];

function OficioGenerator() {
  const { cliente } = useActiveCliente();
  const save = useServerFn(saveToolRun);
  const [tplKey, setTplKey] = useState(PLANTILLAS[0].key);
  const [vars, setVars] = useState<Vars>({
    rfc: cliente?.rfc ?? "",
    razonSocial: cliente?.razon_social ?? "",
    fecha: new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }),
    folio: "",
    destinatario: "Servicio de Administración Tributaria",
    motivo: "",
    firmante: "",
    cargo: "Representante Legal",
  });

  const tpl = useMemo(() => PLANTILLAS.find((p) => p.key === tplKey)!, [tplKey]);
  const texto = useMemo(() => tpl.build(vars), [tpl, vars]);

  const update = (k: keyof Vars) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setVars((s) => ({ ...s, [k]: e.target.value }));

  const onCopy = async () => {
    await navigator.clipboard.writeText(texto);
    toast.success("Oficio copiado");
  };

  const onDownload = () => {
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tpl.key}-${vars.rfc || "oficio"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onSave = async () => {
    try {
      await save({ data: { cliente_id: cliente?.id ?? null, tool_key: "oficio-generator", input: { tplKey, vars }, output: { texto } as any, notes: tpl.asunto } });
      toast.success("Oficio guardado en el expediente");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    }
  };

  return (
    <ToolShell
      title="Generador de oficios SAT"
      description="Plantillas listas (avisos, aclaraciones, devoluciones) personalizadas con el RFC del expediente."
      icon={<FileSignature className="h-5 w-5 text-primary-foreground" />}
    >
      <div className="grid lg:grid-cols-2 gap-6">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>RFC</Label><Input value={vars.rfc} onChange={update("rfc")} className="font-mono" /></div>
            <div className="space-y-1.5"><Label>Razón social</Label><Input value={vars.razonSocial} onChange={update("razonSocial")} /></div>
            <div className="space-y-1.5"><Label>Fecha</Label><Input value={vars.fecha} onChange={update("fecha")} /></div>
            <div className="space-y-1.5"><Label>Folio</Label><Input value={vars.folio} onChange={update("folio")} placeholder="(opcional)" /></div>
            <div className="space-y-1.5 col-span-2"><Label>Destinatario</Label><Input value={vars.destinatario} onChange={update("destinatario")} /></div>
            <div className="space-y-1.5"><Label>Firmante</Label><Input value={vars.firmante} onChange={update("firmante")} /></div>
            <div className="space-y-1.5"><Label>Cargo</Label><Input value={vars.cargo} onChange={update("cargo")} /></div>
            <div className="space-y-1.5 col-span-2">
              <Label>Motivo / cuerpo</Label>
              <Textarea rows={5} value={vars.motivo} onChange={update("motivo")} placeholder="Describe los hechos, fundamentos y referencias…" />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Vista previa</h3>
            <div className="flex gap-2">
              <Button variant="glass" size="sm" onClick={onCopy}><Copy className="h-3.5 w-3.5" /> Copiar</Button>
              <Button variant="glass" size="sm" onClick={onDownload}><Download className="h-3.5 w-3.5" /> Descargar</Button>
              <Button variant="hero" size="sm" onClick={onSave}><Save className="h-3.5 w-3.5" /> Guardar</Button>
            </div>
          </div>
          <pre className="rounded-xl border border-border/60 bg-card/50 p-4 text-sm whitespace-pre-wrap font-sans leading-relaxed min-h-[420px]">{texto}</pre>
        </div>
      </div>
    </ToolShell>
  );
}
