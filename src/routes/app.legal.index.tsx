import { createFileRoute, Link } from "@tanstack/react-router";
import { ModuleScaffold, KpiTile } from "@/components/ModuleScaffold";
import { Scale, FileSignature, Store, Gavel } from "lucide-react";

export const Route = createFileRoute("/app/legal/")({ component: LegalHome });

const SECCIONES = [
  { t: "Mapa de Lagunas Legales", d: "Detecta huecos normativos y conflictos entre LISR, LIVA y CFF.", icon: Gavel, href: "/app/legal/lagunas" },
  { t: "Redactor de Escritos", d: "Genera escritos de defensa con fundamento TFJA y SCJN.", icon: FileSignature, href: "/app/legal/redactor" },
  { t: "Marketplace Legal", d: "Conecta con despachos especializados que validan y firman estrategias.", icon: Store, href: "/app/legal/marketplace" },
];

function LegalHome() {
  return (
    <ModuleScaffold
      title="Inteligencia Legal"
      subtitle="El Agente de Lagunas Legales cruza tu expediente con TFJA, SCJN y DOF. Detecta oportunidades de devolución, defensas y vacíos normativos."
      icon={<Scale className="h-5 w-5" />}
      badge="Módulo premium · disponible para suscripción Despacho Pro"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Lagunas activas" value="14" hint="vigentes en 2026" accent="primary" />
        <KpiTile label="Oportunidades detectadas" value="3" hint="para este expediente" accent="gold" />
        <KpiTile label="Potencial recuperación" value="$1.4M" accent="success" />
        <KpiTile label="Casos TFJA monitoreados" value="248" accent="primary" />
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-6">
        {SECCIONES.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.t} to={s.href} className="rounded-xl border border-border/60 bg-card/50 p-5 hover:border-[oklch(0.78_0.15_155)]/40 hover:bg-card transition-all">
              <div className="h-10 w-10 rounded-lg bg-[oklch(0.78_0.15_155)]/15 text-[oklch(0.78_0.15_155)] grid place-items-center">
                <Icon className="h-5 w-5" />
              </div>
              <div className="font-medium mt-4">{s.t}</div>
              <p className="text-xs text-muted-foreground mt-1">{s.d}</p>
            </Link>
          );
        })}
      </div>
    </ModuleScaffold>
  );
}
