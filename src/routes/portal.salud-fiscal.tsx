import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPortalContext } from "@/lib/portal/portal.functions";
import { computeSaludFiscal, type SaludFiscal } from "@/lib/salud/salud.functions";
import { descargarReporteSalud } from "@/lib/salud/reporte";
import { Activity, ArrowDownRight, ArrowUpRight, Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/portal/salud-fiscal")({
  component: PortalSaludPage,
  head: () => ({ meta: [{ title: "Mi Salud Fiscal" }] }),
});

const semLabel: Record<string, string> = {
  verde: "Salud excelente — todo en orden.",
  amarillo: "Salud estable — pendientes menores.",
  naranja: "Riesgo moderado — atender pronto.",
  rojo: "Riesgo alto — atención inmediata.",
};
const semColor: Record<string, string> = {
  verde: "from-emerald-500/30 to-emerald-500/5 border-emerald-500/40 text-emerald-300",
  amarillo: "from-amber-500/30 to-amber-500/5 border-amber-500/40 text-amber-300",
  naranja: "from-orange-500/30 to-orange-500/5 border-orange-500/40 text-orange-300",
  rojo: "from-red-500/30 to-red-500/5 border-red-500/40 text-red-300",
};

function PortalSaludPage() {
  const fetchCtx = useServerFn(getPortalContext);
  const compute = useServerFn(computeSaludFiscal);
  const { data: ctx } = useQuery({ queryKey: ["portal-context"], queryFn: () => fetchCtx() });
  const cli = ctx && "isClient" in ctx && ctx.isClient ? ctx.cliente : null;
  const verSalud = ctx && "isClient" in ctx && ctx.isClient ? (ctx.config as any).ver_salud_fiscal !== false : false;

  const { data: salud, isLoading } = useQuery({
    queryKey: ["portal-salud", cli?.id],
    queryFn: async () => {
      const r = await compute({ data: { cliente_id: cli!.id, persist: false } });
      return "notFound" in r && r.notFound ? null : (r as SaludFiscal);
    },
    enabled: !!cli && verSalud,
  });

  if (!ctx || !cli) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (!verSalud) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Tu despacho aún no ha habilitado este panel.
      </div>
    );
  }
  if (isLoading || !salud) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="h-4 w-4 animate-pulse text-primary" /> Cargando tu salud fiscal…</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" /> Mi Salud Fiscal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Estado integral de tu cumplimiento. Actualizado al {salud.periodo}.</p>
      </header>

      <div className={`rounded-2xl border bg-gradient-to-br p-6 ${semColor[salud.semaforo]}`}>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="text-6xl font-bold">{salud.score}<span className="text-2xl opacity-50">/100</span></div>
          <div>
            <div className="text-lg font-medium">{semLabel[salud.semaforo]}</div>
            <div className="text-sm mt-1 flex items-center gap-1">
              {salud.variacion_mes >= 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-400" /> : <ArrowDownRight className="h-4 w-4 text-red-400" />}
              {salud.variacion_mes >= 0 ? "+" : ""}{salud.variacion_mes} pts vs mes anterior
            </div>
          </div>
        </div>
      </div>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Áreas evaluadas</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {salud.subscores.map((s) => {
            const bar = s.score >= 85 ? "bg-emerald-500" : s.score >= 70 ? "bg-amber-500" : s.score >= 50 ? "bg-orange-500" : "bg-red-500";
            return (
              <div key={s.key} className="rounded-xl border border-border bg-card p-4">
                <div className="text-sm font-medium">{s.label}</div>
                <div className="text-2xl font-bold mt-1">{s.score}<span className="text-sm opacity-50">/100</span></div>
                <div className="h-1.5 bg-muted/40 rounded mt-2"><div className={`h-full ${bar}`} style={{ width: `${s.score}%` }} /></div>
              </div>
            );
          })}
        </div>
      </section>

      {salud.alertas.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Lo que debes atender</h2>
          <div className="space-y-2">
            {salud.alertas.slice(0, 5).map((a, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="font-medium">{a.titulo}</div>
                {a.detalle && <div className="text-xs text-muted-foreground mt-0.5">{a.detalle}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {salud.recomendaciones.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Recomendaciones de tu despacho</h2>
          <div className="space-y-2">
            {salud.recomendaciones.map((r, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="font-medium">{r.titulo}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{r.detalle}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-2 pt-2">
        <Button size="sm" variant="hero" onClick={() => descargarReporteSalud(salud)}>
          <Download className="h-4 w-4 mr-1" /> Descargar reporte
        </Button>
        <Button size="sm" variant="outline" asChild><Link to="/portal">Volver al inicio</Link></Button>
      </div>
    </div>
  );
}
