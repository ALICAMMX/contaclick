import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ShieldCheck, ShieldAlert, ShieldOff, Upload, Unlink, RefreshCw, CheckCircle2, History, Wrench, FileText, MapPin, Truck, Receipt, Users, ListChecks, Workflow as WorkflowIcon } from "lucide-react";
import { listWorkflows, listRuns } from "@/lib/workflows/workflows.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getCliente, listTerceros } from "@/lib/clientes.functions";
import { getSatStatus, conectarSat, desconectarSat, sincronizarCfdis } from "@/lib/sat/sat.functions";
import { getClienteHistorial } from "@/lib/clientes/historial.functions";
import { listCuentas, createCuenta, deleteCuenta, BANCOS } from "@/lib/cuentas/cuentas.functions";
import { Banknote, Plus, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { PortalConfigSection } from "@/components/PortalConfigSection";


export const Route = createFileRoute("/app/clientes/$id")({
  component: ClienteDetailPage,
});

function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function ClienteDetailPage() {
  const { id } = useParams({ from: "/app/clientes/$id" });
  const fetchCli = useServerFn(getCliente);
  const fetchStatus = useServerFn(getSatStatus);
  const conectar = useServerFn(conectarSat);
  const desconectar = useServerFn(desconectarSat);
  const qc = useQueryClient();

  const cli = useQuery({ queryKey: ["cliente", id], queryFn: () => fetchCli({ data: { id } }) });
  const sat = useQuery({ queryKey: ["sat", id], queryFn: () => fetchStatus({ data: { cliente_id: id } }) });
  const fetchHist = useServerFn(getClienteHistorial);
  const hist = useQuery({ queryKey: ["cli-hist", id], queryFn: () => fetchHist({ data: { cliente_id: id } }) });

  const [cer, setCer] = useState<File | null>(null);
  const [key, setKey] = useState<File | null>(null);
  const [pwd, setPwd] = useState("");

  const conectarMut = useMutation({
    mutationFn: async () => {
      if (!cer || !key || !pwd) throw new Error("Sube .cer, .key e ingresa la contraseña");
      const [cer_b64, key_b64] = await Promise.all([fileToB64(cer), fileToB64(key)]);
      return conectar({ data: { cliente_id: id, cer_b64, key_b64, password: pwd } });
    },
    onSuccess: (r) => {
      toast.success(r.simulated ? "Conectado en modo demo (PAC no configurado)" : "Conectado al SAT vía PAC");
      setCer(null); setKey(null); setPwd("");
      qc.invalidateQueries({ queryKey: ["sat", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const desconectarMut = useMutation({
    mutationFn: () => desconectar({ data: { cliente_id: id } }),
    onSuccess: () => {
      toast.success("Conexión SAT eliminada");
      qc.invalidateQueries({ queryKey: ["sat", id] });
    },
  });

  // Rango por defecto: últimos 30 días
  const today = new Date();
  const defHasta = today.toISOString().slice(0, 10);
  const defDesde = new Date(today.getTime() - 30 * 86400_000).toISOString().slice(0, 10);
  const [desde, setDesde] = useState(defDesde);
  const [hasta, setHasta] = useState(defHasta);
  const [tipo, setTipo] = useState<"emitidos" | "recibidos" | "ambos">("ambos");
  const sincronizar = useServerFn(sincronizarCfdis);
  const [lastResult, setLastResult] = useState<null | {
    simulated: boolean; descargados: number; ya_existian: number; errores: string[]; detalle: string; ok: boolean;
  }>(null);

  const sincronizarMut = useMutation({
    mutationFn: () => sincronizar({ data: { cliente_id: id, desde, hasta, tipo } }),
    onSuccess: (r) => {
      setLastResult(r);
      if (r.ok) toast.success(r.simulated ? "Sincronización demo completada" : "Solicitud enviada al SAT");
      else toast.error("La sincronización terminó con errores");
      qc.invalidateQueries({ queryKey: ["sat", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = sat.data?.estatus ?? "sin_conectar";
  const StatusIcon = status === "activo" ? ShieldCheck : status === "error" ? ShieldAlert : ShieldOff;
  const statusTone =
    status === "activo" ? "text-success" : status === "error" ? "text-destructive" : "text-muted-foreground";
  const statusLabel =
    status === "activo" ? "Conectado" : status === "error" ? "Error de conexión" : "Sin conectar";

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




      <section className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Conexión SAT</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Sube la e.firma (FIEL) del contribuyente para que el sistema pueda descargar sus CFDI desde el SAT
              de forma automática a través del PAC.
            </p>
          </div>
          <div className={`flex items-center gap-2 text-sm font-medium ${statusTone}`}>
            <StatusIcon className="h-4 w-4" /> {statusLabel}
          </div>
        </div>

        {sat.data?.last_sync_at && (
          <div className="text-xs text-muted-foreground">
            Última sincronización: {new Date(sat.data.last_sync_at).toLocaleString("es-MX")}
          </div>
        )}
        {sat.data?.last_error && (
          <div className="text-xs text-destructive bg-destructive/10 rounded-md p-2">
            {sat.data.last_error}
          </div>
        )}

        {status === "activo" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-background/40 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold">Descargar CFDI desde el SAT</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Selecciona el periodo y tipo. La solicitud se envía al PAC.
                  </p>
                </div>
                <Button onClick={() => sincronizarMut.mutate()} disabled={sincronizarMut.isPending} variant="hero">
                  <RefreshCw className={`h-4 w-4 ${sincronizarMut.isPending ? "animate-spin" : ""}`} />
                  {sincronizarMut.isPending ? "Sincronizando..." : "Sincronizar ahora"}
                </Button>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs text-muted-foreground mb-1 block">Desde</span>
                  <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} max={hasta}
                    className="h-10 px-3 rounded-lg bg-input/50 border border-border text-sm w-full focus:outline-none focus:ring-1 focus:ring-ring" />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground mb-1 block">Hasta</span>
                  <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} min={desde} max={defHasta}
                    className="h-10 px-3 rounded-lg bg-input/50 border border-border text-sm w-full focus:outline-none focus:ring-1 focus:ring-ring" />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground mb-1 block">Tipo</span>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value as any)}
                    className="h-10 px-3 rounded-lg bg-input/50 border border-border text-sm w-full focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="ambos">Emitidos y recibidos</option>
                    <option value="emitidos">Solo emitidos</option>
                    <option value="recibidos">Solo recibidos</option>
                  </select>
                </label>
              </div>

              {sincronizarMut.isPending && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Enviando solicitud al PAC y procesando respuesta…
                </div>
              )}

              {lastResult && !sincronizarMut.isPending && (
                <div className={`rounded-md p-3 text-sm border ${lastResult.ok ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
                  <div className="flex items-center gap-2 font-medium">
                    {lastResult.ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <ShieldAlert className="h-4 w-4 text-destructive" />}
                    {lastResult.simulated ? "Sincronización demo" : "Resultado de la sincronización"}
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-2 text-xs">
                    <Stat label="Descargados" value={lastResult.descargados} />
                    <Stat label="Ya existían" value={lastResult.ya_existian} />
                    <Stat label="Errores" value={lastResult.errores.length} tone={lastResult.errores.length ? "destructive" : "default"} />
                  </div>
                  {lastResult.detalle && (
                    <p className="text-xs text-muted-foreground mt-2">{lastResult.detalle}</p>
                  )}
                  {lastResult.errores.map((e, i) => (
                    <p key={i} className="text-xs text-destructive mt-1">• {e}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => desconectarMut.mutate()} disabled={desconectarMut.isPending}>
                <Unlink className="h-4 w-4" /> Desconectar
              </Button>
              <span className="text-xs text-muted-foreground">
                Para reemplazar la e.firma, desconecta primero y vuelve a conectar.
              </span>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); conectarMut.mutate(); }}
            className="grid sm:grid-cols-2 gap-3"
          >
            <FileField label="Certificado (.cer)" accept=".cer" file={cer} onFile={setCer} />
            <FileField label="Llave privada (.key)" accept=".key" file={key} onFile={setKey} />
            <label className="block sm:col-span-2">
              <span className="text-xs text-muted-foreground mb-1 block">Contraseña de la llave privada</span>
              <input
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder="••••••••"
                className="h-10 px-3 rounded-lg bg-input/50 border border-border text-sm w-full focus:outline-none focus:ring-1 focus:ring-ring"
                autoComplete="off"
              />
            </label>
            <div className="sm:col-span-2 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground max-w-md">
                Los archivos se envían cifrados al PAC y <strong>no se almacenan</strong> en nuestros servidores. Solo
                guardamos el token devuelto para autorizar descargas futuras.
              </p>
              <Button type="submit" variant="hero" disabled={conectarMut.isPending}>
                <Upload className="h-4 w-4" />
                {conectarMut.isPending ? "Conectando..." : "Conectar SAT"}
              </Button>
            </div>
          </form>
        )}
      </section>

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

      <AutomatizacionesExpediente clienteId={id} />
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

