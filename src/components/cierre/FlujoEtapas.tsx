// Panel de las seis etapas del flujo contable mensual. Vive dentro de
// /app/cierre (orquestador). Las rutas especializadas conservan sus vistas.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleDashed, Loader2, Lock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { declararEtapa, getFlujoMensual } from "@/lib/cierre/etapas.functions";
import { ETIQUETA_ESTADO, tonoEstado, type EstadoEtapa, type EtapaId } from "@/lib/cierre/flujo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CLASES_TONO: Record<ReturnType<typeof tonoEstado>, string> = {
  exito: "border-success/40 bg-success/5",
  advertencia: "border-warning/40 bg-warning/5",
  peligro: "border-destructive/40 bg-destructive/5",
  neutro: "border-border bg-card",
};

export function FlujoEtapas({ clienteId, periodo }: { clienteId: string; periodo: string }) {
  const qc = useQueryClient();
  const cargar = useServerFn(getFlujoMensual);
  const declarar = useServerFn(declararEtapa);
  const [noAplica, setNoAplica] = useState<{ etapa: EtapaId; nombre: string } | null>(null);
  const [motivo, setMotivo] = useState("");

  const key = ["flujo-mensual", clienteId, periodo];
  const q = useQuery({ queryKey: key, queryFn: () => cargar({ data: { cliente_id: clienteId, periodo } }) });

  const refrescar = () => qc.invalidateQueries({ queryKey: ["flujo-mensual", clienteId] });
  const onError = (e: unknown) => toast.error((e as Error)?.message ?? "No se pudo actualizar la etapa");

  const mDeclarar = useMutation({
    mutationFn: (v: { etapa: EtapaId; estado: "no_aplica" | "reabierta"; motivo: string }) =>
      declarar({ data: { cliente_id: clienteId, periodo, etapa: v.etapa, estado: v.estado, motivo: v.motivo } }),
    onSuccess: () => { toast.success("Etapa actualizada"); setNoAplica(null); setMotivo(""); refrescar(); },
    onError,
  });

  const etapas = q.data?.etapas ?? [];
  const progreso = useMemo(() => {
    const cerradas = etapas.filter((e: any) => ["lista", "aprobada", "no_aplica"].includes(e.estado)).length;
    return { cerradas, total: etapas.length || 6 };
  }, [etapas]);

  if (q.isLoading) {
    return <div className="flex items-center gap-3 text-muted-foreground p-6"><Loader2 className="h-4 w-4 animate-spin" /> Cargando el flujo del periodo…</div>;
  }
  if (q.error) {
    return <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm">{(q.error as Error).message}</div>;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-sm font-semibold">
          Flujo contable mensual · {progreso.cerradas} de {progreso.total} etapas resueltas
        </h2>
        {q.data?.siguiente && (
          <div className="text-xs text-muted-foreground">
            Siguiente acción recomendada:{" "}
            <Link to={q.data.siguiente.ruta} className="text-primary underline underline-offset-2">
              {q.data.siguiente.nombre}
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {etapas.map((e: any) => {
          const tono = tonoEstado(e.estado as EstadoEtapa);
          const Icono = e.estado === "aprobada" || e.estado === "lista" ? CheckCircle2
            : e.estado === "bloqueada" ? AlertTriangle
            : !e.habilitada ? Lock : CircleDashed;
          return (
            <div key={e.id} className={`rounded-xl border p-4 space-y-3 ${CLASES_TONO[tono]}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <Icono className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{e.orden}. {e.nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {ETIQUETA_ESTADO[e.estado as EstadoEtapa]}
                      {e.version > 1 ? ` · v${e.version}` : ""}
                      {e.madurez !== "operativa" ? ` · ${e.madurez === "beta" ? "beta" : "en construcción"}` : ""}
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {e.cobertura != null ? `${e.cobertura}%` : "sin cobertura"}
                </Badge>
              </div>

              {!e.habilitada && (
                <p className="text-xs text-muted-foreground">
                  Depende de: {e.dependenciasFaltantes.join(", ")}.
                </p>
              )}
              {e.motivo && <p className="text-xs"><span className="text-muted-foreground">Motivo: </span>{e.motivo}</p>}
              {e.criteriosPendientes.length > 0 ? (
                <ul className="text-xs text-warning space-y-1">
                  {e.criteriosPendientes.map((c) => <li key={c.codigo}>· Falta: {c.detalle}</li>)}
                </ul>
              ) : e.criteriosCumplidos.length > 0 ? (
                <ul className="text-xs text-muted-foreground space-y-1">
                  {e.criteriosCumplidos.map((c) => <li key={c.codigo}>· {c.detalle}</li>)}
                </ul>
              ) : (
                <ul className="text-xs text-muted-foreground space-y-1">
                  {e.criterios.slice(0, 3).map((c: string) => <li key={c}>· {c}</li>)}
                </ul>
              )}

              {e.limitaciones?.length > 0 && (
                <p className="text-[11px] text-muted-foreground italic">{e.limitaciones[0]}</p>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Button asChild size="sm" variant="glass">
                  <Link to={e.ruta}>Abrir módulo <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link>
                </Button>
                {["lista", "aprobada", "no_aplica"].includes(e.estado) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setNoAplica({ etapa: e.id, nombre: `Reabrir ${e.nombre}` }); setMotivo(""); }}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reabrir
                  </Button>
                ) : (
                  e.permiteNoAplica && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setNoAplica({ etapa: e.id, nombre: `No aplica · ${e.nombre}` }); setMotivo(""); }}
                    >
                      No aplica
                    </Button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!noAplica} onOpenChange={(o) => !o && setNoAplica(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{noAplica?.nombre}</DialogTitle>
            <DialogDescription>El motivo queda en la bitácora inmutable del periodo.</DialogDescription>
          </DialogHeader>
          <Textarea value={motivo} onChange={(ev) => setMotivo(ev.target.value)} rows={3} placeholder="Motivo (mínimo 10 caracteres)" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoAplica(null)}>Cancelar</Button>
            <Button
              variant="hero"
              disabled={motivo.trim().length < 10 || mDeclarar.isPending}
              onClick={() => noAplica && mDeclarar.mutate({
                etapa: noAplica.etapa,
                estado: noAplica.nombre.startsWith("Reabrir") ? "reabierta" : "no_aplica",
                motivo: motivo.trim(),
              })}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
