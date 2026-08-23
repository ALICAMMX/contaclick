import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  Banknote, Upload, Sparkles, AlertTriangle, CheckCircle2, FileSpreadsheet,
  Loader2, Wand2, X, Download, ShieldAlert, EyeOff, Undo2, Info,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RichMarkdown } from "@/components/RichMarkdown";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtFechaMx } from "@/lib/utils";
import { useActiveCliente } from "@/lib/active-cliente";
import { parseBankFileWithText, bankFileMatchesContribuyente, type ParsedMovimiento } from "@/lib/conciliacion/parsers";
import {
  previsualizarImportacion, confirmarImportacion, rechazarImportacion, diagnosticoImportacion,
  listMovimientos, runReconciliation,
  getReconciliationStats, analyzeReconciliationAI, decidirGrupo, ignorarMovimiento,
} from "@/lib/conciliacion/conciliacion.functions";
import { ETIQUETA_ESTADO_IMPORTACION, type Incidencia } from "@/lib/conciliacion/importacion";
import {
  ETIQUETA_ESTADO, ETIQUETA_ORIGEN, formateaCentavos, MOTIVO_MINIMO,
  type EstadoConciliacion,
} from "@/lib/conciliacion/contrato";
import { listCuentas, createCuenta, BANCOS } from "@/lib/cuentas/cuentas.functions";
import { exportXlsx, buildFilename } from "@/lib/export/xlsx";

const BusquedaSchema = z.object({
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  cuenta: z.string().optional(),
});

function periodoActual(): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" });
  return f.format(new Date()).slice(0, 7);
}

function isValidIsoDate(s: string): boolean {
  const m = (s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12) return false;
  return d >= 1 && d <= new Date(y, mo, 0).getDate();
}

function prepararMovimientos(list: ParsedMovimiento[]): ParsedMovimiento[] {
  return list
    .map((m) => ({
      ...m,
      descripcion: String(m.descripcion ?? "").replace(/\s+/g, " ").trim().slice(0, 450) || "(sin descripción)",
      referencia: m.referencia ? String(m.referencia).replace(/\s+/g, " ").trim().slice(0, 120) || null : null,
    }));
}

async function sha256Archivo(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatoDe(nombre: string): "csv" | "xlsx" | "pdf" | "manual" {
  const n = nombre.toLowerCase();
  if (n.endsWith(".csv")) return "csv";
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return "xlsx";
  if (n.endsWith(".pdf")) return "pdf";
  return "manual";
}

export const Route = createFileRoute("/app/conciliacion/")({
  validateSearch: (s) => BusquedaSchema.parse(s),
  component: ConciliacionPage,
});

const COLOR_ESTADO: Record<EstadoConciliacion, string> = {
  confirmado: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  propuesto: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  rechazado: "bg-destructive/10 text-destructive border-destructive/30",
  ignorado: "bg-muted text-muted-foreground border-border",
};

function ConciliacionPage() {
  const { cliente, hydrating } = useActiveCliente();
  const navigate = useNavigate({ from: Route.fullPath });
  const busqueda = Route.useSearch();
  const periodo = busqueda.periodo ?? periodoActual();
  const cuentaFiltro = busqueda.cuenta ?? "__all__";
  const qc = useQueryClient();

  const fnPreview = useServerFn(previsualizarImportacion);
  const fnConfirmar = useServerFn(confirmarImportacion);
  const fnRechazar = useServerFn(rechazarImportacion);
  const fnDiagnostico = useServerFn(diagnosticoImportacion);
  const fnList = useServerFn(listMovimientos);
  const fnRun = useServerFn(runReconciliation);
  const fnStats = useServerFn(getReconciliationStats);
  const fnAI = useServerFn(analyzeReconciliationAI);
  const fnDecidir = useServerFn(decidirGrupo);
  const fnIgnorar = useServerFn(ignorarMovimiento);
  const fnCuentas = useServerFn(listCuentas);
  const fnCreateCuenta = useServerFn(createCuenta);

  const [banco, setBanco] = useState("BBVA");
  const [aliasNew, setAliasNew] = useState("Principal");
  const [maskNew, setMaskNew] = useState("");
  const [cuentaSel, setCuentaSel] = useState<string>("__nueva__");
  const [parsed, setParsed] = useState<ParsedMovimiento[]>([]);
  const [archivo, setArchivo] = useState<{ sha256: string; nombre: string; bytes: number; formato: "csv" | "xlsx" | "pdf" | "manual" } | null>(null);
  const [parsingErr, setParsingErr] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiContent, setAiContent] = useState("");
  const [preview, setPreview] = useState<any | null>(null);
  const [aceptaTotales, setAceptaTotales] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [modoRechazo, setModoRechazo] = useState(false);
  const [motivoDialog, setMotivoDialog] = useState<
    | { tipo: "rechazar" | "revertir"; grupoId: string }
    | { tipo: "ignorar"; movimientoId: string }
    | null
  >(null);
  const [motivo, setMotivo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const setBusqueda = (patch: { periodo?: string; cuenta?: string }) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const cuentas = useQuery({
    enabled: !hydrating && !!cliente,
    queryKey: ["cuentas", cliente?.id],
    queryFn: () => fnCuentas({ data: { cliente_id: cliente!.id } }),
  });

  const stats = useQuery({
    enabled: !hydrating && !!cliente,
    queryKey: ["recon-stats", cliente?.id, periodo],
    queryFn: () => fnStats({ data: { cliente_id: cliente!.id, periodo } }),
  });

  const list = useQuery({
    enabled: !hydrating && !!cliente,
    queryKey: ["recon-list", cliente?.id, periodo, cuentaFiltro],
    queryFn: () => fnList({ data: {
      cliente_id: cliente!.id,
      periodo,
      limit: 500,
      ...(cuentaFiltro !== "__all__" ? { cuenta_id: cuentaFiltro } : {}),
    } }),
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["recon-stats", cliente?.id] });
    qc.invalidateQueries({ queryKey: ["recon-list", cliente?.id] });
    qc.invalidateQueries({ queryKey: ["cuentas", cliente?.id] });
  };

  const upload = useMutation({
    mutationFn: async () => {
      if (!cliente) throw new Error("Selecciona un expediente.");
      if (!archivo) throw new Error("Sube un archivo primero.");
      if (cuentaSel === "__nueva__" && !banco) throw new Error("Selecciona la cuenta bancaria del estado de cuenta.");
      const payload: Record<string, unknown> = {
        cliente_id: cliente.id,
        archivo,
        movimientos: prepararMovimientos(parsed),
      };
      if (cuentaSel && cuentaSel !== "__nueva__") payload.cuenta_id = cuentaSel;
      else {
        payload.banco = banco;
        payload.alias = aliasNew || "Principal";
        if (maskNew) payload.mask = maskNew;
      }
      return fnPreview({ data: payload as never });
    },
    onSuccess: (res: any) => {
      setCuentaSel(res.cuenta_id);
      setAceptaTotales(false);
      setModoRechazo(false);
      setMotivoRechazo("");
      if (res.importacion?.estado === "validada") {
        toast.info("Archivo ya validado", { description: res.mensaje });
        setParsed([]); setArchivo(null); invalidar();
        return;
      }
      setPreview(res);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const confirmar = useMutation({
    mutationFn: async () => {
      const imp = preview?.importacion;
      return fnConfirmar({ data: {
        cliente_id: cliente!.id,
        importacion_id: imp.id,
        archivo_sha256: imp.archivo_sha256,
        parser_version: imp.parser_version,
        filas_hash: imp.filas_hash,
        confirmacion_totales: true,
      } as never });
    },
    onSuccess: (r: any) => {
      toast.success(`Importación validada: ${r.movimientos_sellados ?? 0} movimientos quedaron disponibles para conciliar.`);
      setPreview(null); setParsed([]); setArchivo(null); invalidar();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rechazar = useMutation({
    mutationFn: async () => fnRechazar({ data: {
      cliente_id: cliente!.id,
      importacion_id: preview?.importacion?.id,
      motivo: motivoRechazo,
    } as never }),
    onSuccess: (r: any) => {
      toast.success(`Importación rechazada. Se descartaron ${r.movimientos_eliminados ?? 0} movimientos provisionales.`);
      setPreview(null); setParsed([]); setArchivo(null); invalidar();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function copiarDiagnostico() {
    try {
      const d = await fnDiagnostico({ data: { cliente_id: cliente!.id, importacion_id: preview.importacion.id } as never });
      await navigator.clipboard.writeText(JSON.stringify(d, null, 2));
      toast.success("Diagnóstico copiado. No incluye nombres, cuentas ni descripciones.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const newCuenta = useMutation({
    mutationFn: async (input: { banco: string; alias: string; mask?: string }) => {
      if (!cliente) throw new Error("Selecciona un expediente.");
      return fnCreateCuenta({ data: {
        cliente_id: cliente.id, banco: input.banco,
        alias: input.alias || "Principal", numero_cuenta_mask: input.mask || null,
      } });
    },
    onSuccess: (row) => { toast.success(`Cuenta creada: ${row.banco} · ${row.alias}`); setCuentaSel(row.id); invalidar(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const run = useMutation({
    mutationFn: async () => fnRun({ data: { cliente_id: cliente!.id, periodo } }),
    onSuccess: (r) => {
      const reutilizada = (r.corrida as { reutilizada?: boolean } | null)?.reutilizada;
      toast.success(reutilizada ? "Sin cambios: el insumo es idéntico a la corrida anterior." : "Corrida terminada", {
        description: `${r.metricas.propuestos} propuestas (${r.metricas.alta_confianza} de alta confianza) · ninguna queda conciliada hasta que tú la confirmes`,
      });
      invalidar();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const decidir = useMutation({
    mutationFn: async (v: { grupo_id: string; accion: "confirmar" | "rechazar" | "revertir"; motivo?: string }) =>
      fnDecidir({ data: { cliente_id: cliente!.id, ...v } }),
    onSuccess: () => { toast.success("Decisión registrada con tu usuario y fecha."); setMotivoDialog(null); setMotivo(""); invalidar(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const ignorar = useMutation({
    mutationFn: async (v: { movimiento_id: string; motivo: string }) =>
      fnIgnorar({ data: { cliente_id: cliente!.id, ...v, no_fiscal: true } }),
    onSuccess: () => { toast.success("Movimiento marcado como no conciliable."); setMotivoDialog(null); setMotivo(""); invalidar(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const ai = useMutation({
    mutationFn: async () => fnAI({ data: { cliente_id: cliente!.id, periodo } }),
    onSuccess: (r) => { if (r.error) { toast.error(r.error); return; } setAiContent(r.content); setAiOpen(true); },
  });

  const datos = list.data;
  const cfdiPorId = useMemo(
    () => new Map((datos?.cfdi ?? []).map((c: any) => [c.id as string, c])),
    [datos?.cfdi],
  );
  const miembroPorGrupo = useMemo(() => {
    const map = new Map<string, { movimiento_id: string | null; cfdi_id: string | null }>();
    for (const m of datos?.miembros ?? []) if (m.grupo_id) map.set(m.grupo_id as string, m as never);
    return map;
  }, [datos?.miembros]);
  const movPorId = useMemo(
    () => new Map((datos?.movimientos ?? []).map((m: any) => [m.id as string, m])),
    [datos?.movimientos],
  );
  const grupoPorMovimiento = useMemo(() => {
    const map = new Map<string, any>();
    for (const g of datos?.grupos ?? []) {
      const miembro = miembroPorGrupo.get(g.id as string);
      if (miembro?.movimiento_id) map.set(miembro.movimiento_id, g);
    }
    return map;
  }, [datos?.grupos, miembroPorGrupo]);

  const porEstado = (estado: EstadoConciliacion) => (datos?.grupos ?? []).filter((g: any) => g.estado === estado);
  const confirmados = porEstado("confirmado");
  const propuestos = porEstado("propuesto");
  const descartados = [...porEstado("rechazado"), ...porEstado("ignorado")];
  const sinCandidato = (datos?.movimientos ?? []).filter(
    (m: any) => !grupoPorMovimiento.has(m.id) && !m.no_fiscal && !m.ignorado_at,
  );
  const ignoradosMov = (datos?.movimientos ?? []).filter((m: any) => m.no_fiscal || m.ignorado_at);

  async function onFile(file: File) {
    if (!cliente) { toast.error("Selecciona un expediente."); return; }
    setIsParsing(true);
    setParsingErr(null);
    try {
      const [{ movimientos, text }, sha256] = await Promise.all([parseBankFileWithText(file), sha256Archivo(file)]);
      const titular = bankFileMatchesContribuyente(text, { rfc: cliente.rfc, razon_social: cliente.razon_social ?? "" });
      if (!titular.match) {
        setParsingErr(
          `El archivo no parece pertenecer a ${cliente.rfc}. ${titular.reason ?? ""} Verifica que sea el estado de cuenta del expediente activo.`,
        );
        setParsed([]); setArchivo(null);
        return;
      }
      setParsed(movimientos);
      setArchivo({ sha256, nombre: file.name, bytes: file.size, formato: formatoDe(file.name) });
    } catch (e) {
      setParsingErr((e as Error).message);
      setParsed([]); setArchivo(null);
    } finally {
      setIsParsing(false);
    }
  }

  function exportar() {
    const filas = (datos?.grupos ?? []).map((g: any) => {
      const miembro = miembroPorGrupo.get(g.id);
      const mov = miembro?.movimiento_id ? movPorId.get(miembro.movimiento_id) : null;
      const cfdi = miembro?.cfdi_id ? cfdiPorId.get(miembro.cfdi_id) : null;
      return {
        Estado: ETIQUETA_ESTADO[g.estado as EstadoConciliacion],
        Origen: ETIQUETA_ORIGEN[g.origen as "motor" | "humano"],
        Fecha: mov?.fecha ?? "",
        Movimiento: mov?.descripcion ?? "",
        "Importe banco": formateaCentavos(Number(g.importe_banco_centavos ?? 0)),
        "Folio fiscal": cfdi?.uuid ?? "",
        "Importe CFDI": formateaCentavos(Number(g.importe_cfdi_centavos ?? 0)),
        Diferencia: formateaCentavos(Number(g.diferencia_centavos ?? 0)),
        "Confirmado por": g.confirmado_por ? "Persona identificada" : "",
        Motivo: g.motivo ?? "",
      };
    });
    if (!filas.length) { toast.error("No hay grupos que exportar en este periodo."); return; }
    exportXlsx(buildFilename(`conciliacion-${periodo}`, cliente?.rfc ?? ""), [{ name: "Conciliación", rows: filas }]);
  }

  if (hydrating) return <div className="p-6 text-sm text-muted-foreground">Cargando expediente…</div>;
  if (!cliente) return <div className="p-6 text-sm text-muted-foreground">Selecciona un expediente para conciliar.</div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Banknote className="h-6 w-6 text-primary" /> Conciliación bancaria
          </h1>
          <p className="text-sm text-muted-foreground">
            {cliente.rfc} · periodo {periodo}. Sólo lo <strong>confirmado por una persona</strong> cuenta para el cierre.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={periodo}
            onChange={(e) => e.target.value && setBusqueda({ periodo: e.target.value })}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label="Periodo mensual"
          />
          <select
            value={cuentaFiltro}
            onChange={(e) => setBusqueda({ cuenta: e.target.value })}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label="Cuenta bancaria"
          >
            <option value="__all__">Todas las cuentas</option>
            {((cuentas.data as any)?.cuentas ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.banco} · {c.alias}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={exportar}><Download className="h-4 w-4 mr-1" /> Exportar</Button>
          <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
            Ejecutar motor
          </Button>
          <HerramientaHelp slug="bank-reconciler" />
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi titulo="Movimientos evaluables" valor={String(stats.data?.total_movimientos ?? 0)} />
        <Kpi titulo="Confirmados" valor={String(confirmados.length)} tono="ok" />
        <Kpi titulo="Propuestos por revisar" valor={String(propuestos.length)} tono="alerta" />
        <Kpi titulo="Sin candidato" valor={String(sinCandidato.length)} />
        <Kpi
          titulo="Cobertura operativa"
          valor={`${stats.data?.cobertura ?? 0}%`}
          nota="Movimientos confirmados entre movimientos evaluables. No es una medida de precisión."
        />
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium flex items-center gap-2"><Upload className="h-4 w-4" /> Cargar estado de cuenta</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={cuentaSel} onChange={(e) => setCuentaSel(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="__nueva__">Crear cuenta nueva…</option>
            {((cuentas.data as any)?.cuentas ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.banco} · {c.alias}</option>)}
          </select>
          {cuentaSel === "__nueva__" && (
            <>
              <select value={banco} onChange={(e) => setBanco(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                {BANCOS.map((b: string) => <option key={b} value={b}>{b}</option>)}
              </select>
              <input value={aliasNew} onChange={(e) => setAliasNew(e.target.value)} placeholder="Alias" className="h-9 rounded-md border bg-background px-2 text-sm" />
              <input value={maskNew} onChange={(e) => setMaskNew(e.target.value)} placeholder="****1234" className="h-9 rounded-md border bg-background px-2 text-sm w-28" />
              <Button variant="outline" size="sm" onClick={() => newCuenta.mutate({ banco, alias: aliasNew, mask: maskNew })} disabled={newCuenta.isPending}>
                Crear cuenta
              </Button>
            </>
          )}
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.currentTarget.value = ""; }} />
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={isParsing}>
            {isParsing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />}
            Elegir archivo
          </Button>
          {archivo && (
            <Button size="sm" onClick={() => upload.mutate()} disabled={upload.isPending}>
              {upload.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Revisar {parsed.length} movimientos
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          Para mayor precisión utiliza CSV o Excel descargado directamente de tu banca. Los PDF sólo se aceptan
          cuando ContaClick puede comprobar fechas, sentido y saldos sin ambigüedad.
        </p>
        {archivo && <p className="text-xs text-muted-foreground">Archivo: {archivo.nombre} · huella {archivo.sha256.slice(0, 12)}… Volver a importarlo no duplica movimientos.</p>}
        {parsingErr && (
          <p className="text-sm text-destructive flex items-start gap-2"><ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" /> {parsingErr}</p>
        )}
      </section>

      <Bloque titulo={`Propuestos · ${propuestos.length}`} descripcion="El motor encontró un candidato, pero la evidencia no basta para darlo por bueno. Requiere tu decisión.">
        {propuestos.map((g: any) => (
          <FilaGrupo key={g.id} grupo={g} miembro={miembroPorGrupo.get(g.id)} movPorId={movPorId} cfdiPorId={cfdiPorId}
            acciones={
              <>
                <Button size="sm" onClick={() => decidir.mutate({ grupo_id: g.id, accion: "confirmar" })} disabled={decidir.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setMotivo(""); setMotivoDialog({ tipo: "rechazar", grupoId: g.id }); }}>
                  <X className="h-4 w-4 mr-1" /> Rechazar
                </Button>
              </>
            } />
        ))}
      </Bloque>

      <Bloque titulo={`Confirmados · ${confirmados.length}`} descripcion="Sólo estos alimentan la etapa Bancos del cierre, y únicamente cuando la confirmación es humana.">
        {confirmados.map((g: any) => (
          <FilaGrupo key={g.id} grupo={g} miembro={miembroPorGrupo.get(g.id)} movPorId={movPorId} cfdiPorId={cfdiPorId}
            acciones={
              <Button size="sm" variant="outline" onClick={() => { setMotivo(""); setMotivoDialog({ tipo: "revertir", grupoId: g.id }); }}>
                <Undo2 className="h-4 w-4 mr-1" /> Revertir
              </Button>
            } />
        ))}
      </Bloque>

      <Bloque titulo={`Sin candidato · ${sinCandidato.length}`} descripcion="Movimientos evaluables que ningún comprobante del periodo explica.">
        {sinCandidato.map((m: any) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <div>
              <div className="font-medium">{fmtFechaMx(m.fecha)} · {m.descripcion}</div>
              <div className="text-xs text-muted-foreground">
                {Number(m.abono ?? 0) > 0 ? "Ingreso" : "Egreso"} · {formateaCentavos(Number(m.importe_centavos ?? 0))}
                {m.duplicado_candidato_de ? " · Candidato a duplicado de otra importación" : ""}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { setMotivo(""); setMotivoDialog({ tipo: "ignorar", movimientoId: m.id }); }}>
              <EyeOff className="h-4 w-4 mr-1" /> No es conciliable
            </Button>
          </div>
        ))}
      </Bloque>

      <Bloque titulo={`Rechazados e ignorados · ${descartados.length + ignoradosMov.length}`} descripcion="No cuentan como conciliados y no bloquean nuevas propuestas.">
        {descartados.map((g: any) => (
          <FilaGrupo key={g.id} grupo={g} miembro={miembroPorGrupo.get(g.id)} movPorId={movPorId} cfdiPorId={cfdiPorId} acciones={null} />
        ))}
        {ignoradosMov.map((m: any) => (
          <div key={m.id} className="rounded-md border p-3 text-sm">
            <div className="font-medium">{fmtFechaMx(m.fecha)} · {m.descripcion}</div>
            <div className="text-xs text-muted-foreground">Marcado como no conciliable. Motivo: {m.ignorado_motivo ?? "—"}</div>
          </div>
        ))}
      </Bloque>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => ai.mutate()} disabled={ai.isPending}>
          {ai.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          Resumen redactado con IA
        </Button>
      </div>

      {/* ── Vista previa obligatoria de la importación bancaria ───────────── */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o && !confirmar.isPending && !rechazar.isPending) setPreview(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista previa de la importación bancaria</DialogTitle>
            <DialogDescription>
              Estado: <strong>{ETIQUETA_ESTADO_IMPORTACION[(preview?.importacion?.estado ?? "procesando") as keyof typeof ETIQUETA_ESTADO_IMPORTACION]}</strong>.
              Nada se concilia ni contabiliza hasta que confirmes.
            </DialogDescription>
          </DialogHeader>

          {preview && <PreviewCuerpo preview={preview} />}

          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            Compara estos totales con tu estado de cuenta. La conciliación y las pólizas permanecerán bloqueadas
            hasta confirmar que coinciden.
          </p>

          {modoRechazo && (
            <textarea
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              rows={3}
              placeholder={`Explica por qué no coinciden (mínimo ${MOTIVO_MINIMO} caracteres).`}
              className="w-full rounded-md border bg-background p-2 text-sm"
            />
          )}

          {!preview?.importacion?.bloqueada && !modoRechazo && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={aceptaTotales}
                onChange={(e) => setAceptaTotales(e.target.checked)} />
              Confirmo que revisé los totales mostrados y coinciden con mi estado de cuenta.
            </label>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={copiarDiagnostico}>
              <Info className="h-4 w-4 mr-1" /> Copiar diagnóstico
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPreview(null)}
              disabled={confirmar.isPending || rechazar.isPending}>
              Cancelar
            </Button>
            {modoRechazo ? (
              <Button variant="destructive" size="sm"
                onClick={() => rechazar.mutate()}
                disabled={motivoRechazo.trim().length < MOTIVO_MINIMO || rechazar.isPending}>
                {rechazar.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
                No coinciden — Rechazar importación
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setModoRechazo(true)}>
                <X className="h-4 w-4 mr-1" /> No coinciden — Rechazar importación
              </Button>
            )}
            {!modoRechazo && (
              <Button size="sm"
                onClick={() => confirmar.mutate()}
                disabled={!aceptaTotales || !!preview?.importacion?.bloqueada || confirmar.isPending}>
                {confirmar.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Los totales coinciden — Confirmar importación
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!motivoDialog} onOpenChange={(o) => { if (!o) { setMotivoDialog(null); setMotivo(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {motivoDialog?.tipo === "rechazar" ? "Rechazar la propuesta"
                : motivoDialog?.tipo === "revertir" ? "Revertir la confirmación"
                : "Marcar el movimiento como no conciliable"}
            </DialogTitle>
            <DialogDescription>
              Queda en una bitácora que no puede borrarse, con tu usuario y la fecha. Mínimo {MOTIVO_MINIMO} caracteres.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={4}
            className="w-full rounded-md border bg-background p-2 text-sm"
            placeholder="Explica por qué…"
          />
          <DialogFooter>
            <Button
              disabled={motivo.trim().length < MOTIVO_MINIMO || decidir.isPending || ignorar.isPending}
              onClick={() => {
                if (!motivoDialog) return;
                if (motivoDialog.tipo === "ignorar") ignorar.mutate({ movimiento_id: motivoDialog.movimientoId, motivo: motivo.trim() });
                else decidir.mutate({ grupo_id: motivoDialog.grupoId, accion: motivoDialog.tipo, motivo: motivo.trim() });
              }}
            >
              Registrar decisión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Resumen de conciliación</DialogTitle></DialogHeader>
          <RichMarkdown>{aiContent}</RichMarkdown>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ titulo, valor, tono, nota }: { titulo: string; valor: string; tono?: "ok" | "alerta"; nota?: string }) {
  const color = tono === "ok" ? "text-emerald-600" : tono === "alerta" ? "text-amber-600" : "";
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {titulo}
        {nota && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger>
              <TooltipContent className="max-w-xs">{nota}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className={`text-2xl font-semibold ${color}`}>{valor}</div>
    </div>
  );
}

function Bloque({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: React.ReactNode }) {
  const vacio = !children || (Array.isArray(children) && children.flat().filter(Boolean).length === 0);
  return (
    <section className="space-y-2">
      <div>
        <h2 className="font-medium">{titulo}</h2>
        <p className="text-xs text-muted-foreground">{descripcion}</p>
      </div>
      {vacio ? <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">Sin registros en este periodo.</p> : <div className="space-y-2">{children}</div>}
    </section>
  );
}

function FilaGrupo({
  grupo, miembro, movPorId, cfdiPorId, acciones,
}: {
  grupo: any;
  miembro?: { movimiento_id: string | null; cfdi_id: string | null };
  movPorId: Map<string, any>;
  cfdiPorId: Map<string, any>;
  acciones: React.ReactNode;
}) {
  const mov = miembro?.movimiento_id ? movPorId.get(miembro.movimiento_id) : null;
  const cfdi = miembro?.cfdi_id ? cfdiPorId.get(miembro.cfdi_id) : null;
  const ev = (grupo.evidencia ?? {}) as Record<string, unknown>;
  const estado = grupo.estado as EstadoConciliacion;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium">
            {mov ? `${fmtFechaMx(mov.fecha)} · ${mov.descripcion}` : "Movimiento fuera del listado cargado"}
          </div>
          <div className="text-xs text-muted-foreground">
            Banco {formateaCentavos(Number(grupo.importe_banco_centavos ?? 0))} · Comprobante {formateaCentavos(Number(grupo.importe_cfdi_centavos ?? 0))}
            {" · "}Diferencia {formateaCentavos(Number(grupo.diferencia_centavos ?? 0))}
          </div>
          {cfdi && (
            <div className="text-xs text-muted-foreground">
              Folio fiscal {cfdi.uuid ?? "—"} · {cfdi.nombre_emisor ?? cfdi.nombre_receptor ?? "—"}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${COLOR_ESTADO[estado]}`}>{ETIQUETA_ESTADO[estado]}</span>
          {estado === "propuesto" && grupo.nivel_propuesta === "automatica_alta_confianza" && (
            <span className="text-xs px-2 py-0.5 rounded-full border border-primary/40 text-primary">
              Alta confianza
            </span>
          )}
          <span className="text-xs text-muted-foreground">{ETIQUETA_ORIGEN[grupo.origen as "motor" | "humano"]}</span>
          {acciones}
        </div>
      </div>
      <ul className="grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
        <li>Importe: {ev.importe_coincide ? "coincide al centavo" : `difiere ${formateaCentavos(Number(ev.diferencia_centavos ?? 0))}`}</li>
        <li>Separación: {String(ev.dias_separacion ?? "—")} día(s)</li>
        <li>Dirección: {String(ev.direccion ?? "—")}</li>
        <li>Referencia: {ev.referencia_coincide ? "coincide" : "sin coincidencia"}</li>
        <li>Folio fiscal en el banco: {ev.uuid_coincide ? "sí" : "no"}</li>
        <li>Contraparte: {ev.contraparte_coincide ? "coincide" : "sin coincidencia"}</li>
        <li>Moneda: {ev.moneda_coincide ? "coincide" : "distinta"}</li>
        <li>Candidatos alternativos: {String(ev.candidatos_alternativos ?? 0)}</li>
        <li>Regla: {String(ev.regla ?? "—")} ({String(ev.version ?? "—")})</li>
      </ul>
      {grupo.motivo && <p className="text-xs">{grupo.motivo}</p>}
      {estado === "propuesto" && grupo.nivel_propuesta === "automatica_alta_confianza" && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Propuesta de alta confianza: no está conciliada; el cierre sólo cuenta tu confirmación.
        </p>
      )}

    </div>
  );
}

function pesos(c: number | null | undefined) {
  if (c == null) return "—";
  return formateaCentavos(Number(c));
}

function PreviewCuerpo({ preview }: { preview: any }) {
  const imp = preview.importacion ?? {};
  const r = (imp.resumen ?? {}) as any;
  const incidencias: Incidencia[] = (imp.incidencias ?? []) as Incidencia[];
  const bloqueos = incidencias.filter((i) => i.severidad === "bloqueo");
  const avisos = incidencias.filter((i) => i.severidad === "aviso");

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <Dato k="Banco y cuenta" v={preview.cuenta_etiqueta ?? "—"} />
        <Dato k="Archivo" v={`${imp.archivo_nombre ?? "—"} (${String(imp.formato ?? "").toUpperCase()})`} />
        <Dato k="Periodo declarado" v={imp.periodo_declarado ?? "No identificable"} />
        <Dato k="Movimientos" v={String(r.movimientos ?? 0)} />
        <Dato k="Fecha mínima" v={r.fecha_min ?? "—"} />
        <Dato k="Fecha máxima" v={r.fecha_max ?? "—"} />
        <Dato k="Cargos" v={`${r.cargos_num ?? 0} · ${pesos(r.cargos_centavos)}`} />
        <Dato k="Abonos" v={`${r.abonos_num ?? 0} · ${pesos(r.abonos_centavos)}`} />
        <Dato k="Saldo inicial" v={pesos(r.saldo_inicial_centavos)} />
        <Dato k="Saldo final" v={pesos(r.saldo_final_centavos)} />
        <Dato k="Movimientos ambiguos" v={String(r.ambiguos ?? 0)} />
        <Dato k="Fechas fuera del periodo" v={String(r.fuera_periodo ?? 0)} />
      </dl>

      <div className={`rounded-md border p-3 ${r.ecuacion_evaluable && r.ecuacion_cuadra ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"}`}>
        <div className="font-medium">Saldo inicial + abonos − cargos = saldo final</div>
        <div className="text-xs text-muted-foreground">
          {r.ecuacion_evaluable
            ? `${pesos(r.saldo_inicial_centavos)} + ${pesos(r.abonos_centavos)} − ${pesos(r.cargos_centavos)} = ${pesos(r.saldo_final_centavos)} · diferencia ${pesos(r.diferencia_centavos ?? 0)}`
            : "El archivo no trae saldo en todas las filas: la comprobación aritmética no puede hacerse."}
        </div>
      </div>

      {bloqueos.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <div className="font-medium text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {bloqueos.length} incidencia(s) impiden confirmar
          </div>
          <ul className="mt-1 list-disc pl-5 text-xs space-y-0.5">
            {bloqueos.slice(0, 20).map((i, k) => <li key={k}>[{i.codigo}] {i.mensaje}</li>)}
          </ul>
          {bloqueos.length > 20 && <div className="text-xs text-muted-foreground mt-1">…y {bloqueos.length - 20} más.</div>}
        </div>
      )}

      {avisos.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
          {avisos.map((i, k) => <li key={k}>[{i.codigo}] {i.mensaje}</li>)}
        </ul>
      )}

      <PreviewMuestra filas={preview.muestra ?? []} />
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-1">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium text-right">{v}</dd>
    </div>
  );
}

function PreviewMuestra({ filas }: { filas: any[] }) {
  if (!filas.length) return null;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="p-2 text-left">Fecha</th>
            <th className="p-2 text-left">Descripción</th>
            <th className="p-2 text-right">Cargo</th>
            <th className="p-2 text-right">Abono</th>
            <th className="p-2 text-right">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.fila} className="border-t border-border/40">
              <td className="p-2">{f.fecha}</td>
              <td className="p-2">{f.descripcion}</td>
              <td className="p-2 text-right">{f.cargo ? f.cargo.toFixed(2) : "—"}</td>
              <td className="p-2 text-right">{f.abono ? f.abono.toFixed(2) : "—"}</td>
              <td className="p-2 text-right">{f.saldo == null ? "—" : Number(f.saldo).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-2 text-[11px] text-muted-foreground">Muestra de las primeras {filas.length} filas interpretadas.</div>
    </div>
  );
}
