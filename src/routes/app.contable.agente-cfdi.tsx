import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { FileText, Play, Pause, RefreshCw, ShieldCheck, ScanSearch, FolderOpen, AlertTriangle, CheckCircle2, Clock, ArrowLeft, Sparkles } from "lucide-react";
import { ModuleScaffold, KpiTile, DemoCard } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { useActiveCliente } from "@/lib/active-cliente";
import { getCfdiStats, listCfdi } from "@/lib/cfdi/cfdi.functions";
import { runExpressAudit, type AuditFinding } from "@/lib/auditor/auditor.functions";

export const Route = createFileRoute("/app/contable/agente-cfdi")({ component: AgenteCfdiPage });

const STORAGE_KEY = "agente-cfdi:estado";
const REFRESH_MS = 60_000;

const fmtMxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);

function AgenteCfdiPage() {
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

  const statsFn = useServerFn(getCfdiStats);
  const listFn = useServerFn(listCfdi);
  const auditFn = useServerFn(runExpressAudit);

  const enabled = !!cliente?.id;
  const clienteId = cliente?.id ?? "";

  const statsQ = useQuery({
    queryKey: ["agente-cfdi", "stats", clienteId],
    queryFn: () => statsFn({ data: { cliente_id: clienteId } }),
    enabled,
    refetchInterval: activo ? REFRESH_MS : false,
  });

  const recentQ = useQuery({
    queryKey: ["agente-cfdi", "recent", clienteId],
    queryFn: () => listFn({ data: { cliente_id: clienteId, limit: 8 } }),
    enabled,
    refetchInterval: activo ? REFRESH_MS : false,
  });

  const auditQ = useQuery({
    queryKey: ["agente-cfdi", "audit", clienteId],
    queryFn: () => auditFn({ data: { cliente_id: clienteId } }),
    enabled,
    refetchInterval: activo ? REFRESH_MS : false,
  });

  useEffect(() => {
    if (statsQ.dataUpdatedAt) setLastRun(new Date(statsQ.dataUpdatedAt));
  }, [statsQ.dataUpdatedAt]);

  const ejecutarAhora = async () => {
    await Promise.all([statsQ.refetch(), recentQ.refetch(), auditQ.refetch()]);
  };

  const findings: AuditFinding[] = useMemo(() => auditQ.data?.findings ?? [], [auditQ.data]);
  const altas = findings.filter((f) => f.severidad === "alta").length;
  const medias = findings.filter((f) => f.severidad === "media").length;
  const loading = statsQ.isLoading || recentQ.isLoading || auditQ.isLoading;

  if (!cliente) {
    return (
      <ModuleScaffold
        title="Agente CFDI"
        subtitle="Selecciona un expediente para activar el agente."
        icon={<FileText className="h-5 w-5" />}
        badge={null}
      >
        <DemoCard>
          <div className="flex flex-col items-center text-center gap-3 py-6">
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
            <div>
              <div className="font-medium">Sin expediente activo</div>
              <p className="text-sm text-muted-foreground mt-1">El agente analiza los CFDI del expediente seleccionado en la barra superior.</p>
            </div>
            <Link to="/app/expedientes" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
              <FolderOpen className="h-4 w-4" /> Elegir expediente
            </Link>
          </div>
        </DemoCard>
      </ModuleScaffold>
    );
  }

  return (
    <ModuleScaffold
      title="Agente CFDI"
      subtitle={`Vigila, valida y audita los CFDI de ${cliente.razon_social}. Corre automáticamente cuando está activo.`}
      icon={<FileText className="h-5 w-5" />}
      badge={activo ? "Activo · Auto-refresh cada 60s" : "Pausado"}
      actions={
        <>
          <Link
            to="/app/contable/agentes"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/60 bg-card/60 hover:bg-card text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Agentes
          </Link>
          <button
            onClick={() => setActivo((v) => !v)}
            className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium transition-colors ${
              activo
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
                : "bg-muted text-muted-foreground border border-border hover:bg-accent"
            }`}
          >
            {activo ? <><Pause className="h-3.5 w-3.5" /> Pausar</> : <><Play className="h-3.5 w-3.5" /> Activar</>}
          </button>
          <button
            onClick={ejecutarAhora}
            disabled={loading}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Ejecutar ahora
          </button>
        </>
      }
    >
      {/* Estado del agente */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="CFDI en expediente" value={statsQ.data ? String(statsQ.data.total) : "—"} hint={`${statsQ.data?.cancelados ?? 0} cancelados`} accent="primary" />
        <KpiTile label="Ingresos acumulados" value={statsQ.data ? fmtMxn(statsQ.data.ingresos) : "—"} hint="Tipo I emitidos/recibidos" accent="success" />
        <KpiTile label="Hallazgos abiertos" value={String(findings.length)} hint={`${altas} alta · ${medias} media`} accent={altas ? "destructive" : medias ? "warning" : "success"} />
        <KpiTile label="Última corrida" value={lastRun ? lastRun.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—"} hint={activo ? "Próxima en <60s" : "Agente pausado"} accent="gold" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Bitácora */}
        <div className="lg:col-span-2 space-y-4">
          <DemoCard title="Bitácora del agente">
            {auditQ.isLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Analizando CFDI…</div>
            ) : findings.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Sin hallazgos. El expediente está limpio.
              </div>
            ) : (
              <ul className="space-y-2">
                {findings.slice(0, 12).map((f, i) => {
                  const color = f.severidad === "alta" ? "text-red-600 dark:text-red-300 bg-red-500/10 border-red-500/30"
                    : f.severidad === "media" ? "text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30"
                    : "text-muted-foreground bg-muted/40 border-border";
                  return (
                    <li key={i} className={`flex items-start gap-3 rounded-lg border p-3 ${color}`}>
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs uppercase tracking-wider opacity-80">{f.tipo.replaceAll("_", " ")} · {f.severidad}</div>
                        <div className="text-sm mt-0.5">{f.descripcion}</div>
                        <div className="text-[11px] font-mono opacity-70 mt-1 truncate">UUID {f.uuid} · {f.fecha?.slice(0, 10) ?? "s/f"} · {fmtMxn(f.monto)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </DemoCard>

          <DemoCard title="CFDI recientes detectados por el agente">
            {recentQ.isLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Cargando…</div>
            ) : (recentQ.data?.cfdis?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">
                Aún no hay CFDI en este expediente. Sube tu primer XML desde{" "}
                <Link to="/app/cfdi" className="text-primary hover:underline">CFDI del expediente</Link>.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="text-left py-2 pr-3">Fecha</th>
                      <th className="text-left py-2 pr-3">Tipo</th>
                      <th className="text-left py-2 pr-3">Contraparte</th>
                      <th className="text-right py-2 pr-3">Total</th>
                      <th className="text-left py-2">Estatus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentQ.data!.cfdis.map((c) => (
                      <tr key={c.id} className="border-b border-border/30 hover:bg-muted/30">
                        <td className="py-2 pr-3 whitespace-nowrap">{c.fecha?.slice(0, 10) ?? "—"}</td>
                        <td className="py-2 pr-3 font-mono">{c.tipo_cfdi}</td>
                        <td className="py-2 pr-3 truncate max-w-[220px]">{c.nombre_emisor ?? c.rfc_emisor}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{fmtMxn(Number(c.total ?? 0))}</td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] border ${
                            c.estatus_sat === "cancelado" ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300"
                            : c.estatus_sat === "vigente" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-border bg-muted text-muted-foreground"
                          }`}>{c.estatus_sat ?? "s/c"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DemoCard>
        </div>

        {/* Panel lateral */}
        <div className="space-y-4">
          <DemoCard title="Cómo opera el agente">
            <ol className="space-y-3 text-sm">
              <li className="flex gap-2"><Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Escucha</b> nuevos CFDI subidos al expediente.</span></li>
              <li className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Valida</b> estructura CFDI 4.0, UUID y método de pago.</span></li>
              <li className="flex gap-2"><ScanSearch className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Audita</b>: duplicados, NC huérfanas, cancelados, PPD sin pago y fuera de periodo.</span></li>
              <li className="flex gap-2"><Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Re-corre</b> cada 60s mientras esté activo.</span></li>
            </ol>
          </DemoCard>

          <DemoCard title="Herramientas del agente">
            <div className="grid gap-2">
              <Link to="/app/tools/cfdi-validator" className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 hover:bg-accent px-3 py-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" /> Validador CFDI 4.0
              </Link>
              <Link to="/app/tools/cfdi-verifier" className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 hover:bg-accent px-3 py-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" /> Verificador de UUID
              </Link>
              <Link to="/app/tools/express-auditor" className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 hover:bg-accent px-3 py-2 text-sm">
                <ScanSearch className="h-4 w-4 text-primary" /> Auditor express
              </Link>
              <Link to="/app/cfdi" className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 hover:bg-accent px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-primary" /> CFDI del expediente
              </Link>
            </div>
          </DemoCard>
        </div>
      </div>
    </ModuleScaffold>
  );
}
