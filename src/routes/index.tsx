import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileText, Banknote, Bot, Shield, BarChart3, Zap, Users, FileCheck,
  ArrowRight, CheckCircle2, Sparkles, Brain, Lock,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

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
      { property: "og:description", content: "ERP contable + Auditor fiscal IA + Conciliador bancario en una sola plataforma." },
    ],
  }),
  component: Landing,
});

const modules = [
  { icon: FileText, title: "Analizador CFDI", desc: "Sube XML, ZIPs o carpetas. La IA detecta duplicados, cancelados, riesgos y proveedores sospechosos.", color: "from-blue-500/20 to-blue-500/5" },
  { icon: Banknote, title: "Conciliador Bancario IA", desc: "Cruza estados de cuenta con CFDI emitidos y recibidos. Detecta depósitos no identificados al instante.", color: "from-emerald-500/20 to-emerald-500/5" },
  { icon: Shield, title: "Auditor Fiscal IA", desc: "Semáforo fiscal por cliente: ISR, IVA, RESICO, retenciones, deducciones y riesgos SAT.", color: "from-amber-500/20 to-amber-500/5" },
  { icon: Bot, title: "Asistente IA Contable", desc: "Un fiscalista mexicano experto disponible 24/7. Redacta correos, WhatsApps y reportes para clientes.", color: "from-violet-500/20 to-violet-500/5" },
  { icon: Users, title: "CRM para Despachos", desc: "Gestiona clientes, RFC, regímenes, obligaciones y archivos en una vista limpia y moderna.", color: "from-pink-500/20 to-pink-500/5" },
  { icon: BarChart3, title: "Reportería Inteligente", desc: "Estado de resultados, flujo de efectivo, IVA, ISR y dashboards ejecutivos en PDF/Excel.", color: "from-cyan-500/20 to-cyan-500/5" },
];

const stats = [
  { value: "10×", label: "más rápido" },
  { value: "99.4%", label: "precisión XML" },
  { value: "+2,300", label: "CFDI por minuto" },
  { value: "24/7", label: "asistente IA" },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-60" aria-hidden />
        <div
          className="absolute inset-0 -z-10"
          style={{ background: "var(--gradient-hero)" }}
          aria-hidden
        />
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-28 lg:pt-28 lg:pb-36 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-muted-foreground mb-6">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              IA fiscal entrenada para el SAT mexicano
            </div>
            <h1 className="text-5xl md:text-7xl font-semibold leading-[0.95] tracking-tight">
              La IA que tu <span className="gradient-text">despacho contable</span> estaba esperando.
            </h1>
            <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
              Analiza CFDI, concilia bancos, detecta riesgos fiscales y automatiza tu despacho.
              Todo en una plataforma moderna, modular y diseñada para contadores en México.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" variant="hero">
                <Link to="/app">Probar gratis <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button size="lg" variant="glass">Ver demo en vivo</Button>
            </div>
            <div className="mt-10 flex items-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" /> Sin tarjeta</div>
              <div className="flex items-center gap-1.5"><Lock className="h-4 w-4 text-success" /> Datos cifrados</div>
              <div className="flex items-center gap-1.5"><Brain className="h-4 w-4 text-success" /> IA fiscal MX</div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="glass rounded-xl p-5">
                <div className="text-3xl md:text-4xl font-semibold gradient-text">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
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

          <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((m) => (
              <div
                key={m.title}
                className="group relative rounded-2xl p-6 border border-border/50 bg-card/40 hover:bg-card/80 transition-all duration-300 hover:-translate-y-1"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${m.color} opacity-0 group-hover:opacity-100 transition-opacity`} aria-hidden />
                <div className="relative">
                  <div className="h-11 w-11 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20 mb-4">
                    <m.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">{m.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{m.desc}</p>
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
              Pregunta sobre RESICO, deducciones, DIOT, contabilidad electrónica, IMSS o CFDI 4.0.
              El asistente analiza tus documentos reales, explica diferencias y redacta mensajes
              profesionales para tus clientes.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Cero alucinaciones — citas a la legislación vigente",
                "Analiza tus XML, bancos y declaraciones",
                "Genera correos, WhatsApps y reportes ejecutivos",
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

      <footer className="border-t border-border/50 py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <Logo size="sm" />
          <div>© 2026 ContaClick IA · Hecho en México 🇲🇽</div>
          <div className="flex gap-5">
            <a href="#" className="hover:text-foreground">Privacidad</a>
            <a href="#" className="hover:text-foreground">Términos</a>
            <a href="#" className="hover:text-foreground">Contacto</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
