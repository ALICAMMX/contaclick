import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Diálogo de doble confirmación para borrados destructivos.
 * El usuario debe escribir exactamente `expected` (case-insensitive) para habilitar el botón.
 * Úsalo para CFDI, expedientes, cuentas bancarias, etc.
 */
export function ConfirmDeleteDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  expected,
  confirmLabel = "Eliminar definitivamente",
  loading = false,
  warning,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
  /** Texto que el usuario debe transcribir para habilitar el botón (ej. el RFC o UUID corto). */
  expected: string;
  confirmLabel?: string;
  loading?: boolean;
  /** Mensaje rojo adicional opcional (ej. "Esta acción no se puede deshacer"). */
  warning?: React.ReactNode;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (!open) setTyped(""); }, [open]);
  const norm = (s: string) => s.trim().toUpperCase();
  const matches = !!expected && norm(typed) === norm(expected);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !loading) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> {title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm">{description}</div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {warning && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {warning}
            </div>
          )}
          <label className="block text-xs text-muted-foreground">
            Para confirmar, escribe <span className="font-mono font-semibold text-foreground">{expected}</span>:
          </label>
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={expected}
            className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm font-mono outline-none focus:ring-1 focus:ring-destructive"
            disabled={loading}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={!matches || loading}
            onClick={onConfirm}
          >
            {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Eliminando…</> : <><Trash2 className="h-4 w-4 mr-1" /> {confirmLabel}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
