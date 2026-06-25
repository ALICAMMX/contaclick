import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { Gavel, TrendingUp, ShieldCheck, ShieldAlert, Archive, Trash2, UserRound, AlertCircle, Plus, CheckCircle2, Clock, XCircle, FileArchive, ChevronDown, ChevronUp, Save } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCliente } from "@/lib/active-cliente";
import { listDefensas, createDefensa, updateDefensa, deleteDefensa } from "@/lib/defensa/lagunas.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/legal/lagunas")({ component: LagunasPage });

const LAGUNAS = [
  { n: "Materialidad de Operaciones", conflicto: "Art. 69-B CFF vs criterios TFJA sobre prueba indiciaria", recup: "$100K – $1M", exito: 87, estrategia: "Recurso de revocación con expediente de soporte (contratos, evidencia digital, logística)." },
  { n: "Devolución de IVA en periodo preoperativo", conflicto: "Art. 5 LIVA fracción VI vs criterio 4/IVA SCJN 2023", recup: "$50K – $500K", exito: 76, estrategia: "Solicitud de devolución con dictamen de inicio de actividades." },
  { n: "Acreditamiento de IVA en gastos no esenciales", conflicto: "Art. 5-I LIVA vs jurisprudencia 2a./J. 142/2020", recup: "$30K – $300K", exito: 68, estrategia: "Amparo indirecto con argumento de proporcionalidad tributaria." },
  { n: "Deducción de pagos al extranjero", conflicto: "Art. 27-V LISR vs tratados para evitar doble tributación", recup: "$80K – $1.5M", exito: 72, estrategia: "Aplicación directa de tratado + constancia de residencia." },
  { n: "Pérdidas fiscales por reestructura", conflicto: "Art. 58 LISR vs concepto de continuidad de empresa", recup: "$200K – $4M", exito: 64, estrategia: "Memo justificativo de razón de negocio + dictamen contable." },
  { n: "Subcontratación especializada (REPSE)", conflicto: "Reforma 2021 vs criterios STPS 2024", recup: "Evita multa $200K+", exito: 81, estrategia: "Actualización REPSE + contrato modelo SAT." },
  { n: "Deducción de gastos de representación", conflicto: "Art. 28-XX LISR vs gastos indispensables", recup: "$20K – $200K", exito: 55, estrategia: "Documentar carácter indispensable con actas de junta y contratos." },
  { n: "Acreditamiento IVA en activos fijos mixtos", conflicto: "Art. 5 LIVA vs uso exclusivo de activos", recup: "$50K – $800K", exito: 70, estrategia: "Cédula de identificación fiscal del activo y cálculo de proporcionalidad." },
];

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  activa: { label: "Activa", icon: <ShieldCheck className="h-3.5 w-3.5" />, color: "text-[oklch(0.78_0.15_155)]" },
  en_proceso: { label: "En proceso", icon: <Clock className="h-3.5 w-3.5" />, color: "text-[oklch(0.70_0.12_250)]" },
  resuelta_favorable: { label: "Resuelta favorable", icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: "text-[oklch(0.78_0.15_155)]" },
  resuelta_desfavorable: { label: "Resuelta desfavorable", icon: <XCircle className="h-3.5 w-3.5" />, color: "text-[oklch(0.72_0.22_25)]" },
  archivada: { label: "Archivada", icon: <FileArchive className="h-3.5 w-3.5" />, color: "text-muted-foreground" },
};

function LagunasPage() {
  const { cliente } = useActiveCliente();
  const qc = useQueryClient();
  const listFn = useServerFn(listDefensas);
  const createFn = useServerFn(createDefensa);
  const updateFn = useServerFn(updateDefensa);
  const deleteFn = useServerFn(deleteDefensa);

  const { data } = useQuery({
    queryKey: ["defensas", cliente?.id ?? "none"],
    queryFn: () => listFn({ data: { cliente_id: cliente?.id ?? undefined } }),
    enabled: !!cliente,
  });

  const defensas = data?.defensas ?? [];
  const defensaIds = new Set(defensas.map((d) => d.nombre));

  const createMut = useMutation({
    mutationFn: (payload: { nombre: string; conflicto: string; potencial: string; estrategia: string; exito: number }) =>
      createFn({ data: { cliente_id: cliente!.id, ...payload } }),
    onSuccess: () => {
      toast.success("Defensa activada");
      qc.invalidateQueries({ queryKey: ["defensas"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { id: string; estatus?: string; notas?: string }) => updateFn({ data: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defensas"] }),
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Defensa eliminada"); qc.invalidateQueries({ queryKey: ["defensas"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notasDraft, setNotasDraft] = useState<Record<string, string>>({});

  const kpis = {
    activas: defensas.filter((d) => d.estatus === "activa" || d.estatus === "en_proceso").length,
    resueltas: defensas.filter((d) => d.estatus === "resuelta_favorable").length,
    archivadas: defensas.filter((d) => d.estatus === "archivada" || d.estatus === "resuelta_desfavorable").length,
  };

  return (
    <ModuleScaffold
      title="Mapa de Lagunas Legales"
      subtitle="Detecta huecos normativos y conflictos entre LISR, LIVA y CFF. Activa defensas para tu expediente y da seguimiento."
      icon={<Gavel className="h-5 w-5" /
      actions={<HerramientaHelp slug="legal-lagunas" />}
    >}
      badge={null}
    >
      {!cliente ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-6 flex items-start gap-4">
          <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Selecciona un expediente para activar defensas</div>
            <p className="text-sm text-muted-foreground mt-1">Elige un RFC desde el selector de la barra superior.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-card/50 border border-border text-xs w-fit">
            <UserRound className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">{cliente.rfc}</span>
            <span className="text-muted-foreground">· {cliente.razon_social}</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border/60 bg-gradient-to-b from-card/70 to-card/30 p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Defensas activas</div>
              <div className="text-2xl font-semibold mt-1 text-[oklch(0.78_0.15_155)]">{kpis.activas}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-gradient-to-b from-card/70 to-card/30 p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Resueltas favorables</div>
              <div className="text-2xl font-semibold mt-1 text-[oklch(0.78_0.15_155)]">{kpis.resueltas}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-gradient-to-b from-card/70 to-card/30 p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Archivadas / desfavorables</div>
              <div className="text-2xl font-semibold mt-1 text-muted-foreground">{kpis.archivadas}</div>
            </div>
          </div>

          {/* Defensas activadas */}
          {defensas.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Defensas activadas para este expediente</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {defensas.map((d) => {
                  const expanded = expandedId === d.id;
                  const meta = STATUS_META[d.estatus] ?? STATUS_META.activa;
                  return (
                    <div key={d.id} className="rounded-xl border border-border/60 bg-card/50 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold leading-snug">{d.nombre}</div>
                        <div className={`text-right shrink-0 inline-flex items-center gap-1 text-xs font-medium ${meta.color}`}>
                          {meta.icon} {meta.label}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                        <span className="text-muted-foreground">Conflicto</span><span className="text-foreground">{d.conflicto}</span>
                        <span className="text-muted-foreground">Potencial</span><span className="text-[oklch(0.85_0.13_85)] font-mono">{d.potencial}</span>
                        <span className="text-muted-foreground">Estrategia</span><span>{d.estrategia}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Select
                          value={d.estatus}
                          onValueChange={(v) => updateMut.mutate({ id: d.id, estatus: v })}
                        >
                          <SelectTrigger className="h-8 text-xs w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_META).map(([k, v]) => (
                              <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setExpandedId(expanded ? null : d.id)}>
                          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Notas
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-destructive hover:text-destructive" onClick={() => deleteMut.mutate(d.id)} disabled={deleteMut.isPending}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {expanded && (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            className="text-xs min-h-[80px]"
                            placeholder="Agrega notas, fechas de audiencia, números de oficio..."
                            value={notasDraft[d.id] ?? d.notas ?? ""}
                            onChange={(e) => setNotasDraft((prev) => ({ ...prev, [d.id]: e.target.value }))}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-8"
                            onClick={() => updateMut.mutate({ id: d.id, notas: notasDraft[d.id] ?? "" })}
                            disabled={updateMut.isPending}
                          >
                            <Save className="h-3.5 w-3.5 mr-1" /> Guardar notas
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lagunas disponibles */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lagunas disponibles</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {LAGUNAS.map((l) => {
                const alreadyActive = defensaIds.has(l.n);
                return (
                  <div key={l.n} className={`rounded-xl border p-5 ${alreadyActive ? "border-[oklch(0.78_0.15_155)]/30 bg-[oklch(0.78_0.15_155)]/5" : "border-border/60 bg-card/50"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold leading-snug">{l.n}</div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Éxito TFJA</div>
                        <div className="text-lg font-semibold text-[oklch(0.78_0.15_155)] flex items-center gap-1 justify-end">
                          <TrendingUp className="h-4 w-4" /> {l.exito}%
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                      <span className="text-muted-foreground">Conflicto</span><span className="text-foreground">{l.conflicto}</span>
                      <span className="text-muted-foreground">Potencial</span><span className="text-[oklch(0.85_0.13_85)] font-mono">{l.recup}</span>
                      <span className="text-muted-foreground">Estrategia</span><span>{l.estrategia}</span>
                    </div>
                    <Button
                      size="sm"
                      className="mt-4 w-full h-9 text-xs font-medium"
                      variant={alreadyActive ? "outline" : "default"}
                      disabled={alreadyActive || createMut.isPending || !cliente}
                      onClick={() => createMut.mutate({
                        nombre: l.n,
                        conflicto: l.conflicto,
                        potencial: l.recup,
                        estrategia: l.estrategia,
                        exito: l.exito,
                      })}
                    >
                      {alreadyActive ? (
                        <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Activada</>
                      ) : (
                        <><ShieldAlert className="h-3.5 w-3.5 mr-1" /> Activar defensa</>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </ModuleScaffold>
  );
}
