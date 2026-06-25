import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Sparkles, Users, Gauge, ArrowUpRight, Download } from "lucide-react";
import { getUsageSummary } from "@/lib/usage/usage.functions";

function pctColor(pct: number) {
  if (pct >= 95) return { bar: "bg-destructive", txt: "text-destructive" };
  if (pct >= 70) return { bar: "bg-warning", txt: "text-warning" };
  return { bar: "bg-success", txt: "text-success" };
}

function fmt(n: number) { return n.toLocaleString("es-MX"); }

function Meter({
  icon: Icon, label, usado, limite, suffix,
}: { icon: any; label: string; usado: number; limite: number; suffix?: string }) {
  const pct = limite > 0 ? Math.min(100, (usado / limite) * 100) : 0;
  const c = pctColor(pct);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </span>
        <span className={`font-medium ${c.txt}`}>
          {fmt(usado)}<span className="text-muted-foreground"> / {fmt(limite)}{suffix ?? ""}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div className={`h-full ${c.bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function UsageMeters({ compact = false }: { compact?: boolean }) {
  const fn = useServerFn(getUsageSummary);
  const q = useQuery({
    queryKey: ["usage", "summary"],
    queryFn: () => fn(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const d = q.data;
  if (!d) return null;

  const resetDate = new Date(d.reset_at);
  const resetLabel = resetDate.toLocaleDateString("es-MX", { day: "numeric", month: "short" });

  return (
    <div className={`rounded-xl border border-border/60 bg-card/50 ${compact ? "p-4" : "p-5"} space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Uso de tu plan</h3>
        </div>
        <Link to="/precios" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          Mejorar plan <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-3">
        <Meter icon={Users} label="RFCs activos" usado={d.uso.rfc_activos} limite={d.plan.rfcs} />
        <Meter icon={Sparkles} label="Solicitudes IA / mes" usado={d.uso.ia_requests} limite={d.plan.ia_msgs} />
        {d.plan.ia_tokens > 0 && (
          <Meter icon={Sparkles} label="Tokens IA / mes" usado={d.uso.ia_tokens} limite={d.plan.ia_tokens} />
        )}
        {d.plan.sat_solicitudes_mes > 0 && (
          <Meter icon={Download} label="Descargas SAT / mes" usado={d.uso.sat_solicitudes} limite={d.plan.sat_solicitudes_mes} />
        )}
        {d.plan.sat_solicitudes_mes < 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground"><Download className="h-3.5 w-3.5" /> Descargas SAT</span>
            <span className="font-medium text-success">Ilimitadas</span>
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground pt-1">
        Se reinicia el {resetLabel}. Frecuencia SAT máx: <span className="font-medium">{d.plan.sat_frecuencia_max}</span>. Avisos al 80% y 100%.
      </p>

    </div>
  );
}
