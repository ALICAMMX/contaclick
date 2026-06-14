import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold, KpiTile, DemoCard } from "@/components/ModuleScaffold";
import { TrendingUp } from "lucide-react";

export const Route = createFileRoute("/app/admin/tesoreria")({ component: TesPage });

const FLOW = [120, 145, 132, 168, 152, 180, 195, 178, 210, 198, 232, 220, 248, 260, 245, 278, 290, 305, 295, 320, 308, 340, 352, 338, 370, 385, 398, 412, 428, 445];
const CXC = [
  { cliente: "Constructora Vega SA", monto: 184200, vence: "en 3d", status: "warn" },
  { cliente: "Servicios Olmeca", monto: 96800, vence: "en 12d", status: "ok" },
  { cliente: "Distribuidora Norte", monto: 62400, vence: "vencido 4d", status: "danger" },
  { cliente: "Grupo Maya", monto: 240000, vence: "en 22d", status: "ok" },
];

function TesPage() {
  const max = Math.max(...FLOW);
  const path = FLOW.map((p, i) => `${i === 0 ? "M" : "L"} ${(i / (FLOW.length - 1)) * 100} ${100 - (p / max) * 90}`).join(" ");
  return (
    <ModuleScaffold
      title="Tesorería & Flujo de Caja"
      subtitle="Proyección 90 días basada en CFDI por cobrar, por pagar y nómina. La IA ajusta diariamente con la realidad bancaria."
      icon={<TrendingUp className="h-5 w-5" />}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Saldo bancos hoy" value="$1.24M" accent="primary" />
        <KpiTile label="Por cobrar 30d" value="$583K" accent="gold" />
        <KpiTile label="Por pagar 30d" value="$412K" accent="warning" />
        <KpiTile label="Flujo neto 90d" value="+$1.08M" accent="success" />
      </div>

      <DemoCard title="Proyección 30 días" className="mt-6">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-48">
          <defs>
            <linearGradient id="tg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.72 0.14 245)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="oklch(0.72 0.14 245)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L 100 100 L 0 100 Z`} fill="url(#tg)" />
          <path d={path} fill="none" stroke="oklch(0.78 0.13 85)" strokeWidth="1" />
        </svg>
      </DemoCard>

      <div className="grid md:grid-cols-2 gap-3 mt-3">
        <DemoCard title="Cuentas por cobrar · Top">
          <ul className="space-y-2 text-sm">
            {CXC.map((c, i) => {
              const tone = c.status === "danger" ? "text-red-300" : c.status === "warn" ? "text-amber-300" : "text-emerald-300";
              return (
                <li key={i} className="flex items-center justify-between text-xs">
                  <span className="truncate flex-1">{c.cliente}</span>
                  <span className="font-mono mr-3">${c.monto.toLocaleString()}</span>
                  <span className={`text-[10px] ${tone}`}>{c.vence}</span>
                </li>
              );
            })}
          </ul>
        </DemoCard>
        <DemoCard title="Recomendaciones de la IA">
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li>• Cobrar a Distribuidora Norte: vencido hace 4 días, $62K.</li>
            <li>• Diferir pago a proveedor "Insumos del Bajío" 3 días sin recargo.</li>
            <li>• Aprovechar descuento por pronto pago con "TecnoIndustrial" (2% si pagas hoy).</li>
          </ul>
        </DemoCard>
      </div>
    </ModuleScaffold>
  );
}
