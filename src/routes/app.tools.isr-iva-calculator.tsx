import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { Calculator, Download, Loader2, FileBarChart, Upload } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import JSZip from "jszip";
import { ToolShell } from "@/components/ToolShell";
import { Button } from "@/components/ui/button";
import { useActiveCliente } from "@/lib/active-cliente";
import { getResumenFiscalMes } from "@/lib/fiscal/resumen.functions";
import { parseCfdi } from "@/lib/tools/cfdi-parser";

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

function currentPeriodo(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function IsrIvaCalculator() {
  const { cliente } = useActiveCliente();
  const fnResumen = useServerFn(getResumenFiscalMes);

  const [periodo, setPeriodo] = useState(currentPeriodo());
  const [ingresos, setIngresos] = useState("");
  const [deducciones, setDeducciones] = useState("");
  const [ivaTrasladado, setIvaTrasladado] = useState("");
  const [ivaAcreditable, setIvaAcreditable] = useState("");
  const [importing, setImporting] = useState(false);
  const [importedFrom, setImportedFrom] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function importarDelExpediente() {
    if (!cliente) {
      toast.error("Selecciona un expediente primero");
      return;
    }
    setImporting(true);
    try {
      const r = await fnResumen({ data: { cliente_id: cliente.id, periodo } });
      setIngresos(r.ingresos.toFixed(2));
      setDeducciones(r.egresos.toFixed(2));
      setIvaTrasladado(r.ivaTrasladado.toFixed(2));
      setIvaAcreditable(r.ivaAcreditable.toFixed(2));
      setImportedFrom(`${r.cfdiCount} CFDI · ${periodo}`);
      if (r.cfdiCount === 0) {
        toast.warning("No se encontraron CFDI en ese periodo");
      } else {
        toast.success(`Importado: ${r.cfdiCount} CFDI`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al importar");
    } finally {
      setImporting(false);
    }
  }

  async function procesarXmlLocal(files: FileList | File[]) {
    setParsing(true);
    try {
      const xmls: { name: string; xml: string }[] = [];
      for (const f of Array.from(files)) {
        const lower = f.name.toLowerCase();
        if (lower.endsWith(".zip")) {
          const zip = await JSZip.loadAsync(await f.arrayBuffer());
          const entries = Object.values(zip.files).filter((e) => !e.dir && e.name.toLowerCase().endsWith(".xml"));
          for (const e of entries) xmls.push({ name: e.name, xml: await e.async("string") });
        } else if (lower.endsWith(".xml")) {
          xmls.push({ name: f.name, xml: await f.text() });
        }
      }
      if (!xmls.length) { toast.error("No se encontraron XML válidos."); return; }

      const parsed = xmls.map((x) => ({ ...x, p: parseCfdi(x.xml) }));

      // Detectar RFC del contribuyente: el del expediente activo, o el más frecuente en los XML
      let rfcContrib = cliente?.rfc?.toUpperCase();
      if (!rfcContrib) {
        const counts = new Map<string, number>();
        for (const { p } of parsed) {
          [p.emisor.rfc, p.receptor.rfc].forEach((r) => {
            if (r) counts.set(r.toUpperCase(), (counts.get(r.toUpperCase()) ?? 0) + 1);
          });
        }
        rfcContrib = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
      }
      if (!rfcContrib) { toast.error("No se pudo identificar el RFC del contribuyente."); return; }

      // Filtrar por periodo seleccionado (YYYY-MM)
      const enPeriodo = parsed.filter((x) => (x.p.fecha ?? "").slice(0, 7) === periodo);
      if (!enPeriodo.length) {
        const meses = Array.from(new Set(parsed.map((x) => (x.p.fecha ?? "").slice(0, 7)).filter(Boolean)));
        toast.error(`Ningún XML es del periodo ${periodo}. Detectados: ${meses.join(", ") || "fechas inválidas"}`);
        return;
      }

      let ing = 0, eg = 0, ivaT = 0, ivaA = 0, nc = 0;
      for (const { p } of enPeriodo) {
        const emisor = p.emisor.rfc?.toUpperCase();
        const total = p.total ?? 0;
        const iva = p.impuestos.totalTrasladados ?? 0;
        const esEmitido = emisor === rfcContrib;
        if (p.tipoComprobante === "I" && esEmitido) { ing += total; ivaT += iva; }
        else if (p.tipoComprobante === "I" && !esEmitido) { eg += total; ivaA += iva; }
        else if (p.tipoComprobante === "E" && esEmitido) { nc += total; }
      }
      const ingNeto = Math.max(ing - nc, 0);
      setIngresos(ingNeto.toFixed(2));
      setDeducciones(eg.toFixed(2));
      setIvaTrasladado(ivaT.toFixed(2));
      setIvaAcreditable(ivaA.toFixed(2));
      setImportedFrom(`${enPeriodo.length} XML · ${periodo} · contribuyente ${rfcContrib}`);
      toast.success(`Procesados ${enPeriodo.length} XML del periodo ${periodo}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al leer los XML");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <ToolShell helpSlug="isr-iva-calculator"
      title="Calculadora ISR / IVA mensual"
      description="Pago provisional estimado para PF con actividad empresarial. Verifica siempre las tarifas vigentes."
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
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="h-9 px-3 rounded-md bg-input/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={importarDelExpediente}
          disabled={!cliente || importing}
          className="gap-2"
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Importar del expediente
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={parsing}
          className="gap-2"
        >
          {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Subir XML / ZIP
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.zip,text/xml,application/xml,application/zip"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && procesarXmlLocal(e.target.files)}
        />
        <Button asChild variant="ghost" className="gap-2 ml-auto">
          <Link to="/app/reportes/resumen-fiscal">
            <FileBarChart className="h-4 w-4" />
            Resumen fiscal del mes
          </Link>
        </Button>
      </div>
      {importedFrom && (
        <p className="text-xs text-muted-foreground -mt-2 mb-4">
          Datos importados de {importedFrom}. Puedes editarlos antes de calcular.
        </p>
      )}

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
