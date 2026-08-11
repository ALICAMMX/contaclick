// Etapa 4 · Pólizas del periodo. Generación idempotente desde CFDI vigentes y
// aprobación/rechazo humano con motivo. La UI nunca escribe la partida: sólo
// invoca los RPC de negocio.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Check, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  aprobarPolizaCierre,
  generarBorradoresPeriodo,
  getPolizasPeriodo,
  rechazarPolizaCierre,
} from "@/lib/cierre/polizas.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

const moneda = (c: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format((c ?? 0) / 100);

export function PolizasPeriodo({ clienteId, periodo }: { clienteId: string; periodo: string }) {
  const qc = useQueryClient();
  const cargar = useServerFn(getPolizasPeriodo);
  const generar = useServerFn(generarBorradoresPeriodo);
  const aprobar = useServerFn(aprobarPolizaCierre);
  const rechazar = useServerFn(rechazarPolizaCierre);

  const [abierta, setAbierta] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["polizas-cierre", clienteId] });
    qc.invalidateQueries({ queryKey: ["flujo-mensual", clienteId] });
    qc.invalidateQueries({ queryKey: ["estado-cierre", clienteId] });
  };

  const q = useQuery({
    queryKey: ["polizas-cierre", clienteId, periodo],
    queryFn: () => cargar({ data: { cliente_id: clienteId, periodo } }),
  });

  const mGenerar = useMutation({
    mutationFn: () => generar({ data: { cliente_id: clienteId, periodo } }),
    onSuccess: (r: any) => {
      toast.success(`${r.generadas} pólizas generadas de ${r.revisados} comprobantes revisados`);
      invalidar();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "No se pudieron generar los borradores"),
  });

  const mDecidir = useMutation({
    mutationFn: ({ id, accion }: { id: string; accion: "aprobar" | "rechazar" }) =>
      (accion === "aprobar" ? aprobar : rechazar)({
        data: { cliente_id: clienteId, poliza_id: id, motivo },
      }),
    onSuccess: () => {
      toast.success("Decisión registrada en la bitácora del periodo");
      setAbierta(null);
      setMotivo("");
      invalidar();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "No se pudo registrar la decisión"),
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando pólizas del periodo…
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm">
        {(q.error as Error).message}
      </div>
    );
  }

  const polizas = (q.data?.polizas ?? []) as any[];
  const diag = q.data?.diagnostico as any;

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> 4. Pólizas contables
          </h2>
          <p className="text-xs text-muted-foreground">
            {diag?.cobertura != null
              ? `Cobertura ${Math.round(Number(diag.cobertura) * 100)}% · ${polizas.length} pólizas en el periodo`
              : `${polizas.length} pólizas en el periodo`}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => mGenerar.mutate()} disabled={mGenerar.isPending}>
          {mGenerar.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Generar borradores
        </Button>
      </div>

      {polizas.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aún no hay pólizas. Generar borradores no altera nada: es idempotente y sólo usa CFDI con evidencia SAT vigente.
        </p>
      ) : (
        <ul className="space-y-2">
          {polizas.map((p) => {
            const renglones = ((p.poliza_renglones ?? []) as any[])
              .slice()
              .sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
            const cargos = renglones.reduce((s, r) => s + (r.cargo_centavos ?? 0), 0);
            return (
              <li key={p.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">
                      {p.tipo} · {p.concepto}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {String(p.fecha).slice(0, 10)} · v{p.version} · {moneda(cargos)}
                    </div>
                  </div>
                  <Badge variant={p.estado === "aprobada" ? "default" : p.estado === "rechazada" ? "destructive" : "secondary"} className="text-[10px]">
                    {p.estado}
                  </Badge>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <tbody>
                      {renglones.map((r) => (
                        <tr key={r.id} className="border-t border-border/50">
                          <td className="py-1 pr-2 font-mono">{r.cuenta}</td>
                          <td className="py-1 pr-2 text-muted-foreground">{r.cuenta_nombre}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{r.cargo_centavos ? moneda(r.cargo_centavos) : ""}</td>
                          <td className="py-1 text-right tabular-nums">{r.abono_centavos ? moneda(r.abono_centavos) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {p.estado === "borrador" && (
                  abierta === p.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Motivo de la decisión (mínimo 10 caracteres). Queda en la bitácora del periodo."
                        rows={2}
                      />
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" disabled={motivo.trim().length < 10 || mDecidir.isPending}
                          onClick={() => mDecidir.mutate({ id: p.id, accion: "aprobar" })}>
                          <Check className="h-3.5 w-3.5 mr-1" /> Aprobar
                        </Button>
                        <Button size="sm" variant="destructive" disabled={motivo.trim().length < 10 || mDecidir.isPending}
                          onClick={() => mDecidir.mutate({ id: p.id, accion: "rechazar" })}>
                          <X className="h-3.5 w-3.5 mr-1" /> Rechazar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAbierta(null); setMotivo(""); }}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setAbierta(p.id); setMotivo(""); }}>
                      Revisar y decidir
                    </Button>
                  )
                )}
                {p.estado === "rechazada" && p.rechazo_motivo && (
                  <p className="text-[11px] text-muted-foreground">Motivo del rechazo: {p.rechazo_motivo}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
