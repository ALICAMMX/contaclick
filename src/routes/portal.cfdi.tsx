import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getPortalCFDI } from "@/lib/portal/portal.functions";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/portal/cfdi")({
  component: PortalCFDI,
});

const mxn = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

function PortalCFDI() {
  const fn = useServerFn(getPortalCFDI);
  const [tipo, setTipo] = useState<"todos" | "emitidos" | "recibidos">("todos");
  const [mes, setMes] = useState<string>("");
  const { data, isLoading } = useQuery({
    queryKey: ["portal-cfdi", tipo, mes],
    queryFn: () => fn({ data: { tipo, mes: mes || null } }),
  });

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mis CFDI</h1>
          <p className="text-sm text-muted-foreground mt-1">Comprobantes emitidos y recibidos asociados a tu RFC.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="todos">Todos</option>
            <option value="emitidos">Emitidos</option>
            <option value="recibidos">Recibidos</option>
          </select>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
        </div>
      </header>

      {isLoading ? (
        <div className="text-muted-foreground">Cargando…</div>
      ) : !data || data.cfdis.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
          No hay CFDI en este periodo.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Fecha</th>
                <th className="text-left px-3 py-2">Folio</th>
                <th className="text-left px-3 py-2">Contraparte</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-left px-3 py-2">SAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {data.cfdis.map((c: any) => {
                const isEmitido = c.emisor_rfc === data.cliente.rfc;
                const contraparte = isEmitido ? c.receptor_nombre : c.emisor_nombre;
                return (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs">{new Date(c.fecha).toLocaleDateString("es-MX")}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.serie}{c.folio}</td>
                    <td className="px-3 py-2">
                      <div className="truncate max-w-[260px]">{contraparte}</div>
                      <div className="text-xs text-muted-foreground">{isEmitido ? "Cliente" : "Proveedor"}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{mxn(Number(c.total))}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full ${c.estatus_sat === "Vigente" ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                        {c.estatus_sat ?? "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
