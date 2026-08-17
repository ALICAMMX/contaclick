import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Circle, Lock, AlertTriangle, ArrowRight, Sparkles, LayoutGrid } from "lucide-react";
import { useActiveCliente } from "@/lib/active-cliente";
import { getRutaExpediente } from "@/lib/onboarding/ruta.functions";
import { ZONA_FISCAL } from "@/lib/cierre/periodo";
import type { EstadoPaso, PasoRuta } from "@/lib/onboarding/ruta";

export const Route = createFileRoute("/app/inicio-guiado")({
  head: () => ({
    meta: [
      { title: "Inicio guiado del expediente — ContaClick" },
      { name: "description", content: "Ruta de trabajo del contador: carga la CSF, el expediente, la e.firma, los CFDI y el banco. El resto se calcula solo." },
      { property: "og:title", content: "Inicio guiado del expediente — ContaClick" },
      { property: "og:description", content: "Cinco cargas, tres decisiones, el resto automático." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InicioGuiado,
});

function periodoActual(): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_FISCAL, year: "numeric", month: "2-digit" });
  return f.format(new Date()).slice(0, 7);
}

function periodosRecientes(n = 12): string[] {
  const hoy = periodoActual();
  const [y, m] = hoy.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const ESTADO_UI: Record<EstadoPaso, { label: string; icon: typeof Check; clase: string; anillo: string }> = {
  listo: { label: "Listo", icon: Check, clase: "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10", anillo: "border-emerald-500/40" },
  pendiente: { label: "Pendiente", icon: Circle, clase: "text-primary border-primary/30 bg-primary/10", anillo: "border-primary/40" },
  atencion: { label: "Requiere atención", icon: AlertTriangle, clase: "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10", anillo: "border-amber-500/40" },
  bloqueado: { label: "Bloqueado", icon: Lock, clase: "text-muted-foreground border-border bg-muted/40", anillo: "border-border" },
};

function InicioGuiado() {
  const { cliente, hydrating } = useActiveCliente();
  const [periodo, setPeriodo] = useState(periodoActual);
  const periodos = useMemo(() => periodosRecientes(), []);
  const cargarRuta = useServerFn(getRutaExpediente);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ruta-expediente", cliente?.id, periodo],
    enabled: !!cliente?.id,
    queryFn: () => cargarRuta({ data: { cliente_id: cliente!.id, periodo } }),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary mb-2">
            <span className="h-1 w-6 bg-primary" /> Ruta del expediente
          </div>
          <h1 className="serif text-3xl text-foreground">Inicio guiado</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Cinco cargas y tres decisiones. Todo lo demás lo calcula ContaClick a partir de lo que subas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            aria-label="Periodo"
          >
            {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <Link
            to="/app"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Vista anterior
          </Link>
        </div>
      </header>

      {!cliente && !hydrating && (
        <div className="rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          Selecciona un expediente activo en la barra superior para ver su ruta de trabajo.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          No se pudo calcular la ruta: {(error as Error).message}
        </div>
      )}

      {cliente && isLoading && (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 rounded-lg border border-border bg-muted/30 animate-pulse" />)}
        </div>
      )}

      {data && (
        <>
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Expediente</p>
                <p className="text-lg text-foreground truncate">{data.expediente.razon_social ?? data.expediente.rfc}</p>
                <p className="text-xs text-muted-foreground tabular-nums">{data.expediente.rfc} · periodo {data.periodo}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl tabular-nums text-foreground">{data.progreso.listos}<span className="text-muted-foreground text-base">/{data.progreso.total}</span></p>
                <p className="text-xs text-muted-foreground">pasos completos</p>
              </div>
            </div>
            <div className="mt-4 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${data.progreso.porcentaje}%` }} />
            </div>
            {data.siguiente && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-3">
                <div className="flex items-start gap-2 min-w-0">
                  <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">Siguiente: {data.siguiente.titulo}</p>
                    <p className="text-xs text-muted-foreground">{data.siguiente.detalle}</p>
                  </div>
                </div>
                <Link
                  to={data.siguiente.ruta}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 shrink-0"
                >
                  {data.siguiente.accion} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </section>

          <ol className="space-y-3">
            {data.pasos.map((p) => <PasoCard key={p.id} paso={p} />)}
          </ol>

          <p className="text-xs text-muted-foreground max-w-3xl">
            Lo que no se autocompleta por diseño: la deducibilidad de gastos dudosos, la aprobación de pólizas
            borrador y el sellado del periodo. Esas decisiones exigen tu criterio profesional y quedan registradas
            con motivo y fundamento.
          </p>
        </>
      )}
    </div>
  );
}

function PasoCard({ paso }: { paso: PasoRuta }) {
  const ui = ESTADO_UI[paso.estado];
  const Icon = ui.icon;
  const bloqueado = paso.estado === "bloqueado";
  return (
    <li className={`rounded-lg border bg-card p-4 ${ui.anillo}`}>
      <div className="flex items-start gap-4">
        <div className={`h-9 w-9 shrink-0 rounded-full border flex items-center justify-center ${ui.clase}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">Paso {paso.numero}</span>
            <h2 className="text-sm font-medium text-foreground">{paso.titulo}</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${ui.clase}`}>{ui.label}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{paso.descripcion}</p>
          <p className="text-xs text-foreground/80 mt-2">{bloqueado ? paso.bloqueadoPor : paso.detalle}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {paso.desbloquea.map((d) => (
              <span key={d} className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                {d}
              </span>
            ))}
          </div>
        </div>
        <div className="shrink-0">
          {bloqueado ? (
            <span className="inline-flex items-center h-8 px-3 rounded-md border border-border text-xs text-muted-foreground">
              {paso.accion}
            </span>
          ) : (
            <Link
              to={paso.ruta}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-primary/40 text-primary text-xs font-medium hover:bg-primary/10"
            >
              {paso.accion} <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
