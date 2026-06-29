import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building, Plus, Trash2, Download, ArrowDownCircle } from "lucide-react";
import { ModuleScaffold, KpiTile, DemoCard } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useActiveCliente } from "@/lib/active-cliente";
import {
  listarActivos, upsertActivo, darBajaActivo, eliminarActivo, TASAS_SUGERIDAS,
} from "@/lib/activos/activos.functions";

export const Route = createFileRoute("/app/admin/activos")({ component: ActivosPage });

const CATS = Object.keys(TASAS_SUGERIDAS);
const fmt = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

function ActivosPage() {
  const { cliente } = useActiveCliente();
  const qc = useQueryClient();
  const listar = useServerFn(listarActivos);
  const upsert = useServerFn(upsertActivo);
  const baja = useServerFn(darBajaActivo);
  const eliminar = useServerFn(eliminarActivo);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["activos", cliente?.id ?? "all"],
    queryFn: () => listar({ data: cliente?.id ? { cliente_id: cliente.id } : {} }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["activos"] });

  const bajaMut = useMutation({
    mutationFn: (v: { id: string; motivo: string }) =>
      baja({ data: { id: v.id, baja_fecha: new Date().toISOString().slice(0, 10), baja_motivo: v.motivo, estado: "baja" } }),
    onSuccess: () => { toast.success("Activo dado de baja"); invalidate(); },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => eliminar({ data: { id } }),
    onSuccess: () => { toast.success("Eliminado"); invalidate(); },
  });

  const kpis = useMemo(() => {
    const activos = rows.filter((r: any) => r.estado === "activo");
    const moi = activos.reduce((s: number, r: any) => s + Number(r.moi || 0), 0);
    const acumF = activos.reduce((s: number, r: any) => s + (r.deprec_acum_fiscal || 0), 0);
    const libros = activos.reduce((s: number, r: any) => s + (r.valor_libros_fiscal || 0), 0);
    const mensual = activos.reduce((s: number, r: any) => s + (r.deprec_mensual_fiscal || 0), 0);
    return { count: activos.length, moi, acumF, libros, mensual };
  }, [rows]);

  function exportCSV() {
    const headers = [
      "codigo", "descripcion", "categoria", "fecha_adquisicion", "moi",
      "tasa_fiscal_anual", "meses_uso", "deprec_mensual_fiscal", "deprec_acum_fiscal",
      "valor_libros_fiscal", "pct_depreciado_fiscal", "estado",
    ];
    const lines = [headers.join(",")];
    rows.forEach((r: any) => {
      lines.push(headers.map((h) => {
        const v = r[h] ?? "";
        const s = String(v).replace(/"/g, '""');
        return /[,"\n]/.test(s) ? `"${s}"` : s;
      }).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `activos-fijos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <ModuleScaffold
      title="Activos Fijos"
      subtitle="Registro, depreciación lineal fiscal y contable, y cédula para declaración anual. Tasas LISR Art. 33-34 sugeridas por categoría."
      icon={<Building className="h-5 w-5" />}
      badge={null}
      actions={
        <>
          <HerramientaHelp slug="admin-activos" />
          <Button size="sm" variant="outline" onClick={exportCSV} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1" /> CSV cédula
          </Button>
          <ActivoDialog onSaved={invalidate} clienteId={cliente?.id} upsert={upsert} />
        </>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiTile label="Activos vigentes" value={String(kpis.count)} accent="primary" />
        <KpiTile label="MOI total" value={fmt(kpis.moi)} accent="primary" />
        <KpiTile label="Deprec. acum. fiscal" value={fmt(kpis.acumF)} accent="warning" />
        <KpiTile label="Valor en libros" value={fmt(kpis.libros)} accent="success" />
        <KpiTile label="Deprec. mensual" value={fmt(kpis.mensual)} />
      </div>

      {!isLoading && rows.length === 0 && (
        <DemoCard title="Sin activos registrados">
          <p className="text-sm text-muted-foreground">
            Da de alta el primer activo {cliente ? `de ${cliente.razon_social}` : ""}. Captura el MOI, la fecha de adquisición y la categoría; el sistema sugiere la tasa LISR y calcula la depreciación mes a mes con el método de línea recta.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Nota: esta versión usa depreciación de línea recta sin actualización por INPC. Para reexpresión inflacionaria, exporta la cédula y aplícala en tu papel de trabajo anual.
          </p>
        </DemoCard>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Activo</th>
                  <th className="text-left p-2">Categoría</th>
                  <th className="text-right p-2">MOI</th>
                  <th className="text-right p-2">Tasa fiscal</th>
                  <th className="text-right p-2">Meses</th>
                  <th className="text-right p-2">Deprec. mensual</th>
                  <th className="text-right p-2">Deprec. acum.</th>
                  <th className="text-right p-2">V. libros</th>
                  <th className="text-right p-2">%</th>
                  <th className="text-left p-2">Estado</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="p-2">
                      <div className="font-medium">{r.descripcion}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.codigo && <>#{r.codigo} · </>}{r.fecha_adquisicion}
                      </div>
                    </td>
                    <td className="p-2 text-xs">{TASAS_SUGERIDAS[r.categoria]?.label.split(" (")[0] || r.categoria}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(Number(r.moi))}</td>
                    <td className="p-2 text-right tabular-nums">{Number(r.tasa_fiscal_anual)}%</td>
                    <td className="p-2 text-right tabular-nums">{r.meses_uso}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(r.deprec_mensual_fiscal)}</td>
                    <td className="p-2 text-right tabular-nums text-amber-300">{fmt(r.deprec_acum_fiscal)}</td>
                    <td className="p-2 text-right tabular-nums text-emerald-300">{fmt(r.valor_libros_fiscal)}</td>
                    <td className="p-2 text-right tabular-nums text-xs">{r.pct_depreciado_fiscal}%</td>
                    <td className="p-2">
                      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${r.estado === "activo" ? "bg-emerald-500/10 text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                        {r.estado}
                      </span>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1 justify-end">
                        {r.estado === "activo" && (
                          <Button size="sm" variant="ghost" title="Dar de baja" onClick={() => {
                            const m = prompt("Motivo de baja:");
                            if (m) bajaMut.mutate({ id: r.id, motivo: m });
                          }}>
                            <ArrowDownCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm("¿Eliminar activo?")) delMut.mutate(r.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ModuleScaffold>
  );
}

function ActivoDialog({ onSaved, clienteId, upsert }: { onSaved: () => void; clienteId?: string; upsert: any }) {
  const [open, setOpen] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [codigo, setCodigo] = useState("");
  const [categoria, setCategoria] = useState<string>("equipo_computo");
  const [fechaAdq, setFechaAdq] = useState("");
  const [moi, setMoi] = useState("");
  const [tasaFiscal, setTasaFiscal] = useState("30");
  const [tasaContable, setTasaContable] = useState("25");
  const [residual, setResidual] = useState("0");
  const [proveedor, setProveedor] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [notas, setNotas] = useState("");

  function onCatChange(c: string) {
    setCategoria(c);
    const t = TASAS_SUGERIDAS[c];
    if (t) { setTasaFiscal(String(t.fiscal)); setTasaContable(String(t.contable)); }
  }

  const mut = useMutation({
    mutationFn: () => upsert({ data: {
      cliente_id: clienteId,
      codigo: codigo || undefined,
      descripcion,
      categoria: categoria as any,
      fecha_adquisicion: fechaAdq,
      moi: Number(moi),
      tasa_fiscal_anual: Number(tasaFiscal),
      tasa_contable_anual: Number(tasaContable),
      valor_residual: Number(residual) || 0,
      metodo: "linea_recta",
      estado: "activo",
      ubicacion, proveedor, notas,
    }}),
    onSuccess: () => {
      toast.success("Activo creado");
      setOpen(false); onSaved();
      setDescripcion(""); setCodigo(""); setFechaAdq(""); setMoi(""); setResidual("0");
      setProveedor(""); setUbicacion(""); setNotas("");
    },
    onError: (e: any) => toast.error(e?.message || "Error"),
  });

  const valid = descripcion.trim() && fechaAdq && Number(moi) > 0 && Number(tasaFiscal) > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo activo</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Alta de activo fijo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Descripción *</Label>
              <Input className="mt-1" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Laptop Dell Latitude 5440" />
            </div>
            <div>
              <Label className="text-xs">Código interno</Label>
              <Input className="mt-1" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="A-0123" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Categoría *</Label>
              <Select value={categoria} onValueChange={onCatChange}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATS.map((c) => <SelectItem key={c} value={c}>{TASAS_SUGERIDAS[c].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fecha de adquisición *</Label>
              <Input type="date" className="mt-1" value={fechaAdq} onChange={(e) => setFechaAdq(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">MOI (sin IVA) *</Label>
              <Input type="number" min="0" step="0.01" className="mt-1" value={moi} onChange={(e) => setMoi(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">% Fiscal anual *</Label>
              <Input type="number" min="0.1" max="100" step="0.1" className="mt-1" value={tasaFiscal} onChange={(e) => setTasaFiscal(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">% Contable anual</Label>
              <Input type="number" min="0.1" max="100" step="0.1" className="mt-1" value={tasaContable} onChange={(e) => setTasaContable(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Valor residual</Label>
              <Input type="number" min="0" step="0.01" className="mt-1" value={residual} onChange={(e) => setResidual(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Proveedor</Label>
              <Input className="mt-1" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Ubicación</Label>
              <Input className="mt-1" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea className="mt-1" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
          <Button className="w-full" disabled={!valid || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Guardando…" : "Guardar activo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
