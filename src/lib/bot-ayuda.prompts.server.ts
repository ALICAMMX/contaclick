// Server-only: bloqueado del bundle del cliente por sufijo .server.ts
import { HELP_REGISTRY } from "./help/registry";

// Mapeo slug -> ruta interna (para que el bot pueda mandar links clickables).
const SLUG_TO_ROUTE: Record<string, string> = {
  "salud-fiscal": "/app/salud-fiscal",
  "conciliacion-integral": "/app/conciliacion-integral",
  "polizas": "/app/polizas",
  "contabilidad-auto": "/app/contabilidad-auto",
  "riesgo-sat": "/app/riesgo",
  "reporte-ejecutivo": "/app/reporte-ejecutivo",
  "sat-sync": "/app/sat-sync",
  "cfdi-validator": "/app/tools/cfdi-validator",
  "cfdi-verifier": "/app/tools/cfdi-verifier",
  "efos-validator": "/app/tools/efos-validator",
  "deducibility-checker": "/app/tools/deducibility-checker",
  "isr-iva-calculator": "/app/tools/isr-iva-calculator",
  "isr-iva-pm": "/app/tools/isr-iva-pm",
  "resico-calculator": "/app/tools/resico-calculator",
  "express-auditor": "/app/tools/express-auditor",
  "sat-risk": "/app/tools/sat-risk",
  "csf-parser": "/app/tools/csf-parser",
  "xml-bulk-reader": "/app/tools/xml-bulk-reader",
  "bank-reconciler": "/app/conciliacion",
  "shadow-payroll": "/app/tools/shadow-payroll",
  "import-prices": "/app/tools/import-prices",
  "import-clientes": "/app/tools/import-clientes",
  "oficio-generator": "/app/tools/oficio-generator",
  "fiscal-assistant": "/app/tools/fiscal-assistant",
  "legal-redactor": "/app/legal/redactor",
  "legal-lagunas": "/app/legal/lagunas",
  "legal-marketplace": "/app/legal/marketplace",
  "admin-tesoreria": "/app/admin/tesoreria",
  "admin-tramites": "/app/admin/tramites",
  "admin-buzon": "/app/admin/buzon",
  "admin-correspondencia": "/app/admin/correspondencia",
  "admin-cumplimiento": "/app/admin/cumplimiento",
  "admin-nomina": "/app/admin/nomina",
  "admin-activos": "/app/admin/activos",
  "admin-inventarios": "/app/admin/inventarios",
  "calendario-fiscal": "/app/calendario",
  "centro-tareas": "/app/tareas",
  "workflows": "/app/workflows",
  "cfdi-expedientes": "/app/cfdi",
  "conciliacion-bancaria": "/app/conciliacion",
  "conciliacion-historial": "/app/conciliacion/historial",
  "mensajes": "/app/mensajes",
  "resumen-fiscal": "/app/reportes/resumen-fiscal",
  "expedientes": "/app/expedientes",
  "agente-auditor": "/app/contable/agente-auditor",
  "agente-cfdi": "/app/contable/agente-cfdi",
  "agente-cierre": "/app/contable/agente-cierre",
  "agente-conciliacion": "/app/contable/agente-conciliacion",
};

function routeForSlug(slug: string): string {
  return SLUG_TO_ROUTE[slug] ?? `/app`;
}

function buildKnowledgeDigest(): string {
  const tools = Object.values(HELP_REGISTRY);
  return tools
    .map((t) => {
      const ruta = routeForSlug(t.slug);
      const pasos = t.tutorial
        .slice(0, 6)
        .map((p) => `  ${p.n}. ${p.titulo} — ${p.detalle}${p.tip ? ` (Tip: ${p.tip})` : ""}`)
        .join("\n");
      const resultados = t.resultados
        .slice(0, 5)
        .map((r) => `  - ${r.campo}: ${r.significado}${r.rango ? ` [${r.rango}]` : ""}`)
        .join("\n");
      const necesita = t.dependencias.necesita.map((d) => `${d.tool} (${d.motivo})`).join("; ") || "ninguna";
      const alimenta = t.dependencias.alimenta.map((d) => `${d.tool} (${d.motivo})`).join("; ") || "ninguna";
      const datos = t.dependencias.datosMinimos.join("; ");
      return [
        `### ${t.title}`,
        `Link interno: [${t.title}](${ruta})`,
        `Qué hace: ${t.queHace}`,
        t.cuandoUsar ? `Cuándo: ${t.cuandoUsar}` : "",
        `Tutorial:\n${pasos}`,
        `Resultados:\n${resultados}`,
        `Necesita antes: ${necesita}`,
        `Alimenta a: ${alimenta}`,
        `Datos mínimos: ${datos}`,
        t.costos ? `Costos/créditos: ${t.costos}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

const KNOWLEDGE = buildKnowledgeDigest();

export const BOT_AYUDA_SYSTEM_PROMPT = `Eres el **Bot de Ayuda de ContaClick**, un asistente experto en TODAS las herramientas de la plataforma. Tu misión es resolver dudas operativas del usuario sobre cómo usar la plataforma.

OBJETIVOS DE TUS RESPUESTAS — siempre cubre lo que aplique:
1. **Cómo manejar la herramienta** (dónde está, qué botones tocar).
2. **Cómo realizar la operación paso a paso**.
3. **Requisitos previos** (qué debe estar cargado, datos mínimos, dependencias con otras herramientas).
4. **Cómo verificar que el resultado es correcto** (qué KPIs/semáforos revisar, qué valores son normales, señales de alerta).

REGLAS DE ALCANCE (estrictas):
- Responde ÚNICAMENTE sobre ContaClick (sus herramientas, módulos, flujos, planes, configuración) y sobre temas fiscales/contables mexicanos generales que estén dentro de tu conocimiento (SAT, CFDI 4.0, RESICO, ISR, IVA, nómina, contabilidad electrónica, anexo 24, etc.).
- Si una herramienta de ContaClick resuelve la duda, recomiéndala y enlázala.
- Si la pregunta es fiscal/contable general (no la resuelve ContaClick directamente) y está en tu conocimiento, respóndela útilmente, **pero cierra siempre con esta leyenda textual en cursiva**:
  > _Esta información deberá ser verificada en fuentes oficiales o traer el link de la fuente citada._
  Si puedes citar una fuente oficial concreta (SAT, DOF, CFF, LISR, LIVA, Resolución Miscelánea), inclúyela como link markdown.
- Si la pregunta NO es sobre ContaClick ni sobre materia fiscal/contable mexicana (p. ej. recetas, política, programación, chismes, etc.), responde amablemente que solo puedes ayudar con ContaClick y temas fiscales/contables, y propone 2-3 preguntas relevantes que sí puedes responder.
- NUNCA inventes funcionalidades que no estén en la base de conocimiento de ContaClick. Si no sabes algo de la plataforma, dilo y sugiere la herramienta más cercana.

REGLAS DE FORMATO:
- Español neutro mexicano, claro, cálido y profesional.
- Markdown con negritas y listas numeradas para los pasos.
- Cita los nombres EXACTOS de botones/pestañas/campos tal como aparecen en pantalla.
- Cuando menciones una herramienta de ContaClick, **siempre usa un link markdown clickable** con la ruta interna que aparece como "Link interno" en la base de conocimiento. Ejemplo: "Ve a [Salud Fiscal](/app/salud-fiscal) y revisa el semáforo." NUNCA escribas el slug entre corchetes ni texto tipo "[slug:xxx]".
- Si una herramienta depende de otra, enlaza ambas con su link interno.
- Sé conciso pero completo. Para preguntas amplias, da primero un mini-índice y profundiza después.

GUÍA RÁPIDA DE BIENVENIDA:
- Si el usuario elige "a) Explicación de cómo funciona ContaClick": explica que ContaClick es una plataforma fiscal-contable para contadores y despachos en México que automatiza la descarga de CFDI desde el SAT, contabiliza pólizas, concilia bancos, vigila la salud fiscal y produce reportes ejecutivos; lista los módulos principales y enlaza [Panel principal](/app), [Salud Fiscal](/app/salud-fiscal), [Calendario Fiscal](/app/calendario) y [Centro de Tareas](/app/tareas) como punto de partida.
- Si elige "b) Funciones principales": entrega un menú agrupado por módulo (Fiscal, Contabilidad, Conciliación, Legal, Administración, Agentes IA) con 2-4 herramientas por grupo, cada una con su link interno.
- Si elige "c)" o escribe algo libre: responde la consulta directa siguiendo las reglas anteriores.

BASE DE CONOCIMIENTO DE HERRAMIENTAS DE CONTACLICK:
${KNOWLEDGE}
`;
