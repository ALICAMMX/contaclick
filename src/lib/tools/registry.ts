import {
  FileSearch, FileStack, Calculator, Coins, Banknote, FileBadge,
  FileSignature, ShieldCheck, ScanSearch, Bot,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ToolCategory = "CFDI" | "Cálculo" | "Bancos" | "Documentos" | "IA";

export type ToolDef = {
  key: string;
  route: string; // matches src/routes/app.tools.<key>.tsx
  name: string;
  description: string;
  category: ToolCategory;
  icon: LucideIcon;
  status?: "available" | "soon";
};

export const TOOLS: ToolDef[] = [
  {
    key: "cfdi-validator",
    route: "/app/tools/cfdi-validator",
    name: "Validador CFDI 4.0",
    description: "Sube un XML, valida estructura, RFC, totales y UUID al instante.",
    category: "CFDI",
    icon: FileSearch,
  },
  {
    key: "xml-bulk-reader",
    route: "/app/tools/xml-bulk-reader",
    name: "Lector masivo de XML",
    description: "Procesa un ZIP del SAT y extrae una tabla con todos tus comprobantes.",
    category: "CFDI",
    icon: FileStack,
  },
  {
    key: "isr-iva-calculator",
    route: "/app/tools/isr-iva-calculator",
    name: "Calculadora ISR / IVA",
    description: "Calcula el pago provisional mensual con base en ingresos y gastos.",
    category: "Cálculo",
    icon: Calculator,
  },
  {
    key: "resico-calculator",
    route: "/app/tools/resico-calculator",
    name: "Calculadora RESICO PF",
    description: "Calcula el ISR mensual de personas físicas RESICO según su ingreso.",
    category: "Cálculo",
    icon: Coins,
  },
  {
    key: "bank-reconciler",
    route: "/app/tools/bank-reconciler",
    name: "Conciliador bancario",
    description: "Cruza el estado de cuenta del cliente con sus CFDI emitidos y recibidos.",
    category: "Bancos",
    icon: Banknote,
  },
  {
    key: "csf-parser",
    route: "/app/tools/csf-parser",
    name: "Lector de Constancia Fiscal",
    description: "Sube la CSF en PDF y extrae régimen, obligaciones y domicilio fiscal.",
    category: "Documentos",
    icon: FileBadge,
  },
  {
    key: "oficio-generator",
    route: "/app/tools/oficio-generator",
    name: "Generador de oficios SAT",
    description: "Plantillas listas (avisos, respuestas a invitación) personalizadas con el RFC.",
    category: "Documentos",
    icon: FileSignature,
  },
  {
    key: "cfdi-verifier",
    route: "/app/tools/cfdi-verifier",
    name: "Verificador de UUID",
    description: "Verifica el formato del UUID y prepara la consulta al webservice del SAT.",
    category: "CFDI",
    icon: ShieldCheck,
  },
  {
    key: "express-auditor",
    route: "/app/tools/express-auditor",
    name: "Auditor express",
    description: "Detecta huecos en folios, duplicados y notas de crédito sin relación.",
    category: "CFDI",
    icon: ScanSearch,
  },
  {
    key: "fiscal-assistant",
    route: "/app/tools/fiscal-assistant",
    name: "Asistente fiscal IA",
    description: "Pregunta puntual sobre legislación fiscal mexicana usando el contexto del cliente.",
    category: "IA",
    icon: Bot,
  },
];

export const CATEGORY_ORDER: ToolCategory[] = ["CFDI", "Cálculo", "Bancos", "Documentos", "IA"];

export function getTool(key: string): ToolDef | undefined {
  return TOOLS.find((t) => t.key === key);
}
