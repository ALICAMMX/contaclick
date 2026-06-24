import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, Sparkles, Clock, Coins, TrendingUp, CheckCircle2, Calculator as CalcIcon } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { TOOLS, CATEGORY_ORDER, type ToolDef } from "@/lib/tools/registry";

export const Route = createFileRoute("/folleto-herramientas")({
  head: () => ({
    meta: [
      { title: "Suite de Herramientas IA — ContaClick" },
      {
        name: "description",
        content:
          "15 herramientas de IA para contadores mexicanos: CFDI, conciliación bancaria, ISR/IVA, RESICO, defensa SAT y más. Descubre cuánto tiempo y dinero pierdes haciéndolo manual.",
      },
      { property: "og:title", content: "Suite de Herramientas IA — ContaClick" },
      {
        property: "og:description",
        content:
          "15 herramientas de IA diseñadas para despachos contables en México. Calcula tu ROI vs. trabajo manual.",
      },
    ],
  }),
  component: FolletoHerramientas,
});

// Copy de marketing por tool key
type ToolCopy = { beneficios: string[]; caracteristicas: string[] };
const COPY: Record<string, ToolCopy> = {
  "cfdi-validator": {
    beneficios: [
      "Valida un CFDI 4.0 en menos de 3 segundos",
      "Detecta UUID, RFC emisor/receptor y totales mal capturados",
      "Evita rechazos del SAT antes de contabilizar",
      "Reporte descargable listo para tu cliente",
    ],
    caracteristicas: [
      "Lectura del XML 4.0 con esquema oficial SAT",
      "Verificación de RFC y régimen del receptor",
      "Validación de totales, impuestos y traslados",
      "Identificación de complementos (nómina, pagos, INE)",
    ],
  },
  "xml-bulk-reader": {
    beneficios: [
      "Procesa el ZIP completo del Portal SAT en un solo paso",
      "Obtén una tabla lista para Excel con miles de CFDI",
      "Elimina la captura manual de pólizas",
      "Detecta duplicados y comprobantes cancelados",
    ],
    caracteristicas: [
      "Soporta ZIP con cientos de XML mezclados",
      "Extrae emisor, receptor, conceptos, impuestos y UUID",
      "Exportación directa a Excel y CSV",
      "Filtros por tipo, mes y estatus SAT",
    ],
  },
  "isr-iva-calculator": {
    beneficios: [
      "Pago provisional mensual PF en menos de 2 minutos",
      "Considera ingresos acumulados y deducciones autorizadas",
      "Memoria de cálculo lista para defender ante SAT",
      "Simula escenarios antes de presentar",
    ],
    caracteristicas: [
      "Régimen de Actividad Empresarial y Profesional",
      "Tarifa ISR mensual actualizada",
      "IVA causado, acreditable y a cargo",
      "Exportación de la memoria de cálculo",
    ],
  },
  "isr-iva-pm": {
    beneficios: [
      "Calcula pagos provisionales con coeficiente de utilidad",
      "Ajusta automáticamente por pérdidas fiscales",
      "Reduce errores en el cálculo anual",
      "Compatible con régimen general 601",
    ],
    caracteristicas: [
      "Coeficiente de utilidad personalizable",
      "Acumulado mensual con ajuste de pérdidas",
      "IVA mensual con acreditamientos",
      "Memoria descargable por mes",
    ],
  },
  "resico-calculator": {
    beneficios: [
      "ISR RESICO PF al instante según ingreso mensual",
      "Aplica la tarifa progresiva correcta",
      "Evita pagar de más por error de tabla",
      "Útil para asesoría rápida con clientes",
    ],
    caracteristicas: [
      "Tarifa RESICO PF vigente",
      "Cálculo mensual y proyección anual",
      "Validación del tope de ingresos del régimen",
      "Comparativo contra Actividad Empresarial",
    ],
  },
  "bank-reconciler": {
    beneficios: [
      "Concilia el estado de cuenta con CFDI en minutos",
      "Identifica depósitos sin comprobante (riesgo PIE)",
      "Detecta egresos sin factura deducible",
      "Evidencia lista para papeles de trabajo",
    ],
    caracteristicas: [
      "Lectura de PDF/CSV de los principales bancos MX",
      "Cruce automático contra CFDI emitidos y recibidos",
      "Semáforo de partidas conciliadas / pendientes",
      "Exportación a Excel con conciliación final",
    ],
  },
  "csf-parser": {
    beneficios: [
      "Lee la Constancia de Situación Fiscal en segundos",
      "Extrae régimen, obligaciones y domicilio sin teclear",
      "Evita facturar con datos equivocados",
      "Onboarding de clientes 10× más rápido",
    ],
    caracteristicas: [
      "Soporta PDF de CSF 2022+",
      "Extracción de RFC, CURP, régimen y obligaciones",
      "Domicilio fiscal estructurado (CP, colonia, etc.)",
      "Validación de coincidencia con el alta del SAT",
    ],
  },
  "import-clientes": {
    beneficios: [
      "Migra tu cartera completa desde Excel en una sola carga",
      "Hasta 500 RFC validados de golpe",
      "Detección automática de duplicados",
      "Cero captura manual al iniciar",
    ],
    caracteristicas: [
      "Soporta XLSX y CSV con plantilla guía",
      "Validación de RFC con algoritmo SAT",
      "Detección de filas inválidas con reporte de errores",
      "Asignación automática a usuario responsable",
    ],
  },
  "oficio-generator": {
    beneficios: [
      "Genera oficios SAT con un solo clic",
      "Plantillas legales revisadas por fiscalistas",
      "Personalización automática con RFC y nombre",
      "Listo para imprimir o enviar por Buzón",
    ],
    caracteristicas: [
      "Avisos de actualización, suspensión y reanudación",
      "Respuestas a invitación y carta invitación SAT",
      "Aclaraciones de diferencias y devoluciones",
      "Exportación a Word y PDF firmable",
    ],
  },
  "cfdi-verifier": {
    beneficios: [
      "Confirma vigencia de UUID antes de pagar facturas",
      "Evita acreditar IVA de comprobantes cancelados",
      "Reduce riesgo de discrepancia en DIOT",
      "Verificación masiva en segundos",
    ],
    caracteristicas: [
      "Validación del formato del UUID",
      "Preparación de la consulta al webservice SAT",
      "Marca el estatus (vigente / cancelado)",
      "Histórico de verificaciones por cliente",
    ],
  },
  "express-auditor": {
    beneficios: [
      "Auditoría rápida de la facturación del cliente",
      "Detecta huecos en folios y series",
      "Identifica notas de crédito huérfanas",
      "Anticipa hallazgos antes que el SAT",
    ],
    caracteristicas: [
      "Análisis de folios consecutivos por serie",
      "Detección de duplicados por UUID y total",
      "Cruce de notas de crédito vs. CFDI relacionado",
      "Reporte ejecutivo descargable",
    ],
  },
  "fiscal-assistant": {
    beneficios: [
      "Pregunta puntual y obtén respuesta con fundamento",
      "Contexto del cliente activo cargado automáticamente",
      "Reduce horas de investigación en LISR, LIVA, CFF",
      "Ideal para apoyar a tu equipo junior",
    ],
    caracteristicas: [
      "Chat especializado en legislación fiscal mexicana",
      "Citas a artículos de LISR, LIVA, CFF y RMF",
      "Lectura del expediente del cliente activo",
      "Historial de consultas por usuario",
    ],
  },
  "deducibility-checker": {
    beneficios: [
      "Defiende deducciones antes de una revisión SAT",
      "Cruza CFDI contra art. 27 y 28 LISR",
      "Detecta pagos en efectivo > $2,000 no deducibles",
      "Reporte listo para papeles de defensa",
    ],
    caracteristicas: [
      "Reglas para restaurantes, donativos, extranjeros y alcohol",
      "Validación de medio de pago y forma de pago",
      "Cruce con CFDI complemento de pagos",
      "Memo de justificación por concepto",
    ],
  },
  "shadow-payroll": {
    beneficios: [
      "Detecta nómina oculta antes de una reclasificación",
      "Identifica transferencias recurrentes sin CFDI",
      "Reduce el riesgo de cuotas IMSS retroactivas",
      "Evidencia para regularización voluntaria",
    ],
    caracteristicas: [
      "Análisis de patrones recurrentes en banco",
      "Cruce contra CFDI de nómina y honorarios",
      "Score de riesgo por beneficiario",
      "Reporte ejecutivo de exposición",
    ],
  },
  "import-prices": {
    beneficios: [
      "Valor en aduana defendible vs. SAT y ANAM",
      "Comparables internos por clave de producto SAT",
      "Memo justificativo conforme art. 76-A y 179 LISR",
      "Reduce el riesgo de PAMA y multas aduanales",
    ],
    caracteristicas: [
      "Cálculo de precio promedio por clave SAT",
      "Desviaciones vs. mercado y vs. partes relacionadas",
      "Generación de memo de precios de transferencia",
      "Exportación lista para expediente",
    ],
  },
};

// Tareas para la calculadora ROI (contables)
const ROI_TASKS = [
  { id: "captura-cfdi", label: "Capturar pólizas desde CFDI a mano", manualHrs: 0.05, perUnit: "por CFDI" },
  { id: "concilia-banco", label: "Conciliar un estado de cuenta bancario", manualHrs: 6, perUnit: "por cuenta/mes" },
  { id: "isr-iva", label: "Calcular pago provisional ISR/IVA (PF o PM)", manualHrs: 2.5, perUnit: "por cliente/mes" },
  { id: "csf", label: "Capturar Constancia de Situación Fiscal", manualHrs: 0.5, perUnit: "por cliente" },
  { id: "verifica-uuid", label: "Verificar UUID de proveedores antes de pagar", manualHrs: 0.08, perUnit: "por CFDI" },
  { id: "oficio", label: "Redactar un oficio o aviso al SAT", manualHrs: 1.5, perUnit: "por oficio" },
  { id: "auditor", label: "Auditoría express a la facturación de un cliente", manualHrs: 4, perUnit: "por cliente" },
  { id: "deducibilidad", label: "Revisar deducibilidad de gastos (art. 27 y 28 LISR)", manualHrs: 3, perUnit: "por cliente/mes" },
];

const AI_FACTOR = 0.1; // IA reduce ~90% el tiempo manual

function FolletoHerramientas() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <Hero />
      <StatsBand />
      <RoiCalculator />
      <ToolsList />
      <FinalCta />
    </div>
  );
}

/* ---------------- HERO ---------------- */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#0b1f3a] via-[#0e2a55] to-[#0a3d3a]" />
      <div className="absolute inset-0 -z-10 opacity-30 [background:radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%),radial-gradient(circle_at_70%_80%,rgba(80,200,180,0.25),transparent_50%)]" />
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32 text-center text-white">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" /> Suite de Herramientas IA
        </span>
        <h1 className="serif mt-6 text-5xl sm:text-6xl font-semibold leading-tight">
          Transforma tu Práctica Contable
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80">
          15 herramientas de inteligencia artificial diseñadas específicamente para contadores y despachos mexicanos.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="bg-white text-[#0b1f3a] hover:bg-white/90">
            <Link to="/auth">Comenzar Ahora <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="border-white/30 text-white hover:bg-white/10">
            <a href="#calculadora">Calcular mi ROI</a>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- STATS ---------------- */
const STATS = [
  { value: "15", label: "Herramientas IA", icon: Sparkles },
  { value: "90%", label: "Ahorro en tiempo operativo", icon: Clock },
  { value: "10×", label: "Más productividad por contador", icon: TrendingUp },
  { value: "100%", label: "Legislación fiscal mexicana", icon: CheckCircle2 },
];

function StatsBand() {
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        {STATS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="text-center">
              <Icon className="mx-auto mb-3 h-6 w-6 text-primary" />
              <div className="text-3xl sm:text-4xl font-semibold text-foreground tabular-nums">{s.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- ROI CALCULATOR ---------------- */
function RoiCalculator() {
  const [mode, setMode] = useState<"dinero" | "tiempo">("dinero");
  const [rate, setRate] = useState(500);
  const [taskId, setTaskId] = useState(ROI_TASKS[1].id);
  const [freq, setFreq] = useState(20);

  const task = useMemo(() => ROI_TASKS.find((t) => t.id === taskId)!, [taskId]);

  const manualHoursMonth = task.manualHrs * freq;
  const aiHoursMonth = manualHoursMonth * AI_FACTOR;
  const hoursSaved = manualHoursMonth - aiHoursMonth;
  const moneySaved = hoursSaved * rate;
  const yearMoney = moneySaved * 12;

  return (
    <section id="calculadora" className="py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
            <CalcIcon className="h-3.5 w-3.5" /> Herramienta Interactiva
          </span>
          <h2 className="serif mt-4 text-3xl sm:text-4xl font-semibold">
            ¿Cuánto tiempo y dinero pierdes al mes?
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Descubre el costo real de hacer manualmente tareas contables que ContaClick automatiza con IA.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
          {/* Header gradiente */}
          <div className="bg-gradient-to-r from-[#0b1f3a] to-[#0a3d3a] p-6 text-white">
            <div className="inline-flex rounded-full bg-white/10 p-1 text-sm">
              <button
                onClick={() => setMode("dinero")}
                className={`px-4 py-1.5 rounded-full transition ${mode === "dinero" ? "bg-white text-[#0b1f3a] font-medium" : "text-white/80"}`}
              >
                <Coins className="inline h-4 w-4 mr-1.5" /> Calculadora de Dinero
              </button>
              <button
                onClick={() => setMode("tiempo")}
                className={`px-4 py-1.5 rounded-full transition ${mode === "tiempo" ? "bg-white text-[#0b1f3a] font-medium" : "text-white/80"}`}
              >
                <Clock className="inline h-4 w-4 mr-1.5" /> Calculadora de Tiempo
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-0">
            {/* Inputs */}
            <div className="p-8 space-y-6 border-r border-border">
              <div>
                <label className="block text-sm font-medium mb-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-xs mr-2">1</span>
                  ¿Cuánto cobras por hora de trabajo?
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rate}
                    onChange={(e) => setRate(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <span className="text-sm text-muted-foreground">MXN/hr</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-xs mr-2">2</span>
                  Selecciona una tarea que realizas frecuentemente
                </label>
                <select
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {ROI_TASKS.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-xs mr-2">3</span>
                  ¿Cuántas veces al mes realizas esta tarea?
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={freq}
                    onChange={(e) => setFreq(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">{task.perUnit}</span>
                </div>
              </div>
            </div>

            {/* Result */}
            <div className="p-8 bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-emerald-950/30 dark:to-cyan-950/20">
              {mode === "dinero" ? (
                <div className="h-full flex flex-col justify-center text-center">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Ahorro estimado al mes</div>
                  <div className="serif mt-2 text-5xl font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {moneySaved.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })}
                  </div>
                  <div className="mt-6 text-sm text-muted-foreground">Equivalente al año</div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {yearMoney.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })}
                  </div>
                  <div className="mt-6 text-xs text-muted-foreground">
                    Basado en {manualHoursMonth.toFixed(1)} horas/mes manuales vs. {aiHoursMonth.toFixed(1)} con ContaClick.
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col justify-center text-center">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Tiempo ahorrado al mes</div>
                  <div className="serif mt-2 text-5xl font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {hoursSaved.toFixed(1)} hrs
                  </div>
                  <div className="mt-6 text-sm text-muted-foreground">Equivalente al año</div>
                  <div className="text-2xl font-semibold tabular-nums">{(hoursSaved * 12).toFixed(0)} hrs</div>
                  <div className="mt-6 text-xs text-muted-foreground">
                    Eso son {((hoursSaved * 12) / 8).toFixed(0)} jornadas laborales completas recuperadas.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-6 py-4 bg-muted/30 border-t border-border text-xs text-muted-foreground space-y-1">
            <p>Cálculos basados en promedios reales de trabajo contable tradicional vs. uso de IA y automatización.</p>
            <p>ContaClick no reemplaza tu criterio profesional, lo potencia. Las estimaciones son aproximadas.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- TOOLS LIST ---------------- */
function ToolsList() {
  const ordered = useMemo(() => {
    return [...TOOLS].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
    );
  }, []);

  return (
    <section className="py-20 sm:py-28 bg-muted/20 border-y border-border">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-16">
          <h2 className="serif text-3xl sm:text-4xl font-semibold">Nuestras Herramientas</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Cada herramienta está diseñada para resolver un problema específico del ejercicio contable en México.
          </p>
        </div>

        <div className="space-y-20">
          {ordered.map((tool, i) => (
            <ToolCard key={tool.key} tool={tool} flipped={i % 2 === 1} index={i + 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ToolCard({ tool, flipped, index }: { tool: ToolDef; flipped: boolean; index: number }) {
  const Icon = tool.icon;
  const copy = COPY[tool.key];

  return (
    <article className="grid lg:grid-cols-2 gap-10 items-center">
      {/* Mockup placeholder */}
      <div className={flipped ? "lg:order-2" : ""}>
        <div className="relative aspect-[4/3] rounded-2xl border border-border bg-gradient-to-br from-[#0b1f3a] via-[#0e2a55] to-[#0a3d3a] overflow-hidden shadow-[var(--shadow-card)]">
          <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.2),transparent_50%)]" />
          {/* macOS-style window */}
          <div className="absolute inset-6 rounded-xl bg-background/95 border border-border/40 shadow-xl overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/40 bg-muted/40">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
              <span className="ml-3 text-[10px] text-muted-foreground">contaclick.app{tool.route}</span>
            </div>
            <div className="flex h-full items-center justify-center p-6">
              <div className="flex flex-col items-center text-center">
                <div className="h-16 w-16 rounded-2xl bg-primary/15 text-primary grid place-items-center">
                  <Icon className="h-8 w-8" />
                </div>
                <div className="mt-4 font-medium text-sm">{tool.name}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{tool.category}</div>
              </div>
            </div>
          </div>
          <div className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full bg-white/10 backdrop-blur border border-white/20 px-2.5 py-1 text-[10px] font-medium text-white">
            #{String(index).padStart(2, "0")}
          </div>
        </div>
      </div>

      {/* Texto */}
      <div>
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary mb-2">
          <span className="h-1 w-6 bg-primary" /> {tool.category}
        </div>
        <h3 className="serif text-2xl sm:text-3xl font-semibold">{tool.name}</h3>
        <p className="mt-3 text-muted-foreground">{tool.description}</p>

        {copy && (
          <div className="mt-6 grid sm:grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2">
                Beneficios
              </div>
              <ul className="space-y-1.5 text-sm">
                {copy.beneficios.map((b) => (
                  <li key={b} className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                    <span className="text-foreground/85">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
                Características
              </div>
              <ul className="space-y-1.5 text-sm">
                {copy.caracteristicas.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span className="text-foreground/85">{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Probar esta herramienta <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

/* ---------------- FINAL CTA ---------------- */
function FinalCta() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#0b1f3a] via-[#0e2a55] to-[#0a3d3a]" />
      <div className="mx-auto max-w-4xl px-6 py-20 sm:py-28 text-center text-white">
        <h2 className="serif text-3xl sm:text-4xl font-semibold">
          Las 15 herramientas, una sola suscripción
        </h2>
        <p className="mt-4 text-white/80 max-w-2xl mx-auto">
          Únete a los despachos contables que ya recuperaron decenas de horas al mes con ContaClick IA.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="bg-white text-[#0b1f3a] hover:bg-white/90">
            <Link to="/auth">Probar gratis <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="border-white/30 text-white hover:bg-white/10">
            <Link to="/precios">Ver precios</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
