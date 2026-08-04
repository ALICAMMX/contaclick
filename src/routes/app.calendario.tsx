import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Plus,
  Download,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  UserRound,
  Bell,
  Search,
  X,
  Trash2,
  Pencil,
} from "lucide-react";
import { ToolShell } from "@/components/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeFilename, triggerFileDownload } from "@/lib/download";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useActiveCliente } from "@/lib/active-cliente";
import { toast } from "sonner";
import {
  listObligacionesCliente,
  autogenerarObligaciones,
  upsertObligacion,
  setEstatusObligacion,
  posponerObligacion,
  eliminarObligacion,
  getAlertConfig,
  updateAlertConfig,
  listEquipoDespacho,
  type ObligacionRow,
} from "@/lib/calendario/calendario.functions";

export const Route = createFileRoute("/app/calendario")({
  component: CalendarioFiscal,
});

const TIPO_LABEL: Record<string, string> = {
  mensual: "Mensual",
  bimestral: "Bimestral",
  anual: "Anual",
  informativa: "Informativa",
  laboral: "Laboral",
  estatal: "Estatal",
};

const TIPO_COLOR: Record<string, string> = {
  mensual: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-300",
  bimestral: "bg-purple-500/10 text-purple-600 border-purple-500/30 dark:text-purple-300",
  anual: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-300",
  informativa: "bg-slate-500/10 text-slate-600 border-slate-500/30 dark:text-slate-300",
  laboral: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-300",
  estatal: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-300",
};

type Semaforo = "verde" | "amarillo" | "rojo";
function semaforo(o: ObligacionRow): Semaforo {
  if (o.estatus === "presentada") return "verde";
  if (o.estatus === "vencida") return "rojo";
  if (!o.proximo_vencimiento) return "verde";
  const diff = (new Date(o.proximo_vencimiento).getTime() - Date.now()) / 86400_000;
  if (diff <= 5) return "amarillo";
  return "verde";
}
const SEM_BG: Record<Semaforo, string> = {
  verde: "bg-emerald-500",
  amarillo: "bg-amber-500",
  rojo: "bg-rose-500",
};

function CalendarioFiscal() {
  const { cliente } = useActiveCliente();
  const qc = useQueryClient();
  const listFn = useServerFn(listObligacionesCliente);
  const autogenFn = useServerFn(autogenerarObligaciones);

  const [refMonth, setRefMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [periodMode, setPeriodMode] = useState<"mes" | "anio">("mes");

  const desde = useMemo(() => {
    if (periodMode === "anio") return new Date(refMonth.getFullYear(), 0, 1).toISOString().slice(0, 10);
    return new Date(refMonth.getFullYear(), refMonth.getMonth(), 1).toISOString().slice(0, 10);
  }, [refMonth, periodMode]);
  const hasta = useMemo(() => {
    if (periodMode === "anio") return new Date(refMonth.getFullYear(), 11, 31).toISOString().slice(0, 10);
    return new Date(refMonth.getFullYear(), refMonth.getMonth() + 1, 0).toISOString().slice(0, 10);
  }, [refMonth, periodMode]);

  const query = useQuery({
    queryKey: ["calendario", cliente?.id, desde, hasta],
    queryFn: () => listFn({ data: { clienteId: cliente!.id, desde, hasta } }),
    enabled: !!cliente?.id,
  });

  const obligacionesFiltradas = useMemo(() => {
    const all = query.data?.obligaciones ?? [];
    return all.filter((o) => {
      if (filtroTipo !== "todos" && o.tipo !== filtroTipo) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!`${o.nombre ?? ""} ${o.clave}`.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [query.data, filtroTipo, search]);

  // Modales
  const [dayModalDate, setDayModalDate] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ObligacionRow | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);

  const autogen = useMutation({
    mutationFn: () => autogenFn({ data: { clienteId: cliente!.id, year: refMonth.getFullYear() } }),
    onSuccess: (r) => {
      toast.success(`${r.inserted} obligaciones generadas`);
      qc.invalidateQueries({ queryKey: ["calendario"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al autogenerar"),
  });

  const exportCSV = () => {
    const rows = obligacionesFiltradas;
    const head = ["Nombre", "Clave", "Tipo", "Fecha límite", "Periodo", "Estatus", "Notas"];
    const csv = [
      head.join(","),
      ...rows.map((r) =>
        [r.nombre ?? r.clave, r.clave, r.tipo ?? "", r.proximo_vencimiento ?? "", r.periodo ?? "", r.estatus, (r.notas ?? "").replace(/[,\n]/g, " ")]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    triggerFileDownload(blob, safeFilename(`calendario-${cliente?.rfc ?? "expediente"}.csv`, "calendario.csv"));
  };

  return (
    <ToolShell
      title="Calendario fiscal"
      description="Visualiza y gestiona todas las obligaciones fiscales del expediente en un solo lugar."
      icon={<CalendarDays className="h-5 w-5 text-primary-foreground" />}
      requireCliente={true}
      helpSlug="calendario-fiscal"
    >
      {/* Barra de filtros y acciones */}
      <div className="rounded-xl border border-border/60 bg-card/40 p-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setRefMonth(new Date(refMonth.getFullYear(), refMonth.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[180px] text-center">
            <div className="text-sm font-medium capitalize">
              {periodMode === "anio"
                ? refMonth.getFullYear()
                : refMonth.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
            </div>
            <button onClick={() => setRefMonth(new Date())} className="text-[10px] text-primary hover:underline">
              Hoy
            </button>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setRefMonth(new Date(refMonth.getFullYear(), refMonth.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Periodo</Label>
          <Select value={periodMode} onValueChange={(v: any) => setPeriodMode(v)}>
            <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">Mes</SelectItem>
              <SelectItem value="anio">Año</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Tipo</Label>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {Object.entries(TIPO_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col flex-1 min-w-[180px]">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Buscar</Label>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ISR, IVA, DIOT..." className="h-9 pl-8" />
          </div>
        </div>

        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => setAlertOpen(true)}>
            <Bell className="h-4 w-4 mr-1.5" /> Alertas
          </Button>
          <Button variant="outline" size="sm" onClick={() => autogen.mutate()} disabled={autogen.isPending}>
            <Sparkles className="h-4 w-4 mr-1.5" /> {autogen.isPending ? "Generando..." : "Autogenerar año"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1.5" /> Exportar
          </Button>
          <Button variant="hero" size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Agregar obligación
          </Button>
        </div>
      </div>

      {/* Panel resumen */}
      <ResumenPanel data={query.data} loading={query.isLoading} />

      {/* Tabs Calendario / Lista */}
      <Tabs defaultValue="calendario" className="w-full">
        <TabsList>
          <TabsTrigger value="calendario">Calendario</TabsTrigger>
          <TabsTrigger value="lista">Lista</TabsTrigger>
        </TabsList>

        <TabsContent value="calendario" className="mt-4">
          <MonthCalendar
            refMonth={refMonth}
            obligaciones={obligacionesFiltradas}
            onDayClick={(iso) => setDayModalDate(iso)}
          />
        </TabsContent>

        <TabsContent value="lista" className="mt-4">
          <ListaObligaciones
            rows={obligacionesFiltradas}
            onEdit={(o) => { setEditing(o); setFormOpen(true); }}
            onComplete={(o) => completeRow(qc, o, cliente?.id ?? "")}
            onDelete={(o) => deleteRow(qc, o, cliente?.id ?? "")}
          />
        </TabsContent>
      </Tabs>

      <DayDetailDialog
        date={dayModalDate}
        rows={obligacionesFiltradas.filter((o) => o.proximo_vencimiento === dayModalDate)}
        onClose={() => setDayModalDate(null)}
        onComplete={(o) => completeRow(qc, o, cliente?.id ?? "")}
        onPostpone={(o, d) => postponeRow(qc, o, d, cliente?.id ?? "")}
        onEdit={(o) => { setEditing(o); setDayModalDate(null); setFormOpen(true); }}
      />

      <ObligacionFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
        editing={editing}
        clienteId={cliente?.id}
        onSaved={() => { setFormOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["calendario"] }); }}
      />

      <AlertConfigDialog
        open={alertOpen}
        onOpenChange={setAlertOpen}
        clienteId={cliente?.id}
      />
    </ToolShell>
  );
}

// =========================================================================
// SUBCOMPONENTES
// =========================================================================

function ResumenPanel({ data, loading }: { data: any; loading: boolean }) {
  const r = data?.resumen ?? { total: 0, vencidas: 0, proximas: 0, cumplidas: 0, sin_responsable: 0 };
  const tiles = [
    { label: "Total", value: r.total, color: "text-foreground", icon: CalendarDays },
    { label: "Vencidas", value: r.vencidas, color: "text-rose-500", icon: AlertTriangle },
    { label: "Próximas (≤5 días)", value: r.proximas, color: "text-amber-500", icon: Clock },
    { label: "Cumplidas", value: r.cumplidas, color: "text-emerald-500", icon: CheckCircle2 },
    { label: "Sin responsable", value: r.sin_responsable, color: "text-slate-400", icon: UserRound },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-border/60 bg-card/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.label}</span>
            <t.icon className={`h-3.5 w-3.5 ${t.color}`} />
          </div>
          <div className={`text-2xl font-semibold mt-1 ${t.color}`}>{loading ? "—" : t.value}</div>
        </div>
      ))}
      {data?.proximas && data.proximas.length > 0 && (
        <div className="col-span-2 md:col-span-5 rounded-xl border border-border/60 bg-card/40 p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Próximas obligaciones</div>
          <div className="grid md:grid-cols-3 gap-2">
            {data.proximas.map((o: ObligacionRow) => (
              <div key={o.id} className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${SEM_BG[semaforo(o)]}`} />
                <span className="font-medium">{o.nombre ?? o.clave}</span>
                <span className="text-muted-foreground text-xs ml-auto">{o.proximo_vencimiento}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MonthCalendar({
  refMonth,
  obligaciones,
  onDayClick,
}: {
  refMonth: Date;
  obligaciones: ObligacionRow[];
  onDayClick: (iso: string) => void;
}) {
  const year = refMonth.getFullYear();
  const month = refMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDow = (firstDay.getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const byDate = useMemo(() => {
    const m = new Map<string, ObligacionRow[]>();
    for (const o of obligaciones) {
      if (!o.proximo_vencimiento) continue;
      const arr = m.get(o.proximo_vencimiento) ?? [];
      arr.push(o);
      m.set(o.proximo_vencimiento, arr);
    }
    return m;
  }, [obligaciones]);

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl border border-border/60 bg-card/30 overflow-hidden">
      <div className="grid grid-cols-7 text-[10px] uppercase tracking-wider text-muted-foreground bg-card/60">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <div key={d} className="px-2 py-2 text-center border-b border-border/40">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[110px] border-b border-r border-border/30 bg-background/20" />;
          const iso = d.toISOString().slice(0, 10);
          const items = byDate.get(iso) ?? [];
          const isToday = iso === todayISO;
          return (
            <button
              key={i}
              onClick={() => items.length && onDayClick(iso)}
              className={`min-h-[110px] text-left border-b border-r border-border/30 p-1.5 hover:bg-accent/30 transition-colors ${isToday ? "bg-primary/5" : ""}`}
              aria-label={`Día ${d.getDate()}, ${items.length} obligaciones`}
            >
              <div className={`text-xs font-medium ${isToday ? "text-primary" : ""}`}>{d.getDate()}</div>
              <div className="mt-1 space-y-0.5">
                {items.slice(0, 3).map((o) => (
                  <div
                    key={o.id}
                    className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${TIPO_COLOR[o.tipo ?? "informativa"]}`}
                    title={o.nombre ?? o.clave}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${SEM_BG[semaforo(o)]} shrink-0`} />
                    <span className="truncate">{o.clave}</span>
                  </div>
                ))}
                {items.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">+{items.length - 3} más</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ListaObligaciones({
  rows,
  onEdit,
  onComplete,
  onDelete,
}: {
  rows: ObligacionRow[];
  onEdit: (o: ObligacionRow) => void;
  onComplete: (o: ObligacionRow) => void;
  onDelete: (o: ObligacionRow) => void;
}) {
  const [page, setPage] = useState(0);
  const PER = 20;
  const sorted = [...rows].sort((a, b) => (a.proximo_vencimiento ?? "").localeCompare(b.proximo_vencimiento ?? ""));
  const slice = sorted.slice(page * PER, (page + 1) * PER);
  const pages = Math.ceil(sorted.length / PER);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/30 p-10 text-center text-sm text-muted-foreground">
        No hay obligaciones para este filtro. Usa <span className="text-foreground">Autogenerar año</span> o <span className="text-foreground">Agregar obligación</span>.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/30 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-card/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Obligación</th>
              <th className="text-left px-3 py-2">Tipo</th>
              <th className="text-left px-3 py-2">Fecha límite</th>
              <th className="text-left px-3 py-2">Estatus</th>
              <th className="text-left px-3 py-2">Periodo</th>
              <th className="text-right px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((o) => {
              const sem = semaforo(o);
              return (
                <tr key={o.id} className="border-t border-border/40 hover:bg-accent/20">
                  <td className="px-3 py-2">
                    <div className="font-medium">{o.nombre ?? o.clave}</div>
                    {o.notas && <div className="text-xs text-muted-foreground truncate max-w-[280px]">{o.notas}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${TIPO_COLOR[o.tipo ?? "informativa"]}`}>
                      {TIPO_LABEL[o.tipo ?? "informativa"]}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{o.proximo_vencimiento ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${SEM_BG[sem]}`} />
                      <span className="capitalize text-xs">{o.estatus}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{o.periodo ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {o.estatus !== "presentada" && (
                        <Button size="sm" variant="ghost" onClick={() => onComplete(o)} title="Marcar como cumplida">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => onEdit(o)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onDelete(o)} title="Eliminar">
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between p-3 border-t border-border/40 text-xs text-muted-foreground">
          <div>{sorted.length} obligaciones</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
            <span>Página {page + 1} de {pages}</span>
            <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Siguiente</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DayDetailDialog({
  date,
  rows,
  onClose,
  onComplete,
  onPostpone,
  onEdit,
}: {
  date: string | null;
  rows: ObligacionRow[];
  onClose: () => void;
  onComplete: (o: ObligacionRow) => void;
  onPostpone: (o: ObligacionRow, newDate: string) => void;
  onEdit: (o: ObligacionRow) => void;
}) {
  if (!date) return null;
  const labelDate = new Date(date + "T00:00:00").toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return (
    <Dialog open={!!date} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="capitalize">{labelDate}</DialogTitle>
          <DialogDescription>{rows.length} obligación(es) con vencimiento este día.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {rows.map((o) => (
            <div key={o.id} className="rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${SEM_BG[semaforo(o)]}`} />
                    <div className="font-medium">{o.nombre ?? o.clave}</div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${TIPO_COLOR[o.tipo ?? "informativa"]}`}>
                      {TIPO_LABEL[o.tipo ?? "informativa"]}
                    </span>
                  </div>
                  {o.notas && <div className="text-xs text-muted-foreground mt-1">{o.notas}</div>}
                  <div className="text-xs text-muted-foreground mt-1">Estatus: <span className="capitalize">{o.estatus}</span> · Periodo: {o.periodo ?? "—"}</div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {o.estatus !== "presentada" && (
                    <Button size="sm" variant="hero" onClick={() => onComplete(o)}>Completar</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => {
                    const next = prompt("Posponer al (AAAA-MM-DD):", o.proximo_vencimiento ?? "");
                    if (next && /^\d{4}-\d{2}-\d{2}$/.test(next)) onPostpone(o, next);
                  }}>Posponer</Button>
                  <Button size="sm" variant="ghost" onClick={() => onEdit(o)}>Editar</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ObligacionFormDialog({
  open,
  onOpenChange,
  editing,
  clienteId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: ObligacionRow | null;
  clienteId: string | undefined;
  onSaved: () => void;
}) {
  const upsertFn = useServerFn(upsertObligacion);
  const equipoFn = useServerFn(listEquipoDespacho);
  const [nombre, setNombre] = useState(editing?.nombre ?? "");
  const [clave, setClave] = useState(editing?.clave ?? "");
  const [tipo, setTipo] = useState<string>(editing?.tipo ?? "mensual");
  const [periodicidad, setPeriodicidad] = useState<string>(editing?.periodicidad ?? "mensual");
  const [fecha, setFecha] = useState(editing?.proximo_vencimiento ?? "");
  const [periodo, setPeriodo] = useState(editing?.periodo ?? "");
  const [responsable, setResponsable] = useState<string>(editing?.responsable_user_id ?? "none");
  const [notas, setNotas] = useState(editing?.notas ?? "");
  const [alertDays, setAlertDays] = useState<number>(editing?.alert_days_before ?? 5);

  // refetch on open + reset values when editing changes
  useMemo(() => {
    if (open) {
      setNombre(editing?.nombre ?? "");
      setClave(editing?.clave ?? "");
      setTipo(editing?.tipo ?? "mensual");
      setPeriodicidad(editing?.periodicidad ?? "mensual");
      setFecha(editing?.proximo_vencimiento ?? "");
      setPeriodo(editing?.periodo ?? "");
      setResponsable(editing?.responsable_user_id ?? "none");
      setNotas(editing?.notas ?? "");
      setAlertDays(editing?.alert_days_before ?? 5);
    }
  }, [open, editing]);

  const equipo = useQuery({
    queryKey: ["equipo-despacho"],
    queryFn: () => equipoFn(),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw new Error("Selecciona un expediente");
      if (!nombre.trim()) throw new Error("El nombre es obligatorio");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Fecha límite inválida (AAAA-MM-DD)");
      // Nota: se permiten fechas pasadas (registro histórico de obligaciones ya vencidas / cumplidas).
      return upsertFn({
        data: {
          id: editing?.id,
          clienteId,
          nombre: nombre.trim(),
          clave: (clave.trim() || nombre.trim().toUpperCase().slice(0, 12)),
          tipo: tipo as any,
          periodicidad: periodicidad as any,
          proximo_vencimiento: fecha,
          periodo: periodo || undefined,
          responsable_user_id: responsable === "none" ? null : responsable,
          notas: notas || null,
          alert_days_before: alertDays,
        },
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Obligación actualizada" : "Obligación creada");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al guardar"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar obligación" : "Nueva obligación"}</DialogTitle>
          <DialogDescription>Define una obligación fiscal o laboral para este expediente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre *</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Pago provisional ISR" maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Clave</Label>
              <Input value={clave} onChange={(e) => setClave(e.target.value)} placeholder="ISR_MENS" maxLength={40} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Periodicidad</Label>
              <Select value={periodicidad} onValueChange={setPeriodicidad}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensual">Mensual</SelectItem>
                  <SelectItem value="bimestral">Bimestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha límite *</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Periodo (AAAA-MM o AAAA)</Label>
              <Input value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="2026-06" maxLength={10} />
            </div>
            <div>
              <Label>Días de alerta previa</Label>
              <Input type="number" min={0} max={60} value={alertDays} onChange={(e) => setAlertDays(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label>Responsable</Label>
            <Select value={responsable} onValueChange={setResponsable}>
              <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {(equipo.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={notas ?? ""} onChange={(e) => setNotas(e.target.value)} rows={3} maxLength={2000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="hero" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Guardando..." : (editing ? "Guardar cambios" : "Crear obligación")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlertConfigDialog({
  open, onOpenChange, clienteId,
}: { open: boolean; onOpenChange: (v: boolean) => void; clienteId: string | undefined }) {
  const getFn = useServerFn(getAlertConfig);
  const updFn = useServerFn(updateAlertConfig);
  const cfg = useQuery({
    queryKey: ["alert-config", clienteId],
    queryFn: () => getFn({ data: { clienteId: clienteId! } }),
    enabled: open && !!clienteId,
  });
  const [days, setDays] = useState(5);
  const [chs, setChs] = useState<string[]>(["interna"]);
  useMemo(() => {
    if (cfg.data) {
      setDays(cfg.data.alert_days_default);
      setChs(cfg.data.alert_channels_default);
    }
  }, [cfg.data]);

  const save = useMutation({
    mutationFn: () => updFn({ data: { clienteId: clienteId!, alert_days_default: days, alert_channels_default: chs as any } }),
    onSuccess: () => { toast.success("Configuración guardada"); onOpenChange(false); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const toggleCh = (c: string) => {
    setChs((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configuración de alertas</DialogTitle>
          <DialogDescription>Define con cuántos días de anticipación y por qué medios alertar a este expediente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Días de anticipación por defecto</Label>
            <Input type="number" min={0} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground mt-1">Aplica a las nuevas obligaciones que se generen.</p>
          </div>
          <div>
            <Label>Canales</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                { k: "interna", l: "Notificación interna" },
                { k: "correo", l: "Correo" },
                { k: "whatsapp", l: "WhatsApp" },
              ].map((c) => (
                <button
                  key={c.k}
                  onClick={() => toggleCh(c.k)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    chs.includes(c.k)
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-card/40 border-border text-muted-foreground"
                  }`}
                >
                  {c.l}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Las alertas internas se muestran en la campana del despacho. Correo y WhatsApp requieren tener configurados los canales del cliente.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="hero" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================================
// MUTACIONES INLINE
// =========================================================================

function completeRow(qc: ReturnType<typeof useQueryClient>, o: ObligacionRow, clienteId: string) {
  setEstatusObligacion({ data: { id: o.id, clienteId, estatus: "presentada" } })
    .then(() => {
      toast.success("Obligación marcada como cumplida");
      qc.invalidateQueries({ queryKey: ["calendario"] });
    })
    .catch((e: any) => toast.error(e?.message ?? "Error"));
}
function postponeRow(qc: ReturnType<typeof useQueryClient>, o: ObligacionRow, d: string, clienteId: string) {
  posponerObligacion({ data: { id: o.id, clienteId, nuevaFecha: d } })
    .then(() => {
      toast.success("Obligación pospuesta");
      qc.invalidateQueries({ queryKey: ["calendario"] });
    })
    .catch((e: any) => toast.error(e?.message ?? "Error"));
}
function deleteRow(qc: ReturnType<typeof useQueryClient>, o: ObligacionRow, clienteId: string) {
  if (!confirm(`¿Eliminar "${o.nombre ?? o.clave}"?`)) return;
  eliminarObligacion({ data: { id: o.id, clienteId } })
    .then(() => {
      toast.success("Obligación eliminada");
      qc.invalidateQueries({ queryKey: ["calendario"] });
    })
    .catch((e: any) => toast.error(e?.message ?? "Error"));
}
