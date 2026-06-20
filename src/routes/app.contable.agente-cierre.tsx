import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Play, Pause, RefreshCw, ArrowLeft, FolderOpen, CheckCircle2, AlertTriangle, Sparkles, Clock, FileText, Receipt } from "lucide-react";
import { ModuleScaffold, KpiTile, DemoCard } from "@/components/ModuleScaffold";
import { useActiveCliente } from "@/lib/active-cliente";
import { getResumenFiscalMes } from "@/lib/fiscal/resumen.functions";

export const Route = createFileRoute("/app/contable/agente-cierre")({ component: AgenteCierrePage });

const STORAGE_KEY = "agente-cierre:estado";
const REFRESH_MS = 120_000;
const fmtMxn = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);

function currentPeriodo(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function AgenteCierrePage() {
  const { cliente } = useActiveCliente();
  const [periodo, setPeriodo] = useState<string>(currentPeriodo());
  const [activo, setActivo] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v == null ? true : v === "1";
  });
  const [lastRun, setLastRun] = useState<Date | null>(null);

  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, activo ? "1" : "0"); }, [activo]);

  const resumenFn = useServerFn(getResumenFiscalMes);
  const enabled = !!cliente?.id;
  const clienteId = cliente?.id ?? "";

  const resumenQ = useQuery({
    queryKey: ["agente-cierre", "resumen", clienteId, periodo],
    queryFn: () => resumenFn({ data: { cliente_id: clienteId, periodo } }),
    enabled,
    refetchInterval: activo ? REFRESH_MS : false,
  });

  useEffect(() => { if (resumenQ.dataUpdatedAt) setLastRun(new Date(resumenQ.dataUpdatedAt)); }, [resumenQ.dataUpdatedAt]);

  const r = resumenQ.data;
  // ISR provisional simplificado: 30% sobre utilidad bruta del mes (estimación de cierre)
  const utilidad = useMemo(() => Math.max(0, (r?.ingresos ?? 0) - (r?.egresos ?? 0)), [r]);
  const isrProv = Math.round(utilidad * 0.3);
  const ivaPorPagar = Math.max(0, Math.round((r?.ivaTrasladado ?? 0) - (r?.ivaAcreditable ?? 0)));
  const ivaFavor = Math.max(0, Math.round((r?.ivaAcreditable ?? 0) - (r?.ivaTrasladado ?? 0)));

  const alertas: { sev: "alta" | "media" | "baja"; tipo: string; msg: string }[] = [];
  if (r) {
    if ((r.cfdiCount ?? 0) === 0) alertas.push({ sev: "alta", tipo: "Sin CFDI en el periodo", msg: "No hay comprobantes registrados para el mes seleccionado. Sube los XML antes del cierre." });
    if (utilidad > 0 && r.ingresos > 0 && r.egresos / Math.max(r.ingresos, 1) < 0.2) alertas.push({ sev: "media", tipo: "Margen de deducciones bajo", msg: "Las deducciones representan <20% de los ingresos. Revisa gastos faltantes antes de provisionar ISR." });
    if (r.ivaTrasladado > 0 && r.ivaAcreditable === 0) alertas.push({ sev: "media", tipo: "Sin IVA acreditable", msg: "Se cobró IVA pero no hay IVA acreditable registrado. Confirma CFDI de gastos." });
    if (r.notasCreditoEmitidas > 0) alertas.push({ sev: "baja", tipo: "Notas de crédito emitidas", msg: `${r.notasCreditoEmitidas} CFDI tipo E. Verifica que estén vinculadas al CFDI original.` });
  }

  if (!cliente) {
    return (
      <ModuleScaffold title="Agente Cierre" subtitle="Selecciona un expediente para activar el agente." icon={<Calculator className="h-5 w-5" />} badge={null}>
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
      title="Agente Cierre"
      subtitle={`Pre-cierre mensual de ${cliente.razon_social}. Provisiona ISR/IVA y prepara el papel de trabajo del mes.`}
      icon={<Calculator className="h-5 w-5" />}
      badge={activo ? "Activo · Auto-refresh 120s" : "Pausado"}
      actions={
        <>
          <Link to="/app/contable/agentes" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/60 bg-card/60 hover:bg-card text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Agentes
          </Link>
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="h-9 px-2 rounded-md border border-border/60 bg-card/60 text-xs"
          />
          <button onClick={() => setActivo((v) => !v)} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium ${activo ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30" : "bg-muted text-muted-foreground border border-border"}`}>
            {activo ? <><Pause className="h-3.5 w-3.5" /> Pausar</> : <><Play className="h-3.5 w-3.5" /> Activar</>}
          </button>
          <button onClick={() => resumenQ.refetch()} disabled={resumenQ.isLoading} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${resumenQ.isLoading ? "animate-spin" : ""}`} /> Ejecutar ahora
          </button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Ingresos del mes" value={fmtMxn(r?.ingresos ?? 0)} hint={`${r?.cfdiCount ?? 0} CFDI`} accent="success" />
        <KpiTile label="Deducciones" value={fmtMxn(r?.egresos ?? 0)} hint={`Utilidad: ${fmtMxn(utilidad)}`} accent="primary" />
        <KpiTile label="ISR provisional (30%)" value={fmtMxn(isrProv)} hint="Estimación de cierre" accent={isrProv ? "warning" : "success"} />
        <KpiTile label={ivaFavor > 0 ? "IVA a favor" : "IVA por pagar"} value={fmtMxn(ivaFavor > 0 ? ivaFavor : ivaPorPagar)} hint={`Trasladado ${fmtMxn(r?.ivaTrasladado ?? 0)} · Acred. ${fmtMxn(r?.ivaAcreditable ?? 0)}`} accent={ivaFavor > 0 ? "success" : ivaPorPagar ? "warning" : "success"} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <DemoCard title="Checklist de pre-cierre">
            {resumenQ.isLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Calculando cierre…</div>
            ) : alertas.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Cierre listo para enviar a revisión.
              </div>
            ) : (
              <ul className="space-y-2">
                {alertas.map((a, i) => {
                  const color = a.sev === "alta" ? "text-red-600 dark:text-red-300 bg-red-500/10 border-red-500/30"
                    : a.sev === "media" ? "text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30"
                    : "text-muted-foreground bg-muted/40 border-border";
                  return (
                    <li key={i} className={`flex items-start gap-3 rounded-lg border p-3 ${color}`}>
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs uppercase tracking-wider opacity-80">{a.tipo} · {a.sev}</div>
                        <div className="text-sm mt-0.5">{a.msg}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </DemoCard>

          <DemoCard title="Resumen fiscal del periodo">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Periodo</div>
                <div className="text-lg font-semibold font-mono">{r?.periodo ?? periodo}</div>
                <div className="text-xs text-muted-foreground mt-1">{r?.desde} → {r?.hasta}</div>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">RFC emisor</div>
                <div className="text-lg font-semibold font-mono">{r?.emisorRfc ?? "—"}</div>
                <div className="text-xs text-muted-foreground mt-1">{r?.cfdiCount ?? 0} CFDI procesados</div>
              </div>
            </div>
          </DemoCard>
        </div>

        <div className="space-y-4">
          <DemoCard title="Cómo opera el agente">
            <ol className="space-y-3 text-sm">
              <li className="flex gap-2"><Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Consolida</b> CFDI emitidos y recibidos del periodo.</span></li>
              <li className="flex gap-2"><Calculator className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Provisiona</b> ISR (30% sobre utilidad) e IVA neto.</span></li>
              <li className="flex gap-2"><Receipt className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Alerta</b> sobre faltantes antes del día 17 (declaración).</span></li>
              <li className="flex gap-2"><Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span><b>Re-corre</b> cada 120s mientras esté activo.</span></li>
            </ol>
          </DemoCard>

          <DemoCard title="Herramientas del agente">
            <div className="grid gap-2">
              <Link to="/app/tools/isr-iva-calculator" className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 hover:bg-accent px-3 py-2 text-sm">
                <Calculator className="h-4 w-4 text-primary" /> Cálculo ISR/IVA
              </Link>
              <Link to="/app/tools/resico-calculator" className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 hover:bg-accent px-3 py-2 text-sm">
                <Receipt className="h-4 w-4 text-primary" /> RESICO
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
