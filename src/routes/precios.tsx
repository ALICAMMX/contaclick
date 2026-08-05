import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Sparkles, ArrowRight, Zap, Building2, Rocket, Users, Crown } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { PWAInstallLink } from "@/components/PWAInstall";
import {
  PLANS,
  PLANES_ORDEN,
  PROGRAMA_FUNDADOR,
  ahorroAnualCents,
  equivalenteMensualCents,
  precioFundadorAnualCents,
  programaFundadorVigente,
  mxnDesdeCents,
  type PlanId,
} from "@/lib/payments/plans";
import { CAPABILITIES } from "@/lib/capabilities/registry";

export const Route = createFileRoute("/precios")({
  head: () => ({
    meta: [
      { title: "Precios y planes — ContaClick IA" },
      { name: "description", content: "Todas las herramientas incluidas en todos los planes. Elige según los RFC que administras: 5, 25, 100 o a medida. Desde $499 MXN al mes." },
      { property: "og:title", content: "Precios ContaClick IA — Elige por RFC, no por herramientas" },
      { property: "og:description", content: "Mismas herramientas en todos los planes. Prueba 14 días gratis, sin tarjeta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PreciosPage,
});

type Billing = "mensual" | "anual";

const ICONOS: Record<PlanId, typeof Rocket> = {
  starter: Rocket,
  pro: Sparkles,
  despacho: Building2,
  enterprise: Users,
};

const TAGLINES: Record<PlanId, string> = {
  starter: "Contadores independientes con cartera pequeña",
  pro: "Despachos en crecimiento",
  despacho: "Despachos consolidados",
  enterprise: "Firmas multi-oficina y corporativos",
};

const DESTACADO: PlanId = "pro";

// Las herramientas se derivan del registro central de capacidades:
// no existe una lista de features paralela en esta página.
const MODULOS: { clave: string; titulo: string }[] = [
  { clave: "contable", titulo: "Contable y fiscal" },
  { clave: "agentes", titulo: "Agentes IA" },
  { clave: "administrativo", titulo: "Administrativo y RH" },
  { clave: "legal", titulo: "Inteligencia legal" },
];

const ETIQUETA_MADUREZ: Record<string, string> = {
  operativa_limitada: "alcance limitado",
  beta: "beta",
  demostracion: "demostración",
  proximamente: "en desarrollo",
};

function PreciosPage() {
  const [billing, setBilling] = useState<Billing>("anual");
  const fundadorVigente = programaFundadorVigente();

  // Solo herramientas de los módulos que se listan abajo: el número del
  // encabezado y el del desglose por módulo deben coincidir siempre.
  const modulosVisibles = MODULOS.map((m) => m.clave);
  const herramientas = CAPABILITIES.filter(
    (c) =>
      c.visibleEnMenu &&
      c.madurez !== "obsoleta" &&
      c.permiso !== "super_admin" &&
      modulosVisibles.includes(c.modulo),
  );

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
            Todas las herramientas están <span className="gradient-text">incluidas en todos los planes</span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
            Elige según la cantidad de RFC que administras. Ningún módulo, agente ni reporte se
            desbloquea pagando más: lo que cambia es la capacidad contratada.
          </p>

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
          <p className="mt-4 text-xs text-muted-foreground">
            Precios en MXN, <b>más IVA (16%)</b>. El IVA se muestra desglosado al contratar.
          </p>
        </div>
      </section>

      {/* Planes */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-6 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {PLANES_ORDEN.map((id) => {
            const p = PLANS[id];
            const Icon = ICONOS[id];
            const highlight = id === DESTACADO;
            const cents = billing === "mensual" ? p.mensualCents : p.anualCents;
            const monthlyEq = p.anualCents ? equivalenteMensualCents(p.anualCents) : null;
            const fundador = precioFundadorAnualCents(p);
            const ahorro = ahorroAnualCents(p);
            const capacidad = p.capacidadOperativa;
            const ilim = (n: number) => (n < 0 ? "Personalizado" : n.toLocaleString("es-MX"));

            return (
              <div
                key={id}
                className={`relative rounded-2xl border p-6 flex flex-col ${
                  highlight
                    ? "border-primary/60 bg-gradient-to-b from-primary/10 to-transparent"
                    : "border-border/60 glass"
                }`}
                style={highlight ? { boxShadow: "var(--shadow-elevated)" } : undefined}
              >
                {highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium bg-primary text-primary-foreground">
                    Más elegido
                  </span>
                )}
                <div className="flex items-center gap-2 text-primary">
                  <Icon className="h-5 w-5" />
                  <h3 className="text-lg font-semibold text-foreground">{p.name}</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground min-h-[40px]">{TAGLINES[id]}</p>

                <div className="mt-4 rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">RFC activos incluidos</div>
                  <div className="text-2xl font-semibold">
                    {p.maxRfcs < 0 ? "A medida" : `Hasta ${p.maxRfcs}`}
                  </div>
                </div>

                <div className="mt-5">
                  {cents === null ? (
                    <div className="text-3xl font-semibold">A medida</div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-semibold tracking-tight">{mxnDesdeCents(cents)}</span>
                        <span className="text-sm text-muted-foreground">MXN / {billing === "mensual" ? "mes" : "año"} + IVA</span>
                      </div>
                      {billing === "anual" && monthlyEq && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Equivale a {mxnDesdeCents(monthlyEq)} / mes · ahorras {ahorro ? mxnDesdeCents(ahorro) : "—"} al año
                        </div>
                      )}
                      {billing === "anual" && fundadorVigente && fundador && (
                        <div className="mt-3 rounded-lg border border-gold/40 bg-amber-500/10 px-3 py-2 text-left">
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            <Crown className="h-3.5 w-3.5" /> Precio fundador (-{PROGRAMA_FUNDADOR.descuentoPct}%)
                          </div>
                          <div className="text-lg font-semibold">{mxnDesdeCents(fundador)} <span className="text-xs font-normal text-muted-foreground">/ año + IVA</span></div>
                          <div className="text-[11px] text-muted-foreground">
                            ≈ {mxnDesdeCents(equivalenteMensualCents(fundador))} / mes · sujeto a registro en el programa
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-5 space-y-1.5 text-xs text-muted-foreground border-y border-border/50 py-4">
                  <div className="font-medium text-foreground">Capacidad operativa incluida</div>
                  <div>IA: {ilim(capacidad.ia_msgs)} solicitudes / mes</div>
                  <div>SAT: {ilim(capacidad.sat_solicitudes_mes)} descargas / mes · sincronización {capacidad.sat_frecuencia_max}</div>
                  <div>Almacenamiento: {capacidad.almacenamiento_gb < 0 ? "Personalizado" : `${capacidad.almacenamiento_gb} GB`}</div>
                  <div>Usuarios del equipo: {ilim(capacidad.max_miembros)}</div>
                </div>

                <ul className="mt-5 space-y-2.5 text-sm flex-1">
                  <li className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success flex-none mt-0.5" />
                    <span><b>Las {herramientas.length} herramientas</b> del catálogo, sin excepción</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success flex-none mt-0.5" />
                    <span>Agentes IA, conciliación, reportería y defensa SAT</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success flex-none mt-0.5" />
                    <span>Al llegar al tope de RFC conservas todos tus expedientes; sólo se pausa el alta de uno nuevo</span>
                  </li>
                </ul>

                <div className="mt-6 space-y-2">
                  {id === "enterprise" ? (
                    <Button asChild variant="glass" className="w-full">
                      <Link to="/contacto">Hablar con ventas</Link>
                    </Button>
                  ) : (
                    <Button asChild variant={highlight ? "hero" : "glass"} className="w-full">
                      <Link to="/auth" search={{ next: `/app/checkout?plan=${id}&cycle=${billing}` }}>
                        Contratar {p.name}
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Comparativa por capacidad */}
      <section className="py-12 border-t border-border/50">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-center">
            La única diferencia entre planes
          </h2>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Mismas herramientas. Distinta capacidad contratada.
          </p>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Concepto</th>
                  {PLANES_ORDEN.map((id) => (
                    <th key={id} className="text-left px-4 py-3">{PLANS[id].name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-3 font-medium">RFC activos</td>
                  {PLANES_ORDEN.map((id) => (
                    <td key={id} className="px-4 py-3">{PLANS[id].maxRfcs < 0 ? "Personalizado" : PLANS[id].maxRfcs}</td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Herramientas incluidas</td>
                  {PLANES_ORDEN.map((id) => (
                    <td key={id} className="px-4 py-3">Todas ({herramientas.length})</td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Precio mensual</td>
                  {PLANES_ORDEN.map((id) => (
                    <td key={id} className="px-4 py-3">
                      {PLANS[id].mensualCents === null ? "A medida" : `${mxnDesdeCents(PLANS[id].mensualCents!)} + IVA`}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Precio anual</td>
                  {PLANES_ORDEN.map((id) => (
                    <td key={id} className="px-4 py-3">
                      {PLANS[id].anualCents === null ? "A medida" : `${mxnDesdeCents(PLANS[id].anualCents!)} + IVA`}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Precio fundador anual (-{PROGRAMA_FUNDADOR.descuentoPct}%)</td>
                  {PLANES_ORDEN.map((id) => {
                    const f = precioFundadorAnualCents(PLANS[id]);
                    return (
                      <td key={id} className="px-4 py-3">
                        {f === null ? "A cotizar" : `${mxnDesdeCents(f)} + IVA`}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Equivalente mensual (anual)</td>
                  {PLANES_ORDEN.map((id) => {
                    const a = PLANS[id].anualCents;
                    return (
                      <td key={id} className="px-4 py-3">
                        {a === null ? "—" : `${mxnDesdeCents(equivalenteMensualCents(a))} / mes`}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Programa fundador */}
      {fundadorVigente && (
        <section className="py-12 border-t border-border/50">
          <div className="mx-auto max-w-4xl px-6 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-6">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <Crown className="h-5 w-5" />
              <h2 className="text-xl font-semibold">Programa Fundador</h2>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{PROGRAMA_FUNDADOR.condiciones}</p>
            <ul className="mt-4 grid sm:grid-cols-3 gap-3 text-sm">
              {(["starter", "pro", "despacho"] as PlanId[]).map((id) => {
                const f = precioFundadorAnualCents(PLANS[id])!;
                return (
                  <li key={id} className="rounded-xl border border-border/60 bg-background/50 p-4">
                    <div className="text-xs text-muted-foreground">{PLANS[id].name} fundador</div>
                    <div className="text-lg font-semibold">{mxnDesdeCents(f)} <span className="text-xs font-normal text-muted-foreground">/ año + IVA</span></div>
                    <div className="text-[11px] text-muted-foreground">
                      lista {mxnDesdeCents(PLANS[id].anualCents!)} · ahorro {mxnDesdeCents(PLANS[id].anualCents! - f)}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Vigencia de alta: {PROGRAMA_FUNDADOR.vigenciaDesde} al {PROGRAMA_FUNDADOR.vigenciaHasta}.
              El beneficio no es vitalicio: cubre las anualidades registradas en tu cuenta.
            </p>
          </div>
        </section>
      )}

      {/* Catálogo completo incluido */}
      <section className="py-16 border-t border-border/50">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-center">
            Lo que incluyen todos los planes
          </h2>
          <p className="mt-3 text-center text-sm text-muted-foreground max-w-2xl mx-auto">
            El estado de cada herramienta es el mismo para cualquier plan. Señalamos con honestidad
            lo que está en beta, con alcance limitado o en desarrollo.
          </p>
          <div className="mt-10 grid md:grid-cols-2 gap-6">
            {MODULOS.map((m) => {
              const items = herramientas.filter((h) => h.modulo === m.clave);
              if (!items.length) return null;
              return (
                <div key={m.clave} className="rounded-2xl border border-border/60 glass p-5">
                  <h3 className="font-medium">{m.titulo} <span className="text-xs text-muted-foreground">({items.length})</span></h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {items.map((h) => (
                      <li key={h.id} className="flex gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success flex-none mt-0.5" />
                        <span>
                          {h.nombre}
                          {ETIQUETA_MADUREZ[h.madurez] && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">
                              {ETIQUETA_MADUREZ[h.madurez]}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 border-t border-border/50">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-center">Preguntas frecuentes</h2>
          <div className="mt-10 space-y-4">
            {[
              { q: "¿Hay herramientas exclusivas de algún plan?", a: "No. Todos los planes incluyen exactamente el mismo catálogo de herramientas, agentes y reportes. Lo único que cambia es cuántos RFC activos puedes administrar y la capacidad operativa proporcional (IA, descargas SAT y almacenamiento), que cubre costo variable real." },
              { q: "¿Qué pasa si llego al límite de RFC?", a: "Conservas acceso completo a todos tus expedientes existentes. Sólo se bloquea dar de alta uno adicional, y verás tu uso actual, el límite y las opciones para ampliarlo. Nunca borramos ni desactivamos expedientes automáticamente." },
              { q: "¿Cómo funciona la prueba de 14 días?", a: "Crea tu cuenta y obtén acceso completo con capacidad equivalente al plan Profesional durante 14 días, sin tarjeta de crédito." },
              { q: "¿Los precios llevan IVA?", a: "Los precios publicados son en MXN sin IVA. Al contratar se desglosa el IVA del 16% y puedes solicitar CFDI 4.0." },
              { q: "¿Quién puede acceder al precio fundador?", a: "Las cuentas registradas en el Programa Fundador por el equipo de ContaClick, contratando anualidad dentro de la vigencia del programa. El descuento se valida en el servidor: no puede activarse desde la URL ni el navegador." },
              { q: "¿Mis datos están seguros?", a: "Sí. Infraestructura cifrada, respaldos diarios y aislamiento por despacho. Cumplimos con la LFPDPPP." },
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
          <div className="flex gap-5 items-center flex-wrap justify-center">
            <Link to="/privacidad" className="hover:text-foreground">Privacidad</Link>
            <Link to="/terminos" className="hover:text-foreground">Términos</Link>
            <Link to="/contacto" className="hover:text-foreground">Contacto</Link>
            <PWAInstallLink />
          </div>
        </div>
      </footer>
    </div>
  );
}
