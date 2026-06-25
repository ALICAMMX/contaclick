import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold, DemoCard } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { MessageSquare, Sparkles } from "lucide-react";

export const Route = createFileRoute("/app/admin/correspondencia")({ component: CorPage });

const PLANTILLAS = [
  { t: "Minuta de reunión con cliente", d: "Captura puntos, acuerdos y responsables." },
  { t: "Respuesta a oficio SAT", d: "Formato oficial con fundamento legal y datos del expediente." },
  { t: "Carta de aceptación de servicio", d: "Despacho ↔ cliente, alcance y honorarios." },
  { t: "Recordatorio de pago", d: "Tono cordial con desglose de saldo." },
  { t: "Acta de entrega de información", d: "Para auditorías y traspasos." },
  { t: "Notificación de cambio normativo", d: "Comunica reformas relevantes al cliente." },
];

function CorPage() {
  return (
    <ModuleScaffold
      title="Correspondencia & Minutas"
      subtitle="Generador de oficios, minutas y respuestas con tono profesional. Cada documento incluye fundamento legal cuando aplica."
      icon={<MessageSquare className="h-5 w-5" />}
      actions={<HerramientaHelp slug="admin-correspondencia" />}
    >
      <div className="grid md:grid-cols-[1fr_1.4fr] gap-4">
        <DemoCard title="Plantillas disponibles">
          <ul className="space-y-2">
            {PLANTILLAS.map((p, i) => (
              <li key={i} className="rounded-lg border border-border/40 bg-background/40 p-3 hover:border-primary/40 cursor-pointer transition-colors">
                <div className="text-sm font-medium">{p.t}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{p.d}</div>
              </li>
            ))}
          </ul>
        </DemoCard>

        <DemoCard title="Editor inteligente">
          <div className="rounded-lg border border-border/40 bg-background/60 p-4 font-mono text-xs leading-relaxed text-muted-foreground min-h-[280px]">
            <div className="text-foreground">Asunto: Respuesta a invitación INV-2026-0421</div>
            <div className="mt-2">Estimados representantes de la Administración Desconcentrada:</div>
            <div className="mt-2">En atención a la invitación recibida con fecha 14 de junio de 2026, mediante la cual se solicita información respecto al IVA acreditable del tercer trimestre de 2026, manifestamos lo siguiente…</div>
            <div className="mt-4 text-primary">[La IA está redactando el cuerpo con fundamento en el artículo 5° de la LIVA y criterio normativo 28/IVA/N…]</div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5" /> Generar con IA
            </button>
            <button className="h-9 px-3 rounded-md border border-border/60 bg-card/40 text-xs">Exportar Word</button>
            <button className="h-9 px-3 rounded-md border border-border/60 bg-card/40 text-xs">Exportar PDF</button>
          </div>
        </DemoCard>
      </div>
    </ModuleScaffold>
  );
}
