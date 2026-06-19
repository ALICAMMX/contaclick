import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/Logo";
import { Sparkles, Mail, Lock, User as UserIcon, Building2, Eye, EyeOff, IdCard } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [despacho, setDespacho] = useState("");
  const [notRobot, setNotRobot] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const isAlreadyRegisteredError = (err: any) => {
    const raw = (err?.message ?? "").toLowerCase();
    const code = (err?.code ?? "").toLowerCase();
    return code === "user_already_exists" || raw.includes("already registered") || raw.includes("user already");
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup") {
      if (!nombre.trim() || !apellidos.trim()) return toast.error("Ingresa tu nombre y apellidos");
      if (!despacho.trim()) return toast.error("Ingresa el nombre del despacho");
      if (password.length < 8) return toast.error("La contraseña debe tener al menos 8 caracteres");
      if (password !== password2) return toast.error("Las contraseñas no coinciden");
      if (!notRobot) return toast.error("Confirma que no eres un robot");
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const fullName = `${nombre.trim()} ${apellidos.trim()}`;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: {
              full_name: fullName,
              nombre: nombre.trim(),
              apellidos: apellidos.trim(),
              despacho_nombre: despacho.trim(),
            },
          },
        });
        if (error) {
          if (isAlreadyRegisteredError(error)) {
            const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
            if (!signInErr) {
              toast.success("Ya tenías cuenta. Sesión iniciada.");
              navigate({ to: "/app" });
              return;
            }
            toast.error("Ese correo ya tiene una cuenta, pero la contraseña no coincide. Cambié a inicio de sesión para que pruebes o recuperes acceso.", { duration: 9000 });
            setMode("login");
            return;
          }
          throw error;
        }
        if (data.session) {
          toast.success("¡Cuenta creada! Bienvenido.");
          navigate({ to: "/app" });
        } else {
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (signInErr) {
            toast.success("Cuenta creada. Revisa tu correo para confirmar.");
            setMode("login");
          } else {
            navigate({ to: "/app" });
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/app" });
      }
    } catch (err: any) {
      const raw = (err?.message ?? "").toLowerCase();
      const code = (err?.code ?? "").toLowerCase();
      let msg = err?.message ?? "Algo salió mal";
      if (code === "weak_password" || raw.includes("weak") || raw.includes("pwned")) {
        msg = "Esa contraseña es demasiado común o ha aparecido en filtraciones públicas. Usa una más segura: combina mayúsculas, minúsculas, números y símbolos (mínimo 10 caracteres).";
      } else if (isAlreadyRegisteredError(err)) {
        msg = "Ya existe una cuenta con ese correo. Inicia sesión.";
      } else if (raw.includes("invalid login")) {
        msg = "Correo o contraseña incorrectos.";
      } else if (raw.includes("email") && raw.includes("invalid")) {
        msg = "El correo no es válido.";
      }
      toast.error(msg, { duration: 8000 });
    } finally {
      setLoading(false);
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

          <form onSubmit={onSubmit} className="space-y-3 mt-6">
            {mode === "signup" && (
              <>
                <Field icon={UserIcon} placeholder="Nombre(s)" value={nombre} onChange={setNombre} required />
                <Field icon={IdCard} placeholder="Apellidos" value={apellidos} onChange={setApellidos} required />
                <Field icon={Building2} placeholder="Nombre del despacho" value={despacho} onChange={setDespacho} required />
              </>
            )}
            <Field icon={Mail} type="email" placeholder="tu@email.com" value={email} onChange={setEmail} required />
            <PasswordField
              placeholder="Contraseña"
              value={password}
              onChange={setPassword}
              show={showPass}
              onToggle={() => setShowPass((s) => !s)}
            />
            {mode === "signup" && (
              <>
                <PasswordField
                  placeholder="Repite la contraseña"
                  value={password2}
                  onChange={setPassword2}
                  show={showPass2}
                  onToggle={() => setShowPass2((s) => !s)}
                />
                <label className="flex items-center gap-2 pt-1 text-sm text-muted-foreground cursor-pointer">
                  <Checkbox checked={notRobot} onCheckedChange={(v) => setNotRobot(v === true)} />
                  No soy un robot
                </label>
              </>
            )}

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

function PasswordField({ placeholder, value, onChange, show, onToggle }: { placeholder: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void }) {
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
