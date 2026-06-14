import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useActiveCliente } from "@/lib/active-cliente";
import { computeRiesgoSAT, type CriterioRiesgo } from "@/lib/riesgo/riesgo.functions";
import { ShieldAlert, ShieldCheck, ShieldQuestion, Sparkles } from "lucide-react";

export const Route = createFileRoute("/app/riesgo")({
  component: RiesgoPage,
});

const colorBySemaforo = (s: "verde" | "amarillo" | "rojo") =>
  s === "rojo"
    ? "text-red-400 border-red-500/40 bg-red-500/10"
    : s === "amarillo"
      ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
      : "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";

function RiesgoPage() {
  const { cliente } = useActiveCliente();
  const run = useServerFn(computeRiesgoSAT);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["riesgo-sat", cliente?.id],
    queryFn: () => run({ data: { cliente_id: cliente!.id } }),
    enabled: !!cliente?.id,
  });

  if (!cliente) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="rounded-xl border border-border/60 bg-card/40 p-10 text-center">
          <ShieldQuestion className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Selecciona un expediente para calcular el riesgo SAT.
          </p>
          <Link to="/app/clientes" className="inline-block mt-4 text-sm text-primary hover:underline">
            Ver expedientes →
          </Link>
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
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {(error as Error)?.message ?? "Error al calcular el riesgo."}
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
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="mt-2 text-xs underline hover:opacity-80 disabled:opacity-50"
              >
                {isFetching ? "Actualizando…" : "Recalcular"}
              </button>
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
