import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, FileText, Banknote, Shield, Bot,
  BarChart3, Settings, Bell, Search,
} from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "./ui/button";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/dashboard/clientes", label: "Clientes", icon: Users },
  { to: "/dashboard/cfdi", label: "Analizador CFDI", icon: FileText },
  { to: "/dashboard/conciliador", label: "Conciliador", icon: Banknote },
  { to: "/dashboard/auditor", label: "Auditor Fiscal", icon: Shield },
  { to: "/dashboard/asistente", label: "Asistente IA", icon: Bot },
  { to: "/dashboard/reportes", label: "Reportes", icon: BarChart3 },
];

export function AppShell() {
  const location = useLocation();
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar hidden lg:flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-sidebar-border">
          <Link to="/"><Logo /></Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map((item) => {
            const active = location.pathname === item.to ||
              (item.to !== "/dashboard" && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                  active
                    ? "bg-primary/15 text-foreground border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <Link to="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground">
            <Settings className="h-4 w-4" /> Configuración
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border/60 glass flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                placeholder="Buscar cliente, RFC, CFDI..."
                className="w-full pl-9 pr-3 h-9 rounded-md bg-input/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon"><Bell className="h-4 w-4" /></Button>
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-semibold text-primary-foreground">
              CG
            </div>
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
