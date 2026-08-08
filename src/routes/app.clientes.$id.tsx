import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ShieldCheck, ShieldAlert, ShieldOff, Upload, Unlink, RefreshCw, CheckCircle2, History, Wrench, FileText, MapPin, Truck, Receipt, Users, ListChecks, Activity, Workflow as WorkflowIcon } from "lucide-react";
import { listWorkflows, listRuns } from "@/lib/workflows/workflows.functions";
import { computeSaludFiscal } from "@/lib/salud/salud.functions";
import { ConfigExpediente } from "./app.sat-sync";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getCliente, listTerceros } from "@/lib/clientes.functions";
import { getClienteHistorial } from "@/lib/clientes/historial.functions";
import { listCuentas, createCuenta, deleteCuenta, BANCOS } from "@/lib/cuentas/cuentas.functions";
import { Banknote, Plus, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { PortalConfigSection } from "@/components/PortalConfigSection";
import { EFirmaCard } from "@/components/EFirmaCard";


export const Route = createFileRoute("/app/clientes/$id")({
  component: ClienteDetailPage,
});

function ClienteDetailPage() {
  const { id } = useParams({ from: "/app/clientes/$id" });
  const fetchCli = useServerFn(getCliente);

  const cli = useQuery({ queryKey: ["cliente", id], queryFn: () => fetchCli({ data: { id } }) });
  const fetchHist = useServerFn(getClienteHistorial);
  const hist = useQuery({ queryKey: ["cli-hist", id], queryFn: () => fetchHist({ data: { cliente_id: id } }) });


  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/clientes" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Expedientes
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">
          {cli.data?.razon_social ?? "Cargando..."}
        </h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">{cli.data?.rfc}</p>
      </div>

      <DatosFiscalesSection cli={cli.data} />

      <PortalConfigSection clienteId={id} />




      <EFirmaCard clienteId={id} rfc={cli.data?.rfc} titulo="Conexión con el SAT mediante e.firma" />


      <CuentasBancariasSection clienteId={id} />



      <section className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Historial del expediente</h2>
          <span className="text-xs text-muted-foreground ml-2">{hist.data?.items.length ?? 0} eventos</span>
        </div>
        {hist.isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : !hist.data?.items.length ? (
          <div className="text-sm text-muted-foreground">Sin actividad registrada todavía. Las corridas de herramientas y cambios importantes aparecerán aquí.</div>
        ) : (
          <ol className="relative border-l border-border/60 ml-2 space-y-3">
            {hist.data.items.map((it) => {
              const Icon = it.tipo === "tool_run" ? Wrench : FileText;
              const tone = it.status === "error" ? "text-destructive" : it.status === "ok" ? "text-success" : "text-muted-foreground";
              return (
                <li key={it.id} className="ml-4">
                  <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-card border border-border/60 flex items-center justify-center">
                    <Icon className="h-2 w-2 text-muted-foreground" />
                  </span>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium">{it.titulo}</span>
                    {it.status && <span className={`text-[10px] uppercase tracking-wider ${tone}`}>{it.status}</span>}
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(it.fecha).toLocaleString("es-MX")}</span>
                  </div>
                  {it.detalle && <p className="text-xs text-muted-foreground mt-0.5">{it.detalle}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="rounded-xl border border-border/60 bg-card/50 p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Tareas del expediente</h2>
          </div>
          <Link
            to="/app/tareas"
            className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-muted/40"
          >
            Abrir en Centro de Tareas
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Las tareas asignadas a este expediente se gestionan desde el Centro de Tareas. Usa el filtro "Solo {`{cliente}`}" o ejecuta "Generar desde calendario" para crear automáticamente las tareas de obligaciones fiscales pendientes.
        </p>
      </section>

      <SaludFiscalExpediente clienteId={id} />

      <AutomatizacionesExpediente clienteId={id} />

      <section className="rounded-xl border border-border/60 bg-card/50 p-6">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Sincronización SAT</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Configura la descarga masiva automática para este expediente (CFDI emitidos, recibidos, nómina, pagos, retenciones).
          Tras cada corrida se ejecuta en cascada Salud Fiscal, Riesgo SAT, Auditor Express y EFOS.
        </p>
        <ConfigExpediente clienteId={id} rfc={cli.data?.rfc ?? undefined} />
      </section>
    </div>
  );
}

function AutomatizacionesExpediente({ clienteId }: { clienteId: string }) {
  const _list = useServerFn(listWorkflows);
  const _runs = useServerFn(listRuns);
  const wfsQ = useQuery({ queryKey: ["wfs-cliente", clienteId], queryFn: () => _list({ data: { clienteId } }) });
  const runsQ = useQuery({ queryKey: ["wfs-runs-cliente", clienteId], queryFn: () => _runs({ data: { clienteId, limit: 20 } }) });
  const wfs = (wfsQ.data ?? []) as any[];
  const runs = (runsQ.data ?? []) as any[];
  return (
    <section className="rounded-xl border border-border/60 bg-card/50 p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <WorkflowIcon className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Automatizaciones activas</h2>
        </div>
        <Link to="/app/workflows" className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-muted/40">
          Abrir Workflow Automático
        </Link>
      </div>
      {wfs.length === 0 ? (
        <p className="text-xs text-muted-foreground mt-3">Aún no hay workflows vinculados a este expediente. Aplica un template desde Workflow Automático.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border/40">
          {wfs.map((w) => (
            <li key={w.id} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{w.nombre}</div>
                <div className="text-[11px] text-muted-foreground">{w.status} · {w.trigger_type} · {w.total_runs} ejec · última: {w.last_run_at ? new Date(w.last_run_at).toLocaleString("es-MX") : "—"}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {runs.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium text-muted-foreground mb-2">Últimas ejecuciones</div>
          <ul className="space-y-1">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id} className="text-xs flex items-center justify-between">
                <span className="truncate">{r.workflow_nombre ?? r.workflow_id.slice(0, 8)}</span>
                <span className="text-muted-foreground">{r.status} · {new Date(r.started_at).toLocaleString("es-MX")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SaludFiscalExpediente({ clienteId }: { clienteId: string }) {
  const _compute = useServerFn(computeSaludFiscal);
  const { data, isLoading } = useQuery({
    queryKey: ["salud-expediente", clienteId],
    queryFn: async () => {
      const r = await _compute({ data: { cliente_id: clienteId, persist: false } });
      return "notFound" in r && r.notFound ? null : (r as any);
    },
  });
  const semColor: Record<string, string> = {
    verde: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
    amarillo: "text-amber-400 border-amber-500/40 bg-amber-500/10",
    naranja: "text-orange-400 border-orange-500/40 bg-orange-500/10",
    rojo: "text-red-400 border-red-500/40 bg-red-500/10",
  };
  return (
    <section className="rounded-xl border border-border/60 bg-card/50 p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Salud Fiscal</h2>
        </div>
        <Link to="/app/salud-fiscal" className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-muted/40">
          Abrir dashboard
        </Link>
      </div>
      {isLoading && <p className="text-xs text-muted-foreground mt-3">Calculando score…</p>}
      {data && (
        <div className="mt-4 grid sm:grid-cols-[auto_1fr] gap-4 items-center">
          <div className={`rounded-xl border px-5 py-4 text-center ${semColor[data.semaforo]}`}>
            <div className="text-3xl font-bold">{data.score}<span className="text-sm opacity-60">/100</span></div>
            <div className="text-[10px] uppercase mt-1">{data.semaforo}</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {data.subscores.map((s: any) => (
              <div key={s.key} className="text-xs">
                <div className="text-muted-foreground">{s.label}</div>
                <div className="font-semibold tabular-nums">{s.score}/100</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "destructive" }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${tone === "destructive" ? "border-destructive/30 bg-destructive/5" : "border-border/60 bg-card/50"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === "destructive" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function FileField({
  label, accept, file, onFile,
}: { label: string; accept: string; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept={accept}
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-primary file:text-xs file:font-medium hover:file:bg-primary/20 w-full"
        />
        {file && <span className="text-xs text-muted-foreground truncate max-w-[140px]">{file.name}</span>}
      </div>
    </label>
  );
}

function CuentasBancariasSection({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const fnList = useServerFn(listCuentas);
  const fnCreate = useServerFn(createCuenta);
  const fnDelete = useServerFn(deleteCuenta);

  const q = useQuery({ queryKey: ["cuentas", clienteId], queryFn: () => fnList({ data: { cliente_id: clienteId } }) });

  const [banco, setBanco] = useState<string>("BBVA");
  const [alias, setAlias] = useState("Principal");
  const [mask, setMask] = useState("");
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: string; banco: string; alias: string; mask: string | null } | null>(null);

  const create = useMutation({
    mutationFn: () => fnCreate({ data: {
      cliente_id: clienteId, banco, alias: alias || "Principal",
      numero_cuenta_mask: mask || null,
    } }),
    onSuccess: () => {
      toast.success("Cuenta creada");
      setAlias("Principal"); setMask(""); setAdding(false);
      qc.invalidateQueries({ queryKey: ["cuentas", clienteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => fnDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Cuenta eliminada");
      qc.invalidateQueries({ queryKey: ["cuentas", clienteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Banknote className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Cuentas bancarias</h2>
        <span className="text-xs text-muted-foreground ml-2">{q.data?.cuentas.length ?? 0} cuentas</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" /> {adding ? "Cancelar" : "Agregar cuenta"}
        </Button>
      </div>
      {adding && (
        <div className="grid sm:grid-cols-4 gap-2 p-3 rounded-md border border-dashed border-border/60 bg-background/40">
          <select value={banco} onChange={(e) => setBanco(e.target.value)}
            className="h-9 rounded-md bg-background border border-border px-2 text-sm">
            {BANCOS.map((b) => <option key={b}>{b}</option>)}
          </select>
          <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Alias"
            className="h-9 rounded-md bg-background border border-border px-2 text-sm" />
          <input value={mask} onChange={(e) => setMask(e.target.value)} placeholder="Últimos 4 dígitos"
            className="h-9 rounded-md bg-background border border-border px-2 text-sm" />
          <Button variant="hero" size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
            Guardar
          </Button>
        </div>
      )}
      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : !q.data?.cuentas.length ? (
        <div className="text-sm text-muted-foreground">Aún no hay cuentas bancarias. Agrega una para organizar los movimientos por banco.</div>
      ) : (
        <ul className="divide-y divide-border/40">
          {q.data.cuentas.map((c) => (
            <li key={c.id} className="py-2.5 flex items-center gap-3">
              <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                {c.banco.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.banco} · {c.alias ?? "Principal"}</div>
                <div className="text-xs text-muted-foreground">
                  {c.numero_cuenta_mask ? `••${c.numero_cuenta_mask}` : "Sin número"} · {c.moneda} · {c.movimientos} movimientos
                </div>
              </div>
              <Button variant="ghost" size="sm"
                onClick={() => setToDelete({ id: c.id, banco: c.banco, alias: c.alias ?? "Principal", mask: c.numero_cuenta_mask ?? null })}
                disabled={del.isPending}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDeleteDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        loading={del.isPending}
        title="Eliminar cuenta bancaria"
        expected={toDelete ? (toDelete.mask || toDelete.alias).toUpperCase() : ""}
        warning="Si la cuenta tiene movimientos cargados, también se quitarán del expediente."
        description={
          <>
            Vas a eliminar la cuenta{" "}
            <span className="font-semibold">{toDelete?.banco} · {toDelete?.alias}</span>
            {toDelete?.mask ? <> (••{toDelete.mask})</> : null}.
          </>
        }
        onConfirm={() => { if (toDelete) del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) }); }}
      />
    </section>
  );
}

function DatosFiscalesSection({ cli }: { cli: any }) {
  if (!cli) return null;
  const has = cli.curp || cli.domicilio_fiscal || cli.codigo_postal || cli.tipo_persona || cli.csf_ultima_emision;
  return (
    <section className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Datos fiscales</h2>
        {cli.csf_ultima_emision && (
          <span className="ml-auto text-[11px] uppercase tracking-wider text-muted-foreground">
            CSF: {new Date(cli.csf_ultima_emision).toLocaleDateString("es-MX")}
          </span>
        )}
      </div>
      {!has ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay datos fiscales. Sube una CSF en{" "}
          <Link to="/app/tools/csf-parser" className="text-primary hover:underline">Lector de CSF</Link>{" "}
          y elige <em>"Crear / actualizar cliente"</em> para rellenar este expediente.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <FieldRow label="Tipo de persona" value={cli.tipo_persona === "fisica" ? "Persona Física" : cli.tipo_persona === "moral" ? "Persona Moral" : null} />
          <FieldRow label="CURP" value={cli.curp} mono />
          <FieldRow label="Régimen fiscal" value={cli.regimen_fiscal} className="sm:col-span-2" />
          <FieldRow label="Domicilio fiscal" value={cli.domicilio_fiscal} className="sm:col-span-2" />
          <FieldRow label="Código postal" value={cli.codigo_postal} mono />
        </div>
      )}
    </section>
  );
}

function FieldRow({ label, value, mono, className = "" }: { label: string; value?: string | null; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-xs mt-0.5" : "mt-0.5"}>{value || "—"}</div>
    </div>
  );
}

function TercerosSection({ clienteId }: { clienteId: string }) {
  const fn = useServerFn(listTerceros);
  const q = useQuery({ queryKey: ["terceros", clienteId], queryFn: () => fn({ data: { cliente_id: clienteId } }) });
  const terceros = q.data?.terceros ?? [];
  const proveedores = terceros.filter((t: any) => t.tipo_relacion === "proveedor");
  const acreedores = terceros.filter((t: any) => t.tipo_relacion === "acreedor");

  return (
    <section className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Proveedores y acreedores</h2>
        <span className="text-xs text-muted-foreground ml-2">{terceros.length}</span>
      </div>
      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : terceros.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay proveedores ni acreedores vinculados. Desde{" "}
          <Link to="/app/tools/csf-parser" className="text-primary hover:underline">Lector de CSF</Link>{" "}
          con este cliente activo, sube la CSF del tercero y elige <em>"Agregar como proveedor"</em> o <em>"acreedor"</em>.
        </p>
      ) : (
        <div className="space-y-4">
          {[
            { titulo: "Proveedores", icon: Truck, items: proveedores },
            { titulo: "Acreedores", icon: Receipt, items: acreedores },
          ].map(({ titulo, icon: Icon, items }) => items.length > 0 && (
            <div key={titulo}>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" /> {titulo} ({items.length})
              </div>
              <ul className="divide-y divide-border/40 rounded-md border border-border/40">
                {items.map((t: any) => (
                  <li key={t.id} className="px-3 py-2 flex items-center gap-3 hover:bg-accent/5">
                    <Link to="/app/clientes/$id" params={{ id: t.id }} className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.razon_social}</div>
                      <div className="text-xs font-mono text-muted-foreground">{t.rfc}</div>
                    </Link>
                    {t.regimen_fiscal && (
                      <div className="text-xs text-muted-foreground hidden sm:block max-w-[260px] truncate">{t.regimen_fiscal}</div>
                    )}
                    {t.csf_ultima_emision && (
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        CSF {new Date(t.csf_ultima_emision).toLocaleDateString("es-MX")}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

