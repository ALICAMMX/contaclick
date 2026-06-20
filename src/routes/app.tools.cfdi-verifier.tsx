import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, ExternalLink, Save, CheckCircle2, AlertTriangle, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToolShell } from "@/components/ToolShell";
import { useActiveCliente } from "@/lib/active-cliente";
import { saveToolRun } from "@/lib/tool-runs.functions";
import { parseCfdi } from "@/lib/tools/cfdi-parser";

export const Route = createFileRoute("/app/tools/cfdi-verifier")({
  component: CfdiVerifier,
});

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const UUID_ANY = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const RFC_ANY = /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g;
const TOTAL_RE = /^-?\d+(\.\d{1,6})?$/;

// Try to auto-fill from a SAT verification URL like
// https://verificacfdi.facturaelectronica.sat.gob.mx/?id=...&re=...&rr=...&tt=...
function parseSatUrl(text: string): { uuid?: string; emisor?: string; receptor?: string; total?: string } | null {
  const m = text.match(/[?&]id=([^&\s]+)[^]*?[?&]re=([^&\s]+)[^]*?[?&]rr=([^&\s]+)[^]*?[?&]tt=([^&\s]+)/i);
  if (!m) return null;
  return {
    uuid: decodeURIComponent(m[1]),
    emisor: decodeURIComponent(m[2]).toUpperCase(),
    receptor: decodeURIComponent(m[3]).toUpperCase(),
    total: decodeURIComponent(m[4]),
  };
}

function buildSatUrl(uuid: string, emisor: string, receptor: string, total: string) {
  // SAT verification webservice URL format
  const re = `?id=${encodeURIComponent(uuid)}&re=${encodeURIComponent(emisor)}&rr=${encodeURIComponent(receptor)}&tt=${encodeURIComponent(total)}`;
  return `https://verificacfdi.facturaelectronica.sat.gob.mx/${re}`;
}

function CfdiVerifier() {
  const { cliente } = useActiveCliente();
  const save = useServerFn(saveToolRun);
  const [uuid, setUuid] = useState("");
  const [emisor, setEmisor] = useState("");
  const [receptor, setReceptor] = useState(cliente?.rfc ?? "");
  const [total, setTotal] = useState("");

  const checks = useMemo(() => {
    return {
      uuid: { ok: UUID_RE.test(uuid.trim()), msg: "Formato UUID v4 (8-4-4-4-12)" },
      emisor: { ok: RFC_RE.test(emisor.trim().toUpperCase()), msg: "RFC del emisor válido" },
      receptor: { ok: RFC_RE.test(receptor.trim().toUpperCase()), msg: "RFC del receptor válido" },
      total: { ok: TOTAL_RE.test(total.trim()), msg: "Total numérico (con hasta 6 decimales)" },
    };
  }, [uuid, emisor, receptor, total]);

  const allOk = Object.values(checks).every((c) => c.ok);
  const url = allOk ? buildSatUrl(uuid.trim(), emisor.trim().toUpperCase(), receptor.trim().toUpperCase(), total.trim()) : "";

  const onSave = async () => {
    try {
      await save({
        data: {
          cliente_id: cliente?.id ?? null,
          tool_key: "cfdi-verifier",
          input: { uuid, emisor, receptor, total },
          output: { url, allOk } as any,
          notes: uuid,
        },
      });
      toast.success("Verificación guardada en el expediente");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const autoFillFromText = (raw: string, sourceLabel: string) => {
    // 1) Try SAT URL (QR contenido)
    const fromUrl = parseSatUrl(raw);
    if (fromUrl?.uuid) {
      if (fromUrl.uuid) setUuid(fromUrl.uuid);
      if (fromUrl.emisor) setEmisor(fromUrl.emisor);
      if (fromUrl.receptor) setReceptor(fromUrl.receptor);
      if (fromUrl.total) setTotal(fromUrl.total);
      toast.success(`Datos autollenados desde ${sourceLabel} (QR SAT)`);
      return true;
    }
    // 2) Try CFDI XML
    if (/<\s*(?:[a-zA-Z0-9]+:)?Comprobante\b/.test(raw)) {
      try {
        const p = parseCfdi(raw);
        if (p.uuid) setUuid(p.uuid);
        if (p.emisor.rfc) setEmisor(p.emisor.rfc.toUpperCase());
        if (p.receptor.rfc) setReceptor(p.receptor.rfc.toUpperCase());
        if (typeof p.total === "number") setTotal(String(p.total));
        toast.success(`Datos autollenados desde ${sourceLabel} (XML CFDI)`);
        return true;
      } catch {
        // continúa con regex
      }
    }
    // 3) Fallback regex (útil para PDFs con texto seleccionable)
    const uuidM = raw.match(UUID_ANY);
    const rfcs = Array.from(new Set((raw.match(RFC_ANY) ?? []).map((r) => r.toUpperCase())));
    const totalM = raw.match(/Total[^\d-]{0,20}(-?\d{1,15}(?:[.,]\d{1,6})?)/i)
      ?? raw.match(/\b(\d{1,15}\.\d{2})\b/);
    let filled = 0;
    if (uuidM) { setUuid(uuidM[0]); filled++; }
    if (rfcs.length >= 1) { setEmisor(rfcs[0]); filled++; }
    if (rfcs.length >= 2) { setReceptor(rfcs[1]); filled++; }
    if (totalM) { setTotal(totalM[1].replace(",", ".")); filled++; }
    if (filled > 0) {
      toast.success(`Se autollenaron ${filled} campos desde ${sourceLabel}. Revisa los valores.`);
      return true;
    }
    toast.error(`No se pudo extraer datos del ${sourceLabel}. Captúralos a mano.`);
    return false;
  };

  const onFile = async (file: File) => {
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith(".xml") || file.type.includes("xml")) {
        const text = await file.text();
        autoFillFromText(text, "XML");
        return;
      }
      if (name.endsWith(".pdf") || file.type === "application/pdf") {
        // Leemos el binario como latin1 para conservar los streams de texto del PDF
        const buf = new Uint8Array(await file.arrayBuffer());
        let text = "";
        for (let i = 0; i < buf.length; i++) text += String.fromCharCode(buf[i]);
        autoFillFromText(text, "PDF");
        return;
      }
      // Cualquier otro: intenta como texto plano
      const text = await file.text();
      autoFillFromText(text, "archivo");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo leer el archivo");
    }
  };

  return (
    <ToolShell
      title="Verificador de UUID"
      description="Valida el formato del CFDI y abre la consulta oficial en el portal del SAT."
      icon={<ShieldCheck className="h-5 w-5 text-primary-foreground" />}
    >
      <div className="mb-4 rounded-xl border border-dashed border-border/60 bg-card/40 p-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.pdf,application/xml,text/xml,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <Button variant="hero" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> Subir XML o PDF para autollenar
        </Button>
        <p className="text-xs text-muted-foreground">
          Soporta XML CFDI 4.0 y PDFs con QR del SAT o texto seleccionable. Los datos se leen en tu navegador.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-4">

          <div className="space-y-1.5">
            <Label>UUID (folio fiscal)</Label>
            <Input value={uuid} onChange={(e) => setUuid(e.target.value)} placeholder="12345678-1234-1234-1234-123456789ABC" className="font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>RFC emisor</Label>
              <Input value={emisor} onChange={(e) => setEmisor(e.target.value.toUpperCase())} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>RFC receptor</Label>
              <Input value={receptor} onChange={(e) => setReceptor(e.target.value.toUpperCase())} className="font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Total</Label>
            <Input value={total} onChange={(e) => setTotal(e.target.value)} placeholder="1234.56" inputMode="decimal" className="font-mono" />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold">Validaciones</h3>
          <div className="rounded-xl border border-border/60 bg-card/50 divide-y divide-border/40">
            {Object.entries(checks).map(([k, c]) => (
              <div key={k} className="px-4 py-3 flex items-center gap-3 text-sm">
                {c.ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
                <span className="capitalize text-muted-foreground w-20">{k}</span>
                <span className="flex-1">{c.msg}</span>
              </div>
            ))}
          </div>

          {allOk ? (
            <div className="rounded-xl border border-success/30 bg-success/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-success" /> Datos válidos. Abre la consulta oficial del SAT.
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="hero" size="sm" asChild>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Verificar en SAT
                  </a>
                </Button>
                <Button variant="glass" size="sm" onClick={onSave}>
                  <Save className="h-3.5 w-3.5" /> Guardar en expediente
                </Button>
              </div>
              <div className="text-xs text-muted-foreground break-all font-mono">{url}</div>
            </div>
          ) : (
            <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm text-muted-foreground">
              Completa los cuatro campos con un formato válido para habilitar la consulta oficial al SAT.
            </div>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
