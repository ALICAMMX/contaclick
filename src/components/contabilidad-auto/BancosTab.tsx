import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  listarMovimientosSinPoliza,
  generarPolizasDesdeMovimientos,
} from "@/lib/contabilidad-auto/bancos.functions";

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

/** Pólizas desde movimientos bancarios sin CFDI (comisiones, traspasos, impuestos). */
export function BancosTab({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const fnList = useServerFn(listarMovimientosSinPoliza);
  const fnGen = useServerFn(generarPolizasDesdeMovimientos);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["movs-sin-poliza", clienteId],
    queryFn: () => fnList({ data: { cliente_id: clienteId, limit: 300 } }),
    enabled: !!clienteId,
  });

  const gen = useMutation({
    mutationFn: () => fnGen({ data: { cliente_id: clienteId, movimiento_ids: Array.from(sel) } }),
    onSuccess: (r) => {
      toast.success(`${r.insertadas} pólizas generadas${r.omitidos ? `, ${r.omitidos} omitidas` : ""}`);
      setSel(new Set());
      qc.invalidateQueries({ queryKey: ["movs-sin-poliza"] });
      qc.invalidateQueries({ queryKey: ["polizas-borrador"] });
      qc.invalidateQueries({ queryKey: ["polizas-canonicas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error generando pólizas"),
  });

  const rows = q.data ?? [];
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          {sel.size > 0 ? `${sel.size} movimientos seleccionados` : "Movimientos bancarios sin póliza"}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            setSel(sel.size === rows.length ? new Set() : new Set(rows.map((r: any) => r.id)));
          }}>
            {sel.size === rows.length && sel.size > 0 ? "Quitar selección" : "Seleccionar todos"}
          </Button>
          <Button onClick={() => gen.mutate()} disabled={sel.size === 0 || gen.isPending}>
            <Wand2 className="h-4 w-4 mr-2" />
            {gen.isPending ? "Generando..." : `Generar ${sel.size || ""} pólizas`}
          </Button>
        </div>
      </div>
      <div className="rounded border overflow-auto max-h-[600px]">
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
            {rows.map((m: any) => (
              <TableRow key={m.id} className="cursor-pointer" onClick={() => {
                const ns = new Set(sel);
                ns.has(m.id) ? ns.delete(m.id) : ns.add(m.id);
                setSel(ns);
              }}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={sel.has(m.id)} onCheckedChange={(v) => {
                    const ns = new Set(sel);
                    v ? ns.add(m.id) : ns.delete(m.id);
                    setSel(ns);
                  }} />
                </TableCell>
                <TableCell className="text-xs">{String(m.fecha).slice(0, 10)}</TableCell>
                <TableCell className="truncate max-w-[360px]">{m.descripcion ?? "—"}</TableCell>
                <TableCell className="text-xs">{m.referencia ?? ""}</TableCell>
                <TableCell className="text-right font-mono">{Number(m.cargo) > 0 ? mxn(m.cargo) : ""}</TableCell>
                <TableCell className="text-right font-mono">{Number(m.abono) > 0 ? mxn(m.abono) : ""}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                Sin movimientos pendientes. Importa estados de cuenta en Conciliación bancaria.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
