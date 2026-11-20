import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtFechaMx } from "@/lib/utils";
import { formateaCentavos } from "@/lib/conciliacion/contrato";
import { CATEGORIAS, ETIQUETA_CATEGORIA, type Categoria } from "@/lib/conciliacion/clasificador";
import { sugerirClasificaciones, confirmarClasificaciones } from "@/lib/conciliacion/conciliacion.functions";

type Props = {
  clienteId: string;
  periodo: string;
  movPorId: Map<string, any>;
  /** Se llama cuando cambian los movimientos para refrescar el resto de la pantalla. */
  onCambio: () => void;
};

/**
 * Movimientos sin factura: el sistema sugiere la categoría (comisión,
 * traspaso, impuestos…) y el contador confirma en bloque. Lo que confirma
 * puede quedar como regla para los siguientes meses.
 */
export function SinFactura({ clienteId, periodo, movPorId, onCambio }: Props) {
  const qc = useQueryClient();
  const fnSugerir = useServerFn(sugerirClasificaciones);
  const fnConfirmar = useServerFn(confirmarClasificaciones);

  const sug = useQuery({
    queryKey: ["recon-sin-factura", clienteId, periodo],
    queryFn: () => fnSugerir({ data: { cliente_id: clienteId, periodo } }),
  });

  const sugerencias = sug.data?.sugerencias ?? [];
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [categoria, setCategoria] = useState<Record<string, Categoria>>({});
  const [recordar, setRecordar] = useState<Set<string>>(new Set());

  // Por omisión se seleccionan las sugerencias de alta confianza.
  useEffect(() => {
    setSeleccion(new Set(sugerencias.filter((s) => s.confianza === "alta").map((s) => s.movimiento_id)));
    setCategoria({});
    setRecordar(new Set());
  }, [sug.data]);

  const grupos = useMemo(() => {
    const m = new Map<Categoria, typeof sugerencias>();
    for (const s of sugerencias) {
      const c = (categoria[s.movimiento_id] ?? s.categoria) as Categoria;
      m.set(c, [...(m.get(c) ?? []), s]);
    }
    return [...m.entries()];
  }, [sugerencias, categoria]);

  const confirmar = useMutation({
    mutationFn: async () => {
      const elegidos = sugerencias.filter((s) => seleccion.has(s.movimiento_id));
      const item = (s: (typeof sugerencias)[number]) => {
        const c = (categoria[s.movimiento_id] ?? s.categoria) as Categoria;
        return { movimiento_id: s.movimiento_id, categoria: c, origen: (c === s.categoria ? s.origen : "humano") as any };
      };
      let total = 0;
      // Los que se recuerdan van uno por uno (cada uno deja su regla).
      for (const s of elegidos.filter((x) => recordar.has(x.movimiento_id))) {
        const it = item(s);
        const mov = movPorId.get(s.movimiento_id);
        const r = await fnConfirmar({ data: {
          cliente_id: clienteId,
          items: [it],
          recordar: s.patron_sugerido && s.patron_sugerido.length >= 4
            ? { patron: s.patron_sugerido, direccion: Number(mov?.abono ?? 0) > 0 ? "abono" : "cargo", categoria: it.categoria, todo_el_despacho: false }
            : null,
        } });
        total += r.clasificados;
      }
      const resto = elegidos.filter((x) => !recordar.has(x.movimiento_id)).map(item);
      for (let i = 0; i < resto.length; i += 300) {
        const r = await fnConfirmar({ data: { cliente_id: clienteId, items: resto.slice(i, i + 300) } });
        total += r.clasificados;
        if (r.fallidos.length) toast.error(`${r.fallidos.length} movimiento(s) no se pudieron clasificar: ${r.fallidos[0].error}`);
      }
      return total;
    },
    onSuccess: (n) => {
      toast.success(`${n} movimiento(s) clasificados. Puedes devolverlos a pendientes cuando quieras.`);
      qc.invalidateQueries({ queryKey: ["recon-sin-factura", clienteId] });
      onCambio();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (sug.isLoading) return <p className="text-sm text-muted-foreground">Buscando movimientos sin factura…</p>;
  if (sug.error) return <p className="text-sm text-destructive">{(sug.error as Error).message}</p>;
  if (sugerencias.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay comisiones, traspasos, impuestos ni otros movimientos sin factura por clasificar en este periodo.
      </p>
    );
  }

  const alternar = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    fn(n);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {sugerencias.length} movimiento(s) parecen no llevar factura. Revisa la categoría y confirma los que estén bien.
          {sug.data?.pendientes_sin_sugerencia ? ` Otros ${sug.data.pendientes_sin_sugerencia} siguen sin explicación: revísalos abajo.` : ""}
        </p>
        <Button size="sm" onClick={() => confirmar.mutate()} disabled={confirmar.isPending || seleccion.size === 0}>
          {confirmar.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
          Confirmar {seleccion.size} seleccionado(s)
        </Button>
      </div>

      {grupos.map(([cat, lista]) => (
        <div key={cat} className="rounded-md border">
          <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2 text-sm font-medium">
            <span className="flex items-center gap-2"><Tags className="h-4 w-4" /> {ETIQUETA_CATEGORIA[cat]} · {lista.length}</span>
            <span className="text-xs text-muted-foreground">
              {formateaCentavos(lista.reduce((s, x) => s + Number(movPorId.get(x.movimiento_id)?.importe_centavos ?? 0), 0))}
            </span>
          </div>
          <ul className="divide-y">
            {lista.map((s) => {
              const m = movPorId.get(s.movimiento_id);
              return (
                <li key={s.movimiento_id} className="flex flex-wrap items-start gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={seleccion.has(s.movimiento_id)}
                    onChange={() => alternar(seleccion, s.movimiento_id, setSeleccion)}
                    aria-label="Seleccionar movimiento"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {m ? `${fmtFechaMx(m.fecha)} · ${m.descripcion}` : "Movimiento"}
                      {m ? ` · ${Number(m.abono ?? 0) > 0 ? "entra" : "sale"} ${formateaCentavos(Number(m.importe_centavos ?? 0))}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.explicacion} {s.confianza === "alta" ? "Confianza alta." : "Revisa antes de confirmar."}
                    </div>
                  </div>
                  <select
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                    value={categoria[s.movimiento_id] ?? s.categoria}
                    onChange={(e) => setCategoria({ ...categoria, [s.movimiento_id]: e.target.value as Categoria })}
                    aria-label="Categoría"
                  >
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}
                  </select>
                  {s.origen !== "regla_aprendida" && s.patron_sugerido && s.patron_sugerido.length >= 4 && (
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={recordar.has(s.movimiento_id)}
                        onChange={() => alternar(recordar, s.movimiento_id, setRecordar)}
                      />
                      Recordar «{s.patron_sugerido}»
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
