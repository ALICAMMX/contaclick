import { createFileRoute } from "@tanstack/react-router";
import { catalogo, contadores } from "@/lib/capabilities/registry";
import { CapabilityCard, SyntheticDataBanner } from "@/components/CapabilityCard";

export const Route = createFileRoute("/app/legal/")({ component: LegalCatalog });

const TOOLS = catalogo("legal");
const GROUPS = ["Análisis", "Redacción", "Red profesional"];

function LegalCatalog() {
  const c = contadores("legal");
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "var(--module-legal)" }}>
            <span className="h-1 w-6" style={{ background: "var(--module-legal)" }} /> Módulo Premium
          </div>
          <h1 className="serif text-3xl text-foreground">Inteligencia Legal</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Análisis y redacción con fundamento. Disponible en los planes Profesional y Despacho.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {c.beta > 0 && <span className="px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary font-medium">{c.beta} beta</span>}
          {c.demo > 0 && <span className="px-2.5 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium">{c.demo} demostración</span>}
        </div>
      </header>

      {c.demo > 0 && (
        <SyntheticDataBanner mensaje="Dos funciones de este módulo (Mapa de Lagunas y Marketplace) son demostrativas: su contenido es ilustrativo, no analiza tus expedientes y no genera entregables." />
      )}

      {GROUPS.map((g) => {
        const items = TOOLS.filter((t) => t.grupo === g);
        if (!items.length) return null;
        return (
          <section key={g} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</h2>
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] text-muted-foreground tabular-nums">{items.length}</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((t) => <CapabilityCard key={t.id} capability={t} accent="legal" />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
