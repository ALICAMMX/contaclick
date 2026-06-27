import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { CheckCircle2, CreditCard, Loader2, Lock, Receipt, Ticket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { PLANS, computeTotal, isValidPlan, isValidCycle, type BillingCycle, type PlanId } from "@/lib/payments/plans";
import { createMpCheckout } from "@/lib/payments/mp.functions";
import { validarCupon } from "@/lib/payments/cupones.functions";

const Search = z.object({
  plan: z.string().optional(),
  cycle: z.string().optional(),
});

export const Route = createFileRoute("/app/checkout")({
  validateSearch: (s) => Search.parse(s),
  component: CheckoutPage,
});

const mxn = (n: number) =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CheckoutPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const initialPlan: PlanId = isValidPlan(search.plan ?? "") ? (search.plan as PlanId) : "pro";
  const initialCycle: BillingCycle = isValidCycle(search.cycle ?? "") ? (search.cycle as BillingCycle) : "mensual";

  const [planId, setPlanId] = useState<PlanId>(initialPlan);
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [includeIva, setIncludeIva] = useState(true);
  const [loading, setLoading] = useState(false);
  const [cuponInput, setCuponInput] = useState("");
  const [cupon, setCupon] = useState<{ codigo: string; porcentaje: number } | null>(null);
  const [cuponLoading, setCuponLoading] = useState(false);

  // Mantener URL sincronizada
  useEffect(() => {
    navigate({ to: "/app/checkout", search: { plan: planId, cycle }, replace: true });
  }, [planId, cycle, navigate]);

  // Si cambia plan o ciclo, revalidar/limpiar cupón aplicado
  useEffect(() => { if (cupon) setCupon(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [planId, cycle]);

  const plan = PLANS[planId];
  const totals = useMemo(
    () => computeTotal(plan, cycle, includeIva, cupon?.porcentaje ?? 0),
    [plan, cycle, includeIva, cupon],
  );
  const monthlyEq = cycle === "anual" ? Math.round(totals.total / 12) : null;

  const start = useServerFn(createMpCheckout);
  const validar = useServerFn(validarCupon);

  async function aplicarCupon() {
    const codigo = cuponInput.trim();
    if (!codigo) return;
    setCuponLoading(true);
    try {
      const r = await validar({ data: { codigo, plan_id: planId, billing_cycle: cycle } });
      if (!r.valido) {
        toast.error(r.motivo || "Cupón inválido");
        return;
      }
      setCupon({ codigo, porcentaje: r.porcentaje });
      toast.success(`Cupón aplicado: -${r.porcentaje}%`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo validar el cupón");
    } finally {
      setCuponLoading(false);
    }
  }

  async function handlePay() {
    setLoading(true);
    try {
      const r = await start({
        data: {
          plan_id: planId,
          billing_cycle: cycle,
          include_iva: includeIva,
          cupon_codigo: cupon?.codigo,
        },
      });
      const url = r.init_point || r.sandbox_init_point;
      if (!url) throw new Error("No se obtuvo URL de pago");
      window.location.href = url;
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "No se pudo iniciar el pago. Intenta de nuevo.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Contratar plan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Activa tu suscripción con cargo automático mediante Mercado Pago. Puedes cancelar cuando quieras.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr,360px] gap-6">
        {/* IZQUIERDA: selección */}
        <div className="space-y-6">
          {/* Plan */}
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="font-medium mb-3">1. Elige tu plan</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {(Object.values(PLANS) as typeof PLANS[PlanId][]).map((p) => {
                const active = p.id === planId;
                const cardPrice = cycle === "mensual" ? p.mensual : p.anual;
                const cardMonthlyEq = cycle === "anual" ? Math.round(p.anual / 12) : null;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPlanId(p.id)}
                    className={`text-left rounded-xl border p-4 transition-colors ${
                      active
                        ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="text-sm font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{p.description}</div>
                    <div className="mt-3 text-lg font-bold">
                      ${cardPrice.toLocaleString("es-MX")}
                      <span className="text-xs font-normal text-muted-foreground">
                        {" "}/{cycle === "mensual" ? "mes" : "año"}
                      </span>
                    </div>
                    {cardMonthlyEq && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        ≈ ${cardMonthlyEq.toLocaleString("es-MX")} / mes
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Ciclo */}
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="font-medium mb-3">2. Periodicidad</h2>
            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-background p-1">
              <button
                onClick={() => setCycle("mensual")}
                className={`px-5 py-2 rounded-full text-sm transition-colors ${
                  cycle === "mensual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                Mensual
              </button>
              <button
                onClick={() => setCycle("anual")}
                className={`px-5 py-2 rounded-full text-sm transition-colors flex items-center gap-2 ${
                  cycle === "anual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                Anual
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/20 text-success">2 meses gratis</span>
              </button>
            </div>
          </section>

          {/* IVA */}
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-medium flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" /> 3. Más IVA (16%)
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Activa esta opción si requieres factura CFDI por el importe con IVA incluido.
                </p>
              </div>
              <Switch checked={includeIva} onCheckedChange={setIncludeIva} />
            </div>
          </section>

          {/* Cupón */}
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="font-medium flex items-center gap-2 mb-1">
              <Ticket className="h-4 w-4 text-primary" /> 4. ¿Tienes un cupón?
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              Aplica un código promocional. El descuento se calcula sobre el subtotal antes de IVA.
            </p>
            {cupon ? (
              <div className="flex items-center justify-between rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm">
                <span className="font-medium text-success">
                  {cupon.codigo.toUpperCase()} — -{cupon.porcentaje}%
                </span>
                <button
                  type="button"
                  onClick={() => { setCupon(null); setCuponInput(""); }}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Quitar cupón"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={cuponInput}
                  onChange={(e) => setCuponInput(e.target.value)}
                  placeholder="Código de cupón"
                  className="uppercase"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aplicarCupon(); } }}
                />
                <Button type="button" variant="secondary" onClick={aplicarCupon} disabled={cuponLoading || !cuponInput.trim()}>
                  {cuponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
                </Button>
              </div>
            )}
          </section>
        </div>

        {/* DERECHA: resumen */}
        <aside className="rounded-2xl border border-border/60 bg-card p-5 h-fit sticky top-20">
          <h2 className="font-medium mb-4">Resumen</h2>
          <div className="space-y-2 text-sm">
            <Row label="Plan" value={plan.name} />
            <Row label="Ciclo" value={cycle === "mensual" ? "Mensual" : "Anual"} />
            <Row label="Precio base" value={mxn(totals.base)} />
            {cupon && (
              <Row label={`Cupón ${cupon.codigo.toUpperCase()} (-${cupon.porcentaje}%)`} value={`- ${mxn(totals.descuento)}`} />
            )}
            <Row label="Subtotal" value={mxn(totals.subtotal)} />
            <Row label="IVA (16%)" value={includeIva ? mxn(totals.iva) : "No aplica"} />
            {monthlyEq && <Row label="Equivalente mensual" value={`${mxn(monthlyEq)} / mes`} muted />}
          </div>
          <div className="border-t border-border/60 mt-4 pt-4 flex items-baseline justify-between">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-bold text-primary">{mxn(totals.total)} MXN</span>
          </div>

          <Button onClick={handlePay} disabled={loading} className="w-full mt-5 gap-2" size="lg">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {loading ? "Conectando con Mercado Pago…" : "Pagar con Mercado Pago"}
          </Button>

          <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            <li className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5" /> Cargo automático recurrente</li>
            <li className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5" /> Cancela cuando quieras</li>
            <li className="flex gap-2"><Lock className="h-3.5 w-3.5 text-success mt-0.5" /> Pago procesado por Mercado Pago</li>
          </ul>

          <p className="text-[11px] text-muted-foreground mt-4 text-center">
            Al continuar aceptas los{" "}
            <Link to="/terminos" className="underline">Términos</Link> y la{" "}
            <Link to="/privacidad" className="underline">Política de privacidad</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={muted ? "text-muted-foreground" : "font-medium"}>{value}</span>
    </div>
  );
}
