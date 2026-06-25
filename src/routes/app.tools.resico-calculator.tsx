import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Coins } from "lucide-react";
import { ToolShell } from "@/components/ToolShell";

export const Route = createFileRoute("/app/tools/resico-calculator")({
  component: ResicoCalculator,
});

// Tabla RESICO PF (LISR Art. 113-E) — tasas mensuales por rango de ingreso
const TABLA_RESICO_PF = [
  { hasta: 25000, tasa: 1.00 },
  { hasta: 50000, tasa: 1.10 },
  { hasta: 83333.33, tasa: 1.50 },
  { hasta: 208333.33, tasa: 2.00 },
  { hasta: 3500000 / 12, tasa: 2.50 }, // tope mensual ~ $291,666.66
];

function tasaResico(ingresoMensual: number) {
  for (const t of TABLA_RESICO_PF) {
    if (ingresoMensual <= t.hasta) return t.tasa;
  }
  return null; // fuera de RESICO
}

function ResicoCalculator() {
  const [ingreso, setIngreso] = useState("");

  const calc = useMemo(() => {
    const ing = Number(ingreso) || 0;
    const tasa = tasaResico(ing);
    const isr = tasa != null ? (ing * tasa) / 100 : 0;
    return { ing, tasa, isr };
  }, [ingreso]);

  const f = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

  return (
    <ToolShell helpSlug="resico-calculator"
      title="Calculadora RESICO Persona Física"
      description="ISR mensual conforme al Régimen Simplificado de Confianza (LISR Art. 113-E)."
      icon={<Coins className="h-5 w-5 text-primary-foreground" />}
    >
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-4">
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Ingresos cobrados del mes (MXN)</span>
            <input
              type="number" min="0" step="0.01" value={ingreso}
              onChange={(e) => setIngreso(e.target.value)}
              placeholder="0.00"
              className="w-full h-10 px-3 rounded-md bg-input/50 border border-border text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <div className="font-medium text-foreground mb-1">Tabla mensual RESICO PF</div>
            {TABLA_RESICO_PF.map((t, i) => (
              <div key={i} className="flex justify-between">
                <span>Hasta {f(t.hasta)}</span>
                <span className="tabular-nums">{t.tasa.toFixed(2)}%</span>
              </div>
            ))}
            <div className="pt-2">Límite anual RESICO PF: $3,500,000.</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-card/50 p-5">
            <div className="text-xs text-muted-foreground">Tasa aplicable</div>
            <div className="text-3xl font-semibold mt-1 tabular-nums">
              {calc.tasa != null ? `${calc.tasa.toFixed(2)}%` : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
            <div className="text-xs text-muted-foreground">ISR a pagar (RESICO PF)</div>
            <div className="text-4xl font-semibold mt-1 text-primary tabular-nums">{f(calc.isr)}</div>
          </div>
          {calc.tasa == null && calc.ing > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
              El ingreso mensual excede el tope de RESICO PF. El contribuyente
              debería revisar si conviene migrar a régimen general.
            </div>
          )}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Cálculo orientativo. No considera retenciones efectuadas por personas morales (1.25%) ni la
            obligación de presentar declaración anual. Verifica la situación particular de cada cliente.
          </p>
        </div>
      </div>
    </ToolShell>
  );
}
