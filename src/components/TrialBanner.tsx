import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, X, ArrowRight, ShieldCheck } from "lucide-react";
import { useEntitlements } from "@/lib/entitlements/use-entitlements";
import { useState, useEffect } from "react";

/**
 * Aviso de estado de cuenta. Lee el entitlement del servidor, por lo que ya no
 * puede mostrar combinaciones imposibles como "Plan Profesional · Trial 0 días".
 */
export function TrialBanner() {
  const { ent } = useEntitlements();
  const [dismissedWarning, setDismissedWarning] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setDismissedWarning(window.localStorage.getItem("trial-warning-dismissed") === "1");
    }
  }, []);

  if (!ent) return null;

  // Cortesía vigente: se informa, no se alarma.
  const cortesia = ent.excepciones?.find(
    (e) => e.tipo === "trial_extension" || e.tipo === "acceso_cortesia",
  );

  // Cuenta bloqueada (trial vencido sin plan ni cortesía).
  if (!ent.acceso) {
    return (
      <div className="bg-destructive/15 border-b border-destructive/30 text-destructive-foreground">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm font-medium">{ent.motivo_bloqueo}</p>
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

  // Con plan contratado no hay banner de trial: el trial dejó de existir.
  if (ent.plan) return null;

  if (cortesia) {
    const dias = Math.max(
      0,
      Math.ceil((new Date(cortesia.expira_at).getTime() - Date.now()) / 86400000),
    );
    return (
      <div className="bg-primary/10 border-b border-primary/25">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm font-medium">
            Tu cuenta opera con una ampliación autorizada por{" "}
            <strong>{dias} día{dias === 1 ? "" : "s"}</strong> más. Motivo: {cortesia.motivo}
          </p>
        </div>
      </div>
    );
  }

  if (!ent.trial?.activo) return null;
  const daysLeft = ent.trial.dias_restantes;

  if (daysLeft <= 3 && !dismissedWarning) {
    return (
      <div className="bg-warning/15 border-b border-warning/30 text-warning-foreground">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Clock className="h-5 w-5 shrink-0 text-warning" />
            <p className="text-sm font-medium">
              Tu prueba gratuita termina en{" "}
              <strong>
                {daysLeft} día{daysLeft === 1 ? "" : "s"}
              </strong>
              . Elige un plan antes de que se interrumpa el acceso.
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
