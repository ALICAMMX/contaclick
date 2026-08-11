import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, UserRound, AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useActiveCliente } from "@/lib/active-cliente";
import { Button } from "./ui/button";
import { HerramientaHelp } from "./HerramientaHelp";

export function ToolShell({
  title,
  description,
  icon,
  children,
  requireCliente = true,
  helpSlug,
  backTo,
  backLabel,
  backSearch,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  requireCliente?: boolean;
  /** Slug en src/lib/help/registry.ts. Si se pasa, muestra el botón "Ayuda" en la cabecera. */
  helpSlug?: string;
  /** Destino alterno del enlace de regreso (p. ej. el Centro de cierre). */
  backTo?: string;
  backLabel?: string;
  backSearch?: Record<string, string>;
}) {
  const { cliente } = useActiveCliente();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link
          to={(backTo ?? "/app/contable") as "/app/contable"}
          search={(backSearch ?? {}) as never}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {backLabel ?? "Volver a Contable y Fiscal"}
        </Link>

        <div className="flex items-center gap-2">
          {helpSlug && <HerramientaHelp slug={helpSlug} />}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-card/50 border border-border text-xs">
            <UserRound className="h-3.5 w-3.5 text-primary" />
            {cliente ? (
              <>
                <span className="font-medium">{cliente.rfc}</span>
                <span className="text-muted-foreground hidden sm:inline">· {cliente.razon_social}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Sin expediente activo</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-4">
        {icon && (
          <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-primary)" }}>
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
      </div>

      {requireCliente && !cliente ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-6 flex items-start gap-4">
          <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Selecciona un expediente para usar esta herramienta</div>
            <p className="text-sm text-muted-foreground mt-1">
              Cada herramienta opera sobre el RFC de un cliente concreto. Elige uno desde el selector de la barra superior, o crea uno nuevo.
            </p>
            <div className="mt-3">
              <Button variant="hero" size="sm" onClick={() => navigate({ to: "/app/clientes" })}>
                Ir a expedientes
              </Button>
            </div>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
