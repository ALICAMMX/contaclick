import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ActiveClienteProvider } from "@/lib/active-cliente";
import { useAuth } from "@/lib/auth";
import { Sparkles, Home, Wrench, FolderOpen, ArrowLeft } from "lucide-react";

function AppNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-6">
        <span className="text-3xl font-bold text-muted-foreground">404</span>
      </div>
      <h2 className="text-xl font-semibold text-foreground">Página no encontrada</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        La ruta que intentas acceder no existe o está en construcción. Vuelve al inicio o explora las herramientas disponibles.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link
          to="/app"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Home className="h-4 w-4" /> Inicio
        </Link>
        <Link
          to="/app/contable"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Wrench className="h-4 w-4" /> Contable y Fiscal
        </Link>
        <Link
          to="/app/clientes"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <FolderOpen className="h-4 w-4" /> Expedientes
        </Link>
      </div>
      <button
        onClick={() => window.history.back()}
        className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Regresar
      </button>
    </div>
  );
}

export const Route = createFileRoute("/app")({
  component: AppRoot,
  notFoundComponent: AppNotFound,
});

function AppRoot() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Sparkles className="h-5 w-5 text-primary animate-pulse" /> Cargando...
        </div>
      </div>
    );
  }

  return (
    <ActiveClienteProvider>
      <AppLayout />
    </ActiveClienteProvider>
  );
}
