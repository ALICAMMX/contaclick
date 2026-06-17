import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import JSZip from "jszip";
import {
  Upload, FileText, Loader2, Search, Download, X, ArrowDownToLine,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, FileWarning, Sparkles, Copy, Check,
} from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveCliente } from "@/lib/active-cliente";
import { fmtFechaMx } from "@/lib/utils";
import {
  uploadCfdiBatch, listCfdi, getCfdiStats,
} from "@/lib/cfdi/cfdi.functions";

export const Route = createFileRoute("/app/cfdi/")({
  component: CfdiDashboard,
});

type CfdiRow = {
  id: string; uuid: string; tipo_cfdi: string; fecha: string;
  rfc_emisor: string; nombre_emisor: string | null;
  rfc_receptor: string; nombre_receptor: string | null;
  total: number; subtotal: number;
  iva_trasladado: number; iva_retenido: number;
  metodo_pago: string | null; forma_pago: string | null;
  uso_cfdi: string | null; estatus_sat: string | null;
  moneda: string | null;
  tiene_crp?: boolean;
};


const TIPO_LABEL: Record<string, string> = { I: "Ingreso", E: "Egreso", N: "Nómina", P: "Pago", T: "Traslado" };

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (s: string) => fmtFechaMx(s);

function CfdiDashboard() {
  const { cliente } = useActiveCliente();
  const qc = useQueryClient();
  const list = useServerFn(listCfdi);
  const stats = useServerFn(getCfdiStats);
  const upload = useServerFn(uploadCfdiBatch);

  const [filters, setFilters] = useState<{ q: string; tipo: string; metodo_pago: string; desde: string; hasta: string }>({
    q: "", tipo: "", metodo_pago: "", desde: "", hasta: "",
  });
  const [selected, setSelected] = useState<CfdiRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleId = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isDemo = !!cliente?.id && !UUID_RE.test(cliente.id);
  const enabled = !!cliente?.id && !isDemo;

  const statsQ = useQuery({
    queryKey: ["cfdi-stats", cliente?.id],
    queryFn: () => stats({ data: { cliente_id: cliente!.id } }),
    enabled,
  });

  const listQ = useQuery({
    queryKey: ["cfdi-list", cliente?.id, filters],
    queryFn: () => list({
      data: {
        cliente_id: cliente!.id,
        q: filters.q || undefined,
        tipo: filters.tipo || undefined,
        metodo_pago: filters.metodo_pago || undefined,
        desde: filters.desde || undefined,
        hasta: filters.hasta ? `${filters.hasta}T23:59:59Z` : undefined,
        limit: 300,
      },
    }),
    enabled,
  });

  const uploadM = useMutation({
    mutationFn: async (files: Array<{ filename: string; xml: string }>) =>
      upload({ data: { cliente_id: cliente!.id, files } }),
    onSuccess: (r) => {
      const { summary } = r;
      toast.success(`${summary.inserted} cargados · ${summary.duplicates} duplicados · ${summary.failed} con error`);
      qc.invalidateQueries({ queryKey: ["cfdi-list"] });
      qc.invalidateQueries({ queryKey: ["cfdi-stats"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error en la carga"),
  });

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    if (!cliente) return;
    const files = Array.from(fileList);
    const payload: Array<{ filename: string; xml: string }> = [];

    for (const f of files) {
      const lower = f.name.toLowerCase();
      if (lower.endsWith(".zip")) {
        const zip = await JSZip.loadAsync(await f.arrayBuffer());
        const entries = Object.values(zip.files).filter((e) => !e.dir && e.name.toLowerCase().endsWith(".xml"));
        for (const e of entries) {
          payload.push({ filename: e.name.split("/").pop() || e.name, xml: await e.async("string") });
        }
      } else if (lower.endsWith(".xml")) {
        payload.push({ filename: f.name, xml: await f.text() });
      }
    }
    if (!payload.length) {
      toast.error("No se encontraron archivos XML válidos.");
      return;
    }
    // Procesar en lotes de 50 para no saturar
    const chunks = [];
    for (let i = 0; i < payload.length; i += 50) chunks.push(payload.slice(i, i + 50));
    for (const c of chunks) await uploadM.mutateAsync(c);
  }, [cliente, uploadM]);

  if (!cliente || isDemo) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold">{isDemo ? "Expediente demo activo" : "Selecciona un expediente"}</h1>
        <p className="text-muted-foreground">
          {isDemo
            ? "El expediente demo no permite cargar CFDIs reales. Crea un expediente nuevo desde Expedientes para usar este módulo."
            : "Para empezar a procesar CFDI, elige el RFC del cliente con el selector del header o crea uno nuevo."}
        </p>
        <Link to="/app/expedientes" className="inline-block"><Button>Ir a expedientes</Button></Link>
      </div>
    );
  }

  const rows = (listQ.data?.cfdis ?? []) as CfdiRow[];
  const filteredByRiesgo = filters.tipo ? rows : rows; // riesgo client-side se calcula al render

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Módulo CFDI 4.0</div>
          <h1 className="text-3xl font-semibold tracking-tight">Comprobantes fiscales</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Expediente activo: <span className="font-mono text-foreground">{cliente.rfc}</span> · {cliente.razon_social}
          </p>
        </div>
        <ExportButton rows={rows} selectedIds={selectedIds} />
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-primary/30 bg-primary/5">
          <span className="text-sm font-medium">{selectedIds.size} seleccionado{selectedIds.size === 1 ? "" : "s"}</span>
          <span className="text-xs text-muted-foreground">
            Total: {fmt(rows.filter((r) => selectedIds.has(r.id)).reduce((s, r) => s + Number(r.total || 0), 0))}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              <X className="h-3.5 w-3.5 mr-1" /> Limpiar
            </Button>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Comprobantes" value={statsQ.data?.total ?? 0} icon={<FileText className="h-4 w-4" />} />
        <Kpi label="Ingresos" value={fmt(statsQ.data?.ingresos ?? 0)} accent="up" icon={<TrendingUp className="h-4 w-4" />} />
        <Kpi label="Egresos" value={fmt(statsQ.data?.egresos ?? 0)} accent="down" icon={<TrendingDown className="h-4 w-4" />} />
        <Kpi label="Cancelados" value={statsQ.data?.cancelados ?? 0} accent="warn" icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      {/* Dropzone */}
      <Dropzone onFiles={handleFiles} loading={uploadM.isPending} />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por UUID, RFC o nombre..."
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            className="pl-9"
          />
        </div>
        <select
          value={filters.tipo}
          onChange={(e) => setFilters({ ...filters, tipo: e.target.value })}
          className="h-10 rounded-md border border-border bg-card px-3 text-sm"
        >
          <option value="">Todos los tipos</option>
          <option value="I">Ingreso</option>
          <option value="E">Egreso</option>
          <option value="N">Nómina</option>
          <option value="P">Pago</option>
          <option value="T">Traslado</option>
        </select>
        <select
          value={filters.metodo_pago}
          onChange={(e) => setFilters({ ...filters, metodo_pago: e.target.value })}
          className="h-10 rounded-md border border-border bg-card px-3 text-sm"
        >
          <option value="">Método</option>
          <option value="PUE">PUE</option>
          <option value="PPD">PPD</option>
        </select>
        <Input type="date" value={filters.desde} onChange={(e) => setFilters({ ...filters, desde: e.target.value })} className="w-[140px]" />
        <Input type="date" value={filters.hasta} onChange={(e) => setFilters({ ...filters, hasta: e.target.value })} className="w-[140px]" />
        {(filters.q || filters.tipo || filters.metodo_pago || filters.desde || filters.hasta) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({ q: "", tipo: "", metodo_pago: "", desde: "", hasta: "" })}>
            <X className="h-3.5 w-3.5 mr-1" /> Limpiar
          </Button>
        )}
      </div>

      {/* Tabla */}
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todo"
                    className="accent-primary"
                    checked={filteredByRiesgo.length > 0 && filteredByRiesgo.every((r) => selectedIds.has(r.id))}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(new Set(filteredByRiesgo.map((r) => r.id)));
                      else clearSelection();
                    }}
                  />
                </th>
                <th className="text-left font-medium px-4 py-3">Fecha</th>
                <th className="text-left font-medium px-4 py-3">Tipo</th>
                <th className="text-left font-medium px-4 py-3">UUID</th>
                <th className="text-left font-medium px-4 py-3">Emisor / Receptor</th>
                <th className="text-left font-medium px-4 py-3">Pago</th>
                <th className="text-right font-medium px-4 py-3">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading && (
                <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Cargando…
                </td></tr>
              )}
              {!listQ.isLoading && filteredByRiesgo.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">
                  Sin comprobantes. Arrastra un ZIP del SAT o XMLs para empezar.
                </td></tr>
              )}
              {filteredByRiesgo.map((r) => (
                <tr key={r.id} className={`border-b border-border/40 hover:bg-accent/20 cursor-pointer transition-colors ${selectedIds.has(r.id) ? "bg-primary/5" : ""}`}
                    onClick={() => setSelected(r)}>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${r.uuid}`}
                      className="accent-primary"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleId(r.id)}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtDate(r.fecha)}</td>
                  <td className="px-4 py-3"><TipoBadge tipo={r.tipo_cfdi} /></td>
                  <td className="px-4 py-3"><UuidCell uuid={r.uuid} /></td>
                  <td className="px-4 py-3">
                    <div className="font-medium truncate max-w-[280px]">{r.tipo_cfdi === "I" ? r.nombre_emisor : r.nombre_receptor}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {r.tipo_cfdi === "I" ? r.rfc_emisor : r.rfc_receptor}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-muted/40">{r.metodo_pago ?? "—"}</span>
                    <span className="ml-1 text-muted-foreground">{r.forma_pago}</span>
                    {r.metodo_pago === "PPD" && r.tipo_cfdi === "I" && !r.tiene_crp && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="ml-1.5 inline-flex items-center text-amber-400">
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>PPD sin Complemento de Pago (CRP)</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {r.metodo_pago === "PPD" && r.tipo_cfdi === "I" && r.tiene_crp && (
                      <span className="ml-1.5 inline-flex items-center text-emerald-400" title="Tiene CRP">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right font-medium tabular-nums">{fmt(Number(r.total))}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to="/app/cfdi/$id" params={{ id: r.id }}
                      className="text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                      Detalle →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <QuickPreview row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Kpi({ label, value, icon, accent }: { label: string; value: string | number; icon: React.ReactNode; accent?: "up" | "down" | "warn" }) {
  const accentCls = accent === "up" ? "text-emerald-400" : accent === "down" ? "text-rose-400" : accent === "warn" ? "text-amber-400" : "text-primary";
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={accentCls}>{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  const map: Record<string, string> = {
    I: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    E: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    N: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    P: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    T: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${map[tipo] ?? "bg-muted/40 border-border"}`}>
      {TIPO_LABEL[tipo] ?? tipo}
    </span>
  );
}

function Dropzone({ onFiles, loading }: { onFiles: (f: FileList | File[]) => void; loading: boolean }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all
        ${drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 bg-card/30"}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".xml,.zip"
        className="hidden"
        onChange={(e) => e.target.files && onFiles(e.target.files)}
      />
      <div className="flex flex-col items-center gap-2">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center">
          {loading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Upload className="h-5 w-5 text-primary" />}
        </div>
        <div className="text-sm">
          <span className="font-medium">{loading ? "Procesando…" : "Arrastra XML o ZIP del SAT"}</span>
          <span className="text-muted-foreground"> o haz clic para seleccionar</span>
        </div>
        <div className="text-xs text-muted-foreground">CFDI 4.0 · hasta 200 archivos por carga</div>
      </div>
    </div>
  );
}

function QuickPreview({ row, onClose }: { row: CfdiRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <TipoBadge tipo={row.tipo_cfdi} />
            <h2 className="font-mono text-sm mt-2 text-muted-foreground">{row.uuid}</h2>
            <p className="text-2xl font-semibold mt-1">{fmt(Number(row.total))}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Fecha" value={fmtDate(row.fecha)} />
          <Field label="Moneda" value={row.moneda ?? "MXN"} />
          <Field label="Método" value={row.metodo_pago ?? "—"} />
          <Field label="Forma" value={row.forma_pago ?? "—"} />
          <Field label="Uso CFDI" value={row.uso_cfdi ?? "—"} />
          <Field label="Estatus SAT" value={row.estatus_sat ?? "—"} />
          <Field label="Emisor" value={`${row.rfc_emisor} · ${row.nombre_emisor ?? ""}`} full />
          <Field label="Receptor" value={`${row.rfc_receptor} · ${row.nombre_receptor ?? ""}`} full />
        </div>
        <div className="pt-2 flex justify-end gap-2">
          <Link to="/app/cfdi/$id" params={{ id: row.id }}>
            <Button><Sparkles className="h-4 w-4 mr-1" /> Ver detalle + IA</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function ExportButton({ rows, selectedIds }: { rows: CfdiRow[]; selectedIds: Set<string> }) {
  const exportRows = useMemo(
    () => (selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(r.id)) : rows),
    [rows, selectedIds]
  );
  const csv = useMemo(() => {
    if (!exportRows.length) return "";
    const headers = ["UUID","Tipo","Fecha","RFC Emisor","Nombre Emisor","RFC Receptor","Nombre Receptor","Subtotal","IVA Trasladado","IVA Retenido","Total","Método","Forma","Uso CFDI","Estatus","Moneda"];
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((r) => [
      r.uuid, r.tipo_cfdi, r.fecha, r.rfc_emisor, r.nombre_emisor, r.rfc_receptor, r.nombre_receptor,
      r.subtotal, r.iva_trasladado, r.iva_retenido, r.total, r.metodo_pago, r.forma_pago, r.uso_cfdi, r.estatus_sat, r.moneda,
    ].map(escape).join(","));
    return [headers.join(","), ...lines].join("\n");
  }, [rows]);

  const download = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cfdi-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Button variant="outline" disabled={!rows.length} onClick={download}>
      <ArrowDownToLine className="h-4 w-4 mr-1" /> Exportar CSV
    </Button>
  );
}

function UuidCell({ uuid }: { uuid: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(uuid).then(() => {
      setCopied(true);
      toast.success("UUID copiado");
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={copy}
            className="group inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground max-w-[160px]"
          >
            <span className="truncate">{uuid}</span>
            {copied ? <Check className="h-3 w-3 text-emerald-400 shrink-0" /> : <Copy className="h-3 w-3 opacity-60 group-hover:opacity-100 shrink-0" />}
          </button>
        </TooltipTrigger>
        <TooltipContent className="font-mono text-xs">{uuid}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

