import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Calendar, CheckCircle2, AlertTriangle, ChevronRight, ArrowLeft, ArrowRight } from "lucide-react";
import { useActiveCliente } from "@/lib/active-cliente";
import { getMonthlyHistorial, type MonthRow } from "@/lib/conciliacion/historial.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/conciliacion/historial")({
  component: HistorialPage,
});

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function HistorialPage() {
  const { cliente } = useActiveCliente();
  const [year, setYear] = useState(new Date().getFullYear());
  const [selected, setSelected] = useState<MonthRow | null>(null);
  const fn = useServerFn(getMonthlyHistorial);

  const q = useQuery({
    enabled: !!cliente?.id,
    queryKey: ["recon-historial", cliente?.id, year],
    queryFn: () => fn({ data: { cliente_id: cliente!.id, year } }),
  });

  if (!cliente) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/5 p-8 flex items-start gap-4">
        <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div>
          <div className="font-medium">Selecciona un expediente</div>
          <p className="text-sm text-muted-foreground mt-1">El histórico opera sobre el RFC de un cliente concreto.</p>
        </div>
      </div>
    );
  }

  const meses = q.data?.meses ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
            <Calendar className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Conciliación del expediente</h1>
            <p className="text-sm text-muted-foreground mt-1">Vista histórica mensual · {cliente.razon_social} · {cliente.rfc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="glass" size="sm" onClick={() => setYear((y) => y - 1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="text-lg font-semibold tabular-nums px-3">{year}</div>
          <Button variant="glass" size="sm" onClick={() => setYear((y) => y + 1)}><ArrowRight className="h-4 w-4" /></Button>
          <Link to="/app/conciliacion" className="ml-2">
            <Button variant="hero" size="sm">Ir al conciliador</Button>
          </Link>
        </div>
      </header>

      {/* Resumen anual */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Ingresos CFDI" value={sum(meses, "ingresos_cfdi")} />
        <KpiCard label="Egresos CFDI" value={sum(meses, "egresos_cfdi")} />
        <KpiCard label="Ingresos bancarios" value={sum(meses, "bank_ingresos")} tone="success" />
        <KpiCard label="Diferencia anual" value={sum(meses, "diferencia")} tone={Math.abs(sum(meses, "diferencia")) > 1 ? "warning" : "success"} signed />
      </div>

      {/* Grid mensual */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {meses.map((m) => (
          <MonthCard key={m.mes} m={m} onClick={() => setSelected(m)} />
        ))}
      </div>

      {selected && <DetailModal m={selected} year={year} onClose={() => setSelected(null)} />}
    </div>
  );
}

function MonthCard({ m, onClick }: { m: MonthRow; onClick: () => void }) {
  const color = {
    verde: "border-success/40 bg-success/5",
    amarillo: "border-warning/40 bg-warning/5",
    rojo: "border-destructive/40 bg-destructive/5",
    vacio: "border-border/40 bg-card/40",
  }[m.estado];
  const dot = {
    verde: "bg-success",
    amarillo: "bg-warning",
    rojo: "bg-destructive",
    vacio: "bg-muted-foreground/30",
  }[m.estado];

  return (
    <button onClick={onClick} className={`text-left rounded-xl border ${color} p-4 hover:shadow-md transition-shadow`}>
      <div className="flex items-center justify-between">
        <div className="font-semibold">{MESES[m.mes - 1]}</div>
        <span className={`h-2 w-2 rounded-full ${dot}`} />
      </div>
      {m.estado === "vacio" ? (
        <div className="mt-4 text-xs text-muted-foreground">Sin movimientos</div>
      ) : (
        <>
          <div className="mt-3 space-y-1 text-xs">
            <Row label="CFDI ingr." value={fmt(m.ingresos_cfdi)} />
            <Row label="CFDI egr." value={fmt(m.egresos_cfdi)} />
            <Row label="Banco ingr." value={fmt(m.bank_ingresos)} />
            <Row label="Diferencia" value={fmt(m.diferencia)} bold />
          </div>
          {m.conciliado_completo ? (
            <div className="mt-3 inline-flex items-center gap-1 text-[10px] font-medium text-success">
              <CheckCircle2 className="h-3 w-3" /> Conciliado
            </div>
          ) : m.movimientos > 0 ? (
            <div className="mt-3 text-[10px] text-muted-foreground">{m.conciliados}/{m.movimientos} conciliados</div>
          ) : (
            <div className="mt-3 text-[10px] text-warning">Sin estado de cuenta</div>
          )}
        </>
      )}
    </button>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

function KpiCard({ label, value, tone, signed }: { label: string; value: number; tone?: "success" | "warning"; signed?: boolean }) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 tabular-nums ${color}`}>
        {signed && value > 0 ? "+" : ""}{fmt(value)}
      </div>
    </div>
  );
}

function DetailModal({ m, year, onClose }: { m: MonthRow; year: number; onClose: () => void }) {
  const noData = m.estado === "vacio";
  const sinEstado = m.movimientos === 0 && m.cfdi_count > 0;
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Detalle mensual</div>
            <h2 className="text-xl font-semibold">{MESES[m.mes - 1]} {year}</h2>
          </div>
          {m.conciliado_completo && (
            <span className="text-xs px-2 py-1 rounded-md bg-success/15 text-success inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Conciliado
            </span>
          )}
        </div>

        {noData ? (
          <p className="mt-6 text-sm text-muted-foreground">No hay CFDIs ni movimientos cargados en este mes.</p>
        ) : (
          <div className="mt-5 space-y-2 text-sm">
            <DRow label="Ingresos CFDI" value={fmt(m.ingresos_cfdi)} />
            <DRow label="Egresos CFDI" value={fmt(m.egresos_cfdi)} />
            <div className="my-2 h-px bg-border" />
            <DRow label="Ingresos bancarios" value={fmt(m.bank_ingresos)} />
            <DRow label="Egresos bancarios" value={fmt(m.bank_egresos)} />
            <div className="my-2 h-px bg-border" />
            <DRow label="Diferencia (banco − CFDI)" value={fmt(m.diferencia)} bold />
            <DRow label="Movimientos conciliados" value={`${m.conciliados} / ${m.movimientos}`} />
            <DRow label="CFDIs en el mes" value={String(m.cfdi_count)} />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="glass" onClick={onClose}>Cerrar</Button>
          <Link to="/app/conciliacion">
            <Button variant="hero">
              {sinEstado || m.movimientos === 0 ? "Conciliar este mes" : "Ver detalle"} <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function DRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold text-foreground" : ""}`}>{value}</span>
    </div>
  );
}

function sum(arr: MonthRow[], key: keyof MonthRow) {
  return arr.reduce((a, m) => a + Number(m[key] ?? 0), 0);
}

function fmt(n: number) {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
