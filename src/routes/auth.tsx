import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/Logo";
import { ensureUserWorkspace, getEntryContext } from "@/lib/auth-bootstrap.functions";
import { ensureDemoAccount } from "@/lib/demo/demo-account.functions";
import { seedDemo } from "@/lib/demo/demo.functions";
import { PlayCircle, ArrowLeft } from "lucide-react";
import {
  Sparkles,
  Mail,
  Lock,
  User as UserIcon,
  Building2,
  Eye,
  EyeOff,
  IdCard,
  Phone,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

type AuthFailure = {
  code?: string;
  message?: string;
};

const getAuthFailure = (err: unknown) => err as AuthFailure;

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
  const [telefono, setTelefono] = useState("");
  const [notRobot, setNotRobot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [formMessage, setFormMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [mfa, setMfa] = useState<{ factorId: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const navigate = useNavigate();
  const bootstrapWorkspace = useServerFn(ensureUserWorkspace);
  const getEntry = useServerFn(getEntryContext);
  const ensureDemo = useServerFn(ensureDemoAccount);
  const seedDemoFn = useServerFn(seedDemo);
  const [demoLoading, setDemoLoading] = useState(false);

  const hasClientRoleFallback = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return false;

    const { data } = await supabase
      .from("user_roles")
      .select("cliente_id")
      .eq("user_id", userId)
      .eq("role", "cliente_final")
      .not("cliente_id", "is", null)
      .limit(1)
      .maybeSingle();

    return !!data?.cliente_id;
  };

  const finishAuthenticatedEntry = async (payload: { fullName: string | null; despachoNombre: string | null }) => {
    const entry = await bootstrapWorkspace({ data: payload });
    const isClient = entry.isClient || (await hasClientRoleFallback());
    navigate({ to: isClient ? "/portal" : "/app", replace: true });
  };

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    setFormMessage(null);
    try {
      const { email: demoEmail, password: demoPassword } = await ensureDemo();
      const { error } = await supabase.auth.signInWithPassword({
        email: demoEmail,
        password: demoPassword,
      });
      if (error) throw error;
      await bootstrapWorkspace({ data: { fullName: "Cuenta Demo Contaclick", despachoNombre: "Despacho Demo Contaclick" } });
      try {
        await seedDemoFn();
      } catch {
        /* seed es idempotente; si falla no bloqueamos la demo */
      }
      toast.success("Entrando a la cuenta demo…");
      navigate({ to: "/app" });
    } catch (err: unknown) {
      const msg = getAuthFailure(err).message ?? "No se pudo abrir la cuenta demo.";
      setFormMessage({ type: "error", text: msg });
      toast.error(msg, { duration: 8000 });
    } finally {
      setDemoLoading(false);
    }
  };

  const isAlreadyRegisteredError = (err: unknown) => {
    const authError = getAuthFailure(err);
    const raw = (authError.message ?? "").toLowerCase();
    const code = (authError.code ?? "").toLowerCase();
    return (
      code === "user_already_exists" ||
      raw.includes("already registered") ||
      raw.includes("user already")
    );
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") return; // requiere 2FA, no auto-entrar
      const entry = await getEntry();
      const isClient = entry.isClient || (await hasClientRoleFallback());
      navigate({ to: isClient ? "/portal" : "/app", replace: true });
    });
  }, [getEntry, navigate]);

  const sendPasswordReset = async () => {
    if (!email.trim()) {
      const msg = "Escribe tu correo para enviarte el enlace de acceso.";
      setFormMessage({ type: "error", text: msg });
      toast.error(msg);
      return;
    }
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      const msg = "Te envié un enlace para crear o restablecer tu contraseña.";
      setFormMessage({ type: "success", text: msg });
      toast.success(msg);
    } catch (err: unknown) {
      const authError = getAuthFailure(err);
      const msg = authError.message ?? "No se pudo enviar el enlace. Intenta de nuevo.";
      setFormMessage({ type: "error", text: msg });
      toast.error(msg, { duration: 8000 });
    } finally {
      setResetLoading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMessage(null);
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
              telefono: telefono.trim(),
            },
          },
        });
        if (error) {
          if (isAlreadyRegisteredError(error)) {
            const { error: signInErr } = await supabase.auth.signInWithPassword({
              email,
              password,
            });
            if (!signInErr) {
              await finishAuthenticatedEntry({ fullName: `${nombre.trim()} ${apellidos.trim()}`, despachoNombre: despacho.trim() });
              toast.success("Ya tenías cuenta. Sesión iniciada.");
              setFormMessage({ type: "success", text: "Ya tenías cuenta. Sesión iniciada." });
              return;
            }
            const providerMessage = "Ese correo ya existe y fue creado con Google. Como Google está deshabilitado temporalmente, usa otro correo o restablece una contraseña para este correo.";
            toast.error(
              providerMessage,
              { duration: 9000 },
            );
            setFormMessage({ type: "error", text: providerMessage });
            setMode("login");
            return;
          }
          throw error;
        }
        if (data.session) {
          await finishAuthenticatedEntry({ fullName, despachoNombre: despacho.trim() });
          toast.success("¡Cuenta creada! Bienvenido.");
          setFormMessage({ type: "success", text: "¡Cuenta creada! Bienvenido." });
        } else {
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (signInErr) {
            const successMessage = "Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesión.";
            toast.success(successMessage);
            setFormMessage({ type: "success", text: successMessage });
            setMode("login");
          } else {
            await finishAuthenticatedEntry({ fullName, despachoNombre: despacho.trim() });
            setFormMessage({ type: "success", text: "¡Cuenta creada! Bienvenido." });
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
          const { data: list } = await supabase.auth.mfa.listFactors();
          const totp = list?.totp?.find((f) => f.status === "verified");
          if (totp) {
            setMfa({ factorId: totp.id });
            setLoading(false);
            return;
          }
        }
        await finishAuthenticatedEntry({ fullName: null, despachoNombre: null });
      }
    } catch (err: unknown) {
      const authError = getAuthFailure(err);
      const raw = (authError.message ?? "").toLowerCase();
      const code = (authError.code ?? "").toLowerCase();
      let msg = authError.message ?? "Algo salió mal";
      if (code === "weak_password" || raw.includes("weak") || raw.includes("pwned")) {
        msg = "Esa contraseña es demasiado común o ha aparecido en filtraciones públicas. Usa una más segura: combina mayúsculas, minúsculas, números y símbolos (mínimo 10 caracteres).";
      } else if (isAlreadyRegisteredError(err)) {
        msg = "Ya existe una cuenta con ese correo. Inicia sesión.";
      } else if (raw.includes("invalid login")) {
        msg = "Correo o contraseña incorrectos.";
      } else if (raw.includes("email") && raw.includes("invalid")) {
        msg = "El correo no es válido.";
      }
      setFormMessage({ type: "error", text: msg });
      toast.error(msg, { duration: 8000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2">
            <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" /> Volver al inicio
            </Link>
          </div>
          <Link to="/"><Logo /></Link>
          <h1 className="text-3xl font-semibold tracking-tight mt-8">
            {mode === "login" ? "Bienvenido de vuelta" : "Crea tu despacho"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" ? "Ingresa para continuar con tus clientes." : "Empieza gratis. Sin tarjeta."}
          </p>

          <form onSubmit={onSubmit} className="space-y-3 mt-6">
            {formMessage && (
              <div
                role="alert"
                className={`rounded-lg border px-3 py-2 text-sm ${
                  formMessage.type === "error"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-primary/40 bg-primary/10 text-primary"
                }`}
              >
                {formMessage.text}
              </div>
            )}
            {mode === "signup" && (
              <>
                <Field icon={UserIcon} placeholder="Nombre(s)" value={nombre} onChange={setNombre} required />
                <Field icon={IdCard} placeholder="Apellidos" value={apellidos} onChange={setApellidos} required />
                <Field icon={Phone} type="tel" placeholder="Teléfono (10 dígitos)" value={telefono} onChange={setTelefono} required />
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
                <label className="flex items-start gap-2 pt-1 text-sm text-muted-foreground cursor-pointer">
                  <Checkbox
                    className="mt-0.5"
                    checked={notRobot}
                    onCheckedChange={(v) => setNotRobot(v === true)}
                  />
                  <span>
                    No soy un robot y acepto el{" "}
                    <Link
                      to="/privacidad"
                      target="_blank"
                      className="underline text-foreground hover:text-primary"
                    >
                      Aviso de Privacidad
                    </Link>{" "}
                    de Contaclick, administrado por Grupo ALICAM, así como el tratamiento de mis
                    datos personales para la prestación del servicio.
                  </span>
                </label>
              </>
            )}

            <Button type="submit" variant="hero" className="w-full h-11" disabled={loading}>
              {loading ? "..." : mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </Button>
            {mode === "login" && (
              <button
                type="button"
                onClick={sendPasswordReset}
                disabled={resetLoading || loading}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                {resetLoading ? "Enviando enlace…" : "Crear o restablecer contraseña"}
              </button>
            )}
          </form>

          <div className="mt-5 pt-5 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 gap-2"
              onClick={handleDemoLogin}
              disabled={demoLoading || loading}
            >
              <PlayCircle className="h-4 w-4" />
              {demoLoading ? "Abriendo demo…" : "Probar demo (sin registrarse)"}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Explora la herramienta con datos de ejemplo. Para empezar a trabajar con tus clientes,
              <button onClick={() => setMode("signup")} className="text-primary hover:underline ml-1">
                regístrate gratis
              </button>.
            </p>
          </div>

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
