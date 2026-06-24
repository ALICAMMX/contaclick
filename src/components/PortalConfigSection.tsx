import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPortalConfig, updatePortalConfig, type PortalConfig } from "@/lib/portal/portal.functions";

const FIELDS: { key: keyof PortalConfig; label: string; hint: string }[] = [
  { key: "ver_dashboard", label: "Dashboard / Resumen", hint: "Tarjetas de ingresos, egresos, CXC, CXP del mes." },
  { key: "ver_cfdi", label: "CFDI", hint: "Ver lista de comprobantes emitidos y recibidos." },
  { key: "ver_cxc", label: "Cuentas por cobrar", hint: "Saldo y detalle de lo que le deben al cliente." },
  { key: "ver_cxp", label: "Cuentas por pagar", hint: "Saldo y detalle de lo que el cliente debe pagar." },
  { key: "ver_impuestos", label: "Impuestos", hint: "Resumen de impuestos calculados / pagados." },
  { key: "ver_obligaciones", label: "Obligaciones fiscales", hint: "Calendario de obligaciones SAT del cliente." },
  { key: "ver_reportes", label: "Reportes", hint: "Reportes que el contador publica para el cliente." },
  { key: "ver_mensajes", label: "Mensajes", hint: "Avisos y comunicación del contador." },
  { key: "puede_subir_docs", label: "Subir documentos", hint: "Permite que el cliente cargue documentos solicitados." },
];

export function PortalConfigSection({ clienteId }: { clienteId: string }) {
  const getFn = useServerFn(getPortalConfig);
  const updateFn = useServerFn(updatePortalConfig);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["portal-config", clienteId],
    queryFn: () => getFn({ data: { cliente_id: clienteId } }),
  });

  const [local, setLocal] = useState<PortalConfig | null>(null);
  useEffect(() => { if (data?.config) setLocal(data.config); }, [data]);

  const mut = useMutation({
    mutationFn: (cfg: PortalConfig) => updateFn({ data: { cliente_id: clienteId, config: cfg } }),
    onSuccess: () => { toast.success("Portal actualizado"); qc.invalidateQueries({ queryKey: ["portal-config", clienteId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  if (isLoading || !local) return <div className="text-sm text-muted-foreground">Cargando configuración del portal…</div>;

  return (
    <section className="rounded-xl border border-border bg-card/40 p-5 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" /> Portal del cliente
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Controla qué puede ver el cliente cuando entra a su portal. Aplica solo a usuarios invitados con rol <strong>Cliente</strong>.
          </p>
        </div>
        <Eye className="h-5 w-5 text-muted-foreground/50 shrink-0" />
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-start gap-3 rounded-lg border border-border/60 p-3 cursor-pointer hover:bg-muted/20">
            <input
              type="checkbox"
              checked={!!local[f.key]}
              onChange={(e) => setLocal({ ...local, [f.key]: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <div className="flex-1">
              <div className="text-sm font-medium">{f.label}</div>
              <div className="text-xs text-muted-foreground">{f.hint}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => mut.mutate(local)} disabled={mut.isPending}>
          {mut.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </section>
  );
}
