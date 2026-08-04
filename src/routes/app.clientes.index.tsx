import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, Search, UserRound, X, FileBadge, Upload, Lock,
  LayoutGrid, Table as TableIcon, ShieldAlert, FileText, Bell, Sparkles, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listClientes, createCliente, deleteCliente } from "@/lib/clientes.functions";
import { listExpedientes, type Expediente } from "@/lib/expedientes/expedientes.functions";
import { useActiveCliente } from "@/lib/active-cliente";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { usePuedeCrearExpediente } from "@/lib/entitlements/use-entitlements";

export const Route = createFileRoute("/app/clientes/")({
  component: ClientesPage,
});

type ViewMode = "tabla" | "cards";
type Semaforo = "todos" | "rojo" | "amarillo" | "verde";

function fmtMoney(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}
function riesgoColor(score: number) {
  if (score >= 67) return { dot: "bg-red-500", text: "text-red-600 dark:text-red-300", label: "Alto" };
  if (score >= 34) return { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-300", label: "Medio" };
  return { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-300", label: "Bajo" };
}

function ClientesPage() {
  const fetchList = useServerFn(listClientes);
  const fetchExpedientes = useServerFn(listExpedientes);
  const create = useServerFn(createCliente);
  const remove = useServerFn(deleteCliente);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { cliente: active, setCliente } = useActiveCliente();
  // Candado de cuota calculado en el servidor (el backend lo revalida al crear).
  const cuotaQ = usePuedeCrearExpediente();
  const cuotaBloqueada = cuotaQ.data ? !cuotaQ.data.permitido : false;
  const [openForm, setOpenForm] = useState(false);
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "tabla";
    return (localStorage.getItem("cc.expedientes.view") as ViewMode) || "tabla";
  });
  const [semaforo, setSemaforo] = useState<Semaforo>("todos");
  const [toDelete, setToDelete] = useState<{ id: string; rfc: string; razon: string } | null>(null);

  const setViewPersist = (v: ViewMode) => {
    setView(v);
    try { localStorage.setItem("cc.expedientes.view", v); } catch { /* ignore */ }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => fetchList(),
  });

  // Solo cargamos los KPIs ricos cuando estamos en vista de tarjetas o
  // hay un filtro por semáforo activo (que sólo aplica con esos datos).
  const expedientesQ = useQuery({
    queryKey: ["expedientes"],
    queryFn: () => fetchExpedientes(),
    enabled: view === "cards" || semaforo !== "todos",
  });

  const createMut = useMutation({
    mutationFn: (input: any) => create({ data: input }),
    onSuccess: (row) => {
      toast.success("Expediente creado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["expedientes"] });
      qc.invalidateQueries({ queryKey: ["rfcs-vinculados"] });
      qc.invalidateQueries({ queryKey: ["usage"] });
      qc.invalidateQueries({ queryKey: ["entitlements"] });
      setOpenForm(false);
      setCliente({ id: row.id, rfc: row.rfc, razon_social: row.razon_social, regimen_fiscal: row.regimen_fiscal });
    },
    onError: (e: Error) => toast.error(e.message ?? "No se pudo crear"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (_v, id) => {
      toast.success("Expediente eliminado");
      qc.invalidateQueries({ queryKey: ["entitlements"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["expedientes"] });
      qc.invalidateQueries({ queryKey: ["rfcs-vinculados"] });
      qc.invalidateQueries({ queryKey: ["usage"] });
      if (active?.id === id) setCliente(null);
    },
  });

  const expedientesById = useMemo(() => {
    const map = new Map<string, Expediente>();
    for (const e of expedientesQ.data?.items ?? []) map.set(e.id, e);
    return map;
  }, [expedientesQ.data]);

  const clientes = (data?.clientes ?? []).filter((c) => {
    if (q) {
      const s = q.toLowerCase();
      if (!(c.rfc.toLowerCase().includes(s) || c.razon_social.toLowerCase().includes(s))) return false;
    }
    if (semaforo !== "todos") {
      const exp = expedientesById.get(c.id);
      if (!exp || (exp.semaforo ?? "amarillo") !== semaforo) return false;
    }
    return true;
  });
  const canManageExpedientes = !!data?.canManageExpedientes;

  const kpis = useMemo(() => {
    const items = expedientesQ.data?.items ?? [];
    return {
      total: items.length,
      riesgo: items.filter((i) => i.riesgo >= 67).length,
      alertas: items.reduce((a, b) => a + b.alertas_altas, 0),
      ingresos: items.reduce((a, b) => a + b.ingresos_mes, 0),
    };
  }, [expedientesQ.data]);

  const activate = (c: { id: string; rfc: string; razon_social: string; regimen_fiscal: string | null }) => {
    setCliente({ id: c.id, rfc: c.rfc, razon_social: c.razon_social, regimen_fiscal: c.regimen_fiscal });
    toast.success(`Expediente activo: ${c.razon_social}`);
    navigate({ to: "/app" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Expedientes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cada expediente es un RFC sobre el que ejecutas las herramientas.{" "}
            {isLoading ? (
              <span className="inline-block h-3 w-10 align-middle rounded bg-muted/50 animate-pulse" />
            ) : (
              <>{data?.clientes.length ?? 0} en total.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex h-10 rounded-md border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setViewPersist("tabla")}
              className={`inline-flex items-center gap-1.5 px-3 text-sm transition-colors ${view === "tabla" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              aria-pressed={view === "tabla"}
            >
              <TableIcon className="h-4 w-4" /> Tabla
            </button>
            <button
              type="button"
              onClick={() => setViewPersist("cards")}
              className={`inline-flex items-center gap-1.5 px-3 text-sm transition-colors border-l border-border ${view === "cards" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              aria-pressed={view === "cards"}
            >
              <LayoutGrid className="h-4 w-4" /> Tarjetas
            </button>
          </div>
          <HerramientaHelp slug="expedientes" />
          {canManageExpedientes && (
            <Link to="/app/tools/import-clientes" className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-border bg-card hover:bg-accent text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <Upload className="h-4 w-4" /> Importar Excel
            </Link>
          )}
          <Link to="/app/rfcs-vinculados" className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-border bg-card hover:bg-accent text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <FileBadge className="h-4 w-4" /> RFC vinculados
          </Link>
          {canManageExpedientes && (
            <Button
              variant="hero"
              type="button"
              disabled={cuotaBloqueada}
              title={cuotaQ.data?.motivo ?? undefined}
              onPointerDown={(e) => {
                if (e.button !== 0 || cuotaBloqueada) return;
                setOpenForm((v) => !v);
              }}
              onClick={(e) => e.preventDefault()}
            >
              {openForm ? <><X className="h-4 w-4" /> Cancelar</> : <><Plus className="h-4 w-4" /> Nuevo expediente</>}
            </Button>
          )}
        </div>
      </div>

      {canManageExpedientes && cuotaBloqueada && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 flex items-start gap-3">
          <Lock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">No puedes dar de alta más expedientes</p>
            <p className="text-muted-foreground mt-0.5">{cuotaQ.data?.motivo}</p>
            <p className="text-muted-foreground mt-1">
              Uso actual: <strong>{cuotaQ.data?.usado}</strong> de{" "}
              <strong>{cuotaQ.data?.ilimitado ? "ilimitados" : cuotaQ.data?.limite}</strong> RFC.
              Los expedientes de demostración no cuentan.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Link
                to="/precios"
                className="inline-flex items-center h-8 px-3 rounded-md bg-warning text-warning-foreground text-xs font-semibold"
              >
                Ver planes
              </Link>
              <Link
                to="/app/configuracion"
                className="inline-flex items-center h-8 px-3 rounded-md border border-border text-xs font-medium"
              >
                Revisar mi uso
              </Link>
            </div>
          </div>
        </div>
      )}

      {canManageExpedientes && (
        <div hidden={!openForm || cuotaBloqueada}>
          <NewClienteForm onSubmit={(d) => createMut.mutate(d)} loading={createMut.isPending} />
        </div>
      )}

      {(view === "cards" || semaforo !== "todos") && (expedientesQ.data?.items.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Expedientes" value={kpis.total.toString()} />
          <KPI label="En riesgo alto" value={kpis.riesgo.toString()} tone={kpis.riesgo > 0 ? "danger" : "muted"} />
          <KPI label="Alertas críticas" value={kpis.alertas.toString()} tone={kpis.alertas > 0 ? "warn" : "muted"} />
          <KPI label="Ingresos del mes" value={fmtMoney(kpis.ingresos)} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o RFC..."
            className="w-full pl-9 pr-3 h-10 rounded-lg bg-input/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {(["todos", "rojo", "amarillo", "verde"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setSemaforo(f)}
            className={`h-10 px-3 text-xs rounded-md border transition-colors ${
              semaforo === f ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "todos" ? "Todos" : f === "rojo" ? "Riesgo alto" : f === "amarillo" ? "Atención" : "Al corriente"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border/60 bg-card/50 p-10 text-center text-sm text-muted-foreground">Cargando...</div>
      ) : clientes.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/50 p-12 text-center">
          <UserRound className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <div className="font-medium">{q || semaforo !== "todos" ? "No hay coincidencias" : "Aún no tienes expedientes"}</div>
          <p className="text-sm text-muted-foreground mt-1">
            {q || semaforo !== "todos" ? "Prueba con otro filtro." : "Crea tu primer expediente para empezar a usar las herramientas."}
          </p>
        </div>
      ) : view === "tabla" ? (
        <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left font-medium px-5 py-3">Razón social</th>
                <th className="text-left font-medium px-5 py-3">RFC</th>
                <th className="text-left font-medium px-5 py-3">Régimen</th>
                <th className="text-right font-medium px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => {
                const isActive = active?.id === c.id;
                return (
                  <tr key={c.id} className={`border-t border-border/30 ${isActive ? "bg-primary/5" : "hover:bg-accent/5"}`}>
                    <td className="px-5 py-3.5 font-medium">{c.razon_social}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{c.rfc}</td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">{c.regimen_fiscal ?? "—"}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-2">
                        {isActive ? (
                          <span className="text-xs px-2 py-1 rounded-md bg-primary/15 text-primary">Activo</span>
                        ) : (
                          <button
                            onClick={() => setCliente({ id: c.id, rfc: c.rfc, razon_social: c.razon_social, regimen_fiscal: c.regimen_fiscal })}
                            className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/40"
                          >
                            Activar
                          </button>
                        )}
                        <Link to="/app/clientes/$id" params={{ id: c.id }} className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/40">
                          Ficha · SAT
                        </Link>
                        <Link to="/app/tools" className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/40">
                          Herramientas
                        </Link>
                        {canManageExpedientes && (
                          <button
                            onClick={() => setToDelete({ id: c.id, rfc: c.rfc, razon: c.razon_social })}
                            className="text-xs px-2 py-1 rounded-md text-destructive hover:bg-destructive/10"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-4">
          {clientes.map((c) => {
            const exp = expedientesById.get(c.id);
            const r = riesgoColor(exp?.riesgo ?? 35);
            const isActive = active?.id === c.id;
            return (
              <div
                key={c.id}
                className={`group rounded-xl border bg-card transition-all p-5 ${isActive ? "border-primary/60 shadow-[var(--shadow-card)]" : "border-border hover:border-primary/40 hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5"}`}
              >
                <button onClick={() => activate(c)} className="text-left w-full">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                      <UserRound className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate flex items-center gap-2">
                        {c.razon_social}
                        {isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">Activo</span>}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground mt-0.5">{c.rfc}</div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">{c.regimen_fiscal ?? "—"}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                  {exp ? (
                    <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-3">
                      <Stat icon={<ShieldAlert className="h-3 w-3" />} label="Riesgo SAT">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${r.dot}`} />
                          <span className={`text-sm font-medium ${r.text}`}>{exp.riesgo}/100 · {r.label}</span>
                        </span>
                      </Stat>
                      <Stat icon={<Bell className="h-3 w-3" />} label="Alertas">
                        <span className="text-sm">
                          {exp.alertas_altas > 0 ? (
                            <span className="text-red-600 dark:text-red-300 font-medium">{exp.alertas_altas} crítica{exp.alertas_altas > 1 ? "s" : ""}</span>
                          ) : exp.alertas_total > 0 ? (
                            <span className="text-amber-600 dark:text-amber-300">{exp.alertas_total} pendiente{exp.alertas_total > 1 ? "s" : ""}</span>
                          ) : (
                            <span className="text-muted-foreground">Sin alertas</span>
                          )}
                        </span>
                      </Stat>
                      <Stat icon={<FileText className="h-3 w-3" />} label="CFDI">
                        <span className="text-sm">{exp.cfdi_count} · {exp.ultimo_cfdi ? new Date(exp.ultimo_cfdi).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—"}</span>
                      </Stat>
                      <Stat icon={<Sparkles className="h-3 w-3" />} label="Ingresos mes">
                        <span className="text-sm tabular-nums">{fmtMoney(exp.ingresos_mes)}</span>
                      </Stat>
                    </div>
                  ) : expedientesQ.isLoading ? (
                    <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground">Cargando métricas…</div>
                  ) : null}
                </button>
                <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-2">
                  <Link to="/app/clientes/$id" params={{ id: c.id }} className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/40">
                    Ficha · SAT
                  </Link>
                  <Link to="/app/tools" className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/40">
                    Herramientas
                  </Link>
                  {canManageExpedientes && (
                    <button
                      onClick={() => setToDelete({ id: c.id, rfc: c.rfc, razon: c.razon_social })}
                      className="text-xs px-2 py-1 rounded-md text-destructive hover:bg-destructive/10 ml-auto"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        loading={deleteMut.isPending}
        title="Eliminar expediente"
        expected={toDelete?.rfc ?? ""}
        warning="Se eliminarán también los CFDI, movimientos y demás datos asociados a este expediente. Esta acción no se puede deshacer."
        description={
          <>
            Estás a punto de eliminar el expediente{" "}
            <span className="font-semibold">{toDelete?.razon}</span> (RFC{" "}
            <span className="font-mono">{toDelete?.rfc}</span>).
          </>
        }
        onConfirm={() => {
          if (toDelete) deleteMut.mutate(toDelete.id, { onSuccess: () => setToDelete(null) });
        }}
      />
    </div>
  );
}

const REGIMENES = [
  "601 - General de Ley Personas Morales",
  "603 - Personas Morales con Fines no Lucrativos",
  "605 - Sueldos y Salarios e Ingresos Asimilados a Salarios",
  "606 - Arrendamiento",
  "608 - Demás ingresos",
  "612 - Personas Físicas con Actividades Empresariales y Profesionales",
  "621 - Incorporación Fiscal",
  "625 - Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  "626 - RESICO Personas Morales",
  "626 - RESICO Personas Físicas",
];

function NewClienteForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [rfc, setRfc] = useState("");
  const [razon, setRazon] = useState("");
  const [regimen, setRegimen] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ rfc, razon_social: razon, regimen_fiscal: regimen || null, email: email || null, telefono: tel || null });
      }}
      className="rounded-xl border border-border/60 bg-card/50 p-5 grid sm:grid-cols-2 gap-3"
    >
      <Field label="RFC*">
        <input required value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} placeholder="XAXX010101000" className="input-ctrl font-mono" />
      </Field>
      <Field label="Razón social*">
        <input required value={razon} onChange={(e) => setRazon(e.target.value)} placeholder="Servicios García SA de CV" className="input-ctrl" />
      </Field>
      <Field label="Régimen fiscal">
        <select value={regimen} onChange={(e) => setRegimen(e.target.value)} className="input-ctrl">
          <option value="">Selecciona...</option>
          {REGIMENES.map((r) => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Email contacto">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contacto@empresa.mx" className="input-ctrl" />
      </Field>
      <Field label="Teléfono">
        <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="+52 ..." className="input-ctrl" />
      </Field>
      <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
        <Button type="submit" variant="hero" disabled={loading}>
          {loading ? "Creando..." : "Crear expediente"}
        </Button>
      </div>
      <style>{`.input-ctrl { height:38px; padding:0 12px; border-radius:8px; background:hsl(var(--input) / 0.5); border:1px solid hsl(var(--border)); font-size:14px; outline:none; width:100%; } .input-ctrl:focus { box-shadow:0 0 0 1px hsl(var(--ring)); }`}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function KPI({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "danger" | "warn" }) {
  const color = tone === "danger" ? "text-red-600 dark:text-red-300" : tone === "warn" ? "text-amber-600 dark:text-amber-300" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">{icon} {label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
