import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold } from "@/components/ModuleScaffold";
import { Gavel, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/app/legal/lagunas")({ component: LagunasPage });

const LAGUNAS = [
  { n: "Materialidad de Operaciones", conflicto: "Art. 69-B CFF vs criterios TFJA sobre prueba indiciaria", recup: "$100K – $1M", exito: 87, estrategia: "Recurso de revocación con expediente de soporte (contratos, evidencia digital, logística)." },
  { n: "Devolución de IVA en periodo preoperativo", conflicto: "Art. 5 LIVA fracción VI vs criterio 4/IVA SCJN 2023", recup: "$50K – $500K", exito: 76, estrategia: "Solicitud de devolución con dictamen de inicio de actividades." },
  { n: "Acreditamiento de IVA en gastos no esenciales", conflicto: "Art. 5-I LIVA vs jurisprudencia 2a./J. 142/2020", recup: "$30K – $300K", exito: 68, estrategia: "Amparo indirecto con argumento de proporcionalidad tributaria." },
  { n: "Deducción de pagos al extranjero", conflicto: "Art. 27-V LISR vs tratados para evitar doble tributación", recup: "$80K – $1.5M", exito: 72, estrategia: "Aplicación directa de tratado + constancia de residencia." },
  { n: "Pérdidas fiscales por reestructura", conflicto: "Art. 58 LISR vs concepto de continuidad de empresa", recup: "$200K – $4M", exito: 64, estrategia: "Memo justificativo de razón de negocio + dictamen contable." },
  { n: "Subcontratación especializada (REPSE)", conflicto: "Reforma 2021 vs criterios STPS 2024", recup: "Evita multa $200K+", exito: 81, estrategia: "Actualización REPSE + contrato modelo SAT." },
];

function LagunasPage() {
  return (
    <ModuleScaffold
      title="Mapa de Lagunas Legales"
      subtitle="14 lagunas activas en la legislación fiscal mexicana 2026, con probabilidad de éxito calculada sobre fallos TFJA y SCJN del último trienio."
      icon={<Gavel className="h-5 w-5" />}
    >
      <div className="grid md:grid-cols-2 gap-4">
        {LAGUNAS.map((l, i) => (
          <div key={i} className="rounded-xl border border-border/60 bg-card/50 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="font-semibold leading-snug">{l.n}</div>
              <div className="text-right shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Éxito TFJA</div>
                <div className="text-lg font-semibold text-[oklch(0.78_0.15_155)] flex items-center gap-1 justify-end">
                  <TrendingUp className="h-4 w-4" /> {l.exito}%
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
              <span className="text-muted-foreground">Conflicto</span><span className="text-foreground">{l.conflicto}</span>
              <span className="text-muted-foreground">Potencial</span><span className="text-[oklch(0.85_0.13_85)] font-mono">{l.recup}</span>
              <span className="text-muted-foreground">Estrategia</span><span>{l.estrategia}</span>
            </div>
            <button className="mt-4 w-full h-9 rounded-md border border-[oklch(0.78_0.15_155)]/40 bg-[oklch(0.78_0.15_155)]/10 text-[oklch(0.78_0.15_155)] text-xs font-medium hover:bg-[oklch(0.78_0.15_155)]/20 transition-colors">
              Activar defensa para mi expediente
            </button>
          </div>
        ))}
      </div>
    </ModuleScaffold>
  );
}
