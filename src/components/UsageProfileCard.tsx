import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Users, Sparkles, Cpu, ArrowUpRight, Gauge, CalendarClock, Download } from "lucide-react";
import { getUsageSummary } from "@/lib/usage/usage.functions";

function fmt(n: number) { return n.toLocaleString("es-MX"); }

function pctTone(pct: number) {
  if (pct >= 95) return { bar: "bg-destructive", ring: "ring-destructive/30", txt: "text-destructive", label: "Límite alcanzado" };
  if (pct >= 80) return { bar: "bg-warning", ring: "ring-warning/30", txt: "text-warning", label: "Cerca del límite" };
  if (pct >= 50) return { bar: "bg-primary", ring: "ring-primary/20", txt: "text-primary", label: "En uso" };
  return { bar: "bg-success", ring: "ring-success/20", txt: "text-success", label: "Disponible" };
}

function Tile({
  icon: Icon, label, usado, limite, unidad,
}: { icon: any; label: string; usado: number; limite: number; unidad: string }) {
  const ilimitado = limite < 0;
  const pct = ilimitado ? 0 : limite > 0 ? Math.min(100, (usado / limite) * 100) : 0;
  const restante = ilimitado ? Infinity : Math.max(0, limite - usado);
  const tone = ilimitado
    ? { bar: "bg-primary", ring: "ring-primary/20", txt: "text-primary", label: "Ilimitado" }
    : pctTone(pct);
  return (
    <div className={`relative rounded-xl border border-border/60 bg-card/60 p-5 ring-1 ${tone.ring} min-w-0`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        <span className={`text-[10px] uppercase tracking-wider font-medium shrink-0 ${tone.txt}`}>
          {tone.label}
        </span>
      </div>
      <div className="mt-4 flex items-baseline gap-1.5 flex-wrap">
        <span className="text-3xl font-semibold tabular-nums leading-none">
          {ilimitado ? "∞" : fmt(restante)}
        </span>
        <span className="text-xs text-muted-foreground">
          {ilimitado ? "sin límite" : "disponibles"}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
        {ilimitado
          ? `${fmt(usado)} ${unidad} usados este mes`
          : `${fmt(usado)} usados de ${fmt(limite)} ${unidad}`}
      </div>
      {!ilimitado && (
        <>
          <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden mt-3">
            <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <div className={`mt-1 text-[10px] tabular-nums ${tone.txt}`}>{Math.round(pct)}% utilizado</div>
        </>
      )}
    </div>
  );
}

export function UsageProfileCard() {
  const fn = useServerFn(getUsageSummary);
  const q = useQuery({
    queryKey: ["usage", "summary"],
    queryFn: () => fn(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const d = q.data;
  if (!d) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/50 p-5 text-xs text-muted-foreground">
        Cargando uso de tu plan…
      </div>
    );
  }

  const resetDate = new Date(d.reset_at);
  const resetLabel = resetDate.toLocaleDateString("es-MX", { day: "numeric", month: "long" });
  const hasTokens = d.plan.ia_tokens > 0;
  const hasSat = d.plan.sat_solicitudes_mes !== 0;
  const tilesCount = 2 + (hasTokens ? 1 : 0) + (hasSat ? 1 : 0);
  const gridCols =
    tilesCount >= 4 ? "sm:grid-cols-2 xl:grid-cols-4"
    : tilesCount === 3 ? "sm:grid-cols-2 xl:grid-cols-3"
    : "sm:grid-cols-2";

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-card/80 to-card/40 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary grid place-items-center">
            <Gauge className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Tu plan y consumo</h2>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <CalendarClock className="h-3 w-3" /> Se reinicia el {resetLabel}
            </p>
          </div>
        </div>
        <Link
          to="/precios"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
        >
          Mejorar plan <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div className={`grid gap-3 ${gridCols}`}>
        <Tile
          icon={Users}
          label="RFCs activos"
          usado={d.uso.rfc_activos}
          limite={d.plan.rfcs}
          unidad="RFCs"
        />
        <Tile
          icon={Sparkles}
          label="Solicitudes IA del mes"
          usado={d.uso.ia_requests}
          limite={d.plan.ia_msgs}
          unidad="solicitudes"
        />
        {hasTokens && (
          <Tile
            icon={Cpu}
            label="Tokens IA del mes"
            usado={d.uso.ia_tokens}
            limite={d.plan.ia_tokens}
            unidad="tokens"
          />
        )}
        {hasSat && (
          <Tile
            icon={Download}
            label="Descargas SAT del mes"
            usado={d.uso.sat_solicitudes}
            limite={d.plan.sat_solicitudes_mes}
            unidad="solicitudes"
          />
        )}
      </div>

      {hasSat && (
        <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Download className="h-3 w-3" /> Frecuencia máxima de sincronización SAT en tu plan
          </span>
          <span className="font-medium capitalize">{d.plan.sat_frecuencia_max}</span>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-3">
        Te avisaremos automáticamente al 80% y al 100% en tu campana de notificaciones.
        Los RFCs activos son los que cuentan contra tu plan — puedes archivar expedientes que ya no atiendes para liberar espacio.
        Las descargas SAT consumen saldo del PAC: si llegas al tope del mes la sincronización se pausa hasta el siguiente periodo o hasta que subas de plan.
      </p>
    </div>
  );
}

