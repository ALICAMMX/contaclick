import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Download, AlertTriangle, ArrowLeft, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  getSatPacSaldo, recargarSatPac, ajustarSatPacConfig,
} from "@/lib/admin-panel/sat-pac.functions";
import { getSatCronSalud } from "@/lib/sat/cron-salud.functions";


export const Route = createFileRoute("/app/admin-sat-saldo")({
  component: SatSaldoPage,
});

function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("es-MX");
}
function mxn(centavos: number | null | undefined) {
  return `$${((centavos ?? 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
}

function SatSaldoPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSatPacSaldo);
  const recargarFn = useServerFn(recargarSatPac);
  const ajustarFn = useServerFn(ajustarSatPacConfig);

  const q = useQuery({
    queryKey: ["sat-pac-saldo"],
    queryFn: () => getFn(),
    staleTime: 30_000,
  });

  const [solRec, setSolRec] = useState("");
  const [costoRec, setCostoRec] = useState("");
  const [refRec, setRefRec] = useState("");
  const [umbral, setUmbral] = useState("");
  const [costoUnit, setCostoUnit] = useState("");

  const recargar = useMutation({
    mutationFn: () =>
      recargarFn({
        data: {
          solicitudes: parseInt(solRec, 10),
          costo_total_mxn: parseFloat(costoRec),
          referencia: refRec.trim(),
          confirmacion: "RECARGAR" as const,
        },
      }),
    onSuccess: () => {
      toast.success("Recarga registrada");
      setSolRec(""); setCostoRec(""); setRefRec("");
      qc.invalidateQueries({ queryKey: ["sat-pac-saldo"] });
      // El candado de "Sincronizar ahora" depende de este saldo: se refresca al instante.
      qc.invalidateQueries({ queryKey: ["sat-sync"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const ajustar = useMutation({
    mutationFn: () =>
      ajustarFn({
        data: {
          umbral_aviso: umbral ? parseInt(umbral, 10) : undefined,
          costo_unitario_centavos: costoUnit
            ? Math.round(parseFloat(costoUnit) * 100)
            : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Configuración actualizada");
      setUmbral(""); setCostoUnit("");
      qc.invalidateQueries({ queryKey: ["sat-pac-saldo"] });
      qc.invalidateQueries({ queryKey: ["sat-sync"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  if (q.isLoading) return <div className="p-6 text-sm">Cargando…</div>;
  if (q.error)
    return (
      <div className="p-6 text-sm text-destructive">
        {(q.error as any)?.message ?? "Acceso denegado"}
      </div>
    );

  const d = q.data!;
  const saldo = d.saldo;
  const disponible = d.disponible;
  const saldoBajo = disponible <= (d.umbral_aviso ?? 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/app/admin-panel" className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Volver al panel admin
          </Link>
          <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Saldo PAC SAT (SW Sapien)
          </h1>
          <p className="text-sm text-muted-foreground">
            Control global de descargas masivas SAT — periodo {d.periodo}.
          </p>
        </div>
      </div>

      {saldoBajo && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-destructive">Saldo bajo</p>
            <p className="text-muted-foreground">
              El saldo está por debajo del umbral de aviso ({fmt(d.umbral_aviso)}).
              Mientras dure, el botón “Sincronizar ahora” queda deshabilitado para todos los despachos.
              Registra una recarga para no interrumpir las descargas SAT de los clientes.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat label="Saldo disponible" value={fmt(disponible)} sub={`solicitudes · ${fmt(d.reservado)} reservadas`} />
        <Stat label="Costo unitario" value={mxn(saldo?.costo_unitario_centavos)} sub="por solicitud" />
        <Stat label="Consumo del mes" value={fmt(d.total_mes)} sub={`${fmt(d.ritmo_diario)}/día`} />
        <Stat
          label="Días restantes"
          value={d.dias_restantes !== null ? `${d.dias_restantes}` : "—"}
          sub={d.dias_restantes !== null ? "al ritmo actual" : "sin consumo aún"}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> Registrar recarga</h2>
          <p className="text-xs text-muted-foreground">
            Cuando compres un paquete a SW Sapien, captura aquí cuántas solicitudes incluyó y
            el costo total en MXN. El sistema recalcula el costo unitario automáticamente.
          </p>
          <div className="space-y-2">
            <Label className="text-xs">Solicitudes compradas</Label>
            <Input type="number" value={solRec} onChange={(e) => setSolRec(e.target.value)} placeholder="10000" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Costo total MXN (con IVA)</Label>
            <Input type="number" step="0.01" value={costoRec} onChange={(e) => setCostoRec(e.target.value)} placeholder="500.00" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Referencia del comprobante</Label>
            <Input value={refRec} onChange={(e) => setRefRec(e.target.value)} placeholder="Factura SW-12345" />
            <p className="text-[11px] text-muted-foreground">
              Sirve como llave de idempotencia: registrar dos veces el mismo comprobante no duplica el saldo.
            </p>
          </div>
          <Button
            disabled={!solRec || !costoRec || refRec.trim().length < 3 || recargar.isPending}
            onClick={() => recargar.mutate()}
            className="w-full"
          >
            {recargar.isPending ? "Guardando…" : "Registrar recarga"}
          </Button>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-4">
          <h2 className="font-semibold">Configuración</h2>
          <div className="space-y-2">
            <Label className="text-xs">Umbral de aviso (solicitudes)</Label>
            <Input
              type="number" value={umbral} onChange={(e) => setUmbral(e.target.value)}
              placeholder={String(saldo?.umbral_aviso ?? 1000)}
            />
            <p className="text-[11px] text-muted-foreground">
              Cuando el saldo quede por debajo de este número, se emite alerta global y se bloquean nuevas corridas.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Costo unitario MXN (override)</Label>
            <Input
              type="number" step="0.01" value={costoUnit} onChange={(e) => setCostoUnit(e.target.value)}
              placeholder={mxn(saldo?.costo_unitario_centavos)}
            />
          </div>
          <Button
            variant="outline"
            disabled={(!umbral && !costoUnit) || ajustar.isPending}
            onClick={() => ajustar.mutate()}
            className="w-full"
          >
            {ajustar.isPending ? "Guardando…" : "Actualizar configuración"}
          </Button>
        </div>
      </div>

      <CronSaludPanel />

      <div className="rounded-xl border border-border/60 bg-card/50 p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Download className="h-4 w-4 text-primary" /> Top 10 despachos del mes</h2>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Despacho</TableHead>
              <TableHead className="text-right">Solicitudes</TableHead>
              <TableHead className="text-right">Costo estimado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(d.top_despachos as any[]).length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-6">
                  Sin consumo registrado este mes.
                </TableCell>
              </TableRow>
            ) : (
              (d.top_despachos as any[]).map((r) => (
                <TableRow key={r.despacho_id}>
                  <TableCell>{r.despachos?.nombre ?? r.despacho_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-right">{fmt(r.sat_solicitudes)}</TableCell>
                  <TableCell className="text-right">{mxn(r.sat_costo_centavos)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
