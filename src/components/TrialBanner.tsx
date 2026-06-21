import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, X, Sparkles } from "lucide-react";
import { useDespacho } from "@/lib/despacho/use-despacho";

const DISMISS_KEY = "cc.trial-banner.dismissed";

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function TrialBanner() {
  const { despacho } = useDespacho();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  });

  if (!despacho || despacho.estado !== "trial") return null;

  const dias = daysUntil(despacho.trial_ends_at);
  if (dias === null) return null;

  const expirado = dias <= 0;
  // Solo mostrar si quedan ≤7 días o ya expiró
  if (dias > 7) return null;
  // Si está expirado no se puede ocultar
  if (dismissed && !expirado) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      className={
        expirado
          ? "border-b border-destructive/30 bg-destructive/5"
          : "border-b border-warning/30 bg-warning/5"
      }
    >
      <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center gap-3 text-sm">
        {expirado ? (
          <Clock className="h-4 w-4 text-destructive shrink-0" />
        ) : (
          <Sparkles className="h-4 w-4 text-warning shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          {expirado ? (
            <span>
              <span className="font-medium text-destructive">Tu período de prueba terminó.</span>{" "}
              <span className="text-muted-foreground">
                Contrata un plan para seguir usando todas las herramientas.
              </span>
            </span>
          ) : (
            <span>
              <span className="font-medium">
                {dias === 1 ? "Último día" : `Quedan ${dias} días`} de prueba.
              </span>{" "}
              <span className="text-muted-foreground">Elige un plan para no perder el acceso.</span>
            </span>
          )}
        </div>
        <Link
          to="/precios"
          className={
            expirado
              ? "h-7 px-3 rounded-md bg-destructive text-destructive-foreground text-xs font-medium grid place-items-center hover:opacity-90"
              : "h-7 px-3 rounded-md bg-foreground text-background text-xs font-medium grid place-items-center hover:opacity-90"
          }
        >
          Ver planes
        </Link>
        {!expirado && (
          <button
            onClick={handleDismiss}
            title="Ocultar por esta sesión"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
