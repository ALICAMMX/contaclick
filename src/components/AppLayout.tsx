import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { LogOut, ChevronDown, UserRound, X, Settings, Building2, Command, Calculator, Briefcase, Scale } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { useAuth } from "@/lib/auth";
import { useActiveCliente } from "@/lib/active-cliente";
import { useDespacho } from "@/lib/despacho/use-despacho";
import { Toaster } from "sonner";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listClientes } from "@/lib/clientes.functions";

type ModuleKey = "contable" | "admin" | "legal";

const MODULES: { key: ModuleKey; label: string; href: string; icon: React.ComponentType<{ className?: string }>; accent: string }[] = [
  { key: "contable", label: "Contable & Fiscal", href: "/app/contable", icon: Calculator, accent: "text-primary" },
  { key: "admin", label: "Administrativo", href: "/app/admin", icon: Briefcase, accent: "text-[oklch(0.85_0.13_85)]" },
  { key: "legal", label: "Inteligencia Legal", href: "/app/legal", icon: Scale, accent: "text-[oklch(0.78_0.15_155)]" },
];

const CONTEXT_NAV: Record<ModuleKey, { label: string; href: string }[]> = {
  contable: [
    { label: "Command Center", href: "/app" },
    { label: "Riesgo SAT", href: "/app/riesgo" },
    { label: "Herramientas", href: "/app/contable/herramientas" },
    { label: "Agentes IA", href: "/app/contable/agentes" },
    { label: "CFDI", href: "/app/cfdi" },
    { label: "Conciliación", href: "/app/conciliacion" },
    { label: "Reportes", href: "/app/reportes" },
  ],
  admin: [
    { label: "Resumen", href: "/app/admin" },
    { label: "Nómina IA", href: "/app/admin/nomina" },
    { label: "Cumplimiento", href: "/app/admin/cumplimiento" },
    { label: "Activos Fijos", href: "/app/admin/activos" },
    { label: "Inventarios", href: "/app/admin/inventarios" },
    { label: "Tesorería", href: "/app/admin/tesoreria" },
    { label: "Trámites", href: "/app/admin/tramites" },
    { label: "Buzón Tributario", href: "/app/admin/buzon" },
    { label: "Correspondencia", href: "/app/admin/correspondencia" },
  ],
  legal: [
    { label: "Resumen", href: "/app/legal" },
    { label: "Lagunas Legales", href: "/app/legal/lagunas" },
    { label: "Redactor de Escritos", href: "/app/legal/redactor" },
    { label: "Marketplace", href: "/app/legal/marketplace" },
  ],
};

function detectModule(pathname: string): ModuleKey {
  if (pathname.startsWith("/app/admin")) return "admin";
  if (pathname.startsWith("/app/legal")) return "legal";
  return "contable";
}

export function AppLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const { despacho } = useDespacho();
  const initials = (user?.user_metadata?.full_name ?? user?.email ?? "U").slice(0, 2).toUpperCase();
  const activeModule = detectModule(location.pathname);
  const ctx = CONTEXT_NAV[activeModule];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border/60 glass sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Link to="/app" className="flex items-center shrink-0"><Logo /></Link>
            {despacho && (
              <Link to="/app/configuracion" className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-2 py-1 bg-card/40 transition-colors">
                <Building2 className="h-3 w-3 text-primary" />
                <span className="truncate max-w-[180px]">{despacho.nombre}</span>
              </Link>
            )}
            {/* Module tabs */}
            <nav className="hidden md:flex items-center gap-1">
              {MODULES.map((m) => {
                const Icon = m.icon;
                const active = activeModule === m.key;
                return (
                  <Link
                    key={m.key}
                    to={m.href}
                    className={`group relative flex items-center gap-2 px-4 h-10 rounded-lg text-sm font-medium transition-all ${
                      active
                        ? "bg-card/80 border border-border text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? m.accent : ""}`} />
                    <span>{m.label}</span>
                    {active && <span className={`absolute -bottom-px left-3 right-3 h-px bg-gradient-to-r from-transparent via-current to-transparent ${m.accent}`} />}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button title="Comando IA (cmd+K)" className="hidden md:flex items-center gap-2 h-9 px-3 rounded-md border border-border/60 bg-card/40 hover:bg-card text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Command className="h-3.5 w-3.5" />
              <span>Comando IA</span>
              <kbd className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-background/60 border border-border/60 font-mono">⌘K</kbd>
            </button>
            <ClientePicker />
            <Link to="/app/configuracion" title="Configuración" className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/30">
              <Settings className="h-4 w-4" />
            </Link>
            <Button variant="ghost" size="icon" onClick={signOut} title="Cerrar sesión"><LogOut className="h-4 w-4" /></Button>
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-[oklch(0.78_0.13_85)] flex items-center justify-center text-xs font-semibold text-primary-foreground">
              {initials}
            </div>
          </div>
        </div>
        {/* Context nav */}
        <div className="border-t border-border/40 bg-background/40">
          <div className="max-w-7xl mx-auto px-6 h-11 flex items-center gap-1 overflow-x-auto">
            {ctx.map((item) => {
              const active = location.pathname === item.href || (item.href !== "/app" && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`whitespace-nowrap px-3 h-7 rounded-md text-xs flex items-center transition-colors ${
                    active
                      ? "text-foreground bg-primary/15 border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>
      <Toaster theme="dark" position="top-right" />
    </div>
  );
}

function ClientePicker() {
  const { cliente, setCliente } = useActiveCliente();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fetchClientes = useServerFn(listClientes);
  const { data } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => fetchClientes(),
    enabled: open,
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-9 pl-3 pr-2 rounded-md border border-border bg-card/50 hover:bg-card text-sm transition-colors max-w-[260px]"
      >
        <UserRound className="h-3.5 w-3.5 text-primary shrink-0" />
        {cliente ? (
          <span className="truncate">
            <span className="font-medium">{cliente.rfc}</span>
            <span className="text-muted-foreground ml-2 hidden sm:inline">· {cliente.razon_social}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Selecciona expediente</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-border bg-popover shadow-xl z-40 overflow-hidden">
          <div className="p-2 border-b border-border/60 flex items-center justify-between">
            <span className="text-xs text-muted-foreground px-2">Expediente activo</span>
            {cliente && (
              <button onClick={() => { setCliente(null); setOpen(false); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-accent/40">
                <X className="h-3 w-3" /> Quitar
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {(data?.clientes ?? []).length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No tienes expedientes aún.
                <Link to="/app/clientes" onClick={() => setOpen(false)} className="block mt-2 text-primary hover:underline">
                  Crear el primero
                </Link>
              </div>
            ) : (
              (data?.clientes ?? []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCliente({ id: c.id, rfc: c.rfc, razon_social: c.razon_social, regimen_fiscal: c.regimen_fiscal });
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-accent/40 text-sm ${cliente?.id === c.id ? "bg-primary/10" : ""}`}
                >
                  <div className="font-medium truncate">{c.razon_social}</div>
                  <div className="text-xs text-muted-foreground font-mono">{c.rfc}</div>
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-border/60">
            <Link
              to="/app/clientes"
              onClick={() => setOpen(false)}
              className="block w-full text-center text-xs text-primary hover:underline py-1"
            >
              Ver todos los expedientes →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
