import { createFileRoute } from "@tanstack/react-router";
import { ModuleScaffold, KpiTile, DemoCard } from "@/components/ModuleScaffold";
import { TrendingUp, Plus, Trash2, Check, X, Upload, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listTesoreria, upsertCuenta, deleteCuenta, bulkInsertCuentas, seedDemoTesoreria } from "@/lib/tesoreria/tesoreria.functions";
import { listClientesLite } from "@/lib/tramites/tramites.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImportDialog, type ColSpec } from "@/components/ImportDialog";
import { toast } from "sonner";

const CUENTA_COLS: ColSpec[] = [
  { key: "contraparte", label: "contraparte", required: true, example: "Constructora Vega SA", hint: "Nombre del cliente o proveedor" },
  { key: "concepto", label: "concepto", example: "Factura A-1042" },
  { key: "monto", label: "monto", required: true, example: "184200", hint: "Solo número, sin signo $ ni comas" },
  { key: "moneda", label: "moneda", example: "MXN", hint: "Por defecto MXN" },
  { key: "fecha_emision", label: "fecha_emision", required: true, example: "2026-06-01", hint: "Formato YYYY-MM-DD" },
  { key: "fecha_vencimiento", label: "fecha_vencimiento", required: true, example: "2026-07-01", hint: "Formato YYYY-MM-DD" },
  { key: "estado", label: "estado", example: "pendiente", hint: "pendiente | cobrado/pagado | cancelado" },
];

export const Route = createFileRoute("/app/admin/tesoreria")({ component: TesPage });

type Row = {
  id: string; contraparte: string; concepto: string | null; monto: number; moneda: string;
  fecha_emision: string; fecha_vencimiento: string; estado: string; cliente_id: string | null; notas: string | null;
};

const fmt = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, d: number) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) + (d ?? 0);
function normalizeDate(v: any): string {
  if (!v) return todayISO();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // Excel serial number
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 25569) {
    const ms = (Number(s) - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  // DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const yy = dmy[3].length === 2 ? "20" + dmy[3] : dmy[3];
    return `${yy}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  // YYYY-MM-DD or parseable
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return todayISO();
}

function TesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listTesoreria);
  const upsert = useServerFn(upsertCuenta);
  const del = useServerFn(deleteCuenta);
  const listClientes = useServerFn(listClientesLite);

  const { data, isLoading } = useQuery({ queryKey: ["tesoreria"], queryFn: () => list() });
  const { data: clientesData } = useQuery({ queryKey: ["clientes-lite"], queryFn: () => listClientes() });

  const cxc = (data?.cxc ?? []) as Row[];
  const cxp = (data?.cxp ?? []) as Row[];

  const kpis = useMemo(() => {
    const cobrar30 = cxc.filter(r => r.estado === "pendiente" && addDays(r.fecha_vencimiento, 0) <= 30).reduce((a, r) => a + Number(r.monto), 0);
    const pagar30 = cxp.filter(r => r.estado === "pendiente" && addDays(r.fecha_vencimiento, 0) <= 30).reduce((a, r) => a + Number(r.monto), 0);
    const cobrar90 = cxc.filter(r => r.estado === "pendiente" && addDays(r.fecha_vencimiento, 0) <= 90).reduce((a, r) => a + Number(r.monto), 0);
    const pagar90 = cxp.filter(r => r.estado === "pendiente" && addDays(r.fecha_vencimiento, 0) <= 90).reduce((a, r) => a + Number(r.monto), 0);
    const vencidos = cxc.filter(r => r.estado === "pendiente" && addDays(r.fecha_vencimiento, 0) < 0).reduce((a, r) => a + Number(r.monto), 0);
    return { cobrar30, pagar30, neto90: cobrar90 - pagar90, vencidos };
  }, [cxc, cxp]);

  // Proyección 30 días: saldo acumulado neto día a día
  const flow = useMemo(() => {
    const days = 30;
    const arr = new Array(days).fill(0);
    cxc.filter(r => r.estado === "pendiente").forEach(r => {
      const d = addDays(r.fecha_vencimiento, 0);
      if (d >= 0 && d < days) arr[d] += Number(r.monto);
    });
    cxp.filter(r => r.estado === "pendiente").forEach(r => {
      const d = addDays(r.fecha_vencimiento, 0);
      if (d >= 0 && d < days) arr[d] -= Number(r.monto);
    });
    let acc = 0;
    return arr.map(v => (acc += v));
  }, [cxc, cxp]);

  const max = Math.max(1, ...flow.map(Math.abs));
  const path = flow.map((p, i) => `${i === 0 ? "M" : "L"} ${(i / Math.max(1, flow.length - 1)) * 100} ${50 - (p / max) * 40}`).join(" ");

  const delMut = useMutation({
    mutationFn: (v: { id: string; tipo: "cxc" | "cxp" }) => del({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tesoreria"] }); toast.success("Eliminado"); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const markPaid = useMutation({
    mutationFn: (v: Row & { tipo: "cxc" | "cxp" }) => upsert({ data: {
      id: v.id, tipo: v.tipo, contraparte: v.contraparte, concepto: v.concepto, monto: Number(v.monto),
      moneda: v.moneda, fecha_emision: v.fecha_emision, fecha_vencimiento: v.fecha_vencimiento,
      estado: v.tipo === "cxc" ? "cobrado" : "pagado", cliente_id: v.cliente_id, notas: v.notas,
    }}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tesoreria"] }); toast.success("Marcado como pagado"); },
  });

  const [open, setOpen] = useState<null | "cxc" | "cxp">(null);
  const [importOpen, setImportOpen] = useState<null | "cxc" | "cxp">(null);

  const bulkFn = useServerFn(bulkInsertCuentas);
  const seedFn = useServerFn(seedDemoTesoreria);
  const seedMut = useMutation({
    mutationFn: () => seedFn(),
    onSuccess: (r: any) => { toast.success(`Cargados ${r.cxc} CXC y ${r.cxp} CXP demo`); qc.invalidateQueries({ queryKey: ["tesoreria"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <ModuleScaffold
      title="Tesorería & Flujo de Caja"
      subtitle="Cuentas por cobrar y pagar reales del despacho. Proyección automática a 30 días."
      icon={<TrendingUp className="h-5 w-5" />}
      badge={null}
      actions={<>
        <Button size="sm" variant="outline" onClick={() => setOpen("cxc")}><Plus className="h-3.5 w-3.5" /> CXC</Button>
        <Button size="sm" variant="outline" onClick={() => setOpen("cxp")}><Plus className="h-3.5 w-3.5" /> CXP</Button>
        <Button size="sm" variant="outline" onClick={() => setImportOpen("cxc")}><Upload className="h-3.5 w-3.5" /> Importar CXC</Button>
        <Button size="sm" variant="outline" onClick={() => setImportOpen("cxp")}><Upload className="h-3.5 w-3.5" /> Importar CXP</Button>
        <Button size="sm" variant="ghost" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}><Sparkles className="h-3.5 w-3.5" /> Cargar demo</Button>
      </>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Por cobrar 30d" value={fmt(kpis.cobrar30)} accent="gold" />
        <KpiTile label="Por pagar 30d" value={fmt(kpis.pagar30)} accent="warning" />
        <KpiTile label="Flujo neto 90d" value={`${kpis.neto90 >= 0 ? "+" : ""}${fmt(kpis.neto90)}`} accent={kpis.neto90 >= 0 ? "success" : "destructive"} />
        <KpiTile label="Vencidos por cobrar" value={fmt(kpis.vencidos)} accent="destructive" />
      </div>

      <DemoCard title="Proyección flujo neto 30 días" className="mt-6">
        {isLoading ? (
          <div className="h-48 grid place-items-center text-xs text-muted-foreground">Cargando…</div>
        ) : (
          <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="w-full h-48">
            <line x1="0" y1="50" x2="100" y2="50" stroke="oklch(0.4 0 0)" strokeWidth="0.2" />
            <path d={path} fill="none" stroke="oklch(0.78 0.13 85)" strokeWidth="0.8" />
          </svg>
        )}
      </DemoCard>

      <div className="grid md:grid-cols-2 gap-3 mt-3">
        <TablaCuentas tipo="cxc" rows={cxc} onDelete={(id) => delMut.mutate({ id, tipo: "cxc" })} onPay={(r) => markPaid.mutate({ ...r, tipo: "cxc" })} />
        <TablaCuentas tipo="cxp" rows={cxp} onDelete={(id) => delMut.mutate({ id, tipo: "cxp" })} onPay={(r) => markPaid.mutate({ ...r, tipo: "cxp" })} />
      </div>

      {open && (
        <CuentaDialog
          tipo={open}
          clientes={clientesData?.clientes ?? []}
          onClose={() => setOpen(null)}
          onSave={async (payload) => {
            try {
              await upsert({ data: { ...payload, tipo: open } });
              toast.success("Guardado");
              setOpen(null);
              qc.invalidateQueries({ queryKey: ["tesoreria"] });
            } catch (e: any) { toast.error(e?.message ?? "Error"); }
          }}
        />
      )}

      <ImportDialog
        open={!!importOpen}
        onClose={() => setImportOpen(null)}
        title={importOpen === "cxp" ? "Cuentas por pagar" : "Cuentas por cobrar"}
        columns={CUENTA_COLS}
        templateRows={[
          { contraparte: "Constructora Vega SA", concepto: "Factura A-1042", monto: 184200, moneda: "MXN", fecha_emision: "2026-06-01", fecha_vencimiento: "2026-07-01", estado: "pendiente" },
          { contraparte: "Servicios Olmeca", concepto: "Honorarios", monto: 96800, moneda: "MXN", fecha_emision: "2026-06-10", fecha_vencimiento: "2026-07-10", estado: "pendiente" },
        ]}
        helpNote={<>El campo <b>estado</b> acepta: <code>pendiente</code>, <code>{importOpen === "cxp" ? "pagado" : "cobrado"}</code> o <code>cancelado</code>. Las fechas pueden venir como número de Excel; se convertirán automáticamente.</>}
        onImport={async (rows) => {
          const tipo = importOpen!;
          const valid = ["pendiente", tipo === "cxc" ? "cobrado" : "pagado", "cancelado"];
          const payload = rows.map((r) => ({
            contraparte: String(r.contraparte),
            concepto: r.concepto ? String(r.concepto) : null,
            monto: Number(String(r.monto).replace(/[^0-9.\-]/g, "")) || 0,
            moneda: r.moneda ? String(r.moneda) : "MXN",
            fecha_emision: normalizeDate(r.fecha_emision),
            fecha_vencimiento: normalizeDate(r.fecha_vencimiento),
            estado: valid.includes(String(r.estado).toLowerCase()) ? String(r.estado).toLowerCase() : "pendiente",
          }));
          try {
            const res: any = await bulkFn({ data: { tipo, rows: payload } });
            toast.success(`Importadas ${res.inserted} filas`);
            qc.invalidateQueries({ queryKey: ["tesoreria"] });
          } catch (e: any) { toast.error(e?.message ?? "Error al importar"); }
        }}
      />
    </ModuleScaffold>
  );
}

function TablaCuentas({ tipo, rows, onDelete, onPay }: {
  tipo: "cxc" | "cxp"; rows: Row[]; onDelete: (id: string) => void; onPay: (r: Row) => void;
}) {
  const pending = rows.filter(r => r.estado === "pendiente");
  return (
    <DemoCard title={tipo === "cxc" ? `Cuentas por cobrar · ${pending.length}` : `Cuentas por pagar · ${pending.length}`}>
      {!pending.length ? (
        <div className="text-xs text-muted-foreground py-6 text-center">Sin movimientos pendientes.</div>
      ) : (
        <ul className="space-y-1.5">
          {pending.map((r) => {
            const d = addDays(r.fecha_vencimiento, 0);
            const tone = d < 0 ? "text-red-300" : d <= 7 ? "text-amber-300" : "text-emerald-300";
            const label = d < 0 ? `vencido ${-d}d` : d === 0 ? "hoy" : `en ${d}d`;
            return (
              <li key={r.id} className="flex items-center justify-between text-xs gap-2 py-1 border-b border-border/30 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{r.contraparte}</div>
                  {r.concepto && <div className="truncate text-[10px] text-muted-foreground">{r.concepto}</div>}
                </div>
                <span className="font-mono">{fmt(Number(r.monto))}</span>
                <span className={`text-[10px] ${tone} w-20 text-right`}>{label}</span>
                <button className="text-emerald-400 hover:text-emerald-300" onClick={() => onPay(r)} title={tipo === "cxc" ? "Marcar cobrado" : "Marcar pagado"}><Check className="h-3.5 w-3.5" /></button>
                <button className="text-muted-foreground hover:text-red-400" onClick={() => onDelete(r.id)} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            );
          })}
        </ul>
      )}
    </DemoCard>
  );
}

function CuentaDialog({ tipo, clientes, onClose, onSave }: {
  tipo: "cxc" | "cxp"; clientes: { id: string; rfc: string; razon_social: string }[];
  onClose: () => void; onSave: (p: any) => void;
}) {
  const [contraparte, setC] = useState("");
  const [concepto, setCo] = useState("");
  const [monto, setM] = useState("");
  const [vto, setV] = useState(todayISO());
  const [cliente_id, setCli] = useState<string>("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nueva {tipo === "cxc" ? "cuenta por cobrar" : "cuenta por pagar"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>{tipo === "cxc" ? "Cliente / pagador" : "Proveedor"}</Label>
            <Input value={contraparte} onChange={(e) => setC(e.target.value)} placeholder="Ej. Constructora Vega SA" /></div>
          <div><Label>Concepto</Label>
            <Input value={concepto} onChange={(e) => setCo(e.target.value)} placeholder="Factura A-123, anticipo, etc." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Monto MXN</Label><Input type="number" value={monto} onChange={(e) => setM(e.target.value)} /></div>
            <div><Label>Vencimiento</Label><Input type="date" value={vto} onChange={(e) => setV(e.target.value)} /></div>
          </div>
          <div><Label>Expediente (opcional)</Label>
            <select value={cliente_id} onChange={(e) => setCli(e.target.value)} className="w-full h-10 rounded-md border border-border bg-input/40 px-3 text-sm">
              <option value="">— Ninguno —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social} ({c.rfc})</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}><X className="h-4 w-4" /> Cancelar</Button>
          <Button onClick={() => {
            if (!contraparte || !monto || !vto) { toast.error("Completa los campos requeridos"); return; }
            onSave({ contraparte, concepto, monto: Number(monto), moneda: "MXN",
              fecha_emision: todayISO(), fecha_vencimiento: vto, estado: "pendiente",
              cliente_id: cliente_id || null });
          }}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
