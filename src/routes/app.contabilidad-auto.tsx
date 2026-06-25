import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Wand2, CheckCircle2, XCircle, ArrowLeft, Sparkles, Edit2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useActiveCliente } from "@/lib/active-cliente";
import {
  listarCfdiPendientes,
  generarPolizasDesdeCfdi,
  listarPolizasBorrador,
  cambiarEstadoPoliza,
  editarAsientosPoliza,
} from "@/lib/contabilidad-auto/contabilizar.functions";
import {
  listarMovimientosSinPoliza,
  generarPolizasDesdeMovimientos,
} from "@/lib/contabilidad-auto/bancos.functions";
import { CatalogoTab, ReglasTab, ExportarTab } from "@/components/contabilidad-auto/ConfigTabs";

export const Route = createFileRoute("/app/contabilidad-auto")({
  component: ContabilidadAutoPage,
});

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

function ContabilidadAutoPage() {
  const { cliente } = useActiveCliente();
  const qc = useQueryClient();

  const fnPend = useServerFn(listarCfdiPendientes);
  const fnGen = useServerFn(generarPolizasDesdeCfdi);
  const fnList = useServerFn(listarPolizasBorrador);
  const fnEst = useServerFn(cambiarEstadoPoliza);
  const fnEdit = useServerFn(editarAsientosPoliza);

  const pendientes = useQuery({
    queryKey: ["cfdi-pendientes", cliente?.id],
    queryFn: () => fnPend({ data: { cliente_id: cliente!.id, limit: 200 } }),
    enabled: !!cliente?.id,
  });
  const borradores = useQuery({
    queryKey: ["polizas-borrador", cliente?.id],
    queryFn: () => fnList({ data: { cliente_id: cliente!.id, estado: "borrador" } }),
    enabled: !!cliente?.id,
  });
  const confirmadas = useQuery({
    queryKey: ["polizas-confirmadas", cliente?.id],
    queryFn: () => fnList({ data: { cliente_id: cliente!.id, estado: "confirmada" } }),
    enabled: !!cliente?.id,
  });

  const [selCfdi, setSelCfdi] = useState<Set<string>>(new Set());
  const [selBorr, setSelBorr] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<any | null>(null);

  const genMut = useMutation({
    mutationFn: () => fnGen({ data: { cliente_id: cliente!.id, cfdi_ids: Array.from(selCfdi) } }),
    onSuccess: (r) => {
      toast.success(`${r.insertadas} pólizas generadas${r.omitidos ? `, ${r.omitidos} omitidas` : ""}`);
      setSelCfdi(new Set());
      qc.invalidateQueries({ queryKey: ["cfdi-pendientes"] });
      qc.invalidateQueries({ queryKey: ["polizas-borrador"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error generando pólizas"),
  });
  const estMut = useMutation({
    mutationFn: (estado: "confirmada" | "rechazada") =>
      fnEst({ data: { ids: Array.from(selBorr), estado } }),
    onSuccess: () => {
      toast.success("Pólizas actualizadas");
      setSelBorr(new Set());
      qc.invalidateQueries({ queryKey: ["polizas-borrador"] });
      qc.invalidateQueries({ queryKey: ["polizas-confirmadas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error al actualizar"),
  });

  if (!cliente) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <p className="text-muted-foreground">Selecciona un cliente activo para generar contabilidad automática.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/app/contable" className="hover:underline flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Contabilidad
          </Link>
        </div>
        <h1 className="text-2xl font-semibold flex items-center gap-2 mt-1">
          <Sparkles className="h-6 w-6" /> Contabilidad automática · {cliente.razon_social ?? cliente.rfc}
        </h1>
        <p className="text-muted-foreground text-sm">
          Convierte los CFDI descargados del SAT en pólizas borrador. Revisa, ajusta y aprueba.
        </p>
      </div>

      <Tabs defaultValue="pendientes">
        <TabsList>
          <TabsTrigger value="pendientes">
            CFDI sin contabilizar {pendientes.data ? `(${pendientes.data.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="borrador">
            Pólizas borrador {borradores.data ? `(${borradores.data.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="confirmadas">
            Confirmadas {confirmadas.data ? `(${confirmadas.data.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="bancos">Bancos</TabsTrigger>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="reglas">Reglas</TabsTrigger>
          <TabsTrigger value="exportar">Exportar</TabsTrigger>
        </TabsList>

        {/* --- Pendientes --- */}
        <TabsContent value="pendientes">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                {selCfdi.size > 0 ? `${selCfdi.size} CFDI seleccionados` : "Selecciona los CFDI a contabilizar"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const all = pendientes.data ?? [];
                    setSelCfdi(selCfdi.size === all.length ? new Set() : new Set(all.map((c: any) => c.id)));
                  }}
                >
                  {selCfdi.size === (pendientes.data?.length ?? 0) && selCfdi.size > 0 ? "Quitar selección" : "Seleccionar todos"}
                </Button>
                <Button
                  onClick={() => genMut.mutate()}
                  disabled={selCfdi.size === 0 || genMut.isPending}
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  {genMut.isPending ? "Generando..." : `Generar ${selCfdi.size || ""} pólizas`}
                </Button>
              </div>
            </div>

            <div className="rounded border overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Contraparte</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>UUID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(pendientes.data ?? []).map((c: any) => {
                    const esEmitido = c.rfc_emisor === cliente.rfc;
                    return (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => {
                        const ns = new Set(selCfdi);
                        ns.has(c.id) ? ns.delete(c.id) : ns.add(c.id);
                        setSelCfdi(ns);
                      }}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selCfdi.has(c.id)}
                            onCheckedChange={(v) => {
                              const ns = new Set(selCfdi);
                              v ? ns.add(c.id) : ns.delete(c.id);
                              setSelCfdi(ns);
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-xs">{String(c.fecha).slice(0, 10)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {c.tipo_cfdi} · {esEmitido ? "emitido" : "recibido"}
                          </Badge>
                        </TableCell>
                        <TableCell className="truncate max-w-[260px]">
                          {esEmitido ? c.nombre_receptor : c.nombre_emisor}
                          <div className="text-xs text-muted-foreground">
                            {esEmitido ? c.rfc_receptor : c.rfc_emisor}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{mxn(c.total)}</TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-[160px]">{c.uuid}</TableCell>
                      </TableRow>
                    );
                  })}
                  {pendientes.data && pendientes.data.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No hay CFDI pendientes. Sincroniza desde SAT o ya están todos contabilizados.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* --- Borrador --- */}
        <TabsContent value="borrador">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                {selBorr.size > 0 ? `${selBorr.size} seleccionadas` : "Revisa y aprueba las pólizas generadas"}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={selBorr.size === 0 || estMut.isPending}
                  onClick={() => estMut.mutate("rechazada")}>
                  <XCircle className="h-4 w-4 mr-2" /> Rechazar
                </Button>
                <Button disabled={selBorr.size === 0 || estMut.isPending}
                  onClick={() => estMut.mutate("confirmada")}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Aprobar {selBorr.size || ""}
                </Button>
              </div>
            </div>
            <ListaPolizas
              rows={borradores.data ?? []}
              selectable
              selected={selBorr}
              onToggle={(id) => {
                const ns = new Set(selBorr);
                ns.has(id) ? ns.delete(id) : ns.add(id);
                setSelBorr(ns);
              }}
              onEdit={setEditing}
            />
          </Card>
        </TabsContent>

        {/* --- Confirmadas --- */}
        <TabsContent value="confirmadas">
          <Card className="p-4">
            <ListaPolizas rows={confirmadas.data ?? []} />
          </Card>
        </TabsContent>

        <TabsContent value="bancos"><BancosTab clienteId={cliente.id} /></TabsContent>
        <TabsContent value="catalogo"><CatalogoTab clienteId={cliente.id} /></TabsContent>
        <TabsContent value="reglas"><ReglasTab clienteId={cliente.id} /></TabsContent>
        <TabsContent value="exportar"><ExportarTab clienteId={cliente.id} /></TabsContent>
      </Tabs>

      {editing && (
        <EditorAsientosDialog
          poliza={editing}
          onClose={() => setEditing(null)}
          onSave={async (asientos) => {
            try {
              await fnEdit({ data: { id: editing.id, asientos } });
              toast.success("Asientos actualizados");
              setEditing(null);
              qc.invalidateQueries({ queryKey: ["polizas-borrador"] });
            } catch (e: any) {
              toast.error(e.message ?? "Error al guardar");
            }
          }}
        />
      )}
    </div>
  );
}

function ListaPolizas({
  rows, selectable, selected, onToggle, onEdit,
}: {
  rows: any[];
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onEdit?: (p: any) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm py-8 text-center">Sin pólizas en esta vista.</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((p) => {
        const asientos = (p.metadata?.asientos ?? []) as any[];
        const warnings = (p.metadata?.warnings ?? []) as string[];
        return (
          <div key={p.id} className="border rounded-lg p-3 hover:bg-muted/30">
            <div className="flex items-start gap-3">
              {selectable && (
                <Checkbox
                  className="mt-1"
                  checked={selected?.has(p.id)}
                  onCheckedChange={() => onToggle?.(p.id)}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">{p.tipo}</Badge>
                  <span className="text-xs text-muted-foreground">{String(p.fecha).slice(0, 10)}</span>
                  <span className="font-medium">{mxn(p.monto)}</span>
                  {warnings.length > 0 && (
                    <Badge variant="destructive" className="text-xs gap-1">
                      <AlertTriangle className="h-3 w-3" /> {warnings.length}
                    </Badge>
                  )}
                </div>
                <p className="text-sm mt-1">{p.concepto}</p>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-4 text-xs">
                  {asientos.map((a, i) => (
                    <div key={i} className="flex justify-between border-b border-dashed py-0.5">
                      <span className="font-mono">{a.cuenta}</span>
                      <span className="truncate flex-1 px-2 text-muted-foreground">{a.nombre}</span>
                      <span className="font-mono tabular-nums">
                        {a.debe > 0 ? mxn(a.debe) : ""}
                      </span>
                      <span className="font-mono tabular-nums ml-2 text-muted-foreground">
                        {a.haber > 0 ? mxn(a.haber) : ""}
                      </span>
                    </div>
                  ))}
                </div>
                {warnings.length > 0 && (
                  <p className="text-xs text-destructive mt-1">{warnings.join(" · ")}</p>
                )}
              </div>
              {onEdit && (
                <Button variant="ghost" size="sm" onClick={() => onEdit(p)}>
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EditorAsientosDialog({ poliza, onClose, onSave }: {
  poliza: any;
  onClose: () => void;
  onSave: (asientos: any[]) => void;
}) {
  const [rows, setRows] = useState<any[]>(() => poliza.metadata?.asientos ?? []);
  const totals = useMemo(() => {
    const d = rows.reduce((s, a) => s + (Number(a.debe) || 0), 0);
    const h = rows.reduce((s, a) => s + (Number(a.haber) || 0), 0);
    return { d, h, diff: d - h };
  }, [rows]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar asientos · {poliza.concepto}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Cuenta</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right w-32">Debe</TableHead>
                <TableHead className="text-right w-32">Haber</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Input className="h-8" value={r.cuenta}
                      onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, cuenta: e.target.value } : x))} />
                  </TableCell>
                  <TableCell>
                    <Input className="h-8" value={r.nombre}
                      onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))} />
                  </TableCell>
                  <TableCell>
                    <Input className="h-8 text-right" type="number" step="0.01" value={r.debe}
                      onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, debe: Number(e.target.value) || 0 } : x))} />
                  </TableCell>
                  <TableCell>
                    <Input className="h-8 text-right" type="number" step="0.01" value={r.haber}
                      onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, haber: Number(e.target.value) || 0 } : x))} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button variant="outline" size="sm"
            onClick={() => setRows([...rows, { cuenta: "", nombre: "", debe: 0, haber: 0 }])}>
            + Agregar línea
          </Button>
        </div>
        <DialogFooter className="flex items-center justify-between">
          <div className="text-sm">
            Cargos: <strong>{mxn(totals.d)}</strong> · Abonos: <strong>{mxn(totals.h)}</strong>{" "}
            {Math.abs(totals.diff) > 0.05 && (
              <span className="text-destructive">· Diferencia {mxn(totals.diff)}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button disabled={Math.abs(totals.diff) > 0.05} onClick={() => onSave(rows)}>Guardar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
