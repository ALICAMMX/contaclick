import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold, KpiTile } from "@/components/ModuleScaffold";
import { Mail, AlertTriangle, Sparkles } from "lucide-react";

export const Route = createFileRoute("/app/admin/buzon")({ component: BuzonPage });

const MAILS = [
  { from: "SAT · Administración Central", subject: "Invitación a regularizar IVA Q3", date: "Hoy 09:24", urgent: true, summary: "El SAT detectó diferencia de $42,310 entre IVA acreditable declarado y CFDI recibidos. Plazo: 15 días naturales." },
  { from: "SAT · Verificación de domicilio", subject: "Confirmación de domicilio fiscal", date: "Ayer 16:08", urgent: false, summary: "Solicitan acuse de domicilio. La IA preparó respuesta con CSF actualizada y comprobante reciente." },
  { from: "IMSS", subject: "Recordatorio SUA Noviembre", date: "Hace 3 días", urgent: false, summary: "Recordatorio de envío SUA antes del día 17. Tu pre-SUA ya está listo." },
  { from: "SAT · Devoluciones", subject: "Avance de devolución folio 23818", date: "Hace 5 días", urgent: false, summary: "Devolución en revisión documental. ETA estimada: 12 días hábiles." },
];

function BuzonPage() {
  return (
    <ModuleScaffold
      title="Lector de Buzón Tributario"
      subtitle="La IA lee cada notificación del SAT, IMSS e INFONAVIT, las interpreta, prepara borrador de respuesta y arranca el reloj del plazo legal."
      icon={<Mail className="h-5 w-5" />}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Notificaciones 30d" value="14" accent="primary" />
        <KpiTile label="Requieren acción" value="3" accent="warning" />
        <KpiTile label="Vencidos" value="0" accent="success" />
        <KpiTile label="Borradores IA listos" value="2" accent="gold" />
      </div>

      <div className="grid md:grid-cols-[1.2fr_1fr] gap-4 mt-6">
        <div className="rounded-xl border border-border/60 bg-card/50 divide-y divide-border/40">
          {MAILS.map((m, i) => (
            <div key={i} className="p-4 hover:bg-card/80 transition-colors cursor-pointer">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span>{m.from}</span>
                <span>{m.date}</span>
              </div>
              <div className="flex items-start gap-2">
                {m.urgent && <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <div className="text-sm font-medium">{m.subject}</div>
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.summary}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl glass-gold p-5 self-start">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-[oklch(0.85_0.13_85)]" /> Análisis IA del primer mensaje
          </div>
          <div className="mt-4 space-y-3 text-xs">
            <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Riesgo legal</div><div className="text-sm text-amber-300 font-semibold mt-0.5">Medio · invitación previa</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Plazo</div><div className="text-sm mt-0.5">15 días naturales · vence 28-nov</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Acción recomendada</div><div className="text-sm mt-0.5">Presentar complementaria de IVA Q3 con ajuste de $42,310 antes del 25-nov para evitar facultades de comprobación.</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Defensa alterna</div><div className="text-sm mt-0.5">Si la diferencia es por CFDI cancelados fuera de mes, aplica criterio TFJA 2024/IV-P-1aS-145.</div></div>
            <button className="mt-3 w-full h-9 rounded-md bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-xs font-medium">Generar respuesta con IA</button>
          </div>
        </div>
      </div>
    </ModuleScaffold>
  );
}
