import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileBarChart, Calculator, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { useActiveCliente } from "@/lib/active-cliente";
import { getResumenFiscalMes } from "@/lib/fiscal/resumen.functions";

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const Route = createFileRoute("/app/reportes/resumen-fiscal")({
  validateSearch: (search: Record<string, unknown>) => {
    const mes = typeof search.mes === "string" && MES_RE.test(search.mes) ? search.mes : undefined;
    return { mes } as { mes?: string };
  },
  component: ResumenFiscalPage,
});

// Tarifa ISR mensual 2024 PF
const TARIFA = [
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
function calcIsr(base: number) {
  if (base <= 0) return { isr: 0, pct: TARIFA[0].pct };
  const t = TARIFA.find((x) => base >= x.li && base <= x.ls)!;
  return { isr: t.cuota + ((base - t.li) * t.pct) / 100, pct: t.pct };
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(Number(n) || 0);

function currentPeriodo() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function labelMes(periodo: string) {
  const [y, m] = periodo.split("-").map(Number);
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return `${meses[m - 1]} ${y}`;
}

function ResumenFiscalPage() {
  const { cliente } = useActiveCliente();
  const fn = useServerFn(getResumenFiscalMes);
  const { mes } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const periodo = mes ?? currentPeriodo();

  const q = useQuery({
    queryKey: ["resumen-fiscal", cliente?.id, periodo],
    queryFn: () => fn({ data: { cliente_id: cliente!.id, periodo } }),
    enabled: !!cliente,
  });

  const r = q.data;
  const calc = useMemo(() => {
    if (!r) return null;
    const base = Math.max(r.ingresos - r.egresos, 0);
    const { isr, pct } = calcIsr(base);
    const ivaCargo = Math.max(r.ivaTrasladado - r.ivaAcreditable, 0);
    const ivaFavor = Math.max(r.ivaAcreditable - r.ivaTrasladado, 0);
    return { base, isr, pct, ivaCargo, ivaFavor };
  }, [r]);

  const calcUrl = `/app/tools/isr-iva-calculator`;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
            <FileBarChart className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Resumen fiscal del mes</h1>
            <p className="text-sm text-muted-foreground">
              Cálculo automático de ISR e IVA a partir de los CFDI del expediente activo.
            </p>
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Periodo</label>
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="h-9 px-3 rounded-md bg-input/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <HerramientaHelp slug="resumen-fiscal" />
          <Button asChild variant="secondary" className="gap-2">
            <Link to={calcUrl}>
              <Calculator className="h-4 w-4" />
              Ir a la calculadora
            </Link>
          </Button>
        </div>
      </header>

      {!cliente && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5" />
          <div>
            <p className="font-medium">Selecciona un expediente para ver el resumen fiscal.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Este resumen calcula ISR e IVA con base en los CFDI del cliente activo.
            </p>
          </div>
        </div>
      )}

      {cliente && (
        <div className="rounded-xl border border-border/60 bg-card/30 p-4 text-sm">
          <span className="text-muted-foreground">Expediente:</span>{" "}
          <span className="font-medium">{cliente.razon_social}</span>{" "}
          <span className="text-muted-foreground">· {cliente.rfc} · {labelMes(periodo)}</span>
        </div>
      )}

      {cliente && q.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</div>
      )}

      {cliente && r && calc && (
        <>
          {r.cfdiCount === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card/30 p-8 text-center">
              <p className="text-muted-foreground">No hay CFDI registrados en {labelMes(periodo)}.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Sube los XML del periodo o usa la calculadora manual para simular escenarios.
              </p>
            </div>
          ) : (
            <>
              <section className="grid md:grid-cols-2 gap-4">
                <Card title="ISR estimado del mes" value={fmt(calc.isr)} subtitle={`Base ${fmt(calc.base)} · Tasa ${calc.pct.toFixed(2)}%`} accent="text-foreground" big />
                {calc.ivaCargo > 0 ? (
                  <Card title="IVA a cargo" value={fmt(calc.ivaCargo)} subtitle={`Trasladado ${fmt(r.ivaTrasladado)} − Acreditable ${fmt(r.ivaAcreditable)}`} accent="text-warning" big />
                ) : (
                  <Card title="IVA a favor" value={fmt(calc.ivaFavor)} subtitle={`Acreditable ${fmt(r.ivaAcreditable)} − Trasladado ${fmt(r.ivaTrasladado)}`} accent="text-success" big />
                )}
              </section>

              <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Mini label="Ingresos CFDI" value={fmt(r.ingresos)} />
                <Mini label="Egresos CFDI" value={fmt(r.egresos)} />
                <Mini label="IVA trasladado" value={fmt(r.ivaTrasladado)} />
                <Mini label="IVA acreditable" value={fmt(r.ivaAcreditable)} />
                <Mini label="Notas de crédito" value={fmt(r.notasCreditoEmitidas)} />
                <Mini label="CFDI considerados" value={String(r.cfdiCount)} />
              </section>

              <div className="rounded-xl border border-border/60 bg-card/30 p-5">
                <p className="text-sm text-muted-foreground mb-3">
                  ¿Quieres ajustar deducciones, simular un escenario o aplicar pagos provisionales previos?
                </p>
                <Button asChild className="gap-2">
                  <Link to={calcUrl}>
                    Abrir calculadora con estos datos
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Cálculo orientativo basado en CFDI vigentes del periodo. No considera retenciones, subsidio al empleo,
                pagos provisionales previos ni régimen específico. Verifica con la normativa SAT vigente.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Card({ title, value, subtitle, accent, big }: { title: string; value: string; subtitle?: string; accent?: string; big?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-5">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className={`tabular-nums ${big ? "text-3xl font-semibold mt-1" : "text-lg font-medium"} ${accent ?? ""}`}>{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground mt-2">{subtitle}</div>}
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/30 p-3">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium tabular-nums mt-1">{value}</div>
    </div>
  );
}
