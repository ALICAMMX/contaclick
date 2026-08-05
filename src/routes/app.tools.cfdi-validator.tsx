import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileSearch, Upload, CheckCircle2, AlertTriangle, Save, FlaskConical, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ToolShell } from "@/components/ToolShell";
import { DemoCaseButtons } from "@/components/DemoCaseButtons";
import { useActiveCliente } from "@/lib/active-cliente";
import { parseCfdi, type CfdiParsed } from "@/lib/tools/cfdi-parser";
import { analyzeCfdi, maxLevel, type RiskFinding } from "@/lib/cfdi/risk";
import { consultarEfos, EFECTO_POR_SITUACION } from "@/lib/efos/lista-demo";
import { AVISO_SINTETICO } from "@/lib/demo/cfdi-fixtures";
import { saveToolRun } from "@/lib/tool-runs.functions";
import { RejectModal } from "@/components/RejectModal";
import { emptyReport, type RejectReport } from "@/lib/cfdi/dedup-xml";

export const Route = createFileRoute("/app/tools/cfdi-validator")({
  component: CfdiValidator,
  head: () => ({
    meta: [
      { title: "Validador CFDI 4.0 · ContaClick IA" },
      { name: "description", content: "Valida la estructura, el sellado, los campos obligatorios y la aritmética de un CFDI 4.0 antes de contabilizarlo." },
    ],
  }),
});

function CfdiValidator() {
  const { cliente } = useActiveCliente();
  const [parsed, setParsed] = useState<CfdiParsed | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sintetico, setSintetico] = useState(false);
  const [report, setReport] = useState<RejectReport | null>(null);
  const save = useServerFn(saveToolRun);

  /** Hallazgos deterministas del comprobante cargado. */
  const findings: RiskFinding[] = useMemo(
    () => (parsed ? analyzeCfdi(parsed, { rfcCliente: sintetico ? undefined : cliente?.rfc }) : []),
    [parsed, cliente?.rfc, sintetico],
  );

  /** Revisión 69-B de emisor y receptor contra el listado cargado. */
  const efos = useMemo(() => {
    if (!parsed) return [];
    const partes = [
      { rol: "Emisor", rfc: parsed.emisor.rfc },
      { rol: "Receptor", rfc: parsed.receptor.rfc },
    ].filter((p) => !!p.rfc) as { rol: string; rfc: string }[];
    return partes
      .map((p) => ({ ...p, consulta: consultarEfos(p.rfc) }))
      .filter((p) => p.consulta.estado !== "sin_coincidencia");
  }, [parsed]);

  const processXml = async (text: string, name: string, opts?: { sintetico?: boolean }) => {
    let result: CfdiParsed;
    try {
      result = parseCfdi(text);
    } catch (e: any) {
      const rep = emptyReport(cliente?.rfc?.toUpperCase() ?? "");
      rep.errores.push({ archivo: name, motivo: "No se pudo leer el XML", detalle: e?.message ?? "" });
      setReport(rep); setParsed(null); setFileName(null); setSintetico(false);
      return;
    }
    if (cliente && !opts?.sintetico) {
      const rfc = cliente.rfc.toUpperCase();
      const emisor = (result.emisor.rfc ?? "").toUpperCase();
      const receptor = (result.receptor.rfc ?? "").toUpperCase();
      if (emisor !== rfc && receptor !== rfc) {
        const rep = emptyReport(rfc);
        rep.rfcAjeno.push({ archivo: name, motivo: "RFC ajeno al expediente",
          detalle: `Emisor ${emisor || "—"} · Receptor ${receptor || "—"}` });
        setReport(rep); setParsed(null); setFileName(null); setSintetico(false);
        return;
      }
    }
    setFileName(name); setParsed(result); setSintetico(!!opts?.sintetico);
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    await processXml(text, file.name);
  };

  const onSave = async () => {
    if (!parsed || sintetico) return;
    try {
      await save({ data: { cliente_id: cliente?.id ?? null, tool_key: "cfdi-validator", input: { fileName }, output: parsed as any, notes: parsed.uuid ?? null } });
      toast.success("Resultado guardado en el expediente");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    }
  };

  const nivel = maxLevel(findings);
  const nivelClass =
    nivel === "alto" ? "border-destructive/50 bg-destructive/5"
      : nivel === "medio" ? "border-warning/40 bg-warning/5"
        : nivel === "bajo" ? "border-border bg-card/50"
          : "border-success/30 bg-success/5";

  return (
    <ToolShell helpSlug="cfdi-validator"
      title="Validador CFDI 4.0"
      description="Sube un XML, valida su estructura y revisa todos los datos relevantes."
      icon={<FileSearch className="h-5 w-5 text-primary-foreground" />}
    >
      <DemoCaseButtons
        toolKey="cfdi-validator"
        onLoad={(payload, variant) =>
          processXml(payload.xml, variant === "ok" ? "ejemplo-integro.xml" : "ejemplo-riesgo.xml", { sintetico: true })
        }
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
          {sintetico && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 flex items-start gap-2 text-sm">
              <FlaskConical className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Ejemplo sintético</div>
                <div className="text-xs text-muted-foreground mt-0.5">{AVISO_SINTETICO}</div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Resultado</h3>
            {!sintetico && (
              <Button variant="glass" size="sm" onClick={onSave}><Save className="h-3.5 w-3.5" /> Guardar en expediente</Button>
            )}
          </div>

          {/* Hallazgos deterministas */}
          <div className={`rounded-lg border p-4 space-y-2 ${nivelClass}`}>
            {findings.length === 0 ? (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-success" />
                CFDI válido: estructura 4.0 completa, sellado presente, campos obligatorios y aritmética correctos. Sin hallazgos.
              </div>
            ) : (
              <>
                <div className="text-sm font-medium">
                  {findings.length} {findings.length === 1 ? "hallazgo" : "hallazgos"} · nivel máximo: {nivel}
                </div>
                <ul className="space-y-1.5">
                  {findings.map((f) => (
                    <li key={f.code} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${f.level === "alto" ? "text-destructive" : f.level === "medio" ? "text-warning" : "text-muted-foreground"}`} />
                      <span>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mr-1.5">{f.code}</span>
                        {f.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Revisión 69-B */}
          {efos.length > 0 && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldAlert className="h-4 w-4 text-destructive" /> Revisión 69-B (art. 69-B CFF)
              </div>
              {efos.map((e, i) => (
                <div key={i} className="text-sm">
                  {e.consulta.estado === "en_lista" ? (
                    <>
                      <span className="font-medium">{e.rol} <span className="font-mono">{e.rfc}</span></span> ·{" "}
                      {EFECTO_POR_SITUACION[e.consulta.registro.situacion].etiqueta} (DOF {e.consulta.registro.publicacion_dof})
                      <div className="text-xs text-muted-foreground mt-0.5">{EFECTO_POR_SITUACION[e.consulta.registro.situacion].efecto}</div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {e.rol} <span className="font-mono">{e.rfc}</span>: {"mensaje" in e.consulta ? e.consulta.mensaje : "Listado no vigente."}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {parsed.warnings.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 space-y-1.5">
              {parsed.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" /> {w}
                </div>
              ))}
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
