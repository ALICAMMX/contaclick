import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Globe, AlertTriangle, CheckCircle2, Loader2, Play, Download } from "lucide-react";
import { ToolShell } from "@/components/ToolShell";
import { Button } from "@/components/ui/button";
import { useActiveCliente } from "@/lib/active-cliente";
import { runImportPriceCheck } from "@/lib/defensa/precios-importacion.functions";
import { exportXlsx, buildFilename } from "@/lib/export/xlsx";
import { FindingExplain, LegalFooter } from "@/components/FindingExplain";
import { META_IMPORT_PRICE_OUTLIER, META_IMPORT_PRICE_DESC_GENERICA, severidadToLevel } from "@/lib/legal/referencias";

export const Route = createFileRoute("/app/tools/import-prices")({
  component: ImportPrices,
});

function ImportPrices() {
  const { cliente, hydrating } = useActiveCliente();
  const [year, setYear] = useState(new Date().getFullYear());
  const [umbral, setUmbral] = useState(0.5);
  const [filter, setFilter] = useState<"all" | "alta" | "media" | "baja">("all");
  const fn = useServerFn(runImportPriceCheck);

  const q = useQuery({
    enabled: !hydrating && !!cliente?.id,
    queryKey: ["import-prices", cliente?.id, year, umbral],
    queryFn: async () => {
      try {
        return await fn({ data: { cliente_id: cliente!.id, year, umbral_desviacion: umbral } });
      } catch (e) {
        if (e instanceof Response) return null;
        throw e;
      }
    },
  });

  const rerun = useMutation({
    mutationFn: () => fn({ data: { cliente_id: cliente!.id, year, umbral_desviacion: umbral } }),
    onSuccess: () => q.refetch(),
  });

  const findings = q.data?.findings ?? [];
  const stats = q.data?.stats;
  const filtered = filter === "all" ? findings : findings.filter((f) => f.severidad === filter);

  return (
    <ToolShell helpSlug="import-prices"
      title="Validador de Precios de Importación"
      description="Detecta valores unitarios anómalos en CFDI de proveedores extranjeros (RFC XEXX). Genera comparables internos y memo justificativo para LISR 76-A, 179 y valor en aduana."
      icon={<Globe className="h-5 w-5 text-primary-foreground" />}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground">Año fiscal</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
              className="mt-1 w-28 h-10 rounded-md bg-background border border-border px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Umbral desviación</label>
            <select
              value={umbral}
              onChange={(e) => setUmbral(Number(e.target.value))}
              className="mt-1 h-10 rounded-md bg-background border border-border px-3 text-sm"
            >
              <option value={0.3}>±30%</option>
              <option value={0.5}>±50%</option>
              <option value={0.75}>±75%</option>
              <option value={1}>±100%</option>
            </select>
          </div>
          <Button variant="hero" onClick={() => rerun.mutate()} disabled={rerun.isPending || q.isLoading}>
            {rerun.isPending || q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Analizar precios
          </Button>
        </div>
        <Button
          variant="glass"
          disabled={!stats || findings.length === 0}
          onClick={() => {
            if (!cliente || !stats) return;
            exportXlsx(buildFilename(`precios-importacion-${year}`, cliente.rfc), [
              {
                name: "Resumen",
                rows: [{
                  Cliente: cliente.razon_social,
                  RFC: cliente.rfc,
                  Año: year,
                  "CFDI importación": stats.cfdi_importacion,
                  "Conceptos": stats.conceptos_analizados,
                  "Claves únicas": stats.claves_unicas,
                  Hallazgos: stats.hallazgos,
                  "Monto importado": stats.monto_total,
                  "Monto en riesgo": stats.monto_riesgo,
                }],
              },
              {
                name: "Hallazgos",
                rows: findings.map((f) => ({
                  Severidad: f.severidad,
                  UUID: f.uuid,
                  Fecha: f.fecha?.slice(0, 10) ?? "",
                  Proveedor: f.nombre_emisor,
                  Clave: f.clave_prod_serv,
                  Descripción: f.descripcion,
                  Cantidad: f.cantidad,
                  "Valor unitario": f.valor_unitario,
                  "Mediana clave": f.mediana_clave,
                  "Desviación %": f.desviacion_pct.toFixed(1),
                  Motivo: f.motivo,
                  Fundamento: f.fundamento,
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
          <StatCard label="CFDI importación" value={stats.cfdi_importacion} active={false} onClick={() => setFilter("all")} tone="muted" />
          <StatCard label="Conceptos" value={stats.conceptos_analizados} active={false} onClick={() => setFilter("all")} tone="muted" />
          <StatCard label="Hallazgos" value={stats.hallazgos} active={filter !== "all"} onClick={() => setFilter(filter === "alta" ? "all" : "alta")} tone="high" />
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
                <th className="text-left px-4 py-2">Severidad / Clave</th>
                <th className="text-left px-4 py-2">Descripción</th>
                <th className="text-right px-4 py-2">VU</th>
                <th className="text-right px-4 py-2">Mediana</th>
                <th className="text-right px-4 py-2">Desv.</th>
                <th className="text-left px-4 py-2 hidden md:table-cell">Motivo / Fundamento</th>
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
                    }`}>{f.severidad}</span>
                    <div className="text-xs font-mono text-muted-foreground mt-1">{f.clave_prod_serv}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{f.descripcion}</div>
                    <div className="text-xs text-muted-foreground">{f.nombre_emisor ?? "—"} · {f.fecha?.slice(0, 10)}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">${f.valor_unitario.toLocaleString("es-MX", { maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">${f.mediana_clave.toLocaleString("es-MX", { maximumFractionDigits: 2 })}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${f.desviacion_pct > 0 ? "text-destructive" : f.desviacion_pct < 0 ? "text-warning" : "text-muted-foreground"}`}>
                    {f.desviacion_pct ? `${f.desviacion_pct > 0 ? "+" : ""}${f.desviacion_pct.toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                    <div>{f.motivo}</div>
                    <div className="opacity-70 mt-1">{f.fundamento}</div>
                    <FindingExplain
                      level={severidadToLevel(f.severidad)}
                      meta={f.desviacion_pct === 0 ? META_IMPORT_PRICE_DESC_GENERICA : META_IMPORT_PRICE_OUTLIER}
                      legalText={f.fundamento}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-border/40"><LegalFooter /></div>
        </div>
      ) : stats && stats.cfdi_importacion > 0 ? (
        <div className="rounded-xl border border-success/30 bg-success/5 p-5 flex items-center gap-3 mt-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="text-sm">
            {stats.hallazgos === 0
              ? `Sin hallazgos. Los ${stats.conceptos_analizados} conceptos en ${stats.cfdi_importacion} CFDI de importación están dentro del umbral.`
              : "No hay hallazgos para el filtro seleccionado."}
          </div>
        </div>
      ) : stats ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-5 flex items-center gap-3 mt-4">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <div className="text-sm">No hay CFDI de importación (proveedor extranjero RFC XEXX010101000) en {year}.</div>
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
