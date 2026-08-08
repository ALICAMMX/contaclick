// Dashboard — Descarga Masiva SAT (Prompt 5)
// KPIs + actividad reciente + clientes desconectados / con errores + novedades.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  RefreshCw, ShieldCheck, AlertTriangle, FileStack, Clock, PlugZap, Loader2,
  Pause, Play, Settings as SettingsIcon, ArrowLeft, Ban, Wallet, Hourglass,
} from "lucide-react";
import { CorridaDetalleDialog } from "@/components/sat/CorridaDetalle";
import { corridaReintentable, motivoSinReintento } from "@/lib/sat/linaje";
import { dashboardSatSync, runSyncNow, listSyncRuns, listSyncEventos, setSyncActivo, getSatSyncConfig, upsertSatSyncConfig, estadoServicioSat, cosecharAhora, reintentarCorrida, cerrarCorridaSat } from "@/lib/sat/sat-sync.functions";
import { useActiveCliente } from "@/lib/active-cliente";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { EFirmaCard } from "@/components/EFirmaCard";
import { semanticaCodigo } from "@/lib/sat/maquina-estados";
import { descripcionAlcance } from "@/lib/sat/solicitud-xml";


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

/** Etiquetas de la máquina de estados de una corrida. */
const ESTADO_LABEL: Record<string, { texto: string; cls: string }> = {
  preparando: { texto: "Preparando", cls: "bg-muted text-muted-foreground" },
  solicitando: { texto: "Solicitando al SAT", cls: "bg-warning/15 text-warning" },
  esperando_sat: { texto: "Esperando al SAT", cls: "bg-warning/15 text-warning" },
  descargando: { texto: "Descargando paquetes", cls: "bg-warning/15 text-warning" },
  ingiriendo: { texto: "Procesando XML", cls: "bg-warning/15 text-warning" },
  recalculando: { texto: "Recalculando módulos", cls: "bg-warning/15 text-warning" },
  completada: { texto: "Completada", cls: "bg-success/15 text-success" },
  parcial: { texto: "Cobertura parcial", cls: "bg-warning/15 text-warning" },
  error: { texto: "Error", cls: "bg-destructive/15 text-destructive" },
  vencida: { texto: "Vencida en el SAT", cls: "bg-destructive/15 text-destructive" },
};

function EstadoBadge({ estado }: { estado?: string | null }) {
  const e = ESTADO_LABEL[estado ?? ""] ?? { texto: estado ?? "—", cls: "bg-muted text-muted-foreground" };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${e.cls}`}>{e.texto}</span>;
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
          Descarga los CFDI <strong>emitidos</strong> y <strong>recibidos</strong> del expediente directamente
          del servicio oficial del SAT firmando con su e.firma. La nómina y los complementos de pago se
          identifican al clasificar los comprobantes descargados, no son descargas independientes.
          El SAT responde de forma asíncrona: la corrida continúa aunque cierres esta pantalla.
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
          <EFirmaCard clienteId={cliente.id} rfc={cliente.rfc} />
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

/**
 * Motivo legible de una corrida fallida (código del SAT + explicación).
 * Nunca se muestra únicamente "Error".
 */
function motivoCorridaUi(r: any): string {
  if (r?.motivo) return r.motivo;
  const sols: any[] = Array.isArray(r?.solicitudes) ? r.solicitudes : [];
  const conCodigo = sols.find((s) => s?.codigo);
  if (conCodigo) return `${conCodigo.codigo} · ${semanticaCodigo(conCodigo.codigo).mensaje}`;
  const errs: any[] = Array.isArray(r?.errores) ? r.errores : [];
  if (errs.length) return String(errs[0]?.mensaje ?? errs[0]).slice(0, 160);
  if (r?.detalle) return String(r.detalle).slice(0, 160);
  return "Corrida no completada.";
}

/**
 * Un rechazo terminal del SAT (familia 3xx) no se reintenta: hay que corregir
 * la configuración y crear una corrida nueva.
 */
function esRechazoTerminal(r: any): boolean {
  // Criterio ÚNICO compartido con el servidor: si no es reintentable, no se
  // ofrece el botón. Así la UI nunca invita a repetir un error terminal.
  return !corridaReintentable(r);
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
        <Kpi
          icon={Clock}
          label="Última sincronización exitosa"
          value={d.ultima ? fmtRel(d.ultima) : "Sin corridas exitosas"}
          hint={d.ultima ? fmtFecha(d.ultima) : "Las corridas fallidas no cuentan como sincronización"}
        />
        <Kpi icon={FileStack} label="Corridas hoy" value={d.hoy} />
        <Kpi icon={ShieldCheck} label="CFDI nuevos hoy" value={d.nuevos} tone="ok" />
        <Kpi icon={AlertTriangle} label="Errores (7d)" value={d.errores} tone={d.errores > 0 ? "danger" : undefined} />
        <Kpi icon={RefreshCw} label="Corridas en proceso" value={d.pendientes} hint="El SAT responde de forma asíncrona" tone={d.pendientes > 0 ? "warn" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-medium mb-3">Actividad reciente</h3>
          {d.actividad.length === 0 && <div className="text-xs text-muted-foreground">Sin corridas aún.</div>}
          <ul className="space-y-2 text-sm">
            {d.actividad.slice(0, 10).map((r: any) => (
              <li key={r.id} className="flex items-center justify-between border-b border-border/40 pb-1.5">
                <div className="min-w-0">
                  <div className="font-medium">{r.clientes?.rfc ?? r.cliente_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{fmtFecha(r.iniciado_at)} · {r.nuevos ?? 0} nuevos</div>
                  {(r.estado === "error" || r.estado === "vencida") && (
                    <div className="text-xs text-destructive truncate">{motivoCorridaUi(r)}</div>
                  )}
                </div>
                <EstadoBadge estado={r.estado ?? r.estatus} />
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-medium mb-3">Centro de incidencias</h3>
          {d.conErrores.length === 0 &&
            d.desconectados.length === 0 &&
            (d.incidenciasCorridas?.length ?? 0) === 0 && (
              <div className="text-xs text-muted-foreground">Todo en orden.</div>
            )}
          <ul className="space-y-2 text-sm">
            {(d.incidenciasCorridas ?? []).map((r: any) => (
              <li key={r.id} className="flex items-start justify-between gap-3 border-b border-border/40 pb-1.5">
                <div className="min-w-0">
                  <div className="font-medium">{r.rfc ?? "Corrida"} · {fmtFecha(r.iniciado_at)}</div>
                  <div className="text-xs text-destructive">{r.motivo}</div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-destructive">{r.estado}</span>
              </li>
            ))}
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
  const [detalleId, setDetalleId] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm min-w-[52rem]">
        <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left p-3">Fecha</th><th className="text-left p-3">RFC</th>
            <th className="text-left p-3">Origen</th><th className="text-left p-3">Rango</th>
            <th className="text-right p-3">XML</th><th className="text-right p-3">Nuevos</th>
            <th className="text-right p-3">Errores</th><th className="text-left p-3">Duración</th>
            <th className="text-left p-3">Estatus</th>
            <th className="text-right p-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr
              key={r.id}
              className="border-t border-border/40 cursor-pointer hover:bg-muted/20 focus-visible:bg-muted/30 outline-none"
              tabIndex={0}
              role="button"
              aria-label={`Ver detalle de la corrida del ${fmtFecha(r.iniciado_at)}`}
              onClick={() => setDetalleId(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDetalleId(r.id);
                }
              }}
            >
              <td className="p-3">{fmtFecha(r.iniciado_at)}</td>
              <td className="p-3 font-mono text-xs">{r.clientes?.rfc ?? "—"}</td>
              <td className="p-3 text-xs">{r.origen}</td>
              <td className="p-3 text-xs">{r.desde} → {r.hasta}</td>
              <td className="p-3 text-right">{r.descargados}</td>
              <td className="p-3 text-right text-success">{r.nuevos}</td>
              <td className="p-3 text-right">{Array.isArray(r.errores) ? r.errores.length : 0}</td>
              <td className="p-3 text-xs">{r.duracion_ms != null ? `${r.duracion_ms} ms` : "—"}</td>
              <td className="p-3">
                <EstadoBadge estado={r.estado ?? r.estatus} />
                {(r.estado === "error" || r.estado === "vencida") && (
                  <div className="text-xs text-destructive mt-1 max-w-[22rem]">{motivoCorridaUi(r)}</div>
                )}
              </td>
              <td className="p-3 text-right">
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="ver-detalle"
                  data-run-id={r.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetalleId(r.id);
                  }}
                >
                  Ver detalle
                </Button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground text-sm">Sin actividad registrada.</td></tr>}
        </tbody>
      </table>
      <CorridaDetalleDialog runId={detalleId} onClose={() => setDetalleId(null)} />
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

function EstadoServicio({ q, onCerrar, cerrando }: { q: any; onCerrar?: (runId: string) => void; cerrando?: boolean }) {
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
        Esta corrida enviará {e.previstas} solicitud(es) al SAT
        <span className="text-muted-foreground font-normal">
          · {e.rango.desde} → {e.rango.hasta}
        </span>
      </div>
      <div className="text-muted-foreground">
        Proveedor: {e.proveedor_nombre} · {e.etiqueta_costo}
      </div>
      <div className="text-muted-foreground">
        Cuota del plan: {e.cuota.usado}
        {e.cuota.ilimitado ? " (ilimitada)" : ` de ${e.cuota.limite} · quedan ${e.cuota.restante}`}
        {e.es_sandbox && " · expediente de demostración (no se contacta al SAT)"}
      </div>
      {e.corrida_activa && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-warning">
            <Hourglass className="h-3.5 w-3.5" />
            Corrida en proceso desde {fmtRel(e.corrida_activa.iniciado_at)} ·{" "}
            {ESTADO_LABEL[e.corrida_activa.estado]?.texto ?? e.corrida_activa.estado}
            {!e.corrida_activa.con_folio_sat && " · sin folio del SAT"}
          </div>
          <div className="text-muted-foreground">{e.corrida_activa.motivo_cierre}</div>
          {e.corrida_activa.puede_cerrarse && onCerrar && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={cerrando}
              onClick={() => onCerrar(e.corrida_activa!.id)}
            >
              {cerrando ? "Cerrando…" : "Cerrar corrida atorada"}
            </Button>
          )}
        </div>
      )}

      {e.servicio && (
        <div className="text-muted-foreground">
          Saldo del proveedor (visible sólo para administración): {e.servicio.disponible} disponibles ·{" "}
          {e.servicio.reservado} reservadas · nivel {e.servicio.nivel}
        </div>
      )}
      {!ok && (
        <div className="flex items-start gap-2 text-destructive pt-1">
          <Ban className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            {e.motivo}
            {e.accion ? <span className="block text-foreground/80 mt-0.5">Qué hacer: {e.accion}</span> : null}
            {/^.*e\.?firma/i.test(String(e.motivo ?? "")) && (
              <Button
                type="button"
                variant="hero"
                size="sm"
                className="mt-2"
                onClick={() =>
                  document
                    .getElementById("conexion-efirma")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              >
                Conectar e.firma ahora
              </Button>
            )}
          </span>
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
  const fnCosechar = useServerFn(cosecharAhora);

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
    emitidos: true, recibidos: true, clasificar_nomina: true, clasificar_pagos: true,
    frecuencia: "diaria", periodo: "mes_actual", fecha_desde: null, fecha_hasta: null, activo: true,
  };

  const save = useMutation({
    mutationFn: () =>
      fnUp({
        data: {
          cliente_id: clienteId,
          emitidos: !!f.emitidos,
          recibidos: !!f.recibidos,
          clasificar_nomina: f.clasificar_nomina ?? true,
          clasificar_pagos: f.clasificar_pagos ?? true,
          frecuencia: f.frecuencia,
          periodo: f.periodo,
          fecha_desde: f.fecha_desde ?? null,
          fecha_hasta: f.fecha_hasta ?? null,
          activo: f.activo ?? true,
        },
      }),
    onSuccess: () => { toast.success("Configuración guardada"); qc.invalidateQueries({ queryKey: ["sat-sync"] }); setForm(null); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar"),
  });

  const runNow = useMutation({
    mutationFn: () => fnRun({ data: { cliente_id: clienteId, origen: "expediente", cascade: true } }),
    onSuccess: (r: any) => {
      // El servidor ya no lanza excepciones genéricas: devuelve el motivo real.
      if (r?.ok === false) {
        toast.error(r.error.mensaje, { description: r.error.accion });
        return;
      }
      if (r.duplicada) toast.info(r.mensaje);
      else toast.success(r.mensaje);
      qc.invalidateQueries({ queryKey: ["sat-sync"] });
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["sat-sync", "estado", clienteId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const [detalleId, setDetalleId] = useState<string | null>(null);
  const fnReintentar = useServerFn(reintentarCorrida);
  const reintentar = useMutation({
    mutationFn: (runId: string) => fnReintentar({ data: { cliente_id: clienteId, run_id: runId } }),
    onSuccess: (r: any) => {
      if (r.ok) toast.success(r.mensaje);
      else toast.warning(r.mensaje);
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo reintentar la corrida"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["sat-sync"] }),
  });

  const fnCerrar = useServerFn(cerrarCorridaSat);
  const cerrar = useMutation({
    mutationFn: (runId: string) => fnCerrar({ data: { cliente_id: clienteId, run_id: runId } }),
    onSuccess: (r: any) => (r.ok ? toast.success(r.mensaje) : toast.warning(r.mensaje)),
    onError: (e: any) => toast.error(e?.message ?? "No se pudo cerrar la corrida"),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["sat-sync"] });
      qc.invalidateQueries({ queryKey: ["sat-sync", "estado", clienteId] });
    },
  });


  const consultar = useMutation({
    mutationFn: () => fnCosechar({ data: { cliente_id: clienteId } }),
    onSuccess: (r: any) =>
      toast.success(
        r.revisadas === 0
          ? "No hay corridas en proceso."
          : `Consultadas ${r.revisadas} corrida(s) · ${r.nuevos} CFDI nuevos · ${r.terminadas} terminada(s).`,
      ),
    onError: (e: any) => toast.error(e?.message ?? "No se pudo consultar el avance"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["sat-sync"] }),
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => consultar.mutate()}
              disabled={consultar.isPending}
              title="Pregunta al SAT si ya liberó los paquetes de las corridas en proceso"
            >
              {consultar.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Hourglass className="h-4 w-4 mr-2" />}
              Consultar avance
            </Button>
            <Button size="sm" variant="outline" onClick={() => togglePause.mutate()} disabled={togglePause.isPending || !cfg}>
              {f.activo ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {f.activo ? "Pausar" : "Reanudar"}
            </Button>
          </div>
        </div>

        <EstadoServicio q={estadoQ} onCerrar={(id) => cerrar.mutate(id)} cerrando={cerrar.isPending} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium"><SettingsIcon className="h-4 w-4" /> Configuración de descarga</div>

        <div>
          <div className="text-xs text-muted-foreground mb-2">
            ¿Qué solicitar al SAT? Cada dirección es una solicitud independiente.
          </div>
          <div className="flex flex-wrap gap-2">
            {[["emitidos", "Emitidos"], ["recibidos", "Recibidos"]].map(([k, l]) => (
              <label key={k} className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm cursor-pointer ${f[k] ? "bg-primary/10 border-primary text-primary" : "border-border"}`}>
                <input type="checkbox" className="hidden" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} />
                {l}
              </label>
            ))}
          </div>
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {f.recibidos && <li>• {descripcionAlcance("recibidos", "CFDI", "Vigente")} El SAT no permite descargar XML cancelados recibidos.</li>}
            {f.emitidos && <li>• {descripcionAlcance("emitidos", "CFDI", "Vigente")}</li>}
            {!f.emitidos && !f.recibidos && <li>• Selecciona al menos una dirección para poder sincronizar.</li>}
          </ul>
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-2">
            Clasificación posterior a la descarga (no genera solicitudes adicionales)
          </div>
          <div className="flex flex-wrap gap-2">
            {[["clasificar_nomina", "Identificar nómina"], ["clasificar_pagos", "Identificar complementos de pago"]].map(([k, l]) => (
              <label key={k} className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm cursor-pointer ${f[k] ? "bg-primary/10 border-primary text-primary" : "border-border"}`}>
                <input type="checkbox" className="hidden" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} />
                {l}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Retenciones e información de pagos (CFDI de retenciones) usan otro servicio del SAT:
            pendiente de implementación.
          </p>
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
                  <div className="text-xs text-muted-foreground">
                    {r.desde} → {r.hasta} · {r.nuevos ?? 0} nuevos · {r.duplicados ?? 0} duplicados · {r.rechazados ?? 0} rechazados
                  </div>
                  {r.advertencia && <div className="text-xs text-warning mt-0.5">{r.advertencia}</div>}
                  {(r.estado === "error" || r.estado === "vencida") && (
                    <>
                      <div className="text-xs text-destructive mt-0.5">{motivoCorridaUi(r)}</div>
                      {esRechazoTerminal(r) && (
                        <div className="text-xs text-muted-foreground mt-0.5">{motivoSinReintento(r)}</div>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setDetalleId(r.id)}>
                    Ver detalle
                  </Button>
                  {["error", "parcial", "vencida"].includes(String(r.estado ?? "")) && !esRechazoTerminal(r) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reintentar.mutate(r.id)}
                      disabled={reintentar.isPending}
                      title="Reabre las solicitudes que el SAT todavía puede entregar y vuelve a consultar el avance"
                    >
                      {reintentar.isPending && reintentar.variables === r.id
                        ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        : <RefreshCw className="h-4 w-4 mr-2" />}
                      Reintentar
                    </Button>
                  )}
                  <EstadoBadge estado={r.estado ?? r.estatus} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CorridaDetalleDialog runId={detalleId} onClose={() => setDetalleId(null)} />
    </div>
  );
}
