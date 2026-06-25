import { createFileRoute, Link } from "@tanstack/react-router";
import { Calculator, FileText, FileStack, Coins, Banknote, FileBadge, FileSignature, ShieldCheck, ScanSearch, Bot, AlertTriangle, Users, Globe, Network, Mail, Bell, ShieldAlert, ChevronDown, Check, Calendar, Clock, ListChecks } from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";
import { useActiveCliente } from "@/lib/active-cliente";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { computeRiesgoSAT } from "@/lib/riesgo/riesgo.functions";

export const Route = createFileRoute("/app/contable/")({ component: ContableCatalog });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Status = "live" | "beta" | "soon";
type Tool = { name: string; desc: string; icon: ComponentType<{ className?: string }>; href?: string; status: Status; group: string; doneThisMonth?: boolean };

const TOOLS: Tool[] = [
  // 1. Alta del expediente
  { name: "Lector de Constancia Fiscal", desc: "Sube la CSF y autocompleta régimen, obligaciones y domicilio.", icon: FileBadge, href: "/app/tools/csf-parser", status: "live", group: "1 · Alta del expediente" },
  { name: "Calendario fiscal", desc: "Obligaciones del expediente con semáforo, alertas y autogeneración anual.", icon: Calendar, href: "/app/calendario", status: "live", group: "1 · Alta del expediente" },
  { name: "Centro de Tareas", desc: "Kanban, lista y productividad. Asigna trabajo y mide cumplimiento del despacho.", icon: ListChecks, href: "/app/tareas", status: "live", group: "1 · Alta del expediente" },

  // 2. Ingesta de CFDI
  { name: "Lector masivo de XML", desc: "Procesa ZIPs del SAT y exporta tabla.", icon: FileStack, href: "/app/tools/xml-bulk-reader", status: "live", group: "2 · Ingesta de CFDI" },
  { name: "Validador CFDI 4.0", desc: "Estructura, RFC, totales, UUID al instante.", icon: FileText, href: "/app/tools/cfdi-validator", status: "live", group: "2 · Ingesta de CFDI" },
  { name: "Verificador de UUID", desc: "Consulta webservice del SAT.", icon: ShieldCheck, href: "/app/tools/cfdi-verifier", status: "live", group: "2 · Ingesta de CFDI" },
  { name: "CFDI del expediente", desc: "Bandeja unificada del cliente activo.", icon: FileText, href: "/app/cfdi", status: "live", group: "2 · Ingesta de CFDI" },

  // 3. Auditoría y conciliación
  { name: "Auditor express", desc: "5 validaciones: duplicados, NC huérfanas, cancelados, PPD sin pago, fuera de periodo.", icon: ScanSearch, href: "/app/tools/express-auditor", status: "live", group: "3 · Auditoría y Conciliación" },
  { name: "Conciliador bancario", desc: "Cruza estado de cuenta vs CFDI.", icon: Banknote, href: "/app/conciliacion", status: "live", group: "3 · Auditoría y Conciliación" },
  { name: "Conciliación del expediente", desc: "Histórico mensual con semáforo verde/amarillo/rojo.", icon: Banknote, href: "/app/conciliacion/historial", status: "live", group: "3 · Auditoría y Conciliación", doneThisMonth: true },

  // 4. Cálculo de impuestos
  { name: "Calculadora ISR / IVA", desc: "Pago provisional mensual.", icon: Calculator, href: "/app/tools/isr-iva-calculator", status: "live", group: "4 · Cálculo de impuestos" },
  { name: "Calculadora RESICO PF", desc: "ISR mensual personas físicas RESICO.", icon: Coins, href: "/app/tools/resico-calculator", status: "live", group: "4 · Cálculo de impuestos" },
  { name: "Precios de transferencia", desc: "Análisis de partes relacionadas.", icon: Network, status: "soon", group: "4 · Cálculo de impuestos" },

  // 5. Defensa SAT
  { name: "Riesgo SAT 2026", desc: "Score sobre los 12 criterios del Plan Maestro.", icon: ShieldAlert, href: "/app/riesgo", status: "live", group: "5 · Defensa SAT", doneThisMonth: true },
  { name: "Validador de Deducibilidad", desc: "Detecta deducciones improcedentes con IA.", icon: ShieldCheck, href: "/app/tools/deducibility-checker", status: "live", group: "5 · Defensa SAT" },
  { name: "Validador 69-B / EFOS", desc: "Cruza tus proveedores con la lista negra del SAT.", icon: AlertTriangle, href: "/app/tools/efos-validator", status: "live", group: "5 · Defensa SAT", doneThisMonth: true },
  { name: "Validador de Precios de Importación", desc: "Comparables internos y memo justificativo (LISR 76-A, 179).", icon: Globe, href: "/app/tools/import-prices", status: "live", group: "5 · Defensa SAT" },
  { name: "Detector de Nómina Oculta", desc: "Identifica pagos recurrentes a PF sin CFDI de nómina.", icon: Users, href: "/app/tools/shadow-payroll", status: "live", group: "5 · Defensa SAT" },

  // 6. Cierre y entregables
  { name: "Reportes del expediente", desc: "Exporta papeles de trabajo PDF/Excel.", icon: FileText, href: "/app/reportes", status: "live", group: "6 · Cierre & Entregables" },
  { name: "Generador de oficios SAT", desc: "Plantillas listas personalizadas.", icon: FileSignature, href: "/app/tools/oficio-generator", status: "live", group: "6 · Cierre & Entregables" },

  // 7. IA siempre activa
  { name: "Asistente fiscal IA", desc: "Consulta legislación con contexto del cliente.", icon: Bot, href: "/app/tools/fiscal-assistant", status: "live", group: "7 · IA siempre activa" },
  { name: "Mis Agentes IA", desc: "Conoce los 8 agentes que vigilarán tu expediente — vista previa.", icon: Bot, href: "/app/contable/agentes", status: "live", group: "7 · IA siempre activa" },
  { name: "Mensajería IA", desc: "Redacta recordatorios y avisos para tus clientes. Envía por WhatsApp o correo.", icon: Mail, href: "/app/mensajes", status: "live", group: "7 · IA siempre activa" },
];

const GROUPS = [
  "1 · Alta del expediente",
  "2 · Ingesta de CFDI",
  "3 · Auditoría y Conciliación",
  "4 · Cálculo de impuestos",
  "5 · Defensa SAT",
  "6 · Cierre & Entregables",
  "7 · IA siempre activa",
];

function ContableCatalog() {
  const live = TOOLS.filter((t) => t.status === "live").length;
  const { cliente } = useActiveCliente();
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary mb-2">
            <span className="h-1 w-6 bg-primary" /> Módulo 1
          </div>
          <h1 className="serif text-3xl text-foreground">Contable y Fiscal</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Catálogo de herramientas independientes. Entra, úsala, regresa. Sin formularios complicados ni configuración previa.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-medium">{live} en vivo</span>
          <span className="px-2.5 py-1 rounded-full border border-border bg-muted text-muted-foreground">{TOOLS.length - live} pronto</span>
        </div>
      </header>

      {/* Mini-dashboard del expediente activo */}
      {cliente && <MiniDashboard nombre={cliente.razon_social} rfc={cliente.rfc} clienteId={cliente.id} />}

      {GROUPS.map((g) => {
        const items = TOOLS.filter((t) => t.group === g);
        if (!items.length) return null;
        const isDefensa = g === "5 · Defensa SAT";
        const active = isDefensa ? items.filter((t) => t.status === "live") : items;
        const upcoming = isDefensa ? items.filter((t) => t.status !== "live") : [];
        return (
          <section key={g} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</h2>
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] text-muted-foreground tabular-nums">{items.length}</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {active.map((t) => <ToolCard key={t.name} tool={t} clienteActivo={!!cliente} />)}
            </div>
            {isDefensa && upcoming.length > 0 && <UpcomingBlock items={upcoming} />}
          </section>
        );
      })}
    </div>
  );
}

function MiniDashboard({ nombre, rfc, clienteId }: { nombre: string; rfc: string; clienteId: string }) {
  const isReal = UUID_RE.test(clienteId);
  const run = useServerFn(computeRiesgoSAT);
  const { data: riesgo, isLoading: riesgoLoading } = useQuery({
    queryKey: ["riesgo-sat", clienteId],
    queryFn: async () => {
      try {
        return await run({ data: { cliente_id: clienteId } });
      } catch (e) {
        // Si el token caducó, el middleware lanza un Response 401: no rompemos la UI.
        if (e instanceof Response) return { notFound: true as const };
        throw e;
      }
    },
    enabled: isReal,
    staleTime: 60_000,
    retry: (count, err) => !(err instanceof Response) && count < 1,
  });

  const riesgoMetric = (() => {
    if (!isReal) return { value: "— / 100", sub: "Expediente demo", accent: "text-muted-foreground", dot: "bg-muted-foreground" };
    if (riesgoLoading || !riesgo) return { value: "…", sub: "Calculando", accent: "text-muted-foreground", dot: "bg-muted-foreground" };
    if ("notFound" in riesgo && riesgo.notFound) return { value: "— / 100", sub: "Expediente no encontrado", accent: "text-muted-foreground", dot: "bg-muted-foreground" };
    const sem = riesgo.semaforo;
    const accent = sem === "rojo" ? "text-red-600 dark:text-red-300" : sem === "amarillo" ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300";
    const dot = sem === "rojo" ? "bg-red-500" : sem === "amarillo" ? "bg-amber-500" : "bg-emerald-500";
    const label = sem === "rojo" ? "Alto" : sem === "amarillo" ? "Medio" : "Bajo";
    return { value: `${riesgo.score} / 100`, sub: label, accent, dot };
  })();

  const metrics = [
    { label: "Riesgo SAT", value: riesgoMetric.value, sub: riesgoMetric.sub, icon: ShieldAlert, accent: riesgoMetric.accent, dot: riesgoMetric.dot },
    { label: "Próximo vencimiento", value: "17 días", sub: "Pago provisional", icon: Calendar, accent: "text-primary", dot: "bg-primary" },
    { label: "CFDI este mes", value: "128", sub: "98 emitidos · 30 recibidos", icon: FileText, accent: "text-foreground", dot: "bg-emerald-500" },
    { label: "Última actividad", value: "Hoy", sub: "Conciliación bancaria", icon: Clock, accent: "text-muted-foreground", dot: "bg-muted-foreground" },
  ];
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/40 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Expediente activo</div>
          <div className="flex items-baseline gap-2 min-w-0">
            <div className="font-semibold truncate">{nombre}</div>
            <div className="text-xs font-mono text-muted-foreground">{rfc}</div>
          </div>
        </div>
        <Link to="/app/expedientes" className="text-xs text-muted-foreground hover:text-foreground shrink-0">Cambiar</Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border">
        {metrics.map((m) => {
          const I = m.icon;
          return (
            <div key={m.label} className="p-4 flex items-start gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-background border border-border grid place-items-center shrink-0">
                <I className={`h-4 w-4 ${m.accent}`} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
                <div className={`text-lg font-semibold ${m.accent}`}>{m.value}</div>
                <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} /> {m.sub}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function UpcomingBlock({ items }: { items: Tool[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Próximamente en Defensa SAT</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-background text-muted-foreground">{items.length}</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((t) => <ToolCard key={t.name} tool={t} clienteActivo={false} />)}
        </div>
      )}
    </div>
  );
}

function ToolCard({ tool, clienteActivo }: { tool: Tool; clienteActivo: boolean }) {
  const Icon = tool.icon;
  const isLive = tool.status === "live";
  const showDone = clienteActivo && tool.doneThisMonth;
  const badge =
    tool.status === "live" ? { text: "Abrir", cls: "text-emerald-600 dark:text-emerald-300" }
      : tool.status === "beta" ? { text: "Beta", cls: "text-primary" }
        : { text: "Pronto", cls: "text-muted-foreground" };
  const body = (
    <div className={`group relative h-full rounded-xl p-5 border bg-card transition-all flex flex-col ${
      tool.href ? "border-border hover:border-primary/40 hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5" : "border-border/60 opacity-75"
    }`}>
      {showDone && (
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
          <Check className="h-2.5 w-2.5" /> Hecho este mes
        </span>
      )}
      <div className="flex items-start justify-between mb-4">
        <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        {!isLive && (
          <button
            onClick={(e) => { e.preventDefault(); }}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground"
            title="Avísame cuando esté disponible"
          >
            <Bell className="h-3 w-3" /> Avisar
          </button>
        )}
      </div>
      <div className="font-medium mb-1">{tool.name}</div>
      <p className="text-xs text-muted-foreground leading-relaxed flex-1">{tool.desc}</p>
      <div className={`text-xs font-medium mt-4 inline-flex items-center gap-1 ${badge.cls}`}>
        {badge.text} {isLive && <span className="transition-transform group-hover:translate-x-0.5">→</span>}
      </div>
    </div>
  );
  return tool.href ? <Link to={tool.href} className="block h-full">{body}</Link> : <div className="cursor-not-allowed h-full">{body}</div>;
}
