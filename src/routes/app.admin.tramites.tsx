import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { FileText, Plus, Trash2, X, Upload, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listTramites, upsertTramite, moveTramite, deleteTramite, listClientesLite, bulkInsertTramites, seedDemoTramites } from "@/lib/tramites/tramites.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImportDialog, type ColSpec } from "@/components/ImportDialog";
import { toast } from "sonner";

const TRAMITE_COLS: ColSpec[] = [
  { key: "titulo", label: "titulo", required: true, example: "Devolución de IVA Q2", hint: "Nombre del trámite" },
  { key: "descripcion", label: "descripcion", example: "Solicitud por saldo a favor" },
  { key: "autoridad", label: "autoridad", example: "SAT", hint: "SAT | IMSS | INFONAVIT | Estatal | Municipal | Otra" },
  { key: "estado", label: "estado", example: "pendiente", hint: "pendiente | en_proceso | esperando_autoridad | resuelto" },
  { key: "fecha_vencimiento", label: "fecha_vencimiento", example: "2026-07-15", hint: "Formato YYYY-MM-DD (opcional)" },
  { key: "cliente_rfc", label: "cliente_rfc", example: "VEG950822RR1", hint: "RFC del expediente — debe existir en tus clientes" },
];

function normalizeDate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 25569) {
    return new Date((Number(s) - 25569) * 86400000).toISOString().slice(0, 10);
  }
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const yy = dmy[3].length === 2 ? "20" + dmy[3] : dmy[3];
    return `${yy}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/app/admin/tramites")({ component: TramPage });

type Estado = "pendiente" | "en_proceso" | "esperando_autoridad" | "resuelto";
type Tramite = {
  id: string; titulo: string; descripcion: string | null; autoridad: string | null;
  estado: Estado; fecha_vencimiento: string | null; cliente_id: string | null;
  cliente_nombre: string | null; notas: string | null;
};

const COLS: { key: Estado; title: string }[] = [
  { key: "pendiente", title: "Pendientes" },
  { key: "en_proceso", title: "En proceso" },
  { key: "esperando_autoridad", title: "Esperando autoridad" },
  { key: "resuelto", title: "Resueltos" },
];

function nivel(vto: string | null): "verde" | "amarillo" | "rojo" | null {
  if (!vto) return null;
  const d = Math.ceil((new Date(vto).getTime() - Date.now()) / 86400000);
  if (d < 3) return "rojo";
  if (d < 10) return "amarillo";
  return "verde";
}
function vtoLabel(vto: string | null): string {
  if (!vto) return "—";
  const d = Math.ceil((new Date(vto).getTime() - Date.now()) / 86400000);
  if (d < 0) return `vencido ${-d}d`;
  if (d === 0) return "hoy";
  return `en ${d}d`;
}

function TramPage() {
  const qc = useQueryClient();
  const list = useServerFn(listTramites);
  const upsert = useServerFn(upsertTramite);
  const move = useServerFn(moveTramite);
  const del = useServerFn(deleteTramite);
  const listClientes = useServerFn(listClientesLite);

  const { data, isLoading } = useQuery({ queryKey: ["tramites"], queryFn: () => list() });
  const { data: clientesData } = useQuery({ queryKey: ["clientes-lite"], queryFn: () => listClientes() });

  const tramites = (data?.tramites ?? []) as Tramite[];
  const cols = useMemo(() => COLS.map(c => ({ ...c, items: tramites.filter(t => t.estado === c.key) })), [tramites]);

  const moveMut = useMutation({
    mutationFn: (v: { id: string; estado: Estado }) => move({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tramites"] }),
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tramites"] }); toast.success("Eliminado"); },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tramite | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const bulkFn = useServerFn(bulkInsertTramites);
  const seedFn = useServerFn(seedDemoTramites);
  const seedMut = useMutation({
    mutationFn: () => seedFn(),
    onSuccess: (r: any) => { toast.success(`Cargados ${r.inserted} trámites demo`); qc.invalidateQueries({ queryKey: ["tramites"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const onDrop = (e: React.DragEvent, estado: Estado) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) moveMut.mutate({ id, estado });
  };

  return (
    <ModuleScaffold
      title="Gestor de Trámites"
      subtitle="Kanban funcional con semáforo automático por vencimiento. Arrastra las tarjetas para cambiar de estado."
      icon={<FileText className="h-5 w-5" />}
      badge={null}
      actions={<>
        <HerramientaHelp slug="admin-tramites" />
        <Button size="sm" variant="outline" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-3.5 w-3.5" /> Nuevo</Button>
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-3.5 w-3.5" /> Importar</Button>
        <Button size="sm" variant="ghost" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}><Sparkles className="h-3.5 w-3.5" /> Cargar demo</Button>
      </>}
    >
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-10 text-center">Cargando…</div>
      ) : (
        <div className="grid md:grid-cols-4 gap-3">
          {cols.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, col.key)}
              className="rounded-xl border border-border/60 bg-card/30 p-3 min-h-[200px]"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground mb-3 px-1">
                <span>{col.title}</span>
                <span className="font-mono">{col.items.length}</span>
              </div>
              <div className="space-y-2">
                {col.items.map((t) => {
                  const lv = nivel(t.fecha_vencimiento);
                  const tone = lv === "rojo" ? "border-red-500/40 bg-red-500/10"
                    : lv === "amarillo" ? "border-amber-500/40 bg-amber-500/10"
                    : lv === "verde" ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-border/60 bg-card/50";
                  const dot = lv === "rojo" ? "bg-red-400" : lv === "amarillo" ? "bg-amber-300" : lv === "verde" ? "bg-emerald-400" : "bg-muted-foreground/40";
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                      onClick={() => { setEditing(t); setOpen(true); }}
                      className={`rounded-lg border ${tone} p-3 cursor-grab active:cursor-grabbing group`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${dot}`} />
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{vtoLabel(t.fecha_vencimiento)}</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); if (confirm("¿Eliminar trámite?")) delMut.mutate(t.id); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                      </div>
                      <div className="text-sm font-medium leading-snug">{t.titulo}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {t.cliente_nombre ?? "Sin expediente"}
                        {t.autoridad && <span> · {t.autoridad}</span>}
                      </div>
                    </div>
                  );
                })}
                {!col.items.length && <div className="text-[11px] text-muted-foreground/70 text-center py-4">Sin trámites</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <TramiteDialog
          initial={editing}
          clientes={clientesData?.clientes ?? []}
          onClose={() => { setOpen(false); setEditing(null); }}
          onSave={async (p) => {
            try {
              await upsert({ data: { ...p, id: editing?.id } });
              toast.success("Guardado");
              setOpen(false); setEditing(null);
              qc.invalidateQueries({ queryKey: ["tramites"] });
            } catch (e: any) { toast.error(e?.message ?? "Error"); }
          }}
        />
      )}

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Trámites"
        columns={TRAMITE_COLS}
        templateRows={[
          { titulo: "Devolución de IVA Q2", descripcion: "Saldo a favor", autoridad: "SAT", estado: "en_proceso", fecha_vencimiento: "2026-07-15", cliente_rfc: "" },
          { titulo: "Cambio de domicilio fiscal", descripcion: "", autoridad: "SAT", estado: "pendiente", fecha_vencimiento: "2026-08-01", cliente_rfc: "" },
        ]}
        helpNote={<>El <b>cliente_rfc</b> es opcional. Si lo incluyes, debe coincidir exactamente con el RFC de un expediente ya registrado en tu despacho; si no coincide, el trámite se crea sin expediente vinculado.</>}
        onImport={async (rows) => {
          const valid = ["pendiente", "en_proceso", "esperando_autoridad", "resuelto"];
          const payload = rows.map((r) => {
            const est = String(r.estado ?? "pendiente").toLowerCase().replace(/\s+/g, "_");
            return {
              titulo: String(r.titulo),
              descripcion: r.descripcion ? String(r.descripcion) : null,
              autoridad: r.autoridad ? String(r.autoridad) : null,
              estado: (valid.includes(est) ? est : "pendiente") as any,
              fecha_vencimiento: normalizeDate(r.fecha_vencimiento),
              cliente_rfc: r.cliente_rfc ? String(r.cliente_rfc).toUpperCase().trim() : null,
            };
          });
          try {
            const res: any = await bulkFn({ data: { rows: payload } });
            toast.success(`Importados ${res.inserted} trámites`);
            qc.invalidateQueries({ queryKey: ["tramites"] });
          } catch (e: any) { toast.error(e?.message ?? "Error al importar"); }
        }}
      />
    </ModuleScaffold>
  );
}

function TramiteDialog({ initial, clientes, onClose, onSave }: {
  initial: Tramite | null; clientes: { id: string; rfc: string; razon_social: string }[];
  onClose: () => void; onSave: (p: any) => void;
}) {
  const [titulo, setT] = useState(initial?.titulo ?? "");
  const [descripcion, setD] = useState(initial?.descripcion ?? "");
  const [autoridad, setA] = useState(initial?.autoridad ?? "SAT");
  const [estado, setE] = useState<Estado>(initial?.estado ?? "pendiente");
  const [vto, setV] = useState(initial?.fecha_vencimiento ?? "");
  const [cliente_id, setCli] = useState<string>(initial?.cliente_id ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Editar trámite" : "Nuevo trámite"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Título</Label><Input value={titulo} onChange={(e) => setT(e.target.value)} placeholder="Ej. Devolución de IVA Q2" /></div>
          <div><Label>Descripción</Label><Textarea rows={2} value={descripcion ?? ""} onChange={(e) => setD(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Autoridad</Label>
              <select value={autoridad ?? ""} onChange={(e) => setA(e.target.value)} className="w-full h-10 rounded-md border border-border bg-input/40 px-3 text-sm">
                {["SAT", "IMSS", "INFONAVIT", "Estatal", "Municipal", "Otra"].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div><Label>Vencimiento</Label><Input type="date" value={vto ?? ""} onChange={(e) => setV(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Estado</Label>
              <select value={estado} onChange={(e) => setE(e.target.value as Estado)} className="w-full h-10 rounded-md border border-border bg-input/40 px-3 text-sm">
                <option value="pendiente">Pendiente</option>
                <option value="en_proceso">En proceso</option>
                <option value="esperando_autoridad">Esperando autoridad</option>
                <option value="resuelto">Resuelto</option>
              </select>
            </div>
            <div><Label>Expediente</Label>
              <select value={cliente_id} onChange={(e) => setCli(e.target.value)} className="w-full h-10 rounded-md border border-border bg-input/40 px-3 text-sm">
                <option value="">— Ninguno —</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social} ({c.rfc})</option>)}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}><X className="h-4 w-4" /> Cancelar</Button>
          <Button onClick={() => {
            if (!titulo) { toast.error("Falta el título"); return; }
            onSave({ titulo, descripcion: descripcion || null, autoridad, estado,
              fecha_vencimiento: vto || null, cliente_id: cliente_id || null });
          }}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
