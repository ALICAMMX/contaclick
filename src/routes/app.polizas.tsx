import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Upload, FilePlus2, Trash2, Download, BookOpen, ArrowLeft, Sparkles, Wand2, CheckCircle2, Banknote, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useActiveCliente } from "@/lib/active-cliente";
import {
  crearPoliza,
  importarPolizas,
  listarPolizas,
  eliminarPoliza,
  type PolizaInput,
} from "@/lib/polizas/polizas.functions";
import {
  listarCfdiPendientes,
  generarPolizasDesdeCfdi,
  listarPolizasBorrador,
  cambiarEstadoPoliza,
} from "@/lib/contabilidad-auto/contabilizar.functions";
import {
  listarMovimientosSinPoliza,
  generarPolizasDesdeMovimientos,
} from "@/lib/contabilidad-auto/bancos.functions";
import { triggerFileDownload } from "@/lib/download";

export const Route = createFileRoute("/app/polizas")({
  component: PolizasPage,
});

const PLANTILLA_CSV = `fecha,tipo,monto,concepto,cuenta,referencia,uuid_cfdi
2025-01-15,ingreso,11600.00,Venta servicios,401-01,F-001,A1B2C3D4-0000-0000-0000-000000000000
2025-01-16,egreso,2320.00,Renta oficina,601-02,RENT-01,
`;

type ParsedRow = PolizaInput & { _error?: string };

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

function parseCSV(text: string): ParsedRow[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (k: string) => headers.indexOf(k);
  const out: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const fecha = cols[idx("fecha")] ?? "";
    const tipoRaw = (cols[idx("tipo")] ?? "").toLowerCase();
    const montoRaw = cols[idx("monto")] ?? "";
    const row: ParsedRow = {
      fecha,
      tipo: (tipoRaw as PolizaInput["tipo"]) || "diario",
      monto: Number(montoRaw.replace(/[^0-9.\-]/g, "")) || 0,
      concepto: cols[idx("concepto")] ?? null,
      cuenta: cols[idx("cuenta")] ?? null,
      referencia: cols[idx("referencia")] ?? null,
      uuid_cfdi: cols[idx("uuid_cfdi")] ?? null,
    };
    const errors: string[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.fecha)) errors.push("fecha");
    if (!["ingreso", "egreso", "diario"].includes(row.tipo)) errors.push("tipo");
    if (!row.monto || !isFinite(row.monto)) errors.push("monto");
    if (errors.length) row._error = "Inválido: " + errors.join(", ");
    out.push(row);
  }
  return out;
}

function PolizasPage() {
  const { cliente } = useActiveCliente();
  const clienteId = cliente?.id ?? "";
  const qc = useQueryClient();
  const listFn = useServerFn(listarPolizas);
  const importFn = useServerFn(importarPolizas);
  const crearFn = useServerFn(crearPoliza);
  const delFn = useServerFn(eliminarPoliza);
  const cfdiPendientesFn = useServerFn(listarCfdiPendientes);
  const generarDesdeCfdiFn = useServerFn(generarPolizasDesdeCfdi);
  const movsPendientesFn = useServerFn(listarMovimientosSinPoliza);
  const generarDesdeMovsFn = useServerFn(generarPolizasDesdeMovimientos);
  const borradoresFn = useServerFn(listarPolizasBorrador);
  const estadoFn = useServerFn(cambiarEstadoPoliza);

  const list = useQuery({
    queryKey: ["polizas", clienteId],
    queryFn: () => {
      if (!clienteId) throw new Error("Selecciona un cliente activo");
      return listFn({ data: { cliente_id: clienteId, limit: 200 } });
    },
    enabled: Boolean(clienteId),
  });

  const cfdiPendientes = useQuery({
    queryKey: ["polizas-auto-cfdi", clienteId],
    queryFn: () => {
      if (!clienteId) throw new Error("Selecciona un cliente activo");
      return cfdiPendientesFn({ data: { cliente_id: clienteId, limit: 300 } });
    },
    enabled: Boolean(clienteId),
  });

  const movsPendientes = useQuery({
    queryKey: ["polizas-auto-bancos", clienteId],
    queryFn: () => {
      if (!clienteId) throw new Error("Selecciona un cliente activo");
      return movsPendientesFn({ data: { cliente_id: clienteId, limit: 300 } });
    },
    enabled: Boolean(clienteId),
  });

  const borradoresAuto = useQuery({
    queryKey: ["polizas-auto-borrador", clienteId],
    queryFn: () => {
      if (!clienteId) throw new Error("Selecciona un cliente activo");
      return borradoresFn({ data: { cliente_id: clienteId, estado: "borrador", limit: 300 } });
    },
    enabled: Boolean(clienteId),
  });

  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const validCount = useMemo(() => parsed.filter((p) => !p._error).length, [parsed]);
  const errCount = parsed.length - validCount;
  const [selCfdi, setSelCfdi] = useState<Set<string>>(new Set());
  const [selMovs, setSelMovs] = useState<Set<string>>(new Set());
  const [selBorradores, setSelBorradores] = useState<Set<string>>(new Set());

  const [manual, setManual] = useState<PolizaInput>({
    fecha: new Date().toISOString().slice(0, 10),
    tipo: "ingreso",
    monto: 0,
    concepto: "",
    cuenta: "",
    referencia: "",
    uuid_cfdi: "",
  });

  const importMut = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw new Error("Selecciona un cliente activo");
      const rows = parsed.filter((p) => !p._error).map(({ _error, ...r }) => r);
      return importFn({ data: { cliente_id: clienteId, polizas: rows } });
    },
    onSuccess: (r) => {
      toast.success(`${r.insertadas} pólizas importadas`);
      setParsed([]);
      qc.invalidateQueries({ queryKey: ["polizas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error al importar"),
  });

  const crearMut = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw new Error("Selecciona un cliente activo");
      return crearFn({ data: { cliente_id: clienteId, poliza: manual } });
    },
    onSuccess: () => {
      toast.success("Póliza registrada");
      setManual({ ...manual, monto: 0, concepto: "", referencia: "", uuid_cfdi: "" });
      qc.invalidateQueries({ queryKey: ["polizas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error al crear"),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Póliza eliminada");
      qc.invalidateQueries({ queryKey: ["polizas"] });
    },
  });

  const genCfdiMut = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw new Error("Selecciona un cliente activo");
      return generarDesdeCfdiFn({ data: { cliente_id: clienteId, cfdi_ids: Array.from(selCfdi) } });
    },
    onSuccess: (r) => {
      toast.success(`${r.insertadas} pólizas automáticas desde CFDI${r.omitidos ? `, ${r.omitidos} omitidas` : ""}`);
      setSelCfdi(new Set());
      qc.invalidateQueries({ queryKey: ["polizas-auto-cfdi"] });
      qc.invalidateQueries({ queryKey: ["polizas-auto-borrador"] });
      qc.invalidateQueries({ queryKey: ["polizas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error generando pólizas desde CFDI"),
  });

  const genMovsMut = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw new Error("Selecciona un cliente activo");
      return generarDesdeMovsFn({ data: { cliente_id: clienteId, movimiento_ids: Array.from(selMovs) } });
    },
    onSuccess: (r) => {
      toast.success(`${r.insertadas} pólizas automáticas desde bancos${r.omitidos ? `, ${r.omitidos} omitidas` : ""}`);
      setSelMovs(new Set());
      qc.invalidateQueries({ queryKey: ["polizas-auto-bancos"] });
      qc.invalidateQueries({ queryKey: ["polizas-auto-borrador"] });
      qc.invalidateQueries({ queryKey: ["polizas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error generando pólizas desde bancos"),
  });

  const aprobarMut = useMutation({
    mutationFn: async () => estadoFn({ data: { ids: Array.from(selBorradores), estado: "confirmada" } }),
    onSuccess: () => {
      toast.success("Pólizas automáticas aprobadas");
      setSelBorradores(new Set());
      qc.invalidateQueries({ queryKey: ["polizas-auto-borrador"] });
      qc.invalidateQueries({ queryKey: ["polizas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error al aprobar pólizas"),
  });

  function descargarPlantilla() {
    const blob = new Blob([PLANTILLA_CSV], { type: "text/csv;charset=utf-8" });
    triggerFileDownload(blob, "plantilla-polizas.csv");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const rows = parseCSV(text);
    setParsed(rows);
    if (!rows.length) toast.error("CSV vacío o sin encabezados válidos");
  }

  if (!cliente) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <p className="text-muted-foreground">Selecciona un cliente activo para gestionar pólizas.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/app/conciliacion-integral" className="hover:underline flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Conciliación integral
            </Link>
          </div>
          <h1 className="text-2xl font-semibold flex items-center gap-2 mt-1">
            <BookOpen className="h-6 w-6" /> Pólizas contables · {cliente.razon_social ?? cliente.rfc}
          </h1>
          <p className="text-muted-foreground text-sm">
            Genera pólizas automáticas desde CFDI y bancos, o carga pólizas manuales cuando sea necesario.
          </p>
        </div>
        <HerramientaHelp slug="polizas" />
      </div>

      <Tabs defaultValue="automaticas">
        <TabsList>
          <TabsTrigger value="automaticas"><Sparkles className="h-4 w-4 mr-2" />Automáticas</TabsTrigger>
          <TabsTrigger value="csv"><Upload className="h-4 w-4 mr-2" />Importar CSV</TabsTrigger>
          <TabsTrigger value="manual"><FilePlus2 className="h-4 w-4 mr-2" />Alta manual</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="automaticas" className="space-y-4">
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" />CFDI sin póliza</h2>
                <p className="text-xs text-muted-foreground">{selCfdi.size ? `${selCfdi.size} CFDI seleccionados` : `${cfdiPendientes.data?.length ?? 0} CFDI pendientes`}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  const rows = cfdiPendientes.data ?? [];
                  setSelCfdi(selCfdi.size === rows.length ? new Set() : new Set(rows.map((r: any) => r.id)));
                }} disabled={!cfdiPendientes.data?.length}>
                  {selCfdi.size === (cfdiPendientes.data?.length ?? 0) && selCfdi.size > 0 ? "Quitar selección" : "Seleccionar todos"}
                </Button>
                <Button onClick={() => genCfdiMut.mutate()} disabled={selCfdi.size === 0 || genCfdiMut.isPending}>
                  <Wand2 className="h-4 w-4 mr-2" />{genCfdiMut.isPending ? "Generando..." : `Generar ${selCfdi.size || ""}`}
                </Button>
              </div>
            </div>
            <div className="rounded border overflow-auto max-h-[320px]">
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
                  {(cfdiPendientes.data ?? []).map((c: any) => {
                    const esEmitido = String(c.rfc_emisor ?? "").toUpperCase() === String(cliente.rfc ?? "").toUpperCase();
                    return (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelCfdi(toggleSet(selCfdi, c.id))}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selCfdi.has(c.id)} onCheckedChange={() => setSelCfdi(toggleSet(selCfdi, c.id))} />
                        </TableCell>
                        <TableCell className="text-xs">{String(c.fecha).slice(0, 10)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{c.tipo_cfdi} · {esEmitido ? "emitido" : "recibido"}</Badge></TableCell>
                        <TableCell className="truncate max-w-[240px]">{esEmitido ? c.nombre_receptor : c.nombre_emisor}</TableCell>
                        <TableCell className="text-right font-medium">{mxn(c.total)}</TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-[160px]">{c.uuid}</TableCell>
                      </TableRow>
                    );
                  })}
                  {cfdiPendientes.data && cfdiPendientes.data.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No hay CFDI pendientes de póliza.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold flex items-center gap-2"><Banknote className="h-4 w-4" />Movimientos bancarios sin póliza</h2>
                <p className="text-xs text-muted-foreground">{selMovs.size ? `${selMovs.size} movimientos seleccionados` : `${movsPendientes.data?.length ?? 0} movimientos pendientes`}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  const rows = movsPendientes.data ?? [];
                  setSelMovs(selMovs.size === rows.length ? new Set() : new Set(rows.map((r: any) => r.id)));
                }} disabled={!movsPendientes.data?.length}>
                  {selMovs.size === (movsPendientes.data?.length ?? 0) && selMovs.size > 0 ? "Quitar selección" : "Seleccionar todos"}
                </Button>
                <Button onClick={() => genMovsMut.mutate()} disabled={selMovs.size === 0 || genMovsMut.isPending}>
                  <Wand2 className="h-4 w-4 mr-2" />{genMovsMut.isPending ? "Generando..." : `Generar ${selMovs.size || ""}`}
                </Button>
              </div>
            </div>
            <div className="rounded border overflow-auto max-h-[320px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead className="text-right">Cargo</TableHead>
                    <TableHead className="text-right">Abono</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(movsPendientes.data ?? []).map((m: any) => (
                    <TableRow key={m.id} className="cursor-pointer" onClick={() => setSelMovs(toggleSet(selMovs, m.id))}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selMovs.has(m.id)} onCheckedChange={() => setSelMovs(toggleSet(selMovs, m.id))} />
                      </TableCell>
                      <TableCell className="text-xs">{String(m.fecha).slice(0, 10)}</TableCell>
                      <TableCell className="truncate max-w-[320px]">{m.descripcion ?? "—"}</TableCell>
                      <TableCell className="text-xs">{m.referencia ?? ""}</TableCell>
                      <TableCell className="text-right font-mono">{Number(m.cargo) > 0 ? mxn(m.cargo) : ""}</TableCell>
                      <TableCell className="text-right font-mono">{Number(m.abono) > 0 ? mxn(m.abono) : ""}</TableCell>
                    </TableRow>
                  ))}
                  {movsPendientes.data && movsPendientes.data.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No hay movimientos bancarios pendientes de póliza.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Borradores automáticos</h2>
                <p className="text-xs text-muted-foreground">{selBorradores.size ? `${selBorradores.size} borradores seleccionados` : `${borradoresAuto.data?.length ?? 0} borradores por aprobar`}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  const rows = borradoresAuto.data ?? [];
                  setSelBorradores(selBorradores.size === rows.length ? new Set() : new Set(rows.map((r: any) => r.id)));
                }} disabled={!borradoresAuto.data?.length}>
                  {selBorradores.size === (borradoresAuto.data?.length ?? 0) && selBorradores.size > 0 ? "Quitar selección" : "Seleccionar todos"}
                </Button>
                <Button onClick={() => aprobarMut.mutate()} disabled={selBorradores.size === 0 || aprobarMut.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />{aprobarMut.isPending ? "Aprobando..." : `Aprobar ${selBorradores.size || ""}`}
                </Button>
              </div>
            </div>
            <div className="rounded border overflow-auto max-h-[360px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Origen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(borradoresAuto.data ?? []).map((p: any) => (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => setSelBorradores(toggleSet(selBorradores, p.id))}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selBorradores.has(p.id)} onCheckedChange={() => setSelBorradores(toggleSet(selBorradores, p.id))} />
                      </TableCell>
                      <TableCell className="text-xs">{String(p.fecha).slice(0, 10)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{p.tipo}</Badge></TableCell>
                      <TableCell className="text-right font-medium">{mxn(p.monto)}</TableCell>
                      <TableCell className="truncate max-w-[360px]">{p.concepto}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{p.origen}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {borradoresAuto.data && borradoresAuto.data.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin borradores automáticos por aprobar.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="csv" className="space-y-4">
          <Card className="p-4 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" onClick={descargarPlantilla}>
                <Download className="h-4 w-4 mr-2" />Descargar plantilla
              </Button>
              <Input type="file" accept=".csv,text/csv" onChange={onFile} className="max-w-sm" />
              {parsed.length > 0 && (
                <>
                  <Badge variant="secondary">{validCount} válidas</Badge>
                  {errCount > 0 && <Badge variant="destructive">{errCount} con error</Badge>}
                  <Button
                    onClick={() => importMut.mutate()}
                    disabled={validCount === 0 || importMut.isPending}
                  >
                    {importMut.isPending ? "Importando..." : `Importar ${validCount}`}
                  </Button>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Columnas: <code>fecha (YYYY-MM-DD), tipo (ingreso|egreso|diario), monto, concepto, cuenta, referencia, uuid_cfdi</code>
            </p>

            {parsed.length > 0 && (
              <div className="rounded border overflow-auto max-h-[420px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Concepto</TableHead>
                      <TableHead>UUID</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.slice(0, 200).map((r, i) => (
                      <TableRow key={i} className={r._error ? "bg-red-500/5" : ""}>
                        <TableCell>{r.fecha}</TableCell>
                        <TableCell>{r.tipo}</TableCell>
                        <TableCell className="text-right">${r.monto.toLocaleString("es-MX")}</TableCell>
                        <TableCell className="truncate max-w-[200px]">{r.concepto}</TableCell>
                        <TableCell className="text-xs truncate max-w-[180px]">{r.uuid_cfdi}</TableCell>
                        <TableCell>
                          {r._error ? (
                            <Badge variant="destructive" className="text-xs">{r._error}</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">OK</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsed.length > 200 && (
                  <p className="text-xs p-2 text-muted-foreground">
                    Mostrando 200 de {parsed.length}. Todas se importarán.
                  </p>
                )}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="manual">
          <Card className="p-4 space-y-4 max-w-2xl">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={manual.fecha} onChange={(e) => setManual({ ...manual, fecha: e.target.value })} />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={manual.tipo} onValueChange={(v) => setManual({ ...manual, tipo: v as PolizaInput["tipo"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ingreso">Ingreso</SelectItem>
                    <SelectItem value="egreso">Egreso</SelectItem>
                    <SelectItem value="diario">Diario</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Monto</Label>
                <Input type="number" step="0.01" value={manual.monto} onChange={(e) => setManual({ ...manual, monto: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Cuenta</Label>
                <Input value={manual.cuenta ?? ""} onChange={(e) => setManual({ ...manual, cuenta: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Concepto</Label>
                <Input value={manual.concepto ?? ""} onChange={(e) => setManual({ ...manual, concepto: e.target.value })} />
              </div>
              <div>
                <Label>Referencia</Label>
                <Input value={manual.referencia ?? ""} onChange={(e) => setManual({ ...manual, referencia: e.target.value })} />
              </div>
              <div>
                <Label>UUID CFDI (opcional)</Label>
                <Input value={manual.uuid_cfdi ?? ""} onChange={(e) => setManual({ ...manual, uuid_cfdi: e.target.value })} placeholder="A1B2C3D4-..." />
              </div>
            </div>
            <Button
              onClick={() => crearMut.mutate()}
              disabled={crearMut.isPending || !manual.fecha || !manual.monto}
            >
              {crearMut.isPending ? "Guardando..." : "Registrar póliza"}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="historial">
          <Card className="p-4">
            {list.isLoading && <p className="text-muted-foreground">Cargando...</p>}
            {list.data && list.data.length === 0 && (
              <p className="text-muted-foreground">Sin pólizas registradas para este cliente.</p>
            )}
            {list.data && list.data.length > 0 && (
              <div className="rounded border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Concepto</TableHead>
                      <TableHead>UUID</TableHead>
                      <TableHead>Origen</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.data.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.fecha}</TableCell>
                        <TableCell><Badge variant="outline">{p.tipo}</Badge></TableCell>
                        <TableCell className="text-right">${Number(p.monto).toLocaleString("es-MX")}</TableCell>
                        <TableCell className="truncate max-w-[240px]">{p.concepto}</TableCell>
                        <TableCell className="text-xs truncate max-w-[180px]">{p.uuid_cfdi}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{p.origen}</Badge></TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => delMut.mutate(p.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
