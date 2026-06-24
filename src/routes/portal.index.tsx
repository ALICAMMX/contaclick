import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPortalDashboard } from "@/lib/portal/portal.functions";
import { TrendingUp, TrendingDown, Wallet, AlertCircle, Calendar } from "lucide-react";

export const Route = createFileRoute("/portal/")({
  component: PortalDashboard,
});

const mxn = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

function PortalDashboard() {
  const fn = useServerFn(getPortalDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["portal-dashboard"], queryFn: () => fn() });

  if (isLoading) return <div className="text-muted-foreground">Cargando…</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Hola 👋</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Resumen de tu expediente <strong className="text-foreground">{data.cliente.razon_social}</strong> · RFC{" "}
          <span className="font-mono">{data.cliente.rfc}</span>
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Ingresos del mes" value={mxn(data.mes.ingresos)} icon={TrendingUp} accent="text-emerald-500" subtitle={`${data.mes.cfdis_emitidos} CFDI emitidos`} />
        <Card title="Egresos del mes" value={mxn(data.mes.egresos)} icon={TrendingDown} accent="text-rose-500" subtitle={`${data.mes.cfdis_recibidos} CFDI recibidos`} />
        <Card title="Por cobrar" value={mxn(data.cxc_total)} icon={Wallet} accent="text-amber-500" subtitle="Saldo CXC pendiente" />
        <Card title="Por pagar" value={mxn(data.cxp_total)} icon={Wallet} accent="text-orange-500" subtitle="Saldo CXP pendiente" />
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/40 p-5">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-primary" /> Próximas obligaciones (30 días)
          </h2>
          {data.proximas_obligaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tienes obligaciones próximas. ✅</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {data.proximas_obligaciones.map((o: any, i: number) => (
                <li key={i} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{o.clave}</div>
                    <div className="text-xs text-muted-foreground">{o.periodicidad}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{o.proximo_vencimiento ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card/40 p-5">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-amber-500" /> Avisos de tu contador
          </h2>
          {data.alertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin avisos pendientes.</p>
          ) : (
            <ul className="space-y-2">
              {data.alertas.map((a: any) => (
                <li key={a.id} className="rounded-md border border-border/60 p-3">
                  <div className="text-sm font-medium">{a.titulo}</div>
                  {a.descripcion && <div className="text-xs text-muted-foreground mt-0.5">{a.descripcion}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Card({ title, value, icon: Icon, accent, subtitle }: any) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{title}</span>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <div className="text-xl font-bold">{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
    </div>
  );
}
