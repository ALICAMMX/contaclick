import { createFileRoute, Link } from "@tanstack/react-router";
import { Calculator, Briefcase, Scale, ArrowRight, FileText, ShieldAlert, Users, TrendingUp, Mail, Banknote, UserRound, Plus, X } from "lucide-react";
import { useActiveCliente } from "@/lib/active-cliente";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listClientes } from "@/lib/clientes.functions";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/app/")({ component: Hub });

const MODULES = [
  {
    key: "contable",
    title: "Contable & Fiscal",
    short: "Cumplimiento, CFDI, declaraciones, defensa SAT.",
    description: "22 herramientas + 8 agentes IA para tu cumplimiento fiscal mensual y anual.",
    href: "/app/contable",
    icon: Calculator,
    accent: "var(--module-contable)",
    bullets: ["Validador CFDI 4.0", "Riesgo SAT 2026", "Conciliación bancaria", "ISR / IVA / RESICO"],
    counts: { tools: 22, live: 11 },
  },
  {
    key: "admin",
    title: "Administrativo & RH",
    short: "Nómina, trámites, tesorería, activos.",
    description: "Todo lo que tu despacho o pyme necesita más allá del SAT. 10 herramientas, 7 agentes.",
    href: "/app/admin",
    icon: Briefcase,
    accent: "var(--module-admin)",
    bullets: ["Nómina IA · IMSS · INFONAVIT", "Tesorería y flujo de caja", "Trámites con semáforo", "Activos fijos & inventarios"],
    counts: { tools: 10, live: 0 },
  },
] as const;

function Hub() {
  return (
    <div className="space-y-10">
      {/* Welcome */}
      <section className="text-center pt-6 pb-2">
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
          <span className="h-1 w-8 bg-gold" /> Plataforma ContaClick IA
        </div>
        <h1 className="serif text-4xl md:text-5xl text-foreground">
          ¿Qué quieres hacer hoy?
        </h1>
        <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
          Selecciona tu módulo de trabajo. Cada módulo es independiente — entra, usa la herramienta, regresa cuando quieras.
        </p>
      </section>

      {/* Expediente activo */}
      <ExpedienteBar />

      {/* Two big modules */}
      <section className="grid md:grid-cols-2 gap-5">
        {MODULES.map((m) => <ModuleCard key={m.key} m={m} />)}
      </section>

      {/* Legal — secondary card */}
      <section>
        <Link
          to="/app/legal"
          className="group block rounded-2xl border border-border bg-card hover:border-[oklch(0.50_0.14_155)]/40 hover:shadow-[var(--shadow-card)] transition-all p-6"
        >
          <div className="flex items-center gap-5">
            <div
              className="h-14 w-14 rounded-xl grid place-items-center shrink-0"
              style={{ background: "color-mix(in oklab, var(--module-legal) 15%, transparent)", color: "var(--module-legal)" }}
            >
              <Scale className="h-7 w-7" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Inteligencia Legal</h2>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full glass-gold">Premium</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Detecta lagunas legales con TFJA / SCJN, redacta escritos de defensa y conecta con despachos especializados.
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all shrink-0" />
          </div>
        </Link>
      </section>

      {/* Quick access */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accesos rápidos</h3>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { icon: ShieldAlert, label: "Riesgo SAT", href: "/app/riesgo" },
            { icon: FileText, label: "CFDI", href: "/app/cfdi" },
            { icon: Banknote, label: "Conciliación", href: "/app/conciliacion" },
            { icon: Mail, label: "Buzón", href: "/app/mensajes" },
            { icon: TrendingUp, label: "Tesorería", href: "/app/admin/tesoreria" },
            { icon: Users, label: "Expedientes", href: "/app/expedientes" },
          ].map((q) => {
            const I = q.icon;
            return (
              <Link key={q.label} to={q.href} className="flex items-center gap-2 rounded-lg border border-border bg-card hover:bg-accent px-3 py-2.5 text-sm transition-colors">
                <I className="h-4 w-4 text-primary" />
                <span className="truncate">{q.label}</span>
              </Link>
            );
          })}
        </div>
      </section>
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

function ModuleCard({ m }: { m: typeof MODULES[number] }) {
  const Icon = m.icon;
  return (
    <Link
      to={m.href}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)] transition-all"
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: m.accent }}
      />
      <div
        className="absolute -top-16 -right-16 h-48 w-48 rounded-full opacity-10 blur-3xl"
        style={{ background: m.accent }}
      />
      <div className="relative flex items-start justify-between">
        <div
          className="h-14 w-14 rounded-xl grid place-items-center"
          style={{ background: `color-mix(in oklab, ${m.accent} 15%, transparent)`, color: m.accent }}
        >
          <Icon className="h-7 w-7" />
        </div>
        <div className="text-right">
          <div className="text-3xl serif" style={{ color: m.accent }}>{m.counts.tools}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">herramientas</div>
        </div>
      </div>
      <h2 className="relative serif text-2xl mt-5">{m.title}</h2>
      <p className="relative text-sm text-muted-foreground mt-1">{m.short}</p>
      <p className="relative text-xs text-muted-foreground mt-3 leading-relaxed">{m.description}</p>

      <ul className="relative grid grid-cols-2 gap-x-3 gap-y-1.5 mt-5 text-xs">
        {m.bullets.map((b) => (
          <li key={b} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-1 w-1 rounded-full" style={{ background: m.accent }} />
            <span className="truncate">{b}</span>
          </li>
        ))}
      </ul>

      <div className="relative mt-6 flex items-center justify-between pt-5 border-t border-border">
        <span className="text-xs text-muted-foreground">
          {m.counts.live > 0 ? `${m.counts.live} en vivo · resto en construcción` : "Vista previa · módulo en construcción"}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium group-hover:gap-2.5 transition-all" style={{ color: m.accent }}>
          Entrar <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
