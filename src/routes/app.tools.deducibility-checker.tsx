import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ShieldAlert, AlertTriangle, CheckCircle2, Loader2, Play, Download } from "lucide-react";
import { ToolShell } from "@/components/ToolShell";
import { Button } from "@/components/ui/button";
import { useActiveCliente } from "@/lib/active-cliente";
import { runDeducibilityCheck, type DeducFinding } from "@/lib/defensa/deducibilidad.functions";
import { exportXlsx, buildFilename } from "@/lib/export/xlsx";

export const Route = createFileRoute("/app/tools/deducibility-checker")({
  component: DeducibilityChecker,
});

function DeducibilityChecker() {
  const { cliente } = useActiveCliente();
  const [year, setYear] = useState(new Date().getFullYear());
  const [filter, setFilter] = useState<"all" | "alta" | "media" | "baja">("all");
  const fn = useServerFn(runDeducibilityCheck);

  const q = useQuery({
    enabled: !!cliente?.id,
    queryKey: ["deduc", cliente?.id, year],
    queryFn: () => fn({ data: { cliente_id: cliente!.id, year } }),
  });

  const rerun = useMutation({
    mutationFn: () => fn({ data: { cliente_id: cliente!.id, year } }),
    onSuccess: () => q.refetch(),
  });

  const findings = q.data?.findings ?? [];
  const stats = q.data?.stats;
  const filtered = filter === "all" ? findings : findings.filter((f) => f.severidad === filter);

  return (
    <ToolShell
      title="Validador de Deducibilidad IA"
      description="Cruza tus CFDI recibidos contra las reglas del LISR (arts. 27, 28) para detectar gastos no deducibles antes de que el SAT lo haga."
      icon={<ShieldAlert className="h-5 w-5 text-primary-foreground" />}
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
            {rerun.isPending || q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Analizar deducibilidad
          </Button>
        </div>
        <Button
          variant="glass"
          disabled={!stats || findings.length === 0}
          onClick={() => {
            if (!cliente || !stats) return;
            exportXlsx(buildFilename(`deducibilidad-${year}`, cliente.rfc), [
              {
                name: "Resumen",
                rows: [{
                  Cliente: cliente.razon_social,
                  RFC: cliente.rfc,
                  Año: year,
                  "CFDI gastos": stats.total_cfdi,
                  Hallazgos: stats.hallazgos,
                  "No deducibles": stats.no_deducibles,
                  "Por revisar": stats.revisar,
                  "Monto en riesgo": stats.monto_riesgo,
                }],
              },
              {
                name: "Hallazgos",
                rows: findings.map((f) => ({
                  Severidad: f.severidad,
                  Regla: f.regla,
                  Fundamento: f.fundamento,
                  Detalle: f.detalle,
                  UUID: f.uuid,
                  Fecha: f.fecha?.slice(0, 10) ?? "",
                  Proveedor: f.nombre_emisor,
                  RFC: f.rfc_emisor,
                  Total: f.total,
                })),
              },
            ]);
          }}
        >
          <Download className="h-4 w-4" /> Excel
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
          <StatCard label="CFDI gastos" value={stats.total_cfdi} active={false} onClick={() => setFilter("all")} tone="muted" />
          <StatCard label="No deducibles" value={stats.no_deducibles} active={filter === "alta"} onClick={() => setFilter(filter === "alta" ? "all" : "alta")} tone="high" />
          <StatCard label="Por revisar" value={stats.revisar} active={filter === "media"} onClick={() => setFilter(filter === "media" ? "all" : "media")} tone="med" />
          <StatCard
            label="Monto en riesgo"
            value={`$${stats.monto_riesgo.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`}
            active={false}
            onClick={() => {}}
            tone="high"
          />
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden mt-4">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Regla</th>
                <th className="text-left px-4 py-2">Proveedor</th>
                <th className="text-left px-4 py-2">Fecha</th>
                <th className="text-right px-4 py-2">Monto</th>
                <th className="text-left px-4 py-2 hidden md:table-cell">Fundamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((f, i) => (
                <tr key={i} className="align-top">
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-1 rounded-md ${
                      f.severidad === "alta" ? "bg-destructive/15 text-destructive"
                      : f.severidad === "media" ? "bg-warning/15 text-warning"
                      : "bg-muted text-muted-foreground"
                    }`}>{f.regla}</span>
                    <div className="text-xs text-muted-foreground mt-1">{f.detalle}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{f.nombre_emisor ?? "—"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{f.rfc_emisor}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{f.fecha?.slice(0, 10) ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">${f.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{f.fundamento}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : stats && stats.total_cfdi > 0 ? (
        <div className="rounded-xl border border-success/30 bg-success/5 p-5 flex items-center gap-3 mt-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="text-sm">
            {stats.hallazgos === 0
              ? `Sin hallazgos. Los ${stats.total_cfdi} CFDI de gastos cumplen las reglas básicas de deducibilidad.`
              : "No hay hallazgos para el filtro seleccionado."}
          </div>
        </div>
      ) : stats ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-5 flex items-center gap-3 mt-4">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <div className="text-sm">No hay CFDI de gastos cargados en {year}. Sube XMLs para este RFC primero.</div>
        </div>
      ) : null}
    </ToolShell>
  );
}

function StatCard({ label, value, active, onClick, tone }: {
  label: string;
  value: number | string;
  active: boolean;
  onClick: () => void;
  tone: "high" | "med" | "muted";
}) {
  const color = tone === "high" ? "text-destructive" : tone === "med" ? "text-warning" : "text-foreground";
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl p-4 border transition-all ${active ? "border-primary bg-primary/5" : "border-border/60 bg-card/50 hover:border-border"}`}
    >
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </button>
  );
}

export type { DeducFinding };
