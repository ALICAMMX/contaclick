import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MessageCircle, Sparkles, Send, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActiveCliente } from "@/lib/active-cliente";
import { renderPlantilla, redactarMensajeAI, saveMensaje, listMensajes, type PlantillaKey } from "@/lib/mensajes/mensajes.functions";

export const Route = createFileRoute("/app/mensajes/")({
  component: MensajesPage,
});

const PLANTILLAS: Array<{ key: PlantillaKey; label: string; vars: string[] }> = [
  { key: "recordatorio_impuestos", label: "Recordatorio de impuestos", vars: ["cliente", "fecha"] },
  { key: "aviso_diferencias", label: "Aviso de diferencias", vars: ["cliente", "cantidad", "periodo", "monto"] },
  { key: "solicitud_documentos", label: "Solicitud de documentos", vars: ["cliente", "documentos", "fecha"] },
  { key: "resumen_ejecutivo", label: "Resumen mensual", vars: ["cliente", "periodo", "ingresos", "egresos", "utilidad"] },
];

function MensajesPage() {
  const { cliente } = useActiveCliente();
  const qc = useQueryClient();
  const fnRender = useServerFn(renderPlantilla);
  const fnAI = useServerFn(redactarMensajeAI);
  const fnSave = useServerFn(saveMensaje);
  const fnList = useServerFn(listMensajes);

  const [plantilla, setPlantilla] = useState<PlantillaKey>("recordatorio_impuestos");
  const [vars, setVars] = useState<Record<string, string>>({ cliente: cliente?.razon_social ?? "" });
  const [cuerpo, setCuerpo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [contextoIA, setContextoIA] = useState("");
  const [tono, setTono] = useState<"formal" | "cercano" | "directo">("cercano");
  const [copied, setCopied] = useState(false);

  const list = useQuery({
    queryKey: ["mensajes", cliente?.id],
    queryFn: () => fnList({ data: { cliente_id: cliente?.id, limit: 30 } }),
  });

  const render = useMutation({
    mutationFn: async () => fnRender({ data: { plantilla_key: plantilla, variables: vars } }),
    onSuccess: (r) => setCuerpo(r.cuerpo),
  });

  const ai = useMutation({
    mutationFn: async () => {
      const ctx = contextoIA || `Plantilla: ${plantilla}. Cliente: ${vars.cliente ?? cliente?.razon_social ?? ""}. Variables: ${JSON.stringify(vars)}`;
      const r = await fnAI({ data: { contexto: ctx, tono, canal: "whatsapp" } });
      if (r.error) throw new Error(r.error);
      return r.content;
    },
    onSuccess: (c) => { setCuerpo(c); toast.success("Mensaje redactado por IA"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const save = useMutation({
    mutationFn: async (estatus: "enviado" | "pendiente") => fnSave({
      data: {
        cliente_id: cliente?.id,
        canal: "whatsapp",
        destinatario: telefono || undefined,
        cuerpo,
        plantilla_key: plantilla,
        variables: vars,
        estatus,
      },
    }),
    onSuccess: () => {
      toast.success("Mensaje guardado");
      qc.invalidateQueries({ queryKey: ["mensajes", cliente?.id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const enviarWhatsApp = () => {
    if (!cuerpo.trim()) { toast.error("Escribe un mensaje primero"); return; }
    const num = telefono.replace(/\D/g, "");
    const url = num
      ? `https://wa.me/${num.startsWith("52") ? num : "52" + num}?text=${encodeURIComponent(cuerpo)}`
      : `https://wa.me/?text=${encodeURIComponent(cuerpo)}`;
    window.open(url, "_blank");
    save.mutate("enviado");
  };

  const copiar = async () => {
    await navigator.clipboard.writeText(cuerpo);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const tplDef = PLANTILLAS.find((p) => p.key === plantilla)!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Mensajería IA</h1>
        <p className="text-muted-foreground text-sm mt-1">Redacta recordatorios, avisos y comunicados para tus clientes con IA. Envía por WhatsApp o correo.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Editor */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-muted-foreground">Plantilla</label>
              <select value={plantilla} onChange={(e) => setPlantilla(e.target.value as PlantillaKey)} className="h-9 px-3 rounded-md bg-card/50 border border-border text-sm">
                {PLANTILLAS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <Button size="sm" variant="ghost" onClick={() => render.mutate()}>Cargar plantilla</Button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {tplDef.vars.map((v) => (
                <div key={v}>
                  <label className="text-xs text-muted-foreground capitalize">{v}</label>
                  <input
                    value={vars[v] ?? ""}
                    onChange={(e) => setVars({ ...vars, [v]: e.target.value })}
                    placeholder={v}
                    className="h-9 px-3 w-full rounded-md bg-card/50 border border-border text-sm"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Mensaje</label>
              <textarea
                value={cuerpo}
                onChange={(e) => setCuerpo(e.target.value)}
                rows={10}
                placeholder="Carga una plantilla o redacta con IA…"
                className="w-full rounded-md bg-card/50 border border-border p-3 text-sm font-mono"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="WhatsApp (opcional, ej. 5512345678)"
                className="h-9 px-3 rounded-md bg-card/50 border border-border text-sm flex-1 min-w-[200px]"
              />
              <Button variant="ghost" size="sm" onClick={copiar}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copiar
              </Button>
              <Button variant="glass" size="sm" onClick={enviarWhatsApp}>
                <Send className="h-3.5 w-3.5" /> Abrir WhatsApp
              </Button>
              <Button variant="ghost" size="sm" onClick={() => save.mutate("pendiente")}>Guardar borrador</Button>
            </div>
          </div>
        </div>

        {/* AI panel */}
        <div className="space-y-4">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Redacción IA</div>
            <select value={tono} onChange={(e) => setTono(e.target.value as any)} className="h-9 px-3 rounded-md bg-card/50 border border-border text-sm w-full">
              <option value="cercano">Tono cercano</option>
              <option value="formal">Tono formal</option>
              <option value="directo">Tono directo</option>
            </select>
            <textarea
              value={contextoIA}
              onChange={(e) => setContextoIA(e.target.value)}
              rows={4}
              placeholder="Contexto adicional para la IA (opcional)…"
              className="w-full rounded-md bg-card/50 border border-border p-3 text-xs"
            />
            <Button size="sm" variant="glass" disabled={ai.isPending} onClick={() => ai.mutate()} className="w-full">
              {ai.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Redactar con IA
            </Button>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/50">
            <div className="p-4 border-b border-border/50 flex items-center gap-2"><MessageCircle className="h-4 w-4 text-primary" /> <span className="font-semibold text-sm">Historial</span></div>
            <div className="divide-y divide-border/40 max-h-[380px] overflow-y-auto">
              {(list.data?.mensajes ?? []).length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">Sin mensajes aún.</div>
              ) : (
                (list.data?.mensajes ?? []).map((m) => (
                  <button key={m.id} onClick={() => setCuerpo(m.cuerpo)} className="w-full text-left p-3 hover:bg-accent/30 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{PLANTILLAS.find((p) => p.key === m.plantilla_key)?.label ?? m.canal}</span>
                      <span className="text-muted-foreground">{new Date(m.created_at).toLocaleDateString("es-MX")}</span>
                    </div>
                    <div className="text-muted-foreground line-clamp-2">{m.cuerpo}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
