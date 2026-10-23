import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  FileText, Banknote, Bot, Shield, BarChart3, Zap, Users, FileCheck,
  ArrowRight, CheckCircle2, Sparkles, Brain, Lock, ChevronLeft, ChevronRight,
  Calculator, Download, GitCompare, BookOpen, CalendarDays, KanbanSquare,
  HeartPulse, Building2, AlertTriangle, Search,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { PWAInstallLink } from "@/components/PWAInstall";
import heroImg1 from "@/assets/hero-bg-1.jpg";
import heroImg2 from "@/assets/hero-bg-2.jpg";
import heroImg3 from "@/assets/hero-bg-3.jpg";

const heroSlides = [
  {
    src: heroImg1,
    alt: "Oficina ejecutiva moderna con vista panorámica",
    chip: "IA fiscal entrenada para el SAT mexicano",
    title: "La IA que tu",
    emphasis: "despacho contable",
    titleTail: "estaba esperando.",
    copy: "Analiza CFDI, concilia bancos, detecta riesgos fiscales y automatiza tu despacho. Todo en una plataforma moderna, modular y diseñada para contadores en México.",
    ctaPrimary: { label: "Probar gratis", to: "/app" },
    ctaSecondary: { label: "Ver demo en vivo", to: "/app/tools/cfdi-validator" },
  },
  {
    src: heroImg2,
    alt: "Escritorio con laptop mostrando dashboards financieros",
    chip: "Descarga masiva SAT + Contabilidad automática",
    title: "Olvida bajar XML",
    emphasis: "uno por uno.",
    titleTail: "Nosotros lo hacemos por ti.",
    copy: "Conectamos con el SAT, descargamos los CFDI emitidos y recibidos de tus clientes, los clasificamos y generamos pólizas listas para CONTPAQi y Anexo 24.",
    ctaPrimary: { label: "Ver descarga SAT", to: "/app/sat-sync" },
    ctaSecondary: { label: "Pólizas desde CFDI", to: "/app/polizas" },
  },
  {
    src: heroImg3,
    alt: "Sala de juntas corporativa al atardecer",
    chip: "Conti · tu asistente fiscal 24/7",
    title: "Un Contador Senior IA",
    emphasis: "a un clic",
    titleTail: "de cada decisión.",
    copy: "Conti te guía en la plataforma, resuelve dudas fiscales y calcula ISR, IVA y RESICO con motores de cálculo verificados, no con estimaciones de la IA. Cuando le falta un dato, te lo dice.",
    ctaPrimary: { label: "Hablar con Conti", to: "/app" },
    ctaSecondary: { label: "Ver salud fiscal", to: "/app/salud-fiscal" },
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ContaClick IA — Plataforma de IA para contadores en México" },
      {
        name: "description",
        content:
          "Analiza CFDI, concilia bancos y detecta riesgos fiscales con inteligencia artificial. La plataforma SaaS moderna para despachos contables en México.",
      },
      { property: "og:title", content: "ContaClick IA — IA para contadores en México" },
      { property: "og:description", content: "Descarga del SAT, conciliación bancaria, pólizas y cierre mensual para despachos. Complementa a CONTPAQi y Aspel." },
    ],
  }),
  component: Landing,
});

const modules = [
  { icon: FileText, title: "Analizador CFDI", desc: "Sube XML, ZIPs o carpetas. La IA detecta duplicados, cancelados, riesgos y proveedores sospechosos.", color: "from-blue-500/20 to-blue-500/5" },
  { icon: Banknote, title: "Conciliador Bancario IA", desc: "Cruza estados de cuenta con CFDI emitidos y recibidos. Detecta depósitos no identificados al instante.", color: "from-emerald-500/20 to-emerald-500/5" },
  { icon: Shield, title: "Auditor Fiscal IA", desc: "Semáforo fiscal por cliente: ISR, IVA, RESICO, retenciones, deducciones y riesgos SAT.", color: "from-amber-500/20 to-amber-500/5" },
  { icon: Bot, title: "Asistente IA Contable", desc: "Conti, disponible 24/7: te dice qué herramienta usar, resuelve dudas fiscales y calcula con motores verificados.", color: "from-violet-500/20 to-violet-500/5" },
  { icon: BarChart3, title: "Reportería Inteligente", desc: "Papeles de trabajo del mes y resumen para tu cliente, listos para entregar.", color: "from-cyan-500/20 to-cyan-500/5" },
  { icon: Calculator, title: "Calculadora Fiscal", desc: "ISR, IVA, RESICO, retenciones y estimaciones en tiempo real. Simula escenarios fiscales al instante.", color: "from-rose-500/20 to-rose-500/5" },
  { icon: FileCheck, title: "Lector de Constancia Fiscal", desc: "Sube la constancia de situación fiscal y el expediente del cliente se llena solo: RFC, régimen, domicilio y obligaciones.", color: "from-lime-500/20 to-lime-500/5" },
  { icon: Download, title: "Descarga Masiva SAT", desc: "Descarga automatizada de CFDI emitidos, recibidos y metadatos directo del SAT con credenciales cifradas.", color: "from-sky-500/20 to-sky-500/5" },
  { icon: GitCompare, title: "Conciliación Integral", desc: "Cruza CFDI, banco y pólizas del periodo y te señala diferencias. Si faltan datos, te lo dice en lugar de inventar alarmas.", color: "from-teal-500/20 to-teal-500/5" },
  { icon: BookOpen, title: "Contabilidad Automática", desc: "Mapea CFDI al catálogo de cuentas y exporta en formato CONTPAQi y Anexo 24 listo para autoridad.", color: "from-indigo-500/20 to-indigo-500/5" },
  { icon: CalendarDays, title: "Calendario Fiscal", desc: "Obligaciones por RFC y régimen: ISR, IVA, DIOT, DyP. Nunca pierdas un vencimiento.", color: "from-fuchsia-500/20 to-fuchsia-500/5" },
  { icon: KanbanSquare, title: "Centro de Tareas", desc: "Kanban del despacho: asigna pendientes por cliente, prioridad y vencimiento con seguimiento en tiempo real.", color: "from-pink-500/20 to-pink-500/5" },
  { icon: HeartPulse, title: "Dashboard de Salud Fiscal", desc: "Score por cliente con análisis IA: cumplimiento, riesgos, oportunidades de optimización fiscal.", color: "from-red-500/20 to-red-500/5" },
  { icon: AlertTriangle, title: "Validador EFOS / 69-B", desc: "Detecta proveedores en listas negras del SAT antes de deducir. Protege a tus clientes de cancelaciones.", color: "from-amber-500/20 to-amber-500/5" },
  { icon: Search, title: "Auditor Express", desc: "Diagnóstico instantáneo del expediente: hallazgos, semáforo y plan de acción priorizado.", color: "from-green-500/20 to-green-500/5" },
];

const stats = [
  { value: "Rápido", label: "análisis en segundos" },
  { value: "Preciso", label: "detección de duplicados y cancelados" },
  { value: "Masivo", label: "miles de CFDI por carga" },
  { value: "24/7", label: "asistente IA contable" },
];

function Landing() {
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % heroSlides.length), 5000);
    return () => clearInterval(id);
  }, []);
  const prev = () => setSlide((s) => (s - 1 + heroSlides.length) % heroSlides.length);
  const next = () => setSlide((s) => (s + 1) % heroSlides.length);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden min-h-[88vh] flex items-center">
        {/* Background slider */}
        <div className="absolute inset-0 -z-10" aria-hidden>
          {heroSlides.map((s, i) => (
            <img
              key={s.src}
              src={s.src}
              alt=""
              aria-hidden
              width={1920}
              height={1080}
              loading={i === 0 ? "eager" : "lazy"}
              className={`absolute inset-0 w-full h-full object-cover transition-all ease-in-out ${i === slide ? "opacity-100 scale-105" : "opacity-0 scale-100"}`}
              style={{ transitionDuration: "1500ms" }}
            />
          ))}
          {/* Mid-tone overlays for balanced legibility + image visibility */}
          <div className="absolute inset-0 bg-black/25" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
          <div className="absolute inset-0 grid-bg opacity-15" />
        </div>

        <div className="mx-auto max-w-7xl px-6 pt-20 pb-28 lg:pt-28 lg:pb-36 relative w-full">
          <div className="max-w-3xl" key={slide}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass hero-chip text-xs mb-6 animate-fade-in">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              {heroSlides[slide].chip}
            </div>
            <h1 className="hero-heading text-5xl md:text-7xl font-semibold leading-[0.95] tracking-tight animate-fade-in">
              {heroSlides[slide].title}{" "}
              <span className="hero-emphasis">{heroSlides[slide].emphasis}</span>{" "}
              {heroSlides[slide].titleTail}
            </h1>
            <p className="hero-copy mt-6 text-lg md:text-xl max-w-2xl leading-relaxed animate-fade-in">
              {heroSlides[slide].copy}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3 animate-fade-in">
              <Button asChild size="lg" variant="hero">
                <Link to={heroSlides[slide].ctaPrimary.to}>
                  {heroSlides[slide].ctaPrimary.label} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="glass">
                <Link to={heroSlides[slide].ctaSecondary.to}>
                  {heroSlides[slide].ctaSecondary.label}
                </Link>
              </Button>
            </div>
            <div className="hero-subcopy mt-10 flex items-center gap-6 text-xs">
              <div className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" /> Sin tarjeta</div>
              <div className="flex items-center gap-1.5"><Lock className="h-4 w-4 text-success" /> Datos cifrados</div>
              <div className="flex items-center gap-1.5"><Brain className="h-4 w-4 text-success" /> IA fiscal MX</div>
            </div>
          </div>


          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="glass hero-stat rounded-xl p-5">
                <div className="hero-stat-value text-3xl md:text-4xl font-semibold">{s.value}</div>
                <div className="hero-subcopy text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Slider controls */}
          <div className="mt-10 flex items-center gap-4">
            <div className="flex gap-1.5">
              {heroSlides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSlide(i)}
                  aria-label={`Imagen ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === slide ? "w-10 bg-primary" : "w-5 bg-foreground/20 hover:bg-foreground/40"}`}
                />
              ))}
            </div>
            <div className="flex gap-2 ml-auto">
              <button onClick={prev} aria-label="Anterior" className="glass rounded-full p-2 hover:bg-background/80 transition">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={next} aria-label="Siguiente" className="glass rounded-full p-2 hover:bg-background/80 transition">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="py-24 border-t border-border/50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl">
            <div className="text-xs uppercase tracking-widest text-primary font-medium mb-3">Módulos</div>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
              Todo lo que un despacho moderno necesita.
            </h2>
            <p className="mt-4 text-muted-foreground">
              ContaClick IA reemplaza 5 herramientas distintas. Sin SQL, sin Excel infinito, sin sorpresas del SAT.
            </p>
          </div>

          <div className="mt-14 space-y-4">
            {[
              { items: modules.slice(0, Math.ceil(modules.length / 2)), reverse: false },
              { items: modules.slice(Math.ceil(modules.length / 2)), reverse: true },
            ].map((row, idx) => (
              <div key={idx} className="marquee-mask overflow-hidden">
                <div className={`marquee-track ${row.reverse ? "reverse" : ""}`}>
                  {[...row.items, ...row.items].map((m, i) => (
                    <div
                      key={`${m.title}-${i}`}
                      className="group relative rounded-2xl p-6 border border-border/50 bg-card/40 hover:bg-card/80 transition-all duration-300 w-[320px] shrink-0"
                      style={{ boxShadow: "var(--shadow-card)" }}
                    >
                      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${m.color} opacity-0 group-hover:opacity-100 transition-opacity`} aria-hidden />
                      <div className="relative">
                        <div className="h-11 w-11 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20 mb-4">
                          <m.icon className="h-5 w-5 text-primary" />
                        </div>
                        <h3 className="text-lg font-semibold">{m.title}</h3>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed line-clamp-3">{m.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature highlight */}
      <section id="features" className="py-24 border-t border-border/50">
        <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="text-xs uppercase tracking-widest text-accent font-medium mb-3">Asistente IA</div>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
              Un fiscalista experto en cada conversación.
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Pregunta sobre RESICO, deducciones, DIOT, contabilidad electrónica o CFDI 4.0.
              Conti te orienta, te dice qué herramienta usar y calcula impuestos con los motores
              de la plataforma, no de memoria.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Las cifras salen de motores de cálculo verificados, no de la IA",
                "Si le falta un dato, lo dice en lugar de suponerlo",
                "Nunca mezcla la información de un cliente con la de otro",
                "Multi-RFC, multi-cliente, multi-despacho",
              ].map((f) => (
                <li key={f} className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success flex-none mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl opacity-40 blur-2xl" style={{ background: "var(--gradient-primary)" }} aria-hidden />
            <div className="relative glass rounded-2xl p-5 border border-border/60" style={{ boxShadow: "var(--shadow-elevated)" }}>
              <div className="flex items-center gap-2 pb-3 border-b border-border/50">
                <div className="h-2 w-2 rounded-full bg-destructive/80" />
                <div className="h-2 w-2 rounded-full bg-warning/80" />
                <div className="h-2 w-2 rounded-full bg-success/80" />
                <span className="ml-2 text-xs text-muted-foreground">asistente.contaclick.ia</span>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-end">
                  <div className="bg-primary/15 border border-primary/30 rounded-lg px-3 py-2 max-w-[80%]">
                    ¿Cuánto IVA acreditable tiene Servicios García SA en octubre?
                  </div>
                </div>
                <div className="flex">
                  <div className="bg-card border border-border rounded-lg px-3 py-2 max-w-[85%]">
                    <div className="flex items-center gap-1.5 text-xs text-primary mb-1">
                      <Sparkles className="h-3 w-3" /> ContaClick IA
                    </div>
                    Analicé 142 CFDI recibidos. <b>IVA acreditable: $48,320.50 MXN</b>.
                    Detecté 2 facturas de un proveedor con estatus <span className="text-warning">EFOS presunto</span>.
                    ¿Quieres que prepare el aviso al cliente?
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button className="text-xs px-3 py-1.5 rounded-md glass hover:bg-accent/10">Sí, preparar aviso</button>
                  <button className="text-xs px-3 py-1.5 rounded-md glass hover:bg-accent/10">Ver detalle</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="pricing" className="py-24 border-t border-border/50">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <Zap className="h-10 w-10 text-primary mx-auto mb-4" />
          <h2 className="text-4xl md:text-6xl font-semibold tracking-tight">
            Lleva tu despacho al <span className="gradient-text">siguiente nivel.</span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Empieza gratis. Sin tarjeta. Migra tus clientes en minutos.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg" variant="hero">
              <Link to="/app">Entrar al dashboard <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="glass">Hablar con ventas</Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 py-16">
        <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row justify-between items-center gap-8 text-base text-muted-foreground">
          <Logo size="xl" />
          <div>© 2026 ContaClick IA · Hecho en México 🇲🇽</div>
          <div className="flex gap-6 items-center flex-wrap justify-center">
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
