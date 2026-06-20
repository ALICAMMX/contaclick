import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useActiveCliente } from "@/lib/active-cliente";
import { computeRiesgoSAT, type CriterioRiesgo } from "@/lib/riesgo/riesgo.functions";
import { ShieldAlert, ShieldCheck, ShieldQuestion, Sparkles, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportXlsx, buildFilename } from "@/lib/export/xlsx";

export const Route = createFileRoute("/app/riesgo")({
  component: RiesgoPage,
});

const colorBySemaforo = (s: "verde" | "amarillo" | "rojo") =>
  s === "rojo"
    ? "text-red-400 border-red-500/40 bg-red-500/10"
    : s === "amarillo"
      ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
      : "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function RiesgoPage() {
  const { cliente, clear } = useActiveCliente();
  const isDemo = !!cliente?.id && !UUID_RE.test(cliente.id);
  const run = useServerFn(computeRiesgoSAT);
  const { data: result, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["riesgo-sat", cliente?.id],
    queryFn: async () => {
      try {
        return await run({ data: { cliente_id: cliente!.id } });
      } catch (e) {
        // Token caducado: el middleware lanza un Response 401. Devolvemos notFound para no romper la UI.
        if (e instanceof Response) return { notFound: true as const };
        throw e;
      }
    },
    enabled: !!cliente?.id && !isDemo,
    retry: false,
  });
  const notFound = !!result && "notFound" in result && result.notFound === true;
  const data = !notFound && result && !("notFound" in result && result.notFound) ? result : undefined;

  useEffect(() => {
    if (notFound) clear();
  }, [notFound, clear]);

  if (!cliente) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-6 flex items-start gap-4">
          <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Selecciona un expediente para calcular el riesgo SAT</div>
            <p className="text-sm text-muted-foreground mt-1">
              El análisis de riesgo cruza los 12 criterios del Plan Maestro de Fiscalización con los datos reales del contribuyente. Elige un expediente desde la barra superior, o crea uno nuevo.
            </p>
            <div className="mt-3">
              <Button variant="hero" size="sm" asChild>
                <Link to="/app/clientes">Ir a expedientes</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isDemo) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 flex items-start gap-4">
          <ShieldQuestion className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Expediente demo sin datos reales</div>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-mono">{cliente.rfc}</span> es un expediente de demostración. Crea o selecciona un expediente real para calcular el riesgo SAT.
            </p>
            <div className="mt-3">
              <Button variant="hero" size="sm" asChild>
                <Link to="/app/clientes">Ver expedientes reales</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header />
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 animate-pulse text-primary" /> Calculando riesgo SAT 2026…
        </div>
      )}
      {isError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300 space-y-3">
          <div>{(error as Error)?.message ?? "Error al calcular el riesgo."}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => clear()}>
              Limpiar expediente
            </Button>
            <Button size="sm" variant="hero" asChild>
              <Link to="/app/clientes">Ir a expedientes</Link>
            </Button>
          </div>
        </div>
      )}
      {data && (
        <>
          <div className={`rounded-2xl border p-6 flex items-center justify-between ${colorBySemaforo(data.semaforo)}`}>
            <div>
              <div className="text-xs uppercase tracking-wide opacity-80">Score de Riesgo SAT</div>
              <div className="text-5xl font-bold mt-1">{data.score}<span className="text-2xl opacity-60">/100</span></div>
              <div className="text-sm mt-2 opacity-90">
                {data.semaforo === "rojo" && "Riesgo alto — atender criterios en rojo de inmediato."}
                {data.semaforo === "amarillo" && "Riesgo moderado — atender hallazgos antes del cierre."}
                {data.semaforo === "verde" && "Riesgo bajo — mantén la disciplina de cumplimiento."}
              </div>
            </div>
            <div className="text-right text-xs opacity-80">
              <div>{data.meta.cliente.razon_social}</div>
              <div className="font-mono">{data.meta.cliente.rfc}</div>
              <div className="mt-1">
                {data.meta.periodo.desde} → {data.meta.periodo.hasta}
              </div>
              <div className="mt-1">{data.meta.n_cfdi} CFDI · {data.meta.n_mov} movs</div>
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="text-xs underline hover:opacity-80 disabled:opacity-50"
                >
                  {isFetching ? "Actualizando…" : "Recalcular"}
                </button>
                <button
                  onClick={() => {
                    exportXlsx(buildFilename("riesgo-sat", data.meta.cliente.rfc), [
                      {
                        name: "Resumen",
                        rows: [
                          { Cliente: data.meta.cliente.razon_social, RFC: data.meta.cliente.rfc, Score: data.score, Semaforo: data.semaforo, "CFDI analizados": data.meta.n_cfdi, "Movimientos": data.meta.n_mov, Desde: data.meta.periodo.desde, Hasta: data.meta.periodo.hasta },
                        ],
                      },
                      {
                        name: "Criterios",
                        rows: data.criterios.map((c) => ({
                          "#": c.id, Criterio: c.nombre, Nivel: c.nivel, Puntos: c.puntos, Descripcion: c.descripcion, Hallazgos: c.hallazgos.join(" | "), Accion: c.accion,
                        })),
                      },
                    ]);
                  }}
                  className="text-xs inline-flex items-center gap-1 underline hover:opacity-80"
                >
                  <Download className="h-3 w-3" /> Excel
                </button>
              </div>
            </div>
          </div>



          <div className="grid md:grid-cols-2 gap-4">
            {data.criterios.map((c) => <CriterioCard key={c.id} c={c} />)}
          </div>
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" /> Riesgo SAT 2026
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Cruza los 12 criterios del Plan Maestro de Fiscalización 2026 con tus datos reales. Se actualiza con cada CFDI y movimiento que cargas.
        </p>
      </div>
    </div>
  );
}

function CriterioCard({ c }: { c: CriterioRiesgo }) {
  const Icon = c.nivel === "verde" ? ShieldCheck : ShieldAlert;
  return (
    <div className={`rounded-xl border p-4 ${colorBySemaforo(c.nivel)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4" />
          <span>#{c.id} · {c.nombre}</span>
        </div>
        <div className="text-xs font-mono opacity-80">{c.puntos}/100</div>
      </div>
      <p className="text-xs mt-2 opacity-80">{c.descripcion}</p>
      <ul className="mt-3 space-y-1 text-xs">
        {c.hallazgos.map((h, i) => <li key={i} className="opacity-90">• {h}</li>)}
      </ul>
      <div className="mt-3 text-xs border-t border-current/20 pt-2 opacity-90">
        <span className="font-semibold">Acción:</span> {c.accion}
      </div>
    </div>
  );
}
