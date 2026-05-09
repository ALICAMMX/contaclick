import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Sparkles, Mail, Lock, User as UserIcon, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [despacho, setDespacho] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName, despacho_nombre: despacho },
          },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Revisa tu correo para confirmar.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Algo salió mal");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/dashboard`,
      });
      if (result.error) toast.error("No se pudo iniciar sesión con Google");
      else if (!result.redirected) navigate({ to: "/dashboard" });
    } catch {
      toast.error("Error con Google");
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link to="/"><Logo /></Link>
          <h1 className="text-3xl font-semibold tracking-tight mt-8">
            {mode === "login" ? "Bienvenido de vuelta" : "Crea tu despacho"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" ? "Ingresa para continuar con tus clientes." : "Empieza gratis. Sin tarjeta."}
          </p>

          <Button onClick={onGoogle} variant="glass" className="w-full mt-6 h-11">
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M21.35 11.1h-9.17v2.92h5.27c-.23 1.41-1.66 4.13-5.27 4.13-3.17 0-5.76-2.62-5.76-5.85s2.59-5.85 5.76-5.85c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.94 4.06 14.83 3 12.18 3 7.13 3 3 7.13 3 12.18s4.13 9.18 9.18 9.18c5.3 0 8.82-3.72 8.82-8.97 0-.6-.07-1.06-.15-1.29z"/></svg>
            Continuar con Google
          </Button>

          <div className="flex items-center gap-3 my-5 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" /> o con email <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            {mode === "signup" && (
              <>
                <Field icon={UserIcon} placeholder="Nombre completo" value={fullName} onChange={setFullName} />
                <Field icon={Building2} placeholder="Nombre del despacho" value={despacho} onChange={setDespacho} />
              </>
            )}
            <Field icon={Mail} type="email" placeholder="tu@email.com" value={email} onChange={setEmail} required />
            <Field icon={Lock} type="password" placeholder="Contraseña" value={password} onChange={setPassword} required />

            <Button type="submit" variant="hero" className="w-full h-11" disabled={loading}>
              {loading ? "..." : mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground text-center mt-5">
            {mode === "login" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
            <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="text-primary hover:underline">
              {mode === "login" ? "Regístrate" : "Inicia sesión"}
            </button>
          </p>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative overflow-hidden border-l border-border/50">
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="relative max-w-md text-center">
          <div className="h-14 w-14 rounded-2xl mx-auto flex items-center justify-center mb-6" style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}>
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">
            La IA que tu <span className="gradient-text">despacho</span> estaba esperando.
          </h2>
          <p className="text-muted-foreground mt-4">
            Analiza CFDI, concilia bancos y detecta riesgos fiscales en minutos. No en horas.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, ...props }: { icon: typeof Mail; placeholder: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required}
        className="w-full h-11 pl-10 pr-3 rounded-lg bg-input/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
