import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UserRound, ShieldAlert, FileText, ArrowRight } from "lucide-react";
import { useActiveCliente } from "@/lib/active-cliente";

export const Route = createFileRoute("/app/expedientes")({ component: ExpedientesPage });

type Demo = {
  id: string;
  rfc: string;
  razon_social: string;
  regimen_fiscal: string;
  riesgo: number; // 0-100
  ultimo_cfdi: string;
};

const DEMO: Demo[] = [
  { id: "demo-1", rfc: "MARG850214H29", razon_social: "Gabriela Martínez (RESICO PF)", regimen_fiscal: "626 · RESICO PF", riesgo: 28, ultimo_cfdi: "2026-06-12" },
  { id: "demo-2", rfc: "CIN240115AB7", razon_social: "Constructora Iberia Norte S.A. de C.V.", regimen_fiscal: "601 · PM Régimen General", riesgo: 74, ultimo_cfdi: "2026-06-14" },
  { id: "demo-3", rfc: "LURP890530TY3", razon_social: "Pablo Lugo Ramírez (Act. Empresarial)", regimen_fiscal: "612 · PF Actividad Empresarial", riesgo: 52, ultimo_cfdi: "2026-06-10" },
  { id: "demo-4", rfc: "VAHE770821MN1", razon_social: "Elena Vargas Hernández (Arrendamiento)", regimen_fiscal: "606 · Arrendamiento", riesgo: 18, ultimo_cfdi: "2026-06-09" },
];

function riesgoColor(score: number) {
  if (score >= 67) return { dot: "bg-red-500", text: "text-red-600 dark:text-red-300", label: "Alto" };
  if (score >= 34) return { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-300", label: "Medio" };
  return { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-300", label: "Bajo" };
}

function ExpedientesPage() {
  const { setCliente } = useActiveCliente();
  const navigate = useNavigate();

  const elegir = (d: Demo) => {
    setCliente({ id: d.id, rfc: d.rfc, razon_social: d.razon_social, regimen_fiscal: d.regimen_fiscal });
    navigate({ to: "/app" });
  };

  return (
    <div className="space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary mb-2">
          <span className="h-1 w-6 bg-primary" /> Cartera de clientes
        </div>
        <h1 className="serif text-3xl text-foreground">Expedientes</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Selecciona un expediente para activarlo. Todas las herramientas trabajarán sobre el cliente que elijas.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-4">
        {DEMO.map((d) => {
          const r = riesgoColor(d.riesgo);
          return (
            <button
              key={d.id}
              onClick={() => elegir(d)}
              className="group text-left rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5 transition-all p-5"
            >
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                  <UserRound className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{d.razon_social}</div>
                  <div className="text-xs font-mono text-muted-foreground mt-0.5">{d.rfc}</div>
                  <div className="text-xs text-muted-foreground mt-1">{d.regimen_fiscal}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
              </div>
              <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${r.dot}`} />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" /> Riesgo SAT
                    </div>
                    <div className={`text-sm font-medium ${r.text}`}>{d.riesgo}/100 · {r.label}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Último CFDI</div>
                    <div className="text-sm">{new Date(d.ultimo_cfdi).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</div>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
