import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Printer, XCircle } from "lucide-react";
import { useActiveCliente } from "@/lib/active-cliente";
import { reporteConciliacion } from "@/lib/conciliacion/conciliacion.functions";
import type { Excepcion } from "@/lib/conciliacion/reporte";
import { Button } from "@/components/ui/button";
import { exportXlsx, buildFilename } from "@/lib/export/xlsx";

const BusquedaSchema = z.object({
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

export const Route = createFileRoute("/app/conciliacion/reporte")({
  validateSearch: (s) => BusquedaSchema.parse(s),
  component: ReportePage,
});

function periodoActual(): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" });
  return f.format(new Date()).slice(0, 7);
}

const $ = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const ETIQUETA_EXCEPCION: Record<Excepcion["tipo"], string> = {
  deposito_sin_identificar: "Depósito sin identificar",
  cargo_sin_comprobante: "Cargo sin comprobante",
  propuesta_pendiente: "Propuesta por revisar",
  cfdi_sin_cobro: "Factura emitida sin cobro",
  cfdi_sin_pago: "Factura recibida sin pago",
  cfdi_cancelado_conciliado: "CFDI cancelado conciliado",
  diferencia_en_conciliado: "Diferencia en conciliado",
};

const COLOR_PRIORIDAD: Record<Excepcion["prioridad"], string> = {
  alta: "bg-destructive/10 text-destructive",
  media: "bg-warning/10 text-warning",
  baja: "bg-muted text-muted-foreground",
};

function nombreMes(periodo: string) {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
}

function ReportePage() {
  const { cliente } = useActiveCliente();
  const busqueda = Route.useSearch();
  const navigate = useNavigate();
  const periodo = busqueda.periodo ?? periodoActual();
  const fn = useServerFn(reporteConciliacion);

  const q = useQuery({
    enabled: !!cliente?.id,
    queryKey: ["recon-reporte", cliente?.id, periodo],
    queryFn: () => fn({ data: { cliente_id: cliente!.id, periodo } }),
  });

  if (!cliente) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/5 p-8 flex items-start gap-4">
        <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div>
          <div className="font-medium">Selecciona un expediente</div>
          <p className="text-sm text-muted-foreground mt-1">El reporte se genera para el RFC de un cliente.</p>
        </div>
      </div>
    );
  }

  const r = q.data;

  function exportar() {
    if (!r) return;
    exportXlsx(buildFilename(`conciliacion-${periodo}`, cliente!.rfc), [
      {
        name: "Banco",
        rows: [
          ...r.banco.renglones.map((x) => ({ Concepto: x.concepto, Movimientos: x.movimientos, Abonos: x.abonos, Cargos: x.cargos })),
          { Concepto: "TOTAL ESTADO DE CUENTA", Movimientos: "", Abonos: r.banco.total_abonos, Cargos: r.banco.total_cargos },
        ],
      },
      {
        name: "Sin factura",
        rows: r.sin_factura_por_categoria.map((x) => ({ Categoría: x.concepto, Movimientos: x.movimientos, Abonos: x.abonos, Cargos: x.cargos })),
      },
      {
        name: "CFDI",
        rows: r.cfdi.renglones.map((x) => ({ Concepto: x.concepto, Comprobantes: x.movimientos, Emitidos: x.abonos, Recibidos: x.cargos })),
      },
      {
        name: "Excepciones",
        rows: r.excepciones.map((e) => ({
          Prioridad: e.prioridad,
          Tipo: ETIQUETA_EXCEPCION[e.tipo],
          Fecha: e.fecha,
          Descripción: e.descripcion,
          Importe: e.importe,
        })),
      },
    ]);
  }

  return (
    <div className="space-y-6 max-w-5xl print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/app/conciliacion" search={{ periodo }} className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a conciliación
        </Link>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={periodo}
            onChange={(e) => e.target.value && navigate({ to: "/app/conciliacion/reporte", search: { periodo: e.target.value } })}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          />
          <Button variant="outline" size="sm" onClick={exportar} disabled={!r}>
            <Download className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button size="sm" onClick={() => window.print()} disabled={!r}>
            <Printer className="h-4 w-4 mr-1" /> Imprimir / PDF
          </Button>
        </div>
      </div>

      <header className="border-b pb-4">
        <h1 className="text-2xl font-semibold">Conciliación bancaria · {nombreMes(periodo)}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {r?.cliente.razon_social ?? cliente.razon_social} · RFC {r?.cliente.rfc ?? cliente.rfc}
        </p>
      </header>

      {q.isLoading && <p className="text-sm text-muted-foreground">Preparando el reporte…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}

      {r && (
        <>
          {r.cuentas.length === 0 ? (
            <div className="rounded-lg border p-6 text-sm text-muted-foreground">
              No hay movimientos validados en este periodo. Importa y valida el estado de cuenta para generar el reporte.
            </div>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-3">
                <Tarjeta titulo="Movimientos explicados" valor={`${r.avance.movimientos_explicados_pct}%`} nota={`${r.avance.pendientes} por resolver`} />
                <Tarjeta titulo="Excepciones" valor={String(r.excepciones.length)} nota={`${r.excepciones.filter((e) => e.prioridad === "alta").length} de prioridad alta`} />
                <Tarjeta
                  titulo="Cuadre del banco"
                  valor={r.banco.cuadra ? "Cuadra" : "No cuadra"}
                  nota={r.banco.cuadra ? "Cada peso tiene renglón" : "Revisa: hay importes sin clasificar"}
                  ok={r.banco.cuadra}
                />
              </section>

              <section className="space-y-2">
                <h2 className="font-semibold">Saldos por cuenta</h2>
                <table className="w-full text-sm border rounded-md overflow-hidden">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="p-2">Cuenta</th>
                      <th className="p-2 text-right">Saldo inicial</th>
                      <th className="p-2 text-right">Abonos</th>
                      <th className="p-2 text-right">Cargos</th>
                      <th className="p-2 text-right">Saldo final</th>
                      <th className="p-2 text-center">Comprobación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.cuentas.map((c) => (
                      <tr key={c.cuenta_id} className="border-t">
                        <td className="p-2">{c.nombre}</td>
                        <td className="p-2 text-right tabular-nums">{$(c.saldo_inicial)}</td>
                        <td className="p-2 text-right tabular-nums">{$(c.abonos)}</td>
                        <td className="p-2 text-right tabular-nums">{$(c.cargos)}</td>
                        <td className="p-2 text-right tabular-nums">{$(c.saldo_final ?? c.saldo_final_calculado)}</td>
                        <td className="p-2 text-center">
                          {c.saldos_cuadran === null ? (
                            <span className="text-xs text-muted-foreground">Sin saldos impresos</span>
                          ) : c.saldos_cuadran ? (
                            <CheckCircle2 className="h-4 w-4 text-success inline" />
                          ) : (
                            <span className="text-xs text-destructive inline-flex items-center gap-1">
                              <XCircle className="h-4 w-4" /> calculado {$(c.saldo_final_calculado)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="space-y-2">
                <h2 className="font-semibold">Integración del estado de cuenta</h2>
                <TablaRenglones
                  filas={r.banco.renglones}
                  cols={["Movimientos", "Abonos", "Cargos"]}
                  total={{ concepto: "Total del estado de cuenta", abonos: r.banco.total_abonos, cargos: r.banco.total_cargos }}
                />
              </section>

              {r.sin_factura_por_categoria.length > 0 && (
                <section className="space-y-2">
                  <h2 className="font-semibold">Movimientos sin factura por categoría</h2>
                  <TablaRenglones filas={r.sin_factura_por_categoria} cols={["Movimientos", "Abonos", "Cargos"]} />
                </section>
              )}
            </>
          )}

          <section className="space-y-2">
            <h2 className="font-semibold">Comprobantes fiscales del periodo</h2>
            {r.cfdi.renglones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay CFDI del periodo en el expediente.</p>
            ) : (
              <TablaRenglones filas={r.cfdi.renglones} cols={["Comprobantes", "Emitidos", "Recibidos"]} />
            )}
          </section>

          <section className="space-y-2 print:break-before-page">
            <h2 className="font-semibold">Bandeja de excepciones</h2>
            <p className="text-xs text-muted-foreground">Sólo lo que necesita atención, lo más grave primero.</p>
            {r.excepciones.length === 0 ? (
              <div className="rounded-lg border border-success/40 bg-success/5 p-4 text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" /> Sin excepciones: el periodo está explicado.
              </div>
            ) : (
              <table className="w-full text-sm border rounded-md overflow-hidden">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-2">Prioridad</th>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Fecha</th>
                    <th className="p-2">Descripción</th>
                    <th className="p-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {r.excepciones.slice(0, 300).map((e, i) => (
                    <tr key={i} className="border-t align-top">
                      <td className="p-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${COLOR_PRIORIDAD[e.prioridad]}`}>{e.prioridad}</span>
                      </td>
                      <td className="p-2 whitespace-nowrap">{ETIQUETA_EXCEPCION[e.tipo]}</td>
                      <td className="p-2 whitespace-nowrap tabular-nums">{e.fecha}</td>
                      <td className="p-2">{e.descripcion}</td>
                      <td className="p-2 text-right tabular-nums">{$(e.importe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.excepciones.length > 300 && (
              <p className="text-xs text-muted-foreground">Se muestran 300 de {r.excepciones.length}; el Excel trae todas.</p>
            )}
          </section>

          <footer className="pt-4 border-t text-xs text-muted-foreground">
            Generado el {new Date(r.generado_at).toLocaleString("es-MX")} con ContaClick. Sólo cuenta como conciliado lo confirmado por una persona.
          </footer>
        </>
      )}
    </div>
  );
}

function Tarjeta({ titulo, valor, nota, ok }: { titulo: string; valor: string; nota: string; ok?: boolean }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className={`text-2xl font-semibold mt-1 ${ok === false ? "text-destructive" : ok ? "text-success" : ""}`}>{valor}</div>
      <div className="text-xs text-muted-foreground mt-1">{nota}</div>
    </div>
  );
}

function TablaRenglones({
  filas,
  cols,
  total,
}: {
  filas: { concepto: string; movimientos: number; abonos: number; cargos: number }[];
  cols: [string, string, string];
  total?: { concepto: string; abonos: number; cargos: number };
}) {
  return (
    <table className="w-full text-sm border rounded-md overflow-hidden">
      <thead className="bg-muted/50 text-left">
        <tr>
          <th className="p-2">Concepto</th>
          <th className="p-2 text-right">{cols[0]}</th>
          <th className="p-2 text-right">{cols[1]}</th>
          <th className="p-2 text-right">{cols[2]}</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.concepto} className="border-t">
            <td className="p-2">{f.concepto}</td>
            <td className="p-2 text-right tabular-nums">{f.movimientos}</td>
            <td className="p-2 text-right tabular-nums">{f.abonos ? $(f.abonos) : "—"}</td>
            <td className="p-2 text-right tabular-nums">{f.cargos ? $(f.cargos) : "—"}</td>
          </tr>
        ))}
        {total && (
          <tr className="border-t-2 font-semibold">
            <td className="p-2">{total.concepto}</td>
            <td className="p-2" />
            <td className="p-2 text-right tabular-nums">{$(total.abonos)}</td>
            <td className="p-2 text-right tabular-nums">{$(total.cargos)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
