// Detalle completo de una corrida de Descarga Masiva SAT.
//
// Responde en un solo lugar: qué se pidió, qué contestó el SAT, qué paquetes
// llegaron, qué comprobantes entraron al expediente y qué se recalculó
// después. No muestra material sensible: los UUID, los RFC y las referencias
// de paquete se presentan enmascarados.
//
// Regla de honestidad: el resumen y el detalle usan la MISMA fuente. Nunca se
// muestra "sin paquetes" cuando el SAT reportó paquetes, ni "no hubo nuevos"
// cuando la corrida incorporó comprobantes.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { detalleCorrida, completarProcesamiento } from "@/lib/sat/sat-sync.functions";
import { CLASIFICACION_LABEL } from "@/lib/sat/linaje";
import { ESTADO_PROCESAMIENTO_LABEL } from "@/lib/sat/procesamiento";

const mxn = (n: number, moneda = "MXN") =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda || "MXN" }).format(
    Number(n || 0),
  );

const fecha = (v?: string | null) =>
  v ? new Date(v).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "—";

function Fila({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-3">
      <h4 className="text-sm font-medium mb-2">{titulo}</h4>
      {children}
    </section>
  );
}

export function CorridaDetalleDialog({
  runId,
  onClose,
}: {
  runId: string | null;
  onClose: () => void;
}) {
  const fn = useServerFn(detalleCorrida);
  const completar = useServerFn(completarProcesamiento);
  const qc = useQueryClient();
  const [enviando, setEnviando] = useState(false);

  const q = useQuery({
    queryKey: ["sat-corrida-detalle", runId],
    queryFn: () => fn({ data: { run_id: runId! } }),
    enabled: !!runId,
  });

  const d = q.data;

  const onCompletar = async () => {
    if (!runId) return;
    setEnviando(true);
    try {
      const r = await completar({ data: { run_id: runId } });
      if (!r.ok) throw new Error(r.mensaje || "El procesamiento no dejó evidencia terminal completa.");
      toast.success(r.mensaje);
      await qc.invalidateQueries({ queryKey: ["sat-corrida-detalle", runId] });
      await qc.invalidateQueries({ queryKey: ["sat-sync"] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo completar el procesamiento posterior.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={!!runId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle de la corrida</DialogTitle>
        </DialogHeader>

        {q.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando evidencia…
          </div>
        )}
        {q.error && (
          <div className="text-sm text-destructive">
            {(q.error as any)?.message ?? "No se pudo cargar el detalle."}
          </div>
        )}

        {d && (
          <div className="space-y-3">
            {d.solicitudes.length === 0 &&
              d.paquetes.length === 0 &&
              d.documentos.length === 0 &&
              d.recalculos.length === 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Información histórica no disponible: esta corrida es anterior al registro de
                  linaje, por lo que no conserva solicitudes, paquetes ni la relación con los
                  comprobantes descargados. Los datos generales sí se muestran abajo.
                </div>
              )}

            <Bloque titulo="Identificación">
              <Fila label="Expediente">
                {d.run.razon_social ?? "—"} · {d.run.rfc ?? "—"}
              </Fila>
              <Fila label="Periodo solicitado">
                {d.run.periodo.desde} → {d.run.periodo.hasta}
              </Fila>
              <Fila label="Proveedor">{d.run.proveedor ?? "—"}</Fila>
              <Fila label="Inicio">{fecha(d.run.iniciado_at)}</Fila>
              <Fila label="Fin">{fecha(d.run.finalizado_at)}</Fila>
              <Fila label="Estado">
                <Badge variant="outline">
                  {ESTADO_PROCESAMIENTO_LABEL[d.run.estado_honesto] ?? d.run.estado_honesto}
                </Badge>
              </Fila>
              <Fila label="Cobertura">{d.run.cobertura ?? "—"}</Fila>
              <Fila label="Versión de soporte">
                <span className="font-mono text-xs">{d.soporte.release}</span>
              </Fila>
              {d.run.detalle && <Fila label="Resultado">{d.run.detalle}</Fila>}
            </Bloque>

            <Bloque titulo="Solicitudes enviadas al SAT">
              {d.solicitudes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No se envió ninguna solicitud al SAT en esta corrida.
                </p>
              ) : (
                <ul className="space-y-2">
                  {d.solicitudes.map((s, i) => (
                    <li key={i} className="text-xs border-b border-border/40 pb-2 last:border-0">
                      <div className="font-medium">
                        {s.tipo ?? "CFDI"} · {s.direccion ?? "—"} ·{" "}
                        {s.estado_comprobante ?? "Vigente"}
                      </div>
                      <div className="text-muted-foreground">
                        Folio SAT: {s.folio_sat ?? "no asignado"}
                        {s.codigo ? ` · Código ${s.codigo}` : ""}
                        {s.terminal ? " · rechazo terminal" : ""}
                      </div>
                      {s.mensaje && <div className="text-muted-foreground">{s.mensaje}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </Bloque>

            <Bloque titulo={`Paquetes procesados (${d.run.totales.paquetes})`}>
              {d.paquetes.length > 0 ? (
                <ul className="text-xs text-muted-foreground space-y-1">
                  {d.paquetes.map((p: { referencia: string }, i: number) => (
                    <li key={i}>{p.referencia}</li>
                  ))}
                </ul>
              ) : (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="paquetes-sin-referencia"
                >
                  {d.paquetes_mensaje ?? "El SAT no entregó paquetes en esta corrida."}
                </p>
              )}
            </Bloque>

            <Bloque
              titulo={`Comprobantes incorporados (${d.documentos.length} de ${d.run.totales.encontrados} encontrados)`}
            >
              <div className="text-xs text-muted-foreground mb-2">
                {d.run.totales.nuevos} nuevos · {d.run.totales.duplicados} duplicados ·{" "}
                {d.run.totales.rechazados} rechazados
              </div>
              {d.documentos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Esta corrida no incorporó comprobantes nuevos al expediente.
                </p>
              ) : (
                <ul className="space-y-2">
                  {d.documentos.map((doc) => (
                    <li
                      key={doc.id}
                      className="rounded-md border border-border/60 p-2 text-xs space-y-1"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono">{doc.uuid_visible}</span>
                        <Badge variant="secondary">{CLASIFICACION_LABEL[doc.clasificacion]}</Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 text-muted-foreground">
                        <span>Tipo de comprobante: {doc.tipo_label}</span>
                        <span>
                          Complementos:{" "}
                          {doc.complementos.length ? doc.complementos.join(", ") : "ninguno"}
                        </span>
                        <span>
                          Total: {mxn(doc.total, doc.moneda)} {doc.moneda}
                        </span>
                        <span>
                          Fecha: {doc.fecha ? new Date(doc.fecha).toLocaleDateString("es-MX") : "—"}
                        </span>
                        <span>RFC emisor: {doc.rfc_emisor}</span>
                        <span>RFC receptor: {doc.rfc_receptor}</span>
                        <span className="sm:col-span-2">
                          Contraparte: {doc.contraparte?.nombre ?? doc.contraparte?.rfc ?? "—"}
                        </span>
                      </div>
                      <Link
                        to="/app/cfdi/$id"
                        params={{ id: doc.id }}
                        className="text-primary underline"
                        data-testid="ver-comprobante"
                      >
                        Ver comprobante
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Bloque>

            <Bloque titulo="Procesamiento posterior">
              <p className="text-xs text-muted-foreground mb-2">{d.procesamiento.mensaje}</p>
              {d.recalculos.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-1 pr-2 font-medium">Módulo</th>
                        <th className="py-1 pr-2 font-medium">Estado</th>
                        <th className="py-1 pr-2 font-medium">Inicio</th>
                        <th className="py-1 pr-2 font-medium">Fin</th>
                        <th className="py-1 font-medium">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.recalculos.map((r, i) => (
                        <tr key={i} className="border-t border-border/60 align-top">
                          <td className="py-1 pr-2">{r.etiqueta}</td>
                          <td
                            className={`py-1 pr-2 ${
                              r.estado === "completado"
                                ? "text-success"
                                : r.estado === "fallido"
                                  ? "text-destructive"
                                  : "text-warning"
                            }`}
                          >
                            {r.estado_label}
                          </td>
                          <td className="py-1 pr-2">{fecha(r.iniciado_at)}</td>
                          <td className="py-1 pr-2">{fecha(r.finalizado_at)}</td>
                          <td className="py-1">
                            {r.motivo ??
                              (r.resultado
                                ? Object.entries(r.resultado)
                                    .map(([k, v]) => `${k}: ${v ?? "—"}`)
                                    .join(" · ")
                                : "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Todavía no hay ningún evento de procesamiento registrado para esta corrida.
                </p>
              )}

              {d.procesamiento.accion_label && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Cada módulo deja un recibo verificable en esta bitácora. Si un
                    módulo ya dejó resultados, se reconstruye su recibo sin volver a
                    ejecutarlo y sin contactar al SAT.
                  </p>
                  <Button
                    size="sm"
                    onClick={onCompletar}
                    disabled={enviando}
                    data-testid="completar-procesamiento"
                  >
                    {enviando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {d.procesamiento.accion_label}
                  </Button>
                </div>
              )}

            </Bloque>


            {!d.reintentable && d.motivo_sin_reintento && (
              <p className="text-xs text-muted-foreground">{d.motivo_sin_reintento}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
