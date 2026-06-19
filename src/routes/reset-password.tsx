import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setMessage({ type: "error", text: "La contraseña debe tener al menos 8 caracteres." });
      return;
    }
    if (password !== password2) {
      setMessage({ type: "error", text: "Las contraseñas no coinciden." });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Contraseña actualizada. Ya puedes entrar.");
      navigate({ to: "/app" });
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : "No se pudo actualizar la contraseña.";
      setMessage({ type: "error", text });
      toast.error(text, { duration: 8000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link to="/">
            <Logo />
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight mt-8">Nueva contraseña</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define una contraseña para entrar con email.
          </p>

          {!ready && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-sm mt-6">
              Abre esta página desde el enlace que te enviamos por correo.
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-3 mt-6">
            {message && (
              <div
                role="alert"
                className={`rounded-lg border px-3 py-2 text-sm ${
                  message.type === "error"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-primary/40 bg-primary/10 text-primary"
                }`}
              >
                {message.text}
              </div>
            )}
            <PasswordField
              placeholder="Nueva contraseña"
              value={password}
              onChange={setPassword}
              show={showPass}
              onToggle={() => setShowPass((s) => !s)}
            />
            <PasswordField
              placeholder="Repite la contraseña"
              value={password2}
              onChange={setPassword2}
              show={showPass2}
              onToggle={() => setShowPass2((s) => !s)}
            />
            <Button type="submit" variant="hero" className="w-full h-11" disabled={loading || !ready}>
              {loading ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </form>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative overflow-hidden border-l border-border/50">
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="relative max-w-md text-center">
          <div
            className="h-14 w-14 rounded-2xl mx-auto flex items-center justify-center mb-6"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">
            Acceso seguro para tu <span className="gradient-text">despacho</span>.
          </h2>
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  placeholder,
  value,
  onChange,
  show,
  onToggle,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full h-11 pl-10 pr-10 rounded-lg bg-input/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}