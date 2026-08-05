import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert, Calendar, FileText, Clock, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useActiveCliente } from "@/lib/active-cliente";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { computeRiesgoSAT } from "@/lib/riesgo/riesgo.functions";
import { getCfdiMonthStats } from "@/lib/cfdi/cfdi.functions";
import { CAPABILITIES, type Capability } from "@/lib/capabilities/registry";
import { CapabilityCard } from "@/components/CapabilityCard";

export const Route = createFileRoute("/app/contable/")({ component: ContableCatalog });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GRUPOS_CONTABLE = [
  "1 · Alta del expediente",
  "2 · Ingesta de CFDI",
  "3 · Auditoría y Conciliación",
  "4 · Cálculo de impuestos",
  "5 · Defensa SAT",
  "6 · Cierre & Entregables",
  "7 · IA siempre activa",
];

// El catálogo se deriva del registro central: no existen listas paralelas.
const TOOLS = CAPABILITIES.filter(
  (c) => GRUPOS_CONTABLE.includes(c.grupo) && c.visibleEnMenu && c.madurez !== "obsoleta",
);

const HECHO_ESTE_MES = new Set(["conciliacion-historial", "riesgo", "efos-validator"]);

function ContableCatalog() {
  const operativas = TOOLS.filter((t) => t.madurez === "operativa" || t.madurez === "operativa_limitada").length;
  const beta = TOOLS.filter((t) => t.madurez === "beta").length;
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
            Catálogo de herramientas independientes. Cada tarjeta indica su estado real: operativa, con
            limitaciones, beta o demostración.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-medium">{operativas} operativas</span>
          {beta > 0 && <span className="px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary font-medium">{beta} beta</span>}
        </div>
      </header>

      {/* Mini-dashboard del expediente activo */}
      {cliente && <MiniDashboard nombre={cliente.razon_social} rfc={cliente.rfc} clienteId={cliente.id} />}

      {GRUPOS_CONTABLE.map((g) => {
        const items = TOOLS.filter((t) => t.grupo === g);
        if (!items.length) return null;
        const activas = items.filter((t) => t.madurez !== "demostracion");
        const demos = items.filter((t) => t.madurez === "demostracion");
        return (
          <section key={g} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</h2>
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] text-muted-foreground tabular-nums">{items.length}</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activas.map((t) => (
                <CapabilityCard key={t.id} capability={t} doneThisMonth={!!cliente && HECHO_ESTE_MES.has(t.id)} />
              ))}
            </div>
            {demos.length > 0 && <DemoBlock items={demos} />}
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
    // Sin cobertura mínima de información NO se afirma "riesgo bajo".
    if (sem === "sin_datos" || riesgo.score === null) {
      return {
        value: "Sin datos",
        sub: `${riesgo.meta.cobertura.evaluables}/${riesgo.meta.cobertura.total} criterios evaluables`,
        accent: "text-muted-foreground",
        dot: "bg-muted-foreground",
      };
    }
    const accent = sem === "rojo" ? "text-red-600 dark:text-red-300" : sem === "amarillo" ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300";
    const dot = sem === "rojo" ? "bg-red-500" : sem === "amarillo" ? "bg-amber-500" : "bg-emerald-500";
    const label = sem === "rojo" ? "Alto" : sem === "amarillo" ? "Medio" : "Bajo";
    return { value: `${riesgo.score} / 100`, sub: label, accent, dot };
  })();

  const runCfdi = useServerFn(getCfdiMonthStats);
  const { data: cfdiMes, isLoading: cfdiLoading } = useQuery({
    queryKey: ["cfdi-month", clienteId],
    queryFn: async () => {
      try { return await runCfdi({ data: { cliente_id: clienteId } }); }
      catch (e) { if (e instanceof Response) return null; throw e; }
    },
    enabled: isReal,
    staleTime: 60_000,
    retry: (count, err) => !(err instanceof Response) && count < 1,
  });

  const cfdiMetric = !isReal
    ? { value: "—", sub: "Expediente demo" }
    : cfdiLoading || !cfdiMes
      ? { value: "…", sub: "Calculando" }
      : { value: String(cfdiMes.total), sub: `${cfdiMes.emitidos} emitidos · ${cfdiMes.recibidos} recibidos` };

  const metrics = [
    { label: "Riesgo SAT", value: riesgoMetric.value, sub: riesgoMetric.sub, icon: ShieldAlert, accent: riesgoMetric.accent, dot: riesgoMetric.dot },
    { label: "Próximo vencimiento", value: "—", sub: "Ver calendario", icon: Calendar, accent: "text-primary", dot: "bg-primary" },
    { label: "CFDI este mes (expediente)", value: cfdiMetric.value, sub: cfdiMetric.sub, icon: FileText, accent: "text-foreground", dot: "bg-emerald-500" },
    { label: "Última actividad", value: "—", sub: "Sin registro reciente", icon: Clock, accent: "text-muted-foreground", dot: "bg-muted-foreground" },
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

function DemoBlock({ items }: { items: Capability[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Solo demostración (datos sintéticos)</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-background text-muted-foreground">{items.length}</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((t) => <CapabilityCard key={t.id} capability={t} />)}
        </div>
      )}
    </div>
  );
}
