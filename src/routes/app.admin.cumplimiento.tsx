import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, CheckCircle2, AlertCircle, Circle, Plus, Trash2, Sparkles, ExternalLink } from "lucide-react";
import { ModuleScaffold, KpiTile, DemoCard } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useActiveCliente } from "@/lib/active-cliente";
import {
  listarCumplimiento, upsertCumplimiento, marcarCumplido, eliminarCumplimiento, sembrarCumplimientoBase,
} from "@/lib/cumplimiento/cumplimiento.functions";

export const Route = createFileRoute("/app/admin/cumplimiento")({ component: CumplimientoPage });

const AREAS = ["IMSS", "INFONAVIT", "SAT", "STPS", "Estatal", "Otro"] as const;
const FRECS = ["mensual", "bimestral", "trimestral", "semestral", "anual", "unica", "continuo"] as const;

function statusInfo(estado_calc: string, estado: string) {
  const v = estado_calc || estado;
  if (estado === "cumplido") return { icon: CheckCircle2, color: "text-emerald-400", label: "Cumplido" };
  if (estado === "na") return { icon: Circle, color: "text-muted-foreground", label: "No aplica" };
  if (v === "vencido") return { icon: AlertCircle, color: "text-red-400", label: "Vencido" };
  if (v === "por_vencer") return { icon: AlertCircle, color: "text-amber-400", label: "Por vencer" };
  return { icon: Circle, color: "text-muted-foreground", label: "Pendiente" };
}

function CumplimientoPage() {
  const { cliente } = useActiveCliente();
  const qc = useQueryClient();
  const listar = useServerFn(listarCumplimiento);
  const upsert = useServerFn(upsertCumplimiento);
  const marcar = useServerFn(marcarCumplido);
  const eliminar = useServerFn(eliminarCumplimiento);
  const sembrar = useServerFn(sembrarCumplimientoBase);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["cumplimiento", cliente?.id ?? "all"],
    queryFn: () => listar({ data: cliente?.id ? { cliente_id: cliente.id } : {} }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cumplimiento"] });

  const seedMut = useMutation({
    mutationFn: () => sembrar({ data: cliente?.id ? { cliente_id: cliente.id } : {} }),
    onSuccess: (r) => { toast.success(`${r.inserted} items base creados`); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Error al sembrar"),
  });
  const markMut = useMutation({
    mutationFn: (id: string) => marcar({ data: { id } }),
    onSuccess: () => { toast.success("Marcado como cumplido"); invalidate(); },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => eliminar({ data: { id } }),
    onSuccess: () => { toast.success("Eliminado"); invalidate(); },
  });

  const total = rows.length;
  const cumplidos = rows.filter((r: any) => r.estado === "cumplido").length;
  const vencidos = rows.filter((r: any) => (r.estado_calc || r.estado) === "vencido").length;
  const porVencer = rows.filter((r: any) => r.estado_calc === "por_vencer").length;
  const pct = total ? Math.round((cumplidos / total) * 100) : 0;

  const grupos = AREAS.map((a) => ({ area: a, items: rows.filter((r: any) => r.area === a) })).filter((g) => g.items.length > 0);

  return (
    <ModuleScaffold
      title="Cumplimiento Laboral"
      subtitle="Checklist de obligaciones IMSS, INFONAVIT, SAT y STPS con vencimientos y evidencia. Calcula semáforos automáticamente por fecha."
      icon={<ShieldCheck className="h-5 w-5" />}
      badge={null}
      actions={
        <>
          <HerramientaHelp slug="admin-cumplimiento" />
          <ItemDialog onSaved={invalidate} clienteId={cliente?.id} upsert={upsert} />
        </>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Cumplimiento" value={`${pct}%`} accent="success" />
        <KpiTile label="Cumplidos" value={`${cumplidos}/${total}`} accent="primary" />
        <KpiTile label="Por vencer (7d)" value={String(porVencer)} accent="warning" />
        <KpiTile label="Vencidos" value={String(vencidos)} accent="destructive" />
      </div>

      {!isLoading && total === 0 && (
        <DemoCard title="Empieza rápido">
          <p className="text-sm text-muted-foreground mb-3">
            No tienes items de cumplimiento {cliente ? `para ${cliente.razon_social}` : "registrados"}. Puedes sembrar un set base con las obligaciones laborales más comunes y luego ajustar fechas y responsables.
          </p>
          <Button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
            <Sparkles className="h-4 w-4 mr-1" /> {seedMut.isPending ? "Sembrando…" : "Sembrar checklist base (11 items)"}
          </Button>
        </DemoCard>
      )}

      {grupos.map((g) => (
        <section key={g.area} className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.area}</h2>
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] text-muted-foreground tabular-nums">{g.items.length}</span>
          </div>
          <div className="grid gap-2">
            {g.items.map((it: any) => {
              const s = statusInfo(it.estado_calc, it.estado);
              const Icon = s.icon;
              return (
                <div key={it.id} className="rounded-lg border border-border/60 bg-card/50 p-3 flex items-start gap-3">
                  <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${s.color}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{it.item}</span>
                      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${s.color} bg-current/10`}>{s.label}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Frecuencia: {it.frecuencia}</span>
                      {it.proximo_vencimiento && <span>Vence: {it.proximo_vencimiento}</span>}
                      {it.ultimo_cumplido && <span>Último: {it.ultimo_cumplido}</span>}
                      {it.responsable && <span>· {it.responsable}</span>}
                    </div>
                    {it.notas && <div className="text-xs text-muted-foreground mt-1 italic">{it.notas}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {it.evidencia_url && (
                      <a href={it.evidencia_url} target="_blank" rel="noopener noreferrer" className="h-8 px-2 inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {it.estado !== "cumplido" && (
                      <Button size="sm" variant="outline" onClick={() => markMut.mutate(it.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Cumplir
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("¿Eliminar item?")) delMut.mutate(it.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </ModuleScaffold>
  );
}

function ItemDialog({ onSaved, clienteId, upsert }: { onSaved: () => void; clienteId?: string; upsert: any }) {
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState<string>("IMSS");
  const [item, setItem] = useState("");
  const [frecuencia, setFrecuencia] = useState<string>("mensual");
  const [proximo, setProximo] = useState("");
  const [responsable, setResponsable] = useState("");
  const [notas, setNotas] = useState("");

  const mut = useMutation({
    mutationFn: () => upsert({ data: {
      cliente_id: clienteId,
      area, item, frecuencia,
      proximo_vencimiento: proximo || null,
      responsable, notas,
      estado: "pendiente",
    }}),
    onSuccess: () => {
      toast.success("Item creado");
      setOpen(false); onSaved();
      setItem(""); setProximo(""); setResponsable(""); setNotas("");
    },
    onError: (e: any) => toast.error(e?.message || "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo item</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo item de cumplimiento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Área</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Frecuencia</Label>
              <Select value={frecuencia} onValueChange={setFrecuencia}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{FRECS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Item / obligación</Label>
            <Input className="mt-1" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Ej. Pago de cuotas IMSS noviembre" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Próximo vencimiento</Label>
              <Input type="date" className="mt-1" value={proximo} onChange={(e) => setProximo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Responsable</Label>
              <Input className="mt-1" value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Nombre del responsable" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea className="mt-1" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
          <Button className="w-full" disabled={!item.trim() || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
