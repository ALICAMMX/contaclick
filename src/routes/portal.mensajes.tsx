import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPortalMensajes } from "@/lib/portal/portal.functions";
import { MessageSquare } from "lucide-react";

export const Route = createFileRoute("/portal/mensajes")({
  component: MensajesPage,
});

function MensajesPage() {
  const fn = useServerFn(getPortalMensajes);
  const { data, isLoading } = useQuery({ queryKey: ["portal-mensajes"], queryFn: () => fn() });

  if (isLoading) return <div className="text-muted-foreground">Cargando…</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Mensajes</h1>
        <p className="text-sm text-muted-foreground mt-1">Comunicación de tu contador.</p>
      </header>

      {data.mensajes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
          Sin mensajes por el momento.
        </div>
      ) : (
        <div className="space-y-3">
          {data.mensajes.map((m: any) => (
            <div key={m.id} className="rounded-xl border border-border bg-card/40 p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-semibold">{m.asunto ?? "(Sin asunto)"}</div>
                <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("es-MX")}</span>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{m.cuerpo ?? ""}</p>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-2">Canal: {m.canal}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
