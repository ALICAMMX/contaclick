import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, AlertTriangle, Sparkles, Upload, Trash2, RefreshCw, Plus, FileText, CheckCircle2 } from "lucide-react";
import { ModuleScaffold, KpiTile } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useActiveCliente } from "@/lib/active-cliente";
import {
  listarBuzon,
  registrarNotificacion,
  reanalizarNotificacion,
  cambiarEstadoNotificacion,
  eliminarNotificacion,
} from "@/lib/buzon/buzon.functions";

export const Route = createFileRoute("/app/admin/buzon")({ component: BuzonPage });

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function BuzonPage() {
  const { cliente: activeCliente } = useActiveCliente();
  const qc = useQueryClient();
  const fnList = useServerFn(listarBuzon);
  const fnReg = useServerFn(registrarNotificacion);
  const fnRe = useServerFn(reanalizarNotificacion);
  const fnEstado = useServerFn(cambiarEstadoNotificacion);
  const fnDel = useServerFn(eliminarNotificacion);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  const q = useQuery({
    queryKey: ["buzon", activeCliente?.id ?? "all"],
    queryFn: () => fnList({ data: { estado: "todas", cliente_id: activeCliente?.id } }),
  });

  const lista = q.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const kpi = {
    total: lista.length,
    pendientes: lista.filter((l: any) => l.estado === "pendiente").length,
    vencidas: lista.filter((l: any) => l.vence_at && l.vence_at < today && l.estado !== "respondida").length,
    con_borrador: lista.filter((l: any) => l.ia_analisis?.borrador_respuesta).length,
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["buzon"] });

  return (
    <ModuleScaffold
      title="Bandeja de Notificaciones IA"
      subtitle="Sube manualmente los PDFs de notificaciones SAT/IMSS/INFONAVIT. La IA extrae plazo, fundamento, riesgo y un borrador de respuesta. No se conecta al Buzón Tributario oficial."
      icon={<Mail className="h-5 w-5" />}
      badge={null}
      actions={
        <>
          <HerramientaHelp slug="admin-buzon" />
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nueva notificación
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Notificaciones" value={String(kpi.total)} accent="primary" />
        <KpiTile label="Pendientes" value={String(kpi.pendientes)} accent="warning" />
        <KpiTile label="Vencidas" value={String(kpi.vencidas)} accent={kpi.vencidas > 0 ? "warning" : "success"} />
        <KpiTile label="Borradores IA" value={String(kpi.con_borrador)} accent="gold" />
      </div>

      <div className="grid md:grid-cols-[1.2fr_1fr] gap-4 mt-6">
        <div className="rounded-xl border border-border/60 bg-card/50 divide-y divide-border/40 min-h-[300px]">
          {q.isLoading && <div className="p-8 text-center text-sm text-muted-foreground">Cargando…</div>}
          {!q.isLoading && lista.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Sin notificaciones. Pulsa "Nueva notificación" para registrar la primera.
            </div>
          )}
          {lista.map((m: any) => {
            const venceTexto = m.vence_at
              ? m.vence_at < today
                ? `Venció ${m.vence_at}`
                : `Vence ${m.vence_at} (${Math.ceil((+new Date(m.vence_at) - +new Date()) / 86400000)} d)`
              : "Sin plazo";
            const urgent = m.vence_at && m.vence_at < today && m.estado !== "respondida";
            return (
              <button
                key={m.id}
                onClick={() => setSelected(m)}
                className={`w-full text-left p-4 hover:bg-card/80 transition-colors ${selected?.id === m.id ? "bg-card/80" : ""}`}
              >
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>{m.origen} · {String(m.fecha_recibida).slice(0, 10)}</span>
                  <span className={urgent ? "text-red-400" : ""}>{venceTexto}</span>
                </div>
                <div className="flex items-start gap-2">
                  {urgent && <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{m.asunto}</div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.resumen ?? "Sin análisis"}</div>
                    <div className="flex gap-1 mt-2">
                      <Badge variant="outline" className="text-[10px]">{m.estado}</Badge>
                      {m.ia_analisis?.riesgo && (
                        <Badge className={`text-[10px] ${m.ia_analisis.riesgo === "alto" ? "bg-red-500/20 text-red-300" : m.ia_analisis.riesgo === "medio" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                          Riesgo {m.ia_analisis.riesgo}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl glass-gold p-5 self-start min-h-[300px]">
          {!selected ? (
            <div className="text-sm text-muted-foreground text-center py-12">Selecciona una notificación para ver su análisis IA.</div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-[oklch(0.85_0.13_85)]" /> Análisis IA
              </div>
              {selected.ia_analisis?.error && (
                <div className="rounded bg-red-500/10 border border-red-500/30 p-2 text-red-300">
                  {selected.ia_analisis.error}
                </div>
              )}
              {selected.ia_analisis?.tipo_notificacion && (
                <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tipo</div><div className="text-sm mt-0.5">{selected.ia_analisis.tipo_notificacion}</div></div>
              )}
              {selected.ia_analisis?.plazo_dias && (
                <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Plazo</div><div className="text-sm mt-0.5">{selected.ia_analisis.plazo_dias} días · vence {selected.vence_at}</div></div>
              )}
              {selected.ia_analisis?.fundamento_legal && (
                <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fundamento</div><div className="text-sm mt-0.5">{selected.ia_analisis.fundamento_legal}</div></div>
              )}
              {selected.ia_analisis?.acciones_recomendadas?.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Acciones</div>
                  <ul className="text-sm mt-1 space-y-1 list-disc pl-4">
                    {selected.ia_analisis.acciones_recomendadas.map((a: string, i: number) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
              {selected.ia_analisis?.borrador_respuesta && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Borrador de respuesta</div>
                  <div className="text-sm mt-1 p-2 rounded bg-card/60 max-h-48 overflow-auto whitespace-pre-wrap">{selected.ia_analisis.borrador_respuesta}</div>
                </div>
              )}

              <div className="flex gap-1 flex-wrap pt-2 border-t border-border/30">
                <Button size="sm" variant="outline" onClick={async () => {
                  await fnRe({ data: { id: selected.id } }).catch((e: any) => toast.error(e.message));
                  toast.success("Re-analizado");
                  invalidate();
                }}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Re-analizar
                </Button>
                <Select value={selected.estado} onValueChange={async (v) => {
                  await fnEstado({ data: { id: selected.id, estado: v as any } });
                  toast.success("Estado actualizado"); invalidate();
                  setSelected({ ...selected, estado: v });
                }}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="en_proceso">En proceso</SelectItem>
                    <SelectItem value="respondida">Respondida</SelectItem>
                    <SelectItem value="vencida">Vencida</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" className="text-red-300" onClick={async () => {
                  if (!confirm("¿Eliminar notificación?")) return;
                  await fnDel({ data: { id: selected.id } });
                  toast.success("Eliminada"); setSelected(null); invalidate();
                }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <NuevaNotifDialog
        open={open} onClose={() => setOpen(false)}
        clienteId={activeCliente?.id ?? null}
        onCreate={async (payload) => {
          const r = await fnReg({ data: payload });
          if (r.ia_error) toast.warning(`Guardada · IA: ${r.ia_error}`);
          else toast.success(r.vence_at ? `Guardada · vence ${r.vence_at}` : "Guardada");
          invalidate();
        }}
      />
    </ModuleScaffold>
  );
}

function NuevaNotifDialog({ open, onClose, clienteId, onCreate }: { open: boolean; onClose: () => void; clienteId: string | null; onCreate: (p: any) => Promise<void> }) {
  const [origen, setOrigen] = useState<"SAT" | "IMSS" | "INFONAVIT" | "Estatal" | "Otro">("SAT");
  const [asunto, setAsunto] = useState("");
  const [folio, setFolio] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [pdf, setPdf] = useState<File | null>(null);
  const [analizar, setAnalizar] = useState(true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!asunto.trim()) return toast.error("El asunto es obligatorio");
    setSaving(true);
    try {
      const pdf_base64 = pdf ? await fileToBase64(pdf) : undefined;
      await onCreate({
        cliente_id: clienteId,
        origen, asunto: asunto.trim(),
        folio: folio || undefined,
        fecha_recibida: fecha,
        pdf_base64,
        pdf_filename: pdf?.name,
        analizar_ia: analizar && !!pdf,
      });
      setAsunto(""); setFolio(""); setPdf(null); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Registrar notificación</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Origen</Label>
              <Select value={origen} onValueChange={(v) => setOrigen(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SAT">SAT</SelectItem>
                  <SelectItem value="IMSS">IMSS</SelectItem>
                  <SelectItem value="INFONAVIT">INFONAVIT</SelectItem>
                  <SelectItem value="Estatal">Estatal</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha recibida</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Asunto</Label>
            <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Invitación a regularizar IVA Q3" />
          </div>
          <div>
            <Label>Folio / oficio (opcional)</Label>
            <Input value={folio} onChange={(e) => setFolio(e.target.value)} />
          </div>
          <div>
            <Label>PDF de la notificación (opcional)</Label>
            <Input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
            {pdf && <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><FileText className="h-3 w-3" />{pdf.name} · {(pdf.size / 1024).toFixed(0)} KB</div>}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={analizar} onChange={(e) => setAnalizar(e.target.checked)} />
            Analizar con IA (extrae plazo, fundamento y borrador de respuesta)
          </label>
          {analizar && !pdf && <p className="text-xs text-amber-300">Selecciona un PDF para que la IA pueda analizarlo.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            {saving ? "Procesando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
