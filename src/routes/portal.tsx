import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { getPortalContext } from "@/lib/portal/portal.functions";
import { Home, FileText, Wallet, Receipt, BarChart3, MessageSquare, Upload, LogOut, Building2, Activity } from "lucide-react";
import { BrandSpinner } from "@/components/BrandSpinner";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/portal")({
  component: PortalLayout,
  head: () => ({ meta: [{ title: "Portal del Cliente" }] }),
});

function PortalLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fetchCtx = useServerFn(getPortalContext);

  const { data: ctx, isLoading } = useQuery({
    queryKey: ["portal-context"],
    queryFn: () => fetchCtx(),
    enabled: !!user,
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    // Si el usuario no es cliente_final, mándalo a /app
    if (!isLoading && ctx && !ctx.isClient) navigate({ to: "/app" });
  }, [isLoading, ctx, navigate]);

  if (loading || isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Sparkles className="h-5 w-5 text-primary animate-pulse" /> Cargando portal...
        </div>
      </div>
    );
  }

  if (!ctx || !ctx.isClient) return null;
  const { cliente, despacho, config } = ctx;

  const nav: { to: string; label: string; icon: any; show: boolean }[] = [
    { to: "/portal", label: "Inicio", icon: Home, show: config.ver_dashboard },
    { to: "/portal/salud-fiscal", label: "Salud Fiscal", icon: Activity, show: (config as any).ver_salud_fiscal !== false },
    { to: "/portal/cfdi", label: "Mis CFDI", icon: FileText, show: config.ver_cfdi },
    { to: "/portal/estado-cuenta", label: "Estado de cuenta", icon: Wallet, show: config.ver_cxc || config.ver_cxp },
    { to: "/portal/impuestos", label: "Impuestos", icon: Receipt, show: config.ver_impuestos || config.ver_obligaciones },
    { to: "/portal/reportes", label: "Reportes", icon: BarChart3, show: config.ver_reportes },
    { to: "/portal/mensajes", label: "Mensajes", icon: MessageSquare, show: config.ver_mensajes },
    { to: "/portal/documentos", label: "Documentos", icon: Upload, show: config.puede_subir_docs },
  ].filter((n) => n.show);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <div className="hidden sm:block border-l border-border pl-3">
              <div className="text-xs text-muted-foreground">Portal de cliente</div>
              <div className="text-sm font-semibold truncate max-w-[260px]">{cliente.razon_social}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {despacho && (
              <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" /> Atendido por <strong className="text-foreground">{despacho.nombre}</strong>
              </div>
            )}
            <button
              onClick={async () => { await signOut(); navigate({ to: "/auth", replace: true }); }}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" /> Salir
            </button>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {nav.map((item) => {
            const active = location.pathname === item.to || (item.to !== "/portal" && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors ${
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" /> {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
