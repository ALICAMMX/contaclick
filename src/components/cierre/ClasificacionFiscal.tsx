// Etapa 2 del flujo mensual: decisión fiscal humana por comprobante recibido.
// La IA no aparece aquí como decisor: sólo se registran decisiones de personas.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import {
  getClasificacionFiscal,
  registrarDecisionFiscal,
  evaluarEtapaClasificacion,
} from "@/lib/cierre/decisiones.functions";
import { DECISIONES, validarDecision, type Decision } from "@/lib/cierre/decisiones";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const moneda = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

const ETIQUETA: Record<string, string> = Object.fromEntries(DECISIONES.map((d) => [d.id, d.etiqueta]));

export function ClasificacionFiscal({ clienteId, periodo }: { clienteId: string; periodo: string }) {
  const qc = useQueryClient();
  const cargar = useServerFn(getClasificacionFiscal);
  const registrar = useServerFn(registrarDecisionFiscal);
  const evaluar = useServerFn(evaluarEtapaClasificacion);

  const [edit, setEdit] = useState<{
    id: string;
    uuid: string;
    emisor: string;
    permitidas: Record<Decision, { permitida: boolean; motivo: string | null; exige: string[] }>;
    evidencia: { limitaciones: string[]; suficiente: boolean };
  } | null>(null);
  const [decision, setDecision] = useState<Decision>("por_revisar");
  const [porcentaje, setPorcentaje] = useState("100");
  const [porcentajeIva, setPorcentajeIva] = useState("100");
  const [fundamento, setFundamento] = useState("");
  const [motivo, setMotivo] = useState("");

  const q = useQuery({
    queryKey: ["clasificacion-fiscal", clienteId, periodo],
    queryFn: () => cargar({ data: { cliente_id: clienteId, periodo } }),
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["clasificacion-fiscal", clienteId] });
    qc.invalidateQueries({ queryKey: ["flujo-mensual", clienteId] });
    qc.invalidateQueries({ queryKey: ["estado-cierre", clienteId] });
  };
  const onError = (e: unknown) => toast.error((e as Error)?.message ?? "No se pudo guardar la decisión");

  const validacion = validarDecision({
    decision,
    porcentaje_deducible: Number(porcentaje) || 0,
    fundamento,
    motivo,
  });
  const ivaValido =
    decision !== "parcial" || (Number(porcentajeIva) >= 0 && Number(porcentajeIva) <= 100 && porcentajeIva !== "");
  const puedeGuardar =
    !!edit && edit.permitidas[decision]?.permitida && validacion.ok && ivaValido;

  const mGuardar = useMutation({
    mutationFn: () =>
      registrar({
        data: {
          cliente_id: clienteId,
          cfdi_id: edit!.id,
          decision,
          porcentaje_deducible: validacion.porcentaje,
          ...(decision === "parcial" ? { porcentaje_iva: Number(porcentajeIva) } : {}),
          fundamento: fundamento || undefined,
          motivo: motivo || undefined,
        },
      }),
    onSuccess: () => { toast.success("Decisión registrada"); setEdit(null); refrescar(); },
    onError,
  });


  const mEvaluar = useMutation({
    mutationFn: () => evaluar({ data: { cliente_id: clienteId, periodo } }),
    onSuccess: (r: any) => { toast.success(`Etapa clasificación: ${r.estado}`); refrescar(); },
    onError,
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando la clasificación fiscal…
      </div>
    );
  }
  if (q.error) {
    return <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm">{(q.error as Error).message}</div>;
  }

  const cob = q.data!.cobertura;
  const comprobantes = q.data!.comprobantes as any[];

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Scale className="h-5 w-5 mt-0.5 text-muted-foreground" />
          <div>
            <h2 className="font-medium">Clasificación fiscal · decisiones por comprobante</h2>
            <p className="text-sm text-muted-foreground max-w-2xl mt-1">
              Cada CFDI recibido necesita una decisión de una persona. El validador de deducibilidad
              sugiere; aquí se registra la decisión con su fundamento. Un comprobante sin evidencia SAT
              vigente sólo puede quedar “por revisar” o marcarse no deducible.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{cob.decididos}/{cob.total} decididos</Badge>
          <Badge variant="outline">Deducible: {moneda(cob.montoDeducible)}</Badge>
        </div>
      </header>

      <ul className="text-xs text-muted-foreground space-y-1">
        {cob.criteriosPendientes.map((c: string) => <li key={c}>· {c}</li>)}
      </ul>

      {comprobantes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay comprobantes recibidos en el periodo. Sin documentos la etapa no puede declararse lista.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm min-w-[42rem]">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="text-left py-2">Emisor</th>
                <th className="text-left py-2">Fecha</th>
                <th className="text-right py-2">Total</th>
                <th className="text-left py-2">SAT</th>
                <th className="text-left py-2">Decisión</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {comprobantes.map((c) => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="py-2 pr-3">
                    <div className="font-medium truncate max-w-[16rem]">{c.nombre_emisor ?? c.rfc_emisor}</div>
                    <div className="text-[11px] text-muted-foreground">{c.uuid}</div>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{String(c.fecha).slice(0, 10)}</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{moneda(Number(c.total))}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={c.estatus_sat === "vigente" ? "outline" : "secondary"} className="text-[10px]">
                      {c.estatus_sat ?? "desconocido"}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3">
                    {c.decision ? (
                      <span>
                        {ETIQUETA[c.decision.decision]}
                        {c.decision.decision === "parcial" ? ` (${Number(c.decision.porcentaje_deducible)}%)` : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sin decisión</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEdit({
                          id: c.id,
                          uuid: c.uuid,
                          emisor: c.nombre_emisor ?? c.rfc_emisor,
                          permitidas: c.permitidas,
                          evidencia: c.evidencia,
                        });
                        const previa = (c.decision?.decision as Decision) ?? null;
                        setDecision(
                          previa && c.permitidas?.[previa]?.permitida
                            ? previa
                            : c.evidencia?.suficiente
                              ? "deducible"
                              : "por_revisar",
                        );
                        setPorcentaje(String(c.decision?.porcentaje_deducible ?? 100));
                        setPorcentajeIva("100");
                        setFundamento(c.decision?.fundamento ?? "");
                        setMotivo(c.decision?.motivo ?? "");
                      }}
                    >
                      Decidir
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-1">
        <Button size="sm" variant="glass" onClick={() => mEvaluar.mutate()} disabled={mEvaluar.isPending}>
          Evaluar etapa con la evidencia guardada
        </Button>
        <span className="text-xs text-muted-foreground">
          El estado “lista” lo produce el evaluador de la base; no puede declararse a mano.
        </span>
        {!cob.listo && (
          <span className="text-xs text-muted-foreground">
            Falta decidir {cob.total - cob.decididos} comprobante(s).
          </span>
        )}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decisión fiscal</DialogTitle>
            <DialogDescription>{edit?.emisor} · {edit?.uuid}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={decision} onValueChange={(v) => setDecision(v as Decision)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DECISIONES.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.etiqueta} — {d.descripcion}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {decision === "parcial" && (
              <Input
                type="number" min={1} max={99} value={porcentaje}
                onChange={(e) => setPorcentaje(e.target.value)}
                placeholder="Porcentaje deducible"
              />
            )}
            {decision === "deducible" && (
              <Textarea
                value={fundamento} onChange={(e) => setFundamento(e.target.value)}
                placeholder="Fundamento: concepto, uso e indispensabilidad del gasto"
              />
            )}
            {(decision === "no_deducible" || decision === "parcial") && (
              <Textarea
                value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo (mínimo 10 caracteres)"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={() => mGuardar.mutate()} disabled={mGuardar.isPending}>
              {mGuardar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Guardar decisión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
