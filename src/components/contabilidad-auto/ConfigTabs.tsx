import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles, Download, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  listarCatalogo, sembrarCatalogo, sembrarCatalogoIMCP, upsertCuenta, eliminarCuenta,
  listarReglas, upsertRegla, eliminarRegla,
} from "@/lib/contabilidad-auto/catalogo.functions";
import { exportarAnexo24Polizas, exportarContpaqi, exportarAspelCoi, exportarAnexo24Catalogo, exportarAnexo24Balanza, exportarAnexo24AuxCuentas, exportarAnexo24AuxFolios } from "@/lib/contabilidad-auto/export.functions";
import { exportarExpedienteZip } from "@/lib/expedientes/zip-export.functions";
import { triggerFileDownload } from "@/lib/download";



// ===== Catálogo =====
export function CatalogoTab({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const fnList = useServerFn(listarCatalogo);
  const fnSeed = useServerFn(sembrarCatalogo);
  const fnSeedIMCP = useServerFn(sembrarCatalogoIMCP);

  const fnUp = useServerFn(upsertCuenta);
  const fnDel = useServerFn(eliminarCuenta);

  const q = useQuery({
    queryKey: ["catalogo-cuentas", clienteId],
    queryFn: () => fnList({ data: { cliente_id: clienteId } }),
  });
  const [editing, setEditing] = useState<any | null>(null);

  const seedMut = useMutation({
    mutationFn: () => fnSeed({ data: { cliente_id: clienteId } }),
    onSuccess: (r) => { toast.success(`${r.sembradas} cuentas sembradas`); qc.invalidateQueries({ queryKey: ["catalogo-cuentas"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const [plantillaIMCP, setPlantillaIMCP] = useState<"pm_general" | "pf_act_emp" | "pf_resico">("pm_general");
  const seedIMCPMut = useMutation({
    mutationFn: () => fnSeedIMCP({ data: { cliente_id: clienteId, plantilla: plantillaIMCP } }),
    onSuccess: (r) => { toast.success(`${r.sembradas} cuentas sembradas — ${r.plantilla}`); qc.invalidateQueries({ queryKey: ["catalogo-cuentas"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => fnDel({ data: { id } }),
    onSuccess: () => { toast.success("Cuenta eliminada"); qc.invalidateQueries({ queryKey: ["catalogo-cuentas"] }); },
    onError: (e: any) => toast.error(e.message),
  });


  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Catálogo de cuentas</h3>
          <p className="text-sm text-muted-foreground">
            Cuentas usadas por el motor para generar pólizas. Si está vacío, siembra el catálogo SAT base.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(q.data ?? []).length === 0 && (
            <>
              <Select value={plantillaIMCP} onValueChange={(v) => setPlantillaIMCP(v as any)}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pm_general">PM Régimen General</SelectItem>
                  <SelectItem value="pf_act_emp">PF Actividad Empresarial</SelectItem>
                  <SelectItem value="pf_resico">PF RESICO</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => seedIMCPMut.mutate()} disabled={seedIMCPMut.isPending}>
                <Sparkles className="h-4 w-4 mr-2" /> Sembrar plantilla IMCP
              </Button>
              <Button variant="outline" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
                Catálogo SAT mínimo
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setEditing({})}>
            <Plus className="h-4 w-4 mr-2" /> Nueva cuenta
          </Button>
        </div>
      </div>


      <div className="rounded border overflow-auto max-h-[600px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Naturaleza</TableHead>
              <TableHead>Tipo SAT</TableHead>
              <TableHead>Activa</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data ?? []).map((c: any) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setEditing(c)}>
                <TableCell className="font-mono">{c.codigo}</TableCell>
                <TableCell>{c.nombre}</TableCell>
                <TableCell><Badge variant="outline">{c.naturaleza}</Badge></TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{c.tipo_sat || "—"}</TableCell>
                <TableCell>{c.activa ? "Sí" : "No"}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" onClick={() => {
                    if (confirm(`¿Eliminar la cuenta ${c.codigo}?`)) delMut.mutate(c.id);
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(q.data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                Aún no hay catálogo. Siembra el catálogo SAT base para empezar.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <CuentaDialog
          cuenta={editing}
          onClose={() => setEditing(null)}
          onSave={async (vals) => {
            try {
              await fnUp({ data: { ...vals, cliente_id: clienteId } });
              toast.success("Cuenta guardada");
              setEditing(null);
              qc.invalidateQueries({ queryKey: ["catalogo-cuentas"] });
            } catch (e: any) { toast.error(e.message); }
          }}
        />
      )}
    </Card>
  );
}

function CuentaDialog({ cuenta, onClose, onSave }: { cuenta: any; onClose: () => void; onSave: (v: any) => void }) {
  const [f, setF] = useState({
    id: cuenta.id,
    codigo: cuenta.codigo ?? "",
    nombre: cuenta.nombre ?? "",
    naturaleza: cuenta.naturaleza ?? "deudora",
    tipo_sat: cuenta.tipo_sat ?? "",
    activa: cuenta.activa ?? true,
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{cuenta.id ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Código</Label><Input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="601-01" /></div>
          <div><Label>Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Naturaleza</Label>
              <Select value={f.naturaleza} onValueChange={(v) => setF({ ...f, naturaleza: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deudora">Deudora</SelectItem>
                  <SelectItem value="acreedora">Acreedora</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Tipo SAT</Label><Input value={f.tipo_sat} onChange={(e) => setF({ ...f, tipo_sat: e.target.value })} placeholder="601.01" /></div>
          </div>
          <div className="flex items-center justify-between"><Label>Activa</Label><Switch checked={f.activa} onCheckedChange={(v) => setF({ ...f, activa: v })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(f)} disabled={!f.codigo || !f.nombre}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== Reglas =====
export function ReglasTab({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const fnList = useServerFn(listarReglas);
  const fnUp = useServerFn(upsertRegla);
  const fnDel = useServerFn(eliminarRegla);

  const q = useQuery({
    queryKey: ["reglas-contables", clienteId],
    queryFn: () => fnList({ data: { cliente_id: clienteId } }),
  });
  const [editing, setEditing] = useState<any | null>(null);

  const delMut = useMutation({
    mutationFn: (id: string) => fnDel({ data: { id } }),
    onSuccess: () => { toast.success("Regla eliminada"); qc.invalidateQueries({ queryKey: ["reglas-contables"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Reglas contables</h3>
          <p className="text-sm text-muted-foreground">
            Sobrescriben las cuentas por defecto. Se evalúan por prioridad (mayor primero). Útil para clasificar
            gastos recurrentes por RFC del proveedor o palabra clave en el concepto.
          </p>
        </div>
        <Button onClick={() => setEditing({})}>
          <Plus className="h-4 w-4 mr-2" /> Nueva regla
        </Button>
      </div>

      <div className="rounded border overflow-auto max-h-[600px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prioridad</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Condición</TableHead>
              <TableHead>Cargo → Abono</TableHead>
              <TableHead>Activa</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data ?? []).map((r: any) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setEditing(r)}>
                <TableCell>{r.prioridad}</TableCell>
                <TableCell>{r.nombre}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {Object.entries(r.condicion ?? {})
                    .filter(([, v]) => v !== null && v !== undefined && v !== "")
                    .map(([k, v]) => `${k}=${v}`).join(" · ") || "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.cuenta_cargo} → {r.cuenta_abono}</TableCell>
                <TableCell>{r.activa ? "Sí" : "No"}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" onClick={() => {
                    if (confirm(`¿Eliminar la regla "${r.nombre}"?`)) delMut.mutate(r.id);
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(q.data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                Sin reglas. El motor usará las cuentas por defecto del catálogo SAT base.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <ReglaDialog
          regla={editing}
          onClose={() => setEditing(null)}
          onSave={async (vals) => {
            try {
              await fnUp({ data: { ...vals, cliente_id: clienteId } });
              toast.success("Regla guardada");
              setEditing(null);
              qc.invalidateQueries({ queryKey: ["reglas-contables"] });
            } catch (e: any) { toast.error(e.message); }
          }}
        />
      )}
    </Card>
  );
}

function ReglaDialog({ regla, onClose, onSave }: { regla: any; onClose: () => void; onSave: (v: any) => void }) {
  const c0 = regla.condicion ?? {};
  const [f, setF] = useState({
    id: regla.id,
    nombre: regla.nombre ?? "",
    prioridad: regla.prioridad ?? 100,
    cuenta_cargo: regla.cuenta_cargo ?? "",
    cuenta_abono: regla.cuenta_abono ?? "",
    activa: regla.activa ?? true,
    tipo_cfdi: c0.tipo_cfdi ?? "",
    rfc_emisor: c0.rfc_emisor ?? "",
    rfc_receptor: c0.rfc_receptor ?? "",
    keyword: c0.keyword ?? "",
    min_monto: c0.min_monto ?? "",
    max_monto: c0.max_monto ?? "",
  });

  const submit = () => {
    const payload: any = {
      id: f.id,
      nombre: f.nombre,
      prioridad: Number(f.prioridad) || 0,
      cuenta_cargo: f.cuenta_cargo,
      cuenta_abono: f.cuenta_abono,
      activa: f.activa,
      condicion: {
        tipo_cfdi: f.tipo_cfdi || null,
        rfc_emisor: f.rfc_emisor || null,
        rfc_receptor: f.rfc_receptor || null,
        keyword: f.keyword || null,
        min_monto: f.min_monto === "" ? null : Number(f.min_monto),
        max_monto: f.max_monto === "" ? null : Number(f.max_monto),
      },
    };
    onSave(payload);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{regla.id ? "Editar regla" : "Nueva regla"}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-auto">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2"><Label>Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Renta de oficina" /></div>
            <div><Label>Prioridad</Label><Input type="number" value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: Number(e.target.value) || 0 })} /></div>
            <div className="flex items-end justify-between"><Label>Activa</Label><Switch checked={f.activa} onCheckedChange={(v) => setF({ ...f, activa: v })} /></div>
          </div>
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">Condiciones (todas las que llenes deben cumplirse)</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Tipo CFDI</Label>
                <Select value={f.tipo_cfdi || "any"} onValueChange={(v) => setF({ ...f, tipo_cfdi: v === "any" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Cualquiera</SelectItem>
                    <SelectItem value="I">I · Ingreso</SelectItem>
                    <SelectItem value="E">E · Egreso/Nota crédito</SelectItem>
                    <SelectItem value="P">P · Pago</SelectItem>
                    <SelectItem value="N">N · Nómina</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Palabra clave en concepto</Label><Input value={f.keyword} onChange={(e) => setF({ ...f, keyword: e.target.value })} placeholder="renta" /></div>
              <div><Label>RFC emisor</Label><Input value={f.rfc_emisor} onChange={(e) => setF({ ...f, rfc_emisor: e.target.value.toUpperCase() })} /></div>
              <div><Label>RFC receptor</Label><Input value={f.rfc_receptor} onChange={(e) => setF({ ...f, rfc_receptor: e.target.value.toUpperCase() })} /></div>
              <div><Label>Monto mínimo</Label><Input type="number" value={f.min_monto} onChange={(e) => setF({ ...f, min_monto: e.target.value })} /></div>
              <div><Label>Monto máximo</Label><Input type="number" value={f.max_monto} onChange={(e) => setF({ ...f, max_monto: e.target.value })} /></div>
            </div>
          </div>
          <div className="border-t pt-3 grid grid-cols-2 gap-2">
            <div><Label>Cuenta de cargo</Label><Input value={f.cuenta_cargo} onChange={(e) => setF({ ...f, cuenta_cargo: e.target.value })} placeholder="601-05" /></div>
            <div><Label>Cuenta de abono</Label><Input value={f.cuenta_abono} onChange={(e) => setF({ ...f, cuenta_abono: e.target.value })} placeholder="201-01" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!f.nombre || !f.cuenta_cargo || !f.cuenta_abono}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== Exportar =====
export function ExportarTab({ clienteId }: { clienteId: string }) {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [tipoSol, setTipoSol] = useState<"AF" | "FC" | "DE" | "CO">("AF");
  const [numOrden, setNumOrden] = useState("");
  const [numTramite, setNumTramite] = useState("");
  const [cuentaFiltro, setCuentaFiltro] = useState("");

  const fnXml = useServerFn(exportarAnexo24Polizas);
  const fnTxt = useServerFn(exportarContpaqi);
  const fnAspel = useServerFn(exportarAspelCoi);
  const fnCat = useServerFn(exportarAnexo24Catalogo);
  const fnBal = useServerFn(exportarAnexo24Balanza);
  const fnZip = useServerFn(exportarExpedienteZip);
  const fnAuxC = useServerFn(exportarAnexo24AuxCuentas);
  const fnAuxF = useServerFn(exportarAnexo24AuxFolios);


  const dl = (contenido: string, filename: string, type: string) =>
    triggerFileDownload(new Blob([contenido], { type }), filename);

  const xmlMut = useMutation({
    mutationFn: () => fnXml({ data: { cliente_id: clienteId, anio, mes, tipo_solicitud: tipoSol, num_orden: numOrden || undefined, num_tramite: numTramite || undefined } }),
    onSuccess: (r) => { dl(r.contenido, r.filename, "application/xml"); toast.success(`Anexo 24 Pólizas · ${r.polizas} pólizas`); },
    onError: (e: any) => toast.error(e.message),
  });
  const txtMut = useMutation({
    mutationFn: () => fnTxt({ data: { cliente_id: clienteId, anio, mes } }),
    onSuccess: (r) => { dl(r.contenido, r.filename, "text/plain"); toast.success(`CONTPAQi · ${r.renglones} renglones`); },
    onError: (e: any) => toast.error(e.message),
  });
  const aspelMut = useMutation({
    mutationFn: () => fnAspel({ data: { cliente_id: clienteId, anio, mes } }),
    onSuccess: (r) => { dl(r.contenido, r.filename, "text/plain"); toast.success(`Aspel COI · ${r.renglones} renglones`); },
    onError: (e: any) => toast.error(e.message),
  });
  const catMut = useMutation({
    mutationFn: () => fnCat({ data: { cliente_id: clienteId, anio, mes } }),
    onSuccess: (r) => { dl(r.contenido, r.filename, "application/xml"); toast.success(`Catálogo Anexo 24 · ${r.cuentas} cuentas`); },
    onError: (e: any) => toast.error(e.message),
  });
  const balMut = useMutation({
    mutationFn: () => fnBal({ data: { cliente_id: clienteId, anio, mes, tipo_envio: "N" } }),
    onSuccess: (r) => { dl(r.contenido, r.filename, "application/xml"); toast.success(`Balanza Anexo 24 · ${r.cuentas} cuentas`); },
    onError: (e: any) => toast.error(e.message),
  });
  const zipMut = useMutation({
    mutationFn: () => fnZip({ data: { cliente_id: clienteId, anio, mes } }),
    onSuccess: (r) => {
      const bin = atob(r.contenido_b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      triggerFileDownload(new Blob([bytes], { type: "application/zip" }), r.filename);
      toast.success(`Expediente listo · ${r.stats.cfdi_emitidos + r.stats.cfdi_recibidos} CFDI · ${r.stats.polizas} pólizas · ${r.stats.tamano_kb} KB`);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const auxCMut = useMutation({
    mutationFn: () => fnAuxC({ data: { cliente_id: clienteId, anio, mes, tipo_solicitud: tipoSol, num_orden: numOrden || undefined, num_tramite: numTramite || undefined, cuenta_filtro: cuentaFiltro || undefined } }),
    onSuccess: (r) => { dl(r.contenido, r.filename, "application/xml"); toast.success(`Auxiliar de cuentas · ${r.cuentas} cuentas · ${r.movimientos} movs`); },
    onError: (e: any) => toast.error(e.message),
  });
  const auxFMut = useMutation({
    mutationFn: () => fnAuxF({ data: { cliente_id: clienteId, anio, mes, tipo_solicitud: tipoSol, num_orden: numOrden || undefined, num_tramite: numTramite || undefined } }),
    onSuccess: (r) => { dl(r.contenido, r.filename, "application/xml"); toast.success(`Auxiliar de folios · ${r.folios} CFDI`); },
    onError: (e: any) => toast.error(e.message),
  });





  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold">Exportar pólizas aprobadas</h3>
        <p className="text-sm text-muted-foreground">
          Genera archivos del período seleccionado. Solo se exportan las pólizas <strong>aprobadas</strong>.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
        <div>
          <Label>Año</Label>
          <Input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value) || now.getFullYear())} />
        </div>
        <div>
          <Label>Mes</Label>
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }).map((_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{String(i + 1).padStart(2, "0")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tipo solicitud (Anexo 24)</Label>
          <Select value={tipoSol} onValueChange={(v) => setTipoSol(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="AF">AF · Acto de fiscalización</SelectItem>
              <SelectItem value="FC">FC · Fiscalización compulsada</SelectItem>
              <SelectItem value="DE">DE · Devolución</SelectItem>
              <SelectItem value="CO">CO · Compensación</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>NumOrden / NumTrámite</Label>
          <div className="flex gap-1">
            <Input placeholder="Orden" value={numOrden} onChange={(e) => setNumOrden(e.target.value)} />
            <Input placeholder="Trámite" value={numTramite} onChange={(e) => setNumTramite(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Contabilidad Electrónica SAT (Anexo 24 v1.3)</div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => catMut.mutate()} disabled={catMut.isPending}>
              <FileCode2 className="h-4 w-4 mr-2" /> {catMut.isPending ? "..." : "Catálogo de cuentas (CT.xml)"}
            </Button>
            <Button onClick={() => balMut.mutate()} disabled={balMut.isPending}>
              <FileCode2 className="h-4 w-4 mr-2" /> {balMut.isPending ? "..." : "Balanza (BN.xml)"}
            </Button>
            <Button onClick={() => xmlMut.mutate()} disabled={xmlMut.isPending}>
              <FileCode2 className="h-4 w-4 mr-2" /> {xmlMut.isPending ? "..." : "Pólizas (PL.xml)"}
            </Button>
            <Button onClick={() => auxCMut.mutate()} disabled={auxCMut.isPending}>
              <FileCode2 className="h-4 w-4 mr-2" /> {auxCMut.isPending ? "..." : "Aux. cuentas (XC.xml)"}
            </Button>
            <Button onClick={() => auxFMut.mutate()} disabled={auxFMut.isPending}>
              <FileCode2 className="h-4 w-4 mr-2" /> {auxFMut.isPending ? "..." : "Aux. folios (XF.xml)"}
            </Button>
          </div>
          <div className="mt-2 max-w-xs">
            <Label className="text-xs text-muted-foreground">Filtrar Aux. cuentas por cuenta (opcional)</Label>
            <Input placeholder="ej. 601-01" value={cuentaFiltro} onChange={(e) => setCuentaFiltro(e.target.value)} />
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Importadores a sistemas contables</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => txtMut.mutate()} disabled={txtMut.isPending}>
              <Download className="h-4 w-4 mr-2" /> CONTPAQi (.txt)
            </Button>
            <Button variant="outline" onClick={() => aspelMut.mutate()} disabled={aspelMut.isPending}>
              <Download className="h-4 w-4 mr-2" /> Aspel COI (.txt)
            </Button>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Expediente completo del período</div>
          <p className="text-sm text-muted-foreground mb-2">Un solo ZIP con XML SAT, importadores, CFDI emitidos/recibidos, pólizas y resumen ejecutivo. Listo para entregar al contador.</p>
          <Button size="lg" onClick={() => zipMut.mutate()} disabled={zipMut.isPending}>
            <Download className="h-4 w-4 mr-2" /> {zipMut.isPending ? "Empaquetando..." : "Descargar Expediente ZIP"}
          </Button>
        </div>
      </div>

    </Card>
  );
}

