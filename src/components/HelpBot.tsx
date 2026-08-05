import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Send, X, Sparkles, Loader2, Minus, Plus, Trash2, MessageSquare, Menu } from "lucide-react";
import logoC from "@/assets/contaclick-c.png.asset.json";

function BotMark({ className = "h-5 w-5", spin = false }: { className?: string; spin?: boolean }) {
  return (
    <img
      src={logoC.url}
      alt="ContaClick IA"
      draggable={false}
      className={`${className} object-contain ${spin ? "animate-spin" : ""}`}
      style={spin ? { animationDuration: "1.1s" } : undefined}
    />
  );
}
import { RichMarkdown } from "@/components/RichMarkdown";
import { Button } from "@/components/ui/button";
import {
  sendBotAyuda,
  listBotAyudaThreads,
  loadBotAyudaThread,
  deleteBotAyudaThread,
} from "@/lib/bot-ayuda.functions";
import { useAuth } from "@/lib/auth";
import { useActiveCliente } from "@/lib/active-cliente";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };
type Thread = { id: string; title: string; updated_at: string };

function getFirstName(user: any): string {
  const meta = user?.user_metadata ?? {};
  const full = (meta.full_name || meta.name || meta.nombre || "").toString().trim();
  if (full) return full.split(/\s+/)[0];
  const email: string = user?.email ?? "";
  if (email) {
    const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "";
}

function buildWelcome(name: string, expedienteNombre?: string | null): string {
  const saludo = name ? `¡Bienvenido(a), **${name}**!` : "¡Bienvenido(a)!";
  const opcionD = expedienteNombre
    ? `\n- **d)** ¿Quieres tratar algo del expediente **${expedienteNombre}**?`
    : "";
  return `${saludo} 👋\n\nSoy **Conti**, tu asistente IA de ContaClick. Estoy aquí para ayudarte: si es tu primera vez en ContaClick puedo darte una guía de cómo comenzar a usar tu herramienta. Ahora eres parte de nuestra familia y queremos tratarte como tal.\n\n**¿Por dónde quieres comenzar?**\n\n- **a)** Explicación de cómo funciona ContaClick\n- **b)** Cuáles son las funciones principales de ContaClick\n- **c)** Escribe algo personalizado en el chat y con todo gusto te respondo${opcionD}`;
}

export function HelpBot() {
  const { user } = useAuth();
  const { cliente } = useActiveCliente();
  const firstName = useMemo(() => getFirstName(user), [user]);
  const expedienteNombre = cliente?.razon_social ?? null;
  const welcome = useMemo<Msg>(
    () => ({ role: "assistant", content: buildWelcome(firstName, expedienteNombre) }),
    [firstName, expedienteNombre],
  );
  const sugerencias = useMemo<string[]>(() => {
    const base = [
      "a) Explícame cómo funciona ContaClick",
      "b) ¿Cuáles son las funciones principales de ContaClick?",
    ];
    if (expedienteNombre) {
      base.push(`d) Quiero tratar algo del expediente ${expedienteNombre}`);
    }
    return base;
  }, [expedienteNombre]);

  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([welcome]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const send = useServerFn(sendBotAyuda);
  const listThreads = useServerFn(listBotAyudaThreads);
  const loadThread = useServerFn(loadBotAyudaThread);
  const delThread = useServerFn(deleteBotAyudaThread);

  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refreshThreads = useCallback(async () => {
    try {
      const r = await listThreads({});
      setThreads(r.threads as Thread[]);
    } catch (e) {
      console.error(e);
    }
  }, [listThreads]);

  // Load thread list on open
  useEffect(() => {
    if (open) refreshThreads();
  }, [open, refreshThreads]);

  // Reset welcome to use current name
  useEffect(() => {
    if (!activeId) setMessages([welcome]);
  }, [welcome, activeId]);

  // Minimize on outside click
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

  // External trigger to open the bot from other parts of the app
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-bot-ayuda", onOpen);
    return () => window.removeEventListener("open-bot-ayuda", onOpen);
  }, []);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [open, messages, loading]);

  const handleNew = () => {
    setActiveId(null);
    setMessages([welcome]);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const handleSelect = async (id: string) => {
    if (id === activeId) {
      setSidebarOpen(false);
      return;
    }
    setLoadingThread(true);
    setSidebarOpen(false);
    try {
      const r = await loadThread({ data: { threadId: id } });
      const msgs = r.messages as Msg[];
      setActiveId(id);
      setMessages(msgs.length ? msgs : [welcome]);
    } catch (e: any) {
      toast.error("No se pudo cargar la conversación");
    } finally {
      setLoadingThread(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar esta conversación?")) return;
    try {
      const r = await delThread({ data: { threadId: id } });
      if (!r.ok) {
        toast.error(r.error ?? "Error al eliminar");
        return;
      }
      setThreads((prev) => prev.filter((t) => t.id !== id));
      if (activeId === id) handleNew();
      toast.success("Conversación eliminada");
    } catch {
      toast.error("Error al eliminar");
    }
  };

  const onSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const clienteContext = cliente
        ? `Razón social: ${cliente.razon_social} · RFC: ${cliente.rfc}${cliente.regimen_fiscal ? ` · Régimen: ${cliente.regimen_fiscal}` : ""}`
        : null;
      const res = await send({ data: { threadId: activeId, messages: next, clienteContext } });
      if (res.error) {
        toast.error(res.error);
        setMessages(messages);
      } else {
        setMessages([...next, { role: "assistant", content: res.content }]);
        if (res.threadId && res.threadId !== activeId) setActiveId(res.threadId);
        refreshThreads();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error al consultar el bot");
      setMessages(messages);
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
        aria-label="Abrir Conti"
        className="fixed bottom-4 right-4 z-30 h-14 w-14 rounded-full bg-white text-foreground shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center group"
        style={{ boxShadow: "0 10px 40px -10px hsl(var(--primary) / 0.45)" }}
      >
        {open ? (
          <X className="h-5 w-5 relative text-foreground" />
        ) : (
          <span className="relative h-10 w-10 flex items-center justify-center">
            <span
              className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin"
              style={{ animationDuration: "1.1s" }}
              aria-hidden
            />
            <BotMark className="h-[70%] w-[70%] relative" />
          </span>
        )}

        {unread && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-background animate-pulse" />
        )}
        {!open && (
          <span className="absolute right-full mr-3 whitespace-nowrap rounded-md bg-popover border border-border text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity text-foreground shadow-lg pointer-events-none">
            Conti · Asistente IA
          </span>
        )}
      </button>

      {/* Panel chat */}
      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-24 right-5 z-[60] w-[calc(100vw-2.5rem)] sm:w-[420px] h-[600px] max-h-[calc(100vh-8rem)] lg:bottom-10 lg:right-10 lg:left-10 lg:top-10 lg:w-auto lg:h-auto lg:max-h-none lg:mx-auto lg:max-w-6xl rounded-2xl bg-popover border border-border shadow-2xl flex overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200"
          style={{ boxShadow: "0 20px 60px -15px rgba(0,0,0,0.45)" }}
        >
          {/* Sidebar — desktop siempre visible, mobile drawer */}
          <aside
            className={`absolute inset-y-0 left-0 z-10 w-64 bg-card border-r border-border flex flex-col transition-transform lg:static lg:translate-x-0 ${
              sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            }`}
          >
            <div className="p-2.5 border-b border-border">
              <Button onClick={handleNew} variant="hero" size="sm" className="w-full justify-start gap-2">
                <Plus className="h-4 w-4" /> Nuevo chat
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {threads.length === 0 && (
                <div className="text-[11px] text-muted-foreground px-3 py-4 text-center">
                  Aún no tienes conversaciones guardadas.
                </div>
              )}
              {threads.map((t) => {
                const active = t.id === activeId;
                return (
                  <div
                    key={t.id}
                    onClick={() => handleSelect(t.id)}
                    className={`group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-xs transition ${
                      active ? "bg-primary/15 text-foreground" : "hover:bg-accent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{t.title || "Conversación"}</span>
                    <button
                      onClick={(e) => handleDelete(t.id, e)}
                      className="opacity-0 group-hover:opacity-100 hover:text-destructive transition shrink-0"
                      aria-label="Eliminar conversación"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Backdrop mobile */}
          {sidebarOpen && (
            <div
              className="absolute inset-0 z-[5] bg-black/40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Columna chat */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <div className="px-3 py-3 border-b border-border flex items-center gap-2 bg-gradient-to-r from-primary/10 to-transparent">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden h-8 w-8 rounded-md hover:bg-accent flex items-center justify-center"
                aria-label="Abrir historial"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="h-9 w-9 flex items-center justify-center shrink-0">
                <BotMark className="h-7 w-7" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm flex items-center gap-1.5 truncate">
                  Conti · Asistente IA
                  <Sparkles className="h-3 w-3 text-primary shrink-0" />
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {activeId
                    ? threads.find((t) => t.id === activeId)?.title ?? "Conversación"
                    : "Nueva conversación · 24/7"}
                </div>
              </div>
              <button
                onClick={handleNew}
                className="lg:hidden h-8 w-8 rounded-md hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="Nuevo chat"
                title="Nuevo chat"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-md hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="Minimizar"
                title="Minimizar (la conversación se conserva)"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {loadingThread ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-xs gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando conversación...
                </div>
              ) : (
                messages.map((m, i) => (
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
                ))
              )}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border/60 rounded-2xl px-3 py-2 text-xs flex items-center gap-2 text-muted-foreground">
                    <BotMark className="h-4 w-4" spin /> Pensando...
                  </div>
                </div>
              )}
              {!loadingThread && messages.length <= 1 && !loading && (
                <div className="grid gap-1.5 pt-1">
                  {sugerencias.map((s: string) => (
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
                disabled={loading || loadingThread}
                className="flex-1 resize-none rounded-lg bg-input/50 border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 max-h-32"
              />
              <Button type="submit" size="icon" variant="hero" disabled={loading || loadingThread || !input.trim()} aria-label="Enviar">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
