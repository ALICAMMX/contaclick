import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Building2, Save, Loader2, BadgeCheck, Calendar, Users, ChevronRight, Sparkles, Trash2, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDespacho } from "@/lib/despacho/use-despacho";
import { updateDespacho, createDespacho } from "@/lib/despacho/despacho.functions";
import { seedDemo, clearDemo } from "@/lib/demo/demo.functions";
import { Tour, resetTour } from "@/components/Tour";

export const Route = createFileRoute("/app/configuracion")({
  component: ConfigPage,
});

function ConfigPage() {
  const { despacho, isLoading, refetch } = useDespacho();
  const qc = useQueryClient();
  const fnUpd = useServerFn(updateDespacho);
  const fnCreate = useServerFn(createDespacho);

  const [nombre, setNombre] = useState("");
  const [rfc, setRfc] = useState("");

  useEffect(() => {
    if (despacho) {
      setNombre(despacho.nombre ?? "");
      setRfc(despacho.rfc_despacho ?? "");
    }
  }, [despacho?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (despacho?.id) {
        return fnUpd({ data: { id: despacho.id, nombre, rfc_despacho: rfc || null } });
      }
      return fnCreate({ data: { nombre, rfc_despacho: rfc || null } });
    },
    onSuccess: () => {
      toast.success("Despacho guardado");
      qc.invalidateQueries({ queryKey: ["my-despacho"] });
      refetch();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>;
  }

  const trialEnd = despacho?.trial_ends_at ? new Date(despacho.trial_ends_at) : null;
  const trialDaysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000)) : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Configuración del despacho</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Información que aparecerá en tus reportes, mensajes y comunicaciones a clientes.
        </p>
      </div>

      {despacho && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/60 bg-card/50 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><BadgeCheck className="h-3.5 w-3.5" /> Estado</div>
            <div className="mt-1 font-semibold capitalize">{despacho.estado}</div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/50 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> Trial</div>
            <div className="mt-1 font-semibold">
              {trialDaysLeft !== null ? `${trialDaysLeft} días restantes` : "—"}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Datos del despacho</h2>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Nombre del despacho *</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Asesores Fiscales García y Asociados"
            className="w-full h-10 px-3 rounded-md bg-background border border-border text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">RFC del despacho</label>
          <input
            value={rfc}
            onChange={(e) => setRfc(e.target.value.toUpperCase())}
            placeholder="Opcional"
            maxLength={13}
            className="w-full h-10 px-3 rounded-md bg-background border border-border text-sm font-mono"
          />
        </div>

        <Button onClick={() => save.mutate()} disabled={!nombre || save.isPending} variant="glass">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </Button>
      </div>

      <Link
        to="/app/equipo"
        className="rounded-xl border border-border/60 bg-card/50 p-5 flex items-center justify-between hover:border-primary/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold">Equipo y miembros</div>
            <div className="text-xs text-muted-foreground">Invita colaboradores con un link</div>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </div>
  );
}
