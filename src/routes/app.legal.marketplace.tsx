import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { Store, Star } from "lucide-react";
import { SyntheticDataBanner } from "@/components/CapabilityCard";

export const Route = createFileRoute("/app/legal/marketplace")({ component: MarketPage });

// Contenido ilustrativo: la red de despachos todavía no está contratada.
// Ningún control aquí puede enviar una solicitud real.
const DESPACHOS = [
  { n: "Despacho ejemplo · Fiscalistas", esp: "Devoluciones IVA · Amparo fiscal", ciudad: "CDMX", rating: 4.9, casos: 184, honorario: "$8K – $25K" },
  { n: "Despacho ejemplo · Tax Defense", esp: "Materialidad · 69-B", ciudad: "Monterrey", rating: 4.8, casos: 142, honorario: "$12K – $40K" },
  { n: "Despacho ejemplo · Corporativo", esp: "Precios de transferencia · Reestructuras", ciudad: "Guadalajara", rating: 4.7, casos: 98, honorario: "$25K – $80K" },
  { n: "Despacho ejemplo · Contencioso", esp: "Juicio Contencioso TFJA", ciudad: "Puebla", rating: 4.9, casos: 220, honorario: "$15K – $50K" },
  { n: "Despacho ejemplo · Penal Fiscal", esp: "Defraudación fiscal · Amparo penal", ciudad: "CDMX", rating: 5.0, casos: 64, honorario: "$40K+" },
  { n: "Despacho ejemplo · Aduanal", esp: "Importación · Precios estimados", ciudad: "Manzanillo", rating: 4.6, casos: 120, honorario: "$10K – $30K" },
];

function MarketPage() {
  return (
    <ModuleScaffold
      title="Marketplace Legal"
      subtitle="Red de despachos especializados para casos que superan tu especialidad. La red aún no está habilitada: lo que ves es un ejemplo de cómo funcionará."
      icon={<Store className="h-5 w-5" />}
      estado="demostracion"
      actions={<HerramientaHelp slug="legal-marketplace" />}
    >
      <SyntheticDataBanner mensaje="Los despachos listados son ejemplos ilustrativos, no proveedores reales. No es posible solicitar cotizaciones todavía y no se envía ninguna información." />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {DESPACHOS.map((d, i) => (
          <div key={i} className="rounded-xl border border-dashed border-amber-500/30 bg-card/40 p-5">
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
            <button
              disabled
              title="La red de despachos aún no está habilitada"
              className="mt-4 w-full h-9 rounded-md border border-border bg-muted text-muted-foreground text-xs font-medium cursor-not-allowed"
            >
              Solicitar cotización (no disponible)
            </button>
          </div>
        ))}
      </div>
    </ModuleScaffold>
  );
}
