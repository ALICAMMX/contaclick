import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, AlertCircle, CalendarClock, FileText, ChevronRight, BellRing } from "lucide-react";
import { getDespachoDashboard } from "@/lib/despacho/dashboard.functions";

export const Route = createFileRoute("/app/despacho")({ component: DespachoPage });

const SEMAFORO_LABEL: Record<string, string> = { rojo: "Riesgo alto", amarillo: "Atender", verde: "OK" };
const SEMAFORO_CLR: Record<string, string> = {
  rojo: "bg-red-500/15 text-red-400 border-red-500/30",
  amarillo: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  verde: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

function DespachoPage() {
  const fn = useServerFn(getDespachoDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["despacho-dashboard"], queryFn: () => fn() });
  const t = data?.totales;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-primary/15 text-primary grid place-items-center shrink-0">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard del despacho</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Resumen consolidado de todos los expedientes: semáforo fiscal, CFDI del mes y obligaciones próximas a vencer.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Expedientes" value={t?.clientes ?? 0} />
        <Kpi label="Riesgo alto" value={t?.rojo ?? 0} tone="rojo" />
        <Kpi label="Atender" value={t?.amarillo ?? 0} tone="amarillo" />
        <Kpi label="En orden" value={t?.verde ?? 0} tone="verde" />
        <Kpi label="Alertas abiertas" value={t?.alertas ?? 0} icon={<BellRing className="h-3.5 w-3.5" />} />
        <Kpi label="Obligs. vencidas" value={t?.vencidas ?? 0} tone="rojo" icon={<AlertCircle className="h-3.5 w-3.5" />} />
      </div>

      <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
          <div className="font-semibold">Clientes</div>
          <Link to="/app/clientes" className="text-xs text-primary hover:underline">Ver expedientes</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Cliente</th>
                <th className="text-left px-4 py-2">RFC</th>
                <th className="text-left px-4 py-2">Semáforo</th>
                <th className="text-right px-4 py-2">CFDI mes</th>
                <th className="text-right px-4 py-2">Alertas</th>
                <th className="text-left px-4 py-2">Próx. obligación</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">Cargando…</td></tr>
              )}
              {!isLoading && (data?.clientes ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  Aún no hay expedientes. <Link to="/app/clientes" className="text-primary hover:underline">Crear el primero</Link>.
                </td></tr>
              )}
              {(data?.clientes ?? []).map((c) => {
                const vencida = c.proxima_obligacion && c.proxima_obligacion.vencimiento < today;
                return (
                  <tr key={c.id} className="hover:bg-accent/5">
                    <td className="px-4 py-2.5">
                      <Link to="/app/clientes/$id" params={{ id: c.id }} className="font-medium hover:text-primary">
                        {c.razon_social}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{c.rfc}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-md border ${SEMAFORO_CLR[c.semaforo]}`}>
                        {SEMAFORO_LABEL[c.semaforo]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <FileText className="h-3 w-3" /> {c.cfdi_mes}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {c.alertas_abiertas > 0
                        ? <span className="text-amber-400 font-medium">{c.alertas_abiertas}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {c.proxima_obligacion ? (
                        <span className={`inline-flex items-center gap-1.5 ${vencida ? "text-red-400" : "text-muted-foreground"}`}>
                          <CalendarClock className="h-3 w-3" />
                          {c.proxima_obligacion.clave} · {c.proxima_obligacion.vencimiento}
                          {c.obligaciones_proximas > 1 && <span className="opacity-70">(+{c.obligaciones_proximas - 1})</span>}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link to="/app/clientes/$id" params={{ id: c.id }} className="text-muted-foreground hover:text-foreground inline-flex">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: number | string; tone?: "rojo" | "amarillo" | "verde"; icon?: React.ReactNode }) {
  const color = tone === "rojo" ? "text-red-400" : tone === "amarillo" ? "text-amber-400" : tone === "verde" ? "text-emerald-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className={`text-2xl font-semibold mt-1 tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
