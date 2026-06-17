import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ScanSearch, AlertTriangle, CheckCircle2, FileDown, Loader2, Play, Download } from "lucide-react";
import jsPDF from "jspdf";
import { ToolShell } from "@/components/ToolShell";
import { Button } from "@/components/ui/button";
import { useActiveCliente } from "@/lib/active-cliente";
import { runExpressAudit, type AuditFinding } from "@/lib/auditor/auditor.functions";
import { exportXlsx, buildFilename } from "@/lib/export/xlsx";

export const Route = createFileRoute("/app/tools/express-auditor")({
  component: ExpressAuditor,
});

const TIPO_LABEL: Record<AuditFinding["tipo"], string> = {
  duplicado: "Folios duplicados",
  nc_huerfana: "Notas de crédito huérfanas",
  cancelado_declarado: "CFDI cancelados",
  ppd_sin_pago: "PPD sin complemento de pago",
  fuera_periodo: "Fuera del periodo declarado",
};

function ExpressAuditor() {
  const { cliente } = useActiveCliente();
  const [year, setYear] = useState(new Date().getFullYear());
  const [filter, setFilter] = useState<AuditFinding["tipo"] | "all">("all");
  const fn = useServerFn(runExpressAudit);

  const q = useQuery({
    enabled: !!cliente?.id,
    queryKey: ["audit", cliente?.id, year],
    queryFn: () => fn({ data: { cliente_id: cliente!.id, year } }),
  });

  const rerun = useMutation({ mutationFn: () => fn({ data: { cliente_id: cliente!.id, year } }), onSuccess: () => q.refetch() });

  if (!cliente) {
    return (
      <ToolShell
        title="Auditor express"
        description="Selecciona un expediente para auditar sus CFDIs."
        icon={<ScanSearch className="h-5 w-5 text-primary-foreground" />}
      >
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
          <div className="text-sm">Elige un cliente desde la barra superior para correr la auditoría.</div>
        </div>
      </ToolShell>
    );
  }

  const findings = q.data?.findings ?? [];
  const stats = q.data?.stats;
  const filtered = filter === "all" ? findings : findings.filter((f) => f.tipo === filter);

  function exportPdf() {
    if (!stats) return;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const W = doc.internal.pageSize.getWidth();
    let y = 50;

    // Header
    doc.setFillColor(20, 30, 80);
    doc.rect(0, 0, W, 70, "F");
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("ContaClick", 40, 35);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Reporte de auditoría express", 40, 55);

    y = 100;
    doc.setTextColor(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(cliente!.razon_social, 40, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`RFC: ${cliente!.rfc}`, 40, y);
    doc.text(`Año fiscal: ${year}`, 250, y);
    doc.text(`Generado: ${new Date().toLocaleString("es-MX")}`, 380, y);
    y += 24;

    // Resumen
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Resumen ejecutivo", 40, y);
    y += 6;
    doc.setDrawColor(200);
    doc.line(40, y, W - 40, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const rows: Array<[string, number]> = [
      [TIPO_LABEL.duplicado, stats.duplicados],
      [TIPO_LABEL.nc_huerfana, stats.nc_huerfanas],
      [TIPO_LABEL.cancelado_declarado, stats.cancelados_declarados],
      [TIPO_LABEL.ppd_sin_pago, stats.ppd_sin_pago],
      [TIPO_LABEL.fuera_periodo, stats.fuera_periodo],
    ];
    for (const [k, v] of rows) {
      doc.text(k, 50, y);
      doc.text(String(v), W - 60, y, { align: "right" });
      y += 16;
    }
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text(`Total CFDIs analizados: ${stats.total}`, 40, y);
    doc.text(`Hallazgos: ${findings.length}`, W - 40, y, { align: "right" });
    y += 24;

    // Detalle
    doc.setFontSize(12);
    doc.text("Detalle de hallazgos", 40, y);
    y += 6;
    doc.line(40, y, W - 40, y);
    y += 14;
    doc.setFontSize(9);

    for (const f of findings) {
      if (y > 720) {
        doc.addPage();
        y = 50;
      }
      doc.setFont("helvetica", "bold");
      doc.text(TIPO_LABEL[f.tipo], 40, y);
      doc.text(`$${f.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`, W - 40, y, { align: "right" });
      y += 12;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80);
      doc.text(`UUID: ${f.uuid}`, 40, y);
      y += 12;
      const desc = doc.splitTextToSize(f.descripcion + (f.fecha ? `  ·  ${f.fecha.slice(0, 10)}` : ""), W - 80);
      doc.text(desc, 40, y);
      y += desc.length * 11 + 8;
      doc.setTextColor(20);
      doc.setDrawColor(230);
      doc.line(40, y - 4, W - 40, y - 4);
    }

    if (!findings.length) {
      doc.setFont("helvetica", "italic");
      doc.setTextColor(80);
      doc.text("Sin hallazgos en este periodo.", 40, y);
    }

    doc.save(`auditoria-${cliente!.rfc}-${year}.pdf`);
  }

  return (
    <ToolShell
      title="Auditor express"
      description="5 validaciones automáticas sobre los CFDIs del expediente: duplicados, NC huérfanas, cancelados, PPD sin pago y fuera de periodo."
      icon={<ScanSearch className="h-5 w-5 text-primary-foreground" />}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Año fiscal</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
              className="mt-1 w-28 h-10 rounded-md bg-background border border-border px-3 text-sm"
            />
          </div>
          <Button variant="hero" onClick={() => rerun.mutate()} disabled={rerun.isPending || q.isLoading}>
            {rerun.isPending || q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Ejecutar auditoría
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="glass" onClick={exportPdf} disabled={!stats}>
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          <Button
            variant="glass"
            disabled={!stats}
            onClick={() => {
              if (!stats) return;
              exportXlsx(buildFilename(`auditoria-${year}`, cliente!.rfc), [
                {
                  name: "Resumen",
                  rows: [{ Cliente: cliente!.razon_social, RFC: cliente!.rfc, Año: year, "Total CFDI": stats.total, Duplicados: stats.duplicados, "NC huérfanas": stats.nc_huerfanas, Cancelados: stats.cancelados_declarados, "PPD sin pago": stats.ppd_sin_pago, "Fuera de periodo": stats.fuera_periodo }],
                },
                {
                  name: "Hallazgos",
                  rows: findings.map((f) => ({ Tipo: TIPO_LABEL[f.tipo], Severidad: f.severidad, UUID: f.uuid, Fecha: f.fecha?.slice(0, 10) ?? "", Monto: f.monto, Descripcion: f.descripcion })),
                },
              ]);
            }}
          >
            <Download className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      {/* Resumen ejecutivo */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2">
          <StatCard label="Duplicados" value={stats.duplicados} tipo="duplicado" filter={filter} setFilter={setFilter} tone="high" />
          <StatCard label="NC huérfanas" value={stats.nc_huerfanas} tipo="nc_huerfana" filter={filter} setFilter={setFilter} tone="high" />
          <StatCard label="Cancelados" value={stats.cancelados_declarados} tipo="cancelado_declarado" filter={filter} setFilter={setFilter} tone="med" />
          <StatCard label="PPD sin pago" value={stats.ppd_sin_pago} tipo="ppd_sin_pago" filter={filter} setFilter={setFilter} tone="high" />
          <StatCard label="Fuera de periodo" value={stats.fuera_periodo} tipo="fuera_periodo" filter={filter} setFilter={setFilter} tone="low" />
        </div>
      )}

      {stats && (
        <div className="text-xs text-muted-foreground flex items-center gap-3 mt-2">
          <span>{stats.total} CFDIs analizados · {findings.length} hallazgos</span>
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} className="text-primary underline">Mostrar todos</button>
          )}
        </div>
      )}

      {/* Tabla */}
      {filtered.length > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden mt-4">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Tipo</th>
                <th className="text-left px-4 py-2">UUID</th>
                <th className="text-left px-4 py-2">Fecha</th>
                <th className="text-right px-4 py-2">Monto</th>
                <th className="text-left px-4 py-2">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((f, i) => (
                <tr key={i}>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-1 rounded-md ${
                      f.severidad === "alta" ? "bg-destructive/15 text-destructive"
                      : f.severidad === "media" ? "bg-warning/15 text-warning"
                      : "bg-muted text-muted-foreground"
                    }`}>{TIPO_LABEL[f.tipo]}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{f.uuid.slice(0, 18)}…</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{f.fecha?.slice(0, 10) ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">${f.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2.5 text-xs">{f.descripcion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : stats && stats.total > 0 ? (
        <div className="rounded-xl border border-success/30 bg-success/5 p-5 flex items-center gap-3 mt-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="text-sm">Sin hallazgos en {stats.total} comprobantes del año {year}.</div>
        </div>
      ) : stats && stats.total === 0 ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-5 flex items-center gap-3 mt-4">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <div className="text-sm">No hay CFDIs cargados en el expediente. Usa el Lector masivo de XML primero.</div>
        </div>
      ) : null}
    </ToolShell>
  );
}

function StatCard({
  label, value, tipo, filter, setFilter, tone,
}: {
  label: string;
  value: number;
  tipo: AuditFinding["tipo"];
  filter: AuditFinding["tipo"] | "all";
  setFilter: (t: AuditFinding["tipo"] | "all") => void;
  tone: "high" | "med" | "low";
}) {
  const active = filter === tipo;
  const color = value === 0 ? "text-muted-foreground" : tone === "high" ? "text-destructive" : tone === "med" ? "text-warning" : "text-foreground";
  return (
    <button
      onClick={() => setFilter(active ? "all" : tipo)}
      className={`text-left rounded-xl p-4 border transition-all ${active ? "border-primary bg-primary/5" : "border-border/60 bg-card/50 hover:border-border"}`}
    >
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </button>
  );
}
