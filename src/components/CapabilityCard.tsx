import { Link } from "@tanstack/react-router";
import { Bell, Check, FlaskConical, Info, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, AlertTriangle, Banknote, Bot, Boxes, Building, Calculator, Calendar, Coins,
  FileBadge, FileSignature, FileStack, FileText, Gavel, ListChecks, Mail, MessagesSquare,
  Network, RefreshCw, ScanSearch, ShieldAlert, ShieldCheck, Store, TrendingUp, Upload, Users,
  Workflow as WorkflowIcon, Globe, Settings, Briefcase,
} from "lucide-react";
import { MADUREZ_LABEL, type Capability, type Madurez } from "@/lib/capabilities/registry";

/** Iconos por capacidad. La presentación vive aquí; el estado vive en el registro. */
export const CAPABILITY_ICONS: Record<string, LucideIcon> = {
  "csf-parser": FileBadge, calendario: Calendar, tareas: ListChecks, workflows: WorkflowIcon,
  "salud-fiscal": Activity, "import-clientes": Upload,
  "xml-bulk-reader": FileStack, "cfdi-validator": FileText, "cfdi-verifier": ShieldCheck,
  cfdi: FileText, "sat-sync": RefreshCw,
  "express-auditor": ScanSearch, conciliacion: Banknote, "conciliacion-historial": Banknote,
  "conciliacion-integral": ScanSearch, polizas: FileSignature, "contabilidad-auto": FileSignature,
  "isr-iva-calculator": Calculator, "isr-iva-pm": Calculator, "resico-calculator": Coins,
  "precios-transferencia": Network,
  riesgo: ShieldAlert, "deducibility-checker": ShieldCheck, "efos-validator": AlertTriangle,
  "import-prices": Globe, "shadow-payroll": Users,
  reportes: FileText, "reporte-ejecutivo": Activity, "oficio-generator": FileSignature,
  "fiscal-assistant": Bot, agentes: Bot, mensajes: Mail,
  tesoreria: TrendingUp, tramites: FileText, buzon: Mail, correspondencia: MessagesSquare,
  nomina: Users, cumplimiento: ShieldCheck, activos: Building, inventarios: Boxes,
  "legal-consulta-ia": MessagesSquare, "legal-lagunas": Gavel, "legal-redactor": FileSignature,
  "legal-marketplace": Store,
  expedientes: Briefcase, equipo: Users, configuracion: Settings,
};

const BADGE: Record<Madurez, { cls: string; icon: LucideIcon | null }> = {
  operativa: { cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", icon: Check },
  operativa_limitada: { cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300", icon: Info },
  beta: { cls: "border-primary/40 bg-primary/10 text-primary", icon: FlaskConical },
  demostracion: { cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300", icon: Sparkles },
  proximamente: { cls: "border-border bg-muted text-muted-foreground", icon: Bell },
  obsoleta: { cls: "border-border bg-muted text-muted-foreground", icon: null },
};

export function MaturityBadge({ madurez, className = "" }: { madurez: Madurez; className?: string }) {
  const b = BADGE[madurez];
  const Icon = b.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${b.cls} ${className}`}>
      {Icon && <Icon className="h-3 w-3" />} {MADUREZ_LABEL[madurez]}
    </span>
  );
}

/** Aviso obligatorio en cualquier pantalla que muestre información sintética. */
export function SyntheticDataBanner({ mensaje }: { mensaje?: string | null }) {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
      <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
      <span>
        <strong className="font-semibold">Datos de demostración. </strong>
        {mensaje ??
          "Todo lo que ves en esta pantalla es sintético: no proviene de tus expedientes, no se guarda, no cuenta en tus cuotas y no debe usarse como entregable."}
      </span>
    </div>
  );
}

export function UnavailableNotice({ mensaje }: { mensaje?: string | null }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground text-center">
      <Bell className="h-5 w-5 mx-auto mb-2 opacity-60" />
      {mensaje ?? "Esta función aún no está disponible."}
    </div>
  );
}

/**
 * Tarjeta de catálogo. El estado y el enlace salen del registro central,
 * de modo que nunca puede anunciar algo distinto a la realidad del módulo.
 */
export function CapabilityCard({
  capability,
  accent = "primary",
  doneThisMonth = false,
}: {
  capability: Capability;
  accent?: "primary" | "gold" | "legal";
  doneThisMonth?: boolean;
}) {
  const Icon = CAPABILITY_ICONS[capability.id] ?? FileText;
  const navegable = capability.madurez !== "proximamente" && capability.madurez !== "obsoleta";
  const accentCls =
    accent === "gold" ? "bg-gold/15 text-gold" : accent === "legal" ? "bg-primary/10 text-primary" : "bg-primary/10 text-primary";
  const cta =
    capability.madurez === "demostracion" ? "Ver demostración"
      : capability.madurez === "beta" ? "Abrir (beta)"
        : navegable ? "Abrir herramienta"
          : "Sin implementación";

  const body = (
    <div
      className={`group relative h-full rounded-xl p-5 border bg-card transition-all flex flex-col ${
        navegable ? "border-border hover:border-primary/40 hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5" : "border-border/60 opacity-75"
      }`}
    >
      {doneThisMonth && (
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
          <Check className="h-2.5 w-2.5" /> Hecho este mes
        </span>
      )}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className={`h-10 w-10 rounded-lg grid place-items-center shrink-0 ${accentCls}`}>
          <Icon className="h-5 w-5" />
        </div>
        <MaturityBadge madurez={capability.madurez} />
      </div>
      <div className="font-medium mb-1">{capability.nombre}</div>
      <p className="text-xs text-muted-foreground leading-relaxed flex-1">{capability.descripcion}</p>
      <div className={`text-xs font-medium mt-4 inline-flex items-center gap-1 ${navegable ? "text-primary" : "text-muted-foreground"}`}>
        {cta} {navegable && <span className="transition-transform group-hover:translate-x-0.5">→</span>}
      </div>
    </div>
  );

  if (!navegable) return <div className="h-full cursor-not-allowed">{body}</div>;
  return (
    <Link to={capability.ruta} className="block h-full">
      {body}
    </Link>
  );
}
