import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import {
  Banknote, Upload, Sparkles, AlertTriangle, CheckCircle2, FileSpreadsheet,
  Loader2, TrendingUp, TrendingDown, Wand2, X, Download, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { fmtFechaMx } from "@/lib/utils";
import { useActiveCliente } from "@/lib/active-cliente";
import { parseBankFile, type ParsedMovimiento } from "@/lib/conciliacion/parsers";
import {
  uploadMovimientos, listMovimientos, runReconciliation,
  getReconciliationStats, analyzeReconciliationAI, updateConciliacion,
} from "@/lib/conciliacion/conciliacion.functions";
import { listCuentas, createCuenta, BANCOS } from "@/lib/cuentas/cuentas.functions";
import { exportXlsx, buildFilename } from "@/lib/export/xlsx";

export const Route = createFileRoute("/app/conciliacion/")({
  component: ConciliacionPage,
});

function ConciliacionPage() {
  const { cliente } = useActiveCliente();
  const qc = useQueryClient();
  const fnUpload = useServerFn(uploadMovimientos);
  const fnList = useServerFn(listMovimientos);
  const fnRun = useServerFn(runReconciliation);
  const fnStats = useServerFn(getReconciliationStats);
  const fnAI = useServerFn(analyzeReconciliationAI);
  const fnUpdate = useServerFn(updateConciliacion);

  const [banco, setBanco] = useState("BBVA");
  const [parsed, setParsed] = useState<ParsedMovimiento[]>([]);
  const [parsingErr, setParsingErr] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiContent, setAiContent] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useQuery({
    enabled: !!cliente,
    queryKey: ["recon-stats", cliente?.id],
    queryFn: () => fnStats({ data: { cliente_id: cliente!.id } }),
  });
  const list = useQuery({
    enabled: !!cliente,
    queryKey: ["recon-list", cliente?.id],
    queryFn: () => fnList({ data: { cliente_id: cliente!.id, limit: 500 } }),
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!cliente) throw new Error("Selecciona un expediente");
      if (!parsed.length) throw new Error("Sube un archivo primero");
      return fnUpload({ data: { cliente_id: cliente.id, banco, movimientos: parsed } });
    },
    onSuccess: (res) => {
      toast.success(`${res.inserted} movimientos cargados`, { description: `${res.duplicates} duplicados ignorados` });
      setParsed([]);
      qc.invalidateQueries({ queryKey: ["recon-stats", cliente?.id] });
      qc.invalidateQueries({ queryKey: ["recon-list", cliente?.id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const run = useMutation({
    mutationFn: async () => fnRun({ data: { cliente_id: cliente!.id } }),
    onSuccess: (r) => {
      toast.success(`Conciliación completada`, { description: `${r.exactos} exactos · ${r.probables} probables` });
      qc.invalidateQueries({ queryKey: ["recon-stats", cliente?.id] });
      qc.invalidateQueries({ queryKey: ["recon-list", cliente?.id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const ai = useMutation({
    mutationFn: async () => fnAI({ data: { cliente_id: cliente!.id } }),
    onSuccess: (r) => {
      if (r.error) { toast.error(r.error); return; }
      setAiContent(r.content);
      setAiOpen(true);
    },
  });

  const concById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof list.data>["conciliaciones"][number]>();
    list.data?.conciliaciones.forEach((c) => { if (c.movimiento_id) map.set(c.movimiento_id, c); });
    return map;
  }, [list.data]);

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    setParsingErr(null);
    const all: ParsedMovimiento[] = [];
    try {
      for (const f of Array.from(files)) {
        const rows = await parseBankFile(f);
        all.push(...rows);
      }
      if (!all.length) throw new Error("No se detectaron movimientos. Verifica que el archivo tenga columnas Fecha, Descripción y Cargo/Abono o Monto.");
      setParsed(all);
      toast.success(`${all.length} movimientos detectados`);
    } catch (e) {
      const msg = (e as Error).message;
      setParsingErr(msg);
      toast.error(msg);
    }
  }

  function exportCsv() {
    if (!list.data) return;
    const rows = list.data.movimientos.map((m) => {
      const c = concById.get(m.id);
      return {
        fecha: m.fecha,
        descripcion: (m.descripcion ?? "").replace(/[\r\n,]/g, " "),
        referencia: m.referencia ?? "",
        cargo: m.cargo,
        abono: m.abono,
        match: c ? c.tipo_match : "sin_cfdi",
        probabilidad: c?.probabilidad ?? "",
        motivo: (c?.motivo ?? "").replace(/[\r\n,]/g, " "),
      };
    });
    const headers = Object.keys(rows[0] ?? { fecha: "" });
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => (r as any)[h]).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `conciliacion-${cliente?.rfc}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportExcel() {
    if (!list.data || !cliente) return;
    const movs = list.data.movimientos.map((m) => {
      const c = concById.get(m.id);
      return {
        Fecha: m.fecha,
        Concepto: m.descripcion ?? "",
        Referencia: m.referencia ?? "",
        Cargo: Number(m.cargo ?? 0),
        Abono: Number(m.abono ?? 0),
        Match: c ? c.tipo_match : "sin_cfdi",
        Probabilidad: c?.probabilidad ?? "",
        Estatus: c?.estatus ?? "",
        Motivo: c?.motivo ?? "",
      };
    });
    const resumen = s ? [{
      Cliente: cliente.razon_social, RFC: cliente.rfc,
      Movimientos: s.total_movimientos, CFDI: s.total_cfdi,
      Conciliados: s.matched, "Tasa %": s.tasa,
      "Sin CFDI": s.sinCfdi, "CFDI sin pago": s.cfdiSinPago,
      "Ingresos": s.ingresos, "Egresos": s.egresos,
      Exactos: s.exactos, Probables: s.probables,
    }] : [];
    exportXlsx(buildFilename("conciliacion", cliente.rfc), [
      { name: "Resumen", rows: resumen },
      { name: "Movimientos", rows: movs },
    ]);
  }

  if (!cliente) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/5 p-8 flex items-start gap-4">
        <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div>
          <div className="font-medium">Selecciona un expediente</div>
          <p className="text-sm text-muted-foreground mt-1">El conciliador opera sobre el RFC de un cliente concreto. Elige uno desde la barra superior.</p>
        </div>
      </div>
    );
  }

  const s = stats.data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
            <Banknote className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Conciliación bancaria IA</h1>
            <p className="text-sm text-muted-foreground mt-1">Cruza estados de cuenta con CFDI emitidos y recibidos. Detecta diferencias y riesgos fiscales.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="glass" onClick={exportCsv} disabled={!list.data?.movimientos.length}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="glass" onClick={exportExcel} disabled={!list.data?.movimientos.length}><Download className="h-4 w-4" /> Excel</Button>
          <Button variant="glass" onClick={() => ai.mutate()} disabled={ai.isPending || !s?.total_movimientos}>
            {ai.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Analizar con IA
          </Button>
          <Button variant="hero" onClick={() => run.mutate()} disabled={run.isPending || !s?.total_movimientos}>
            {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Ejecutar conciliación
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Movimientos" value={s?.total_movimientos ?? 0} />
        <Kpi label="CFDI" value={s?.total_cfdi ?? 0} />
        <Kpi label="Conciliados" value={`${s?.tasa ?? 0}%`} sub={`${s?.matched ?? 0} matches`} tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
        <Kpi label="Sin CFDI" value={s?.sinCfdi ?? 0} tone="warning" icon={<AlertTriangle className="h-3.5 w-3.5" />} />
        <Kpi label="CFDI sin pago" value={s?.cfdiSinPago ?? 0} tone="warning" icon={<AlertTriangle className="h-3.5 w-3.5" />} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Ingresos bancarios" value={fmtMxn(s?.ingresos ?? 0)} icon={<TrendingUp className="h-3.5 w-3.5 text-success" />} />
        <Kpi label="Egresos bancarios" value={fmtMxn(s?.egresos ?? 0)} icon={<TrendingDown className="h-3.5 w-3.5 text-destructive" />} />
        <Kpi label="Matches exactos" value={s?.exactos ?? 0} tone="success" />
        <Kpi label="Matches probables" value={s?.probables ?? 0} />
      </div>

      {/* Upload */}
      <div className="rounded-xl border border-border/60 bg-card/50 p-5">
        <div className="flex items-center gap-3 mb-4">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          <div className="font-medium">Subir estado de cuenta</div>
          <span className="text-xs text-muted-foreground ml-auto">CSV · XLSX</span>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="text-xs text-muted-foreground">Banco</label>
            <select
              value={banco}
              onChange={(e) => setBanco(e.target.value)}
              className="mt-1 w-full h-10 rounded-md bg-background border border-border px-3 text-sm"
            >
              {["BBVA", "Banorte", "Santander", "Banamex", "HSBC", "Scotiabank", "Inbursa", "Azteca", "Mifel", "Otro"].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
          <div
            className="md:col-span-2 rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors p-6 text-center cursor-pointer"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onPickFiles(e.dataTransfer.files); }}
          >
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
            <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
            <div className="mt-2 text-sm font-medium">Arrastra tu estado de cuenta o haz click</div>
            <div className="text-xs text-muted-foreground mt-1">Acepta múltiples archivos · auto-detecta columnas Fecha, Descripción, Cargo/Abono</div>
          </div>
        </div>

        {parsingErr && (
          <div className="mt-4 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {parsingErr}
          </div>
        )}
        {parsed.length > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-primary/5 border border-primary/20 p-3">
            <div className="text-sm">
              <span className="font-medium">{parsed.length}</span> movimientos listos · rango {fmtFechaMx(parsed[parsed.length - 1].fecha)} → {fmtFechaMx(parsed[0].fecha)}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setParsed([])}><X className="h-4 w-4" /> Descartar</Button>
              <Button variant="hero" size="sm" onClick={() => upload.mutate()} disabled={upload.isPending}>
                {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Cargar a {banco}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Movimientos */}
      <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <div className="font-semibold">Movimientos {list.data ? `(${list.data.movimientos.length})` : ""}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Fecha</th>
                <th className="text-left px-4 py-2">Concepto</th>
                <th className="text-left px-4 py-2">Ref.</th>
                <th className="text-right px-4 py-2">Monto</th>
                <th className="text-left px-4 py-2">Estado</th>
                <th className="text-left px-4 py-2">
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 cursor-help">
                          Motivo <Info className="h-3 w-3" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Razón por la que el conciliador emparejó (o no) este movimiento con un CFDI: coincidencia de monto, fecha, RFC o referencia. Si es "—", aún no se ha intentado conciliar o no hubo candidato.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {(list.data?.movimientos ?? []).map((m) => {
                const c = concById.get(m.id);
                const monto = Number(m.abono ?? 0) > 0 ? Number(m.abono) : -Number(m.cargo ?? 0);
                return (
                  <tr key={m.id} className="hover:bg-accent/5">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtFechaMx(m.fecha)}</td>
                    <td className="px-4 py-2.5 max-w-[280px] truncate">{m.descripcion}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{m.referencia ?? "—"}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${monto >= 0 ? "text-success" : "text-foreground"}`}>
                      {monto >= 0 ? "+" : "−"}{fmtMxn(Math.abs(monto))}
                    </td>
                    <td className="px-4 py-2.5"><MatchBadge c={c} /></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[260px] truncate">{c?.motivo ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {c && c.estatus === "propuesto" && (
                        <div className="flex gap-1">
                          <button onClick={() => fnUpdate({ data: { id: c.id, estatus: "confirmado" } }).then(() => qc.invalidateQueries({ queryKey: ["recon-list", cliente.id] }))}
                            className="text-xs px-2 py-1 rounded bg-success/15 text-success hover:bg-success/25">✓</button>
                          <button onClick={() => fnUpdate({ data: { id: c.id, estatus: "rechazado" } }).then(() => qc.invalidateQueries({ queryKey: ["recon-list", cliente.id] }))}
                            className="text-xs px-2 py-1 rounded bg-destructive/15 text-destructive hover:bg-destructive/25">✗</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!list.data?.movimientos.length && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">Aún no hay movimientos. Sube tu primer estado de cuenta.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {aiOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-center justify-center p-4" onClick={() => setAiOpen(false)}>
          <div className="bg-card border border-border rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" /> Análisis IA · Conciliación</div>
              <button onClick={() => setAiOpen(false)} className="p-1 hover:bg-accent/40 rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-y-auto p-6 prose prose-invert prose-sm max-w-none whitespace-pre-wrap">{aiContent}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone, icon }: { label: string; value: string | number; sub?: string; tone?: "success" | "warning"; icon?: React.ReactNode }) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className={`text-2xl font-semibold mt-1 tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function MatchBadge({ c }: { c?: { tipo_match: string; probabilidad: number | null; estatus: string } }) {
  if (!c) return <span className="text-xs px-2 py-1 rounded-md bg-warning/15 text-warning">Sin CFDI</span>;
  const pct = c.probabilidad != null ? `${Math.round(Number(c.probabilidad) * 100)}%` : "";
  if (c.estatus === "rechazado") return <span className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground">Rechazado</span>;
  if (c.tipo_match === "exacto") return <span className="text-xs px-2 py-1 rounded-md bg-success/15 text-success">Exacto · {pct}</span>;
  if (c.tipo_match === "probable") return <span className="text-xs px-2 py-1 rounded-md bg-primary/15 text-primary">Probable · {pct}</span>;
  return <span className="text-xs px-2 py-1 rounded-md bg-accent/30">{c.tipo_match}</span>;
}

function fmtMxn(n: number) {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
