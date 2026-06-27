import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppLayout } from "@/components/AppLayout";
import { ActiveClienteProvider } from "@/lib/active-cliente";
import { useAuth } from "@/lib/auth";
import { getEntryContext } from "@/lib/auth-bootstrap.functions";
import { supabase } from "@/integrations/supabase/client";
import { BrandSpinner } from "@/components/BrandSpinner";
import { Home, Wrench, FolderOpen, ArrowLeft } from "lucide-react";

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
  const fetchEntryContext = useServerFn(getEntryContext);
  const resolveClientFallback = async () => {
    if (!user?.id) return null;
    const { data } = await supabase
      .from("user_roles")
      .select("despacho_id, cliente_id")
      .eq("user_id", user.id)
      .eq("role", "cliente_final")
      .not("cliente_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (!data?.cliente_id) return null;
    return {
      ok: true as const,
      isClient: true as const,
      despachoId: data.despacho_id,
      clienteId: data.cliente_id,
    };
  };

  const entryContext = useQuery({
    queryKey: ["entry-context", "app-guard", user?.id],
    queryFn: async () => {
      try {
        const entry = await fetchEntryContext();
        if (entry.isClient) return entry;
        return (await resolveClientFallback()) ?? entry;
      } catch {
        return (await resolveClientFallback()) ?? { ok: true as const, isClient: false as const };
      }
    },
    enabled: !!user,
    retry: 1,
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (entryContext.data?.isClient) navigate({ to: "/portal", replace: true });
  }, [entryContext.data?.isClient, navigate]);

  if (loading || !user || entryContext.isLoading || entryContext.data?.isClient) {
    return <BrandSpinner fullscreen size="lg" label="Cargando ContaClick" />;
  }

  return (
    <ActiveClienteProvider>
      <AppLayout />
    </ActiveClienteProvider>
  );
}
