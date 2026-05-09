import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileStack, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolShell } from "@/components/ToolShell";
import { parseCfdi } from "@/lib/tools/cfdi-parser";

export const Route = createFileRoute("/app/tools/xml-bulk-reader")({
  component: BulkReader,
});

type Row = {
  archivo: string;
  uuid?: string; fecha?: string; rfcEmisor?: string; nombreEmisor?: string;
  rfcReceptor?: string; subtotal?: number; total?: number; tipo?: string;
};

function BulkReader() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList) => {
    setBusy(true);
    const next: Row[] = [];
    for (const f of Array.from(files)) {
      if (!/\.xml$/i.test(f.name)) continue;
      try {
        const text = await f.text();
        const p = parseCfdi(text);
        next.push({
          archivo: f.name,
          uuid: p.uuid, fecha: p.fecha,
          rfcEmisor: p.emisor.rfc, nombreEmisor: p.emisor.nombre,
          rfcReceptor: p.receptor.rfc,
          subtotal: p.subTotal, total: p.total, tipo: p.tipoComprobante,
        });
      } catch { /* ignore */ }
    }
    setRows((prev) => [...prev, ...next]);
    setBusy(false);
  };

  const exportCsv = () => {
    const headers = ["archivo", "uuid", "fecha", "rfcEmisor", "nombreEmisor", "rfcReceptor", "tipo", "subtotal", "total"];
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String((r as any)[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cfdi-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ToolShell
      title="Lector masivo de XML"
      description="Selecciona varios XML a la vez y obtén una tabla con todos los datos clave."
      icon={<FileStack className="h-5 w-5 text-primary-foreground" />}
    >
      <label className="block rounded-xl border-2 border-dashed border-border bg-card/30 p-10 text-center hover:border-primary/50 transition-colors cursor-pointer">
        <input type="file" accept=".xml,text/xml,application/xml" multiple className="hidden"
          onChange={(e) => e.target.files && onFiles(e.target.files)} />
        <div className="h-12 w-12 rounded-xl mx-auto flex items-center justify-center mb-3" style={{ background: "var(--gradient-primary)" }}>
          <Upload className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="font-medium">{busy ? "Procesando..." : "Selecciona varios archivos XML"}</div>
        <div className="text-xs text-muted-foreground mt-1">Procesamiento 100% local en tu navegador.</div>
      </label>

      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{rows.length} comprobantes leídos</div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRows([])}>Limpiar</Button>
              <Button variant="glass" size="sm" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Exportar CSV</Button>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/50 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground bg-muted/30">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Archivo</th>
                  <th className="text-left font-medium px-3 py-2">UUID</th>
                  <th className="text-left font-medium px-3 py-2">Fecha</th>
                  <th className="text-left font-medium px-3 py-2">Emisor</th>
                  <th className="text-left font-medium px-3 py-2">Receptor</th>
                  <th className="text-left font-medium px-3 py-2">Tipo</th>
                  <th className="text-right font-medium px-3 py-2">Subtotal</th>
                  <th className="text-right font-medium px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-border/30">
                    <td className="px-3 py-2 truncate max-w-[180px]">{r.archivo}</td>
                    <td className="px-3 py-2 font-mono">{r.uuid?.slice(0, 8) ?? "—"}</td>
                    <td className="px-3 py-2">{r.fecha?.slice(0, 10) ?? "—"}</td>
                    <td className="px-3 py-2"><div className="font-mono">{r.rfcEmisor ?? "—"}</div><div className="text-muted-foreground truncate max-w-[160px]">{r.nombreEmisor}</div></td>
                    <td className="px-3 py-2 font-mono">{r.rfcReceptor ?? "—"}</td>
                    <td className="px-3 py-2">{r.tipo ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.subtotal != null ? `$${r.subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{r.total != null ? `$${r.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ToolShell>
  );
}
