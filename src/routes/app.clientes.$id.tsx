import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ShieldCheck, ShieldAlert, ShieldOff, Upload, Unlink, RefreshCw, CheckCircle2, History, Wrench, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getCliente } from "@/lib/clientes.functions";
import { getSatStatus, conectarSat, desconectarSat, sincronizarCfdis } from "@/lib/sat/sat.functions";
import { getClienteHistorial } from "@/lib/clientes/historial.functions";

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
    </div>
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
