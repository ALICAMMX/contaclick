import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, X, ArrowRight } from "lucide-react";
import { useDespacho } from "@/lib/despacho/use-despacho";
import { useState, useEffect } from "react";

export function TrialBanner() {
  const { despacho } = useDespacho();
  const [dismissedWarning, setDismissedWarning] = useState(false);

  // Restore dismissed state from localStorage (only for warning, not expired)
  useEffect(() => {
    if (typeof window !== "undefined") {
      setDismissedWarning(window.localStorage.getItem("trial-warning-dismissed") === "1");
    }
  }, []);

  if (!despacho || despacho.plan_id || despacho.estado !== "trial") return null;

  const trialEnd = despacho.trial_ends_at ? new Date(despacho.trial_ends_at) : null;
  if (!trialEnd) return null;

  const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000));

  // EXPIRED — urgent non-dismissible banner
  if (daysLeft === 0) {
    return (
      <div className="bg-destructive/15 border-b border-destructive/30 text-destructive-foreground">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm font-medium">
              Tu prueba gratuita ha vencido. Elige un plan para seguir usando ContaClick sin interrupciones.
            </p>
          </div>
          <Link
            to="/precios"
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-destructive text-white text-xs font-semibold hover:bg-destructive/90 transition-colors"
          >
            Ver planes <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // WARNING — 1-3 days left, dismissible
  if (daysLeft <= 3 && !dismissedWarning) {
    return (
      <div className="bg-warning/15 border-b border-warning/30 text-warning-foreground">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Clock className="h-5 w-5 shrink-0 text-warning" />
            <p className="text-sm font-medium">
              Tu prueba gratuita termina en <strong>{daysLeft} días</strong>. Elige un plan antes de que se interrumpa el acceso.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/precios"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-warning text-warning-foreground text-xs font-semibold hover:bg-warning/90 transition-colors"
            >
              Ver planes <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={() => {
                setDismissedWarning(true);
                if (typeof window !== "undefined") {
                  window.localStorage.setItem("trial-warning-dismissed", "1");
                }
              }}
              className="h-8 w-8 rounded-md border border-warning/40 grid place-items-center text-warning-foreground hover:bg-warning/20 transition-colors"
              title="Cerrar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
