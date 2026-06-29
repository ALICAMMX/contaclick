import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Sparkles, Plus, Trash2, Calculator, ShieldAlert } from "lucide-react";
import { ModuleScaffold, KpiTile, DemoCard } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useActiveCliente } from "@/lib/active-cliente";
import { auditarNomina, simularCostoPatronal, listarSimulaciones } from "@/lib/nomina/nomina.functions";

export const Route = createFileRoute("/app/admin/nomina")({ component: NominaPage });

const MXN = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

function NominaPage() {
  const { cliente: activeCliente } = useActiveCliente();

  return (
    <ModuleScaffold
      title="Nómina · Auditor + Simulador"
      subtitle="No timbra ni sustituye a NOI/CONTPAQi Nóminas. Audita CFDI de nómina ya emitidos y simula el costo patronal total (IMSS, INFONAVIT, ISN, provisiones)."
      icon={<Users className="h-5 w-5" />}
      badge={null}
      actions={<HerramientaHelp slug="admin-nomina" />}
    >
      {!activeCliente ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Selecciona un expediente activo para usar este módulo.
        </Card>
      ) : (
        <Tabs defaultValue="auditor" className="mt-2">
          <TabsList>
            <TabsTrigger value="auditor"><ShieldAlert className="h-4 w-4 mr-1" />Auditor</TabsTrigger>
            <TabsTrigger value="simulador"><Calculator className="h-4 w-4 mr-1" />Simulador costo patronal</TabsTrigger>
          </TabsList>
          <TabsContent value="auditor" className="mt-4"><AuditorTab clienteId={activeCliente.id} /></TabsContent>
          <TabsContent value="simulador" className="mt-4"><SimuladorTab clienteId={activeCliente.id} /></TabsContent>
        </Tabs>
      )}
    </ModuleScaffold>
  );
}

function AuditorTab({ clienteId }: { clienteId: string }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const fn = useServerFn(auditarNomina);
  const m = useMutation({
    mutationFn: () => fn({ data: { cliente_id: clienteId, year } }),
    onError: (e: any) => toast.error(e.message),
  });

  const r = m.data;
  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div>
          <Label>Año fiscal</Label>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} className="w-28" />
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          <Sparkles className="h-4 w-4 mr-1" /> {m.isPending ? "Auditando…" : "Auditar nómina"}
        </Button>
      </Card>

      {r && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile label="CFDI revisados" value={String(r.cfdi_revisados)} accent="primary" />
            <KpiTile label="Empleados únicos" value={String(r.empleados_unicos)} accent="gold" />
            <KpiTile label="Nómina total" value={MXN(r.total_nomina)} accent="success" />
            <KpiTile label="Hallazgos" value={String(r.findings.length)} accent={r.findings.length > 0 ? "warning" : "success"} />
          </div>

          <DemoCard title="Top empleados por monto">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <tr className="[&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                    <th>Empleado</th><th className="text-right">CFDI</th><th className="text-right">Total nómina</th><th className="text-right">ISR retenido</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {r.ranking.map((e: any, i: number) => (
                    <tr key={i} className="border-b border-border/30 [&>td]:py-2">
                      <td className="font-medium">{e.nombre}</td>
                      <td className="text-right font-mono">{e.cfdi}</td>
                      <td className="text-right font-mono">{MXN(e.total)}</td>
                      <td className="text-right font-mono text-amber-300">{MXN(e.isr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DemoCard>

          {r.findings.length > 0 && (
            <DemoCard title={`Hallazgos (${r.findings.length})`}>
              <div className="space-y-2 max-h-[400px] overflow-auto">
                {r.findings.slice(0, 50).map((f: any, i: number) => (
                  <div key={i} className="rounded border border-border/40 p-3 bg-card/40">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">{f.titulo}</div>
                      <Badge className={f.severidad === "alta" ? "bg-red-500/20 text-red-300" : f.severidad === "media" ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300"}>{f.severidad}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{f.empleado} · {f.fecha} · {MXN(f.total)}</div>
                    <div className="text-xs mt-1">{f.detalle}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{f.fundamento}</div>
                  </div>
                ))}
              </div>
            </DemoCard>
          )}
        </>
      )}
    </div>
  );
}

type EmpRow = { etiqueta: string; sd_diario: number; dias_periodo: number };

function SimuladorTab({ clienteId }: { clienteId: string }) {
  const [nombre, setNombre] = useState("Simulación " + new Date().toLocaleDateString("es-MX"));
  const [emps, setEmps] = useState<EmpRow[]>([
    { etiqueta: "Gerente", sd_diario: 1500, dias_periodo: 30 },
    { etiqueta: "Operador", sd_diario: 450, dias_periodo: 30 },
  ]);
  const [fi, setFi] = useState(1.0452);
  const [isn, setIsn] = useState(0.03);
  const fnSim = useServerFn(simularCostoPatronal);
  const fnList = useServerFn(listarSimulaciones);

  const sims = useQuery({ queryKey: ["nom-sim", clienteId], queryFn: () => fnList({ data: { cliente_id: clienteId } }) });

  const m = useMutation({
    mutationFn: () => fnSim({ data: { cliente_id: clienteId, nombre, empleados: emps, factor_integracion: fi, tasa_isn_estatal: isn } }),
    onSuccess: () => { toast.success("Simulación calculada"); sims.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const r = m.data;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><Label>Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div><Label>Factor de integración SDI</Label><Input type="number" step="0.0001" value={fi} onChange={(e) => setFi(Number(e.target.value) || 1.0452)} /></div>
          <div><Label>Tasa ISN estatal</Label><Input type="number" step="0.001" value={isn} onChange={(e) => setIsn(Number(e.target.value) || 0.03)} /></div>
        </div>

        <div className="rounded border overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
              <tr className="[&>th]:py-2 [&>th]:px-2 [&>th]:text-left">
                <th>Etiqueta</th><th>Salario diario</th><th>Días en período</th><th></th>
              </tr>
            </thead>
            <tbody>
              {emps.map((e, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="px-1 py-1"><Input value={e.etiqueta} onChange={(ev) => setEmps(emps.map((x, j) => j === i ? { ...x, etiqueta: ev.target.value } : x))} /></td>
                  <td className="px-1 py-1"><Input type="number" value={e.sd_diario} onChange={(ev) => setEmps(emps.map((x, j) => j === i ? { ...x, sd_diario: Number(ev.target.value) || 0 } : x))} /></td>
                  <td className="px-1 py-1"><Input type="number" value={e.dias_periodo} onChange={(ev) => setEmps(emps.map((x, j) => j === i ? { ...x, dias_periodo: Number(ev.target.value) || 30 } : x))} /></td>
                  <td className="px-1 py-1"><Button size="sm" variant="ghost" onClick={() => setEmps(emps.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEmps([...emps, { etiqueta: "Nuevo", sd_diario: 500, dias_periodo: 30 }])}>
            <Plus className="h-4 w-4 mr-1" /> Agregar empleado
          </Button>
          <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
            <Calculator className="h-4 w-4 mr-1" /> {m.isPending ? "Calculando…" : "Calcular costo patronal"}
          </Button>
        </div>
      </Card>

      {r && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile label="Nómina base" value={MXN(r.nomina_base)} accent="primary" />
            <KpiTile label="IMSS patrón" value={MXN(r.imss_patron)} accent="warning" />
            <KpiTile label="INFONAVIT" value={MXN(r.infonavit)} accent="warning" />
            <KpiTile label="ISN estatal" value={MXN(r.isn_estatal)} accent="warning" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile label="Prov. aguinaldo" value={MXN(r.prov_aguinaldo)} accent="gold" />
            <KpiTile label="Prov. vacaciones" value={MXN(r.prov_vacaciones)} accent="gold" />
            <KpiTile label="Prov. PTU" value={MXN(r.prov_ptu)} accent="gold" />
            <KpiTile label="Costo total" value={MXN(r.costo_patronal_total)} accent="success" hint={`Factor ${(r.factor_costo * 100).toFixed(1)}% sobre nómina base`} />
          </div>
          <DemoCard title="Detalle por empleado">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                  <tr className="[&>th]:py-2 [&>th]:text-left">
                    <th>Etiqueta</th><th className="text-right">SD</th><th className="text-right">SDI</th><th className="text-right">Base</th><th className="text-right">IMSS</th><th className="text-right">INFONAVIT</th><th className="text-right">ISN</th><th className="text-right">Costo total</th>
                  </tr>
                </thead>
                <tbody>
                  {r.detalle.map((d: any, i: number) => (
                    <tr key={i} className="border-b border-border/30 [&>td]:py-1.5">
                      <td>{d.etiqueta}</td>
                      <td className="text-right font-mono">{MXN(d.sd_diario)}</td>
                      <td className="text-right font-mono">{MXN(d.sdi)}</td>
                      <td className="text-right font-mono">{MXN(d.nomina_base)}</td>
                      <td className="text-right font-mono text-amber-300">{MXN(d.imss_patron)}</td>
                      <td className="text-right font-mono text-amber-300">{MXN(d.infonavit)}</td>
                      <td className="text-right font-mono text-amber-300">{MXN(d.isn)}</td>
                      <td className="text-right font-mono text-emerald-300 font-semibold">{MXN(d.costo_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DemoCard>
          <p className="text-[10px] text-muted-foreground">
            Tasas aproximadas 2026: IMSS patrón ~10.05%, INFONAVIT 5%, RCV incluido. ISN según entidad. SDI = SD × Factor (mínimo legal 1.0452).
            Verifica con tu prima de riesgo de trabajo y tasa ISN real.
          </p>
        </>
      )}

      {(sims.data ?? []).length > 0 && (
        <DemoCard title="Historial de simulaciones">
          <ul className="text-xs divide-y divide-border/30">
            {(sims.data ?? []).map((s: any) => (
              <li key={s.id} className="py-2 flex items-center justify-between gap-2">
                <span>{s.nombre}</span>
                <span className="text-muted-foreground">{new Date(s.created_at).toLocaleString("es-MX")}</span>
                <span className="font-mono text-emerald-300">{MXN(s.resultado?.costo_patronal_total ?? 0)}</span>
              </li>
            ))}
          </ul>
        </DemoCard>
      )}
    </div>
  );
}
