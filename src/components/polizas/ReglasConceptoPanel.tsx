import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Check, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listarCatalogoCuentas } from "@/lib/catalogo/catalogo.functions";
import {
  conceptosPendientesPeriodo,
  guardarReglaConcepto,
  listarReglasConcepto,
} from "@/lib/reglas/reglas.functions";

const mxn = (c: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(c || 0) / 100);

export function ReglasConceptoPanel({ clienteId, periodo }: { clienteId: string; periodo: string }) {
  const qc = useQueryClient();
  const conceptosFn = useServerFn(conceptosPendientesPeriodo);
  const reglasFn = useServerFn(listarReglasConcepto);
  const catFn = useServerFn(listarCatalogoCuentas);
  const guardarFn = useServerFn(guardarReglaConcepto);

  const [edit, setEdit] = useState<null | {
    clave: string;
    cuenta: string;
    tratamiento_iva: string;
    tipo_operacion: string;
    motivo: string;
  }>(null);

  const conceptos = useQuery({
    queryKey: ["conceptos-pendientes", clienteId, periodo],
    queryFn: () => conceptosFn({ data: { cliente_id: clienteId, periodo } }),
    enabled: Boolean(clienteId),
  });
  const reglas = useQuery({
    queryKey: ["reglas-concepto", clienteId],
    queryFn: () => reglasFn({ data: { cliente_id: clienteId, incluir_inactivas: false } }),
    enabled: Boolean(clienteId),
  });
  const cat = useQuery({
    queryKey: ["catalogo-cuentas", clienteId],
    queryFn: () => catFn({ data: { cliente_id: clienteId, incluir_inactivas: false } }),
    enabled: Boolean(clienteId),
  });

  const guardar = useMutation({
    mutationFn: async () => {
      if (!edit) throw new Error("Sin cambios.");
      if (!edit.cuenta) throw new Error("Elige la cuenta contable.");
      if (edit.motivo.trim().length < 10) throw new Error("Escribe un motivo de al menos 10 caracteres.");
      return guardarFn({
        data: {
          cliente_id: clienteId,
          clave_prod_serv: edit.clave,
          cuenta: edit.cuenta,
          tratamiento_iva: edit.tratamiento_iva as any,
          tipo_operacion: edit.tipo_operacion as any,
          vigencia_desde: `${periodo}-01`,
          origen: "contador",
          motivo: edit.motivo.trim(),
        },
      });
    },
    onSuccess: () => {
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["conceptos-pendientes", clienteId, periodo] });
      qc.invalidateQueries({ queryKey: ["reglas-concepto", clienteId] });
      toast.success("Regla guardada con versión y motivo.");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar la regla."),
  });

  const sinResolver = conceptos.data?.sin_resolver ?? 0;

  return (
    <div className="space-y-4">
      {sinResolver > 0 && (
        <Card className="p-3 border-amber-500/40 bg-amber-500/5 text-xs flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <span>
            {sinResolver} conceptos del periodo todavía no resuelven una cuenta vigente. Sus pólizas quedan como
            borrador “por identificar” y no pueden aprobarse hasta asignarlos.
          </span>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Clave SAT</TableHead>
              <TableHead>Descripción de ejemplo</TableHead>
              <TableHead className="text-right">Conceptos</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead>Resolución</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(conceptos.data?.grupos ?? []).map((g: any) => (
              <TableRow key={g.clave_prod_serv}>
                <TableCell className="font-mono text-xs">{g.clave_prod_serv}</TableCell>
                <TableCell className="text-xs max-w-[280px] truncate">{g.descripcion_ejemplo}</TableCell>
                <TableCell className="text-right text-xs">{g.conceptos}</TableCell>
                <TableCell className="text-right text-xs">{mxn(g.importe_centavos)}</TableCell>
                <TableCell className="text-xs">
                  {g.estado === "resuelta" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <Check className="h-3.5 w-3.5" /> {g.cuenta}
                    </span>
                  ) : (
                    <Badge variant="outline">{g.motivo ?? "Sin regla vigente"}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setEdit({
                    clave: g.clave_prod_serv,
                    cuenta: g.cuenta ?? "",
                    tratamiento_iva: "trasladado",
                    tipo_operacion: "ingreso",
                    motivo: "",
                  })}>
                    {g.estado === "resuelta" ? "Cambiar" : "Asignar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!conceptos.isLoading && !(conceptos.data?.grupos ?? []).length && (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground text-center py-6">
                  No hay conceptos de CFDI en {periodo}.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {edit && (
        <Card className="p-4 space-y-3">
          <div className="text-sm font-medium">Regla para la clave {edit.clave}</div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Cuenta contable</Label>
              <Select value={edit.cuenta} onValueChange={(v) => setEdit({ ...edit, cuenta: v })}>
                <SelectTrigger><SelectValue placeholder="Elige del catálogo" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {(cat.data?.cuentas ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.codigo}>{c.codigo} · {c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tratamiento de IVA</Label>
              <Select value={edit.tratamiento_iva} onValueChange={(v) => setEdit({ ...edit, tratamiento_iva: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["trasladado", "acreditable", "exento", "tasa_cero", "no_objeto", "sin_iva"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo de operación</Label>
              <Select value={edit.tipo_operacion} onValueChange={(v) => setEdit({ ...edit, tipo_operacion: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["ingreso", "gasto", "activo", "otro"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Motivo (obligatorio, queda versionado)</Label>
            <Textarea rows={2} value={edit.motivo} onChange={(e) => setEdit({ ...edit, motivo: e.target.value })}
              placeholder="Explica por qué este concepto va a esa cuenta." />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
              {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Guardar regla
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          </div>
          <div className="text-[11px] text-muted-foreground">
            La regla aplica desde {periodo}-01. Las reglas anteriores se conservan en el historial; las pólizas ya
            aprobadas no cambian.
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="text-sm font-medium mb-2">Reglas vigentes ({(reglas.data ?? []).length})</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Clave</TableHead>
              <TableHead>Contraparte</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead>IVA</TableHead>
              <TableHead>Desde</TableHead>
              <TableHead>Origen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(reglas.data ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.clave_prod_serv}</TableCell>
                <TableCell className="text-xs">{r.rfc_contraparte ?? "todas"}</TableCell>
                <TableCell className="font-mono text-xs">{r.cuenta}</TableCell>
                <TableCell className="text-xs">{r.tratamiento_iva}</TableCell>
                <TableCell className="text-xs">{r.vigencia_desde}</TableCell>
                <TableCell className="text-xs">
                  <Badge variant={r.origen === "contador" ? "secondary" : "outline"}>{r.origen} v{r.version}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
