import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Send, X, Sparkles, Loader2, Minus, Plus, Trash2, MessageSquare, Menu,
  ThumbsUp, ThumbsDown, Compass, BookOpen, FolderOpen,
} from "lucide-react";

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
  registrarFeedbackConti,
} from "@/lib/bot-ayuda.functions";
import { useAuth } from "@/lib/auth";
import { useActiveCliente } from "@/lib/active-cliente";
import { etiquetaModo, MODO_INFO, type ContiModo } from "@/lib/conti/modos";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };
type Thread = { id: string; title: string; updated_at: string };

const MODO_ICONO: Record<ContiModo, typeof Compass> = {
  guia: Compass,
  consulta: BookOpen,
  expediente: FolderOpen,
};

const MODO_CORTO: Record<ContiModo, string> = {
  guia: "Guía",
  consulta: "Consulta",
  expediente: "Expediente",
};


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
  const saludo = name ? `Hola, **${name}**.` : "Hola.";
  const exp = expedienteNombre
    ? `\n\nExpediente activo: **${expedienteNombre}**.`
    : "\n\nNo hay expediente activo: para consultas sobre un contribuyente concreto, selecciónalo en la barra superior.";
  return `${saludo} Soy **Conti**, el copiloto fiscal de ContaClick.

Trabajo en tres modos y tú eliges cuál:

- **Guía de ContaClick** — qué herramienta usar, en qué orden y qué necesita cada una.
- **Consulta fiscal general** — dudas normativas sin datos de un expediente.
- **Trabajar con expediente** — sobre el expediente activo y sólo sobre él.

En esta etapa oriento y explico: no ejecuto acciones ni firmo cifras. Cuando falte información te lo digo en lugar de suponer.${exp}`;
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

  const [modo, setModo] = useState<ContiModo>("guia");

  const sugerencias = useMemo<string[]>(() => {
    if (modo === "guia") {
      return [
        "¿Por dónde empiezo con un cliente nuevo en ContaClick?",
        "¿Qué necesito antes de correr la conciliación integral?",
        "¿Qué herramientas están todavía en beta?",
      ];
    }
    if (modo === "consulta") {
      return [
        "¿Qué obligaciones tiene una persona física en RESICO?",
        "¿Cómo se acredita el IVA de gastos a nombre de la empresa?",
        "¿Qué revisa el SAT en una carta invitación por discrepancia fiscal?",
      ];
    }
    return [
      "¿Qué le falta a este expediente para poder evaluar su salud fiscal?",
      "¿Qué debería revisar primero en este expediente?",
      "¿Qué información hace falta para determinar su riesgo SAT?",
    ];
  }, [modo]);

  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([welcome]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [feedbackDado, setFeedbackDado] = useState<Record<number, boolean>>({});

  const send = useServerFn(sendBotAyuda);
  const listThreads = useServerFn(listBotAyudaThreads);
  const loadThread = useServerFn(loadBotAyudaThread);
  const delThread = useServerFn(deleteBotAyudaThread);
  const enviarFeedback = useServerFn(registrarFeedbackConti);


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
    setFeedbackDado({});
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

  const handleFeedback = async (idx: number, util: boolean, contenido: string) => {
    setFeedbackDado((p) => ({ ...p, [idx]: true }));
    try {
      await enviarFeedback({
        data: {
          threadId: activeId,
          modo,
          util,
          motivo: null,
          comentario: null,
          respuesta: contenido.slice(0, 4000),
        },
      });
      toast.success(util ? "Gracias, lo registramos." : "Gracias: revisaremos esta respuesta.");
    } catch {
      toast.error("No se pudo registrar tu comentario");
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
      const res = await send({
        data: { threadId: activeId, messages: next, modo, clienteId: cliente?.id ?? null },
      });
      if (res.error) {
        toast.error(res.error);
        setMessages(messages);
      } else {
        if (res.modo && res.modo !== modo) setModo(res.modo as ContiModo);
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
                  {etiquetaModo(modo, expedienteNombre)}
                  {activeId ? ` · ${threads.find((t) => t.id === activeId)?.title ?? "Conversación"}` : ""}
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

            {/* Selector de modo — el modo nunca se adivina, lo elige la persona */}
            <div className="px-2.5 py-2 border-b border-border bg-card/40">
              <div className="grid grid-cols-3 gap-1.5">
                {(["guia", "consulta", "expediente"] as ContiModo[]).map((m) => {
                  const Icon = MODO_ICONO[m];
                  const activo = m === modo;
                  const bloqueado = MODO_INFO[m].requiereExpediente && !cliente;
                  return (
                    <button
                      key={m}
                      onClick={() => !bloqueado && setModo(m)}
                      disabled={bloqueado}
                      title={
                        bloqueado
                          ? "Selecciona un expediente activo en la barra superior para usar este modo."
                          : MODO_INFO[m].descripcion
                      }
                      className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium border transition ${
                        activo
                          ? "border-primary/50 bg-primary/15 text-foreground"
                          : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground hover:border-primary/30"
                      } ${bloqueado ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{MODO_CORTO[m]}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
                {MODO_INFO[modo].descripcion}
              </p>
            </div>

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
                        <>
                          <RichMarkdown compact>{m.content}</RichMarkdown>
                          {i > 0 && (
                            <div className="mt-2 pt-1.5 border-t border-border/50 flex items-center gap-2 text-[10px] text-muted-foreground">
                              {feedbackDado[i] ? (
                                <span>Gracias por tu valoración.</span>
                              ) : (
                                <>
                                  <span>¿Te sirvió?</span>
                                  <button
                                    onClick={() => handleFeedback(i, true, m.content)}
                                    className="hover:text-emerald-500 transition"
                                    aria-label="Respuesta útil"
                                    title="Sí, me sirvió"
                                  >
                                    <ThumbsUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleFeedback(i, false, m.content)}
                                    className="hover:text-destructive transition"
                                    aria-label="Respuesta no útil"
                                    title="No, revísenla"
                                  >
                                    <ThumbsDown className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </>
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
