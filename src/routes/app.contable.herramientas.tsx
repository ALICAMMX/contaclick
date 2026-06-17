import { createFileRoute, Link } from "@tanstack/react-router";
import { ModuleScaffold } from "@/components/ModuleScaffold";
import { Calculator, FileText, FileStack, Coins, Banknote, FileBadge, FileSignature, ShieldCheck, ScanSearch, Bot, AlertTriangle, Users, Globe, Network, Mail } from "lucide-react";

export const Route = createFileRoute("/app/contable/herramientas")({ component: ContableHerramientas });

type Status = "live" | "beta" | "soon";
type Tool = { name: string; desc: string; icon: any; href?: string; status: Status; group: string };

const TOOLS: Tool[] = [
  { name: "Validador CFDI 4.0", desc: "Estructura, RFC, totales, UUID al instante.", icon: FileText, href: "/app/tools/cfdi-validator", status: "live", group: "CFDI & Comprobantes" },
  { name: "Lector masivo de XML", desc: "Procesa ZIPs del SAT y exporta tabla.", icon: FileStack, href: "/app/tools/xml-bulk-reader", status: "live", group: "CFDI & Comprobantes" },
  { name: "Verificador de UUID", desc: "Consulta webservice del SAT.", icon: ShieldCheck, href: "/app/tools/cfdi-verifier", status: "live", group: "CFDI & Comprobantes" },
  { name: "Auditor express", desc: "Folios, duplicados, notas de crédito huérfanas.", icon: ScanSearch, href: "/app/tools/express-auditor", status: "live", group: "CFDI & Comprobantes" },
  { name: "Calculadora ISR / IVA", desc: "Pago provisional mensual.", icon: Calculator, href: "/app/tools/isr-iva-calculator", status: "live", group: "Cálculo Fiscal" },
  { name: "Calculadora RESICO PF", desc: "ISR mensual personas físicas RESICO.", icon: Coins, href: "/app/tools/resico-calculator", status: "live", group: "Cálculo Fiscal" },
  { name: "Calculadora de Precios de Transferencia", desc: "Análisis de partes relacionadas.", icon: Network, status: "soon", group: "Cálculo Fiscal" },
  { name: "Conciliador bancario", desc: "Cruza estado de cuenta vs CFDI.", icon: Banknote, href: "/app/tools/bank-reconciler", status: "live", group: "Defensa SAT" },
  { name: "Lector de Constancia Fiscal", desc: "Régimen, obligaciones y domicilio.", icon: FileBadge, href: "/app/tools/csf-parser", status: "live", group: "Documentos" },
  { name: "Generador de oficios SAT", desc: "Plantillas listas personalizadas.", icon: FileSignature, href: "/app/tools/oficio-generator", status: "live", group: "Documentos" },
  { name: "Asistente fiscal IA", desc: "Consulta legislación con contexto del cliente.", icon: Bot, href: "/app/tools/fiscal-assistant", status: "live", group: "IA" },
  // SOON — Defensa SAT proactiva (Plan Maestro 2026)
  { name: "Validador de Deducibilidad", desc: "Detecta deducciones improcedentes con IA.", icon: ShieldCheck, status: "soon", group: "Defensa SAT" },
  { name: "Analizador de Riesgo SAT", desc: "Cruce con los 12 criterios oficiales 2026.", icon: AlertTriangle, status: "beta", group: "Defensa SAT" },
  { name: "Validador de Precios de Importación", desc: "Comparables de mercado y memo justificativo.", icon: Globe, status: "soon", group: "Defensa SAT" },
  { name: "Detector de Nómina Oculta", desc: "Identifica pagos recurrentes a PF.", icon: Users, status: "soon", group: "Defensa SAT" },
  { name: "Validador 69-B / EFOS", desc: "Sincronización diaria de la lista negra.", icon: ShieldCheck, status: "soon", group: "Defensa SAT" },
  { name: "Lector de Buzón Tributario", desc: "Interpreta requerimientos y propone acciones.", icon: Mail, status: "soon", group: "Defensa SAT" },
];

const GROUPS = ["CFDI & Comprobantes", "Cálculo Fiscal", "Defensa SAT", "Documentos", "IA"];

function ContableHerramientas() {
  return (
    <ModuleScaffold
      title="Herramientas Contables & Fiscales"
      subtitle="22 herramientas especializadas. Cada una trabaja de forma independiente sobre el expediente activo — como en AbogaClick."
      icon={<Calculator className="h-5 w-5" />}
      badge={null}
    >
      {GROUPS.map((g) => {
        const items = TOOLS.filter((t) => t.group === g);
        if (!items.length) return null;
        return (
          <section key={g} className="space-y-3 mt-6 first:mt-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</h2>
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[10px] text-muted-foreground">{items.length}</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((t) => <ToolCard key={t.name} tool={t} />)}
            </div>
          </section>
        );
      })}
    </ModuleScaffold>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  const badge =
    tool.status === "live" ? { text: "En vivo", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" }
      : tool.status === "beta" ? { text: "Beta", cls: "bg-primary/15 text-primary border-primary/30" }
        : { text: "Pronto", cls: "bg-[oklch(0.78_0.13_85)]/15 text-[oklch(0.85_0.13_85)] border-[oklch(0.78_0.13_85)]/30" };
  const body = (
    <div className={`group h-full rounded-xl p-5 border bg-card/50 transition-all ${
      tool.href ? "border-border/60 hover:border-primary/40 hover:bg-card hover:-translate-y-0.5" : "border-border/40 opacity-80"
    }`}>
      <div className="flex items-start justify-between mb-4">
        <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/15 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.text}</span>
      </div>
      <div className="font-medium mb-1">{tool.name}</div>
      <p className="text-xs text-muted-foreground leading-relaxed">{tool.desc}</p>
    </div>
  );
  return tool.href ? <Link to={tool.href}>{body}</Link> : <div className="cursor-not-allowed">{body}</div>;
}
