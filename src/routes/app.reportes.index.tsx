import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  FileBarChart, Sparkles, Download, FileSpreadsheet, FileText, Loader2,
  TrendingUp, Receipt, Calculator, AlertTriangle, FileX, Banknote, X, MessageCircle,
  BookOpen, Scale, FileDigit,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RichMarkdown } from "@/components/RichMarkdown";
import { useActiveCliente } from "@/lib/active-cliente";
import { computeReporte, listReportes, summarizeReporteAI, type ReporteTipo } from "@/lib/reportes/reportes.functions";
import { downloadReportePDF } from "@/lib/reportes/pdf";
import { downloadReporteExcel, downloadReporteCSV, downloadDIOTtxt } from "@/lib/reportes/excel";

export const Route = createFileRoute("/app/reportes/")({
  component: ReportesPage,
});

const TIPOS: Array<{ key: ReporteTipo; titulo: string; desc: string; icon: any; tone: string }> = [
  { key: "estado_resultados", titulo: "Estado de Resultados", desc: "Ingresos, egresos y utilidad del periodo", icon: TrendingUp, tone: "from-emerald-500/20 text-emerald-300" },
  { key: "balance_general", titulo: "Balance General", desc: "Activo, pasivo y capital al cierre del periodo", icon: Scale, tone: "from-teal-500/20 text-teal-300" },
  { key: "balanza", titulo: "Balanza de Comprobación", desc: "Movimientos por cliente y proveedor (RFC)", icon: BookOpen, tone: "from-indigo-500/20 text-indigo-300" },
  { key: "iva", titulo: "Reporte IVA", desc: "Trasladado, acreditable y por pagar", icon: Receipt, tone: "from-cyan-500/20 text-cyan-300" },
  { key: "isr", titulo: "Reporte ISR", desc: "Pago provisional con tasa según régimen", icon: Calculator, tone: "from-violet-500/20 text-violet-300" },
  { key: "diot", titulo: "DIOT", desc: "Operaciones con terceros · exporta .txt SAT", icon: FileDigit, tone: "from-fuchsia-500/20 text-fuchsia-300" },
  { key: "diferencias", titulo: "Diferencias Fiscales", desc: "CFDI vs bancos no conciliados", icon: AlertTriangle, tone: "from-amber-500/20 text-amber-300" },
  { key: "xml_inconsistentes", titulo: "XML Inconsistentes", desc: "CFDI con riesgos y errores", icon: FileX, tone: "from-rose-500/20 text-rose-300" },
  { key: "depositos_no_identificados", titulo: "Depósitos no Identificados", desc: "Abonos sin CFDI relacionado", icon: Banknote, tone: "from-blue-500/20 text-blue-300" },
];

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Number(n) || 0);

function defaultDesde() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}
function defaultHasta() {
  const d = new Date();
  d.setDate(0);
  return d.toISOString().slice(0, 10);
}

function ReportesPage() {
  const { cliente } = useActiveCliente();
  const qc = useQueryClient();
  const fnCompute = useServerFn(computeReporte);
  const fnList = useServerFn(listReportes);
  const fnAI = useServerFn(summarizeReporteAI);

  const [desde, setDesde] = useState(defaultDesde());
  const [hasta, setHasta] = useState(defaultHasta());
  const [running, setRunning] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState<{ id: string; tipo: string; payload: any; content: string } | null>(null);

  const list = useQuery({
    enabled: !!cliente,
    queryKey: ["reportes", cliente?.id],
    queryFn: () => fnList({ data: { cliente_id: cliente!.id } }),
  });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const friendlyError = (e: unknown): string => {
    const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
    try {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : parsed?.issues ?? [parsed];
      const first = Array.isArray(arr) ? arr[0] : arr;
      if (first?.path?.includes?.("cliente_id")) return "Selecciona un expediente activo para generar reportes.";
      if (first?.path?.includes?.("desde") || first?.path?.includes?.("hasta")) return "Revisa el rango de fechas (formato AAAA-MM-DD).";
      if (first?.message && typeof first.message === "string" && !first.message.startsWith("{")) return first.message;
    } catch { /* not JSON */ }
    if (/invalid.*uuid/i.test(raw) || /cliente_id/i.test(raw)) return "Selecciona un expediente activo para generar reportes.";
    if (/unauthorized|jwt/i.test(raw)) return "Tu sesión expiró. Vuelve a iniciar sesión.";
    return raw || "No se pudo completar la operación. Intenta de nuevo.";
  };

  const compute = useMutation({
    mutationFn: async (tipo: ReporteTipo) => {
      if (!cliente) throw new Error("Selecciona un expediente activo para generar reportes.");
      if (!UUID_RE.test(cliente.id)) throw new Error("Este expediente es demo. Crea o selecciona un expediente real para generar reportes.");
      setRunning(tipo);
      return fnCompute({ data: { cliente_id: cliente.id, desde, hasta, tipo } });
    },
    onSuccess: (res, tipo) => {
      toast.success("Reporte generado", { description: TIPOS.find((t) => t.key === tipo)?.titulo });
      downloadReportePDF({ tipo, payload: res.payload });
      qc.invalidateQueries({ queryKey: ["reportes", cliente?.id] });
    },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => setRunning(null),
  });

  const aiSummary = useMutation({
    mutationFn: async ({ id, tipo, payload }: { id: string; tipo: string; payload: any }) => {
      const r = await fnAI({ data: { reporte_id: id } });
      if (r.error) throw new Error(r.error);
      setAiOpen({ id, tipo, payload, content: r.content });
      return r;
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const recent = list.data?.reportes ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reportería Inteligente</h1>
          <p className="text-muted-foreground text-sm mt-1">Genera reportes premium con análisis IA. Exporta PDF, Excel o CSV.</p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 px-3 rounded-md bg-card/50 border border-border text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 px-3 rounded-md bg-card/50 border border-border text-sm" />
          </div>
        </div>
      </div>

      {!cliente && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
          Selecciona un expediente arriba para generar reportes.
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {TIPOS.map((t) => {
          const Icon = t.icon;
          const isRunning = running === t.key;
          return (
            <div key={t.key} className="rounded-xl p-5 border border-border/60 bg-card/50 hover:border-primary/40 transition-all hover:-translate-y-0.5 flex flex-col">
              <div className={`h-11 w-11 rounded-lg bg-gradient-to-br ${t.tone} flex items-center justify-center mb-3`}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{t.titulo}</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed flex-1">{t.desc}</p>
              <Button
                disabled={!cliente || isRunning}
                onClick={() => compute.mutate(t.key)}
                variant="glass"
                size="sm"
                className="mt-4"
              >
                {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Generar PDF
              </Button>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
        <div className="p-5 border-b border-border/50 flex items-center justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><FileBarChart className="h-4 w-4 text-primary" /> Reportes recientes</h3>
            <p className="text-xs text-muted-foreground">Historial de los últimos 50 reportes generados.</p>
          </div>
          <Link to="/app/mensajes" className="text-xs text-primary hover:underline flex items-center gap-1"><MessageCircle className="h-3 w-3" /> Ir a mensajes →</Link>
        </div>
        {!recent.length ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">Sin reportes aún. Genera el primero arriba.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Tipo</th>
                <th className="text-left px-4 py-2">Periodo</th>
                <th className="text-left px-4 py-2">Resumen</th>
                <th className="text-left px-4 py-2">Generado</th>
                <th className="text-right px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {recent.map((r) => {
                const params = JSON.parse(r.parametros_json || "{}") as { desde?: string; hasta?: string };
                const payload = JSON.parse(r.resultado_json || "{}");
                const resumen = payload.resumen ?? {};
                const summary =
                  r.tipo === "estado_resultados" ? `Utilidad ${fmtMXN(resumen.utilidad)}` :
                  r.tipo === "iva" ? `Por pagar ${fmtMXN(resumen.iva_por_pagar)}` :
                  r.tipo === "isr" ? `ISR ${fmtMXN(resumen.isr_por_pagar)}` :
                  r.tipo === "diferencias" ? `${resumen.cfdi_sin_pago ?? 0} CFDI · ${resumen.movimientos_sin_cfdi ?? 0} mov` :
                  r.tipo === "xml_inconsistentes" ? `${resumen.inconsistentes ?? 0} con riesgo` :
                  r.tipo === "depositos_no_identificados" ? `${resumen.total_depositos ?? 0} · ${fmtMXN(resumen.monto_total)}` :
                  r.tipo === "balanza" ? `${resumen.n_clientes ?? 0} cli · ${resumen.n_proveedores ?? 0} prov` :
                  r.tipo === "balance_general" ? `Capital ${fmtMXN(resumen.capital_contable)}` :
                  r.tipo === "diot" ? `${resumen.n_proveedores ?? 0} prov · ${fmtMXN(resumen.base_iva16)}` : "—";
                return (
                  <tr key={r.id} className="hover:bg-accent/20">
                    <td className="px-4 py-3 font-medium">{TIPOS.find((t) => t.key === r.tipo)?.titulo ?? r.tipo}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{params.desde} → {params.hasta}</td>
                    <td className="px-4 py-3 text-xs">{summary}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("es-MX")}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => downloadReportePDF({ tipo: r.tipo, payload })}><FileText className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => downloadReporteExcel({ tipo: r.tipo, payload })}><FileSpreadsheet className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => downloadReporteCSV({ tipo: r.tipo, payload })}><Download className="h-3.5 w-3.5" /></Button>
                        {r.tipo === "diot" && (
                          <Button size="sm" variant="ghost" title="Descargar .txt para SAT" onClick={() => downloadDIOTtxt({ payload })}>
                            <FileDigit className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" disabled={aiSummary.isPending} onClick={() => aiSummary.mutate({ id: r.id, tipo: r.tipo, payload })}>
                          {aiSummary.isPending && aiSummary.variables?.id === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {aiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setAiOpen(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-[92%] max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Resumen ejecutivo IA</h3>
              <button onClick={() => setAiOpen(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 overflow-y-auto"><RichMarkdown>{aiOpen.content}</RichMarkdown></div>
            <div className="p-3 border-t border-border flex items-center justify-end gap-2">
              <Button variant="glass" size="sm" onClick={() => downloadReportePDF({ tipo: aiOpen.tipo, payload: aiOpen.payload, resumenIA: aiOpen.content })}>
                <FileText className="h-3.5 w-3.5" /> PDF con resumen
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAiOpen(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
