import { createFileRoute, Link } from "@tanstack/react-router";
import { Calculator, Briefcase, Scale, ArrowRight, FileText, ShieldAlert, Users, TrendingUp, Mail, Banknote, UserRound, Plus, X, Calendar, ListChecks, Workflow as WorkflowIcon, Activity, RefreshCw, FileSignature, ScanSearch, Bot, FileBadge, FileStack, ShieldCheck, Coins, Globe, Building, Boxes, MessageSquare, Gavel, Store } from "lucide-react";
import { UsageProfileCard } from "@/components/UsageProfileCard";
import { useActiveCliente } from "@/lib/active-cliente";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listClientes } from "@/lib/clientes.functions";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/app/")({ component: Hub });

const CONTABLE_GROUPS = [
  "Operación diaria",
  "Fiscal · SAT",
  "Herramientas contables",
  "Conciliación y contabilidad",
  "Reportes",
  "Agentes IA",
];
const ADMIN_GROUPS = ["Administrativo & RH"];

const MODULES = [
  {
    key: "contable",
    title: "Contable y Fiscal",
    short: "Cumplimiento, CFDI, declaraciones, defensa SAT.",
    description: "Cumplimiento fiscal mensual y anual con agentes IA integrados.",
    href: "/app/contable",
    icon: Calculator,
    accent: "var(--module-contable)",
    bullets: ["Validador CFDI 4.0", "Riesgo SAT 2026", "Conciliación bancaria", "ISR / IVA / RESICO"],
    groups: CONTABLE_GROUPS,
  },
  {
    key: "admin",
    title: "Administrativo & RH",
    short: "Nómina, trámites, tesorería, activos.",
    description: "Todo lo que tu despacho o pyme necesita más allá del SAT.",
    href: "/app/admin",
    icon: Briefcase,
    accent: "var(--module-admin)",
    bullets: ["Nómina IA · IMSS · INFONAVIT", "Tesorería y flujo de caja", "Trámites con semáforo", "Activos fijos & inventarios"],
    groups: ADMIN_GROUPS,
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

      {/* Plan & uso */}
      <section className="w-full">
        <UsageProfileCard />
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

      {/* Catálogo completo de herramientas */}
      <AllToolsCatalog />
    </div>
  );
}

const ALL_TOOLS: { label: string; href: string; icon: any; group: string }[] = [
  // Operación diaria
  { label: "Calendario fiscal", href: "/app/calendario", icon: Calendar, group: "Operación diaria" },
  { label: "Centro de Tareas", href: "/app/tareas", icon: ListChecks, group: "Operación diaria" },
  { label: "Workflow Automático", href: "/app/workflows", icon: WorkflowIcon, group: "Operación diaria" },
  { label: "Mensajería IA", href: "/app/mensajes", icon: Mail, group: "Operación diaria" },
  { label: "Expedientes", href: "/app/clientes", icon: Users, group: "Operación diaria" },

  // Fiscal SAT
  { label: "Salud Fiscal", href: "/app/salud-fiscal", icon: Activity, group: "Fiscal · SAT" },
  { label: "Riesgo SAT 2026", href: "/app/riesgo", icon: ShieldAlert, group: "Fiscal · SAT" },
  { label: "Descarga Masiva SAT", href: "/app/sat-sync", icon: RefreshCw, group: "Fiscal · SAT" },
  { label: "CFDI del expediente", href: "/app/cfdi", icon: FileText, group: "Fiscal · SAT" },
  { label: "RFC vinculados", href: "/app/rfcs-vinculados", icon: FileBadge, group: "Fiscal · SAT" },

  // Herramientas Contable/Fiscal
  { label: "Lector de Constancia (CSF)", href: "/app/tools/csf-parser", icon: FileBadge, group: "Herramientas contables" },
  { label: "Validador CFDI 4.0", href: "/app/tools/cfdi-validator", icon: FileText, group: "Herramientas contables" },
  { label: "Verificador de UUID", href: "/app/tools/cfdi-verifier", icon: ShieldCheck, group: "Herramientas contables" },
  { label: "Lector masivo de XML", href: "/app/tools/xml-bulk-reader", icon: FileStack, group: "Herramientas contables" },
  { label: "Auditor express", href: "/app/tools/express-auditor", icon: ScanSearch, group: "Herramientas contables" },
  { label: "Calculadora ISR / IVA — PF", href: "/app/tools/isr-iva-calculator", icon: Calculator, group: "Herramientas contables" },
  { label: "Calculadora ISR / IVA — PM", href: "/app/tools/isr-iva-pm", icon: Calculator, group: "Herramientas contables" },
  { label: "Calculadora RESICO PF", href: "/app/tools/resico-calculator", icon: Coins, group: "Herramientas contables" },
  { label: "Validador 69-B / EFOS", href: "/app/tools/efos-validator", icon: ShieldAlert, group: "Herramientas contables" },
  { label: "Validador de Deducibilidad", href: "/app/tools/deducibility-checker", icon: ShieldCheck, group: "Herramientas contables" },
  { label: "Detector de Nómina Oculta", href: "/app/tools/shadow-payroll", icon: Users, group: "Herramientas contables" },
  { label: "Precios de Importación", href: "/app/tools/import-prices", icon: Globe, group: "Herramientas contables" },
  { label: "Generador de oficios SAT", href: "/app/tools/oficio-generator", icon: FileSignature, group: "Herramientas contables" },
  { label: "Asistente fiscal IA", href: "/app/tools/fiscal-assistant", icon: Bot, group: "Herramientas contables" },

  // Conciliación / Contabilidad
  { label: "Conciliación bancaria", href: "/app/conciliacion", icon: Banknote, group: "Conciliación y contabilidad" },
  { label: "Conciliación SAT vs Contabilidad", href: "/app/conciliacion-integral", icon: ScanSearch, group: "Conciliación y contabilidad" },
  { label: "Histórico de conciliación", href: "/app/conciliacion/historial", icon: Banknote, group: "Conciliación y contabilidad" },
  { label: "Pólizas contables", href: "/app/polizas", icon: FileSignature, group: "Conciliación y contabilidad" },
  { label: "Contabilidad automática (CFDI → Pólizas)", href: "/app/contabilidad-auto", icon: FileSignature, group: "Conciliación y contabilidad" },

  // Reportes
  { label: "Reportes del expediente", href: "/app/reportes", icon: FileText, group: "Reportes" },
  { label: "Reporte Ejecutivo + Agente IA", href: "/app/reporte-ejecutivo", icon: Activity, group: "Reportes" },
  { label: "Resumen Fiscal", href: "/app/reportes/resumen-fiscal", icon: FileText, group: "Reportes" },

  // Agentes IA
  { label: "Mis Agentes IA", href: "/app/contable/agentes", icon: Bot, group: "Agentes IA" },
  { label: "Agente CFDI", href: "/app/contable/agente-cfdi", icon: Bot, group: "Agentes IA" },
  { label: "Agente Auditor", href: "/app/contable/agente-auditor", icon: Bot, group: "Agentes IA" },
  { label: "Agente Cierre", href: "/app/contable/agente-cierre", icon: Bot, group: "Agentes IA" },
  { label: "Agente Conciliación", href: "/app/contable/agente-conciliacion", icon: Bot, group: "Agentes IA" },

  // Administrativo & RH
  { label: "Tesorería", href: "/app/admin/tesoreria", icon: TrendingUp, group: "Administrativo & RH" },
  { label: "Gestor de Trámites", href: "/app/admin/tramites", icon: FileText, group: "Administrativo & RH" },
  { label: "Buzón Tributario", href: "/app/admin/buzon", icon: Mail, group: "Administrativo & RH" },
  { label: "Correspondencia", href: "/app/admin/correspondencia", icon: MessageSquare, group: "Administrativo & RH" },
  { label: "Nómina IA", href: "/app/admin/nomina", icon: Users, group: "Administrativo & RH" },
  { label: "Cumplimiento Laboral", href: "/app/admin/cumplimiento", icon: ShieldCheck, group: "Administrativo & RH" },
  { label: "Activos Fijos", href: "/app/admin/activos", icon: Building, group: "Administrativo & RH" },
  { label: "Inventarios", href: "/app/admin/inventarios", icon: Boxes, group: "Administrativo & RH" },

  // Legal
  { label: "Lagunas Legales", href: "/app/legal/lagunas", icon: Gavel, group: "Inteligencia Legal" },
  { label: "Redactor de Escritos", href: "/app/legal/redactor", icon: FileSignature, group: "Inteligencia Legal" },
  { label: "Marketplace Legal", href: "/app/legal/marketplace", icon: Store, group: "Inteligencia Legal" },
];

const ALL_GROUPS = [
  "Operación diaria",
  "Fiscal · SAT",
  "Herramientas contables",
  "Conciliación y contabilidad",
  "Reportes",
  "Agentes IA",
  "Administrativo & RH",
  "Inteligencia Legal",
];

function AllToolsCatalog() {
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Todas las herramientas · {ALL_TOOLS.length}
        </h3>
        <div className="h-px flex-1 bg-border" />
      </div>
      {ALL_GROUPS.map((g) => {
        const items = ALL_TOOLS.filter((t) => t.group === g);
        if (!items.length) return null;
        return (
          <div key={g} className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">{g}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {items.map((q) => {
                const I = q.icon;
                return (
                  <Link
                    key={q.href + q.label}
                    to={q.href}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/40 px-3 py-2.5 text-sm transition-colors min-w-0"
                  >
                    <I className="h-4 w-4 text-primary shrink-0" />
                    <span className="truncate">{q.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
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
  const toolCount = ALL_TOOLS.filter((t) => (m.groups as readonly string[]).includes(t.group)).length;
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
