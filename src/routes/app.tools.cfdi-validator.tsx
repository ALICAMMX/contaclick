import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileSearch, Upload, CheckCircle2, AlertTriangle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ToolShell } from "@/components/ToolShell";
import { DemoCaseButtons } from "@/components/DemoCaseButtons";
import { useActiveCliente } from "@/lib/active-cliente";
import { parseCfdi, type CfdiParsed } from "@/lib/tools/cfdi-parser";
import { saveToolRun } from "@/lib/tool-runs.functions";
import { RejectModal } from "@/components/RejectModal";
import { emptyReport, type RejectReport } from "@/lib/cfdi/dedup-xml";

export const Route = createFileRoute("/app/tools/cfdi-validator")({
  component: CfdiValidator,
});

function CfdiValidator() {
  const { cliente } = useActiveCliente();
  const [parsed, setParsed] = useState<CfdiParsed | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [report, setReport] = useState<RejectReport | null>(null);
  const save = useServerFn(saveToolRun);

  const processXml = async (text: string, name: string, opts?: { skipRfcCheck?: boolean }) => {
    let result: CfdiParsed;
    try {
      result = parseCfdi(text);
    } catch (e: any) {
      const rep = emptyReport(cliente?.rfc?.toUpperCase() ?? "");
      rep.errores.push({ archivo: name, motivo: "No se pudo leer el XML", detalle: e?.message ?? "" });
      setReport(rep); setParsed(null); setFileName(null);
      return;
    }
    if (cliente && !opts?.skipRfcCheck) {
      const rfc = cliente.rfc.toUpperCase();
      const emisor = (result.emisor.rfc ?? "").toUpperCase();
      const receptor = (result.receptor.rfc ?? "").toUpperCase();
      if (emisor !== rfc && receptor !== rfc) {
        const rep = emptyReport(rfc);
        rep.rfcAjeno.push({ archivo: name, motivo: "RFC ajeno al expediente",
          detalle: `Emisor ${emisor || "—"} · Receptor ${receptor || "—"}` });
        setReport(rep); setParsed(null); setFileName(null);
        return;
      }
    }
    setFileName(name); setParsed(result);
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    await processXml(text, file.name);
  };

  const onSave = async () => {
    if (!parsed) return;
    try {
      await save({ data: { cliente_id: cliente?.id ?? null, tool_key: "cfdi-validator", input: { fileName }, output: parsed as any, notes: parsed.uuid ?? null } });
      toast.success("Resultado guardado en el expediente");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    }
  };

  return (
    <ToolShell helpSlug="cfdi-validator"
      title="Validador CFDI 4.0"
      description="Sube un XML, valida su estructura y revisa todos los datos relevantes."
      icon={<FileSearch className="h-5 w-5 text-primary-foreground" />}
    >
      <DemoCaseButtons
        toolKey="cfdi-validator"
        onLoad={(payload, variant) => processXml(payload.xml, variant === "ok" ? "ejemplo-ok.xml" : "ejemplo-riesgo.xml", { skipRfcCheck: true })}
      />
      <label className="block rounded-xl border-2 border-dashed border-border bg-card/30 p-10 text-center hover:border-primary/50 transition-colors cursor-pointer">
        <input type="file" accept=".xml,text/xml,application/xml" className="hidden"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) await onFile(f); e.target.value = ""; }} />
        <div className="h-12 w-12 rounded-xl mx-auto flex items-center justify-center mb-3" style={{ background: "var(--gradient-primary)" }}>
          <Upload className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="font-medium">Selecciona un archivo XML</div>
        <div className="text-xs text-muted-foreground mt-1">{fileName ?? "Solo CFDI 4.0 (.xml). Procesamiento local."}</div>
      </label>

      {parsed && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Resultado</h3>
            <Button variant="glass" size="sm" onClick={onSave}><Save className="h-3.5 w-3.5" /> Guardar en expediente</Button>
          </div>

          {parsed.warnings.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 space-y-1.5">
              {parsed.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" /> {w}
                </div>
              ))}
            </div>
          )}

          {parsed.warnings.length === 0 && (
            <div className="rounded-lg border border-success/30 bg-success/5 p-4 flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-success" /> CFDI válido y sin observaciones automáticas.
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <Card title="Comprobante">
              <Row k="Versión" v={parsed.version} req />
              <Row k="UUID" v={parsed.uuid} mono req />
              <Row k="Fecha" v={parsed.fecha} req />
              <Row k="Tipo" v={parsed.tipoComprobante} req />
              <Row k="Forma de pago" v={parsed.formaPago} req />
              <Row k="Método de pago" v={parsed.metodoPago} req />
              <Row k="Moneda" v={parsed.moneda} req />
            </Card>
            <Card title="Totales">
              <Row k="Subtotal" v={fmtMoney(parsed.subTotal)} req={parsed.subTotal == null} />
              <Row k="Descuento" v={fmtMoney(parsed.descuento)} />
              <Row k="Imp. trasladados" v={fmtMoney(parsed.impuestos.totalTrasladados)} />
              <Row k="Imp. retenidos" v={fmtMoney(parsed.impuestos.totalRetenidos)} />
              <Row k="Total" v={fmtMoney(parsed.total)} bold req={parsed.total == null} />
            </Card>
            <Card title="Emisor">
              <Row k="RFC" v={parsed.emisor.rfc} mono req />
              <Row k="Nombre" v={parsed.emisor.nombre} req />
              <Row k="Régimen" v={parsed.emisor.regimenFiscal} req />
            </Card>
            <Card title="Receptor">
              <Row k="RFC" v={parsed.receptor.rfc} mono req />
              <Row k="Nombre" v={parsed.receptor.nombre} req />
              <Row k="Uso CFDI" v={parsed.receptor.usoCFDI} req />
              <Row k="Régimen" v={parsed.receptor.regimenFiscalReceptor} req />
            </Card>
          </div>

          {parsed.conceptos.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50 text-sm font-medium">Conceptos ({parsed.conceptos.length})</div>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/30">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Descripción</th>
                    <th className="text-right font-medium px-4 py-2">Cantidad</th>
                    <th className="text-right font-medium px-4 py-2">V. Unit.</th>
                    <th className="text-right font-medium px-4 py-2">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.conceptos.map((c, i) => (
                    <tr key={i} className="border-t border-border/30">
                      <td className="px-4 py-2 truncate max-w-[400px]">{c.descripcion ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.cantidad ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.valorUnitario != null ? `$${c.valorUnitario.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.importe != null ? `$${c.importe.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <RejectModal report={report} onClose={() => setReport(null)} title="No se pudo validar el CFDI" />
    </ToolShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function fmtMoney(n?: number) {
  return n != null ? `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : undefined;
}
function Row({ k, v, mono, bold, req }: { k: string; v?: string; mono?: boolean; bold?: boolean; req?: boolean }) {
  const missing = req && (v == null || v === "");
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{k}{req ? <span className="text-destructive/70 ml-0.5">*</span> : null}</span>
      <span className={`${mono ? "font-mono text-xs" : ""} ${bold ? "font-semibold" : ""} ${missing ? "text-destructive font-medium" : ""} text-right truncate`}>
        {missing ? "FALTANTE" : (v ?? "—")}
      </span>
    </div>
  );
}
