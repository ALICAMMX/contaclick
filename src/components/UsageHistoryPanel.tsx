import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gauge } from "lucide-react";
import { getUsageHistory } from "@/lib/usage/usage.functions";

function fmt(n: number) {
  return n.toLocaleString("es-MX");
}

function periodoLabel(p: string) {
  const [y, m] = p.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
}

export function UsageHistoryPanel() {
  const fn = useServerFn(getUsageHistory);
  const q = useQuery({
    queryKey: ["usage", "history"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });
  const d = q.data;

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Plan y uso</h2>
      </div>
      {!d ? (
        <div className="text-xs text-muted-foreground">Cargando uso…</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md bg-muted/30 p-2.5">
              <div className="text-muted-foreground">Límite RFCs</div>
              <div className="font-semibold text-base">{fmt(d.plan.rfcs)}</div>
            </div>
            <div className="rounded-md bg-muted/30 p-2.5">
              <div className="text-muted-foreground">IA / mes</div>
              <div className="font-semibold text-base">{fmt(d.plan.ia_msgs)}</div>
            </div>
            <div className="rounded-md bg-muted/30 p-2.5">
              <div className="text-muted-foreground">Tokens / mes</div>
              <div className="font-semibold text-base">
                {d.plan.ia_tokens > 0 ? fmt(d.plan.ia_tokens) : "—"}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/50">
                  <th className="py-2 font-medium">Mes</th>
                  <th className="py-2 font-medium text-right">RFCs</th>
                  <th className="py-2 font-medium text-right">Solicitudes IA</th>
                  <th className="py-2 font-medium text-right">Tokens IA</th>
                </tr>
              </thead>
              <tbody>
                {d.historial.map((h) => (
                  <tr key={h.periodo} className="border-b border-border/30 last:border-b-0">
                    <td className="py-2 capitalize">{periodoLabel(h.periodo)}</td>
                    <td className="py-2 text-right">{fmt(h.rfc_activos)}</td>
                    <td className="py-2 text-right">{fmt(h.ia_requests)}</td>
                    <td className="py-2 text-right">{fmt(h.ia_tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Histórico de los últimos 6 meses. Se reinicia el día 1 de cada mes.
          </p>
        </>
      )}
    </div>
  );
}
