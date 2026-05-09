import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Sparkles, FileText, Banknote, Calculator, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendChat } from "@/lib/chat.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/asistente")({
  component: Asistente,
});

type Msg = { role: "user" | "assistant"; content: string };

const initial: Msg[] = [
  {
    role: "assistant",
    content:
      "Hola, soy tu asistente fiscal. Puedo ayudarte con CFDI, ISR, IVA bajo RESICO, deducciones, DIOT, redactar correos para clientes y más. ¿En qué te ayudo hoy?",
  },
];

const sugerencias = [
  { icon: Calculator, text: "¿Cómo se calcula el ISR provisional bajo RESICO persona física?" },
  { icon: FileText, text: "Explícame los requisitos de un CFDI 4.0 con complemento de pago." },
  { icon: Banknote, text: "Redacta un correo profesional para pedir estados de cuenta a un cliente." },
];

function Asistente() {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const send = useServerFn(sendChat);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const onSend = async (text: string) => {
    if (!text.trim() || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await send({ data: { messages: next } });
      if (res.error) {
        toast.error(res.error);
        setMessages(next);
      } else {
        setMessages([...next, { role: "assistant", content: res.content }]);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error al consultar la IA");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col max-w-4xl mx-auto">
      <div className="flex items-center gap-3 pb-4 border-b border-border/50">
        <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}>
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Asistente IA Contable</h1>
          <p className="text-xs text-muted-foreground">Fiscalista experto · SAT MX · CFDI 4.0 · RESICO</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-6 space-y-4">
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

        {messages.length <= 1 && !loading && (
          <div className="grid sm:grid-cols-3 gap-2 pt-4">
            {sugerencias.map((s, i) => (
              <button key={i} onClick={() => onSend(s.text)} className="text-left rounded-xl p-3 border border-border/60 bg-card/50 hover:bg-card hover:border-primary/40 transition-all">
                <s.icon className="h-4 w-4 text-primary mb-2" />
                <div className="text-xs leading-relaxed">{s.text}</div>
              </button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); onSend(input); }} className="flex gap-2 pt-4 border-t border-border/50">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregúntale al asistente fiscal..."
          disabled={loading}
          className="flex-1 h-11 px-4 rounded-lg bg-input/50 border border-border focus:outline-none focus:ring-1 focus:ring-ring text-sm disabled:opacity-50"
        />
        <Button type="submit" variant="hero" size="lg" disabled={loading || !input.trim()}><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
