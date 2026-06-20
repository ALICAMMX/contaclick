import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Trash2, Sparkles, Loader2, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getCfdi, deleteCfdi, analyzeCfdiAI } from "@/lib/cfdi/cfdi.functions";
import { analyzeCfdi as runRiskAnalysis, maxLevel } from "@/lib/cfdi/risk";
import { parseCfdi } from "@/lib/tools/cfdi-parser";

export const Route = createFileRoute("/app/cfdi/$id")({
  component: CfdiDetail,
});

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
const fmtDate = (s: string | null | undefined) => s ? new Date(s).toLocaleString("es-MX") : "—";

function CfdiDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const get = useServerFn(getCfdi);
  const del = useServerFn(deleteCfdi);
  const ai = useServerFn(analyzeCfdiAI);

  const [iaOut, setIaOut] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cfdi", id],
    queryFn: () => get({ data: { id } }),
  });

  const delM = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => {
      toast.success("CFDI eliminado");
      qc.invalidateQueries({ queryKey: ["cfdi-list"] });
      qc.invalidateQueries({ queryKey: ["cfdi-stats"] });
      nav({ to: "/app/cfdi" });
    },
  });

  const aiM = useMutation({
    mutationFn: () => ai({ data: { cfdi_id: id } }),
    onSuccess: (r) => {
      if (r.error) { toast.error(r.error); return; }
      setIaOut(r.content);
    },
  });

  if (isLoading) return <div className="py-20 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Cargando…</div>;
  if (!data) return null;

  const c = data.cfdi as Record<string, unknown> & {
    uuid: string; tipo_cfdi: string; total: number; subtotal: number;
    iva_trasladado: number; iva_retenido: number; descuento: number;
    rfc_emisor: string; nombre_emisor: string | null; rfc_receptor: string; nombre_receptor: string | null;
    fecha: string; fecha_timbrado: string | null; metodo_pago: string | null; forma_pago: string | null;
    uso_cfdi: string | null; moneda: string | null; estatus_sat: string | null;
    archivo_path: string | null;
  };

  // Reconstruimos un objeto compatible con el motor de riesgo a partir de los datos guardados
  const findings = runRiskAnalysis({
    version: "4.0",
    fecha: c.fecha,
    formaPago: c.forma_pago ?? undefined,
    metodoPago: c.metodo_pago ?? undefined,
    moneda: c.moneda ?? undefined,
    tipoComprobante: c.tipo_cfdi,
    subTotal: Number(c.subtotal),
    total: Number(c.total),
    descuento: Number(c.descuento ?? 0),
    emisor: { rfc: c.rfc_emisor, nombre: c.nombre_emisor ?? undefined },
    receptor: { rfc: c.rfc_receptor, nombre: c.nombre_receptor ?? undefined, usoCFDI: c.uso_cfdi ?? undefined },
    uuid: c.uuid,
    fechaTimbrado: c.fecha_timbrado ?? undefined,
    conceptos: data.conceptos.map((x) => ({
      descripcion: (x as { descripcion?: string }).descripcion,
      importe: Number((x as { importe?: number }).importe ?? 0),
    })),
    impuestos: { totalTrasladados: Number(c.iva_trasladado), totalRetenidos: Number(c.iva_retenido) },
    warnings: [],
  });

  const level = maxLevel(findings);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/app/cfdi" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <Button variant="ghost" size="sm" onClick={() => delM.mutate()} disabled={delM.isPending}>
          <Trash2 className="h-4 w-4 mr-1" /> Eliminar
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-card/40 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">CFDI · {c.tipo_cfdi}</div>
            <h1 className="text-3xl font-semibold mt-1 tabular-nums">{fmt(Number(c.total))}</h1>
            <div className="text-xs text-muted-foreground font-mono mt-2 break-all">{c.uuid}</div>
          </div>
          <RiskPill level={level} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Emisor">
          <Field label="RFC" value={c.rfc_emisor} mono />
          <Field label="Nombre" value={c.nombre_emisor ?? "—"} />
        </Card>
        <Card title="Receptor">
          <Field label="RFC" value={c.rfc_receptor} mono />
          <Field label="Nombre" value={c.nombre_receptor ?? "—"} />
          <Field label="Uso CFDI" value={c.uso_cfdi ?? "—"} />
        </Card>
        <Card title="Comprobante">
          <Field label="Fecha emisión" value={fmtDate(c.fecha)} />
          <Field label="Fecha timbrado" value={fmtDate(c.fecha_timbrado)} />
          <Field label="Moneda" value={c.moneda ?? "MXN"} />
          <Field label="Estatus SAT" value={c.estatus_sat ?? "desconocido"} />
        </Card>
        <Card title="Pago">
          <Field label="Método" value={c.metodo_pago ?? "—"} />
          <Field label="Forma" value={c.forma_pago ?? "—"} />
        </Card>
        <Card title="Importes" full>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Money label="Subtotal" value={Number(c.subtotal)} />
            <Money label="Descuento" value={Number(c.descuento ?? 0)} />
            <Money label="IVA traslado" value={Number(c.iva_trasladado)} />
            <Money label="IVA retención" value={Number(c.iva_retenido)} />
          </div>
        </Card>
      </div>

      {/* Conceptos */}
      {data.conceptos.length > 0 && (
        <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
          <div className="px-4 py-3 text-sm font-medium border-b border-border/60">Conceptos ({data.conceptos.length})</div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground bg-muted/20">
              <tr>
                <th className="text-left px-4 py-2">Clave</th>
                <th className="text-left px-4 py-2">Descripción</th>
                <th className="text-right px-4 py-2">Cant.</th>
                <th className="text-right px-4 py-2">Importe</th>
              </tr>
            </thead>
            <tbody>
              {data.conceptos.map((x: any) => (
                <tr key={x.id} className="border-b border-border/30">
                  <td className="px-4 py-2 font-mono text-xs">{x.clave_prod_serv ?? "—"}</td>
                  <td className="px-4 py-2">{x.descripcion ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{x.cantidad ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(Number(x.importe ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Riesgos detectados */}
      <div className="rounded-xl border border-border bg-card/40 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Riesgos detectados</h3>
          <span className="text-xs text-muted-foreground">{findings.length} hallazgo(s)</span>
        </div>
        {findings.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Sin observaciones automáticas. CFDI aritméticamente consistente.
          </div>
        ) : (
          <ul className="space-y-2">
            {findings.map((f) => (
              <li key={f.code} className="flex items-start gap-3 text-sm">
                <span className={`mt-0.5 inline-block h-2 w-2 rounded-full ${f.level === "alto" ? "bg-rose-400" : f.level === "medio" ? "bg-amber-400" : "bg-blue-400"}`} />
                <div>
                  <span className="font-medium mr-2">[{f.code}]</span>
                  <span className="text-muted-foreground">{f.message}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* IA */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-accent/5 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Análisis con IA</h3>
          <Button size="sm" onClick={() => aiM.mutate()} disabled={aiM.isPending}>
            {aiM.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analizando…</> : "Generar análisis"}
          </Button>
        </div>
        {iaOut ? (
          <RichMarkdown>{iaOut}</RichMarkdown>
        ) : (
          <p className="text-sm text-muted-foreground">La IA revisará uso CFDI, método/forma de pago, montos y dará recomendaciones contextualizadas.</p>
        )}
      </div>
    </div>
  );
}

function Card({ title, children, full }: { title: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`rounded-xl border border-border bg-card/40 p-5 ${full ? "md:col-span-2" : ""}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-medium tabular-nums">{fmt(value)}</div>
    </div>
  );
}

function RiskPill({ level }: { level: "alto" | "medio" | "bajo" | "ok" }) {
  const map = {
    alto: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    medio: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    bajo: "bg-blue-500/15 text-blue-300 border-blue-500/40",
    ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  };
  const label = { alto: "Riesgo alto", medio: "Riesgo medio", bajo: "Aviso", ok: "Sin riesgos" };
  return <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${map[level]}`}>{label[level]}</span>;
}
