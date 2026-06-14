import { Sparkles, Bell } from "lucide-react";
import { ReactNode } from "react";

export function ModuleScaffold({
  title,
  subtitle,
  icon,
  badge = "Vista previa · Próximamente funcional",
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  badge?: string | null;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <div className="shrink-0 h-11 w-11 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30 grid place-items-center text-primary">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="serif text-3xl text-foreground truncate">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{subtitle}</p>}
            {badge && (
              <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full glass-gold text-[oklch(0.85_0.12_85)]">
                <Sparkles className="h-3 w-3" /> {badge}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/60 bg-card/60 hover:bg-card text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Bell className="h-3.5 w-3.5" /> Avísame cuando esté listo
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

export function DemoCard({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border/60 bg-card/50 p-5 ${className}`}>
      {title && <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{title}</div>}
      {children}
    </div>
  );
}

export function KpiTile({ label, value, hint, accent = "primary" }: { label: string; value: string; hint?: string; accent?: "primary" | "gold" | "success" | "warning" | "destructive" }) {
  const accents = {
    primary: "text-primary",
    gold: "text-[oklch(0.85_0.13_85)]",
    success: "text-[oklch(0.78_0.16_152)]",
    warning: "text-[oklch(0.85_0.15_75)]",
    destructive: "text-[oklch(0.72_0.22_25)]",
  };
  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-b from-card/70 to-card/30 p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accents[accent]}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
