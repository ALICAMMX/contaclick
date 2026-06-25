import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Sparkles, ArrowRight, Zap, Building2, Rocket, Users } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/precios")({
  head: () => ({
    meta: [
      { title: "Precios y planes — ContaClick IA" },
      { name: "description", content: "Planes mensuales y anuales para despachos contables en México. Prueba gratis 14 días, sin tarjeta. Desde $499 MXN al mes." },
      { property: "og:title", content: "Precios ContaClick IA — Planes para despachos contables" },
      { property: "og:description", content: "Elige el plan ideal para tu despacho. Prueba 14 días gratis." },
    ],
  }),
  component: PreciosPage,
});

type Billing = "mensual" | "anual";

const plans = [
  {
    id: "starter",
    name: "Starter",
    icon: Rocket,
    tagline: "Para contadores independientes que están empezando",
    mensual: 499,
    anual: 4990, // 2 meses gratis
    rfc: "Hasta 5 RFC activos",
    ia: { solicitudes: "200 / mes", tokens: "1M tokens" },
    sat: "200 descargas SAT / mes · sincronización semanal",
    storage: "5 GB de almacenamiento",
    highlight: false,
    features: [
      "Analizador CFDI (XML, ZIP y carpetas)",
      "Validador RFC y constancias CSF",
      "Calculadora fiscal (ISR, IVA, RESICO)",
      "Asistente IA contable básico",
      "Alertas SAT esenciales",
      "Soporte por email",
    ],
  },
  {
    id: "pro",
    name: "Profesional",
    icon: Sparkles,
    tagline: "Para despachos en crecimiento que necesitan automatización completa",
    mensual: 1290,
    anual: 12900,
    rfc: "Hasta 25 RFC activos",
    ia: { solicitudes: "1,500 / mes", tokens: "5M tokens" },
    sat: "1,000 descargas SAT / mes · sincronización diaria",
    storage: "25 GB de almacenamiento",
    highlight: true,
    features: [
      "Todo lo de Starter, más:",
      "Conciliador Bancario IA",
      "Auditor Fiscal IA con semáforo por cliente",
      "Reportería inteligente (PDF / Excel)",
      "Tesorería: CXC, CXP y proyección de flujo",
      "Gestor de Trámites con Kanban",
      "Importación masiva desde Excel / Sheets",
      "Hasta 3 usuarios del equipo",
      "Soporte prioritario",
    ],
  },
  {
    id: "despacho",
    name: "Despacho",
    icon: Building2,
    tagline: "Solución completa para despachos consolidados",
    mensual: 2490,
    anual: 24900,
    rfc: "Hasta 100 RFC activos",
    ia: { solicitudes: "5,000 / mes", tokens: "20M tokens" },
    sat: "4,000 descargas SAT / mes · sincronización diaria",
    storage: "100 GB de almacenamiento",
    highlight: false,
    features: [
      "Todo lo de Profesional, más:",
      "Agentes IA especializados (Auditor, CFDI, Cierre, Conciliación)",
      "Defensa fiscal: deducibilidad, nómina oculta, precios de importación",
      "Módulo legal: redactor, lagunas y marketplace",
      "Expedientes digitales y correspondencia",
      "Hasta 10 usuarios con roles (Owner, Admin, Member, Viewer)",
      "Dashboard ejecutivo del despacho",
      "Onboarding 1:1 y soporte por WhatsApp",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    icon: Users,
    tagline: "Para firmas multi-oficina y corporativos",
    mensual: null,
    anual: null,
    rfc: "RFC ilimitados",
    ia: { solicitudes: "Personalizado", tokens: "Personalizado" },
    sat: "Descargas SAT ilimitadas · sincronización diaria",
    storage: "Almacenamiento personalizado",
    highlight: false,
    features: [
      "Todo lo de Despacho, más:",
      "Usuarios ilimitados y SSO",
      "Importación masiva de cartera desde Excel/CSV",
      "Validador de Deducibilidad IA y Detector de Nómina Oculta",
      "Modelo de IA dedicado y SLA",
      "Manager de cuenta dedicado",
      "Capacitación online (y on-site si se requiere)",
    ],
  },
];

const mxn = (n: number) => `$${n.toLocaleString("es-MX")}`;

function PreciosPage() {
  const [billing, setBilling] = useState<Billing>("mensual");

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 -z-10 opacity-40" aria-hidden style={{ background: "var(--gradient-primary)", filter: "blur(120px)" }} />
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <span className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-primary" /> Prueba gratis 14 días · sin tarjeta de crédito
          </span>
          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            Precios pensados para <span className="gradient-text">despachos mexicanos</span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
            Empieza gratis con todas las herramientas. Al terminar tu prueba, elige el plan que mejor se ajuste al tamaño de tu despacho.
          </p>

          {/* Billing toggle */}
          <div className="mt-10 inline-flex items-center gap-1 rounded-full glass p-1 border border-border/60">
            <button
              onClick={() => setBilling("mensual")}
              className={`px-5 py-2 rounded-full text-sm transition-colors ${billing === "mensual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Mensual
            </button>
            <button
              onClick={() => setBilling("anual")}
              className={`px-5 py-2 rounded-full text-sm transition-colors flex items-center gap-2 ${billing === "anual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Anual
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${billing === "anual" ? "bg-primary-foreground/20" : "bg-success/20 text-success"}`}>
                2 meses gratis
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-6 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => {
            const Icon = p.icon;
            const price = billing === "mensual" ? p.mensual : p.anual;
            const monthlyEq = p.anual ? Math.round(p.anual / 12) : null;
            return (
              <div
                key={p.id}
                className={`relative rounded-2xl border p-6 flex flex-col ${
                  p.highlight
                    ? "border-primary/60 bg-gradient-to-b from-primary/10 to-transparent"
                    : "border-border/60 glass"
                }`}
                style={p.highlight ? { boxShadow: "var(--shadow-elevated)" } : undefined}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium bg-primary text-primary-foreground">
                    Más popular
                  </span>
                )}
                <div className="flex items-center gap-2 text-primary">
                  <Icon className="h-5 w-5" />
                  <h3 className="text-lg font-semibold text-foreground">{p.name}</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground min-h-[40px]">{p.tagline}</p>

                <div className="mt-5">
                  {price === null ? (
                    <div className="text-3xl font-semibold">A medida</div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-semibold tracking-tight">{mxn(price)}</span>
                        <span className="text-sm text-muted-foreground">MXN / {billing === "mensual" ? "mes" : "año"}</span>
                      </div>
                      {billing === "anual" && monthlyEq && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Equivale a {mxn(monthlyEq)} / mes
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-5 space-y-1.5 text-xs text-muted-foreground border-y border-border/50 py-4">
                  <div><b className="text-foreground">{p.rfc}</b></div>
                  <div>IA: <b className="text-foreground">{p.ia.solicitudes}</b> · {p.ia.tokens}</div>
                  <div>{p.storage}</div>
                </div>

                <ul className="mt-5 space-y-2.5 text-sm flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success flex-none mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {p.id === "enterprise" ? (
                    <Button asChild variant="glass" className="w-full">
                      <Link to="/contacto">Hablar con ventas</Link>
                    </Button>
                  ) : (
                    <Button asChild variant={p.highlight ? "hero" : "glass"} className="w-full">
                      <Link to="/auth">Comenzar prueba de 14 días</Link>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground max-w-2xl mx-auto px-6">
          Precios en pesos mexicanos. IVA no incluido. Los límites de IA aplican al primero que se alcance (solicitudes o tokens).
          Puedes cambiar o cancelar tu plan en cualquier momento.
        </p>
      </section>

      {/* Comparativa rápida */}
      <section className="py-16 border-t border-border/50">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-center">
            Todo lo que incluye <span className="gradient-text">ContaClick IA</span>
          </h2>
          <div className="mt-10 grid md:grid-cols-3 gap-6 text-sm">
            {[
              { t: "Contable", items: ["Analizador CFDI", "Conciliador bancario IA", "Auditor fiscal IA", "Reportería inteligente", "Calculadora ISR/IVA/RESICO"] },
              { t: "Administrativo", items: ["Tesorería con flujo de caja", "Gestor de trámites Kanban", "Expedientes y correspondencia", "Nómina y activos", "Importación Excel / Sheets"] },
              { t: "Legal y Defensa", items: ["Redactor de documentos", "Análisis de lagunas", "Defensa: deducibilidad y nómina oculta", "Marketplace legal", "Agentes IA especializados"] },
            ].map((g) => (
              <div key={g.t} className="rounded-xl border border-border/60 glass p-5">
                <h3 className="font-semibold mb-3">{g.t}</h3>
                <ul className="space-y-2 text-muted-foreground">
                  {g.items.map((i) => (
                    <li key={i} className="flex gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success flex-none mt-0.5" />
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 border-t border-border/50">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-center">Preguntas frecuentes</h2>
          <div className="mt-10 space-y-4">
            {[
              { q: "¿Cómo funciona la prueba de 14 días?", a: "Crea tu cuenta y obtén acceso completo al plan Profesional durante 14 días, sin tarjeta de crédito. Al terminar puedes elegir el plan que mejor se ajuste o continuar en modo limitado." },
              { q: "¿Puedo cambiar de plan después?", a: "Sí, puedes subir o bajar de plan en cualquier momento desde Configuración. El cobro se ajusta de forma prorrateada." },
              { q: "¿Qué pasa si supero el límite de IA?", a: "Te avisamos cuando llegues al 80%. Puedes comprar paquetes adicionales o subir de plan sin perder tu información." },
              { q: "¿Mis datos están seguros?", a: "Sí. Hospedamos en infraestructura cifrada, con respaldos diarios y aislamiento por despacho. Cumplimos con la LFPDPPP." },
              { q: "¿Aceptan factura?", a: "Por supuesto. Emitimos CFDI 4.0 a la razón social que indiques al momento del pago." },
            ].map((f) => (
              <details key={f.q} className="group rounded-xl border border-border/60 glass p-5">
                <summary className="cursor-pointer font-medium flex items-center justify-between">
                  {f.q}
                  <span className="text-primary group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 border-t border-border/50">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
            Empieza tu prueba <span className="gradient-text">hoy mismo</span>
          </h2>
          <p className="mt-4 text-muted-foreground">14 días gratis · sin tarjeta · cancela cuando quieras</p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg" variant="hero">
              <Link to="/auth">Probar gratis <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="glass">
              <Link to="/contacto">Hablar con ventas</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <Logo size="sm" />
          <div>© 2026 ContaClick IA · Hecho en México 🇲🇽</div>
          <div className="flex gap-5">
            <Link to="/privacidad" className="hover:text-foreground">Privacidad</Link>
            <Link to="/terminos" className="hover:text-foreground">Términos</Link>
            <Link to="/contacto" className="hover:text-foreground">Contacto</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
