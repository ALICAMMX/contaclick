import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPortalEstadoCuenta } from "@/lib/portal/portal.functions";

export const Route = createFileRoute("/portal/estado-cuenta")({
  component: EstadoCuentaPage,
});

const mxn = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

function EstadoCuentaPage() {
  const fn = useServerFn(getPortalEstadoCuenta);
  const { data, isLoading } = useQuery({ queryKey: ["portal-estado-cuenta"], queryFn: () => fn() });

  if (isLoading) return <div className="text-muted-foreground">Cargando…</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Estado de cuenta</h1>
        <p className="text-sm text-muted-foreground mt-1">Cuentas por cobrar y por pagar de tu expediente.</p>
      </header>

      {data.config.ver_cxc && (
        <Section title="Por cobrar (CXC)" rows={data.cxc} kind="cobrar" />
      )}
      {data.config.ver_cxp && (
        <Section title="Por pagar (CXP)" rows={data.cxp} kind="pagar" />
      )}
    </div>
  );
}

function Section({ title, rows, kind }: { title: string; rows: any[]; kind: "cobrar" | "pagar" }) {
  const total = rows.filter((r) => r.estado === "pendiente").reduce((a, r) => a + Number(r.monto || 0), 0);
  return (
    <section className="rounded-xl border border-border bg-card/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="text-sm">
          <span className="text-muted-foreground mr-2">Pendiente:</span>
          <strong className={kind === "cobrar" ? "text-emerald-500" : "text-rose-500"}>{mxn(total)}</strong>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Sin movimientos.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Contraparte</th>
                <th className="text-left px-3 py-2">Concepto</th>
                <th className="text-left px-3 py-2">Vencimiento</th>
                <th className="text-right px-3 py-2">Monto</th>
                <th className="text-left px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((r: any) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{r.contraparte}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs max-w-[280px] truncate">{r.concepto ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{r.fecha_vencimiento}</td>
                  <td className="px-3 py-2 text-right font-medium">{mxn(Number(r.monto))}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`px-2 py-0.5 rounded-full ${r.estado === "pendiente" ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500"}`}>
                      {r.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
