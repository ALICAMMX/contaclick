import { createFileRoute } from "@tanstack/react-router";
import { FileBarChart, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/reportes")({
  component: Reportes,
});

const reportes = [
  { titulo: "Estado de resultados", desc: "Ingresos, costos y utilidad por periodo" },
  { titulo: "Flujo de efectivo", desc: "Movimientos bancarios consolidados" },
  { titulo: "Balance general", desc: "Posición financiera del cliente" },
  { titulo: "Reporte de IVA", desc: "Trasladado, acreditable y por pagar" },
  { titulo: "Reporte de ISR", desc: "Pagos provisionales y anual" },
  { titulo: "Diferencias detectadas", desc: "Bancos vs CFDI, con explicación IA" },
  { titulo: "Reporte mensual al cliente", desc: "Resumen ejecutivo en lenguaje claro" },
  { titulo: "Dashboard ejecutivo", desc: "PDF visual para junta directiva" },
];

function Reportes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Reportería</h1>
        <p className="text-muted-foreground text-sm mt-1">Genera reportes en PDF, Excel o CSV con un clic.</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportes.map((r) => (
          <div key={r.titulo} className="rounded-xl p-5 border border-border/60 bg-card/50 hover:border-primary/40 transition-all hover:-translate-y-0.5">
            <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center mb-3">
              <FileBarChart className="h-5 w-5" />
            </div>
            <h3 className="font-semibold">{r.titulo}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.desc}</p>
            <div className="flex gap-2 mt-4">
              <Button variant="glass" size="sm" className="flex-1"><Download className="h-3.5 w-3.5" /> PDF</Button>
              <Button variant="ghost" size="sm" className="flex-1">Excel</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
