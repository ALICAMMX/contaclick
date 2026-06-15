import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase, Users, ShieldCheck, Building, Boxes, TrendingUp, FileText, Mail, MessageSquare, Bell } from "lucide-react";
import type { ComponentType } from "react";

export const Route = createFileRoute("/app/admin/")({ component: AdminCatalog });

type Tool = { name: string; desc: string; icon: ComponentType<{ className?: string }>; href: string; status: "live" | "soon"; group: string };

const TOOLS: Tool[] = [
  // Operación diaria
  { name: "Tesorería", desc: "Flujo de caja 90 días, cuentas por cobrar/pagar.", icon: TrendingUp, href: "/app/admin/tesoreria", status: "soon", group: "1 · Operación diaria" },
  { name: "Gestor de Trámites", desc: "Kanban con semáforo por vencimiento.", icon: FileText, href: "/app/admin/tramites", status: "soon", group: "1 · Operación diaria" },

  // Comunicaciones
  { name: "Buzón Tributario", desc: "Lector inteligente de notificaciones SAT.", icon: Mail, href: "/app/admin/buzon", status: "soon", group: "2 · Comunicaciones" },
  { name: "Correspondencia", desc: "Generador de minutas, oficios y respuestas.", icon: MessageSquare, href: "/app/admin/correspondencia", status: "soon", group: "2 · Comunicaciones" },

  // Personal & RH (quincenal / mensual)
  { name: "Nómina IA", desc: "Cálculo SDI, IMSS, ISR. Prenómina automática.", icon: Users, href: "/app/admin/nomina", status: "soon", group: "3 · Personal & RH" },
  { name: "Cumplimiento Laboral", desc: "Checklist IMSS / INFONAVIT / SAT con semáforos.", icon: ShieldCheck, href: "/app/admin/cumplimiento", status: "soon", group: "3 · Personal & RH" },

  // Patrimonio
  { name: "Activos Fijos", desc: "MOI, depreciación fiscal y contable automática.", icon: Building, href: "/app/admin/activos", status: "soon", group: "4 · Patrimonio" },
  { name: "Inventarios", desc: "Kardex derivado de CFDI emitidos y recibidos.", icon: Boxes, href: "/app/admin/inventarios", status: "soon", group: "4 · Patrimonio" },
];

const GROUPS = ["1 · Operación diaria", "2 · Comunicaciones", "3 · Personal & RH", "4 · Patrimonio"];

function AdminCatalog() {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-gold mb-2">
            <span className="h-1 w-6 bg-gold" /> Módulo 2
          </div>
          <h1 className="serif text-3xl text-foreground">Administrativo & RH</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Todo lo que tu despacho o pyme necesita más allá del SAT. Catálogo de 8 herramientas operadas por agentes IA.
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-full border border-gold/40 bg-gold/10 text-gold text-xs font-medium">Módulo en construcción · maquetas demo</span>
      </header>

      {GROUPS.map((g) => {
        const items = TOOLS.filter((t) => t.group === g);
        if (!items.length) return null;
        return (
          <section key={g} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</h2>
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] text-muted-foreground tabular-nums">{items.length}</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((t) => {
                const Icon = t.icon;
                return (
                  <Link key={t.name} to={t.href} className="group rounded-xl p-5 border border-border bg-card hover:border-gold/40 hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5 transition-all flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <div className="h-10 w-10 rounded-lg grid place-items-center bg-gold/15 text-gold">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-border text-muted-foreground">
                        <Bell className="h-3 w-3" /> Demo
                      </span>
                    </div>
                    <div className="font-medium mb-1">{t.name}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed flex-1">{t.desc}</p>
                    <div className="text-xs font-medium mt-4 inline-flex items-center gap-1 text-gold">
                      Ver maqueta <span className="transition-transform group-hover:translate-x-0.5">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
