import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold } from "@/components/ModuleScaffold";
import { FileSignature, Sparkles, Copy, Download, Loader2, FileText, Scale, AlertCircle, Check } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { generarEscrito, TIPOS_ESCRITO } from "@/lib/legal/redactor.functions";
import { useActiveCliente } from "@/lib/active-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RichMarkdown } from "@/components/RichMarkdown";
import { toast } from "sonner";

export const Route = createFileRoute("/app/legal/redactor")({ component: RedactorPage });

type Nivel = "estandar" | "robusto" | "premium";

function RedactorPage() {
  const { cliente } = useActiveCliente();
  const generar = useServerFn(generarEscrito);

  const [tipo, setTipo] = useState<string>("recurso_revocacion");
  const [razon, setRazon] = useState("");
  const [rfc, setRfc] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [representante, setRepresentante] = useState("");
  const [oficio, setOficio] = useState("");
  const [monto, setMonto] = useState("");
  const [hechos, setHechos] = useState("");
  const [agravios, setAgravios] = useState("");
  const [pretensiones, setPretensiones] = useState("");
  const [pruebas, setPruebas] = useState("");
  const [nivel, setNivel] = useState<Nivel>("robusto");
  const [escrito, setEscrito] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (cliente) {
      if (!razon) setRazon(cliente.razon_social);
      if (!rfc) setRfc(cliente.rfc);
    }
  }, [cliente]); // eslint-disable-line react-hooks/exhaustive-deps

  const tipoMeta = useMemo(() => TIPOS_ESCRITO.find((t) => t.key === tipo)!, [tipo]);

  const mut = useMutation({
    mutationFn: async () => {
      const r = await generar({
        data: {
          tipo,
          cliente_razon_social: razon.trim(),
          cliente_rfc: rfc.trim().toUpperCase(),
          cliente_domicilio: domicilio.trim(),
          representante: representante.trim(),
          oficio_referencia: oficio.trim(),
          monto: monto.trim(),
          hechos: hechos.trim(),
          agravios: agravios.trim(),
          pretensiones: pretensiones.trim(),
          pruebas: pruebas.trim(),
          nivel,
        },
      });
      if (r.error) throw new Error(r.error);
      return r.content;
    },
    onSuccess: (content) => {
      setEscrito(content);
      toast.success("Escrito generado. Revisa, ajusta y firma.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canGenerate = razon.trim().length > 0 && rfc.trim().length > 0 && hechos.trim().length >= 20;

  const onCopy = async () => {
    await navigator.clipboard.writeText(escrito);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const onDownload = () => {
    const blob = new Blob([escrito], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tipoMeta.key}-${rfc || "escrito"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cargarDemo = () => {
    setTipo("recurso_revocacion");
    setRazon("CONSTRUCTORA VEGA S.A. DE C.V.");
    setRfc("CVE240115X9A");
    setDomicilio("Av. Insurgentes Sur 1234, Col. Del Valle, C.P. 03100, CDMX");
    setRepresentante("Lic. María Fernanda López Ruiz, en términos del poder notarial 45,123 ante el Notario 87 de la CDMX");
    setOficio("500-72-00-04-2026-21458 de fecha 14 de junio de 2026");
    setMonto("$1,847,230.00 MXN (ISR e IVA omitidos + accesorios)");
    setHechos(
      "El 14 de junio de 2026 la autoridad notificó resolución determinante por supuesta inexistencia de operaciones con tres proveedores listados en el Anexo I durante el ejercicio 2024. La autoridad descalificó CFDI por $1.2M alegando falta de materialidad sin haber requerido previamente al contribuyente la documentación soporte. Mi representada cuenta con contratos firmados, bitácoras de obra, evidencia fotográfica, transferencias bancarias y testigos presenciales que acreditan la efectiva prestación de los servicios.",
    );
    setAgravios(
      "1) Violación al art. 16 CPEUM por falta de fundamentación y motivación del oficio impugnado. 2) Violación al art. 69-B CFF por aplicarlo retroactivamente sin agotar el procedimiento del segundo párrafo. 3) Indebida valoración de pruebas conforme art. 130 CFF.",
    );
    setPretensiones("Se revoque la resolución, se reconozca la materialidad de las operaciones y se ordene la devolución de los importes pagados bajo protesta.");
    setPruebas("Contratos de obra, bitácoras firmadas por el supervisor, fotografías georreferenciadas, estados de cuenta BBVA cuenta 0123456789, declaración testimonial de los maestros de obra.");
  };

  return (
    <ModuleScaffold
      title="Redactor de Escritos IA"
      subtitle="Genera escritos fiscales y de defensa con calidad de despacho boutique. Captura el expediente, elige el tipo y obtén un borrador estructurado en segundos."
      icon={<FileSignature className="h-5 w-5" />}
    >
      <div className="grid lg:grid-cols-[420px_1fr] gap-4">
        {/* Panel izquierdo: formulario */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Scale className="h-4 w-4 text-primary" /> Tipo de escrito</h3>
              <button onClick={cargarDemo} className="text-xs text-primary hover:underline">Cargar demo</button>
            </div>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_ESCRITO.map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-[11px] text-muted-foreground space-y-0.5 pl-1">
              <div><span className="font-medium text-foreground/80">Fundamento:</span> {tipoMeta.fundamento}</div>
              <div><span className="font-medium text-foreground/80">Autoridad:</span> {tipoMeta.autoridad}</div>
            </div>

            <div className="pt-1">
              <Label className="text-xs">Profundidad</Label>
              <Tabs value={nivel} onValueChange={(v) => setNivel(v as Nivel)} className="mt-1.5">
                <TabsList className="grid grid-cols-3 w-full h-8">
                  <TabsTrigger value="estandar" className="text-xs">Estándar</TabsTrigger>
                  <TabsTrigger value="robusto" className="text-xs">Robusto</TabsTrigger>
                  <TabsTrigger value="premium" className="text-xs">Premium</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-[10.5px] text-muted-foreground mt-1.5">
                {nivel === "estandar" && "800-1,200 palabras · Gemini Flash · más rápido."}
                {nivel === "robusto" && "1,500-2,500 palabras · Gemini Flash · equilibrio recomendado."}
                {nivel === "premium" && "3,000-4,500 palabras · Gemini 2.5 Pro · máximo desarrollo argumentativo."}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold">Promovente</h3>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <Label className="text-xs">Razón social *</Label>
                <Input value={razon} onChange={(e) => setRazon(e.target.value)} placeholder="EMPRESA EJEMPLO S.A. DE C.V." className="h-9" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">RFC *</Label>
                  <Input value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} placeholder="XAXX010101000" className="h-9 font-mono text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Monto controvertido</Label>
                  <Input value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$1,000,000 MXN" className="h-9" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Domicilio fiscal</Label>
                <Input value={domicilio} onChange={(e) => setDomicilio(e.target.value)} placeholder="Calle, núm., col., CP, ciudad" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Representante legal</Label>
                <Input value={representante} onChange={(e) => setRepresentante(e.target.value)} placeholder="Lic. Nombre, poder notarial..." className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Acto u oficio referenciado</Label>
                <Input value={oficio} onChange={(e) => setOficio(e.target.value)} placeholder="Oficio 500-72-... fecha" className="h-9" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold">Expediente</h3>
            <div>
              <Label className="text-xs">Hechos * <span className="text-muted-foreground">(mín. 20 caracteres)</span></Label>
              <Textarea value={hechos} onChange={(e) => setHechos(e.target.value)} rows={5} className="text-xs" placeholder="Narrativa cronológica de los hechos relevantes…" />
            </div>
            <div>
              <Label className="text-xs">Agravios / argumentos preliminares</Label>
              <Textarea value={agravios} onChange={(e) => setAgravios(e.target.value)} rows={3} className="text-xs" placeholder="Si tienes una tesis de defensa, descríbela. Si no, la IA la propone." />
            </div>
            <div>
              <Label className="text-xs">Pretensiones</Label>
              <Textarea value={pretensiones} onChange={(e) => setPretensiones(e.target.value)} rows={2} className="text-xs" placeholder="Qué pides al juzgador/autoridad." />
            </div>
            <div>
              <Label className="text-xs">Pruebas disponibles</Label>
              <Textarea value={pruebas} onChange={(e) => setPruebas(e.target.value)} rows={2} className="text-xs" placeholder="Documentales, periciales, testimoniales…" />
            </div>
          </div>

          <Button
            onClick={() => mut.mutate()}
            disabled={!canGenerate || mut.isPending}
            className="w-full h-11 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium"
          >
            {mut.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redactando escrito…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> Generar escrito con IA</>
            )}
          </Button>
          {!canGenerate && (
            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              Captura razón social, RFC y al menos 20 caracteres de hechos.
            </p>
          )}
        </div>

        {/* Panel derecho: vista previa */}
        <div className="rounded-xl border border-border/60 bg-card/40 flex flex-col min-h-[680px]">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              <span className="font-medium">{tipoMeta.nombre}</span>
              {escrito && <span className="text-xs text-muted-foreground">· {escrito.split(/\s+/).length} palabras</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" disabled={!escrito} onClick={onCopy} className="h-8 text-xs">
                {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
              <Button size="sm" variant="outline" disabled={!escrito} onClick={onDownload} className="h-8 text-xs">
                <Download className="h-3.5 w-3.5 mr-1" /> .md
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            {mut.isPending && (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="text-sm">Redactando con fundamento legal, jurisprudencia y estructura formal…</div>
                <div className="text-xs">Esto puede tardar 15-45 segundos según el nivel seleccionado.</div>
              </div>
            )}
            {!mut.isPending && !escrito && (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-3 max-w-md mx-auto">
                <FileSignature className="h-12 w-12 text-primary/30" />
                <div className="text-sm font-medium text-foreground">El escrito aparecerá aquí</div>
                <div className="text-xs">
                  Captura el expediente del lado izquierdo y presiona <span className="text-primary font-medium">Generar escrito con IA</span>. El borrador incluye proemio, hechos numerados, agravios con fundamento, pruebas, puntos petitorios y fórmula de protesta.
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-[11px] text-left w-full">
                  {["Fundamento legal exacto (CFF, LISR, LIVA, LFPCA, LA)", "Estructura formal de despacho boutique", "Agravios con desarrollo técnico y jurisprudencia", "Listo para revisar, firmar y presentar"].map((f) => (
                    <div key={f} className="rounded-md border border-border/40 bg-background/40 p-2 flex items-start gap-1.5">
                      <Check className="h-3 w-3 text-[oklch(0.78_0.15_155)] mt-0.5 flex-shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!mut.isPending && escrito && <RichMarkdown>{escrito}</RichMarkdown>}
          </div>
        </div>
      </div>
    </ModuleScaffold>
  );
}
