import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { LogOut, UserRound, Settings, Building2, Sun, Moon, ChevronRight, Home, ShieldCheck } from "lucide-react";
import { Logo } from "./Logo";
import { useAuth } from "@/lib/auth";
import { useDespacho } from "@/lib/despacho/use-despacho";
import { useTheme } from "@/lib/theme";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { isSuperAdmin } from "@/lib/admin-panel/admin-panel.functions";
import { NotificationsBell } from "./NotificationsBell";
import { CommandPaletteTrigger } from "./CommandPalette";
import { TrialBanner } from "./TrialBanner";
import { DemoBanner } from "./DemoBanner";
import { Tour, shouldAutoOpenTour } from "./Tour";
import { UserWatermark } from "./UserWatermark";
import { HelpBot } from "./HelpBot";

const LABELS: Record<string, string> = {
  app: "Inicio",
  despacho: "Dashboard del despacho",
  contable: "Contable y Fiscal",
  admin: "Administrativo & RH",
  legal: "Inteligencia Legal",
  herramientas: "Herramientas",
  agentes: "Agentes IA",
  "agente-cfdi": "Agente CFDI",
  "agente-auditor": "Agente Auditor",
  "agente-cierre": "Agente Cierre",
  "agente-conciliacion": "Agente Conciliación",
  cfdi: "CFDI",
  conciliacion: "Conciliación bancaria",
  reportes: "Reportes",
  riesgo: "Riesgo SAT",
  mensajes: "Mensajería IA",
  clientes: "Expedientes",
  "rfcs-vinculados": "RFC vinculados",
  configuracion: "Configuración",
  equipo: "Equipo",
  tools: "Herramienta",
  "isr-iva-pm": "Calculadora ISR / IVA PM",
  "cfdi-validator": "Validador CFDI",
  "cfdi-verifier": "Verificador UUID",
  "xml-bulk-reader": "Lector XML masivo",
  "bank-reconciler": "Conciliador bancario",
  "express-auditor": "Auditor express",
  "fiscal-assistant": "Asistente fiscal IA",
  "isr-iva-calculator": "Calculadora ISR / IVA",
  "resico-calculator": "Calculadora RESICO",
  "oficio-generator": "Generador de oficios",
  "csf-parser": "Lector de Constancia",
  "import-clientes": "Importar cartera",
  nomina: "Nómina IA",
  cumplimiento: "Cumplimiento laboral",
  activos: "Activos fijos",
  inventarios: "Inventarios",
  tesoreria: "Tesorería",
  tramites: "Trámites",
  buzon: "Buzón Tributario",
  correspondencia: "Correspondencia",
  lagunas: "Lagunas Legales",
  redactor: "Redactor de escritos",
  marketplace: "Marketplace Legal",
};

// Mapa de qué módulo contenedor pertenece cada sección de primer nivel bajo /app.
// Esto permite que rutas como /app/riesgo o /app/cfdi muestren la miga
// "Contable y Fiscal" intermedia aunque no vivan literalmente bajo /app/contable.
const MODULE_PARENT: Record<string, { key: string; href: string }> = {
  cfdi: { key: "contable", href: "/app/contable" },
  conciliacion: { key: "contable", href: "/app/contable" },
  reportes: { key: "contable", href: "/app/contable" },
  riesgo: { key: "contable", href: "/app/contable" },
  tools: { key: "contable", href: "/app/contable" },
  nomina: { key: "admin", href: "/app/admin" },
  cumplimiento: { key: "admin", href: "/app/admin" },
  activos: { key: "admin", href: "/app/admin" },
  inventarios: { key: "admin", href: "/app/admin" },
  tesoreria: { key: "admin", href: "/app/admin" },
  tramites: { key: "admin", href: "/app/admin" },
  buzon: { key: "admin", href: "/app/admin" },
  correspondencia: { key: "admin", href: "/app/admin" },
  lagunas: { key: "legal", href: "/app/legal" },
  redactor: { key: "legal", href: "/app/legal" },
  marketplace: { key: "legal", href: "/app/legal" },
};

function buildCrumbs(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];
  let acc = "";
  for (const p of parts) {
    acc += "/" + p;
    crumbs.push({ label: LABELS[p] ?? p, href: acc });
  }

  // Inyecta el módulo contenedor (Contable y Fiscal / Administrativo / Legal)
  // cuando la sección vive en una ruta de primer nivel distinta.
  if (parts[0] === "app" && parts.length >= 2) {
    const parent = MODULE_PARENT[parts[1]];
    if (parent) {
      const parentCrumb = { label: LABELS[parent.key] ?? parent.key, href: parent.href };
      // Para /app/tools/<x> dejamos: Inicio › Contable y Fiscal › <herramienta>
      // (sin el crumb intermedio "Herramienta" que no lleva a ningún lado útil).
      if (parts[1] === "tools" && parts.length >= 3) {
        return [crumbs[0], parentCrumb, crumbs[crumbs.length - 1]];
      }
      return [crumbs[0], parentCrumb, ...crumbs.slice(1)];
    }
  }
  return crumbs;
}

export function AppLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const { despacho } = useDespacho();
  const initials = (user?.user_metadata?.full_name ?? user?.email ?? "U").slice(0, 2).toUpperCase();
  const crumbs = buildCrumbs(location.pathname);
  const atHub = location.pathname === "/app";

  // Auto-open tour for new users on first visit
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    if (!user) return;
    if (!shouldAutoOpenTour()) return;
    const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
    const ageMs = Date.now() - createdAt;
    // Solo si la cuenta tiene menos de 24h
    if (createdAt && ageMs < 24 * 60 * 60 * 1000) {
      const t = setTimeout(() => setTourOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, [user]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 bg-card/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link to="/app" className="flex items-center shrink-0" title="Volver al inicio">
              <Logo />
            </Link>
            {!atHub && (
              <Link
                to="/app"
                className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-card hover:bg-accent text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                title="Volver al inicio"
              >
                <Home className="h-3.5 w-3.5" /> Inicio
              </Link>
            )}
            {!atHub && crumbs.length > 1 && (
              <nav className="hidden md:flex items-center gap-1 text-sm min-w-0">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                {crumbs.slice(1).map((c, i, arr) => {
                  const isLast = i === arr.length - 1;
                  return (
                    <span key={c.href} className="flex items-center gap-1 min-w-0">
                      {isLast ? (
                        <span className="text-foreground font-medium truncate">{c.label}</span>
                      ) : (
                        <Link to={c.href} className="text-muted-foreground hover:text-foreground transition-colors truncate">
                          {c.label}
                        </Link>
                      )}
                      {!isLast && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />}
                    </span>
                  );
                })}
              </nav>
            )}
          </div>
          <div className="flex items-center gap-2">
            <CommandPaletteTrigger />
            <NotificationsBell />
            <ThemeToggle />
            <UserMenu initials={initials} signOut={signOut} despacho={despacho?.nombre} />
          </div>
        </div>
      </header>
      <DemoBanner />
      <TrialBanner />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>
      <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
      <UserWatermark />
      <HelpBot />
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      className="h-9 w-9 rounded-md border border-border bg-card hover:bg-accent grid place-items-center text-muted-foreground hover:text-foreground transition-colors"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function UserMenu({ initials, signOut, despacho }: { initials: string; signOut: () => void; despacho?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const checkRole = useServerFn(isSuperAdmin);
  const roleQ = useQuery({ queryKey: ["is-super-admin"], queryFn: () => checkRole(), staleTime: 60_000 });
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
        className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-xs font-semibold text-primary-foreground ring-1 ring-border hover:ring-primary/50 transition"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-lg border border-border bg-popover shadow-xl z-40 overflow-hidden">
          {despacho && (
            <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Despacho</div>
                <div className="text-sm font-medium truncate">{despacho}</div>
              </div>
            </div>
          )}
          <div className="py-1">
            <Link to="/app/configuracion" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent">
              <Settings className="h-4 w-4" /> Configuración
            </Link>
            <Link to="/app/equipo" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent">
              <UserRound className="h-4 w-4" /> Equipo
            </Link>
            {(roleQ.data?.isSuperAdmin || !roleQ.data?.anySuperAdmin) && (
              <Link to="/app/admin-panel" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-gold hover:bg-accent">
                <ShieldCheck className="h-4 w-4" /> Panel super admin
              </Link>
            )}
            <button onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent">
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

