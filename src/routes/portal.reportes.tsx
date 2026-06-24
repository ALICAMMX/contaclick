import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPortalReportes } from "@/lib/portal/portal.functions";
import { BarChart3, Download } from "lucide-react";

export const Route = createFileRoute("/portal/reportes")({
  component: ReportesPage,
});

function ReportesPage() {
  const fn = useServerFn(getPortalReportes);
  const { data, isLoading } = useQuery({ queryKey: ["portal-reportes"], queryFn: () => fn() });

  if (isLoading) return <div className="text-muted-foreground">Cargando…</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground mt-1">Reportes que tu contador ha publicado para ti.</p>
      </header>

      {data.reportes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
          Aún no hay reportes publicados.
        </div>
      ) : (
        <div className="rounded-xl border border-border divide-y divide-border/40">
          {data.reportes.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium text-sm capitalize">{r.tipo.replace(/_/g, " ")}</div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("es-MX")}</div>
              </div>
              {r.archivo_path && (
                <a className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline" href={r.archivo_path} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" /> Descargar
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
