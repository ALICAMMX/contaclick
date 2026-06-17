import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold } from "@/components/ModuleScaffold";
import { Store, Star } from "lucide-react";

export const Route = createFileRoute("/app/legal/marketplace")({ component: MarketPage });

const DESPACHOS = [
  { n: "Rivera & Asociados Fiscalistas", esp: "Devoluciones IVA · Amparo fiscal", ciudad: "CDMX", rating: 4.9, casos: 184, honorario: "$8K – $25K" },
  { n: "Bufete Olmeda Tax Defense", esp: "Materialidad · 69-B", ciudad: "Monterrey", rating: 4.8, casos: 142, honorario: "$12K – $40K" },
  { n: "Méndez Corporativo", esp: "Precios de transferencia · Reestructuras", ciudad: "Guadalajara", rating: 4.7, casos: 98, honorario: "$25K – $80K" },
  { n: "Aguilar Abogados Tributarios", esp: "Juicio Contencioso TFJA", ciudad: "Puebla", rating: 4.9, casos: 220, honorario: "$15K – $50K" },
  { n: "Salinas & Vega Penal Fiscal", esp: "Defraudación fiscal · Amparo penal", ciudad: "CDMX", rating: 5.0, casos: 64, honorario: "$40K+" },
  { n: "Torres Aduanal Group", esp: "Importación · Precios estimados", ciudad: "Manzanillo", rating: 4.6, casos: 120, honorario: "$10K – $30K" },
];

function MarketPage() {
  return (
    <ModuleScaffold
      title="Marketplace Legal"
      subtitle="Cuando un caso supera tu especialidad, conecta con despachos verificados que validan y firman tu estrategia. La IA prepara el expediente, ellos defienden."
      icon={<Store className="h-5 w-5" />}
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {DESPACHOS.map((d, i) => (
          <div key={i} className="rounded-xl border border-border/60 bg-card/50 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold truncate">{d.n}</div>
                <div className="text-xs text-muted-foreground">{d.ciudad}</div>
              </div>
              <div className="flex items-center gap-1 text-xs text-[oklch(0.85_0.13_85)] shrink-0">
                <Star className="h-3.5 w-3.5 fill-current" /> {d.rating}
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-3">Especialidad</div>
            <div className="text-sm">{d.esp}</div>
            <div className="mt-4 pt-3 border-t border-border/40 grid grid-cols-2 gap-2 text-xs">
              <div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Casos</div><div className="font-mono">{d.casos}</div></div>
              <div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Honorarios</div><div className="font-mono text-[oklch(0.85_0.13_85)]">{d.honorario}</div></div>
            </div>
            <button className="mt-4 w-full h-9 rounded-md bg-gradient-to-r from-[oklch(0.62_0.15_155)] to-[oklch(0.72_0.14_155)] text-white text-xs font-medium">Solicitar cotización</button>
          </div>
        ))}
      </div>
    </ModuleScaffold>
  );
}
