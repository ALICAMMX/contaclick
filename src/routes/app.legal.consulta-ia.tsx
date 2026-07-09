import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { consultarLey, type LeyCita } from "@/lib/leyes/leyes.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ScrollText, Scale, AlertTriangle } from "lucide-react";
import { RichMarkdown } from "@/components/RichMarkdown";
import { toast } from "sonner";

export const Route = createFileRoute("/app/legal/consulta-ia")({ component: ConsultaIA });

const EJEMPLOS = [
  "¿Cuándo un gasto es deducible para ISR de persona moral?",
  "¿Qué requisitos debe cumplir un CFDI para ser deducible?",
  "¿Cuál es el plazo para interponer recurso de revocación ante el SAT?",
  "¿Cuándo procede la compensación de saldos a favor de IVA?",
];

function ConsultaIA() {
  const consultar = useServerFn(consultarLey);
  const [pregunta, setPregunta] = useState("");
  const [loading, setLoading] = useState(false);
  const [respuesta, setRespuesta] = useState("");
  const [citas, setCitas] = useState<LeyCita[]>([]);

  async function preguntar(q?: string) {
    const text = (q ?? pregunta).trim();
    if (text.length < 3) return;
    setLoading(true);
    setRespuesta("");
    setCitas([]);
    try {
      const r = await consultar({ data: { pregunta: text } });
      if (r.error) toast.error(r.error);
      setRespuesta(r.respuesta ?? "");
      setCitas(r.citas ?? []);
    } catch {
      toast.error("No se pudo consultar. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "var(--module-legal)" }}>
          <Scale className="h-3 w-3" /> Inteligencia Legal
        </div>
        <h1 className="serif text-3xl">Consulta a la Ley (IA)</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Pregunta en lenguaje natural. La IA responde citando el artículo exacto del corpus fiscal indexado (CFF, LISR, LIVA, RMF).
        </p>
      </header>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <Textarea
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          placeholder="Ej: ¿Un cliente que pagó honorarios en efectivo por $8,000 puede deducirlos?"
          rows={3}
          className="resize-none"
        />
        <div className="flex flex-wrap gap-2">
          {EJEMPLOS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => { setPregunta(e); preguntar(e); }}
              className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-background hover:border-primary/40 text-muted-foreground hover:text-foreground transition"
            >
              {e}
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={() => preguntar()} disabled={loading || pregunta.trim().length < 3}>
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analizando…</> : "Consultar"}
          </Button>
        </div>
      </div>

      {respuesta && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <ScrollText className="h-3.5 w-3.5" /> Respuesta con fundamento
            </div>
            <RichMarkdown>{respuesta}</RichMarkdown>
            <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Esta respuesta se genera con IA sobre el corpus legal indexado. No constituye asesoría profesional; verifica el texto vigente en el DOF antes de actuar.</span>
            </div>
          </div>

          <aside className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground px-1">Artículos consultados ({citas.length})</div>
            {citas.map((c, i) => (
              <div key={c.articulo_id} className="rounded-lg border border-border bg-card p-3 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-foreground">
                    [{i + 1}] {c.ley_clave} · art. {c.numero}
                    {c.fraccion ? ` fracc. ${c.fraccion}` : ""}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{(c.similarity * 100).toFixed(0)}%</span>
                </div>
                <div className="text-muted-foreground line-clamp-4">{c.texto}</div>
              </div>
            ))}
          </aside>
        </div>
      )}
    </div>
  );
}
