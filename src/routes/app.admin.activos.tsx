import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold, KpiTile, DemoCard } from "@/components/ModuleScaffold";
import { Building } from "lucide-react";

export const Route = createFileRoute("/app/admin/activos")({ component: ActivosPage });

const ACT = [
  { n: "Equipo de cómputo Dell", t: "Cómputo", moi: 184000, fecha: "2024-03-10", pct: 30, dep: 23400, vl: 160600 },
  { n: "Camioneta Nissan NP300", t: "Transporte", moi: 412000, fecha: "2023-11-22", pct: 25, dep: 86250, vl: 325750 },
  { n: "Mobiliario oficina", t: "Mobiliario", moi: 96000, fecha: "2022-06-01", pct: 10, dep: 24000, vl: 72000 },
  { n: "Aire acondicionado", t: "Instalaciones", moi: 58000, fecha: "2024-01-15", pct: 10, dep: 5320, vl: 52680 },
  { n: "Servidor Synology", t: "Cómputo", moi: 72000, fecha: "2025-04-08", pct: 30, dep: 14400, vl: 57600 },
];

function ActivosPage() {
  const total = ACT.reduce((a, b) => a + b.moi, 0);
  const dep = ACT.reduce((a, b) => a + b.dep, 0);
  return (
    <ModuleScaffold
      title="Activos Fijos"
      subtitle="Depreciación fiscal y contable automática a partir de tus CFDI de compra. La IA clasifica cada activo y aplica el porcentaje correcto según la LISR."
      icon={<Building className="h-5 w-5" />}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Activos registrados" value="47" accent="primary" />
        <KpiTile label="MOI total" value={`$${(total / 1000).toFixed(0)}K`} accent="gold" />
        <KpiTile label="Depreciación acumulada" value={`$${(dep / 1000).toFixed(0)}K`} accent="warning" />
        <KpiTile label="Valor en libros" value={`$${((total - dep) / 1000).toFixed(0)}K`} accent="success" />
      </div>

      <DemoCard title="Catálogo · primeros 5 activos" className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <tr className="[&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                <th>Activo</th><th>Tipo</th><th>Adquisición</th><th className="text-right">MOI</th><th className="text-right">%</th><th className="text-right">Depreciación</th><th className="text-right">Valor en libros</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {ACT.map((a, i) => (
                <tr key={i} className="border-b border-border/30 [&>td]:py-2.5">
                  <td className="font-medium">{a.n}</td>
                  <td className="text-muted-foreground">{a.t}</td>
                  <td className="font-mono text-muted-foreground">{a.fecha}</td>
                  <td className="text-right font-mono">${a.moi.toLocaleString()}</td>
                  <td className="text-right font-mono">{a.pct}%</td>
                  <td className="text-right font-mono text-amber-300">${a.dep.toLocaleString()}</td>
                  <td className="text-right font-mono text-emerald-300">${a.vl.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DemoCard>
    </ModuleScaffold>
  );
}
