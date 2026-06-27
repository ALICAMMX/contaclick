import { Link, useLocation } from "@tanstack/react-router";
import { Lock, ArrowRight } from "lucide-react";
import { useDespacho } from "@/lib/despacho/use-despacho";
import type { ReactNode } from "react";

// Rutas permitidas aunque el trial haya vencido (para que el usuario pueda pagar / cerrar sesión / ver equipo).
const ALLOWED_PREFIXES = [
  "/app/checkout",
  "/app/configuracion",
  "/app/admin-panel",
  "/app/equipo",
  "/precios",
];

export function TrialGate({ children }: { children: ReactNode }) {
  const { despacho } = useDespacho();
  const location = useLocation();

  const expired = (() => {
    if (!despacho || despacho.estado !== "trial") return false;
    if (!despacho.trial_ends_at) return false;
    return new Date(despacho.trial_ends_at).getTime() <= Date.now();
  })();

  if (!expired) return <>{children}</>;

  const onAllowed = ALLOWED_PREFIXES.some((p) => location.pathname.startsWith(p));
  if (onAllowed) return <>{children}</>;

  return (
    <div className="min-h-[60vh] grid place-items-center px-6">
      <div className="max-w-lg w-full rounded-2xl border border-destructive/30 bg-card shadow-xl p-8 text-center">
        <div className="h-14 w-14 rounded-full bg-destructive/15 grid place-items-center mx-auto mb-4">
          <Lock className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Tu prueba gratuita ha vencido</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Para seguir usando las herramientas de ContaClick necesitas elegir un plan. Tus datos y expedientes
          siguen seguros y estarán disponibles en cuanto actives tu suscripción.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Link
            to="/precios"
            className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-md bg-destructive text-white text-sm font-semibold hover:bg-destructive/90 transition-colors"
          >
            Ver planes <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/app/configuracion"
            className="inline-flex items-center justify-center h-10 px-5 rounded-md border border-border bg-card text-sm font-medium hover:bg-accent transition-colors"
          >
            Ir a configuración
          </Link>
        </div>
      </div>
    </div>
  );
}
