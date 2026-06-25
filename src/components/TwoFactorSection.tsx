import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert, Loader2, KeyRound, Trash2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

type Factor = { id: string; friendly_name?: string | null; factor_type: string; status: string };

export function TwoFactorSection() {
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [pending, setPending] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) toast.error(error.message);
    setFactors((data?.totp ?? []) as Factor[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startEnroll = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `ContaClick · ${new Date().toLocaleDateString("es-MX")}`,
      });
      if (error) throw error;
      setPending({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnrolling(false);
    }
  };

  const verifyEnroll = async () => {
    if (!pending || code.length < 6) return;
    setVerifying(true);
    try {
      const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId: pending.factorId });
      if (e1) throw e1;
      const { error: e2 } = await supabase.auth.mfa.verify({
        factorId: pending.factorId,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (e2) throw e2;
      toast.success("Verificación en dos pasos activada");
      setPending(null);
      setCode("");
      await load();
    } catch (e) {
      toast.error((e as Error).message || "Código inválido");
    } finally {
      setVerifying(false);
    }
  };

  const cancelEnroll = async () => {
    if (!pending) return;
    await supabase.auth.mfa.unenroll({ factorId: pending.factorId });
    setPending(null);
    setCode("");
  };

  const remove = async (factorId: string) => {
    if (!confirm("¿Desactivar la verificación en dos pasos? Tu cuenta quedará menos protegida.")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return toast.error(error.message);
    toast.success("2FA desactivado");
    await load();
  };

  const active = factors.find((f) => f.status === "verified");

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-4">
      <div className="flex items-center gap-2">
        {active ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <ShieldAlert className="h-4 w-4 text-amber-500" />}
        <h2 className="font-semibold">Verificación en dos pasos (2FA)</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Protege tu cuenta exigiendo un código de 6 dígitos de Google Authenticator, Authy o 1Password al iniciar sesión.
        Recomendado para propietarios de despacho.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
      ) : pending ? (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="text-sm font-medium">Escanea el código QR</div>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <img src={pending.qr} alt="QR 2FA" className="h-40 w-40 rounded bg-white p-2" />
            <div className="flex-1 space-y-2">
              <div className="text-xs text-muted-foreground">O ingresa esta clave manual:</div>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono break-all bg-background border border-border rounded px-2 py-1 flex-1">{pending.secret}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(pending.secret); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="h-7 w-7 grid place-items-center rounded border border-border hover:bg-accent"
                  aria-label="Copiar"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <label className="text-xs text-muted-foreground block mt-3">Código de 6 dígitos de la app:</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                className="w-full h-10 px-3 rounded-md bg-background border border-border text-sm font-mono tracking-widest"
              />
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={verifyEnroll} disabled={code.length !== 6 || verifying}>
                  {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Activar 2FA
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEnroll}>Cancelar</Button>
              </div>
            </div>
          </div>
        </div>
      ) : active ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="text-sm">
            <div className="font-medium text-emerald-500">2FA activo</div>
            <div className="text-xs text-muted-foreground">{active.friendly_name ?? "App autenticadora"}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => remove(active.id)}>
            <Trash2 className="h-4 w-4" /> Desactivar
          </Button>
        </div>
      ) : (
        <Button size="sm" onClick={startEnroll} disabled={enrolling}>
          {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Activar 2FA
        </Button>
      )}

      {/* Limpia factores no verificados huérfanos */}
      {factors.some((f) => f.status !== "verified") && !pending && (
        <button
          onClick={async () => {
            for (const f of factors.filter((x) => x.status !== "verified")) {
              await supabase.auth.mfa.unenroll({ factorId: f.id });
            }
            await load();
          }}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Limpiar enrolamientos pendientes
        </button>
      )}
    </div>
  );
}
