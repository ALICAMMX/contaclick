import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { LogOut, ChevronDown, UserRound, X, Settings, Building2, Command, Calculator, Briefcase, Scale, Sparkles } from "lucide-react";
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

const MODULES: { key: ModuleKey; label: string; short: string; href: string; icon: React.ComponentType<{ className?: string }>; accent: string }[] = [
  { key: "contable", label: "Contable & Fiscal", short: "Contable", href: "/app/contable", icon: Calculator, accent: "text-primary" },
  { key: "admin", label: "Administrativo", short: "Admin", href: "/app/admin", icon: Briefcase, accent: "text-[oklch(0.85_0.13_85)]" },
  { key: "legal", label: "Inteligencia Legal", short: "Legal", href: "/app/legal", icon: Scale, accent: "text-[oklch(0.78_0.15_155)]" },
];

type CtxItem = { label: string; href: string };
type CtxGroup = { label: string; items: CtxItem[] };
type CtxNav = { primary: CtxItem[]; groups: CtxGroup[] };

const CONTEXT_NAV: Record<ModuleKey, CtxNav> = {
  contable: {
    primary: [
      { label: "Inicio", href: "/app" },
      { label: "Riesgo SAT", href: "/app/riesgo" },
      { label: "Herramientas", href: "/app/contable/herramientas" },
      { label: "Agentes IA", href: "/app/contable/agentes" },
    ],
    groups: [
      {
        label: "Operación",
        items: [
          { label: "CFDI", href: "/app/cfdi" },
          { label: "Conciliación bancaria", href: "/app/conciliacion" },
          { label: "Reportes", href: "/app/reportes" },
        ],
      },
    ],
  },
  admin: {
    primary: [
      { label: "Resumen", href: "/app/admin" },
      { label: "Tesorería", href: "/app/admin/tesoreria" },
      { label: "Trámites", href: "/app/admin/tramites" },
    ],
    groups: [
      {
        label: "Personal",
        items: [
          { label: "Nómina IA", href: "/app/admin/nomina" },
          { label: "Cumplimiento laboral", href: "/app/admin/cumplimiento" },
        ],
      },
      {
        label: "Patrimonio",
        items: [
          { label: "Activos fijos", href: "/app/admin/activos" },
          { label: "Inventarios", href: "/app/admin/inventarios" },
        ],
      },
      {
        label: "Comunicaciones",
        items: [
          { label: "Buzón Tributario", href: "/app/admin/buzon" },
          { label: "Correspondencia", href: "/app/admin/correspondencia" },
        ],
      },
    ],
  },
  legal: {
    primary: [
      { label: "Resumen", href: "/app/legal" },
      { label: "Lagunas legales", href: "/app/legal/lagunas" },
      { label: "Redactor de escritos", href: "/app/legal/redactor" },
      { label: "Marketplace", href: "/app/legal/marketplace" },
    ],
    groups: [],
  },
};

function detectModule(pathname: string): ModuleKey {
  if (pathname.startsWith("/app/admin")) return "admin";
  if (pathname.startsWith("/app/legal")) return "legal";
  return "contable";
}

function isHrefActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(href + "/");
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
      <header className="border-b border-border/60 glass sticky top-0 z-30">
        {/* Row 1 — brand, modules, account */}
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 min-w-0">
            <Link to="/app" className="flex items-center shrink-0"><Logo /></Link>
            <div className="hidden lg:flex h-6 w-px bg-border/60" />
            <nav className="hidden md:flex items-center gap-0.5">
              {MODULES.map((m) => {
                const Icon = m.icon;
                const active = activeModule === m.key;
                return (
                  <Link
                    key={m.key}
                    to={m.href}
                    className={`group relative flex items-center gap-2 px-3 h-9 rounded-md text-sm transition-all ${
                      active
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? m.accent : "opacity-70"}`} />
                    <span>{m.label}</span>
                    {active && (
                      <span className={`absolute -bottom-[13px] left-2 right-2 h-[2px] rounded-full bg-current ${m.accent}`} />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button title="Comando IA (⌘K)" className="hidden md:inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border/60 bg-card/40 hover:bg-card text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>Comando IA</span>
              <kbd className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-background/60 border border-border/60 font-mono">⌘K</kbd>
            </button>
            <ClientePicker />
            <UserMenu initials={initials} signOut={signOut} despacho={despacho?.nombre} />
          </div>
        </div>

        {/* Row 2 — context nav */}
        <div className="border-t border-border/40 bg-background/30">
          <div className="max-w-7xl mx-auto px-6 h-11 flex items-center gap-1 overflow-x-auto scrollbar-none">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mr-2 shrink-0">
              {MODULES.find((m) => m.key === activeModule)?.short}
              <span className="text-border">/</span>
            </span>
            {ctx.primary.map((item) => {
              const active = isHrefActive(location.pathname, item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`whitespace-nowrap px-3 h-8 rounded-md text-sm flex items-center transition-colors ${
                    active
                      ? "text-foreground bg-primary/15 border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            {ctx.groups.map((g) => (
              <CtxDropdown key={g.label} group={g} pathname={location.pathname} />
            ))}
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

function CtxDropdown({ group, pathname }: { group: CtxGroup; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const groupActive = group.items.some((i) => isHrefActive(pathname, i.href));

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
        className={`whitespace-nowrap px-3 h-8 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
          groupActive
            ? "text-foreground bg-primary/15 border border-primary/30"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
        }`}
      >
        {group.label}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>
      {open && (
        <div className="absolute left-0 mt-2 w-60 rounded-lg border border-border bg-popover shadow-xl z-40 overflow-hidden py-1">
          {group.items.map((i) => {
            const active = isHrefActive(pathname, i.href);
            return (
              <Link
                key={i.href}
                to={i.href}
                onClick={() => setOpen(false)}
                className={`block px-3 py-2 text-sm transition-colors ${
                  active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                }`}
              >
                {i.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserMenu({ initials, signOut, despacho }: { initials: string; signOut: () => void; despacho?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
        className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-[oklch(0.78_0.13_85)] flex items-center justify-center text-xs font-semibold text-primary-foreground ring-1 ring-border/60 hover:ring-primary/50 transition"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-lg border border-border bg-popover shadow-xl z-40 overflow-hidden">
          {despacho && (
            <div className="px-3 py-2.5 border-b border-border/60 flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Despacho</div>
                <div className="text-sm font-medium truncate">{despacho}</div>
              </div>
            </div>
          )}
          <div className="py-1">
            <Link to="/app/configuracion" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40">
              <Settings className="h-4 w-4" /> Configuración
            </Link>
            <Link to="/app/equipo" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40">
              <UserRound className="h-4 w-4" /> Equipo
            </Link>
            <button onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40">
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
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
        className="flex items-center gap-2 h-9 pl-3 pr-2 rounded-md border border-border bg-card/50 hover:bg-card text-sm transition-colors max-w-[240px]"
      >
        <UserRound className="h-3.5 w-3.5 text-primary shrink-0" />
        {cliente ? (
          <span className="truncate">
            <span className="font-medium">{cliente.rfc}</span>
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Expediente</span>
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
