import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen, Wand2, CheckCircle2, XCircle, AlertTriangle, Download, Upload, ListChecks, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { useActiveCliente } from "@/lib/active-cliente";
import { triggerFileDownload } from "@/lib/download";
import {
  listarPolizasCanonicas,
  generarBorradoresCanonicos,
  aprobarPoliza,
  rechazarPoliza,
  loteExportable,
} from "@/lib/polizas/polizas.functions";
import { CatalogoPanel } from "@/components/polizas/CatalogoPanel";
import { ReglasConceptoPanel } from "@/components/polizas/ReglasConceptoPanel";

export const Route = createFileRoute("/app/polizas")({
  head: () => ({
    meta: [
      { title: "Pólizas contables | ContaClick" },
      { name: "description", content: "Genera, revisa y aprueba pólizas contables canónicas por periodo, con catálogo del contador y reglas por concepto." },
      { property: "og:title", content: "Pólizas contables | ContaClick" },
      { property: "og:description", content: "Genera, revisa y aprueba pólizas contables canónicas por periodo, con catálogo del contador y reglas por concepto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PolizasPage,
});

const mxn = (centavos: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(centavos || 0) / 100);

function periodoActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function PolizasPage() {
  const { cliente } = useActiveCliente();
  const clienteId = cliente?.id ?? "";
  const qc = useQueryClient();
  const [periodo, setPeriodo] = useState(periodoActual());
  const [abierta, setAbierta] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const listFn = useServerFn(listarPolizasCanonicas);
  const generarFn = useServerFn(generarBorradoresCanonicos);
  const aprobarFn = useServerFn(aprobarPoliza);
  const rechazarFn = useServerFn(rechazarPoliza);
  const exportFn = useServerFn(loteExportable);

  const lista = useQuery({
    queryKey: ["polizas-canonicas", clienteId, periodo],
    queryFn: () => listFn({ data: { cliente_id: clienteId, periodo, limit: 300 } }),
    enabled: Boolean(clienteId),
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["polizas-canonicas", clienteId, periodo] });
    qc.invalidateQueries({ queryKey: ["conceptos-pendientes", clienteId, periodo] });
  };

  const generar = useMutation({
    mutationFn: () => generarFn({ data: { cliente_id: clienteId, periodo } }),
    onSuccess: (r: any) => {
      refrescar();
      if (r.cuentas_faltantes?.length) {
        toast.warning(`Faltan cuentas de sistema en el catálogo: ${r.cuentas_faltantes.join(", ")}.`);
      }
      toast.success(`${r.generadas} pólizas en borrador · ${r.bloqueadas} bloqueadas de ${r.revisados} CFDI revisados.`);
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo generar."),
  });

  const decidir = useMutation({
    mutationFn: async (v: { id: string; accion: "aprobar" | "rechazar" }) => {
      if (motivo.trim().length < 10) throw new Error("Escribe un motivo de al menos 10 caracteres.");
      const args = { data: { cliente_id: clienteId, poliza_id: v.id, motivo: motivo.trim() } };
      return v.accion === "aprobar" ? aprobarFn(args) : rechazarFn(args);
    },
    onSuccess: () => {
      setMotivo("");
      setAbierta(null);
      refrescar();
      toast.success("Decisión registrada en la bitácora.");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo registrar la decisión."),
  });

  const exportar = useMutation({
    mutationFn: () => exportFn({ data: { cliente_id: clienteId, periodo } }),
    onSuccess: (lote: any) => {
      if (!lote.polizas.length) return toast.error("No hay pólizas aprobadas en el periodo.");
      triggerFileDownload(
        new Blob([JSON.stringify(lote, null, 2)], { type: "application/json" }),
        `polizas-canonicas-${lote.rfc}-${periodo}.json`,
      );
      if (lote.advertencias.length) toast.warning(`Se exportó con ${lote.advertencias.length} advertencias.`);
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo exportar."),
  });

  const resumen = lista.data?.resumen;
  const polizas = useMemo(() => lista.data?.polizas ?? [], [lista.data]);

  if (!clienteId) {
    return (
      <div className="p-6">
        <Card className="p-6 text-sm text-muted-foreground">
          Selecciona un expediente activo para trabajar sus pólizas.
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> Pólizas contables
          </h1>
          <p className="text-sm text-muted-foreground">
            Fuente única: renglones canónicos en centavos. Ninguna póliza se aprueba sola.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Periodo</Label>
            <Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-40" />
          </div>
          <HerramientaHelp herramienta="polizas" />
        </div>
      </div>

      <Tabs defaultValue="polizas">
        <TabsList>
          <TabsTrigger value="polizas">Pólizas del periodo</TabsTrigger>
          <TabsTrigger value="conceptos">Reglas por concepto</TabsTrigger>
          <TabsTrigger value="catalogo">Catálogo de cuentas</TabsTrigger>
        </TabsList>

        <TabsContent value="polizas" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              ["Borradores", resumen?.borradores ?? 0],
              ["Listas para aprobar", resumen?.por_revisar ?? 0],
              ["Bloqueadas", resumen?.bloqueadas ?? 0],
              ["Aprobadas", resumen?.aprobadas ?? 0],
              ["Conceptos sin cuenta", resumen?.conceptos_sin_resolver ?? 0],
            ].map(([k, v]) => (
              <Card key={String(k)} className="p-3">
                <div className="text-xs text-muted-foreground">{k}</div>
                <div className="text-2xl font-semibold">{String(v)}</div>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => generar.mutate()} disabled={generar.isPending}>
              {generar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Generar borradores del periodo
            </Button>
            <Button variant="outline" onClick={() => exportar.mutate()} disabled={exportar.isPending}>
              <Download className="h-4 w-4" /> Exportar aprobadas (contrato canónico)
            </Button>
          </div>

          {lista.isLoading && <Card className="p-6 text-sm text-muted-foreground">Cargando pólizas…</Card>}
          {!lista.isLoading && !polizas.length && (
            <Card className="p-6 text-sm text-muted-foreground">
              Sin pólizas en {periodo}. Genera los borradores del periodo para comenzar.
            </Card>
          )}

          {polizas.map((p: any) => (
            <Card key={p.id} className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{p.concepto}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.fecha} · {p.tipo} · v{p.version} · origen {p.origen}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={p.estado === "aprobada" ? "default" : p.estado === "rechazada" ? "destructive" : "secondary"}>
                    {p.estado}
                  </Badge>
                  <div className="text-sm font-semibold">{mxn(p.cargos_centavos)}</div>
                </div>
              </div>

              {p.bloqueos.map((b: string) => (
                <div key={b} className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-400 shrink-0" /> {b}
                </div>
              ))}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Cargo</TableHead>
                    <TableHead className="text-right">Abono</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...(p.poliza_renglones ?? [])].sort((a: any, b: any) => a.numero - b.numero).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground">{r.numero}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.cuenta}
                        {r.cuenta_nombre ? <span className="text-muted-foreground"> · {r.cuenta_nombre}</span> : null}
                      </TableCell>
                      <TableCell className="text-xs">{r.concepto ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{r.cargo_centavos ? mxn(r.cargo_centavos) : "—"}</TableCell>
                      <TableCell className="text-right text-xs">{r.abono_centavos ? mxn(r.abono_centavos) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {p.estado === "borrador" && (
                <div className="space-y-2 border-t border-border/40 pt-3">
                  {abierta === p.id ? (
                    <>
                      <Label className="text-xs">Motivo de la decisión (obligatorio, queda en bitácora)</Label>
                      <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2}
                        placeholder="Explica por qué apruebas o rechazas esta póliza." />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={!p.aprobable || decidir.isPending}
                          onClick={() => decidir.mutate({ id: p.id, accion: "aprobar" })}>
                          <CheckCircle2 className="h-4 w-4" /> Aprobar
                        </Button>
                        <Button size="sm" variant="destructive" disabled={decidir.isPending}
                          onClick={() => decidir.mutate({ id: p.id, accion: "rechazar" })}>
                          <XCircle className="h-4 w-4" /> Rechazar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAbierta(null); setMotivo(""); }}>
                          Cancelar
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setAbierta(p.id); setMotivo(""); }}>
                      <ListChecks className="h-4 w-4" /> Revisar y decidir
                    </Button>
                  )}
                </div>
              )}

              {p.estado === "rechazada" && p.rechazo_motivo && (
                <div className="text-xs text-muted-foreground border-t border-border/40 pt-2">
                  Motivo del rechazo: {p.rechazo_motivo}
                </div>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="conceptos" className="pt-4">
          <ReglasConceptoPanel clienteId={clienteId} periodo={periodo} />
        </TabsContent>

        <TabsContent value="catalogo" className="pt-4">
          <CatalogoPanel clienteId={clienteId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
