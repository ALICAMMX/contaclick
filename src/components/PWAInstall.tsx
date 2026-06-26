import { useEffect, useState, useCallback } from "react";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "./ui/button";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Singleton para compartir el evento entre banner y link del footer.
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
function setDeferred(e: BIPEvent | null) {
  deferred = e;
  listeners.forEach((l) => l());
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS
    window.navigator.standalone === true
  );
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
}

function usePWA() {
  const [, force] = useState(0);
  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    const tick = () => force((n) => n + 1);
    listeners.add(tick);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      listeners.delete(tick);
    };
  }, []);

  const install = useCallback(async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      return "native" as const;
    }
    return isIOS() ? ("ios" as const) : ("unsupported" as const);
  }, []);

  return { canInstall: !!deferred, installed: isStandalone(), install, ios: isIOS() };
}

const DISMISS_KEY = "pwa-banner-dismissed";

export function PWAInstallBanner() {
  const { canInstall, installed, install, ios } = usePWA();
  const [dismissed, setDismissed] = useState(true);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (installed || dismissed) return null;
  if (!canInstall && !ios) return null;

  const handleInstall = async () => {
    const r = await install();
    if (r === "ios") setIosHint(true);
  };

  const close = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-5 sm:bottom-5 sm:max-w-sm z-[55] rounded-xl border border-border/60 bg-card/95 backdrop-blur p-4 shadow-lg shadow-black/30"
    >
      <button
        onClick={close}
        aria-label="Cerrar"
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Instala ContaClick</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Accede más rápido desde tu pantalla de inicio, sin abrir el navegador.
          </p>
          {iosHint ? (
            <p className="text-xs text-muted-foreground mt-2">
              En iOS: toca <strong>Compartir</strong> y luego <strong>Agregar a inicio</strong>.
            </p>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="hero" onClick={handleInstall}>
                <Download className="h-3.5 w-3.5" /> Instalar
              </Button>
              <Button size="sm" variant="ghost" onClick={close}>Ahora no</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PWAInstallLink({ className }: { className?: string }) {
  const { canInstall, installed, install, ios } = usePWA();
  const [iosHint, setIosHint] = useState(false);
  if (installed) return null;
  if (!canInstall && !ios) return null;

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    const r = await install();
    if (r === "ios") setIosHint(true);
  };

  return (
    <button onClick={onClick} className={className ?? "hover:text-foreground inline-flex items-center gap-1"}>
      <Download className="h-3.5 w-3.5" />
      {iosHint ? "Compartir → Agregar a inicio" : "Instalar app"}
    </button>
  );
}
