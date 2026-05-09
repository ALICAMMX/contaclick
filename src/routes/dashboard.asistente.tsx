import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Send, Sparkles, FileText, Banknote, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/asistente")({
  component: Asistente,
});

type Msg = { role: "user" | "assistant"; content: string };

const initial: Msg[] = [
  {
    role: "assistant",
    content:
      "Hola, soy tu asistente fiscal. Puedo analizar CFDI, calcular ISR/IVA bajo RESICO, redactar correos para clientes y explicar diferencias contables. ¿En qué te ayudo hoy?",
  },
];

const sugerencias = [
  { icon: Calculator, text: "Calcular ISR provisional de octubre para Servicios García SA" },
  { icon: FileText, text: "Resumir CFDI recibidos del último mes con riesgo alto" },
  { icon: Banknote, text: "Redactar correo al cliente sobre diferencia bancaria de $45,200" },
];

function Asistente() {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");

  const send = (text: string) => {
    if (!text.trim()) return;
    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      {
        role: "assistant",
        content:
          "Conecta Lovable Cloud + Lovable AI para activar respuestas reales del asistente fiscal. Una vez activos, analizaré tus documentos y daré respuestas con citas a la legislación vigente.",
      },
    ]);
    setInput("");
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
              m.role === "user"
                ? "bg-primary/15 border border-primary/30"
                : "bg-card border border-border/60"
            }`}>
              {m.role === "assistant" && (
                <div className="flex items-center gap-1.5 text-xs text-primary mb-1.5">
                  <Sparkles className="h-3 w-3" /> ContaClick IA
                </div>
              )}
              <div className="leading-relaxed">{m.content}</div>
            </div>
          </div>
        ))}

        {messages.length <= 1 && (
          <div className="grid sm:grid-cols-3 gap-2 pt-4">
            {sugerencias.map((s, i) => (
              <button
                key={i}
                onClick={() => send(s.text)}
                className="text-left rounded-xl p-3 border border-border/60 bg-card/50 hover:bg-card hover:border-primary/40 transition-all"
              >
                <s.icon className="h-4 w-4 text-primary mb-2" />
                <div className="text-xs leading-relaxed">{s.text}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex gap-2 pt-4 border-t border-border/50"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregúntale al asistente fiscal..."
          className="flex-1 h-11 px-4 rounded-lg bg-input/50 border border-border focus:outline-none focus:ring-1 focus:ring-ring text-sm"
        />
        <Button type="submit" variant="hero" size="lg"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
