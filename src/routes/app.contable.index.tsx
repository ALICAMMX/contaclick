import { createFileRoute, Link } from "@tanstack/react-router";
import { Calculator, FileText, FileStack, Coins, Banknote, FileBadge, FileSignature, ShieldCheck, ScanSearch, Bot, AlertTriangle, Users, Globe, Network, Mail, Bell, ShieldAlert } from "lucide-react";
import type { ComponentType } from "react";

export const Route = createFileRoute("/app/contable/")({ component: ContableCatalog });

type Status = "live" | "beta" | "soon";
type Tool = { name: string; desc: string; icon: ComponentType<{ className?: string }>; href?: string; status: Status; group: string };

const TOOLS: Tool[] = [
  // CFDI & Comprobantes
  { name: "Validador CFDI 4.0", desc: "Estructura, RFC, totales, UUID al instante.", icon: FileText, href: "/app/tools/cfdi-validator", status: "live", group: "CFDI & Comprobantes" },
  { name: "Lector masivo de XML", desc: "Procesa ZIPs del SAT y exporta tabla.", icon: FileStack, href: "/app/tools/xml-bulk-reader", status: "live", group: "CFDI & Comprobantes" },
  { name: "Verificador de UUID", desc: "Consulta webservice del SAT.", icon: ShieldCheck, href: "/app/tools/cfdi-verifier", status: "live", group: "CFDI & Comprobantes" },
  { name: "Auditor express", desc: "Folios, duplicados, notas de crédito huérfanas.", icon: ScanSearch, href: "/app/tools/express-auditor", status: "live", group: "CFDI & Comprobantes" },
  { name: "CFDI del expediente", desc: "Bandeja unificada del cliente activo.", icon: FileText, href: "/app/cfdi", status: "live", group: "CFDI & Comprobantes" },

  // Cálculo fiscal
  { name: "Calculadora ISR / IVA", desc: "Pago provisional mensual.", icon: Calculator, href: "/app/tools/isr-iva-calculator", status: "live", group: "Cálculo Fiscal" },
  { name: "Calculadora RESICO PF", desc: "ISR mensual personas físicas RESICO.", icon: Coins, href: "/app/tools/resico-calculator", status: "live", group: "Cálculo Fiscal" },
  { name: "Transfer Pricing", desc: "Análisis de partes relacionadas.", icon: Network, status: "soon", group: "Cálculo Fiscal" },

  // Defensa SAT
  { name: "Riesgo SAT 2026", desc: "Score sobre los 12 criterios del Plan Maestro.", icon: ShieldAlert, href: "/app/riesgo", status: "live", group: "Defensa SAT" },
  { name: "Conciliador bancario", desc: "Cruza estado de cuenta vs CFDI.", icon: Banknote, href: "/app/tools/bank-reconciler", status: "live", group: "Defensa SAT" },
  { name: "Conciliación del expediente", desc: "Histórico mensual conciliado.", icon: Banknote, href: "/app/conciliacion", status: "live", group: "Defensa SAT" },
  { name: "Validador de Deducibilidad", desc: "Detecta deducciones improcedentes con IA.", icon: ShieldCheck, status: "soon", group: "Defensa SAT" },
  { name: "Validador 69-B / EFOS", desc: "Sincronización diaria de la lista negra.", icon: AlertTriangle, status: "soon", group: "Defensa SAT" },
  { name: "Validador de Precios de Importación", desc: "Comparables de mercado y memo justificativo.", icon: Globe, status: "soon", group: "Defensa SAT" },
  { name: "Detector de Nómina Oculta", desc: "Identifica pagos recurrentes a PF.", icon: Users, status: "soon", group: "Defensa SAT" },

  // Documentos
  { name: "Lector de Constancia Fiscal", desc: "Régimen, obligaciones y domicilio.", icon: FileBadge, href: "/app/tools/csf-parser", status: "live", group: "Documentos" },
  { name: "Generador de oficios SAT", desc: "Plantillas listas personalizadas.", icon: FileSignature, href: "/app/tools/oficio-generator", status: "live", group: "Documentos" },
  { name: "Reportes del expediente", desc: "Exporta papeles de trabajo PDF/Excel.", icon: FileText, href: "/app/reportes", status: "live", group: "Documentos" },

  // IA
  { name: "Asistente fiscal IA", desc: "Consulta legislación con contexto del cliente.", icon: Bot, href: "/app/tools/fiscal-assistant", status: "live", group: "IA & Agentes" },
  { name: "Mis Agentes IA", desc: "8 agentes que vigilan tu expediente 24/7.", icon: Bot, href: "/app/contable/agentes", status: "live", group: "IA & Agentes" },
  { name: "Buzón Tributario", desc: "Lector inteligente de notificaciones SAT.", icon: Mail, href: "/app/mensajes", status: "live", group: "IA & Agentes" },
];

const GROUPS = ["CFDI & Comprobantes", "Cálculo Fiscal", "Defensa SAT", "Documentos", "IA & Agentes"];

function ContableCatalog() {
  const live = TOOLS.filter((t) => t.status === "live").length;
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary mb-2">
            <span className="h-1 w-6 bg-primary" /> Módulo 1
          </div>
          <h1 className="serif text-3xl text-foreground">Contable & Fiscal</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Catálogo de herramientas independientes. Entra, úsala, regresa. Sin formularios complicados ni configuración previa.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-medium">{live} en vivo</span>
          <span className="px-2.5 py-1 rounded-full border border-border bg-muted text-muted-foreground">{TOOLS.length - live} pronto</span>
        </div>
      </header>

      {GROUPS.map((g) => {
        const items = TOOLS.filter((t) => t.group === g);
        if (!items.length) return null;
        return (
          <section key={g} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</h2>
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] text-muted-foreground tabular-nums">{items.length}</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((t) => <ToolCard key={t.name} tool={t} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  const isLive = tool.status === "live";
  const badge =
    tool.status === "live" ? { text: "Abrir", cls: "text-emerald-600 dark:text-emerald-300" }
      : tool.status === "beta" ? { text: "Beta", cls: "text-primary" }
        : { text: "Pronto", cls: "text-muted-foreground" };
  const body = (
    <div className={`group h-full rounded-xl p-5 border bg-card transition-all flex flex-col ${
      tool.href ? "border-border hover:border-primary/40 hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5" : "border-border/60 opacity-75"
    }`}>
      <div className="flex items-start justify-between mb-4">
        <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        {!isLive && (
          <button
            onClick={(e) => { e.preventDefault(); }}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground"
            title="Avísame cuando esté disponible"
          >
            <Bell className="h-3 w-3" /> Avisar
          </button>
        )}
      </div>
      <div className="font-medium mb-1">{tool.name}</div>
      <p className="text-xs text-muted-foreground leading-relaxed flex-1">{tool.desc}</p>
      <div className={`text-xs font-medium mt-4 inline-flex items-center gap-1 ${badge.cls}`}>
        {badge.text} {isLive && <span className="transition-transform group-hover:translate-x-0.5">→</span>}
      </div>
    </div>
  );
  return tool.href ? <Link to={tool.href} className="block h-full">{body}</Link> : <div className="cursor-not-allowed h-full">{body}</div>;
}
