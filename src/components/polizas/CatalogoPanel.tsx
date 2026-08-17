import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Loader2, AlertTriangle, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { triggerFileDownload } from "@/lib/download";
import { parsearCatalogo, PLANTILLA_CATALOGO_CSV, type FilaCatalogo } from "@/lib/catalogo/importar";
import { importarCatalogo, listarCatalogoCuentas } from "@/lib/catalogo/catalogo.functions";

export function CatalogoPanel({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listarCatalogoCuentas);
  const importFn = useServerFn(importarCatalogo);
  const [modo, setModo] = useState<"agregar" | "agregar_actualizar">("agregar_actualizar");
  const [pendiente, setPendiente] = useState<{ filas: FilaCatalogo[]; huella: string; avisos: string[] } | null>(null);

  const cat = useQuery({
    queryKey: ["catalogo-cuentas", clienteId],
    queryFn: () => listFn({ data: { cliente_id: clienteId, incluir_inactivas: true } }),
    enabled: Boolean(clienteId),
  });

  const importar = useMutation({
    mutationFn: async () => {
      if (!pendiente) throw new Error("Primero elige un archivo.");
      return importFn({
        data: { cliente_id: clienteId, modo, huella: pendiente.huella, cuentas: pendiente.filas },
      });
    },
    onSuccess: (r: any) => {
      if (!r.guardado) {
        toast.error(`No se guardó nada: ${r.errores?.length ?? 0} filas con problema.`);
        return;
      }
      setPendiente(null);
      qc.invalidateQueries({ queryKey: ["catalogo-cuentas", clienteId] });
      toast.success(`${r.altas} altas y ${r.actualizadas} actualizaciones aplicadas.`);
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo importar."),
  });

  async function elegirArchivo(file: File) {
    try {
      const res = await parsearCatalogo(file);
      if (!res.filas.length) {
        toast.error("No se reconoció ninguna cuenta. Revisa los encabezados del archivo.");
        return;
      }
      setPendiente(res);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo leer el archivo.");
    }
  }

  const faltantes = cat.data?.faltantes ?? [];

  return (
    <div className="space-y-4">
      {faltantes.length > 0 && (
        <Card className="p-3 border-amber-500/40 bg-amber-500/5 text-xs flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <span>
            El catálogo aún no identifica estas cuentas de sistema: <b>{faltantes.join(", ")}</b>. Sin ellas, las
            pólizas se generan con renglones “POR IDENTIFICAR” y no pueden aprobarse.
          </span>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Modo de importación</Label>
            <Select value={modo} onValueChange={(v) => setModo(v as typeof modo)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="agregar">Sólo agregar cuentas nuevas</SelectItem>
                <SelectItem value="agregar_actualizar">Agregar y actualizar existentes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label>
            <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) elegirArchivo(f); }} />
            <span className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border text-sm cursor-pointer hover:bg-accent">
              <Upload className="h-4 w-4" /> Elegir archivo CSV o XLSX
            </span>
          </label>
          <Button variant="ghost" size="sm" onClick={() =>
            triggerFileDownload(new Blob([PLANTILLA_CATALOGO_CSV], { type: "text/csv" }), "catalogo-plantilla.csv")}>
            <Download className="h-4 w-4" /> Plantilla
          </Button>
        </div>

        {pendiente && (
          <div className="rounded-lg border border-border p-3 space-y-2 text-xs">
            <div className="font-medium">{pendiente.filas.length} cuentas listas para revisar</div>
            {pendiente.avisos.slice(0, 5).map((a) => (
              <div key={a} className="text-amber-300">{a}</div>
            ))}
            <div className="text-muted-foreground">
              La importación es todo o nada: si una fila falla, no se guarda ninguna y se explica el motivo.
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => importar.mutate()} disabled={importar.isPending}>
                {importar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Importar catálogo
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPendiente(null)}>Cancelar</Button>
            </div>
            {(importar.data as any)?.errores?.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-border/40">
                {((importar.data as any).errores as any[]).slice(0, 10).map((e, i) => (
                  <div key={i} className="text-destructive">
                    Fila {e.fila ?? "?"} {e.codigo ? `(${e.codigo})` : ""}: {e.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Naturaleza</TableHead>
              <TableHead>Agrupador SAT</TableHead>
              <TableHead>Nivel</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(cat.data?.cuentas ?? []).map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.codigo}</TableCell>
                <TableCell className="text-xs">{c.nombre}</TableCell>
                <TableCell className="text-xs">{c.naturaleza}</TableCell>
                <TableCell className="text-xs">{c.tipo_sat ?? "—"}</TableCell>
                <TableCell className="text-xs">{c.nivel ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={c.activa ? "secondary" : "outline"}>{c.activa ? "activa" : "inactiva"}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {!cat.isLoading && !(cat.data?.cuentas ?? []).length && (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground text-center py-6">
                  Este expediente todavía no tiene catálogo de cuentas.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
