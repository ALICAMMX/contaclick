import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, ArrowRight } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { TOOLS } from "@/lib/tools/registry";

type NavItem = { label: string; route: string; hint?: string };

const MODULES: NavItem[] = [
  { label: "Inicio", route: "/app", hint: "Hub principal" },
  { label: "Expedientes", route: "/app/clientes", hint: "Clientes / RFCs" },
  { label: "CFDI", route: "/app/cfdi", hint: "Comprobantes" },
  { label: "Conciliación bancaria", route: "/app/conciliacion" },
  { label: "Reportes", route: "/app/reportes" },
  { label: "Riesgo SAT", route: "/app/riesgo" },
  { label: "Mensajería IA", route: "/app/mensajes" },
  { label: "Contable y Fiscal", route: "/app/contable" },
  { label: "Administrativo & RH", route: "/app/admin" },
  { label: "Inteligencia Legal", route: "/app/legal" },
  { label: "Equipo", route: "/app/equipo" },
  { label: "Configuración", route: "/app/configuracion" },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();

  const go = (route: string) => {
    onOpenChange(false);
    navigate({ to: route });
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar herramientas, módulos…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        <CommandGroup heading="Módulos">
          {MODULES.map((m) => (
            <CommandItem key={m.route} value={`${m.label} ${m.hint ?? ""}`} onSelect={() => go(m.route)}>
              <ArrowRight className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <span>{m.label}</span>
              {m.hint && <span className="ml-auto text-xs text-muted-foreground">{m.hint}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Herramientas">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <CommandItem
                key={t.key}
                value={`${t.name} ${t.description} ${t.category}`}
                onSelect={() => go(t.route)}
              >
                <Icon className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <span>{t.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{t.category}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function CommandPaletteTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Buscar (⌘K)"
        className="hidden md:inline-flex items-center gap-2 h-9 px-2.5 rounded-md border border-border bg-card hover:bg-accent text-xs text-muted-foreground hover:text-foreground transition-colors min-w-[180px]"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-mono">
          {isMac ? "⌘" : "Ctrl"}K
        </kbd>
      </button>
      <button
        onClick={() => setOpen(true)}
        title="Buscar (⌘K)"
        className="md:hidden h-9 w-9 rounded-md border border-border bg-card hover:bg-accent grid place-items-center text-muted-foreground hover:text-foreground transition-colors"
      >
        <Search className="h-4 w-4" />
      </button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
