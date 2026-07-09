import { createFileRoute, Link } from "@tanstack/react-router";
import { FileSignature, Store, Gavel, Bell, MessagesSquare } from "lucide-react";

export const Route = createFileRoute("/app/legal/")({ component: LegalCatalog });

const TOOLS = [
  { t: "Consulta a la Ley (IA)", d: "Pregunta en lenguaje natural y recibe respuesta con cita del artículo exacto (CFF, LISR, LIVA, RMF).", icon: MessagesSquare, href: "/app/legal/consulta-ia", group: "Análisis" },
  { t: "Mapa de Lagunas Legales", d: "Detecta huecos normativos y conflictos entre LISR, LIVA y CFF.", icon: Gavel, href: "/app/legal/lagunas", group: "Análisis" },
  { t: "Redactor de Escritos", d: "Genera escritos de defensa con fundamento TFJA y SCJN.", icon: FileSignature, href: "/app/legal/redactor", group: "Redacción" },
  { t: "Marketplace Legal", d: "Conecta con despachos especializados que validan y firman estrategias.", icon: Store, href: "/app/legal/marketplace", group: "Red profesional" },
];

const GROUPS = ["Análisis", "Redacción", "Red profesional"];

function LegalCatalog() {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "var(--module-legal)" }}>
            <span className="h-1 w-6" style={{ background: "var(--module-legal)" }} /> Módulo Premium
          </div>
          <h1 className="serif text-3xl text-foreground">Inteligencia Legal</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Detecta oportunidades de devolución y defensa cruzando tu expediente con TFJA, SCJN y DOF.
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-full glass-gold text-xs font-medium">Suscripción Despacho Pro</span>
      </header>

      {GROUPS.map((g) => {
        const items = TOOLS.filter((t) => t.group === g);
        return (
          <section key={g} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</h2>
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] text-muted-foreground tabular-nums">{items.length}</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((s) => {
                const Icon = s.icon;
                return (
                  <Link
                    key={s.t}
                    to={s.href}
                    className="group rounded-xl border border-border bg-card p-5 hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5 transition-all flex flex-col"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="h-10 w-10 rounded-lg grid place-items-center" style={{ background: "color-mix(in oklab, var(--module-legal) 15%, transparent)", color: "var(--module-legal)" }}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-border text-muted-foreground">
                        <Bell className="h-3 w-3" /> Demo
                      </span>
                    </div>
                    <div className="font-medium mb-1">{s.t}</div>
                    <p className="text-xs text-muted-foreground flex-1">{s.d}</p>
                    <div className="text-xs font-medium mt-4 inline-flex items-center gap-1" style={{ color: "var(--module-legal)" }}>
                      Ver maqueta <span className="transition-transform group-hover:translate-x-0.5">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
