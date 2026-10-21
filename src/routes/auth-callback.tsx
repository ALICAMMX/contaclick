import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ensureUserWorkspace } from "@/lib/auth-bootstrap.functions";
import { safeNext, takeReturnPath } from "@/lib/auth-entry";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { BrandSpinner } from "@/components/BrandSpinner";

export const Route = createFileRoute("/auth-callback")({
  head: () => ({
    meta: [
      { title: "Cerrando tu acceso | Contaclick" },
      { name: "description", content: "Estamos terminando de preparar tu acceso a Contaclick." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallbackPage,
});

const WAIT_LIMIT_MS = 12_000;
const POLL_MS = 400;

/**
 * Picks up tokens the auth broker may hand back in the address bar and stores
 * them as the active session. Returns true when a session was established here.
 */
async function adoptTokensFromUrl(): Promise<boolean> {
  const raw = `${window.location.search}${window.location.hash}`.replace(/^[?#]/, "");
  if (!raw) return false;
  const params = new URLSearchParams(raw);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken) return false;
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken ?? "",
  });
  return !error;
}

function AuthCallbackPage() {
  const bootstrapWorkspace = useServerFn(ensureUserWorkspace);
  const [phase, setPhase] = useState<"waiting" | "failed">("waiting");
  const [detail, setDetail] = useState("");
  const runningRef = useRef(false);

  const run = useCallback(async () => {
    setPhase("waiting");
    setDetail("");

    const deadline = Date.now() + WAIT_LIMIT_MS;
    let session = (await supabase.auth.getSession()).data.session;
    if (!session && (await adoptTokensFromUrl())) {
      session = (await supabase.auth.getSession()).data.session;
    }

    while (!session && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      session = (await supabase.auth.getSession()).data.session;
    }

    if (!session) {
      setDetail("Tu acceso con Google no terminó de completarse.");
      setPhase("failed");
      return;
    }

    // An account with 2FA still owes a code. /auth owns that screen, so we
    // send the user there rather than opening the app at a lower assurance level.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      window.location.assign("/auth");
      return;
    }

    const entry = await bootstrapWorkspace({ data: { fullName: null, despachoNombre: null } });
    const destination = safeNext(takeReturnPath(), entry.isClient ? "/portal" : "/app");
    // Hard navigation: the client-side router races the SIGNED_IN cache reset
    // in __root.tsx, which used to bounce the user back to the site home.
    window.location.assign(destination);
  }, [bootstrapWorkspace]);

  useEffect(() => {
    if (runningRef.current) return;
    runningRef.current = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setDetail("La sesión se cerró antes de terminar.");
        setPhase("failed");
      }
    });

    void run().catch((err: unknown) => {
      setDetail(err instanceof Error ? err.message : "No se pudo completar tu acceso.");
      setPhase("failed");
    });

    return () => sub.subscription.unsubscribe();
  }, [run]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center">
          <Logo />
        </div>

        {phase === "waiting" ? (
          <div className="mt-8 flex flex-col items-center gap-4">
            <BrandSpinner />
            <p className="text-sm text-muted-foreground">
              Preparando tu acceso… Si tardas unos segundos, no cierres esta ventana.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {detail || "No se pudo completar tu acceso."}
            </div>
            <p className="text-sm text-muted-foreground">
              Puede que el acceso con Google se haya cancelado o haya tardado demasiado.
            </p>
            <div className="flex flex-col gap-2">
              <Button type="button" variant="hero" className="h-11" onClick={() => void run()}>
                Reintentar
              </Button>
              <Button type="button" variant="outline" className="h-11" asChild>
                <Link to="/auth">Entrar con mi contraseña</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
