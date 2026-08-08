// Detalle completo de una corrida de Descarga Masiva SAT.
//
// Responde en un solo lugar: qué se pidió, qué contestó el SAT, qué paquetes
// llegaron, qué comprobantes entraron al expediente y qué se recalculó
// después. No muestra material sensible: los UUID y las referencias de
// paquete se presentan enmascarados.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { detalleCorrida } from "@/lib/sat/sat-sync.functions";
import { CLASIFICACION_LABEL } from "@/lib/sat/linaje";

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

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
  const q = useQuery({
    queryKey: ["sat-corrida-detalle", runId],
    queryFn: () => fn({ data: { run_id: runId! } }),
    enabled: !!runId,
  });

  const d = q.data;

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
                <Badge variant="outline">{d.run.estado}</Badge>
              </Fila>
              <Fila label="Cobertura">{d.run.cobertura ?? "—"}</Fila>
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
              {d.paquetes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin paquetes entregados.</p>
              ) : (
                <ul className="text-xs text-muted-foreground space-y-1">
                  {d.paquetes.map((p, i) => (
                    <li key={i}>{p.referencia}</li>
                  ))}
                </ul>
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
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-1 pr-2">UUID</th>
                        <th className="py-1 pr-2">Clasificación</th>
                        <th className="py-1 pr-2">Fecha</th>
                        <th className="py-1 pr-2">Contraparte</th>
                        <th className="py-1 pr-2 text-right">Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.documentos.map((doc) => (
                        <tr key={doc.id} className="border-t border-border/40">
                          <td className="py-1 pr-2 font-mono">{doc.uuid_visible}</td>
                          <td className="py-1 pr-2">{CLASIFICACION_LABEL[doc.clasificacion]}</td>
                          <td className="py-1 pr-2">
                            {doc.fecha ? new Date(doc.fecha).toLocaleDateString("es-MX") : "—"}
                          </td>
                          <td className="py-1 pr-2">
                            {doc.contraparte?.nombre ?? doc.contraparte?.rfc ?? "—"}
                          </td>
                          <td className="py-1 pr-2 text-right">{mxn(doc.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Bloque>

            <Bloque titulo="Recálculos posteriores">
              {d.recalculos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sin recálculos registrados: esta corrida no trajo comprobantes nuevos.
                </p>
              ) : (
                <ul className="text-xs space-y-1">
                  {d.recalculos.map((r, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{r.etiqueta}</span>
                      <span
                        className={
                          r.ok ? "text-success" : r.pendiente ? "text-warning" : "text-destructive"
                        }
                      >
                        {r.ok ? "Recalculado" : r.pendiente ? "Pendiente" : "Falló"} ·{" "}
                        {fecha(r.at)}
                      </span>
                    </li>
                  ))}
                </ul>
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
