import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Send, X, Sparkles, Loader2, Minus } from "lucide-react";
import { RichMarkdown } from "@/components/RichMarkdown";
import { Button } from "@/components/ui/button";
import { sendBotAyuda } from "@/lib/bot-ayuda.functions";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

const INITIAL: Msg[] = [
  {
    role: "assistant",
    content:
      "👋 Hola, soy el **Bot de Ayuda de ContaClick**. Pregúntame cómo usar cualquier herramienta: te explico paso a paso, qué requisitos necesita, cómo realizar la operación y cómo verificar que el resultado es correcto.\n\n**Ejemplos:**\n- ¿Cómo descargo XMLs masivos del SAT?\n- ¿Qué necesito antes de usar el Conciliador bancario?\n- ¿Cómo verifico que mi cálculo de RESICO es correcto?",
  },
];

const SUGERENCIAS = [
  "¿Cómo subo CFDIs a un expediente?",
  "Pasos para generar una póliza automática",
  "¿Qué revisa el Auditor Express?",
  "Cómo interpretar el semáforo de Salud Fiscal",
];

export function HelpBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(INITIAL);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const send = useServerFn(sendBotAyuda);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Minimizar al hacer click fuera (no cerrar / no perder conversación)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [open, messages, loading]);

  const onSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
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
      toast.error(e?.message ?? "Error al consultar el bot");
    } finally {
      setLoading(false);
    }
  };

  const unread = !open && messages.length > 1 && messages[messages.length - 1].role === "assistant";

  return (
    <>
      {/* Botón flotante */}
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Abrir bot de ayuda"
        className="fixed bottom-5 right-5 z-[60] h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-2xl ring-2 ring-primary/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center group"
        style={{ boxShadow: "0 10px 40px -10px hsl(var(--primary) / 0.6), var(--shadow-glow)" }}
      >
        <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping opacity-40" />
        {open ? <X className="h-6 w-6 relative" /> : <Bot className="h-6 w-6 relative" />}
        {unread && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-background animate-pulse" />
        )}
        {!open && (
          <span className="absolute right-full mr-3 whitespace-nowrap rounded-md bg-popover border border-border text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity text-foreground shadow-lg pointer-events-none">
            Bot de Ayuda
          </span>
        )}
      </button>

      {/* Panel chat */}
      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-24 right-5 z-[60] w-[calc(100vw-2.5rem)] sm:w-[420px] h-[600px] max-h-[calc(100vh-8rem)] rounded-2xl bg-popover border border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200"
          style={{ boxShadow: "0 20px 60px -15px rgba(0,0,0,0.45)" }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-gradient-to-r from-primary/10 to-transparent">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--gradient-primary)" }}>
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm flex items-center gap-1.5">
                Bot de Ayuda ContaClick
                <Sparkles className="h-3 w-3 text-primary" />
              </div>
              <div className="text-[11px] text-muted-foreground">Experto en todas las herramientas · 24/7</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-7 w-7 rounded-md hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Minimizar"
              title="Minimizar (la conversación se conserva)"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border/60"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <RichMarkdown compact>{m.content}</RichMarkdown>
                  ) : (
                    <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-card border border-border/60 rounded-2xl px-3 py-2 text-xs flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Pensando...
                </div>
              </div>
            )}
            {messages.length <= 1 && !loading && (
              <div className="grid gap-1.5 pt-1">
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSend(s)}
                    className="text-left text-xs rounded-lg px-3 py-2 border border-border/60 bg-card/50 hover:bg-card hover:border-primary/40 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSend(input);
            }}
            className="border-t border-border p-2.5 flex gap-2 bg-card/30"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend(input);
                }
              }}
              placeholder="Pregunta cómo usar cualquier herramienta..."
              rows={1}
              disabled={loading}
              className="flex-1 resize-none rounded-lg bg-input/50 border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 max-h-32"
            />
            <Button type="submit" size="icon" variant="hero" disabled={loading || !input.trim()} aria-label="Enviar">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
