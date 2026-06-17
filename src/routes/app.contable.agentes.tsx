import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold } from "@/components/ModuleScaffold";
import { Bot, FileText, ShieldAlert, Banknote, ScanSearch, Building, Scale, FileBadge, Calculator } from "lucide-react";

export const Route = createFileRoute("/app/contable/agentes")({ component: AgentesPage });

const AGENTS = [
  { name: "CFDI", icon: FileText, role: "Valida cada XML recibido y emitido", trigger: "Llega un XML nuevo", tools: ["Validador CFDI 4.0", "Verificador UUID", "Auditor express"], log: ["Hace 4m · Validó 18 CFDI · 2 con error de método de pago", "Hace 1h · Detectó duplicado UUID …a7b9"] },
  { name: "Fiscal SAT", icon: ShieldAlert, role: "Defensa proactiva contra los 12 criterios 2026", trigger: "Cierre mensual o cambio de score", tools: ["Analizador de Riesgo SAT", "Validador 69-B"], log: ["Hace 2h · Recalculó score: 72/100 (amarillo)", "Ayer · Detectó proveedor EFOS publicado el 03-jun"] },
  { name: "Conciliación", icon: Banknote, role: "Cruza bancos vs CFDI", trigger: "Sube estado de cuenta", tools: ["Conciliador bancario"], log: ["Hace 30m · 142/145 movimientos conciliados", "Hace 30m · 3 depósitos sin CFDI flagged"] },
  { name: "Auditor", icon: ScanSearch, role: "Hallazgos preventivos de cierre", trigger: "Día 25 de cada mes", tools: ["Auditor express", "Validador de Deducibilidad"], log: ["Ayer · 7 hallazgos en gastos de representación"] },
  { name: "Corporativo-Fiscal", icon: Building, role: "Operaciones con partes relacionadas", trigger: "Detecta CFDI con partes relacionadas", tools: ["Precios de transferencia"], log: ["Standby"] },
  { name: "Defensa", icon: Scale, role: "Activa lagunas legales", trigger: "Llega oficio del SAT", tools: ["Mapa de lagunas", "Redactor de escritos"], log: ["Hace 1d · 3 oportunidades de devolución detectadas"] },
  { name: "Materialidad", icon: FileBadge, role: "Construye soporte de operaciones", trigger: "Operación > $100K MXN sin soporte", tools: ["Validador de Deducibilidad"], log: ["Standby"] },
  { name: "Cierre", icon: Calculator, role: "Pre-cierre mensual automático", trigger: "Día 28", tools: ["ISR/IVA", "RESICO"], log: ["Activación en 4 días"] },
];

function AgentesPage() {
  return (
    <ModuleScaffold
      title="8 Agentes Contables-Fiscales"
      subtitle="Cada agente tiene una función específica, se activa por eventos y opera sobre sus herramientas. La IA propone, tú apruebas."
      icon={<Bot className="h-5 w-5" />}
      badge="Vista previa · Orquestación 100% funcional próximamente"
    >
      <div className="grid md:grid-cols-2 gap-4">
        {AGENTS.map((a) => {
          const Icon = a.icon;
          return (
            <div key={a.name} className="rounded-xl border border-border/60 bg-card/50 p-5">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30 grid place-items-center text-primary shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">Agente {a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.role}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                <span className="text-muted-foreground">Trigger</span><span>{a.trigger}</span>
                <span className="text-muted-foreground">Herramientas</span><span>{a.tools.join(" · ")}</span>
              </div>
              <div className="mt-4 pt-3 border-t border-border/40">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Bitácora</div>
                <ul className="space-y-1 text-xs">
                  {a.log.map((l, i) => <li key={i} className="text-muted-foreground">• {l}</li>)}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </ModuleScaffold>
  );
}
