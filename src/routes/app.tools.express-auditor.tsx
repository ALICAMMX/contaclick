import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ScanSearch, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ToolShell } from "@/components/ToolShell";
import { parseCfdi } from "@/lib/tools/cfdi-parser";

export const Route = createFileRoute("/app/tools/express-auditor")({
  component: ExpressAuditor,
});

type Issue = { type: "duplicate" | "missing-uuid" | "wrong-rfc" | "version" | "totals"; level: "high" | "med" | "low"; message: string; archivo?: string };

function ExpressAuditor() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [stats, setStats] = useState({ total: 0, ok: 0 });

  const audit = async (files: FileList) => {
    const found: Issue[] = [];
    const seenUuids = new Map<string, string>();
    let ok = 0;
    let total = 0;

    for (const f of Array.from(files)) {
      if (!/\.xml$/i.test(f.name)) continue;
      total++;
      const text = await f.text();
      const p = parseCfdi(text);

      if (!p.uuid) found.push({ type: "missing-uuid", level: "high", message: "No tiene UUID — no está timbrado", archivo: f.name });
      else if (seenUuids.has(p.uuid)) found.push({ type: "duplicate", level: "high", message: `UUID duplicado (también en ${seenUuids.get(p.uuid)})`, archivo: f.name });
      else seenUuids.set(p.uuid, f.name);

      if (p.version && p.version !== "4.0") found.push({ type: "version", level: "med", message: `Versión ${p.version}, debería ser 4.0`, archivo: f.name });

      if (p.subTotal != null && p.total != null) {
        const trasladados = p.impuestos.totalTrasladados ?? 0;
        const retenidos = p.impuestos.totalRetenidos ?? 0;
        const descuento = p.descuento ?? 0;
        const esperado = p.subTotal - descuento + trasladados - retenidos;
        const diff = Math.abs(esperado - p.total);
        if (diff > 0.5) {
          found.push({ type: "totals", level: "med", message: `Totales no cuadran (diferencia $${diff.toFixed(2)})`, archivo: f.name });
        }
      }

      if (found.length === 0 || !found.some((i) => i.archivo === f.name)) ok++;
    }

    setIssues(found);
    setStats({ total, ok: total - new Set(found.map((i) => i.archivo)).size });
  };

  return (
    <ToolShell
      title="Auditor express"
      description="Sube los CFDI emitidos del cliente y detecta duplicados, sin timbrar, totales que no cuadran y versión obsoleta."
      icon={<ScanSearch className="h-5 w-5 text-primary-foreground" />}
    >
      <label className="block rounded-xl border-2 border-dashed border-border bg-card/30 p-10 text-center hover:border-primary/50 transition-colors cursor-pointer">
        <input type="file" multiple accept=".xml,text/xml,application/xml" className="hidden"
          onChange={(e) => e.target.files && audit(e.target.files)} />
        <div className="h-12 w-12 rounded-xl mx-auto flex items-center justify-center mb-3" style={{ background: "var(--gradient-primary)" }}>
          <Upload className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="font-medium">Selecciona los XML del periodo a auditar</div>
        <div className="text-xs text-muted-foreground mt-1">Procesamiento local en tu navegador.</div>
      </label>

      {stats.total > 0 && (
        <div className="grid grid-cols-3 gap-3 mt-2">
          <Stat label="Comprobantes" value={String(stats.total)} />
          <Stat label="Sin observaciones" value={String(stats.ok)} tone="ok" />
          <Stat label="Hallazgos" value={String(issues.length)} tone={issues.length > 0 ? "warn" : "ok"} />
        </div>
      )}

      {issues.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/50 divide-y divide-border/40">
          {issues.map((i, idx) => (
            <div key={idx} className="p-4 flex items-start gap-3">
              <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${i.level === "high" ? "text-destructive" : "text-warning"}`} />
              <div className="flex-1 text-sm">
                <div>{i.message}</div>
                {i.archivo && <div className="text-xs text-muted-foreground mt-0.5">{i.archivo}</div>}
              </div>
              <span className={`text-[10px] uppercase px-2 py-1 rounded-md tracking-wider ${
                i.level === "high" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"
              }`}>{i.level}</span>
            </div>
          ))}
        </div>
      )}

      {stats.total > 0 && issues.length === 0 && (
        <div className="rounded-xl border border-success/30 bg-success/5 p-5 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="text-sm">Sin hallazgos automáticos en los {stats.total} comprobantes.</div>
        </div>
      )}
    </ToolShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const color = tone === "ok" ? "text-success" : tone === "warn" ? "text-warning" : "";
  return (
    <div className="rounded-xl p-4 border border-border/60 bg-card/50">
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

