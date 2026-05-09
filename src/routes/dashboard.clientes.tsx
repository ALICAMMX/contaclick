import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/clientes")({
  component: Clientes,
});

const clientes = [
  { nombre: "Servicios García SA de CV", rfc: "SGA950822RR1", regimen: "General Persona Moral", semaforo: "verde", obl: 4, mes: "Al día" },
  { nombre: "Distribuidora MX SA", rfc: "DMX110505KK2", regimen: "General Persona Moral", semaforo: "amarillo", obl: 5, mes: "Pendiente DIOT" },
  { nombre: "Tech Norte SAPI", rfc: "TNO200101QQ3", regimen: "General Persona Moral", semaforo: "rojo", obl: 6, mes: "3 alertas" },
  { nombre: "Ana López Pérez", rfc: "LOPA850612XYZ", regimen: "RESICO Persona Física", semaforo: "verde", obl: 2, mes: "Al día" },
  { nombre: "Comercial Luna SC", rfc: "CLU120304ABC", regimen: "General Persona Moral", semaforo: "amarillo", obl: 4, mes: "Pendiente IVA" },
];

const tone = (s: string) =>
  s === "verde" ? "bg-success" : s === "amarillo" ? "bg-warning" : "bg-destructive";

function Clientes() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground text-sm mt-1">47 clientes activos · 3 nuevos este mes</p>
        </div>
        <Button variant="hero"><Plus className="h-4 w-4" /> Nuevo cliente</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          placeholder="Buscar por nombre o RFC..."
          className="w-full pl-9 pr-3 h-10 rounded-lg bg-input/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/30">
            <tr>
              <th className="text-left font-medium px-5 py-3">Cliente</th>
              <th className="text-left font-medium px-5 py-3">RFC</th>
              <th className="text-left font-medium px-5 py-3">Régimen</th>
              <th className="text-left font-medium px-5 py-3">Obligaciones</th>
              <th className="text-left font-medium px-5 py-3">Estado</th>
              <th className="text-left font-medium px-5 py-3">Semáforo</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.rfc} className="border-t border-border/30 hover:bg-accent/5 cursor-pointer">
                <td className="px-5 py-3.5 font-medium">{c.nombre}</td>
                <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{c.rfc}</td>
                <td className="px-5 py-3.5 text-muted-foreground">{c.regimen}</td>
                <td className="px-5 py-3.5">{c.obl}</td>
                <td className="px-5 py-3.5 text-sm">{c.mes}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${tone(c.semaforo)}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
