import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Calculator, Download, Loader2, FileBarChart } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ToolShell } from "@/components/ToolShell";
import { Button } from "@/components/ui/button";
import { useActiveCliente } from "@/lib/active-cliente";
import { getResumenFiscalMes } from "@/lib/fiscal/resumen.functions";

export const Route = createFileRoute("/app/tools/isr-iva-pm")({
  component: IsrIvaPM,
});

function currentPeriodo(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function IsrIvaPM() {
  const { cliente } = useActiveCliente();
  const fnResumen = useServerFn(getResumenFiscalMes);

  const [periodo, setPeriodo] = useState(currentPeriodo());
  const [ingresosNominales, setIngresosNominales] = useState("");
  const [ingresosAcumulados, setIngresosAcumulados] = useState("");
  const [coefUtilidad, setCoefUtilidad] = useState("0.10"); // 10% típico
  const [perdidasFiscales, setPerdidasFiscales] = useState("");
  const [pagosProvAnt, setPagosProvAnt] = useState("");
  const [retIsr, setRetIsr] = useState("");
  const [ivaTrasladado, setIvaTrasladado] = useState("");
  const [ivaAcreditable, setIvaAcreditable] = useState("");
  const [importing, setImporting] = useState(false);
  const [importedFrom, setImportedFrom] = useState<string | null>(null);

  const calc = useMemo(() => {
    const ingMes = Number(ingresosNominales) || 0;
    const ingAcum = Math.max(Number(ingresosAcumulados) || 0, ingMes);
    const ivaT = Number(ivaTrasladado) || 0;
    const ivaA = Number(ivaAcreditable) || 0;
    try {
      const isr = calcularIsrPm({
        periodo,
        ingresosNominales: ingAcum,
        coeficienteUtilidad: Number(coefUtilidad) || 0,
        perdidasPendientes: Number(perdidasFiscales) || 0,
        pagosProvisionalesAnteriores: Number(pagosProvAnt) || 0,
        retenciones: Number(retIsr) || 0,
      });
      const iva = calcularIva({ periodo, ivaTrasladado: ivaT, ivaAcreditable: ivaA });
      return { ok: true as const, ingAcum, isr, iva };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Error de cálculo" };
    }
  }, [periodo, ingresosNominales, ingresosAcumulados, coefUtilidad, perdidasFiscales, pagosProvAnt, retIsr, ivaTrasladado, ivaAcreditable]);


  const f = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  async function importarDelExpediente() {
    if (!cliente) { toast.error("Selecciona un expediente primero"); return; }
    setImporting(true);
    try {
      const r = await fnResumen({ data: { cliente_id: cliente.id, periodo } });
      setIngresosNominales(r.ingresos.toFixed(2));
      setIvaTrasladado(r.ivaTrasladado.toFixed(2));
      setIvaAcreditable(r.ivaAcreditable.toFixed(2));
      setImportedFrom(`${r.cfdiCount} CFDI · ${periodo}`);
      if (r.cfdiCount === 0) toast.warning("No se encontraron CFDI en ese periodo");
      else toast.success(`Importado: ${r.cfdiCount} CFDI`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al importar");
    } finally { setImporting(false); }
  }

  return (
    <ToolShell helpSlug="isr-iva-pm"
      title="Calculadora ISR / IVA — Persona Moral"
      description="Pago provisional mensual para PM régimen general (Art. 14 LISR). Tasa fija 30 % aplicada a la utilidad fiscal estimada con coeficiente de utilidad."
      icon={<Calculator className="h-5 w-5 text-primary-foreground" />}
    >
      <div className="rounded-xl border border-border/60 bg-card/30 p-4 mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Expediente activo</label>
          <div className="text-sm font-medium">
            {cliente ? `${cliente.razon_social} · ${cliente.rfc}` : <span className="text-muted-foreground">— Sin expediente seleccionado</span>}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Periodo</label>
          <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
            className="h-9 px-3 rounded-md bg-input/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <Button type="button" variant="secondary" onClick={importarDelExpediente} disabled={!cliente || importing} className="gap-2">
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Importar del expediente
        </Button>
        <Button asChild variant="ghost" className="gap-2 ml-auto">
          <Link to="/app/tools/isr-iva-calculator"><Calculator className="h-4 w-4" /> Versión Persona Física</Link>
        </Button>
        <Button asChild variant="ghost" className="gap-2">
          <Link to="/app/reportes/resumen-fiscal" search={{ mes: periodo }}><FileBarChart className="h-4 w-4" /> Resumen fiscal</Link>
        </Button>
      </div>
      {importedFrom && (
        <p className="text-xs text-muted-foreground -mt-2 mb-4">
          Datos importados de {importedFrom}. Ajusta el coeficiente de utilidad e ingresos acumulados antes de calcular.
        </p>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-4">
          <h3 className="font-semibold">Datos del periodo</h3>
          <NumField label="Ingresos nominales del mes (MXN)" value={ingresosNominales} onChange={setIngresosNominales} />
          <NumField label="Ingresos nominales acumulados del ejercicio (MXN)" value={ingresosAcumulados} onChange={setIngresosAcumulados} hint="Suma desde enero hasta el mes que se calcula." />
          <NumField label="Coeficiente de utilidad" value={coefUtilidad} onChange={setCoefUtilidad} hint="Ej. 0.10 = 10 %. Se obtiene de la declaración anual previa." step="0.0001" />
          <NumField label="Pérdidas fiscales pendientes de amortizar (acum.)" value={perdidasFiscales} onChange={setPerdidasFiscales} />
          <hr className="border-border/40" />
          <NumField label="Pagos provisionales anteriores (acum.)" value={pagosProvAnt} onChange={setPagosProvAnt} />
          <NumField label="Retenciones de ISR del ejercicio" value={retIsr} onChange={setRetIsr} />
          <hr className="border-border/40" />
          <NumField label="IVA trasladado (cobrado)" value={ivaTrasladado} onChange={setIvaTrasladado} />
          <NumField label="IVA acreditable (pagado)" value={ivaAcreditable} onChange={setIvaAcreditable} />
        </div>

        <div className="space-y-4">
          <Result title="ISR a cargo del mes" big value={f(calc.isrPorPagar)} tone={calc.isrPorPagar > 0 ? "warn" : "ok"} />
          <div className="grid grid-cols-2 gap-3">
            <Result title="Utilidad fiscal estimada" value={f(calc.utilidadFiscal)} />
            <Result title="ISR causado (30 %)" value={f(calc.isrCausado)} />
          </div>
          <hr className="border-border/40" />
          {calc.ivaPorPagar > 0 ? (
            <Result title="IVA a cargo" big value={f(calc.ivaPorPagar)} tone="warn" />
          ) : (
            <Result title="IVA a favor" big value={f(calc.ivaSaldoFavor)} tone="ok" />
          )}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Cálculo orientativo basado en el Art. 14 LISR (PM régimen general, tasa 30 %). No incluye ajuste anual por
            inflación, ISR diferido, ni IETU/IEPS. El coeficiente de utilidad se determina con base en el último ejercicio
            con utilidad fiscal. Confirma con la normativa vigente.
          </p>
        </div>
      </div>
    </ToolShell>
  );
}

function NumField({ label, value, onChange, hint, step = "0.01" }: { label: string; value: string; onChange: (v: string) => void; hint?: string; step?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      <input
        inputMode="decimal" type="number" min="0" step={step}
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="w-full h-10 px-3 rounded-md bg-input/50 border border-border text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {hint && <span className="text-[10px] text-muted-foreground/80 mt-1 block">{hint}</span>}
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
