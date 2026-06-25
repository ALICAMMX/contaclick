import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold, KpiTile } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { ShieldCheck, CheckCircle2, AlertCircle, Circle } from "lucide-react";

export const Route = createFileRoute("/app/admin/cumplimiento")({ component: CumplimientoPage });

type Item = { label: string; due: string; status: "ok" | "warn" | "soon" };
const SECTIONS: { title: string; items: Item[] }[] = [
  { title: "IMSS", items: [
    { label: "Determinación mensual de cuotas", due: "Día 17", status: "ok" },
    { label: "Aviso de modificación de salario", due: "Continuo", status: "ok" },
    { label: "DICCIÓN anual de riesgos de trabajo", due: "Feb 2027", status: "soon" },
    { label: "SUA Noviembre", due: "en 5 días", status: "warn" },
  ]},
  { title: "INFONAVIT", items: [
    { label: "Cuotas bimestrales", due: "en 18 días", status: "ok" },
    { label: "Movimientos afiliatorios", due: "Continuo", status: "ok" },
  ]},
  { title: "SAT (laboral)", items: [
    { label: "CFDI de nómina timbrado", due: "Cada pago", status: "ok" },
    { label: "Declaración anual asimilados", due: "Feb 2027", status: "soon" },
    { label: "DIM informativa", due: "vencida hace 2d", status: "warn" },
  ]},
  { title: "STPS", items: [
    { label: "NOM-035 evaluación", due: "Oct 2027", status: "soon" },
    { label: "Comisión Mixta de Seguridad", due: "Vigente", status: "ok" },
  ]},
];

function CumplimientoPage() {
  const total = SECTIONS.flatMap((s) => s.items).length;
  const ok = SECTIONS.flatMap((s) => s.items).filter((i) => i.status === "ok").length;
  const pct = Math.round((ok / total) * 100);

  return (
    <ModuleScaffold
      title="Cumplimiento Laboral"
      subtitle="Checklist en tiempo real de tus obligaciones IMSS, INFONAVIT, SAT y STPS. La IA detecta cambios normativos y ajusta el calendario."
      icon={<ShieldCheck className="h-5 w-5" /
      actions={<HerramientaHelp slug="admin-cumplimiento" />}
    >}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Cumplimiento" value={`${pct}%`} accent="success" />
        <KpiTile label="Obligaciones OK" value={`${ok}/${total}`} accent="primary" />
        <KpiTile label="Alertas activas" value="2" hint="1 vencida" accent="destructive" />
        <KpiTile label="Próximas 30d" value="4" accent="warning" />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-6">
        {SECTIONS.map((s) => (
          <div key={s.title} className="rounded-xl border border-border/60 bg-card/50 p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{s.title}</div>
            <ul className="space-y-2">
              {s.items.map((i) => {
                const Icon = i.status === "ok" ? CheckCircle2 : i.status === "warn" ? AlertCircle : Circle;
                const tone = i.status === "ok" ? "text-emerald-400" : i.status === "warn" ? "text-amber-300" : "text-muted-foreground";
                return (
                  <li key={i.label} className="flex items-center gap-3 text-sm py-1.5">
                    <Icon className={`h-4 w-4 ${tone} shrink-0`} />
                    <span className="flex-1 truncate">{i.label}</span>
                    <span className={`text-xs font-mono ${tone}`}>{i.due}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </ModuleScaffold>
  );
}
