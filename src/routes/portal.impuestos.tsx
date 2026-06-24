import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPortalImpuestos } from "@/lib/portal/portal.functions";

export const Route = createFileRoute("/portal/impuestos")({
  component: ImpuestosPage,
});

function ImpuestosPage() {
  const fn = useServerFn(getPortalImpuestos);
  const { data, isLoading } = useQuery({ queryKey: ["portal-impuestos"], queryFn: () => fn() });

  if (isLoading) return <div className="text-muted-foreground">Cargando…</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Impuestos y obligaciones</h1>
        <p className="text-sm text-muted-foreground mt-1">Declaraciones y obligaciones fiscales registradas por tu contador.</p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Obligación</th>
              <th className="text-left px-3 py-2">Periodicidad</th>
              <th className="text-left px-3 py-2">Próximo vencimiento</th>
              <th className="text-left px-3 py-2">Estatus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {data.obligaciones.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">Sin obligaciones registradas.</td></tr>
            ) : data.obligaciones.map((o: any) => (
              <tr key={o.id}>
                <td className="px-3 py-2 font-medium">{o.clave}</td>
                <td className="px-3 py-2 text-xs">{o.periodicidad}</td>
                <td className="px-3 py-2 text-xs">{o.proximo_vencimiento ?? "—"}</td>
                <td className="px-3 py-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${
                    o.estatus === "presentada" ? "bg-emerald-500/15 text-emerald-500" :
                    o.estatus === "vencida" ? "bg-rose-500/15 text-rose-500" :
                    "bg-amber-500/15 text-amber-500"
                  }`}>{o.estatus}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
