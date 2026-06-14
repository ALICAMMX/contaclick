import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold, DemoCard } from "@/components/ModuleScaffold";
import { FileSignature, Check } from "lucide-react";

export const Route = createFileRoute("/app/legal/redactor")({ component: RedactorPage });

const STEPS = [
  { t: "1. Caso", d: "Selecciona la laguna o tipo de escrito (revocación, juicio contencioso, amparo, queja)." },
  { t: "2. Expediente", d: "La IA extrae datos del cliente, CFDI relevantes y oficios recibidos." },
  { t: "3. Borrador", d: "Genera escrito con fundamentos legales, jurisprudencia y precedentes TFJA." },
];

function RedactorPage() {
  return (
    <ModuleScaffold
      title="Redactor de Escritos"
      subtitle="Genera escritos de defensa en minutos con fundamento legal correcto. Tú revisas, firmas y presentas."
      icon={<FileSignature className="h-5 w-5" />}
    >
      <div className="grid md:grid-cols-3 gap-4">
        {STEPS.map((s, i) => (
          <div key={i} className="rounded-xl border border-border/60 bg-card/50 p-5">
            <div className="h-8 w-8 rounded-full bg-[oklch(0.78_0.15_155)]/15 text-[oklch(0.78_0.15_155)] grid place-items-center text-sm font-semibold">
              {i + 1}
            </div>
            <div className="font-medium mt-3">{s.t.replace(/^\d+\.\s/, "")}</div>
            <p className="text-xs text-muted-foreground mt-1">{s.d}</p>
          </div>
        ))}
      </div>

      <DemoCard title="Vista previa del borrador" className="mt-4">
        <div className="rounded-lg border border-border/40 bg-background/60 p-5 font-mono text-xs leading-relaxed">
          <div className="text-center text-foreground font-semibold mb-3">RECURSO DE REVOCACIÓN<br/>EXPEDIENTE: RR-2026/0148</div>
          <div className="text-foreground">C. ADMINISTRADOR DESCONCENTRADO JURÍDICO<br/>DEL SERVICIO DE ADMINISTRACIÓN TRIBUTARIA<br/>P R E S E N T E.</div>
          <div className="mt-3 text-muted-foreground">El que suscribe, representante legal de <span className="text-foreground">CONSTRUCTORA VEGA S.A. DE C.V.</span>, con RFC <span className="text-foreground">CVE2401151X9</span>, vengo por medio del presente a interponer RECURSO DE REVOCACIÓN en contra de la resolución contenida en el oficio <span className="text-foreground">500-72-00-04-2026-21458</span>, con fundamento en los artículos <span className="text-foreground">116, 117 y 121</span> del Código Fiscal de la Federación…</div>
          <div className="mt-4 text-[oklch(0.78_0.15_155)] flex items-center gap-2"><Check className="h-3 w-3" /> Fundamentos validados contra TFJA-2024-IV-P-1aS-145</div>
        </div>
      </DemoCard>
    </ModuleScaffold>
  );
}
