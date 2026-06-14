import { createFileRoute, Link } from "@tanstack/react-router";
import { ModuleScaffold, KpiTile } from "@/components/ModuleScaffold";
import { Briefcase, Users, ShieldCheck, Building, Boxes, TrendingUp, FileText, Mail, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/app/admin/")({ component: AdminHome });

const HERRAMIENTAS = [
  { name: "Nómina IA", desc: "Cálculo SDI, IMSS, ISR. Prenómina con IA.", icon: Users, href: "/app/admin/nomina" },
  { name: "Cumplimiento Laboral", desc: "Checklist IMSS / INFONAVIT / SAT con semáforos.", icon: ShieldCheck, href: "/app/admin/cumplimiento" },
  { name: "Activos Fijos", desc: "MOI, depreciación fiscal y contable automática.", icon: Building, href: "/app/admin/activos" },
  { name: "Inventarios", desc: "Kardex derivado de CFDI emitidos y recibidos.", icon: Boxes, href: "/app/admin/inventarios" },
  { name: "Tesorería", desc: "Flujo de caja 90 días, cuentas por cobrar/pagar.", icon: TrendingUp, href: "/app/admin/tesoreria" },
  { name: "Gestor de Trámites", desc: "Kanban con semáforo por vencimiento.", icon: FileText, href: "/app/admin/tramites" },
  { name: "Buzón Tributario", desc: "Lector inteligente de notificaciones SAT.", icon: Mail, href: "/app/admin/buzon" },
  { name: "Correspondencia", desc: "Generador de minutas, oficios y respuestas.", icon: MessageSquare, href: "/app/admin/correspondencia" },
];

function AdminHome() {
  return (
    <ModuleScaffold
      title="Administrativo, RH & Finanzas"
      subtitle="Módulo 2 — todo lo que un despacho o pyme necesita más allá del cumplimiento fiscal. 10 herramientas integradas operadas por 7 agentes."
      icon={<Briefcase className="h-5 w-5" />}
      badge="Vista previa de plataforma · funcionalidad en construcción"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Empleados activos" value="32" hint="2 altas este mes" accent="primary" />
        <KpiTile label="Activos fijos" value="47" hint="$2.4M MOI" accent="gold" />
        <KpiTile label="Flujo neto 30d" value="+$228K" hint="vs $182K mes anterior" accent="success" />
        <KpiTile label="Trámites abiertos" value="5" hint="1 vence en 3 días" accent="warning" />
      </div>

      <section className="space-y-3 mt-8">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">10 herramientas administrativas</h2>
          <div className="h-px flex-1 bg-border/60" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {HERRAMIENTAS.map((t) => {
            const Icon = t.icon;
            return (
              <Link key={t.name} to={t.href} className="group rounded-xl p-5 border border-border/60 bg-card/50 hover:border-[oklch(0.78_0.13_85)]/40 hover:bg-card hover:-translate-y-0.5 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-[oklch(0.78_0.13_85)]/15 text-[oklch(0.85_0.13_85)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[oklch(0.78_0.13_85)]/15 text-[oklch(0.85_0.13_85)] border border-[oklch(0.78_0.13_85)]/30">Demo</span>
                </div>
                <div className="font-medium mb-1">{t.name}</div>
                <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </ModuleScaffold>
  );
}
