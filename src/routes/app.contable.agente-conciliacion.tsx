import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Play, Pause, RefreshCw, ArrowLeft, FolderOpen, CheckCircle2, AlertTriangle, Sparkles, Upload, ScanSearch, Clock } from "lucide-react";
import { ModuleScaffold, KpiTile, DemoCard } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { useActiveCliente } from "@/lib/active-cliente";
import { getReconciliationStats } from "@/lib/conciliacion/conciliacion.functions";

export const Route = createFileRoute("/app/contable/agente-conciliacion")({ component: AgenteConciliacionPage });

const STORAGE_KEY = "agente-conciliacion:estado";
const REFRESH_MS = 60_000;
const fmtMxn = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);

function AgenteConciliacionPage() {
  const { cliente } = useActiveCliente();
  const [activo, setActivo] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v == null ? true : v === "1";
  });
  const [lastRun, setLastRun] = useState<Date | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, activo ? "1" : "0");
  }, [activo]);

  const statsFn = useServerFn(getReconciliationStats);
  const enabled = !!cliente?.id;
  const clienteId = cliente?.id ?? "";

  const statsQ = useQuery({
    queryKey: ["agente-conciliacion", "stats", clienteId],
    queryFn: () => statsFn({ data: { cliente_id: clienteId } }),
    enabled,
    refetchInterval: activo ? REFRESH_MS : false,
  });

  useEffect(() => { if (statsQ.dataUpdatedAt) setLastRun(new Date(statsQ.dataUpdatedAt)); }, [statsQ.dataUpdatedAt]);

  if (!cliente) {
    return (
      <ModuleScaffold title="Agente Conciliación" subtitle="Selecciona un expediente para activar el agente." icon={<Banknote className="h-5 w-5" />} badge={null}>
        <DemoCard>
          <div className="flex flex-col items-center text-center gap-3 py-6">
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
            <div className="font-medium">Sin expediente activo</div>
            <Link to="/app/expedientes" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
              <FolderOpen className="h-4 w-4" /> Elegir expediente
            </Link>
          </div>
        </DemoCard>
      </ModuleScaffold>
    );
  }

  const d = statsQ.data;
  const sinCfdi = d?.sinCfdi ?? 0;
  const cfdiSinPago = d?.cfdiSinPago ?? 0;
  const issues = sinCfdi + cfdiSinPago;
  const tasa = d?.tasa ?? 0;
  const tasaAccent = tasa >= 85 ? "success" : tasa >= 60 ? "warning" : "destructive";

  return (
    <ModuleScaffold
      title="Agente Conciliación"
      subtitle={`Cruza movimientos bancarios contra CFDI de ${cliente.razon_social}. Detecta ingresos omitidos y CFDI sin pago.`}
      icon={<Banknote className="h-5 w-5" />}
      badge={activo ? "Activo · Auto-refresh 60s" : "Pausado"}
      actions={
        <>
          <HerramientaHelp slug="agente-conciliacion" />
          <Link to="/app/contable/agentes" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/60 bg-card/60 hover:bg-card text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Agentes
          </Link>
          <button onClick={() => setActivo((v) => !v)} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium ${activo ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30" : "bg-muted text-muted-foreground border border-border"}`}>
            {activo ? <><Pause className="h-3.5 w-3.5" /> Pausar</> : <><Play className="h-3.5 w-3.5" /> Activar</>}
          </button>
          <button onClick={() => statsQ.refetch()} disabled={statsQ.isLoading} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${statsQ.isLoading ? "animate-spin" : ""}`} /> Ejecutar ahora
          </button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Tasa de conciliación" value={`${tasa}%`} hint={`${d?.matched ?? 0}/${d?.total_movimientos ?? 0} movs`} accent={tasaAccent} />
        <KpiTile label="Movs sin CFDI" value={String(sinCfdi)} hint="Posibles ingresos omitidos" accent={sinCfdi ? "destructive" : "success"} />
        <KpiTile label="CFDI sin pago" value={String(cfdiSinPago)} hint="PPD pendientes / cobros faltantes" accent={cfdiSinPago ? "warning" : "success"} />
        <KpiTile label="Última corrida" value={lastRun ? lastRun.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—"} hint={activo ? "Próxima en <60s" : "Pausado"} accent="gold" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <DemoCard title="Bitácora del agente">
            {statsQ.isLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Analizando movimientos…</div>
            ) : issues === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Conciliación sin pendientes. Todo cuadra.
              </div>
            ) : (
              <ul className="space-y-2">
                {sinCfdi > 0 && (
                  <li className="flex items-start gap-3 rounded-lg border p-3 text-red-600 dark:text-red-300 bg-red-500/10 border-red-500/30">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs uppercase tracking-wider opacity-80">Movimientos sin CFDI · alta</div>
                      <div className="text-sm mt-0.5">{sinCfdi} depósitos/cargos sin comprobante. Revisa si hay ingresos no facturados (riesgo 69-B / discrepancia).</div>
                    </div>
                  </li>
                )}
                {cfdiSinPago > 0 && (
                  <li className="flex items-start gap-3 rounded-lg border p-3 text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs uppercase tracking-wider opacity-80">CFDI sin pago bancario · media</div>
                      <div className="text-sm mt-0.5">{cfdiSinPago} CFDI sin movimiento asociado. Genera complementos de pago o verifica cobranza.</div>
                    </div>
                  </li>
                )}
                <li className="flex items-start gap-3 rounded-lg border p-3 text-muted-foreground bg-muted/40 border-border">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="text-sm">{d?.exactos ?? 0} matches exactos · {d?.probables ?? 0} probables (revisión sugerida).</div>
                </li>
              </ul>
            )}
          </DemoCard>

          <DemoCard title="Flujo del expediente">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Ingresos bancarios</div>
                <div className="text-lg font-semibold tabular-nums">{fmtMxn(d?.ingresos ?? 0)}</div>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Egresos bancarios</div>
                <div className="text-lg font-semibold tabular-nums">{fmtMxn(d?.egresos ?? 0)}</div>
              </div>
            </div>
          </DemoCard>
        </div>

        <div className="space-y-4">
          <DemoCard title="Cómo opera el agente">
            <ol className="space-y-3 text-sm">
              <li className="flex gap-2"><Upload className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Escucha</b> nuevos estados de cuenta subidos al expediente.</span></li>
              <li className="flex gap-2"><Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Cruza</b> cada movimiento contra los CFDI del periodo (monto + fecha + contraparte).</span></li>
              <li className="flex gap-2"><ScanSearch className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Flagea</b> depósitos sin CFDI y CFDI sin cobro.</span></li>
              <li className="flex gap-2"><Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Re-corre</b> cada 60s mientras esté activo.</span></li>
            </ol>
          </DemoCard>

          <DemoCard title="Herramientas del agente">
            <div className="grid gap-2">
              <Link to="/app/conciliacion" className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 hover:bg-accent px-3 py-2 text-sm">
                <Banknote className="h-4 w-4 text-primary" /> Conciliador bancario
              </Link>
              <Link to="/app/cfdi" className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 hover:bg-accent px-3 py-2 text-sm">
                <ScanSearch className="h-4 w-4 text-primary" /> CFDI del expediente
              </Link>
            </div>
          </DemoCard>
        </div>
      </div>
    </ModuleScaffold>
  );
}
