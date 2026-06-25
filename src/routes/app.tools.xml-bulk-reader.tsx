import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileStack, Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, Search, Save, Loader2 } from "lucide-react";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToolShell } from "@/components/ToolShell";
import { parseCfdi } from "@/lib/tools/cfdi-parser";
import { useActiveCliente } from "@/lib/active-cliente";
import { uploadCfdiBatch, getExistingCfdiKeys } from "@/lib/cfdi/cfdi.functions";
import { safeFilename, triggerFileDownload } from "@/lib/download";

export const Route = createFileRoute("/app/tools/xml-bulk-reader")({
  component: BulkReader,
});

type Row = {
  archivo: string;
  xml?: string;
  uuid?: string;
  fecha?: string;
  rfcEmisor?: string;
  nombreEmisor?: string;
  rfcReceptor?: string;
  nombreReceptor?: string;
  tipo?: string;
  metodoPago?: string;
  formaPago?: string;
  usoCfdi?: string;
  moneda?: string;
  subtotal?: number;
  total?: number;
  iva?: number;
  estado: "vigente" | "cancelado" | "desconocido";
  warnings: string[];
};

const TIPO_LABEL: Record<string, string> = { I: "Ingreso", E: "Egreso", T: "Traslado", N: "Nómina", P: "Pago" };

function rowFromXml(filename: string, xml: string): Row {
  const p = parseCfdi(xml);
  // Heurística: si el XML contiene un atributo Estatus="0" o "Cancelado" lo marcamos
  const cancelado = /Estatus\s*=\s*"(0|Cancelado|cancelado)"/.test(xml) || /\bCancelado\b/i.test(xml.slice(0, 1000));
  return {
    archivo: filename,
    xml,
    uuid: p.uuid,
    fecha: p.fecha,
    rfcEmisor: p.emisor.rfc,
    nombreEmisor: p.emisor.nombre,
    rfcReceptor: p.receptor.rfc,
    nombreReceptor: p.receptor.nombre,
    tipo: p.tipoComprobante,
    metodoPago: p.metodoPago,
    formaPago: p.formaPago,
    usoCfdi: p.receptor.usoCFDI,
    moneda: p.moneda,
    subtotal: p.subTotal,
    total: p.total,
    iva: p.impuestos.totalTrasladados,
    estado: cancelado ? "cancelado" : p.uuid ? "vigente" : "desconocido",
    warnings: p.warnings,
  };
}

import { classifyXmls, reportTotalRejections, type RejectReport } from "@/lib/cfdi/dedup-xml";
import { RejectModal } from "@/components/RejectModal";



function BulkReader() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [filter, setFilter] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<string>("");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<RejectReport | null>(null);
  const { cliente } = useActiveCliente();
  const uploadBatch = useServerFn(uploadCfdiBatch);
  const fetchKeys = useServerFn(getExistingCfdiKeys);
  const qc = useQueryClient();

  const guardarEnExpediente = async () => {
    if (!cliente) {
      toast.error("Selecciona un expediente activo en la barra superior antes de guardar.");
      return;
    }
    const persistibles = rows.filter((r) => r.xml && r.uuid);
    if (!persistibles.length) {
      toast.error("No hay CFDIs válidos (con UUID) para guardar.");
      return;
    }
    // CANDADO: congelar el expediente al inicio de la operación
    const frozenId = cliente.id;
    const frozenRfc = cliente.rfc;
    setSaving(true);
    let inserted = 0, duplicates = 0, failed = 0;
    try {
      const CHUNK = 50;
      for (let i = 0; i < persistibles.length; i += CHUNK) {
        // Revalidar antes de cada chunk: si el usuario cambió el expediente
        // activo a mitad de la subida, abortamos para no mezclar contabilidades.
        if (cliente?.id !== frozenId) {
          throw new Error(`El expediente activo cambió de ${frozenRfc} durante la carga. Operación cancelada para evitar mezclar contabilidades.`);
        }
        const slice = persistibles.slice(i, i + CHUNK);
        const res = await uploadBatch({
          data: {
            cliente_id: frozenId,
            files: slice.map((r) => ({ filename: r.archivo, xml: r.xml! })),
          },
        });
        inserted += res.summary.inserted;
        duplicates += res.summary.duplicates;
        failed += res.summary.failed;
      }
      await qc.invalidateQueries();
      toast.success(`Expediente ${frozenRfc} actualizado: ${inserted} guardados, ${duplicates} duplicados, ${failed} con error.`);
    } catch (e) {
      toast.error(`No se pudo guardar: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setSaving(false);
    }
  };


  const handleFiles = async (files: FileList) => {
    if (!cliente) {
      toast.error("Selecciona primero un expediente (RFC) en la barra superior. La herramienta no puede leer XML sin un RFC activo para evitar mezclar contabilidades.");
      return;
    }
    const rfcActivo = cliente.rfc.toUpperCase();
    setBusy(true);

    // Llaves ya presentes en el expediente (DB)
    let dbUuids = new Set<string>();
    let dbHashes = new Set<string>();
    try {
      const k = await fetchKeys({ data: { cliente_id: cliente.id } });
      dbUuids = new Set((k.uuids ?? []).map((u) => u.toUpperCase()));
      dbHashes = new Set(k.hashes ?? []);
      console.log(`[dedup] DB tiene ${dbUuids.size} UUIDs y ${dbHashes.size} hashes para ${rfcActivo}`);
    } catch (e) {
      console.error("[dedup] No se pudo consultar el expediente:", e);
      toast.error("No se pudo verificar duplicados contra el expediente. Revisa tu conexión.");
    }
    // Llaves ya cargadas en esta sesión (en la tabla local)
    const localUuids = new Set(rows.map((r) => (r.uuid ?? "").toUpperCase()).filter(Boolean));
    const localHashes = new Set<string>();

    const xmlFiles: { name: string; getText: () => Promise<string> }[] = [];
    for (const f of Array.from(files)) {
      if (/\.zip$/i.test(f.name)) {
        try {
          const zip = await JSZip.loadAsync(f);
          zip.forEach((path, entry) => {
            if (!entry.dir && /\.xml$/i.test(path)) {
              xmlFiles.push({ name: path.split("/").pop() || path, getText: () => entry.async("string") });
            }
          });
        } catch {
          /* ignore bad zip */
        }
      } else if (/\.xml$/i.test(f.name)) {
        xmlFiles.push({ name: f.name, getText: () => f.text() });
      }
    }

    setProgress({ done: 0, total: xmlFiles.length });
    // Cargar textos primero para mostrar progreso (lectura), luego clasificar
    const filesText: Array<{ filename: string; xml: string }> = [];
    for (let i = 0; i < xmlFiles.length; i++) {
      try {
        const txt = await xmlFiles[i].getText();
        filesText.push({ filename: xmlFiles[i].name, xml: txt });
      } catch {
        filesText.push({ filename: xmlFiles[i].name, xml: "" });
      }
      setProgress({ done: i + 1, total: xmlFiles.length });
    }

    const { accepted, report: rep } = await classifyXmls({
      rfcActivo,
      files: filesText,
      dbUuids,
      dbHashes,
      seenUuids: new Set(rows.map((r) => (r.uuid ?? "").toUpperCase()).filter(Boolean)),
    });

    const next: Row[] = accepted.map((a) => rowFromXml(a.filename, a.xml));
    setRows((prev) => [...prev, ...next]);
    setBusy(false);
    setProgress(null);

    if (reportTotalRejections(rep) > 0) {
      setReport(rep);
    } else if (rep.aceptados > 0) {
      toast.success(`${rep.aceptados} CFDI(s) cargados para ${rfcActivo}.`);
    }
  };




  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (tipoFiltro && r.tipo !== tipoFiltro) return false;
      if (estadoFiltro && r.estado !== estadoFiltro) return false;
      if (!q) return true;
      return [r.uuid, r.rfcEmisor, r.rfcReceptor, r.nombreEmisor, r.nombreReceptor, r.archivo]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, filter, tipoFiltro, estadoFiltro]);

  const totals = useMemo(() => {
    const t = { count: filtered.length, ingresos: 0, egresos: 0, iva: 0, cancelados: 0, conWarnings: 0 };
    for (const r of filtered) {
      if (r.tipo === "I") t.ingresos += r.total ?? 0;
      if (r.tipo === "E") t.egresos += r.total ?? 0;
      t.iva += r.iva ?? 0;
      if (r.estado === "cancelado") t.cancelados++;
      if (r.warnings.length) t.conWarnings++;
    }
    return t;
  }, [filtered]);

  const exportRows = () =>
    filtered.map((r) => ({
      Archivo: r.archivo,
      UUID: r.uuid ?? "",
      Fecha: r.fecha?.slice(0, 10) ?? "",
      Tipo: r.tipo ? `${r.tipo} - ${TIPO_LABEL[r.tipo] ?? ""}`.trim() : "",
      "RFC Emisor": r.rfcEmisor ?? "",
      "Nombre Emisor": r.nombreEmisor ?? "",
      "RFC Receptor": r.rfcReceptor ?? "",
      "Nombre Receptor": r.nombreReceptor ?? "",
      "Método pago": r.metodoPago ?? "",
      "Forma pago": r.formaPago ?? "",
      "Uso CFDI": r.usoCfdi ?? "",
      Moneda: r.moneda ?? "",
      Subtotal: r.subtotal ?? "",
      IVA: r.iva ?? "",
      Total: r.total ?? "",
      Estado: r.estado,
      Observaciones: r.warnings.join(" | "),
    }));

  const exportCsv = () => {
    const data = exportRows();
    const headers = Object.keys(data[0] ?? { x: "" });
    const csv = [
      headers.join(","),
      ...data.map((row) =>
        headers.map((h) => `"${String((row as any)[h] ?? "").replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    triggerFileDownload(blob, safeFilename(`cfdi-${Date.now()}.csv`, "cfdi.csv"));
  };

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CFDIs");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    triggerFileDownload(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), safeFilename(`cfdi-${Date.now()}.xlsx`, "cfdi.xlsx"));
  };

  return (
    <ToolShell
      title="Lector masivo de XML"
      description="Sube un ZIP del SAT o varios XML. Obtén una tabla completa con todos los datos clave: emisor, receptor, total, método de pago y estado."
      icon={<FileStack className="h-5 w-5 text-primary-foreground" />}
    >
      {cliente ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <span>Expediente activo: <strong>{cliente.razon_social}</strong> · RFC <span className="font-mono">{cliente.rfc}</span>. Solo se aceptarán XML donde este RFC sea emisor o receptor.</span>
        </div>
      ) : (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-sm flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span>No hay expediente activo. Selecciona un RFC en la barra superior antes de cargar XML.</span>
        </div>
      )}
      <label className={`block rounded-xl border-2 border-dashed bg-card/30 p-10 text-center transition-colors ${cliente ? "border-border hover:border-primary/50 cursor-pointer" : "border-border/40 opacity-60 cursor-not-allowed"}`}>
        <input
          type="file"
          accept=".xml,.zip,text/xml,application/xml,application/zip"
          multiple
          className="hidden"
          onChange={async (e) => {
            const fl = e.target.files;
            if (fl && fl.length) await handleFiles(fl);
            e.target.value = ""; // permite re-seleccionar el mismo archivo y disparar el evento
          }}
        />
        <div
          className="h-12 w-12 rounded-xl mx-auto flex items-center justify-center mb-3"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Upload className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="font-medium">
          {busy
            ? progress
              ? `Procesando ${progress.done} de ${progress.total}…`
              : "Procesando…"
            : "Arrastra o selecciona ZIP del SAT o XML sueltos"}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Procesamiento 100% local. Acepta ZIPs grandes con cientos de comprobantes.
        </div>
      </label>

      {rows.length > 0 && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="Comprobantes" value={totals.count.toLocaleString("es-MX")} />
            <Kpi label="Ingresos" value={`$${totals.ingresos.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`} />
            <Kpi label="Egresos" value={`$${totals.egresos.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`} />
            <Kpi label="IVA trasladado" value={`$${totals.iva.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`} />
            <Kpi
              label="Cancelados / con avisos"
              value={`${totals.cancelados} / ${totals.conWarnings}`}
              tone={totals.cancelados + totals.conWarnings > 0 ? "warn" : "ok"}
            />
          </div>

          {/* Filtros + acciones */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por UUID, RFC o nombre…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Todos los tipos</option>
              <option value="I">Ingreso</option>
              <option value="E">Egreso</option>
              <option value="P">Pago</option>
              <option value="N">Nómina</option>
              <option value="T">Traslado</option>
            </select>
            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Todos los estados</option>
              <option value="vigente">Vigente</option>
              <option value="cancelado">Cancelado</option>
              <option value="desconocido">Desconocido</option>
            </select>
            <Button variant="ghost" size="sm" onClick={() => setRows([])}>
              Limpiar
            </Button>
            <Button variant="glass" size="sm" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="glass" size="sm" onClick={exportXlsx}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </Button>
            <Button variant="hero" size="sm" onClick={guardarEnExpediente} disabled={saving || !cliente}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {cliente ? `Guardar en ${cliente.rfc}` : "Selecciona expediente"}
            </Button>
          </div>

          {/* Tabla */}
          <div className="rounded-xl border border-border/60 bg-card/50 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground bg-muted/30 sticky top-0">
                <tr>
                  <Th>UUID</Th>
                  <Th>Fecha</Th>
                  <Th>Tipo</Th>
                  <Th>Emisor</Th>
                  <Th>Receptor</Th>
                  <Th>M. pago</Th>
                  <Th>F. pago</Th>
                  <Th align="right">Subtotal</Th>
                  <Th align="right">IVA</Th>
                  <Th align="right">Total</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i} className="border-t border-border/30 hover:bg-muted/20">
                    <Td mono missing={!r.uuid}>
                      {r.uuid ? r.uuid.slice(0, 8) + "…" : "FALTA UUID"}
                    </Td>
                    <Td missing={!r.fecha}>{r.fecha?.slice(0, 10) ?? "—"}</Td>
                    <Td missing={!r.tipo}>{r.tipo ? `${r.tipo} · ${TIPO_LABEL[r.tipo] ?? ""}` : "—"}</Td>
                    <Td missing={!r.rfcEmisor}>
                      <div className="font-mono">{r.rfcEmisor ?? "FALTA"}</div>
                      <div className="text-muted-foreground truncate max-w-[180px]">{r.nombreEmisor}</div>
                    </Td>
                    <Td missing={!r.rfcReceptor}>
                      <div className="font-mono">{r.rfcReceptor ?? "FALTA"}</div>
                      <div className="text-muted-foreground truncate max-w-[180px]">{r.nombreReceptor}</div>
                    </Td>
                    <Td missing={!r.metodoPago}>{r.metodoPago ?? "—"}</Td>
                    <Td missing={!r.formaPago}>{r.formaPago ?? "—"}</Td>
                    <Td align="right" mono>
                      {fmt(r.subtotal)}
                    </Td>
                    <Td align="right" mono>
                      {fmt(r.iva)}
                    </Td>
                    <Td align="right" mono bold missing={r.total == null}>
                      {fmt(r.total)}
                    </Td>
                    <Td>
                      <EstadoBadge estado={r.estado} warnings={r.warnings.length} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RejectModal report={report} onClose={() => setReport(null)} />
    </ToolShell>
  );
}

function fmt(n?: number) {
  return n != null ? `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "—";
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th className={`font-medium px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>
  );
}

function Td({
  children,
  align,
  mono,
  bold,
  missing,
}: {
  children: React.ReactNode;
  align?: "right";
  mono?: boolean;
  bold?: boolean;
  missing?: boolean;
}) {
  const cls = [
    "px-3 py-2",
    align === "right" ? "text-right tabular-nums" : "",
    mono ? "font-mono" : "",
    bold ? "font-semibold" : "",
    missing ? "text-destructive font-medium" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return <td className={cls}>{children}</td>;
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" }) {
  const ring = tone === "warn" ? "border-warning/40 bg-warning/5" : "border-border/60 bg-card/50";
  return (
    <div className={`rounded-xl border ${ring} p-3`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function EstadoBadge({ estado, warnings }: { estado: Row["estado"]; warnings: number }) {
  if (estado === "cancelado")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[11px] font-medium">
        <AlertTriangle className="h-3 w-3" /> Cancelado
      </span>
    );
  if (estado === "vigente" && warnings === 0)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-[11px] font-medium">
        <CheckCircle2 className="h-3 w-3" /> Vigente
      </span>
    );
  if (estado === "vigente")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 text-warning text-[11px] font-medium">
        <AlertTriangle className="h-3 w-3" /> {warnings} aviso{warnings !== 1 ? "s" : ""}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-medium">
      Desconocido
    </span>
  );
}

