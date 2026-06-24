import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileBadge, Search, Upload, UserRound, Truck, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listRfcsVinculados, deleteCliente } from "@/lib/clientes.functions";

export const Route = createFileRoute("/app/rfcs-vinculados")({
  component: RfcsVinculadosPage,
});

const TIPO_META: Record<string, { label: string; icon: any; tone: string }> = {
  cliente: { label: "Cliente", icon: UserRound, tone: "bg-primary/10 text-primary" },
  proveedor: { label: "Proveedor", icon: Truck, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-300" },
  acreedor: { label: "Acreedor", icon: Receipt, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
};

function RfcsVinculadosPage() {
  const fn = useServerFn(listRfcsVinculados);
  const del = useServerFn(deleteCliente);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "cliente" | "proveedor" | "acreedor">("todos");

  const { data, isLoading } = useQuery({ queryKey: ["rfcs-vinculados"], queryFn: () => fn() });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("RFC eliminado");
      qc.invalidateQueries({ queryKey: ["rfcs-vinculados"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["usage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rfcs = (data?.rfcs ?? []).filter((r) => {
    if (filtro !== "todos" && r.tipo_relacion !== filtro) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return r.rfc.toLowerCase().includes(s) || r.razon_social.toLowerCase().includes(s);
  });

  const counts = (data?.rfcs ?? []).reduce(
    (acc, r) => {
      acc.todos += 1;
      const k = (r.tipo_relacion as "cliente" | "proveedor" | "acreedor") ?? "cliente";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    { todos: 0, cliente: 0, proveedor: 0, acreedor: 0 } as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">RFC vinculados</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Depósito de todas las CSF que has cargado: clientes, proveedores y acreedores. Las herramientas que necesiten un RFC podrán invocarlos de aquí.
          </p>
        </div>
        <Link to="/app/tools/csf-parser">
          <Button variant="hero">
            <Upload className="h-4 w-4" /> Cargar CSF
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {(["todos", "cliente", "proveedor", "acreedor"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFiltro(t)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filtro === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/40 text-muted-foreground"
            }`}
          >
            {t === "todos" ? "Todos" : TIPO_META[t].label} · {counts[t] ?? 0}
          </button>
        ))}
        <div className="relative ml-auto max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar RFC o nombre..."
            className="w-full pl-9 pr-3 h-10 rounded-lg bg-input/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Cargando...</div>
        ) : rfcs.length === 0 ? (
          <div className="p-12 text-center">
            <FileBadge className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <div className="font-medium">Sin RFC cargados</div>
            <p className="text-sm text-muted-foreground mt-1">
              Sube una Constancia de Situación Fiscal desde el{" "}
              <Link to="/app/tools/csf-parser" className="text-primary hover:underline">Lector de CSF</Link>.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left font-medium px-5 py-3">Tipo</th>
                <th className="text-left font-medium px-5 py-3">Razón social</th>
                <th className="text-left font-medium px-5 py-3">RFC</th>
                <th className="text-left font-medium px-5 py-3">Régimen</th>
                <th className="text-left font-medium px-5 py-3">CSF</th>
                <th className="text-right font-medium px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rfcs.map((r) => {
                const meta = TIPO_META[r.tipo_relacion ?? "cliente"] ?? TIPO_META.cliente;
                const Icon = meta.icon;
                return (
                  <tr key={r.id} className="border-t border-border/30 hover:bg-accent/5">
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md ${meta.tone}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-medium">{r.razon_social}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{r.rfc}</td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs truncate max-w-[260px]">{r.regimen_fiscal ?? "—"}</td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      {r.csf_ultima_emision ? new Date(r.csf_ultima_emision).toLocaleDateString("es-MX") : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-2">
                        {r.tipo_relacion === "cliente" && (
                          <Link to="/app/clientes/$id" params={{ id: r.id }} className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/40">
                            Abrir expediente
                          </Link>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`¿Eliminar el RFC ${r.rfc}?`)) deleteMut.mutate(r.id);
                          }}
                          className="text-xs px-2 py-1 rounded-md text-destructive hover:bg-destructive/10 inline-flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" /> Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
