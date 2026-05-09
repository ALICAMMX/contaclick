import { createFileRoute, Link } from "@tanstack/react-router";
import { TOOLS, CATEGORY_ORDER } from "@/lib/tools/registry";
import { useActiveCliente } from "@/lib/active-cliente";
import { UserRound, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/app/tools/")({
  component: ToolsCatalog,
});

function ToolsCatalog() {
  const { cliente } = useActiveCliente();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Herramientas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suite de herramientas fiscales especializadas. Cada una trabaja de forma independiente sobre el expediente activo.
        </p>
      </div>

      <div className={`rounded-xl px-4 py-3 border flex items-center gap-3 text-sm ${
        cliente ? "border-primary/30 bg-primary/5" : "border-warning/40 bg-warning/5"
      }`}>
        {cliente ? (
          <>
            <UserRound className="h-4 w-4 text-primary" />
            <span>
              Trabajando sobre <span className="font-semibold">{cliente.razon_social}</span>{" "}
              <span className="text-muted-foreground font-mono text-xs">({cliente.rfc})</span>
            </span>
          </>
        ) : (
          <>
            <AlertCircle className="h-4 w-4 text-warning" />
            <span className="text-muted-foreground">
              No hay expediente activo. Selecciona uno arriba o{" "}
              <Link to="/app/clientes" className="text-primary hover:underline">crea uno nuevo</Link>.
            </span>
          </>
        )}
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const items = TOOLS.filter((t) => t.category === cat);
        if (items.length === 0) return null;
        return (
          <section key={cat} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat}</h2>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((t) => {
                const Icon = t.icon;
                const soon = t.status === "soon";
                const card = (
                  <div className={`group rounded-xl p-5 border bg-card/50 h-full transition-all ${
                    soon ? "border-border/40 opacity-70" : "border-border/60 hover:border-primary/40 hover:bg-card hover:-translate-y-0.5"
                  }`}>
                    <div className="flex items-start justify-between mb-4">
                      <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/15 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      {soon && <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Pronto</span>}
                    </div>
                    <div className="font-medium mb-1">{t.name}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{t.description}</p>
                  </div>
                );
                return soon ? (
                  <div key={t.key} className="cursor-not-allowed">{card}</div>
                ) : (
                  <Link key={t.key} to={t.route}>{card}</Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
