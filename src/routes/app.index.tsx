import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useActiveCliente } from "@/lib/active-cliente";
import { computeRiesgoSAT } from "@/lib/riesgo/riesgo.functions";
import {
  ShieldAlert, ArrowRight, Activity, Bot, Calendar, TrendingUp, Mail,
  FileText, Banknote, Calculator, ScanSearch, FileBadge, Building, Users, Briefcase, Scale, AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/app/")({
  component: CommandCenter,
});

const AGENTS = [
  { name: "CFDI", role: "Validador de comprobantes", status: "working", metric: "1,284 CFDI/mes", icon: FileText, mod: "contable" },
  { name: "Fiscal SAT", role: "Defensa proactiva", status: "working", metric: "12 criterios", icon: ShieldAlert, mod: "contable" },
  { name: "Conciliación", role: "Bancos vs CFDI", status: "idle", metric: "98.2% match", icon: Banknote, mod: "contable" },
  { name: "Auditor", role: "Hallazgos preventivos", status: "working", metric: "7 hallazgos", icon: ScanSearch, mod: "contable" },
  { name: "Defensa", role: "Lagunas legales", status: "idle", metric: "3 oportunidades", icon: Scale, mod: "legal" },
  { name: "Materialidad", role: "Soporte de operaciones", status: "standby", metric: "—", icon: FileBadge, mod: "contable" },
  { name: "Corporativo", role: "Transfer pricing", status: "standby", metric: "—", icon: Building, mod: "contable" },
  { name: "Cierre", role: "Pre-cierre mensual", status: "idle", metric: "Día 28", icon: Calculator, mod: "contable" },
  { name: "Nómina IA", role: "SDI / IMSS / ISR", status: "standby", metric: "32 empleados", icon: Users, mod: "admin" },
  { name: "Cumplimiento", role: "IMSS · INFONAVIT", status: "idle", metric: "2 alertas", icon: Briefcase, mod: "admin" },
  { name: "Trámites", role: "Seguimiento oficios", status: "working", metric: "5 activos", icon: FileText, mod: "admin" },
  { name: "Buzón", role: "Lector tributario", status: "working", metric: "1 nuevo", icon: Mail, mod: "admin" },
  { name: "Tesorería", role: "Flujo de caja", status: "idle", metric: "+$148K MXN", icon: TrendingUp, mod: "admin" },
  { name: "Correspondencia", role: "Minutas & oficios", status: "standby", metric: "—", icon: FileText, mod: "admin" },
  { name: "Activos Fijos", role: "Depreciación", status: "standby", metric: "47 activos", icon: Building, mod: "admin" },
];

const VENCIMIENTOS = [
  { label: "DIOT Noviembre", days: 3, level: "rojo" },
  { label: "ISR Provisional", days: 8, level: "amarillo" },
  { label: "IMSS Mensual", days: 12, level: "amarillo" },
  { label: "Constancia 32-D", days: 21, level: "verde" },
];

const BUZON = [
  { from: "SAT · Administración Central", subject: "Invitación a regularizar IVA Q3", time: "hace 2h", urgent: true },
  { from: "SAT · Verificación", subject: "Confirmación de domicilio fiscal", time: "ayer", urgent: false },
  { from: "IMSS", subject: "Recordatorio SUA Noviembre", time: "hace 3 días", urgent: false },
];

function CommandCenter() {
  const { cliente } = useActiveCliente();
  const run = useServerFn(computeRiesgoSAT);
  const { data } = useQuery({
    queryKey: ["riesgo-sat", cliente?.id],
    queryFn: () => run({ data: { cliente_id: cliente!.id } }),
    enabled: !!cliente?.id,
  });

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card/80 via-card/40 to-background p-8 md:p-10">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute top-0 right-0 h-72 w-72 rounded-full blur-3xl opacity-30" style={{ background: "var(--gradient-primary)" }} />
        <div className="relative grid md:grid-cols-[1.4fr_1fr] gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[oklch(0.85_0.13_85)] mb-4">
              <span className="h-1 w-8 bg-[oklch(0.78_0.13_85)]" /> Command Center
            </div>
            <h1 className="serif text-4xl md:text-5xl leading-tight">
              Mientras el SAT te audita con IA,<br />
              <span className="gradient-text-gold">ContaClick te defiende.</span>
            </h1>
            <p className="mt-4 text-sm text-muted-foreground max-w-xl">
              15 agentes especializados monitorean tu expediente en tiempo real. Plan Maestro de Fiscalización SAT 2026 cruzado con tus datos reales.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/app/riesgo" className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium text-sm shadow-lg shadow-primary/30 hover:scale-[1.02] transition-transform">
                Ver mi defensa SAT <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/app/contable/herramientas" className="inline-flex items-center gap-2 h-11 px-5 rounded-lg border border-border/80 bg-card/50 hover:bg-card text-sm">
                Explorar herramientas
              </Link>
            </div>
          </div>
          <ScoreRing score={data?.score} semaforo={data?.semaforo} hasCliente={!!cliente} />
        </div>
      </section>

      {/* Agents */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="serif text-2xl">Mis 15 agentes</h2>
            <p className="text-xs text-muted-foreground mt-0.5">8 contables-fiscales · 7 administrativos. La IA propone, tú apruebas.</p>
          </div>
          <Link to="/app/contable/agentes" className="text-xs text-primary hover:underline">Ver detalle →</Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {AGENTS.map((a) => <AgentCard key={a.name} agent={a} />)}
        </div>
      </section>

      {/* Bottom triple */}
      <section className="grid lg:grid-cols-3 gap-4">
        <Panel title="Próximos vencimientos" icon={<Calendar className="h-4 w-4" />} href="/app/admin/tramites">
          <ul className="space-y-2">
            {VENCIMIENTOS.map((v) => {
              const tone = v.level === "rojo" ? "border-red-500/40 bg-red-500/10 text-red-300"
                : v.level === "amarillo" ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
              return (
                <li key={v.label} className={`rounded-lg border px-3 py-2 text-xs flex items-center justify-between ${tone}`}>
                  <span>{v.label}</span>
                  <span className="font-mono">{v.days}d</span>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="Buzón Tributario" icon={<Mail className="h-4 w-4" />} href="/app/admin/buzon">
          <ul className="space-y-2">
            {BUZON.map((m, i) => (
              <li key={i} className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="truncate">{m.from}</span>
                  <span>{m.time}</span>
                </div>
                <div className="text-xs mt-1 flex items-center gap-2">
                  {m.urgent && <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />}
                  <span className="truncate">{m.subject}</span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Flujo de caja · 30 días" icon={<TrendingUp className="h-4 w-4" />} href="/app/admin/tesoreria">
          <Sparkline />
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <Mini label="Ingresos" value="$842K" tone="text-emerald-400" />
            <Mini label="Egresos" value="$614K" tone="text-amber-300" />
            <Mini label="Neto" value="+$228K" tone="text-primary" />
          </div>
        </Panel>
      </section>
    </div>
  );
}

function ScoreRing({ score, semaforo, hasCliente }: { score?: number; semaforo?: "verde" | "amarillo" | "rojo"; hasCliente: boolean }) {
  const s = score ?? 72;
  const tone = semaforo === "rojo" ? "stroke-red-400" : semaforo === "amarillo" ? "stroke-amber-300" : "stroke-emerald-400";
  const label = semaforo === "rojo" ? "Riesgo alto" : semaforo === "amarillo" ? "Riesgo moderado" : "Riesgo bajo";
  const dash = (s / 100) * 282;
  return (
    <div className="flex items-center justify-center">
      <div className="relative h-56 w-56">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r="45" className="stroke-border/60" strokeWidth="6" fill="none" />
          <circle cx="50" cy="50" r="45" className={`${tone} transition-all`} strokeWidth="6" fill="none" strokeDasharray={`${dash} 282`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Score SAT 2026</div>
            <div className="text-6xl serif text-foreground mt-1">{s}</div>
            <div className="text-xs text-muted-foreground">/100 · {label}</div>
            {!hasCliente && <div className="text-[10px] text-muted-foreground mt-2 max-w-[140px]">Selecciona expediente para datos reales</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: typeof AGENTS[number] }) {
  const Icon = agent.icon;
  const statusTone =
    agent.status === "working" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : agent.status === "idle" ? "bg-primary/15 text-primary border-primary/30"
        : "bg-muted/40 text-muted-foreground border-border/60";
  const dotTone =
    agent.status === "working" ? "bg-emerald-400 animate-pulse"
      : agent.status === "idle" ? "bg-primary"
        : "bg-muted-foreground/50";
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-3 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary grid place-items-center shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border flex items-center gap-1 ${statusTone}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} /> {agent.status}
        </span>
      </div>
      <div className="mt-3">
        <div className="text-sm font-medium truncate">Agente {agent.name}</div>
        <div className="text-[11px] text-muted-foreground truncate">{agent.role}</div>
      </div>
      <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">Métrica</span>
        <span className="font-mono text-foreground">{agent.metric}</span>
      </div>
    </div>
  );
}

function Panel({ title, icon, href, children }: { title: string; icon: React.ReactNode; href: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="text-primary">{icon}</span> {title}
        </div>
        <Link to={href} className="text-[10px] text-primary hover:underline">Abrir →</Link>
      </div>
      {children}
    </div>
  );
}

function Sparkline() {
  const pts = [12, 18, 14, 22, 28, 24, 32, 30, 38, 34, 42, 48, 44, 52, 58];
  const max = Math.max(...pts);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${(i / (pts.length - 1)) * 100} ${100 - (p / max) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-20">
      <defs>
        <linearGradient id="sparkGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.62 0.13 250)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="oklch(0.62 0.13 250)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L 100 100 L 0 100 Z`} fill="url(#sparkGrad)" />
      <path d={path} fill="none" stroke="oklch(0.72 0.14 245)" strokeWidth="1.5" />
    </svg>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
