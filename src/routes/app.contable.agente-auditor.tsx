import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ScanSearch, Play, Pause, RefreshCw, ArrowLeft, FolderOpen, CheckCircle2, AlertTriangle, Sparkles, ShieldCheck, Clock, FileText } from "lucide-react";
import { ModuleScaffold, KpiTile, DemoCard } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { useActiveCliente } from "@/lib/active-cliente";
import { runExpressAudit, type AuditFinding } from "@/lib/auditor/auditor.functions";

export const Route = createFileRoute("/app/contable/agente-auditor")({ component: AgenteAuditorPage });

const STORAGE_KEY = "agente-auditor:estado";
const REFRESH_MS = 90_000;
const fmtMxn = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);

function AgenteAuditorPage() {
  const { cliente } = useActiveCliente();
  const [activo, setActivo] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v == null ? true : v === "1";
  });
  const [lastRun, setLastRun] = useState<Date | null>(null);

  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, activo ? "1" : "0"); }, [activo]);

  const auditFn = useServerFn(runExpressAudit);
  const enabled = !!cliente?.id;
  const clienteId = cliente?.id ?? "";

  const auditQ = useQuery({
    queryKey: ["agente-auditor", "audit", clienteId],
    queryFn: () => auditFn({ data: { cliente_id: clienteId } }),
    enabled,
    refetchInterval: activo ? REFRESH_MS : false,
  });

  useEffect(() => { if (auditQ.dataUpdatedAt) setLastRun(new Date(auditQ.dataUpdatedAt)); }, [auditQ.dataUpdatedAt]);

  const findings: AuditFinding[] = useMemo(() => auditQ.data?.findings ?? [], [auditQ.data]);
  const altas = findings.filter((f) => f.severidad === "alta").length;
  const medias = findings.filter((f) => f.severidad === "media").length;
  const bajas = findings.filter((f) => f.severidad === "baja").length;
  const exposicion = findings.reduce((a, f) => a + (Number(f.monto) || 0), 0);

  if (!cliente) {
    return (
      <ModuleScaffold title="Agente Auditor" subtitle="Selecciona un expediente para activar el agente." icon={<ScanSearch className="h-5 w-5" />} badge={null}>
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

  return (
    <ModuleScaffold
      title="Agente Auditor"
      subtitle={`Hallazgos preventivos de cierre para ${cliente.razon_social}. Revisa gastos, deducibilidad y consistencia documental.`}
      icon={<ScanSearch className="h-5 w-5" />}
      badge={activo ? "Activo · Auto-refresh 90s" : "Pausado"}
      actions={
        <>
          <HerramientaHelp slug="agente-auditor" />
          <Link to="/app/contable/agentes" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/60 bg-card/60 hover:bg-card text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Agentes
          </Link>
          <button onClick={() => setActivo((v) => !v)} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium ${activo ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30" : "bg-muted text-muted-foreground border border-border"}`}>
            {activo ? <><Pause className="h-3.5 w-3.5" /> Pausar</> : <><Play className="h-3.5 w-3.5" /> Activar</>}
          </button>
          <button onClick={() => auditQ.refetch()} disabled={auditQ.isLoading} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${auditQ.isLoading ? "animate-spin" : ""}`} /> Ejecutar ahora
          </button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Hallazgos totales" value={String(findings.length)} hint={`${altas} alta · ${medias} media · ${bajas} baja`} accent={altas ? "destructive" : medias ? "warning" : "success"} />
        <KpiTile label="Severidad alta" value={String(altas)} hint="Riesgo fiscal inmediato" accent={altas ? "destructive" : "success"} />
        <KpiTile label="Exposición estimada" value={fmtMxn(exposicion)} hint="Monto total flagged" accent="warning" />
        <KpiTile label="Última corrida" value={lastRun ? lastRun.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—"} hint={activo ? "Próxima en <90s" : "Pausado"} accent="gold" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <DemoCard title="Hallazgos del cierre">
            {auditQ.isLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Auditando expediente…</div>
            ) : findings.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Sin hallazgos. Cierre listo.
              </div>
            ) : (
              <ul className="space-y-2">
                {findings.slice(0, 20).map((f, i) => {
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
        </div>

        <div className="space-y-4">
          <DemoCard title="Cómo opera el agente">
            <ol className="space-y-3 text-sm">
              <li className="flex gap-2"><Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Escanea</b> CFDI, gastos y deducciones del expediente.</span></li>
              <li className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Valida</b> deducibilidad, materialidad y consistencia documental.</span></li>
              <li className="flex gap-2"><ScanSearch className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Prioriza</b> hallazgos por severidad y exposición fiscal.</span></li>
              <li className="flex gap-2"><Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Re-corre</b> cada 90s mientras esté activo.</span></li>
            </ol>
          </DemoCard>

          <DemoCard title="Herramientas del agente">
            <div className="grid gap-2">
              <Link to="/app/tools/express-auditor" className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 hover:bg-accent px-3 py-2 text-sm">
                <ScanSearch className="h-4 w-4 text-primary" /> Auditor express
              </Link>
              <Link to="/app/tools/deducibility-checker" className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 hover:bg-accent px-3 py-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" /> Validador de Deducibilidad
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
