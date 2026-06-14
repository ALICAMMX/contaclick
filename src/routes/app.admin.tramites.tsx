import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold } from "@/components/ModuleScaffold";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/app/admin/tramites")({ component: TramPage });

type Tramite = { titulo: string; cliente: string; due: string; level: "verde" | "amarillo" | "rojo" };
const COLS: { title: string; items: Tramite[] }[] = [
  { title: "Pendientes", items: [
    { titulo: "Cambio de domicilio fiscal", cliente: "Constructora Vega", due: "en 18d", level: "verde" },
    { titulo: "Alta de obligaciones", cliente: "Servicios Olmeca", due: "en 9d", level: "amarillo" },
  ]},
  { title: "En proceso", items: [
    { titulo: "Devolución de IVA Q2", cliente: "Grupo Maya", due: "en 4d", level: "amarillo" },
    { titulo: "Respuesta a invitación SAT", cliente: "Distribuidora Norte", due: "en 2d", level: "rojo" },
    { titulo: "Renovación e.firma", cliente: "Ana López (PF)", due: "en 25d", level: "verde" },
  ]},
  { title: "Esperando autoridad", items: [
    { titulo: "Opinión de cumplimiento 32-D", cliente: "Grupo Maya", due: "—", level: "verde" },
  ]},
  { title: "Resueltos", items: [
    { titulo: "Aviso de socios", cliente: "Constructora Vega", due: "✓", level: "verde" },
    { titulo: "Cancelación de CFDI", cliente: "Servicios Olmeca", due: "✓", level: "verde" },
  ]},
];

function TramPage() {
  return (
    <ModuleScaffold
      title="Gestor de Trámites"
      subtitle="Kanban con semáforo automático por vencimiento. La IA prioriza, prepara expedientes y recuerda sin que tengas que perseguir nada."
      icon={<FileText className="h-5 w-5" />}
    >
      <div className="grid md:grid-cols-4 gap-3">
        {COLS.map((col) => (
          <div key={col.title} className="rounded-xl border border-border/60 bg-card/30 p-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground mb-3 px-1">
              <span>{col.title}</span>
              <span className="font-mono">{col.items.length}</span>
            </div>
            <div className="space-y-2">
              {col.items.map((t, i) => {
                const tone = t.level === "rojo" ? "border-red-500/40 bg-red-500/10"
                  : t.level === "amarillo" ? "border-amber-500/40 bg-amber-500/10"
                    : "border-emerald-500/40 bg-emerald-500/10";
                const dot = t.level === "rojo" ? "bg-red-400" : t.level === "amarillo" ? "bg-amber-300" : "bg-emerald-400";
                return (
                  <div key={i} className={`rounded-lg border ${tone} p-3`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`h-2 w-2 rounded-full ${dot}`} />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.due}</span>
                    </div>
                    <div className="text-sm font-medium leading-snug">{t.titulo}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">{t.cliente}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ModuleScaffold>
  );
}
