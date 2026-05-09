import { createFileRoute } from "@tanstack/react-router";
import { Banknote, Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolShell } from "@/components/ToolShell";

export const Route = createFileRoute("/app/tools/bank-reconciler")({
  component: BankReconciler,
});

const ejemplo = [
  { fecha: "2026-10-21", concepto: "SPEI · TECH NORTE SAPI", monto: 56700, match: "matched", cfdi: "F3C4-5D2A-...01" },
  { fecha: "2026-10-20", concepto: "SPEI · cliente no identificado", monto: 45200, match: "unmatched", cfdi: null },
  { fecha: "2026-10-19", concepto: "Pago tarjeta · GASOLINERA", monto: -1820, match: "matched", cfdi: "C9D2-7A1B-...22" },
  { fecha: "2026-10-18", concepto: "Pago proveedor · DUDOSA SC", monto: -89200, match: "review", cfdi: "E4F1-2C8D-...b3" },
];

function BankReconciler() {
  return (
    <ToolShell
      title="Conciliador bancario"
      description="Sube el estado de cuenta del cliente y sus CFDI emitidos/recibidos para cruzar movimientos."
      icon={<Banknote className="h-5 w-5 text-primary-foreground" />}
    >
      <div className="grid md:grid-cols-3 gap-4">
        <UploadCard step="1" title="Estado de cuenta" desc="PDF o Excel" />
        <UploadCard step="2" title="CFDI emitidos" desc="ZIP del SAT" />
        <UploadCard step="3" title="CFDI recibidos" desc="ZIP del SAT" />
      </div>

      <div className="rounded-xl p-5 border border-primary/30 bg-primary/5 mt-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Vista previa con datos de ejemplo</div>
            <p className="text-sm text-muted-foreground mt-1">
              Esta vista demuestra el flujo de conciliación. La detección automática se activará cuando
              subas archivos reales en una próxima iteración.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden mt-4">
        <div className="p-4 border-b border-border/50 font-semibold">Movimientos · ejemplo</div>
        <div className="divide-y divide-border/40">
          {ejemplo.map((m, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center gap-4">
              <div className="text-xs text-muted-foreground w-24">{m.fecha}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.concepto}</div>
                {m.cfdi && <div className="text-xs text-muted-foreground font-mono">CFDI: {m.cfdi}</div>}
              </div>
              <div className={`text-sm font-medium tabular-nums ${m.monto > 0 ? "text-success" : "text-foreground"}`}>
                {m.monto > 0 ? "+" : ""}${Math.abs(m.monto).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </div>
              <MatchBadge state={m.match} />
            </div>
          ))}
        </div>
      </div>
    </ToolShell>
  );
}

function UploadCard({ step, title, desc }: { step: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl p-5 border border-border/60 bg-card/50">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-7 w-7 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">{step}</div>
        <div className="font-medium">{title}</div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{desc}</p>
      <Button variant="glass" size="sm" className="w-full"><Upload className="h-3.5 w-3.5" /> Subir archivo</Button>
    </div>
  );
}

function MatchBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; cls: string; icon?: any }> = {
    matched: { label: "Conciliado", cls: "bg-success/15 text-success" },
    unmatched: { label: "Sin CFDI", cls: "bg-warning/15 text-warning", icon: AlertCircle },
    review: { label: "Revisar", cls: "bg-destructive/15 text-destructive" },
  };
  const m = map[state];
  return <span className={`text-xs px-2 py-1 rounded-md ${m.cls}`}>{m.label}</span>;
}
