import { createFileRoute } from "@tanstack/react-router";
import { Bot, Sparkles, MessageSquare, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolShell } from "@/components/ToolShell";
import { useActiveCliente } from "@/lib/active-cliente";

export const Route = createFileRoute("/app/tools/fiscal-assistant")({
  component: FiscalAssistantCard,
});

function FiscalAssistantCard() {
  const { cliente } = useActiveCliente();

  const openBot = () => {
    window.dispatchEvent(new CustomEvent("open-bot-ayuda"));
  };

  return (
    <ToolShell
      helpSlug="fiscal-assistant"
      title="Asistente Fiscal IA"
      description="Ahora integrado con Conti, el asistente IA de ContaClick: chat especializado en fiscal, contable y soporte de tu expediente activo."
      icon={<Bot className="h-5 w-5 text-primary-foreground" />}
      requireCliente={false}
    >
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8 space-y-6">
        <div className="flex items-start gap-4">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            <Bot className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              Bot de Ayuda ContaClick
              <Sparkles className="h-4 w-4 text-primary" />
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Asistente especializado en materia fiscal, contable y administrativa para contadores y despachos en
              México. Responde con fundamento, cita fuentes oficiales y se conecta con tus herramientas y expediente
              activo.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border/60 bg-card/60 p-4">
            <MessageSquare className="h-4 w-4 text-primary mb-2" />
            <div className="text-sm font-medium">Chat con historial</div>
            <p className="text-xs text-muted-foreground mt-1">
              Crea, recupera y elimina conversaciones. Tu historial se conserva entre sesiones.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 p-4">
            <Sparkles className="h-4 w-4 text-primary mb-2" />
            <div className="text-sm font-medium">Especializado MX</div>
            <p className="text-xs text-muted-foreground mt-1">
              CFDI 4.0, ISR, IVA, RESICO, IMSS, nómina y procedimientos SAT con nivel de confianza en cada respuesta.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 p-4">
            <FileText className="h-4 w-4 text-primary mb-2" />
            <div className="text-sm font-medium">Sobre tu expediente</div>
            <p className="text-xs text-muted-foreground mt-1">
              {cliente
                ? `Atiende consultas del expediente activo: ${cliente.razon_social} (${cliente.rfc}).`
                : "Selecciona un expediente y el bot podrá ayudarte con asuntos puntuales del mismo."}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
          <Button variant="hero" size="lg" onClick={openBot} className="gap-2">
            <Bot className="h-4 w-4" /> Abrir Bot de Ayuda
          </Button>
          <p className="text-xs text-muted-foreground">
            También está disponible siempre desde el botón flotante en la esquina inferior derecha.
          </p>
        </div>
      </div>
    </ToolShell>
  );
}
