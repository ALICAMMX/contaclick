import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, ShieldOff, Upload, Unlink, KeyRound, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSatStatus, conectarSat, desconectarSat } from "@/lib/sat/sat.functions";
import { errorVisibleCredencial } from "@/lib/sat/linaje";


const MAX_CER = 20 * 1024; // los .cer del SAT pesan ~1-2 KB
const MAX_KEY = 50 * 1024; // los .key del SAT pesan ~1-2 KB

function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(new Error("No se pudo leer el archivo seleccionado."));
    r.readAsDataURL(file);
  });
}

export function EFirmaCard({
  clienteId,
  rfc,
  titulo = "Conexión con el SAT mediante e.firma",
}: {
  clienteId: string;
  rfc?: string | null;
  titulo?: string;
}) {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getSatStatus);
  const conectar = useServerFn(conectarSat);
  const desconectar = useServerFn(desconectarSat);
  const [abierto, setAbierto] = useState(false);

  const sat = useQuery({
    queryKey: ["sat", clienteId],
    queryFn: () => fetchStatus({ data: { cliente_id: clienteId } }),
  });

  const desconectarMut = useMutation({
    mutationFn: () => desconectar({ data: { cliente_id: clienteId } }),
    onSuccess: () => {
      toast.success("e.firma eliminada de la bóveda.");
      qc.invalidateQueries({ queryKey: ["sat", clienteId] });
      qc.invalidateQueries({ queryKey: ["sat-sync"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const estatus = sat.data?.estatus ?? "sin_conectar";
  const activo = estatus === "activo";
  const Icon = activo ? ShieldCheck : estatus === "error" ? ShieldAlert : ShieldOff;
  const tone = activo ? "text-success" : estatus === "error" ? "text-destructive" : "text-muted-foreground";
  const label = activo ? "Conectado" : estatus === "error" ? "Error de conexión" : "No conectado";

  return (
    <section id="conexion-efirma" className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" /> {titulo}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            El Web Service de Descarga Masiva del SAT sólo entrega los CFDI de un contribuyente si la
            solicitud viene firmada con su e.firma. Sin ella, el SAT no autoriza ninguna descarga.
          </p>
        </div>
        <div className={`flex items-center gap-2 text-sm font-medium ${tone}`}>
          <Icon className="h-4 w-4" /> {label}
        </div>
      </div>

      {/* Sólo los problemas del CERTIFICADO se muestran aquí. El rechazo de una
          corrida (301, error de paquete, etc.) pertenece a SAT Sync y no debe
          hacer creer que la e.firma dejó de servir. */}
      {errorVisibleCredencial(sat.data?.last_error) && (
        <div className="text-xs text-destructive bg-destructive/10 rounded-md p-2">{sat.data!.last_error}</div>
      )}

      {activo ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-background/40 p-4 text-xs text-muted-foreground space-y-1">
            <div>
              RFC del certificado: <span className="font-mono text-foreground">{sat.data?.efirma_rfc ?? "—"}</span>
              {sat.data?.efirma_vence_at
                ? ` · vigente hasta ${new Date(sat.data.efirma_vence_at).toLocaleDateString("es-MX")}`
                : ""}
            </div>
            {sat.data?.consentimiento_at && (
              <div>
                Autorización registrada el {new Date(sat.data.consentimiento_at).toLocaleString("es-MX")} (versión{" "}
                {sat.data.consentimiento_version ?? "—"}).
              </div>
            )}
            <div>Descarga directa del SAT: no consume saldo de PAC.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
              <Upload className="h-4 w-4" /> Reemplazar e.firma
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => desconectarMut.mutate()}
              disabled={desconectarMut.isPending}
            >
              <Unlink className="h-4 w-4" /> Desconectar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
            <li>La descarga directa del SAT <strong>no utiliza saldo PAC</strong>: sólo consume la cuota de tu plan.</li>
            <li>La llave y su contraseña se guardan cifradas y ligadas exclusivamente a este expediente.</li>
            <li className="text-warning">
              Nunca compartas el .cer, el .key ni la contraseña por correo, chat o con soporte. Cárgalos únicamente
              en este formulario.
            </li>
          </ul>
          <Button variant="hero" onClick={() => setAbierto(true)}>
            <KeyRound className="h-4 w-4" /> Conectar e.firma
          </Button>
        </div>
      )}

      {abierto && (
        <EFirmaDialog
          clienteId={clienteId}
          rfc={rfc}
          onClose={() => setAbierto(false)}
          onDone={() => {
            setAbierto(false);
            qc.invalidateQueries({ queryKey: ["sat", clienteId] });
            qc.invalidateQueries({ queryKey: ["sat-sync"] });
          }}
          conectar={conectar}
        />
      )}
    </section>
  );
}

function EFirmaDialog({
  clienteId,
  rfc,
  onClose,
  onDone,
  conectar,
}: {
  clienteId: string;
  rfc?: string | null;
  onClose: () => void;
  onDone: () => void;
  conectar: ReturnType<typeof useServerFn<typeof conectarSat>>;
}) {
  const [cer, setCer] = useState<File | null>(null);
  const [key, setKey] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const pwdRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // La contraseña nunca vive en estado de React ni se persiste: se lee del
  // input sólo al enviar y se limpia inmediatamente después.
  useEffect(() => {
    return () => {
      if (pwdRef.current) pwdRef.current.value = "";
    };
  }, []);

  const mut = useMutation({
    mutationFn: async () => {
      const pwd = pwdRef.current?.value ?? "";
      if (!cer || !key) throw new Error("Selecciona el certificado (.cer) y la llave privada (.key).");
      if (!pwd) throw new Error("Escribe la contraseña de la llave privada.");
      const [cer_b64, key_b64] = await Promise.all([fileToB64(cer), fileToB64(key)]);
      try {
        return await conectar({
          data: { cliente_id: clienteId, cer_b64, key_b64, password: pwd, consentimiento: true },
        });
      } finally {
        // Sólo la contraseña se descarta siempre; los archivos se conservan
        // para que un reintento no obligue a volver a seleccionarlos.
        if (pwdRef.current) pwdRef.current.value = "";
      }
    },
    onSuccess: () => {
      setCer(null);
      setKey(null);
      toast.success("e.firma validada y conectada. La descarga automática quedó activa.");
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });


  function elegir(tipo: "cer" | "key", f: File | null) {
    setError(null);
    if (!f) return tipo === "cer" ? setCer(null) : setKey(null);
    const ext = f.name.toLowerCase().split(".").pop();
    if (ext !== tipo) return setError(`El archivo debe tener extensión .${tipo}`);
    const max = tipo === "cer" ? MAX_CER : MAX_KEY;
    if (f.size === 0 || f.size > max) return setError(`El archivo .${tipo} no tiene un tamaño válido.`);
    tipo === "cer" ? setCer(f) : setKey(f);
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Conectar e.firma</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Expediente {rfc ? <span className="font-mono">{rfc}</span> : "activo"}. Los archivos se validan en el
              servidor y se guardan cifrados; la llave nunca se devuelve al navegador.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (mut.isPending) return;
            setError(null);
            mut.mutate();
          }}
          className="space-y-3"
        >
          <FileField label="Certificado (.cer)" accept=".cer" file={cer} onFile={(f) => elegir("cer", f)} />
          <FileField label="Llave privada (.key)" accept=".key" file={key} onFile={(f) => elegir("key", f)} />
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Contraseña de la llave privada</span>
            <input
              ref={pwdRef}
              type="password"
              placeholder="••••••••"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={256}
              required
              data-lpignore="true"
              className="h-10 px-3 rounded-lg bg-input/50 border border-border text-sm w-full focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>

          <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>
              Declaro que cuento con autorización expresa del contribuyente para resguardar su e.firma y usarla
              exclusivamente para consultar y descargar sus CFDI ante el SAT.
            </span>
          </label>

          {error && <div className="text-xs text-destructive bg-destructive/10 rounded-md p-2">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={mut.isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="hero" disabled={mut.isPending || !consent || !cer || !key}>
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {mut.isPending ? "Validando con el SAT…" : "Validar y conectar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FileField({
  label,
  accept,
  file,
  onFile,
}: {
  label: string;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      <input
        type="file"
        accept={accept}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
      />
      {file && <span className="text-[11px] text-muted-foreground mt-1 block">{file.name}</span>}
    </label>
  );
}
