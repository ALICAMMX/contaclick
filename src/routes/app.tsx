import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ActiveClienteProvider } from "@/lib/active-cliente";
import { useAuth } from "@/lib/auth";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/app")({
  component: AppRoot,
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
