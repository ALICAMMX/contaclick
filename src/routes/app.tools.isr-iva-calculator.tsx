import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Calculator } from "lucide-react";
import { ToolShell } from "@/components/ToolShell";

export const Route = createFileRoute("/app/tools/isr-iva-calculator")({
  component: IsrIvaCalculator,
});

// Tarifa ISR mensual 2024 (estándar; el usuario debe verificar vigencia)
const TARIFA_ISR_MENSUAL = [
  { li: 0.01, ls: 746.04, cuota: 0, pct: 1.92 },
  { li: 746.05, ls: 6332.05, cuota: 14.32, pct: 6.40 },
  { li: 6332.06, ls: 11128.01, cuota: 371.83, pct: 10.88 },
  { li: 11128.02, ls: 12935.82, cuota: 893.63, pct: 16.00 },
  { li: 12935.83, ls: 15487.71, cuota: 1182.88, pct: 17.92 },
  { li: 15487.72, ls: 31236.49, cuota: 1640.18, pct: 21.36 },
  { li: 31236.50, ls: 49233.00, cuota: 5004.12, pct: 23.52 },
  { li: 49233.01, ls: 93993.90, cuota: 9236.89, pct: 30.00 },
  { li: 93993.91, ls: 125325.20, cuota: 22665.17, pct: 32.00 },
  { li: 125325.21, ls: 375975.61, cuota: 32691.18, pct: 34.00 },
  { li: 375975.62, ls: Infinity, cuota: 117912.32, pct: 35.00 },
];

function calcIsrPF(base: number) {
  if (base <= 0) return { isr: 0, tramo: TARIFA_ISR_MENSUAL[0] };
  const tramo = TARIFA_ISR_MENSUAL.find((t) => base >= t.li && base <= t.ls)!;
  const excedente = base - tramo.li;
  const isr = tramo.cuota + (excedente * tramo.pct) / 100;
  return { isr, tramo };
}

function IsrIvaCalculator() {
  const [ingresos, setIngresos] = useState("");
  const [deducciones, setDeducciones] = useState("");
  const [ivaTrasladado, setIvaTrasladado] = useState("");
  const [ivaAcreditable, setIvaAcreditable] = useState("");

  const calc = useMemo(() => {
    const ing = Number(ingresos) || 0;
    const ded = Number(deducciones) || 0;
    const ivaT = Number(ivaTrasladado) || 0;
    const ivaA = Number(ivaAcreditable) || 0;
    const base = Math.max(ing - ded, 0);
    const { isr, tramo } = calcIsrPF(base);
    const ivaPorPagar = Math.max(ivaT - ivaA, 0);
    const ivaSaldoFavor = Math.max(ivaA - ivaT, 0);
    return { ing, ded, base, isr, tramo, ivaT, ivaA, ivaPorPagar, ivaSaldoFavor };
  }, [ingresos, deducciones, ivaTrasladado, ivaAcreditable]);

  const f = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <ToolShell
      title="Calculadora ISR / IVA mensual"
      description="Pago provisional estimado para PF con actividad empresarial. Verifica siempre las tarifas vigentes."
      icon={<Calculator className="h-5 w-5 text-primary-foreground" />}
    >
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-4">
          <h3 className="font-semibold">Datos del periodo</h3>
          <NumField label="Ingresos acumulables del mes (MXN)" value={ingresos} onChange={setIngresos} />
          <NumField label="Deducciones autorizadas (MXN)" value={deducciones} onChange={setDeducciones} />
          <hr className="border-border/40" />
          <NumField label="IVA trasladado (cobrado)" value={ivaTrasladado} onChange={setIvaTrasladado} />
          <NumField label="IVA acreditable (pagado)" value={ivaAcreditable} onChange={setIvaAcreditable} />
        </div>

        <div className="space-y-4">
          <Result title="ISR a cargo del mes" big value={f(calc.isr)} />
          <div className="grid grid-cols-2 gap-3">
            <Result title="Base gravable" value={f(calc.base)} />
            <Result title="Tasa marginal" value={`${calc.tramo.pct.toFixed(2)}%`} />
          </div>
          <hr className="border-border/40" />
          {calc.ivaPorPagar > 0 ? (
            <Result title="IVA a cargo" big value={f(calc.ivaPorPagar)} tone="warn" />
          ) : (
            <Result title="IVA a favor" big value={f(calc.ivaSaldoFavor)} tone="ok" />
          )}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Tarifas ISR 2024 publicadas por SAT. Esta herramienta es un cálculo orientativo: no incluye
            subsidio al empleo, pagos provisionales previos ni retenciones. Confirma el resultado con la
            normativa vigente y el régimen específico del contribuyente.
          </p>
        </div>
      </div>
    </ToolShell>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      <input
        inputMode="decimal" type="number" min="0" step="0.01"
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="w-full h-10 px-3 rounded-md bg-input/50 border border-border text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </label>
  );
}

function Result({ title, value, big, tone }: { title: string; value: string; big?: boolean; tone?: "ok" | "warn" }) {
  const accent = tone === "ok" ? "text-success" : tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className={`tabular-nums ${big ? "text-3xl font-semibold mt-1" : "text-lg font-medium"} ${accent}`}>{value}</div>
    </div>
  );
}
