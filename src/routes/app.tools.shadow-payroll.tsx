import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Users, AlertTriangle, CheckCircle2, Loader2, Play, Download } from "lucide-react";
import { ToolShell } from "@/components/ToolShell";
import { Button } from "@/components/ui/button";
import { useActiveCliente } from "@/lib/active-cliente";
import { runShadowPayrollCheck } from "@/lib/defensa/nomina-oculta.functions";
import { exportXlsx, buildFilename } from "@/lib/export/xlsx";
import { FindingExplain, LegalFooter } from "@/components/FindingExplain";
import { META_SHADOW_PAYROLL, severidadToLevel } from "@/lib/legal/referencias";

export const Route = createFileRoute("/app/tools/shadow-payroll")({
  component: ShadowPayroll,
});

function ShadowPayroll() {
  const { cliente } = useActiveCliente();
  const [year, setYear] = useState(new Date().getFullYear());
  const [montoMin, setMontoMin] = useState(3000);
  const fn = useServerFn(runShadowPayrollCheck);

  const q = useQuery({
    enabled: !!cliente?.id,
    queryKey: ["shadow", cliente?.id, year, montoMin],
    queryFn: () => fn({ data: { cliente_id: cliente!.id, year, monto_minimo: montoMin } }),
  });

  const rerun = useMutation({
    mutationFn: () => fn({ data: { cliente_id: cliente!.id, year, monto_minimo: montoMin } }),
    onSuccess: () => q.refetch(),
  });

  const findings = q.data?.findings ?? [];
  const stats = q.data?.stats;

  return (
    <ToolShell
      title="Detector de Nómina Oculta"
      description="Cruza movimientos bancarios contra CFDI de nómina y honorarios para detectar pagos recurrentes que el SAT puede reclasificar como salarios (LISR art. 94)."
      icon={<Users className="h-5 w-5 text-primary-foreground" />}
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
            <label className="text-xs text-muted-foreground">Monto mínimo</label>
            <input
              type="number"
              value={montoMin}
              onChange={(e) => setMontoMin(Number(e.target.value) || 0)}
              className="mt-1 w-32 h-10 rounded-md bg-background border border-border px-3 text-sm"
            />
          </div>
          <Button variant="hero" onClick={() => rerun.mutate()} disabled={rerun.isPending || q.isLoading}>
            {rerun.isPending || q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Detectar patrones
          </Button>
        </div>
        <Button
          variant="glass"
          disabled={!stats || findings.length === 0}
          onClick={() => {
            if (!cliente || !stats) return;
            exportXlsx(buildFilename(`nomina-oculta-${year}`, cliente.rfc), [
              {
                name: "Resumen",
                rows: [{
                  Cliente: cliente.razon_social,
                  RFC: cliente.rfc,
                  Año: year,
                  "Cargos analizados": stats.cargos_analizados,
                  "Patrones recurrentes": stats.patrones_recurrentes,
                  "Sospechosos (alta)": stats.sospechosos,
                  "Monto sin respaldo": stats.monto_sospechoso,
                  "Nómina CFDI total": stats.nomina_cfdi_total,
                  "Honorarios CFDI total": stats.honorarios_cfdi_total,
                }],
              },
              {
                name: "Patrones detectados",
                rows: findings.map((f) => ({
                  Severidad: f.severidad,
                  Beneficiario: f.beneficiario,
                  Ocurrencias: f.ocurrencias,
                  "Monto promedio": f.monto_promedio,
                  "Monto total": f.monto_total,
                  "Cubierto por CFDI": f.cubierto_por_cfdi,
                  "Diferencia sin respaldo": f.diferencia,
                  "Primer pago": f.primer_pago,
                  "Último pago": f.ultimo_pago,
                  Evidencia: f.evidencia,
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
          <Stat label="Cargos analizados" value={stats.cargos_analizados} />
          <Stat label="Patrones recurrentes" value={stats.patrones_recurrentes} tone={stats.patrones_recurrentes > 0 ? "med" : "muted"} />
          <Stat label="Sospechosos críticos" value={stats.sospechosos} tone={stats.sospechosos > 0 ? "high" : "muted"} />
          <Stat
            label="Monto sin respaldo"
            value={`$${stats.monto_sospechoso.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`}
            tone={stats.monto_sospechoso > 0 ? "high" : "muted"}
          />
        </div>
      )}

      {stats && (
        <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <span>Nómina CFDI {year}: <strong className="text-foreground">${stats.nomina_cfdi_total.toLocaleString("es-MX")}</strong></span>
          <span>Honorarios CFDI {year}: <strong className="text-foreground">${stats.honorarios_cfdi_total.toLocaleString("es-MX")}</strong></span>
        </div>
      )}

      {findings.length > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden mt-4">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Patrón / Beneficiario</th>
                <th className="text-right px-4 py-2">Veces</th>
                <th className="text-right px-4 py-2">Monto total</th>
                <th className="text-right px-4 py-2">Sin respaldo</th>
                <th className="text-left px-4 py-2">Evidencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {findings.map((f, i) => (
                <tr key={i} className="align-top">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-md ${
                        f.severidad === "alta" ? "bg-destructive/15 text-destructive"
                        : f.severidad === "media" ? "bg-warning/15 text-warning"
                        : "bg-muted text-muted-foreground"
                      }`}>{f.severidad}</span>
                      <span className="text-xs text-muted-foreground">{f.primer_pago.slice(5)} → {f.ultimo_pago.slice(5)}</span>
                    </div>
                    <div className="font-medium mt-1 text-xs">{f.beneficiario}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{f.ocurrencias}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">${f.monto_total.toLocaleString("es-MX", { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-destructive font-medium">${f.diferencia.toLocaleString("es-MX", { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-md">
                    <div>{f.evidencia}</div>
                    <FindingExplain level={severidadToLevel(f.severidad)} meta={META_SHADOW_PAYROLL} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-border/40"><LegalFooter /></div>
        </div>
      ) : stats && stats.cargos_analizados > 0 ? (
        <div className="rounded-xl border border-success/30 bg-success/5 p-5 flex items-center gap-3 mt-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="text-sm">Sin patrones sospechosos: los {stats.cargos_analizados} cargos están respaldados o no son recurrentes.</div>
        </div>
      ) : stats ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-5 flex items-center gap-3 mt-4">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <div className="text-sm">No hay movimientos bancarios cargados para {year}. Sube el estado de cuenta desde Conciliación primero.</div>
        </div>
      ) : null}
    </ToolShell>
  );
}

function Stat({ label, value, tone = "muted" }: { label: string; value: number | string; tone?: "high" | "med" | "muted" }) {
  const color = tone === "high" ? "text-destructive" : tone === "med" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-xl p-4 border border-border/60 bg-card/50">
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
