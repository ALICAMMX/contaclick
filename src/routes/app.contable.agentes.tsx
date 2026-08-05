import { createFileRoute, Link } from "@tanstack/react-router";
import { ModuleScaffold } from "@/components/ModuleScaffold";
import { Bot, Sparkles } from "lucide-react";
import { AGENTES, contadoresAgentes, getCapability } from "@/lib/capabilities/registry";
import { controlesPermitidos } from "@/lib/capabilities/access";
import { MaturityBadge } from "@/components/CapabilityCard";

export const Route = createFileRoute("/app/contable/agentes")({ component: AgentesPage });

function AgentesPage() {
  const c = contadoresAgentes();
  return (
    <ModuleScaffold
      title="Agentes Contables-Fiscales"
      subtitle={`${c.operativos} agentes operativos y ${c.proximamente} en desarrollo. Un agente operativo se ejecuta sobre tu expediente activo y siempre deja bitácora; los que están en desarrollo no ejecutan nada.`}
      icon={<Bot className="h-5 w-5" />}
      estado="operativa_limitada"
    >
      <div className="grid md:grid-cols-2 gap-4">
        {AGENTES.map((a) => {
          const operativo = a.estado === "operativo";
          const controles = controlesPermitidos(a.estado, false);
          return (
            <div key={a.id} className="rounded-xl border border-border/60 bg-card/50 p-5">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30 grid place-items-center text-primary shrink-0">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">Agente {a.nombre}</div>
                  <div className="text-xs text-muted-foreground">{a.rol}</div>
                </div>
                <MaturityBadge madurez={operativo ? "operativa" : "proximamente"} />
              </div>

              <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                <span className="text-muted-foreground">Disparador</span><span>{a.trigger}</span>
                <span className="text-muted-foreground">Datos que usa</span><span>{a.datos}</span>
                <span className="text-muted-foreground">Herramientas</span>
                <span>{a.herramientas.map((h) => getCapability(h)?.nombre ?? h).join(" · ")}</span>
                <span className="text-muted-foreground">Acciones externas</span>
                <span>{a.accionesExternas.length ? a.accionesExternas.join(", ") : "Ninguna: no envía ni presenta nada por ti"}</span>
                <span className="text-muted-foreground">Créditos</span>
                <span>{a.consumeCreditos ? "Consume créditos de IA" : "No consume créditos"}</span>
                <span className="text-muted-foreground">Aprobación</span>
                <span>{a.requiereAprobacionHumana ? "Propone; tú apruebas" : "Automático"}</span>
                <span className="text-muted-foreground">Bitácora</span>
                <span>{a.tieneBitacora ? "Sí, con historial auditable" : "No aplica"}</span>
                {operativo && <><span className="text-muted-foreground">Si falla</span><span>{a.ante_fallo}</span></>}
              </div>

              <div className="mt-4 pt-3 border-t border-border/40">
                {operativo && a.ruta ? (
                  <Link
                    to={a.ruta}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {controles.includes("pausar") ? "Administrar agente" : "Abrir agente"}
                  </Link>
                ) : (
                  <p className="text-xs text-muted-foreground">{a.mensajeNoDisponible}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ModuleScaffold>
  );
}
