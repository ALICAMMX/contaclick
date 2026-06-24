import { ShieldAlert, Copy, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RejectReport } from "@/lib/cfdi/dedup-xml";

export function RejectModal({
  report,
  onClose,
  title,
  contextoLabel = "Expediente activo",
}: {
  report: RejectReport | null;
  onClose: () => void;
  title?: string;
  contextoLabel?: string;
}) {
  const open = !!report;
  const groups = report
    ? [
        { key: "rfcAjeno", title: "RFC ajeno (no corresponde al expediente)", icon: <ShieldAlert className="h-4 w-4" />, tone: "destructive" as const, items: report.rfcAjeno },
        { key: "duplicadosExpediente", title: "Ya existen en el expediente", icon: <Copy className="h-4 w-4" />, tone: "warning" as const, items: report.duplicadosExpediente },
        { key: "duplicadosLocal", title: "Duplicados en esta carga", icon: <Copy className="h-4 w-4" />, tone: "warning" as const, items: report.duplicadosLocal },
        { key: "sinUuid", title: "Sin UUID (no timbrados)", icon: <XCircle className="h-4 w-4" />, tone: "muted" as const, items: report.sinUuid },
        { key: "errores", title: "Errores de lectura", icon: <XCircle className="h-4 w-4" />, tone: "destructive" as const, items: report.errores },
      ].filter((g) => g.items.length > 0)
    : [];
  const totalRechazos = groups.reduce((a, g) => a + g.items.length, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            {title ?? `Se rechazaron ${totalRechazos} archivo${totalRechazos !== 1 ? "s" : ""}`}
          </DialogTitle>
          <DialogDescription>
            {contextoLabel}: <strong>RFC {report?.rfc}</strong>. Se aceptaron {report?.aceptados ?? 0} archivo(s).
            Los archivos rechazados <strong>no se cargaron</strong> para evitar mezclar contabilidades o duplicar información.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {groups.map((g) => (
            <div
              key={g.key}
              className={`rounded-lg border p-3 ${
                g.tone === "destructive" ? "border-destructive/40 bg-destructive/5"
                : g.tone === "warning" ? "border-warning/40 bg-warning/5"
                : "border-border bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {g.icon} {g.title}
                </div>
                <span className="text-xs font-semibold tabular-nums">{g.items.length}</span>
              </div>
              <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                {g.items.map((it, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-mono text-muted-foreground truncate max-w-[55%]">{it.archivo}</span>
                    {it.detalle && <span className="text-muted-foreground">· {it.detalle}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
