import { createFileRoute } from "@tanstack/react-router";
import { Upload, FileText, AlertTriangle, CheckCircle2, XCircle, Filter, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/cfdi")({
  component: CFDI,
});

const cfdis = [
  { uuid: "A1B2-3F4D-...e9", emisor: "PROVEEDOR SA", rfc: "PSA120304ABC", total: 23456.0, iva: 3234.55, status: "vigente", riesgo: null, fecha: "2026-10-21" },
  { uuid: "C9D2-7A1B-...22", emisor: "GASOLINERA NORTE", rfc: "GNO850612XYZ", total: 1820.0, iva: 250.34, status: "vigente", riesgo: null, fecha: "2026-10-21" },
  { uuid: "E4F1-2C8D-...b3", emisor: "DUDOSA SC", rfc: "DUD200101QQQ", total: 89200.0, iva: 12303.45, status: "vigente", riesgo: "EFOS presunto", fecha: "2026-10-19" },
  { uuid: "B7A2-9E1F-...d8", emisor: "PAPELERA MX", rfc: "PMX110505KKK", total: 4230.0, iva: 583.45, status: "cancelado", riesgo: "Cancelado por emisor", fecha: "2026-10-18" },
  { uuid: "F3C4-5D2A-...01", emisor: "SERVICIOS GARCÍA", rfc: "SGA950822RRR", total: 56700.0, iva: 7820.69, status: "vigente", riesgo: "Duplicado posible", fecha: "2026-10-17" },
];

function CFDI() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Analizador CFDI</h1>
        <p className="text-muted-foreground text-sm mt-1">Sube XML, ZIPs o carpetas. La IA detecta riesgos y duplicados al instante.</p>
      </div>

      {/* Upload */}
      <div className="rounded-xl border-2 border-dashed border-border bg-card/30 p-10 text-center hover:border-primary/50 transition-colors cursor-pointer">
        <div className="h-14 w-14 rounded-xl mx-auto flex items-center justify-center mb-4" style={{ background: "var(--gradient-primary)" }}>
          <Upload className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="font-medium">Arrastra tus XML, ZIP o carpetas aquí</div>
        <div className="text-xs text-muted-foreground mt-1">o haz clic para seleccionar · Procesa hasta 5,000 CFDI por minuto</div>
        <Button variant="hero" size="sm" className="mt-4">Seleccionar archivos</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total CFDI", value: "2,318", icon: FileText, color: "text-primary" },
          { label: "Vigentes", value: "2,289", icon: CheckCircle2, color: "text-success" },
          { label: "Cancelados", value: "17", icon: XCircle, color: "text-muted-foreground" },
          { label: "Riesgos", value: "12", icon: AlertTriangle, color: "text-warning" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-4 border border-border/60 bg-card/50 flex items-center gap-3">
            <s.icon className={`h-5 w-5 ${s.color}`} />
            <div>
              <div className="text-2xl font-semibold">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="glass" size="sm"><Filter className="h-3.5 w-3.5" /> Filtros</Button>
            <Button variant="ghost" size="sm">Vigentes</Button>
            <Button variant="ghost" size="sm">Riesgos</Button>
            <Button variant="ghost" size="sm">Cancelados</Button>
          </div>
          <Button variant="glass" size="sm"><Download className="h-3.5 w-3.5" /> Excel</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left font-medium px-4 py-3">UUID</th>
                <th className="text-left font-medium px-4 py-3">Emisor</th>
                <th className="text-left font-medium px-4 py-3">RFC</th>
                <th className="text-right font-medium px-4 py-3">Total</th>
                <th className="text-right font-medium px-4 py-3">IVA</th>
                <th className="text-left font-medium px-4 py-3">Estatus</th>
                <th className="text-left font-medium px-4 py-3">IA</th>
              </tr>
            </thead>
            <tbody>
              {cfdis.map((c) => (
                <tr key={c.uuid} className="border-t border-border/30 hover:bg-accent/5">
                  <td className="px-4 py-3 font-mono text-xs">{c.uuid}</td>
                  <td className="px-4 py-3 font-medium">{c.emisor}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.rfc}</td>
                  <td className="px-4 py-3 text-right tabular-nums">${c.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">${c.iva.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.status === "vigente" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                    }`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {c.riesgo ? (
                      <span className="inline-flex items-center gap-1 text-xs text-warning">
                        <AlertTriangle className="h-3 w-3" /> {c.riesgo}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
