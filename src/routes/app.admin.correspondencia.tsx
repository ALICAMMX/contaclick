import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, Sparkles, Copy, Download } from "lucide-react";
import { ModuleScaffold, DemoCard } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generarCorrespondencia, PLANTILLAS_CORRESPONDENCIA } from "@/lib/correspondencia/correspondencia.functions";

export const Route = createFileRoute("/app/admin/correspondencia")({ component: CorPage });

function CorPage() {
  const [plantilla, setPlantilla] = useState<string>(PLANTILLAS_CORRESPONDENCIA[0].key);
  const [destinatario, setDestinatario] = useState("");
  const [asunto, setAsunto] = useState("");
  const [contexto, setContexto] = useState("");
  const [remitente, setRemitente] = useState("");
  const [tono, setTono] = useState<"formal" | "cordial" | "directo">("formal");
  const [output, setOutput] = useState("");

  const generar = useServerFn(generarCorrespondencia);
  const mut = useMutation({
    mutationFn: () => generar({ data: { plantilla, destinatario, asunto, contexto, remitente, tono } }),
    onSuccess: (r) => {
      if (r.error) { toast.error(r.error); return; }
      setOutput(r.content);
      toast.success("Documento generado");
    },
    onError: (e: any) => toast.error(e?.message || "Error al generar"),
  });

  const copy = async () => {
    await navigator.clipboard.writeText(output);
    toast.success("Copiado al portapapeles");
  };
  const download = () => {
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${(asunto || "documento").replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  const canGenerate = destinatario.trim() && asunto.trim() && contexto.trim() && !mut.isPending;

  return (
    <ModuleScaffold
      title="Correspondencia & Minutas"
      subtitle="Generador IA de oficios, minutas y respuestas. Indica destinatario, asunto y puntos clave; la IA redacta el documento listo para revisar."
      icon={<MessageSquare className="h-5 w-5" />}
      badge={null}
      actions={<HerramientaHelp slug="admin-correspondencia" />}
    >
      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-4">
        <DemoCard title="1 · Parámetros">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Plantilla</Label>
              <Select value={plantilla} onValueChange={setPlantilla}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLANTILLAS_CORRESPONDENCIA.map((p) => (
                    <SelectItem key={p.key} value={p.key}>{p.titulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {PLANTILLAS_CORRESPONDENCIA.find((p) => p.key === plantilla)?.desc}
              </p>
            </div>
            <div>
              <Label className="text-xs">Destinatario</Label>
              <Input className="mt-1" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} placeholder="Ej. Administración Desconcentrada de Auditoría Fiscal Federal del DF '2'" />
            </div>
            <div>
              <Label className="text-xs">Asunto</Label>
              <Input className="mt-1" value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Ej. Respuesta a invitación INV-2026-0421" />
            </div>
            <div>
              <Label className="text-xs">Tono</Label>
              <Select value={tono} onValueChange={(v: any) => setTono(v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">Formal (autoridades)</SelectItem>
                  <SelectItem value="cordial">Cordial (cliente)</SelectItem>
                  <SelectItem value="directo">Directo (interno)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Firma / remitente</Label>
              <Input className="mt-1" value={remitente} onChange={(e) => setRemitente(e.target.value)} placeholder="C.P. Juan Pérez · Socio Director" />
            </div>
            <div>
              <Label className="text-xs">Contexto y puntos a incluir</Label>
              <Textarea
                className="mt-1 min-h-[140px]"
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
                placeholder="Describe el contexto: qué se está respondiendo, antecedentes, acuerdos, fechas, montos, fundamento legal cuando aplique, etc."
              />
            </div>
            <Button className="w-full" disabled={!canGenerate} onClick={() => mut.mutate()}>
              <Sparkles className="h-4 w-4 mr-1" /> {mut.isPending ? "Generando…" : "Generar con IA"}
            </Button>
          </div>
        </DemoCard>

        <DemoCard title="2 · Documento generado">
          {output ? (
            <>
              <div className="rounded-lg border border-border/50 bg-background/60 p-4 whitespace-pre-wrap text-sm leading-relaxed min-h-[320px] max-h-[560px] overflow-auto">
                {output}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={copy}><Copy className="h-3.5 w-3.5 mr-1" /> Copiar</Button>
                <Button size="sm" variant="outline" onClick={download}><Download className="h-3.5 w-3.5 mr-1" /> Descargar .txt</Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Revisa el documento antes de enviarlo. La IA puede equivocarse en fechas, números de expediente o cifras: valida con tu expediente real.
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 bg-background/30 p-6 text-center text-sm text-muted-foreground min-h-[320px] flex items-center justify-center">
              Completa los parámetros y presiona <span className="mx-1 inline-flex items-center gap-1 text-foreground"><Sparkles className="h-3.5 w-3.5 text-primary" /> Generar con IA</span> para ver el documento aquí.
            </div>
          )}
        </DemoCard>
      </div>
    </ModuleScaffold>
  );
}
