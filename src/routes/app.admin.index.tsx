import { createFileRoute } from "@tanstack/react-router";
import { catalogo, contadores } from "@/lib/capabilities/registry";
import { CapabilityCard } from "@/components/CapabilityCard";

export const Route = createFileRoute("/app/admin/")({ component: AdminCatalog });

const TOOLS = catalogo("administrativo");
const GROUPS = ["1 · Operación diaria", "2 · Comunicaciones", "3 · Personal & RH", "4 · Patrimonio"];

function AdminCatalog() {
  const c = contadores("administrativo");
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-gold mb-2">
            <span className="h-1 w-6 bg-gold" /> Módulo 2
          </div>
          <h1 className="serif text-3xl text-foreground">Administrativo & RH</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Todo lo que tu despacho o pyme necesita más allá del SAT. {c.total} herramientas disponibles;
            cada tarjeta declara su estado real.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-medium">{c.operativas} operativas</span>
          {c.beta > 0 && <span className="px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary font-medium">{c.beta} beta</span>}
        </div>
      </header>

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
              {items.map((t) => <CapabilityCard key={t.id} capability={t} accent="gold" />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
