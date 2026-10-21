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
import { getCapabilityByRoute } from "@/lib/capabilities/registry";
import { rutaVisible } from "@/lib/capabilities/enfoque";

type NavItem = { label: string; route: string; hint?: string };

const MODULES_TODOS: NavItem[] = [
  { label: "Inicio", route: "/app", hint: "Flujo del mes" },
  { label: "Ruta guiada", route: "/app/inicio-guiado", hint: "Qué falta este mes" },
  { label: "Cartera del despacho", route: "/app/despacho", hint: "Todos tus RFC" },
  { label: "Expedientes", route: "/app/clientes", hint: "Clientes / RFCs" },
  { label: "Cierre del mes", route: "/app/cierre", hint: "Sello del periodo" },
  { label: "Administrativo & RH", route: "/app/admin/", hint: "Catálogo módulo 2" },
  { label: "Inteligencia Legal", route: "/app/legal", hint: "Catálogo legal" },
  { label: "Equipo", route: "/app/equipo" },
  { label: "Configuración", route: "/app/configuracion" },
];
// Sólo lo que está dentro del enfoque del producto (ver capabilities/enfoque.ts).
const MODULES = MODULES_TODOS.filter((m) => rutaVisible(m.route));

// Herramientas/módulos nuevos que no viven bajo /app/tools y por eso no
// estaban en el registry. Los listamos aquí para que aparezcan en ⌘K.
const EXTRA_TOOLS: { label: string; route: string; hint: string; category: string }[] = [
  // Operación
  { label: "Calendario fiscal", route: "/app/calendario", hint: "Obligaciones con semáforo", category: "Operación" },
  { label: "Centro de Tareas (Kanban)", route: "/app/tareas", hint: "Productividad del despacho", category: "Operación" },
  { label: "Workflow Automático", route: "/app/workflows", hint: "Automatizaciones", category: "Operación" },
  { label: "Mensajería IA", route: "/app/mensajes", hint: "WhatsApp y correo", category: "Operación" },
  { label: "Buzón", route: "/app/buzon", hint: "Notificaciones", category: "Operación" },

  // Fiscal avanzado
  { label: "Salud Fiscal", route: "/app/salud-fiscal", hint: "Score integral 0-100", category: "Fiscal" },
  { label: "Riesgo SAT 2026", route: "/app/riesgo", hint: "Plan Maestro 12 criterios", category: "Fiscal" },
  { label: "Descarga Masiva SAT", route: "/app/sat-sync", hint: "Sincronización CFDI", category: "Fiscal" },
  { label: "CFDI del expediente", route: "/app/cfdi", hint: "Bandeja unificada", category: "Fiscal" },
  { label: "RFC vinculados", route: "/app/rfcs-vinculados", hint: "Vinculación SAT", category: "Fiscal" },

  // Conciliación / Contabilidad
  { label: "Conciliación bancaria", route: "/app/conciliacion", hint: "Estado de cuenta vs CFDI", category: "Conciliación" },
  { label: "Conciliación SAT vs Contabilidad", route: "/app/conciliacion-integral", hint: "CFDI · Pólizas · Banco", category: "Conciliación" },
  { label: "Histórico de conciliación", route: "/app/conciliacion/historial", hint: "Semáforo mensual", category: "Conciliación" },
  { label: "Pólizas contables", route: "/app/polizas", hint: "Import CSV y manual", category: "Conciliación" },
  { label: "Contabilidad automática", route: "/app/contabilidad-auto", hint: "CFDI → Pólizas", category: "Conciliación" },

  // Reportes
  { label: "Reportes del expediente", route: "/app/reportes", hint: "PDF / Excel", category: "Reportes" },
  { label: "Reporte Ejecutivo + Agente IA", route: "/app/reporte-ejecutivo", hint: "CFO advisor IA", category: "Reportes" },
  { label: "Resumen Fiscal", route: "/app/reportes/resumen-fiscal", hint: "Vista mensual consolidada", category: "Reportes" },

  // Agentes IA
  { label: "Mis Agentes IA", route: "/app/contable/agentes", hint: "4 operativos · 4 en desarrollo", category: "Agentes IA" },
  { label: "Agente CFDI", route: "/app/contable/agente-cfdi", hint: "Vigila comprobantes", category: "Agentes IA" },
  { label: "Agente Auditor", route: "/app/contable/agente-auditor", hint: "Hallazgos de cierre", category: "Agentes IA" },
  { label: "Agente Cierre", route: "/app/contable/agente-cierre", hint: "Cierre mensual", category: "Agentes IA" },
  { label: "Agente Conciliación", route: "/app/contable/agente-conciliacion", hint: "Conciliación automática", category: "Agentes IA" },

  // Legal
  { label: "Lagunas Legales", route: "/app/legal/lagunas", hint: "TFJA / SCJN", category: "Legal" },
  { label: "Redactor de Escritos", route: "/app/legal/redactor", hint: "IA con fundamento", category: "Legal" },
  { label: "Marketplace Legal", route: "/app/legal/marketplace", hint: "Demostración", category: "Legal" },

  // Administrativo & RH
  { label: "Tesorería", route: "/app/admin/tesoreria", hint: "Flujo de caja", category: "Administrativo" },
  { label: "Gestor de Trámites", route: "/app/admin/tramites", hint: "Kanban con semáforo", category: "Administrativo" },
  { label: "Bandeja de Notificaciones IA", route: "/app/admin/buzon", hint: "Analiza PDFs de notificaciones", category: "Administrativo" },
  { label: "Correspondencia", route: "/app/admin/correspondencia", hint: "Minutas y oficios", category: "Administrativo" },
  { label: "Nómina IA", route: "/app/admin/nomina", hint: "SDI · IMSS · ISR", category: "Administrativo" },
  { label: "Cumplimiento Laboral", route: "/app/admin/cumplimiento", hint: "IMSS · INFONAVIT", category: "Administrativo" },
  { label: "Activos Fijos", route: "/app/admin/activos", hint: "MOI · depreciación", category: "Administrativo" },
  { label: "Inventarios", route: "/app/admin/inventarios", hint: "Kardex desde CFDI", category: "Administrativo" },
];

// La paleta no puede ofrecer atajos a funciones que el registro oculta.
const VISIBLE_EXTRA = EXTRA_TOOLS.filter((t) => {
  const c = getCapabilityByRoute(t.route);
  if (c && (!c.visibleEnMenu || c.madurez === "obsoleta")) return false;
  return rutaVisible(t.route);
});
const VISIBLE_TOOLS = TOOLS.filter((t) => rutaVisible(t.route));

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
        <CommandGroup heading="Herramientas individuales">
          {VISIBLE_TOOLS.map((t) => {
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
        <CommandSeparator />
        <CommandGroup heading="Más pantallas">
          {VISIBLE_EXTRA.map((t) => (
            <CommandItem key={t.route} value={`${t.label} ${t.hint} ${t.category}`} onSelect={() => go(t.route)}>
              <ArrowRight className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <span>{t.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{t.category}</span>
            </CommandItem>
          ))}
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
