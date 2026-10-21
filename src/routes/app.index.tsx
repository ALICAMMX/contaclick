import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Plus, X, UserRound, LayoutGrid, Route as RouteIcon, ChevronDown } from "lucide-react";
import { UsageProfileCard } from "@/components/UsageProfileCard";
import { useActiveCliente } from "@/lib/active-cliente";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listClientes } from "@/lib/clientes.functions";
import { useEffect, useRef, useState } from "react";
import { FLUJO_MENSUAL, herramientasApoyo } from "@/lib/capabilities/enfoque";

export const Route = createFileRoute("/app/")({ component: Hub });

// El inicio muestra UN flujo de trabajo (las seis pantallas del mes) y deja
// las herramientas de apoyo plegadas. Lo que está fuera del foco no aparece;
// ver src/lib/capabilities/enfoque.ts.
function Hub() {
  const apoyo = herramientasApoyo();
  const totalApoyo = apoyo.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="space-y-8">
      <section className="text-center pt-6 pb-2">
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
          <span className="h-1 w-8 bg-gold" /> ContaClick IA
        </div>
        <h1 className="serif text-4xl md:text-5xl text-foreground">El mes de tus clientes, en orden</h1>
        <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
          Descarga del SAT, revisión, conciliación, pólizas y cierre. Lo que preparas aquí lo importas a tu sistema
          contable de siempre.
        </p>
      </section>

      <ExpedienteBar />

      <section className="grid sm:grid-cols-2 gap-3 max-w-3xl mx-auto">
        <Link
          to="/app/inicio-guiado"
          className="group flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 hover:bg-primary/10 p-4 transition-colors"
        >
          <RouteIcon className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Ruta guiada del expediente</div>
            <div className="text-xs text-muted-foreground">Qué falta este mes, paso por paso.</div>
          </div>
          <ArrowRight className="h-4 w-4 text-primary group-hover:translate-x-0.5 transition-transform" />
        </Link>
        <Link
          to="/app/despacho"
          className="group flex items-center gap-3 rounded-xl border border-border bg-card hover:bg-accent p-4 transition-colors"
        >
          <LayoutGrid className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Cartera del despacho</div>
            <div className="text-xs text-muted-foreground">Todos tus RFC y su avance del mes.</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Flujo del mes</h3>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FLUJO_MENSUAL.map((p) => (
            <Link
              key={p.id}
              to={p.ruta}
              className="group rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-[var(--shadow-card)] p-5 transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-semibold shrink-0">
                  {p.numero}
                </span>
                <div className="font-medium">{p.titulo}</div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{p.descripcion}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <UsageProfileCard />
      </section>

      {totalApoyo > 0 && (
        <details className="group rounded-xl border border-border bg-card">
          <summary className="cursor-pointer list-none flex items-center justify-between p-4 text-sm">
            <span className="font-medium">Herramientas de apoyo · {totalApoyo}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground group-open:rotate-180 transition-transform" />
          </summary>
          <div className="px-4 pb-4 space-y-4">
            {apoyo.map((g) => (
              <div key={g.grupo} className="space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">{g.grupo}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {g.items.map((c) => (
                    <Link
                      key={c.id}
                      to={c.ruta}
                      className="flex items-center gap-2 rounded-lg border border-border hover:bg-accent hover:border-primary/40 px-3 py-2.5 text-sm transition-colors min-w-0"
                    >
                      <span className="truncate">{c.nombre}</span>
                      {c.madurez === "beta" && (
                        <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground">beta</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ExpedienteBar() {
  const { cliente, setCliente } = useActiveCliente();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fetchClientes = useServerFn(listClientes);
  const { data } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => fetchClientes(),
    enabled: open,
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <section className="max-w-3xl mx-auto">
      <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4">
        <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
          <UserRound className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Expediente activo</div>
          {cliente ? (
            <div className="flex items-baseline gap-2 min-w-0">
              <div className="font-semibold truncate">{cliente.razon_social}</div>
              <div className="text-xs font-mono text-muted-foreground shrink-0">{cliente.rfc}</div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Aún no has seleccionado un expediente.</div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0" ref={ref}>
          {cliente && (
            <button
              onClick={() => setCliente(null)}
              className="hidden sm:inline-flex items-center gap-1 h-9 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Quitar expediente"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-background hover:bg-accent text-sm transition-colors"
            >
              {cliente ? "Cambiar" : "Elegir"}
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-80 rounded-lg border border-border bg-popover shadow-xl z-40 overflow-hidden">
                <div className="max-h-72 overflow-y-auto py-1">
                  {(data?.clientes ?? []).length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No tienes expedientes aún.
                    </div>
                  ) : (
                    (data?.clientes ?? []).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCliente({ id: c.id, rfc: c.rfc, razon_social: c.razon_social, regimen_fiscal: c.regimen_fiscal });
                          setOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 hover:bg-accent text-sm ${cliente?.id === c.id ? "bg-primary/10" : ""}`}
                      >
                        <div className="font-medium truncate">{c.razon_social}</div>
                        <div className="text-xs text-muted-foreground font-mono">{c.rfc}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <Link
            to="/app/clientes"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground hover:opacity-90 text-sm font-medium transition-opacity"
          >
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Cargar nuevo expediente</span><span className="sm:hidden">Nuevo</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
