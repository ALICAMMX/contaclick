import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold, KpiTile, DemoCard } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { Boxes } from "lucide-react";

export const Route = createFileRoute("/app/admin/inventarios")({ component: InvPage });

const ITEMS = [
  { sku: "MAT-0021", desc: "Resina industrial grado A", e: 1240, s: 980, exist: 260, costo: 184, valor: 47840 },
  { sku: "MAT-0035", desc: "Empaque corrugado 30x40", e: 5400, s: 4980, exist: 420, costo: 12, valor: 5040 },
  { sku: "REF-0102", desc: "Refacción válvula 1/2\"", e: 320, s: 280, exist: 40, costo: 645, valor: 25800 },
  { sku: "INS-0044", desc: "Insumo limpieza industrial", e: 180, s: 162, exist: 18, costo: 380, valor: 6840 },
];

function InvPage() {
  return (
    <ModuleScaffold
      title="Inventarios"
      subtitle="Kardex derivado automáticamente de tus CFDI emitidos y recibidos. Sin captura, sin doble registro."
      icon={<Boxes className="h-5 w-5" />}
      actions={<HerramientaHelp slug="admin-inventarios" />}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="SKUs activos" value="184" accent="primary" />
        <KpiTile label="Valor inventario" value="$418K" accent="gold" />
        <KpiTile label="Rotación promedio" value="42d" accent="success" />
        <KpiTile label="Stock bajo mínimos" value="6" accent="warning" />
      </div>

      <DemoCard title="Kardex generado desde CFDI · últimos 30d" className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <tr className="[&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                <th>SKU</th><th>Descripción</th><th className="text-right">Entradas</th><th className="text-right">Salidas</th><th className="text-right">Existencia</th><th className="text-right">Costo</th><th className="text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {ITEMS.map((i) => (
                <tr key={i.sku} className="border-b border-border/30 [&>td]:py-2.5">
                  <td className="font-mono text-primary">{i.sku}</td>
                  <td>{i.desc}</td>
                  <td className="text-right font-mono text-emerald-300">+{i.e}</td>
                  <td className="text-right font-mono text-amber-300">−{i.s}</td>
                  <td className="text-right font-mono">{i.exist}</td>
                  <td className="text-right font-mono text-muted-foreground">${i.costo}</td>
                  <td className="text-right font-mono">${i.valor.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DemoCard>
    </ModuleScaffold>
  );
}
