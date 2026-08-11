import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ShieldAlert, AlertTriangle, CheckCircle2, Loader2, Play, Download, HelpCircle } from "lucide-react";
import { ToolShell } from "@/components/ToolShell";
import { Button } from "@/components/ui/button";
import { useActiveCliente } from "@/lib/active-cliente";
import { runDeducibilityCheck, type DeducFinding } from "@/lib/defensa/deducibilidad.functions";
import { exportXlsx, buildFilename } from "@/lib/export/xlsx";
import { FindingExplain, LegalFooter } from "@/components/FindingExplain";
import { metaForDeduc, severidadToLevel } from "@/lib/legal/referencias";
import { PERIODO_RE, etiquetaPeriodoMes } from "@/lib/defensa/alcance";
import { ETIQUETA_ESTADO_ANALISIS } from "@/lib/cierre/evidencia";

type Busqueda = { periodo?: string; origen?: "cierre" };

export const Route = createFileRoute("/app/tools/deducibility-checker")({
  validateSearch: (search: Record<string, unknown>): Busqueda => {
    const periodo = typeof search.periodo === "string" && PERIODO_RE.test(search.periodo) ? search.periodo : undefined;
    return {
      ...(periodo ? { periodo } : {}),
      ...(search.origen === "cierre" ? { origen: "cierre" as const } : {}),
    };
  },
  component: DeducibilityChecker,
});

function DeducibilityChecker() {
  const { cliente } = useActiveCliente();
  const { periodo, origen } = Route.useSearch();
  const [year, setYear] = useState(new Date().getFullYear());
  const [filter, setFilter] = useState<"all" | "alta" | "media" | "baja">("all");
  const fn = useServerFn(runDeducibilityCheck);

  const mensual = Boolean(periodo);
  const payload = () =>
    mensual
      ? { cliente_id: cliente!.id, periodo: periodo!, origen: "cierre" as const }
      : { cliente_id: cliente!.id, year };

  const q = useQuery({
    enabled: !!cliente?.id,
    queryKey: ["deduc", cliente?.id, periodo ?? `year:${year}`],
    queryFn: () => fn({ data: payload() }),
  });

  const rerun = useMutation({
    mutationFn: () => fn({ data: payload() }),
    onSuccess: () => q.refetch(),
  });

  const findings = q.data?.findings ?? [];
  const noEvaluables = q.data?.no_evaluables ?? [];
  const stats = q.data?.stats;
  const estado = q.data?.estado ?? "no_analizado";
  const filtered = filter === "all" ? findings : findings.filter((f) => f.severidad === filter);
  const sinEvidencia = !!stats && stats.total_cfdi > 0 && stats.evaluables === 0;
  const alcanceEtiqueta = mensual
    ? `Cierre mensual · ${etiquetaPeriodoMes(periodo!)}`
    : `Ejercicio anual ${year}`;

  return (
    <ToolShell
      helpSlug="deducibility-checker"
      title="Validador de Deducibilidad"
      description="Cruza los CFDI recibidos contra las reglas del LISR (arts. 27 y 28) para detectar gastos no deducibles antes de que el SAT lo haga."
      icon={<ShieldAlert className="h-5 w-5 text-primary-foreground" />}
      {...(origen === "cierre"
        ? {
            backTo: "/app/cierre",
            backLabel: `Volver al cierre de ${periodo ? etiquetaPeriodoMes(periodo) : "el periodo"}`,
            ...(periodo ? { backSearch: { periodo } } : {}),
          }
        : {})}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          {mensual ? (
            <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
              <div className="text-muted-foreground">Alcance</div>
              <div className="font-medium mt-0.5">{alcanceEtiqueta}</div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted-foreground">Año fiscal</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || year)}
                className="mt-1 w-28 h-10 rounded-md bg-background border border-border px-3 text-sm"
              />
            </div>
          )}
          <Button
            variant="hero"
            onClick={() => rerun.mutate()}
            disabled={rerun.isPending || q.isLoading || sinEvidencia}
            title={sinEvidencia ? "No hay comprobantes con evidencia suficiente para analizar." : undefined}
          >
            {rerun.isPending || q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Analizar deducibilidad
          </Button>
        </div>
        <Button
          variant="glass"
          disabled={!stats || (findings.length === 0 && noEvaluables.length === 0)}
          onClick={() => {
            if (!cliente || !stats) return;
            exportXlsx(buildFilename(`deducibilidad-${periodo ?? year}`, cliente.rfc), [
              {
                name: "Resumen",
                rows: [{
                  Cliente: cliente.razon_social,
                  RFC: cliente.rfc,
                  Alcance: alcanceEtiqueta,
                  Estado: ETIQUETA_ESTADO_ANALISIS[estado],
                  "CFDI en alcance": stats.total_cfdi,
                  Evaluables: stats.evaluables,
                  "No evaluables": stats.no_evaluables,
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
              {
                name: "No evaluables",
                rows: noEvaluables.map((n) => ({
                  UUID: n.uuid,
                  Fecha: n.fecha?.slice(0, 10) ?? "",
                  Proveedor: n.nombre_emisor,
                  RFC: n.rfc_emisor,
                  Total: n.total,
                  "Estatus SAT": n.estatus_sat,
                  "XML original": n.xml_original_disponible ? "Disponible" : "No disponible",
                  Motivo: n.limitaciones.join(" "),
                })),
              },
            ]);
          }}
        >
          <Download className="h-4 w-4" /> Excel
        </Button>
      </div>

      {stats && (
        <div className="rounded-lg border border-border/60 bg-card/40 px-4 py-2.5 mt-3 text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">{ETIQUETA_ESTADO_ANALISIS[estado]}</span>
          <span className="text-muted-foreground">
            {alcanceEtiqueta} · {stats.total_cfdi} CFDI en alcance · {stats.evaluables} evaluables ·{" "}
            {stats.no_evaluables} no evaluables
          </span>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
          <StatCard label="CFDI en alcance" value={stats.total_cfdi} active={false} onClick={() => setFilter("all")} tone="muted" />
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

      {sinEvidencia && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-5 flex items-start gap-3 mt-4">
          <HelpCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium">No evaluable por evidencia insuficiente</div>
            <p className="text-muted-foreground mt-1">
              Ninguno de los {stats!.total_cfdi} comprobantes del alcance tiene estatus SAT confirmado y XML original
              disponible. No se emite conclusión de deducibilidad: la ausencia de hallazgos no significa que el gasto
              proceda.
            </p>
          </div>
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
                    <FindingExplain
                      level={severidadToLevel(f.severidad)}
                      meta={metaForDeduc(f.regla)}
                      legalText={f.fundamento}
                    />
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
          <div className="px-4 py-3 border-t border-border/40"><LegalFooter /></div>
        </div>
      ) : stats && stats.evaluables > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/50 p-5 flex items-start gap-3 mt-4">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div className="text-sm">
            {stats.hallazgos === 0 ? (
              <>
                <div className="font-medium">Analizado sin hallazgos detectados</div>
                <p className="text-muted-foreground mt-1">
                  Los {stats.evaluables} comprobantes evaluables no activaron ninguna regla de las verificadas. No es un
                  dictamen de deducibilidad.
                </p>
              </>
            ) : (
              "No hay hallazgos para el filtro seleccionado."
            )}
          </div>
        </div>
      ) : stats && stats.total_cfdi === 0 ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-5 flex items-center gap-3 mt-4">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <div className="text-sm">
            No hay comprobantes recibidos en {alcanceEtiqueta.toLowerCase()}. Carga o descarga los XML de este RFC primero.
          </div>
        </div>
      ) : null}

      {noEvaluables.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden mt-4">
          <div className="px-4 py-2.5 text-xs font-medium border-b border-border/40">
            Comprobantes no evaluables ({noEvaluables.length})
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/20 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Proveedor</th>
                <th className="text-left px-4 py-2">Fecha</th>
                <th className="text-right px-4 py-2">Monto</th>
                <th className="text-left px-4 py-2">Por qué no se evaluó</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {noEvaluables.map((n) => (
                <tr key={n.cfdi_id} className="align-top">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{n.nombre_emisor ?? "—"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{n.rfc_emisor}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{n.fecha?.slice(0, 10) ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">${n.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{n.limitaciones.join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
