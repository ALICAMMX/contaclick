import { useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Download, X } from "lucide-react";
import { toast } from "sonner";

export type ColSpec = {
  key: string;
  label: string;
  required?: boolean;
  hint?: string;
  example?: string;
};

export function ImportDialog({
  open,
  onClose,
  title,
  columns,
  onImport,
  templateRows,
  helpNote,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  columns: ColSpec[];
  onImport: (rows: Record<string, any>[]) => Promise<void> | void;
  templateRows: Record<string, any>[];
  helpNote?: ReactNode;
}) {
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const parseFile = async (file: File) => {
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      let parsed: Record<string, any>[] = [];
      if (ext === "csv" || ext === "txt") {
        const text = await file.text();
        const res = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true });
        parsed = res.data;
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        parsed = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });
      }
      // Normalize headers (trim + lowercase)
      const normalize = (s: string) => s.toString().trim().toLowerCase();
      const keyMap: Record<string, string> = {};
      columns.forEach((c) => { keyMap[normalize(c.key)] = c.key; keyMap[normalize(c.label)] = c.key; });
      const out = parsed.map((row) => {
        const r: Record<string, any> = {};
        Object.entries(row).forEach(([k, v]) => {
          const mk = keyMap[normalize(k)];
          if (mk) r[mk] = typeof v === "string" ? v.trim() : v;
        });
        return r;
      }).filter((r) => columns.filter(c => c.required).every(c => r[c.key] !== undefined && r[c.key] !== ""));
      if (!out.length) { toast.error("No se encontraron filas válidas. Revisa los encabezados."); return; }
      setRows(out);
    } catch (e: any) {
      toast.error("No se pudo leer el archivo: " + (e?.message ?? ""));
    }
  };

  const downloadTemplate = () => {
    const headers = columns.map((c) => c.label);
    const data = [headers, ...templateRows.map((r) => columns.map((c) => r[c.key] ?? ""))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, `${title.toLowerCase().replace(/\s+/g, "-")}-plantilla.xlsx`);
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setBusy(true);
    try {
      await onImport(rows);
      setRows([]); setFileName("");
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Importar {title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="rounded-lg border border-border bg-card/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Formato esperado</div>
              <Button size="sm" variant="outline" onClick={downloadTemplate}>
                <Download className="h-3.5 w-3.5" /> Descargar plantilla .xlsx
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border/40">
                    <th className="text-left py-1.5 pr-3">Columna</th>
                    <th className="text-left py-1.5 pr-3">Obligatoria</th>
                    <th className="text-left py-1.5 pr-3">Ejemplo</th>
                    <th className="text-left py-1.5">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((c) => (
                    <tr key={c.key} className="border-b border-border/20 last:border-0">
                      <td className="py-1.5 pr-3 font-mono">{c.label}</td>
                      <td className="py-1.5 pr-3">{c.required ? <span className="text-amber-300">sí</span> : <span className="text-muted-foreground">no</span>}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{c.example ?? "—"}</td>
                      <td className="py-1.5 text-muted-foreground">{c.hint ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {helpNote && <div className="text-[11px] text-muted-foreground mt-3">{helpNote}</div>}
            <div className="text-[11px] text-muted-foreground mt-2">
              Formatos aceptados: <b>.xlsx</b>, <b>.xls</b>, <b>.csv</b>. La primera fila debe contener los encabezados (puede ser el nombre amigable o la clave en minúsculas).
            </div>
          </div>

          <div>
            <label className="block">
              <div className="rounded-lg border-2 border-dashed border-border/70 hover:border-primary/50 transition-colors p-6 text-center cursor-pointer bg-card/30">
                <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                <div className="text-sm">
                  {fileName ? <span className="text-foreground">{fileName}</span> : "Arrastra un archivo o haz clic para seleccionar"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">XLSX, XLS, CSV — máx 500 filas</div>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }}
              />
            </label>
          </div>

          {rows.length > 0 && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
              <div className="font-medium text-emerald-300 mb-1">Listo para importar: {rows.length} fila{rows.length > 1 ? "s" : ""}</div>
              <div className="text-muted-foreground">Vista previa de las primeras 3:</div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead><tr>{columns.slice(0, 5).map(c => <th key={c.key} className="text-left pr-3 py-1 text-muted-foreground">{c.label}</th>)}</tr></thead>
                  <tbody>
                    {rows.slice(0, 3).map((r, i) => (
                      <tr key={i} className="border-t border-border/30">
                        {columns.slice(0, 5).map(c => <td key={c.key} className="pr-3 py-1 truncate max-w-[160px]">{String(r[c.key] ?? "")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}><X className="h-4 w-4" /> Cancelar</Button>
          <Button onClick={handleImport} disabled={!rows.length || busy}>
            {busy ? "Importando…" : `Importar ${rows.length || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
