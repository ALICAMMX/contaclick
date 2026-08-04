// Dashboard — Descarga Masiva SAT (Prompt 5)
// KPIs + actividad reciente + clientes desconectados / con errores + novedades.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  RefreshCw, ShieldCheck, AlertTriangle, FileStack, Clock, PlugZap, Loader2,
  Pause, Play, Settings as SettingsIcon, ArrowLeft, Ban, Wallet,
} from "lucide-react";
import { dashboardSatSync, runSyncNow, listSyncRuns, listSyncEventos, setSyncActivo, getSatSyncConfig, upsertSatSyncConfig, estadoServicioSat } from "@/lib/sat/sat-sync.functions";
import { useActiveCliente } from "@/lib/active-cliente";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { HerramientaHelp } from "@/components/HerramientaHelp";

export const Route = createFileRoute("/app/sat-sync")({ component: SatSyncPage });

function fmtFecha(s?: string | null) { return s ? new Date(s).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—"; }
function fmtRel(s?: string | null) {
  if (!s) return "Nunca";
  const diff = Date.now() - new Date(s).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `hace ${Math.floor(diff / 60000)} min`;
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function SatSyncPage() {
  const [tab, setTab] = useState<"dashboard" | "actividad" | "novedades" | "config">("dashboard");
  const { cliente, hydrating } = useActiveCliente();
  const fnDash = useServerFn(dashboardSatSync);
  const dash = useQuery({
    enabled: !hydrating && !!cliente?.id,
    queryKey: ["sat-sync", "dash", cliente?.id],
    queryFn: () => fnDash({ data: { cliente_id: cliente!.id } }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link to="/app/contable" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a Contable y Fiscal
        </Link>
        <div className="flex items-center gap-2">
          <HerramientaHelp slug="sat-sync" />
          <Button variant="outline" size="sm" onClick={() => dash.refetch()} disabled={dash.isFetching}>
            {dash.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Actualizar</span>
          </Button>
        </div>
      </div>

      <div>
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary mb-2">
          <span className="h-1 w-6 bg-primary" /> Sincronización automática
        </div>
        <h1 className="serif text-3xl text-foreground">Descarga Masiva SAT</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Motor de actualización fiscal. Descarga CFDI emitidos, recibidos, nómina, pagos y retenciones de forma
          automática, detecta novedades y ejecuta los módulos en cascada.
        </p>
      </div>

      <nav className="flex gap-1 border-b border-border">
        {([
          ["dashboard", "Dashboard"],
          ["actividad", "Actividad"],
          ["novedades", "Novedades"],
          ["config", "Sincronización SAT"],
        ] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {l}
          </button>
        ))}
      </nav>

      {!cliente ? (
        hydrating ? <div className="text-sm text-muted-foreground">Cargando expediente activo…</div> : <SinExpediente />
      ) : (
        <>
          {tab === "dashboard" && <DashboardTab d={dash.data} loading={dash.isLoading} />}
          {tab === "actividad" && <ActividadTab clienteId={cliente.id} />}
          {tab === "novedades" && <NovedadesTab clienteId={cliente.id} />}
          {tab === "config" && <ConfigTab />}
        </>
      )}
    </div>
  );
}

function SinExpediente() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <h2 className="text-base font-medium text-foreground">Selecciona un expediente</h2>
      <p className="text-sm text-muted-foreground mt-1">
        Esta pantalla solo muestra información del expediente activo. Elige uno en la barra superior.
      </p>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, tone }: any) {
  const toneCls = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-warning" : tone === "ok" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className={`text-2xl font-semibold mt-2 ${toneCls}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function DashboardTab({ d, loading }: { d: any; loading: boolean }) {
  if (loading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (!d) return <div className="text-sm text-muted-foreground">Sin datos.</div>;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Kpi icon={PlugZap} label="RFC conectados" value={d.conectados} tone="ok" />
        <Kpi icon={Clock} label="Última sincronización" value={fmtRel(d.ultima)} hint={fmtFecha(d.ultima)} />
        <Kpi icon={FileStack} label="Corridas hoy" value={d.hoy} />
        <Kpi icon={ShieldCheck} label="CFDI nuevos hoy" value={d.nuevos} tone="ok" />
        <Kpi icon={AlertTriangle} label="Errores (7d)" value={d.errores} tone={d.errores > 0 ? "danger" : undefined} />
        <Kpi icon={RefreshCw} label="Pendientes de sincronizar" value={d.pendientes} tone={d.pendientes > 0 ? "warn" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-medium mb-3">Actividad reciente</h3>
          {d.actividad.length === 0 && <div className="text-xs text-muted-foreground">Sin corridas aún.</div>}
          <ul className="space-y-2 text-sm">
            {d.actividad.slice(0, 10).map((r: any) => (
              <li key={r.id} className="flex items-center justify-between border-b border-border/40 pb-1.5">
                <div>
                  <div className="font-medium">{r.clientes?.rfc ?? r.cliente_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{fmtFecha(r.iniciado_at)} · {r.descargados} XML</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.estatus === "exitoso" ? "bg-success/15 text-success" : r.estatus === "error" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>
                  {r.estatus}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-medium mb-3">Centro de incidencias</h3>
          {d.conErrores.length === 0 && d.desconectados.length === 0 && <div className="text-xs text-muted-foreground">Todo en orden.</div>}
          <ul className="space-y-2 text-sm">
            {d.conErrores.map((c: any) => (
              <li key={c.cliente_id} className="flex items-start justify-between gap-3 border-b border-border/40 pb-1.5">
                <div>
                  <div className="font-medium">{c.clientes?.rfc}</div>
                  <div className="text-xs text-destructive">{c.last_error?.slice(0, 80)}</div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-destructive">error</span>
              </li>
            ))}
            {d.desconectados.map((c: any) => (
              <li key={c.cliente_id} className="flex items-start justify-between gap-3 border-b border-border/40 pb-1.5">
                <div>
                  <div className="font-medium">{c.clientes?.rfc}</div>
                  <div className="text-xs text-muted-foreground">{c.last_error?.slice(0, 80) ?? "Credencial inactiva"}</div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-warning">{c.estatus}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-medium mb-3">Novedades recientes</h3>
        {d.novedades.length === 0 ? (
          <div className="text-xs text-muted-foreground">Sin novedades.</div>
        ) : (
          <ul className="text-sm divide-y divide-border/40">
            {d.novedades.map((n: any) => (
              <li key={n.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{n.clientes?.rfc} · {n.uuid_cfdi?.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{n.mensaje}</div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-primary">{n.tipo}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ActividadTab({ clienteId }: { clienteId: string }) {
  const fn = useServerFn(listSyncRuns);
  const q = useQuery({ queryKey: ["sat-sync", "runs", clienteId], enabled: !!clienteId, queryFn: () => fn({ data: { cliente_id: clienteId, limit: 100 } }) });
  const rows = q.data ?? [];
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left p-3">Fecha</th><th className="text-left p-3">RFC</th>
            <th className="text-left p-3">Origen</th><th className="text-left p-3">Rango</th>
            <th className="text-right p-3">XML</th><th className="text-right p-3">Nuevos</th>
            <th className="text-right p-3">Errores</th><th className="text-left p-3">Duración</th>
            <th className="text-left p-3">Estatus</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} className="border-t border-border/40">
              <td className="p-3">{fmtFecha(r.iniciado_at)}</td>
              <td className="p-3 font-mono text-xs">{r.clientes?.rfc ?? "—"}</td>
              <td className="p-3 text-xs">{r.origen}</td>
              <td className="p-3 text-xs">{r.desde} → {r.hasta}</td>
              <td className="p-3 text-right">{r.descargados}</td>
              <td className="p-3 text-right text-success">{r.nuevos}</td>
              <td className="p-3 text-right">{Array.isArray(r.errores) ? r.errores.length : 0}</td>
              <td className="p-3 text-xs">{r.duracion_ms != null ? `${r.duracion_ms} ms` : "—"}</td>
              <td className="p-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.estatus === "exitoso" ? "bg-success/15 text-success" : r.estatus === "error" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>
                  {r.estatus}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground text-sm">Sin actividad registrada.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function NovedadesTab({ clienteId }: { clienteId: string }) {
  const fn = useServerFn(listSyncEventos);
  const q = useQuery({ queryKey: ["sat-sync", "eventos", clienteId], enabled: !!clienteId, queryFn: () => fn({ data: { cliente_id: clienteId, limit: 100 } }) });
  const rows = q.data ?? [];
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
          <tr><th className="text-left p-3">Fecha</th><th className="text-left p-3">RFC</th><th className="text-left p-3">Tipo</th><th className="text-left p-3">UUID</th><th className="text-right p-3">Monto</th><th className="text-left p-3">Detalle</th></tr>
        </thead>
        <tbody>
          {rows.map((n: any) => (
            <tr key={n.id} className="border-t border-border/40">
              <td className="p-3">{fmtFecha(n.created_at)}</td>
              <td className="p-3 font-mono text-xs">{n.clientes?.rfc ?? "—"}</td>
              <td className="p-3"><span className="text-[10px] uppercase tracking-wider text-primary">{n.tipo}</span></td>
              <td className="p-3 font-mono text-xs">{n.uuid_cfdi?.slice(0, 18)}</td>
              <td className="p-3 text-right">{n.monto != null ? `$${Number(n.monto).toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "—"}</td>
              <td className="p-3 text-xs text-muted-foreground">{n.mensaje}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-sm">Sin novedades.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ConfigTab() {
  const { cliente } = useActiveCliente();
  if (!cliente) return <div className="text-sm text-muted-foreground">Selecciona un expediente activo para configurar su sincronización.</div>;
  return <ConfigExpediente clienteId={cliente.id} rfc={cliente.rfc} />;
}

function EstadoServicio({ q }: { q: any }) {
  if (q.isLoading) {
    return (
      <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 animate-pulse space-y-2">
        <div className="h-3 w-48 bg-muted rounded" />
        <div className="h-3 w-72 bg-muted rounded" />
      </div>
    );
  }
  const e = q.data;
  if (!e) return null;
  const ok = e.puede_ejecutar;
  return (
    <div
      className={`mt-4 rounded-lg border p-3 text-xs space-y-1.5 ${
        ok ? "border-border bg-muted/20" : "border-destructive/40 bg-destructive/10"
      }`}
    >
      <div className="flex items-center gap-2 font-medium text-foreground">
        <Wallet className="h-3.5 w-3.5" />
        Costo estimado de esta corrida: {e.previstas} solicitud(es) SAT
        <span className="text-muted-foreground font-normal">
          · {e.rango.desde} → {e.rango.hasta}
        </span>
      </div>
      <div className="text-muted-foreground">
        Cuota del plan: {e.cuota.usado}
        {e.cuota.ilimitado ? " (ilimitada)" : ` de ${e.cuota.limite} · quedan ${e.cuota.restante}`}
        {e.es_sandbox && " · expediente de demostración (no consume saldo real)"}
      </div>
      {e.servicio && (
        <div className="text-muted-foreground">
          Servicio PAC (visible sólo para administración): {e.servicio.disponible} disponibles ·{" "}
          {e.servicio.reservado} reservadas · nivel {e.servicio.nivel}
        </div>
      )}
      {!ok && (
        <div className="flex items-start gap-2 text-destructive pt-1">
          <Ban className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{e.motivo}</span>
        </div>
      )}
    </div>
  );
}

export function ConfigExpediente({ clienteId, rfc }: { clienteId: string; rfc?: string }) {
  const qc = useQueryClient();
  const fnGet = useServerFn(getSatSyncConfig);
  const fnUp = useServerFn(upsertSatSyncConfig);
  const fnRun = useServerFn(runSyncNow);
  const fnPause = useServerFn(setSyncActivo);
  const fnRuns = useServerFn(listSyncRuns);

  const fnEstado = useServerFn(estadoServicioSat);
  const cfgQ = useQuery({ queryKey: ["sat-sync", "cfg", clienteId], enabled: !!clienteId, queryFn: () => fnGet({ data: { cliente_id: clienteId } }) });
  // Superficie única del candado: la UI refleja el estado que calcula el backend
  // (cuota del plan + saldo operativo del servicio). Se refresca sola tras recargas.
  const estadoQ = useQuery({
    queryKey: ["sat-sync", "estado", clienteId],
    enabled: !!clienteId,
    queryFn: () => fnEstado({ data: { cliente_id: clienteId } }),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  const estado = estadoQ.data;
  const bloqueado = !!estado && !estado.puede_ejecutar;
  const runsQ = useQuery({ queryKey: ["sat-sync", "runs-cli", clienteId], enabled: !!clienteId, queryFn: () => fnRuns({ data: { cliente_id: clienteId, limit: 10 } }) });

  const cfg = cfgQ.data;
  const [form, setForm] = useState<any>(null);
  const f = form ?? cfg ?? {
    emitidos: true, recibidos: true, nomina: true, pagos: true, retenciones: false,
    frecuencia: "diaria", periodo: "mes_actual", fecha_desde: null, fecha_hasta: null, activo: true,
  };

  const save = useMutation({
    mutationFn: () => fnUp({ data: { cliente_id: clienteId, ...f } }),
    onSuccess: () => { toast.success("Configuración guardada"); qc.invalidateQueries({ queryKey: ["sat-sync"] }); setForm(null); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar"),
  });

  const runNow = useMutation({
    mutationFn: () => fnRun({ data: { cliente_id: clienteId, origen: "expediente", cascade: true } }),
    onSuccess: (r) => { toast.success(`Sincronización ${r.estatus}: ${r.descargados} XML, ${r.nuevos} nuevos`); qc.invalidateQueries({ queryKey: ["sat-sync"] }); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["sat-sync", "estado", clienteId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const togglePause = useMutation({
    mutationFn: () => fnPause({ data: { cliente_id: clienteId, activo: !f.activo } }),
    onSuccess: () => { toast.success(!f.activo ? "Reanudada" : "Pausada"); qc.invalidateQueries({ queryKey: ["sat-sync"] }); },
  });

  const set = (k: string, v: any) => setForm({ ...f, [k]: v });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Expediente</div>
            <div className="font-medium">{rfc ?? clienteId.slice(0, 8)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Última corrida: {fmtRel(cfg?.ultima_corrida_at)} · Próxima: {fmtFecha(cfg?.proxima_corrida_at)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="hero"
              onClick={() => runNow.mutate()}
              disabled={runNow.isPending || estadoQ.isLoading || bloqueado}
              title={estado?.motivo ?? undefined}
            >
              {runNow.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : bloqueado ? <Ban className="h-4 w-4 mr-2" />
                : <RefreshCw className="h-4 w-4 mr-2" />}
              Sincronizar ahora
            </Button>
            <Button size="sm" variant="outline" onClick={() => togglePause.mutate()} disabled={togglePause.isPending || !cfg}>
              {f.activo ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {f.activo ? "Pausar" : "Reanudar"}
            </Button>
          </div>
        </div>

        <EstadoServicio q={estadoQ} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium"><SettingsIcon className="h-4 w-4" /> Configuración de descarga</div>

        <div>
          <div className="text-xs text-muted-foreground mb-2">¿Qué descargar?</div>
          <div className="flex flex-wrap gap-2">
            {[["emitidos", "Emitidos"], ["recibidos", "Recibidos"], ["nomina", "Nómina"], ["pagos", "Pagos"], ["retenciones", "Retenciones"]].map(([k, l]) => (
              <label key={k} className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm cursor-pointer ${f[k] ? "bg-primary/10 border-primary text-primary" : "border-border"}`}>
                <input type="checkbox" className="hidden" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} />
                {l}
              </label>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Frecuencia</div>
            <select value={f.frecuencia} onChange={(e) => set("frecuencia", e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="manual">Manual</option>
              <option value="diaria">Diaria</option>
              <option value="semanal">Semanal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Periodo</div>
            <select value={f.periodo} onChange={(e) => set("periodo", e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="30d">Últimos 30 días</option>
              <option value="mes_actual">Mes actual</option>
              <option value="ejercicio">Ejercicio completo</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </div>
        </div>

        {f.periodo === "personalizado" && (
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={f.fecha_desde ?? ""} onChange={(e) => set("fecha_desde", e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <input type="date" value={f.fecha_hasta ?? ""} onChange={(e) => set("fecha_hasta", e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !form}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Guardar configuración
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-medium mb-3">Últimas 10 corridas</h3>
        {(runsQ.data ?? []).length === 0 ? <div className="text-xs text-muted-foreground">Sin corridas todavía.</div> : (
          <ul className="text-sm divide-y divide-border/40">
            {(runsQ.data ?? []).map((r: any) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                <div>
                  <div>{fmtFecha(r.iniciado_at)} · <span className="text-xs text-muted-foreground">{r.origen}</span></div>
                  <div className="text-xs text-muted-foreground">{r.desde} → {r.hasta} · {r.descargados} XML / {r.nuevos} nuevos</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.estatus === "exitoso" ? "bg-success/15 text-success" : r.estatus === "error" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>{r.estatus}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
