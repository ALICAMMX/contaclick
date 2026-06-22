// Bloque reutilizable que muestra, para cualquier hallazgo:
//   - por qué se pinta de ese color (criterio semáforo)
//   - el fundamento legal vigente (artículos / reglas)
//   - la acción concreta sugerida
// Pensado para incrustarse dentro de tablas o tarjetas existentes.

import { useState } from "react";
import { ChevronDown, Scale, Lightbulb, ShieldCheck } from "lucide-react";
import {
  LEGISLACION_VERIFICADA_AL,
  type FindingMeta,
  type RiskLevel,
  type Severidad,
  formatLegal,
  whyForLevel,
} from "@/lib/legal/referencias";

type Props = {
  level: RiskLevel | Severidad;
  meta?: FindingMeta;
  /** Si no quieres usar el catálogo, pasa los textos directo. */
  why?: string;
  /** Fundamento ya pre-formateado (cuando el dato vive en la BD). */
  legalText?: string;
  action?: string;
  /** Compacto: sin botón "Por qué", siempre expandido. */
  open?: boolean;
};

const levelDot: Record<string, string> = {
  alto: "bg-rose-400",
  alta: "bg-rose-400",
  medio: "bg-amber-400",
  media: "bg-amber-400",
  bajo: "bg-blue-400",
  baja: "bg-blue-400",
  ok: "bg-emerald-400",
};

export function FindingExplain({ level, meta, why, legalText, action, open }: Props) {
  const [expanded, setExpanded] = useState(!!open);
  const finalWhy = why ?? meta?.why ?? whyForLevel(level);
  const finalLegal = legalText ?? (meta?.legal ? formatLegal(meta.legal) : undefined);
  const finalAction = action ?? meta?.action;
  const colorReason = whyForLevel(level);

  return (
    <div className="mt-1.5 text-xs">
      {!open && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${levelDot[level] ?? "bg-muted-foreground"}`} />
          <span>¿Por qué este color?</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}

      {expanded && (
        <div className="mt-2 space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex gap-2">
            <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${levelDot[level] ?? "bg-muted-foreground"}`} />
            <div>
              <div className="font-medium text-foreground">Criterio del semáforo</div>
              <div className="text-muted-foreground">{colorReason}</div>
              {finalWhy && finalWhy !== colorReason && (
                <div className="text-muted-foreground mt-1">{finalWhy}</div>
              )}
            </div>
          </div>

          {finalLegal && (
            <div className="flex gap-2">
              <Scale className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <div>
                <div className="font-medium text-foreground">Fundamento legal vigente</div>
                <div className="text-muted-foreground">{finalLegal}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                  Verificado al {LEGISLACION_VERIFICADA_AL}
                </div>
              </div>
            </div>
          )}

          {finalAction && (
            <div className="flex gap-2">
              <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
              <div>
                <div className="font-medium text-foreground">Acción recomendada</div>
                <div className="text-muted-foreground">{finalAction}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Pie de página breve indicando la legislación contra la que se evaluó. */
export function LegalFooter({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-[11px] text-muted-foreground ${className ?? ""}`}>
      <ShieldCheck className="h-3 w-3" />
      Evaluado contra legislación fiscal mexicana vigente al {LEGISLACION_VERIFICADA_AL}
      (CFF, LISR, LIVA, RMF y Anexo 20).
    </div>
  );
}
