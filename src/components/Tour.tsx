import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "./ui/button";

const STORAGE_KEY = "cc.tour.dismissed.v1";

type Step = {
  title: string;
  body: string;
  route?: string;
  cta: string;
};

const STEPS: Step[] = [
  {
    title: "1. Expedientes (clientes)",
    body: "Cada cliente es un expediente con su RFC. Selecciona uno desde el selector superior para que todas las herramientas operen sobre ese RFC.",
    route: "/app/clientes",
    cta: "Ver expedientes",
  },
  {
    title: "2. CFDI",
    body: "Sube XML individuales o un ZIP del SAT. Verás emitidos vs recibidos, totales y validaciones automáticas (estructura, RFC, UUID).",
    route: "/app/cfdi",
    cta: "Ir a CFDI",
  },
  {
    title: "3. Conciliación bancaria",
    body: "Cruza tu estado de cuenta con los CFDI del cliente. Aceptas o rechazas cada match propuesto.",
    route: "/app/conciliacion",
    cta: "Ir a conciliación",
  },
  {
    title: "4. Reportes",
    body: "Genera reportes mensuales (ingresos, egresos, utilidad) listos para descargar en PDF o Excel.",
    route: "/app/reportes",
    cta: "Ir a reportes",
  },
  {
    title: "5. Mensajes",
    body: "Envía recordatorios y reportes a tus clientes vía WhatsApp o email con plantillas reutilizables.",
    route: "/app/mensajes",
    cta: "Ir a mensajes",
  },
  {
    title: "6. Herramientas e IA",
    body: "Calculadoras (ISR/IVA, RESICO), auditor express, asistente fiscal con IA y más, todas usando el contexto del expediente activo.",
    route: "/app/tools",
    cta: "Ver herramientas",
  },
];

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-primary/30 bg-card p-6 shadow-2xl" style={{ background: "var(--gradient-primary, hsl(var(--card)))" }}>
        <div className="rounded-xl bg-card p-6 -m-px">
          <button onClick={() => { localStorage.setItem(STORAGE_KEY, "1"); onClose(); }} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 mb-3 text-xs text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Tour interactivo · {step + 1} de {STEPS.length}
          </div>
          <h2 className="text-xl font-semibold mb-2">{s.title}</h2>
          <p className="text-sm text-muted-foreground mb-6">{s.body}</p>

          <div className="flex items-center gap-1 mb-5">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`} />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-between">
            <Button variant="ghost" size="sm" onClick={() => { localStorage.setItem(STORAGE_KEY, "1"); onClose(); }}>
              Saltar tour
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="outline" size="sm" onClick={() => setStep((v) => Math.max(0, v - 1))}>
                  Anterior
                </Button>
              )}
              <Button
                variant="hero"
                size="sm"
                onClick={() => {
                  if (s.route) navigate({ to: s.route });
                  if (isLast) {
                    localStorage.setItem(STORAGE_KEY, "1");
                    onClose();
                  } else {
                    setStep((v) => v + 1);
                  }
                }}
              >
                {isLast ? "Terminar" : s.cta}
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function shouldAutoOpenTour() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) !== "1";
}

export function resetTour() {
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
}
