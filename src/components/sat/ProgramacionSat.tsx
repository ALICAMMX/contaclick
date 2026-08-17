// Panel de programación de Descargas Masivas SAT.
//
// Sólo administra el calendario. La descarga la ejecuta el mismo motor que el
// botón "Sincronizar ahora"; aquí no hay una segunda ruta de descarga.

import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarClock, Pause, Play, Trash2, Info } from "lucide-react";
import {
  cambiarEstadoProgramacionSat,
  getProgramacionSat,
  guardarProgramacionSat,
} from "@/lib/sat/programacion.functions";
import {
  AVISO_ASINCRONO,
  ESTADO_OCURRENCIA_LABEL,
  PERIODO_LABEL,
  ZONA_PREDETERMINADA,
  type PeriodoOpcion,
} from "@/lib/sat/programacion";

const ZONAS = [
  ["America/Mexico_City", "Centro (Ciudad de México)"],
  ["America/Cancun", "Sureste (Cancún)"],
  ["America/Chihuahua", "Pacífico (Chihuahua)"],
  ["America/Hermosillo", "Noroeste (Hermosillo)"],
  ["America/Tijuana", "Noroeste (Tijuana)"],
  ["UTC", "UTC"],
] as const;

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

type Form = {
  activa: boolean;
  zona_horaria: string;
  tipo: "unica" | "recurrente";
  recurrencia: "diaria" | "semanal" | "mensual";
  dias_semana: number[];
  dia_mes: number;
  hora: number;
  minuto: number;
  fecha_unica: string;
  periodo_opcion: PeriodoOpcion;
  rango_desde: string;
  rango_hasta: string;
  solapamiento_dias: number;
  emitidos: boolean;
  recibidos: boolean;
  clasificar_nomina: boolean;
  clasificar_pagos: boolean;
  tolerancia_minutos: number;
  politica_retraso: "recuperar" | "omitir";
};

const INICIAL: Form = {
  activa: true,
  zona_horaria: ZONA_PREDETERMINADA,
  tipo: "recurrente",
  recurrencia: "diaria",
  dias_semana: [1, 2, 3, 4, 5],
  dia_mes: 1,
  hora: 2,
  minuto: 0,
  fecha_unica: new Date().toISOString().slice(0, 10),
  periodo_opcion: "dia_anterior",
  rango_desde: "",
  rango_hasta: "",
  solapamiento_dias: 1,
  emitidos: true,
  recibidos: true,
  clasificar_nomina: true,
  clasificar_pagos: true,
  tolerancia_minutos: 60,
  politica_retraso: "recuperar",
};

const label = "block text-xs font-medium text-muted-foreground mb-1";
const input =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary";

export function ProgramacionSat({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const fnGet = useServerFn(getProgramacionSat);
  const fnSave = useServerFn(guardarProgramacionSat);
  const fnEstado = useServerFn(cambiarEstadoProgramacionSat);
  const [f, setF] = useState<Form>(INICIAL);

  const q = useQuery({
    queryKey: ["sat-programacion", clienteId],
    queryFn: () => fnGet({ data: { cliente_id: clienteId } }),
  });

  const p: any = q.data?.programacion ?? null;

  useEffect(() => {
    if (!p) return;
    setF({
      activa: p.activa,
      zona_horaria: p.zona_horaria,
      tipo: p.tipo,
      recurrencia: p.recurrencia ?? "diaria",
      dias_semana: p.dias_semana ?? [],
      dia_mes: p.dia_mes ?? 1,
      hora: p.hora,
      minuto: p.minuto,
      fecha_unica: p.fecha_unica ?? INICIAL.fecha_unica,
      periodo_opcion: p.periodo_opcion,
      rango_desde: p.rango_desde ?? "",
      rango_hasta: p.rango_hasta ?? "",
      solapamiento_dias: p.solapamiento_dias,
      emitidos: p.emitidos,
      recibidos: p.recibidos,
      clasificar_nomina: p.clasificar_nomina,
      clasificar_pagos: p.clasificar_pagos,
      tolerancia_minutos: p.tolerancia_minutos,
      politica_retraso: p.politica_retraso,
    });
  }, [p?.id, p?.version]);

  const guardar = useMutation({
    mutationFn: () =>
      fnSave({
        data: {
          cliente_id: clienteId,
          ...f,
          recurrencia: f.tipo === "recurrente" ? f.recurrencia : null,
          fecha_unica: f.tipo === "unica" ? f.fecha_unica : null,
          rango_desde: f.periodo_opcion === "rango_fijo" ? f.rango_desde || null : null,
          rango_hasta: f.periodo_opcion === "rango_fijo" ? f.rango_hasta || null : null,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Programación guardada.", { description: AVISO_ASINCRONO });
      qc.invalidateQueries({ queryKey: ["sat-programacion", clienteId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar la programación."),
  });

  const estado = useMutation({
    mutationFn: (accion: "pausar" | "reanudar" | "cancelar") =>
      fnEstado({ data: { cliente_id: clienteId, accion } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sat-programacion", clienteId] });
      toast.success("Programación actualizada.");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo actualizar."),
  });

  const rango = p?.periodo_estimado;
  const bitacora = q.data?.bitacora ?? [];

  const estadoTexto = useMemo(() => {
    if (!p) return "Sin programación";
    if (p.cancelada) return "Cancelada";
    if (p.pausada) return "Pausada";
    if (!p.activa) return "Inactiva";
    return "Activa";
  }, [p]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" /> Programación de descargas
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              ContaClick enviará la solicitud aproximadamente a esta hora. El SAT procesa las
              descargas de forma asíncrona y puede tardar en entregar los XML.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Estado</div>
            <div className="text-sm font-medium">{estadoTexto}</div>
          </div>
        </div>

        {p && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded-md bg-muted/40 p-3">
              <div className="text-muted-foreground">Próxima ejecución</div>
              <div className="font-medium mt-0.5">{p.proxima_local ?? "Sin ejecuciones futuras"}</div>
              <div className="text-muted-foreground mt-0.5">{p.resumen}</div>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <div className="text-muted-foreground">Periodo que se solicitará</div>
              <div className="font-medium mt-0.5">
                {rango ? `${rango.desde} → ${rango.hasta}` : "—"}
              </div>
              <div className="text-muted-foreground mt-0.5">{rango?.nota}</div>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <div className="text-muted-foreground">Última ejecución</div>
              <div className="font-medium mt-0.5">
                {p.ultima_ejecucion_at
                  ? new Date(p.ultima_ejecucion_at).toLocaleString("es-MX")
                  : "Aún no se ejecuta"}
              </div>
              <div className="text-muted-foreground mt-0.5">
                {p.ultimo_resultado
                  ? (ESTADO_OCURRENCIA_LABEL as any)[p.ultimo_resultado] ?? p.ultimo_resultado
                  : "—"}
              </div>
            </div>
          </div>
        )}

        {p && !p.cancelada && (
          <div className="mt-3 flex gap-2">
            {p.pausada ? (
              <Button size="sm" variant="outline" onClick={() => estado.mutate("reanudar")} disabled={estado.isPending}>
                <Play className="h-3.5 w-3.5 mr-1.5" /> Reanudar
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => estado.mutate("pausar")} disabled={estado.isPending}>
                <Pause className="h-3.5 w-3.5 mr-1.5" /> Pausar
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => estado.mutate("cancelar")} disabled={estado.isPending}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Cancelar programación
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h4 className="text-sm font-semibold">{p ? "Editar programación" : "Crear programación"}</h4>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={label}>Tipo</label>
            <select className={input} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as any })}>
              <option value="recurrente">Recurrente</option>
              <option value="unica">Una sola vez</option>
            </select>
          </div>
          <div>
            <label className={label}>Zona horaria</label>
            <select className={input} value={f.zona_horaria} onChange={(e) => setF({ ...f, zona_horaria: e.target.value })}>
              {ZONAS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Hora local</label>
            <input
              type="time"
              className={input}
              value={`${String(f.hora).padStart(2, "0")}:${String(f.minuto).padStart(2, "0")}`}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":");
                setF({ ...f, hora: Number(h ?? 0), minuto: Number(m ?? 0) });
              }}
            />
          </div>
        </div>

        {f.tipo === "recurrente" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={label}>Recurrencia</label>
              <select className={input} value={f.recurrencia} onChange={(e) => setF({ ...f, recurrencia: e.target.value as any })}>
                <option value="diaria">Diaria</option>
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>
            {f.recurrencia === "semanal" && (
              <div className="sm:col-span-2">
                <label className={label}>Días</label>
                <div className="flex flex-wrap gap-1">
                  {DIAS.map((d, i) => {
                    const on = f.dias_semana.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setF({
                            ...f,
                            dias_semana: on
                              ? f.dias_semana.filter((x) => x !== i)
                              : [...f.dias_semana, i].sort(),
                          })
                        }
                        className={`px-2.5 py-1.5 rounded-md text-xs border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {f.recurrencia === "mensual" && (
              <div>
                <label className={label}>Día del mes</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className={input}
                  value={f.dia_mes}
                  onChange={(e) => setF({ ...f, dia_mes: Number(e.target.value) })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Si el mes no tiene ese día, se ejecuta el último día del mes.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={label}>Fecha</label>
              <input type="date" className={input} value={f.fecha_unica} onChange={(e) => setF({ ...f, fecha_unica: e.target.value })} />
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={label}>Periodo a solicitar</label>
            <select className={input} value={f.periodo_opcion} onChange={(e) => setF({ ...f, periodo_opcion: e.target.value as PeriodoOpcion })}>
              {(Object.keys(PERIODO_LABEL) as PeriodoOpcion[])
                .filter((k) => k !== "rango_fijo" || f.tipo === "unica")
                .map((k) => (
                  <option key={k} value={k}>{PERIODO_LABEL[k]}</option>
                ))}
            </select>
          </div>
          {f.periodo_opcion === "rango_fijo" && (
            <>
              <div>
                <label className={label}>Desde</label>
                <input type="date" className={input} value={f.rango_desde} onChange={(e) => setF({ ...f, rango_desde: e.target.value })} />
              </div>
              <div>
                <label className={label}>Hasta</label>
                <input type="date" className={input} value={f.rango_hasta} onChange={(e) => setF({ ...f, rango_hasta: e.target.value })} />
              </div>
            </>
          )}
          {f.periodo_opcion !== "rango_fijo" && (
            <div>
              <label className={label}>Días de traslape</label>
              <input
                type="number"
                min={0}
                max={30}
                className={input}
                value={f.solapamiento_dias}
                onChange={(e) => setF({ ...f, solapamiento_dias: Number(e.target.value) })}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Repite días ya descargados para no perder comprobantes timbrados tarde. Los duplicados
                se descartan por UUID.
              </p>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-medium">Qué descargar</div>
            {([
              ["emitidos", "CFDI emitidos"],
              ["recibidos", "CFDI recibidos"],
            ] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked } as Form)} />
                {l}
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium">Clasificación posterior</div>
            {([
              ["clasificar_nomina", "Identificar nómina"],
              ["clasificar_pagos", "Identificar complementos de pago"],
            ] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked } as Form)} />
                {l}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={label}>Tolerancia de retraso (minutos)</label>
            <input
              type="number"
              min={0}
              max={720}
              className={input}
              value={f.tolerancia_minutos}
              onChange={(e) => setF({ ...f, tolerancia_minutos: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={label}>Si se pasa la tolerancia</label>
            <select className={input} value={f.politica_retraso} onChange={(e) => setF({ ...f, politica_retraso: e.target.value as any })}>
              <option value="recuperar">Ejecutar de todos modos (recuperar)</option>
              <option value="omitir">Omitir esa ocurrencia</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.activa} onChange={(e) => setF({ ...f, activa: e.target.checked })} />
              Programación activa
            </label>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Sólo se recupera la ocurrencia más reciente: si el sistema estuvo detenido, no se
            acumulan varias descargas. La ejecución respeta los límites de tu plan y no se lanza si
            el expediente ya tiene una corrida en curso.
          </span>
        </div>

        <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
          {guardar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {p ? "Guardar cambios" : "Crear programación"}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold">
          Bitácora de la programación
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left p-2 font-medium">Fecha</th>
                <th className="text-left p-2 font-medium">Acción</th>
                <th className="text-left p-2 font-medium">Programada</th>
                <th className="text-left p-2 font-medium">Retraso</th>
                <th className="text-left p-2 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {bitacora.map((b: any, i: number) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-2">{new Date(b.created_at).toLocaleString("es-MX")}</td>
                  <td className="p-2">{b.accion}</td>
                  <td className="p-2">
                    {b.programada_at ? new Date(b.programada_at).toLocaleString("es-MX") : "—"}
                  </td>
                  <td className="p-2">{b.retraso_ms ? `${Math.round(b.retraso_ms / 60000)} min` : "—"}</td>
                  <td className="p-2">
                    {b.resultado ? (ESTADO_OCURRENCIA_LABEL as any)[b.resultado] ?? b.resultado : "—"}
                  </td>
                </tr>
              ))}
              {bitacora.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    Sin movimientos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
