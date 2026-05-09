import { createFileRoute } from "@tanstack/react-router";
import { Shield, AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/dashboard/auditor")({
  component: Auditor,
});

const checks = [
  { label: "ISR provisional vs CFDI emitidos", status: "ok", note: "Sin diferencias detectadas" },
  { label: "IVA trasladado vs declarado", status: "warn", note: "Diferencia de $12,800 en septiembre" },
  { label: "Deducciones autorizadas", status: "ok", note: "98% con CFDI válido" },
  { label: "Proveedores en lista 69-B", status: "alert", note: "2 proveedores en estatus presunto" },
  { label: "RESICO — límite de ingresos", status: "ok", note: "$1.2M de $3.5M permitidos" },
  { label: "DIOT octubre", status: "warn", note: "Pendiente de envío" },
];

function Auditor() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Auditor Fiscal IA</h1>
        <p className="text-muted-foreground text-sm mt-1">Revisión continua de 28 puntos críticos para cada cliente.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 rounded-xl p-6 border border-border/60 bg-card/50 text-center">
          <div className="text-xs text-muted-foreground">Semáforo fiscal</div>
          <div className="my-4 mx-auto h-32 w-32 rounded-full flex items-center justify-center relative" style={{ background: "conic-gradient(oklch(0.74 0.16 152) 0 87%, oklch(0.28 0.014 260) 87% 100%)" }}>
            <div className="absolute inset-2 rounded-full bg-card flex flex-col items-center justify-center">
              <div className="text-3xl font-semibold text-success">87</div>
              <div className="text-xs text-muted-foreground">/ 100</div>
            </div>
          </div>
          <div className="text-sm font-medium text-success">Saludable</div>
        </div>

        <div className="md:col-span-2 grid grid-cols-3 gap-3">
          <Stat icon={CheckCircle2} value="22" label="Aprobados" tone="success" />
          <Stat icon={AlertTriangle} value="4" label="Por revisar" tone="warning" />
          <Stat icon={Shield} value="2" label="Críticos" tone="destructive" />
          <div className="col-span-3 rounded-xl p-5 border border-border/60 bg-card/50">
            <div className="flex items-center gap-2 text-sm mb-2"><TrendingUp className="h-4 w-4 text-primary" /> Recomendación IA</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Detecté 2 facturas de <b className="text-foreground">DUDOSA SC</b> (RFC DUD200101QQQ) que aparece en la lista 69-B presunto del SAT.
              Te recomiendo no acreditar IVA por <b className="text-warning">$12,303.45</b> y avisar al cliente antes de la declaración del 17 de noviembre.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
        <div className="p-5 border-b border-border/50">
          <h3 className="font-semibold">Puntos auditados · Servicios García SA</h3>
          <p className="text-xs text-muted-foreground">Última revisión: hoy 09:14</p>
        </div>
        <div className="divide-y divide-border/40">
          {checks.map((c, i) => {
            const dot = c.status === "ok" ? "bg-success" : c.status === "warn" ? "bg-warning" : "bg-destructive";
            return (
              <div key={i} className="px-5 py-4 flex items-center gap-4">
                <div className={`h-2 w-2 rounded-full ${dot}`} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{c.label}</div>
                  <div className="text-xs text-muted-foreground">{c.note}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, value, label, tone }: { icon: typeof Shield; value: string; label: string; tone: "success" | "warning" | "destructive" }) {
  const cls = tone === "success" ? "text-success bg-success/15" : tone === "warning" ? "text-warning bg-warning/15" : "text-destructive bg-destructive/15";
  return (
    <div className="rounded-xl p-5 border border-border/60 bg-card/50">
      <div className={`h-9 w-9 rounded-md flex items-center justify-center ${cls}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
