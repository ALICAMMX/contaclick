import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ShieldCheck, ShieldAlert, ShieldOff, Upload, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getCliente } from "@/lib/clientes.functions";
import { getSatStatus, conectarSat, desconectarSat } from "@/lib/sat/sat.functions";

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
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => desconectarMut.mutate()} disabled={desconectarMut.isPending}>
              <Unlink className="h-4 w-4" /> Desconectar
            </Button>
            <span className="text-xs text-muted-foreground">
              Para reemplazar la e.firma, desconecta primero y vuelve a conectar.
            </span>
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
