import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useActiveCliente } from "@/lib/active-cliente";
import { computeSaludFiscal, analizarSaludConIA, crearTareaDesdeSalud, type SaludFiscal, type SaludRecomendacion } from "@/lib/salud/salud.functions";
import { TEXTO_SIN_DATOS } from "@/lib/salud/cobertura";
import { descargarReporteSalud } from "@/lib/salud/reporte";
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Brain, CheckCircle2, Download, FileSearch, Info, Plus, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { HerramientaHelp } from "@/components/HerramientaHelp";

export const Route = createFileRoute("/app/salud-fiscal")({
  component: SaludFiscalPage,
  head: () => ({ meta: [{ title: "Salud Fiscal · ContaClick IA" }] }),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function SaludFiscalPage() {
  const { cliente } = useActiveCliente();
  const isDemo = !!cliente?.id && !UUID_RE.test(cliente.id);
  const compute = useServerFn(computeSaludFiscal);
  const analyze = useServerFn(analizarSaludConIA);
  const crearTarea = useServerFn(crearTareaDesdeSalud);
  const qc = useQueryClient();
  const [aiResumen, setAiResumen] = useState<string>("");
  const [aiHallazgos, setAiHallazgos] = useState<SaludFiscal["hallazgos"]>([]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["salud-fiscal", cliente?.id],
    queryFn: async () => {
      const r = await compute({ data: { cliente_id: cliente!.id } });
      if ("notFound" in r && r.notFound) return null;
      return r as SaludFiscal;
    },
    enabled: !!cliente?.id && !isDemo,
    retry: false,
  });

  const aiMut = useMutation({
    mutationFn: () => analyze({ data: { cliente_id: cliente!.id } }),
    onSuccess: (res) => {
      if (res.error) toast.error(res.error);
      else {
        setAiResumen(res.resumen);
        setAiHallazgos(res.hallazgos);
        toast.success("Análisis IA completado");
      }
    },
  });

  if (!cliente) {
    return (
      <EmptyState title="Selecciona un expediente">
        Elige un cliente desde la barra superior para ver su radiografía fiscal completa.
        <div className="mt-4"><Button asChild variant="hero" size="sm"><Link to="/app/clientes">Ver expedientes</Link></Button></div>
      </EmptyState>
    );
  }
  if (isDemo) {
    return (
      <EmptyState title="Expediente demo">
        <span className="font-mono">{cliente.rfc}</span> es de demostración. Crea un expediente real para calcular su salud fiscal.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Dashboard de Salud Fiscal
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Radiografía integral del cliente: cumplimiento, riesgo SAT, CFDI, bancos, laboral y documental — en un solo score.
          </p>
        </div>
        <div className="flex gap-2">
          <HerramientaHelp slug="salud-fiscal" />
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Recalcular
          </Button>
          <Button size="sm" variant="outline" onClick={() => aiMut.mutate()} disabled={aiMut.isPending || !data || data.score === null}
            title={data && data.score === null ? "Sin cobertura mínima de información no se ejecuta el análisis IA." : undefined}>
            <Brain className="h-4 w-4 mr-1" /> {aiMut.isPending ? "Analizando…" : "Analizar con IA"}
          </Button>
          <Button size="sm" variant="hero" onClick={() => data && descargarReporteSalud(data)} disabled={!data || data.score === null}
            title={data && data.score === null ? "No se emite reporte ejecutivo sin información suficiente." : undefined}>
            <Download className="h-4 w-4 mr-1" /> Reporte ejecutivo
          </Button>
        </div>
      </header>

      {isLoading && <div className="text-sm text-muted-foreground flex items-center gap-2"><Sparkles className="h-4 w-4 animate-pulse text-primary" /> Calculando salud fiscal…</div>}
      {isError && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">{(error as Error)?.message}</div>}

      {data && (
        <>
          <ScoreHero salud={data} />
          {data.score === null && <SinDatosPanel salud={data} />}



          <section>
            <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Subscores por área</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.subscores.map((s) => <SubScoreCard key={s.key} s={s} />)}
            </div>
          </section>

          <div className="grid lg:grid-cols-3 gap-4">
            <section className="lg:col-span-2 space-y-3">
              <h2 className="text-sm uppercase tracking-wide text-muted-foreground">Comparativo mensual</h2>
              <ComparativoTabla c={data.comparativo} />
              <h2 className="text-sm uppercase tracking-wide text-muted-foreground pt-2">Evolución últimos 12 meses</h2>
              <TendenciaChart valores={data.tendencia} />
            </section>
            <section className="space-y-3">
              <h2 className="text-sm uppercase tracking-wide text-muted-foreground">Alertas inteligentes</h2>
              <div className="space-y-2">
                {data.alertas.length === 0 && (
                  <div className="text-xs text-muted-foreground italic">
                    {data.cobertura.suficiente
                      ? "No se detectaron alertas con la información evaluada."
                      : "No evaluable: no hay información suficiente cargada para emitir alertas."}
                  </div>
                )}

                {data.alertas.map((a, i) => <AlertaItem key={i} a={a} />)}
              </div>
            </section>
          </div>

          <section>
            <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
              <FileSearch className="h-4 w-4" /> Hallazgos
              {aiResumen && <span className="text-xs text-primary normal-case">· IA: {aiResumen.slice(0, 80)}…</span>}
            </h2>
            <div className="grid md:grid-cols-2 gap-3">
              {[...data.hallazgos, ...aiHallazgos].map((h, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                    <span className={
                      h.tipo === "oportunidad" ? "text-emerald-400" :
                      h.tipo === "inconsistencia" ? "text-amber-400" : "text-primary"
                    }>{h.tipo}</span>
                  </div>
                  <div className="font-medium mt-1">{h.titulo}</div>
                  <p className="text-sm text-muted-foreground mt-1">{h.detalle}</p>
                </div>
              ))}
              {data.hallazgos.length === 0 && aiHallazgos.length === 0 && (
                <div className="text-sm text-muted-foreground italic">
                  {data.cobertura.suficiente
                    ? "No se detectaron hallazgos con la información evaluada."
                    : "No evaluable: falta información del expediente para buscar hallazgos."}
                </div>
              )}

            </div>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Recomendaciones accionables</h2>
            <div className="space-y-2">
              {data.recomendaciones.map((r, i) => (
                <RecomendacionRow key={i} r={r} onCrearTarea={async () => {
                  try {
                    await crearTarea({ data: { cliente_id: cliente.id, titulo: r.titulo, descripcion: r.detalle, prioridad: "alta" } });
                    toast.success("Tarea creada en el Centro de Tareas");
                    qc.invalidateQueries({ queryKey: ["tareas"] });
                  } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
                }} />
              ))}
              {data.recomendaciones.length === 0 && (
                <div className="text-sm text-muted-foreground italic">
                  {data.cobertura.suficiente
                    ? "No hay acciones pendientes."
                    : "Falta información para evaluar el expediente. Carga los datos listados en “Información faltante” para obtener cobertura."}
                </div>
              )}

            </div>
          </section>
        </>
      )}
    </div>
  );
}

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Activity className="h-6 w-6 text-primary" /> Salud Fiscal</h1>
      <div className="rounded-xl border border-warning/40 bg-warning/5 p-6">
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground mt-2">{children}</div>
      </div>
    </div>
  );
}

const semBg: Record<string, string> = {
  verde: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/40 text-emerald-300",
  amarillo: "from-amber-500/20 to-amber-500/5 border-amber-500/40 text-amber-300",
  naranja: "from-orange-500/20 to-orange-500/5 border-orange-500/40 text-orange-300",
  rojo: "from-red-500/20 to-red-500/5 border-red-500/40 text-red-300",
  sin_datos: "from-muted/40 to-transparent border-border text-muted-foreground",
};
const semLabel: Record<string, string> = {
  verde: "Salud excelente", amarillo: "Salud estable", naranja: "Riesgo moderado", rojo: "Riesgo alto",
  sin_datos: TEXTO_SIN_DATOS,
};

function ScoreHero({ salud }: { salud: SaludFiscal }) {
  const pct = salud.score;
  const dash = ((pct ?? 0) / 100) * 251.2;
  const color = salud.semaforo === "verde" ? "#22c55e" : salud.semaforo === "amarillo" ? "#eab308" : salud.semaforo === "naranja" ? "#f97316" : salud.semaforo === "rojo" ? "#ef4444" : "hsl(var(--muted-foreground))";
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-6 ${semBg[salud.semaforo]}`}>
      <div className="flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-6">
          <div className="relative w-32 h-32 shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="10" />
              {pct !== null && (
                <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${dash} 251.2`} />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-3xl font-bold">{pct ?? "—"}</div>
              <div className="text-[10px] uppercase opacity-70">{pct === null ? "sin score" : "de 100"}</div>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide opacity-80">Score de Salud Fiscal</div>
            <div className="text-2xl font-semibold mt-1">{semLabel[salud.semaforo]}</div>
            {salud.variacion_mes === null ? (
              <div className="text-sm mt-2 opacity-80">Sin comparativo con el mes anterior</div>
            ) : (
              <div className="text-sm mt-2 flex items-center gap-1">
                {salud.variacion_mes >= 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-400" /> : <ArrowDownRight className="h-4 w-4 text-red-400" />}
                <span>{salud.variacion_mes >= 0 ? "+" : ""}{salud.variacion_mes} pts vs mes anterior</span>
              </div>
            )}
            <div className="text-xs opacity-70 mt-1">
              Cobertura del modelo: {salud.cobertura.porcentaje}% ({salud.cobertura.dimensionesEvaluadas} de {salud.cobertura.dimensionesAplicables} áreas evaluadas · mínimo {salud.cobertura.minimo}%)
            </div>
          </div>
        </div>
        <div className="text-right text-xs opacity-80">
          <div>{salud.cliente.razon_social}</div>
          <div className="font-mono">{salud.cliente.rfc}</div>
          <div className="mt-1">Periodo {salud.periodo}</div>
        </div>
      </div>
    </div>
  );
}

/** Explica por qué no hay score y enlaza a las herramientas que lo desbloquean. */
function SinDatosPanel({ salud }: { salud: SaludFiscal }) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-6">
      <div className="flex items-start gap-3">
        <Info className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
        <div className="space-y-3 flex-1">
          <div>
            <div className="font-medium text-base">{TEXTO_SIN_DATOS}</div>
            <p className="text-sm text-muted-foreground mt-1">{salud.cobertura.mensaje}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Un score alto exige evidencia. La ausencia de información nunca se interpreta como cumplimiento:
              por eso este expediente no recibe calificación todavía.
            </p>
          </div>
          {salud.cobertura.faltantes.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Información faltante</div>
              <ul className="space-y-2">
                {salud.cobertura.faltantes.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
                    <span className="text-sm">{f.que}</span>
                    <Button size="sm" variant="outline" asChild><Link to={f.ruta}>{f.cta}</Link></Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SubScoreCard({ s }: { s: SaludFiscal["subscores"][number] }) {
  if (s.score === null) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">{s.label}</div>
          <div className="text-xs text-muted-foreground">peso {s.peso}%</div>
        </div>
        <div className="text-lg font-semibold mt-2 text-muted-foreground">No evaluable</div>
        <div className="h-1.5 bg-muted/40 rounded mt-3" />
        <p className="text-xs text-muted-foreground mt-3">Sin información suficiente para evaluar esta área. No suma ni resta puntos.</p>
        {s.faltante && (
          <Button size="sm" variant="outline" className="mt-3 h-7 text-xs" asChild>
            <Link to={s.faltante.ruta}>{s.faltante.cta}</Link>
          </Button>
        )}
      </div>
    );
  }
  const color = s.score >= 85 ? "text-emerald-400" : s.score >= 70 ? "text-amber-400" : s.score >= 50 ? "text-orange-400" : "text-red-400";
  const bar = s.score >= 85 ? "bg-emerald-500" : s.score >= 70 ? "bg-amber-500" : s.score >= 50 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{s.label}</div>
        <div className="text-xs text-muted-foreground">peso {s.peso}%</div>
      </div>
      <div className={`text-3xl font-bold mt-2 ${color}`}>{s.score}<span className="text-base opacity-50">/100</span></div>
      <div className="h-1.5 bg-muted/40 rounded mt-3 overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${s.score}%` }} />
      </div>
      <ul className="text-xs text-muted-foreground mt-3 space-y-0.5">
        {s.detalles.map((d, i) => <li key={i}>· {d}</li>)}
      </ul>
    </div>
  );
}


function ComparativoTabla({ c }: { c: SaludFiscal["comparativo"] }) {
  const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
  const rows: [string, number, number, string?][] = [
    ["Ingresos", c.ingresos.actual, c.ingresos.anterior],
    ["Egresos", c.egresos.actual, c.egresos.anterior],
    ["Utilidad", c.utilidad.actual, c.utilidad.anterior],
    ["ISR estimado", c.isr_estimado.actual, c.isr_estimado.anterior],
    ["IVA trasladado", c.iva_trasladado.actual, c.iva_trasladado.anterior],
    ["IVA acreditable", c.iva_acreditable.actual, c.iva_acreditable.anterior],
  ];
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
          <tr><th className="text-left p-2.5">Concepto</th><th className="text-right p-2.5">Actual</th><th className="text-right p-2.5">Anterior</th><th className="text-right p-2.5">Δ</th></tr>
        </thead>
        <tbody>
          {rows.map(([label, a, b]) => {
            const diff = a - b;
            return (
              <tr key={label} className="border-t border-border">
                <td className="p-2.5">{label}</td>
                <td className="p-2.5 text-right font-mono">{fmt(a)}</td>
                <td className="p-2.5 text-right font-mono text-muted-foreground">{fmt(b)}</td>
                <td className={`p-2.5 text-right font-mono ${diff >= 0 ? "text-emerald-400" : "text-red-400"}`}>{diff >= 0 ? "+" : ""}{fmt(diff)}</td>
              </tr>
            );
          })}
          <tr className="border-t border-border bg-muted/10">
            <td className="p-2.5 font-medium">Margen operativo</td>
            <td className="p-2.5 text-right font-mono">{c.margen_pct.actual.toFixed(1)}%</td>
            <td className="p-2.5 text-right font-mono text-muted-foreground">{c.margen_pct.anterior.toFixed(1)}%</td>
            <td className={`p-2.5 text-right font-mono ${c.margen_pct.actual - c.margen_pct.anterior >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {(c.margen_pct.actual - c.margen_pct.anterior).toFixed(1)} pp
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function TendenciaChart({ valores }: { valores: (number | null)[] }) {
  const max = 100;
  const w = 600, h = 120, pad = 10;
  const step = (w - pad * 2) / Math.max(1, valores.length - 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  // Los meses sin score publicable se omiten: dibujar un 0 fingiría un desplome.
  const puntos = valores
    .map((v, i) => (v === null ? null : { x: pad + i * step, y: y(v) }))
    .filter((p): p is { x: number; y: number } => p !== null);
  const points = puntos.map((p) => `${p.x},${p.y}`);

  if (puntos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
        Aún no hay meses con score publicable. La serie histórica comienza cuando el expediente alcanza la cobertura mínima de información.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
        <defs>
          <linearGradient id="grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline fill="url(#grad)" stroke="none"
          points={`${puntos[0].x},${h - pad} ${points.join(" ")} ${puntos[puntos.length - 1].x},${h - pad}`} />
        <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="2" points={points.join(" ")} />
        {puntos.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="hsl(var(--primary))" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-2">
        <span>hace 12m</span>
        <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Score ({puntos.length}/12 meses con datos)</span>
        <span>actual</span>
      </div>
    </div>
  );
}


function AlertaItem({ a }: { a: SaludFiscal["alertas"][number] }) {
  const color = a.nivel === "critica" || a.nivel === "alta" ? "border-red-500/40 bg-red-500/5 text-red-300" :
    a.nivel === "media" ? "border-amber-500/40 bg-amber-500/5 text-amber-300" : "border-border bg-card";
  return (
    <div className={`rounded-lg border p-3 ${color}`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-medium">{a.titulo}</div>
          {a.detalle && <div className="text-xs opacity-80 mt-0.5">{a.detalle}</div>}
          {a.origen && <div className="text-[10px] uppercase opacity-60 mt-1">{a.origen}</div>}
        </div>
      </div>
    </div>
  );
}

function RecomendacionRow({ r, onCrearTarea }: { r: SaludRecomendacion; onCrearTarea: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 flex-1">
        <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div>
          <div className="font-medium">{r.titulo}</div>
          <div className="text-sm text-muted-foreground mt-0.5">{r.detalle}</div>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        {r.accion === "crear_tarea" || r.accion === "revisar_operacion" ? (
          <Button size="sm" variant="outline" onClick={onCrearTarea}><Plus className="h-3 w-3 mr-1" /> Crear tarea</Button>
        ) : null}
        {r.accion === "solicitar_documentos" && (
          <Button size="sm" variant="outline" asChild><Link to="/app/mensajes">Solicitar docs</Link></Button>
        )}
        {r.accion === "generar_estrategia" && (
          <Button size="sm" variant="outline" asChild><Link to="/app/legal/redactor">Generar estrategia</Link></Button>
        )}
      </div>
    </div>
  );
}
