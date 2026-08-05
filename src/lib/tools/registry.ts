// Catálogo de "herramientas sueltas" (paleta de comandos, folleto, /app/tools).
// NO es una fuente de verdad: deriva del registro central de capacidades para
// que nombre, ruta y estado de madurez nunca se contradigan entre pantallas.

import {
  FileSearch, FileStack, Calculator, Coins, Banknote, FileBadge,
  FileSignature, ShieldCheck, ScanSearch, Bot, ShieldAlert, Users, Globe, Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getCapability, type Madurez } from "@/lib/capabilities/registry";

export type ToolCategory = "CFDI" | "Cálculo" | "Bancos" | "Documentos" | "IA" | "Defensa SAT";

export type ToolDef = {
  key: string;
  route: string;
  name: string;
  description: string;
  category: ToolCategory;
  icon: LucideIcon;
  madurez: Madurez;
  status: "available" | "soon";
};

/** key pública → { id en el registro, categoría de folleto, icono }. */
const MAPA: { key: string; capability: string; category: ToolCategory; icon: LucideIcon }[] = [
  { key: "cfdi-validator", capability: "cfdi-validator", category: "CFDI", icon: FileSearch },
  { key: "xml-bulk-reader", capability: "xml-bulk-reader", category: "CFDI", icon: FileStack },
  { key: "isr-iva-calculator", capability: "isr-iva-calculator", category: "Cálculo", icon: Calculator },
  { key: "isr-iva-pm", capability: "isr-iva-pm", category: "Cálculo", icon: Calculator },
  { key: "resico-calculator", capability: "resico-calculator", category: "Cálculo", icon: Coins },
  { key: "bank-reconciler", capability: "conciliacion", category: "Bancos", icon: Banknote },
  { key: "csf-parser", capability: "csf-parser", category: "Documentos", icon: FileBadge },
  { key: "import-clientes", capability: "import-clientes", category: "Documentos", icon: Upload },
  { key: "oficio-generator", capability: "oficio-generator", category: "Documentos", icon: FileSignature },
  { key: "cfdi-verifier", capability: "cfdi-verifier", category: "CFDI", icon: ShieldCheck },
  { key: "express-auditor", capability: "express-auditor", category: "CFDI", icon: ScanSearch },
  { key: "fiscal-assistant", capability: "fiscal-assistant", category: "IA", icon: Bot },
  { key: "deducibility-checker", capability: "deducibility-checker", category: "Defensa SAT", icon: ShieldAlert },
  { key: "shadow-payroll", capability: "shadow-payroll", category: "Defensa SAT", icon: Users },
  { key: "import-prices", capability: "import-prices", category: "Defensa SAT", icon: Globe },
];

export const TOOLS: ToolDef[] = MAPA.flatMap(({ key, capability, category, icon }) => {
  const c = getCapability(capability);
  if (!c || !c.visibleEnMenu || c.madurez === "obsoleta") return [];
  return [{
    key,
    route: key === "bank-reconciler" ? "/app/tools/bank-reconciler" : c.ruta,
    name: c.nombre,
    description: c.descripcion,
    category,
    icon,
    madurez: c.madurez,
    status: c.madurez === "proximamente" ? ("soon" as const) : ("available" as const),
  }];
});

export const CATEGORY_ORDER: ToolCategory[] = ["Defensa SAT", "CFDI", "Cálculo", "Bancos", "Documentos", "IA"];

export function getTool(key: string): ToolDef | undefined {
  return TOOLS.find((t) => t.key === key);
}
