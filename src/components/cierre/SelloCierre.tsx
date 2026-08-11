// Etapa 6: sellado inmutable del periodo. No envía nada al SAT; deja constancia
// verificable de con qué evidencia se cerró el mes.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { getEstadoCierre, sellarCierre } from "@/lib/cierre/snapshot.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const moneda = (centavos: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format((centavos || 0) / 100);

export function SelloCierre({ clienteId, periodo }: { clienteId: string; periodo: string }) {
  const qc = useQueryClient();
  const cargar = useServerFn(getEstadoCierre);
  const sellar = useServerFn(sellarCierre);
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");

  const q = useQuery({
    queryKey: ["estado-cierre", clienteId, periodo],
    queryFn: () => cargar({ data: { cliente_id: clienteId, periodo } }),
  });

  const mSellar = useMutation({
    mutationFn: () => sellar({ data: { cliente_id: clienteId, periodo, motivo } }),
    onSuccess: () => {
      toast.success("Periodo sellado");
      setAbierto(false);
      setMotivo("");
      qc.invalidateQueries({ queryKey: ["estado-cierre", clienteId] });
      qc.invalidateQueries({ queryKey: ["flujo-mensual", clienteId] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "No se pudo sellar el periodo"),
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Evaluando criterios de terminación…
      </div>
    );
  }
  if (q.error) {
    return <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm">{(q.error as Error).message}</div>;
  }

  const d = q.data!;
  const vigente = d.sello_vigente;
  const obsoleto = d.sello_obsoleto;
  const sellado = !!vigente;

  return (
    <section className={`rounded-xl border p-5 space-y-4 ${sellado ? "border-success/40 bg-success/5" : "border-border bg-card"}`}>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          {sellado ? <ShieldCheck className="h-5 w-5 text-success mt-0.5" /> : <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />}
          <div>
            <h2 className="font-medium">
              {sellado ? "Periodo sellado" : obsoleto ? "Sello desactualizado" : "Revisión y cierre del periodo"}
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mt-1">
              El sello es una constancia interna e inmutable de la evidencia con la que se cerró el mes.
              No presenta declaraciones ni sustituye ningún trámite ante el SAT. Cualquier cambio posterior
              genera una huella distinta y obliga a un nuevo sello.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">huella {d.huella_actual.slice(0, 12)}…</Badge>
      </header>

      {obsoleto && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 space-y-1">
          <div className="text-sm font-medium">
            El último sello (v{obsoleto.version}) ya no corresponde a la evidencia actual
          </div>
          <p className="text-xs text-muted-foreground">{obsoleto.causa}</p>
          {obsoleto.diferencias.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Cambió: {obsoleto.diferencias.join(", ")}. El periodo se considera abierto hasta volver a sellar.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <Dato etiqueta="CFDI del periodo" valor={`${d.resumen.cfdi_total}`} />
        <Dato etiqueta="Ingresos" valor={moneda(d.resumen.ingresos_centavos)} />
        <Dato etiqueta="Egresos" valor={moneda(d.resumen.egresos_centavos)} />
        <Dato etiqueta="IVA trasladado" valor={moneda(d.resumen.iva_trasladado_centavos)} />
      </div>

      {d.bloqueos.length > 0 ? (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 space-y-1">
          <div className="text-sm font-medium">No se puede sellar todavía</div>
          <ul className="text-xs text-muted-foreground space-y-1">
            {d.bloqueos.map((b) => <li key={b.codigo}>· {b.detalle}</li>)}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Todas las etapas están resueltas y no quedan excepciones ni pólizas bloqueadas.
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={() => setAbierto(true)} disabled={!d.puedeSellar}>
          {sellado ? "Volver a sellar (nueva versión)" : "Sellar periodo"}
        </Button>
        {vigente && (
          <span className="text-xs text-muted-foreground">
            Sello v{vigente.version} · {new Date(vigente.created_at).toLocaleString("es-MX")}
          </span>
        )}
      </div>


      {d.sellos.length > 0 && (
        <div className="pt-2 border-t border-border/60">
          <div className="text-xs font-medium mb-2">Historial de sellos</div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {d.sellos.map((s: any) => (
              <li key={s.id} className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">v{s.version}</Badge>
                <span>{new Date(s.created_at).toLocaleString("es-MX")}</span>
                <span className="font-mono">{String(s.huella).slice(0, 10)}…</span>
                <span className="truncate">{s.motivo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sellar el periodo {periodo}</DialogTitle>
            <DialogDescription>
              Se guardará una copia inalterable del estado de las seis etapas y de los totales del periodo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo y alcance de la revisión (mínimo 10 caracteres)"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={() => mSellar.mutate()} disabled={mSellar.isPending || motivo.trim().length < 10}>
              {mSellar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Confirmar sello
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="text-[11px] text-muted-foreground">{etiqueta}</div>
      <div className="font-medium">{valor}</div>
    </div>
  );
}
