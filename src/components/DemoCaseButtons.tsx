import { useAuth } from "@/lib/auth";
import { Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDemoCases } from "@/lib/demo/demo-cases";
import { DEMO_EMAIL } from "@/lib/demo/demo-account.functions";

type Props = {
  toolKey: string;
  onLoad: (payload: any, variant: "ok" | "riesgo") => void;
};

/**
 * Botones "Cargar caso demo" visibles solo para la cuenta demo.
 * Permiten ver qué arroja la herramienta con datos en regla vs en riesgo.
 */
export function DemoCaseButtons({ toolKey, onLoad }: Props) {
  const { user } = useAuth();
  const cases = getDemoCases(toolKey);
  if (!cases || user?.email !== DEMO_EMAIL) return null;

  const ok = cases.ok;
  const riesgo = cases.riesgo;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex flex-wrap items-center gap-2">
      <div className="text-xs font-medium text-primary mr-1 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5" /> Modo demo:
      </div>
      {ok && (
        <Button
          size="sm" variant="outline"
          onClick={() => onLoad(ok.payload, "ok")}
          title={ok.hint}
          className="h-8 text-xs gap-1.5"
        >
          <Sparkles className="h-3.5 w-3.5 text-emerald-500" /> {ok.label}
        </Button>
      )}
      {riesgo && (
        <Button
          size="sm" variant="outline"
          onClick={() => onLoad(riesgo.payload, "riesgo")}
          title={riesgo.hint}
          className="h-8 text-xs gap-1.5 border-destructive/40 hover:border-destructive"
        >
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> {riesgo.label}
        </Button>
      )}
    </div>
  );
}
