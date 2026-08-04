import { AlertTriangle, BadgeCheck, ExternalLink, ShieldAlert } from "lucide-react";
import type { SelloNormativo } from "@/lib/fiscal/normativa/motor";

/** Sello de trazabilidad normativa que debe acompañar TODO resultado fiscal. */
export function NormativaBadge({ sello }: { sello: SelloNormativo }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-1.5 text-xs">
      <div className="flex items-center gap-2 text-foreground font-medium">
        <BadgeCheck className="h-4 w-4 text-success" />
        Ejercicio {sello.ejercicio} · versión {sello.version}
      </div>
      <div className="text-muted-foreground">
        <span className="font-medium text-foreground/80">Fuente:</span> {sello.fuente}
      </div>
      <div className="text-muted-foreground">Vigencia {sello.vigencia} · DOF {sello.publicacionDOF} · en vigor desde {sello.entradaVigor}</div>
      <div className="text-muted-foreground">Tabla verificada al {sello.actualizadoAl}</div>
      {sello.notas && <div className="text-muted-foreground italic">{sello.notas}</div>}
      <a
        href={sello.url}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 text-primary hover:underline"
      >
        Ver publicación oficial <ExternalLink className="h-3 w-3" />
      </a>
      <div className="pt-1.5 mt-1 border-t border-border/40 flex items-start gap-1.5 text-muted-foreground">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Cálculo <strong className="text-foreground/80">determinista</strong> (regla normativa, sin IA).
          Requiere revisión profesional antes de presentarse ante el SAT.
        </span>
      </div>
    </div>
  );
}

/** Bloqueo explicativo cuando no existe tabla vigente para el periodo. */
export function NormativaBloqueada({ mensaje }: { mensaje: string }) {
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-2 text-sm">
      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <div>
        <div className="font-medium text-destructive">Cálculo bloqueado</div>
        <p className="text-muted-foreground mt-1 leading-relaxed">{mensaje}</p>
      </div>
    </div>
  );
}
