import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { HelpCircle, BookOpen, Lightbulb, Workflow, ArrowRight, Clock, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getHelp } from "@/lib/help/registry";

/**
 * Botón flotante "?" que abre un Dialog con 3 pestañas de ayuda contextual
 * para una herramienta concreta. Uso:
 *
 *   <HerramientaHelp slug="salud-fiscal" />
 *
 * El contenido vive en src/lib/help/registry.ts indexado por slug.
 */
export function HerramientaHelp({
  slug,
  variant = "outline",
  size = "sm",
  label,
}: {
  slug: string;
  variant?: "outline" | "ghost" | "secondary";
  size?: "sm" | "icon" | "default";
  /** Texto opcional junto al icono. Por defecto: "Ayuda" en size="sm". */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const help = getHelp(slug);

  if (!help) {
    // Fail-soft: si el slug no existe en el registro, no rompemos la pantalla.
    if (typeof window !== "undefined") {
      console.warn(`[HerramientaHelp] slug no registrado: "${slug}"`);
    }
    return null;
  }

  const showLabel = size !== "icon" && (label ?? "Ayuda");

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        aria-label={`Ayuda de ${help.title}`}
        title={`Cómo usar ${help.title}`}
      >
        <HelpCircle className={size === "icon" ? "h-4 w-4" : "h-4 w-4 mr-1.5"} />
        {showLabel && <span>{showLabel}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-6 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <HelpCircle className="h-5 w-5 text-primary" />
              {help.title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed pt-1">
              {help.queHace}
            </DialogDescription>
            {help.cuandoUsar && (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2 mt-2 flex items-start gap-2">
                <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                <span><strong className="font-medium text-foreground">Cuándo usarla: </strong>{help.cuandoUsar}</span>
              </div>
            )}
          </DialogHeader>

          <Tabs defaultValue="tutorial" className="flex flex-col flex-1 min-h-0">
            <TabsList className="mx-6 mt-3 grid grid-cols-3 w-auto shrink-0">
              <TabsTrigger value="tutorial" className="gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> Tutorial
              </TabsTrigger>
              <TabsTrigger value="resultados" className="gap-1.5">
                <Lightbulb className="h-3.5 w-3.5" /> Funciones y resultados
              </TabsTrigger>
              <TabsTrigger value="dependencias" className="gap-1.5">
                <Workflow className="h-3.5 w-3.5" /> Dependencias
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 max-h-[55vh]">
              <div className="p-6 pt-4">
                {/* TUTORIAL */}
                <TabsContent value="tutorial" className="mt-0 space-y-3">
                  <ol className="space-y-3">
                    {help.tutorial.map((p) => (
                      <li key={p.n} className="flex gap-3">
                        <div className="shrink-0 h-7 w-7 rounded-full bg-primary/15 border border-primary/30 text-primary text-xs font-semibold grid place-items-center">
                          {p.n}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{p.titulo}</div>
                          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{p.detalle}</p>
                          {p.tip && (
                            <div className="mt-2 text-xs rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300 p-2 flex gap-1.5">
                              <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span><strong>Tip:</strong> {p.tip}</span>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                  {help.costos && (
                    <div className="mt-4 text-xs rounded-md border border-border bg-card/50 p-3 flex gap-2">
                      <Coins className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium text-foreground">Consumo de créditos / costos</div>
                        <div className="text-muted-foreground mt-0.5">{help.costos}</div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* RESULTADOS */}
                <TabsContent value="resultados" className="mt-0 space-y-2.5">
                  {help.resultados.map((r, i) => (
                    <div key={i} className="rounded-lg border border-border bg-card/40 p-3">
                      <div className="font-medium text-sm">{r.campo}</div>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{r.significado}</p>
                      {r.rango && (
                        <div className="mt-2 text-xs font-mono bg-muted/40 rounded px-2 py-1 inline-block">
                          {r.rango}
                        </div>
                      )}
                    </div>
                  ))}
                </TabsContent>

                {/* DEPENDENCIAS */}
                <TabsContent value="dependencias" className="mt-0 space-y-4">
                  <section>
                    <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Necesitas tener cargado antes
                    </h3>
                    {help.dependencias.necesita.length === 0 ? (
                      <div className="text-sm text-muted-foreground italic">Sin dependencias previas — funciona de forma independiente.</div>
                    ) : (
                      <div className="space-y-2">
                        {help.dependencias.necesita.map((d, i) => (
                          <DependencyRow key={i} d={d} />
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Esta herramienta alimenta a
                    </h3>
                    {help.dependencias.alimenta.length === 0 ? (
                      <div className="text-sm text-muted-foreground italic">Resultados solo se consultan aquí.</div>
                    ) : (
                      <div className="space-y-2">
                        {help.dependencias.alimenta.map((d, i) => (
                          <DependencyRow key={i} d={d} />
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Datos mínimos requeridos</h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {help.dependencias.datosMinimos.map((d, i) => (
                        <li key={i} className="flex gap-2"><span className="text-primary">·</span>{d}</li>
                      ))}
                    </ul>
                  </section>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DependencyRow({ d }: { d: { tool: string; ruta?: string; motivo: string } }) {
  const content = (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-card/40 p-3 hover:bg-card transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {d.tool}
          {d.ruta && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{d.motivo}</div>
      </div>
    </div>
  );
  return d.ruta ? <Link to={d.ruta} className="block">{content}</Link> : content;
}
