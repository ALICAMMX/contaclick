import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Sparkles, Loader2, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { ToolShell } from "@/components/ToolShell";
import { sendChat } from "@/lib/chat.functions";
import { useActiveCliente } from "@/lib/active-cliente";
import { toast } from "sonner";

export const Route = createFileRoute("/app/tools/fiscal-assistant")({
  component: FiscalAssistant,
});

type Msg = { role: "user" | "assistant"; content: string };

function FiscalAssistant() {
  const { cliente } = useActiveCliente();
  const greeting = cliente
    ? `Hola, estoy listo para ayudarte con asuntos fiscales del expediente **${cliente.razon_social}** (RFC ${cliente.rfc}${cliente.regimen_fiscal ? ` · ${cliente.regimen_fiscal}` : ""}). ¿En qué te apoyo?`
    : "Hola, soy tu asistente fiscal. ¿En qué te ayudo hoy?";
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: greeting }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const send = useServerFn(sendChat);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const onSend = async (text: string) => {
    if (!text.trim() || loading) return;
    const ctxLine = cliente ? `[Contexto del expediente activo: razón social "${cliente.razon_social}", RFC ${cliente.rfc}${cliente.regimen_fiscal ? `, régimen ${cliente.regimen_fiscal}` : ""}]` : "";
    const userMsg: Msg = { role: "user", content: ctxLine ? `${ctxLine}\n\n${text}` : text };
    const display: Msg = { role: "user", content: text };
    const next = [...messages, display];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const payloadMessages = [...messages, userMsg];
      const res = await send({ data: { messages: payloadMessages } });
      if (res.error) toast.error(res.error);
      else setMessages([...next, { role: "assistant", content: res.content }]);
    } catch (e: any) {
      toast.error(e?.message ?? "Error al consultar la IA");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolShell
      title="Asistente fiscal IA"
      description="Pregunta puntual de legislación fiscal mexicana. Responde con el contexto del expediente activo."
      icon={<Bot className="h-5 w-5 text-primary-foreground" />}
      requireCliente={false}
    >
      <div className="rounded-xl border border-border/60 bg-card/30 flex flex-col h-[60vh]">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                m.role === "user" ? "bg-primary/15 border border-primary/30" : "bg-card border border-border/60"
              }`}>
                {m.role === "assistant" && (
                  <div className="flex items-center gap-1.5 text-xs text-primary mb-1.5">
                    <Sparkles className="h-3 w-3" /> ContaClick IA
                  </div>
                )}
                <div className="leading-relaxed whitespace-pre-wrap">{m.content}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-card border border-border/60 rounded-2xl px-4 py-3 text-sm flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Pensando...
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSend(input); }} className="flex gap-2 p-4 border-t border-border/50">
          <input
            value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Pregunta sobre CFDI, ISR, IVA, RESICO..."
            disabled={loading}
            className="flex-1 h-11 px-4 rounded-lg bg-input/50 border border-border focus:outline-none focus:ring-1 focus:ring-ring text-sm disabled:opacity-50"
          />
          <Button type="submit" variant="hero" size="lg" disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </ToolShell>
  );
}
