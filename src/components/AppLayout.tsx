import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { LogOut, Wrench, Users, ChevronDown, UserRound, X, FileText, Banknote } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { useAuth } from "@/lib/auth";
import { useActiveCliente } from "@/lib/active-cliente";
import { Toaster } from "sonner";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listClientes } from "@/lib/clientes.functions";

export function AppLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const initials = (user?.user_metadata?.full_name ?? user?.email ?? "U").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-16 border-b border-border/60 glass sticky top-0 z-30">
        <div className="h-full max-w-7xl mx-auto px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Link to="/app" className="flex items-center"><Logo /></Link>
            <nav className="hidden md:flex items-center gap-1 text-sm">
              <NavLink to="/app/cfdi" icon={<FileText className="h-4 w-4" />} label="CFDI" active={location.pathname.startsWith("/app/cfdi")} />
              <NavLink to="/app/conciliacion" icon={<Banknote className="h-4 w-4" />} label="Conciliación" active={location.pathname.startsWith("/app/conciliacion")} />
              <NavLink to="/app/tools" icon={<Wrench className="h-4 w-4" />} label="Herramientas" active={location.pathname.startsWith("/app/tools")} />
              <NavLink to="/app/clientes" icon={<Users className="h-4 w-4" />} label="Expedientes" active={location.pathname.startsWith("/app/clientes")} />
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ClientePicker />
            <Button variant="ghost" size="icon" onClick={signOut} title="Cerrar sesión"><LogOut className="h-4 w-4" /></Button>
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-semibold text-primary-foreground">
              {initials}
            </div>
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

function NavLink({ to, label, icon, active }: { to: string; label: string; icon: React.ReactNode; active: boolean }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
        active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
      }`}
    >
      {icon}{label}
    </Link>
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
