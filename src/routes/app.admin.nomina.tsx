import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold, KpiTile, DemoCard } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { Users, Sparkles } from "lucide-react";

export const Route = createFileRoute("/app/admin/nomina")({ component: NominaPage });

const EMP = [
  { n: "Ana López Hernández", p: "Contadora Sr.", sd: 1820, isr: 4280, imss: 1240, neto: 24560 },
  { n: "Roberto Méndez García", p: "Auditor", sd: 1640, isr: 3120, imss: 1080, neto: 21340 },
  { n: "Carla Ruiz Domínguez", p: "Analista Fiscal", sd: 980, isr: 1640, imss: 720, neto: 14820 },
  { n: "Jorge Salinas Vera", p: "Asistente", sd: 620, isr: 480, imss: 420, neto: 9180 },
  { n: "María Torres Aguilar", p: "Recepción", sd: 540, isr: 320, imss: 380, neto: 7920 },
];

function NominaPage() {
  return (
    <ModuleScaffold
      title="Nómina IA"
      subtitle="Cálculo automático de SDI, IMSS, ISR y subsidio al empleo. Genera prenómina, recibos timbrados y SUA con un clic."
      icon={<Users className="h-5 w-5" />}
      actions={<HerramientaHelp slug="admin-nomina" />}
      actions={
        <button className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-xs font-medium shadow-lg shadow-primary/30">
          <Sparkles className="h-3.5 w-3.5" /> Generar prenómina con IA
        </button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Empleados" value="32" accent="primary" />
        <KpiTile label="Nómina bruta" value="$612,840" hint="quincena actual" accent="gold" />
        <KpiTile label="Retenciones" value="$98,420" accent="warning" />
        <KpiTile label="Nómina neta" value="$514,420" accent="success" />
      </div>

      <DemoCard title="Empleados · primeros 5 de 32" className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <tr className="[&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                <th>Empleado</th><th>Puesto</th><th className="text-right">SDI</th><th className="text-right">ISR</th><th className="text-right">IMSS</th><th className="text-right">Neto quincena</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {EMP.map((e, i) => (
                <tr key={i} className="border-b border-border/30 [&>td]:py-2.5">
                  <td className="font-medium">{e.n}</td>
                  <td className="text-muted-foreground">{e.p}</td>
                  <td className="text-right font-mono">${e.sd.toLocaleString()}</td>
                  <td className="text-right font-mono text-amber-300">${e.isr.toLocaleString()}</td>
                  <td className="text-right font-mono text-amber-300">${e.imss.toLocaleString()}</td>
                  <td className="text-right font-mono text-emerald-300">${e.neto.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DemoCard>

      <div className="grid md:grid-cols-3 gap-3 mt-3">
        <DemoCard title="Próximas obligaciones">
          <ul className="space-y-2 text-xs">
            <li className="flex justify-between"><span>SUA Noviembre</span><span className="text-amber-300">en 5d</span></li>
            <li className="flex justify-between"><span>INFONAVIT Bimestre</span><span className="text-muted-foreground">en 18d</span></li>
            <li className="flex justify-between"><span>Aguinaldo</span><span className="text-muted-foreground">en 22d</span></li>
          </ul>
        </DemoCard>
        <DemoCard title="Detector de nómina oculta">
          <p className="text-xs text-muted-foreground">3 pagos recurrentes a personas físicas sin alta en IMSS detectados este trimestre.</p>
          <button className="mt-3 text-xs text-primary hover:underline">Revisar hallazgos →</button>
        </DemoCard>
        <DemoCard title="Cumplimiento SDI">
          <div className="text-2xl font-semibold text-emerald-300">100%</div>
          <p className="text-xs text-muted-foreground mt-1">Todos los SDI dentro de límites IMSS.</p>
        </DemoCard>
      </div>
    </ModuleScaffold>
  );
}
