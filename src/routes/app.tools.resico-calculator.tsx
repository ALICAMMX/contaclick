import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Coins } from "lucide-react";
import { ToolShell } from "@/components/ToolShell";
import { calcularResicoPf } from "@/lib/fiscal/normativa/motor";
import { NormativaBadge, NormativaBloqueada } from "@/components/NormativaBadge";

export const Route = createFileRoute("/app/tools/resico-calculator")({
  component: ResicoCalculator,
});

function currentPeriodo(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ResicoCalculator() {
  const [periodo, setPeriodo] = useState(currentPeriodo());
  const [ingreso, setIngreso] = useState("");
  const [acumulado, setAcumulado] = useState("");
  const [retencionPM, setRetencionPM] = useState(false);

  const calc = useMemo(() => {
    try {
      return {
        ok: true as const,
        r: calcularResicoPf({
          periodo,
          ingresosCobrados: Number(ingreso) || 0,
          acumuladoAnualPrevio: Number(acumulado) || 0,
          retencionPersonaMoral: retencionPM,
        }),
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Error de cálculo" };
    }
  }, [periodo, ingreso, acumulado, retencionPM]);

  const f = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <ToolShell helpSlug="resico-calculator"
      title="Calculadora RESICO Persona Física"
      description="ISR mensual conforme al Régimen Simplificado de Confianza (LISR Art. 113-E)."
      icon={<Coins className="h-5 w-5 text-primary-foreground" />}
    >
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-4">
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Periodo que se calcula</span>
            <input
              type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
              className="w-full h-10 px-3 rounded-md bg-input/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Ingresos cobrados del mes (MXN)</span>
            <input
              type="number" min="0" step="0.01" value={ingreso}
              onChange={(e) => setIngreso(e.target.value)}
              placeholder="0.00"
              className="w-full h-10 px-3 rounded-md bg-input/50 border border-border text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Acumulado del ejercicio antes de este mes (MXN)</span>
            <input
              type="number" min="0" step="0.01" value={acumulado}
              onChange={(e) => setAcumulado(e.target.value)}
              placeholder="0.00"
              className="w-full h-10 px-3 rounded-md bg-input/50 border border-border text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={retencionPM} onChange={(e) => setRetencionPM(e.target.checked)} />
            <span>Facturó a personas morales (retención 1.25 %, art. 113-J LISR)</span>
          </label>
        </div>

        <div className="space-y-4">
          {!calc.ok ? (
            <NormativaBloqueada mensaje={calc.error} />
          ) : (
            <>
              <div className="rounded-xl border border-border/60 bg-card/50 p-5">
                <div className="text-xs text-muted-foreground">Tasa aplicable</div>
                <div className="text-3xl font-semibold mt-1 tabular-nums">
                  {calc.r.tasa != null ? `${calc.r.tasa.toFixed(2)}%` : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
                <div className="text-xs text-muted-foreground">ISR a cargo (RESICO PF)</div>
                <div className="text-4xl font-semibold mt-1 text-primary tabular-nums">{f(calc.r.isrACargo)}</div>
                <div className="text-xs text-muted-foreground mt-2 tabular-nums">
                  ISR causado {f(calc.r.isrCausado)} − retención {f(calc.r.retencion)}
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/50 p-4 text-xs text-muted-foreground tabular-nums">
                Acumulado del ejercicio: {f(calc.r.acumuladoAnual)} de {f(calc.r.limiteAnual)} permitidos.
              </div>
              {calc.r.bloqueado && calc.r.motivoBloqueo && (
                <NormativaBloqueada mensaje={calc.r.motivoBloqueo} />
              )}
              <NormativaBadge sello={calc.r.normativa} />
            </>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
