// ─────────────────────────────────────────────────────────────────────────────
// CENTRO DE CIERRE MENSUAL — etapa documental.
//
// No declara impuestos ni cierra contabilidad: certifica que los documentos del
// periodo están completos, clasificados y sin excepciones bloqueantes.
// ─────────────────────────────────────────────────────────────────────────────
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, FileWarning,
  Info, ListChecks, Loader2, RefreshCw, ShieldCheck, Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { useActiveCliente } from "@/lib/active-cliente";
import {
  crearTareaExcepcion, decidirExcepcion, declararEtapaDocumental, getCierreMensual,
  reabrirEtapaDocumental, registrarCorte, reprocesarPeriodo,
} from "@/lib/cierre/cierre.functions";
import { ETIQUETA_CLASE, type ClaseDocumental } from "@/lib/cfdi/clasificacion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HerramientaHelp } from "@/components/HerramientaHelp";

export const Route = createFileRoute("/app/cierre")({
  component: CierrePage,
  head: () => ({
    meta: [
      { title: "Cierre mensual documental · ContaClick" },
      { name: "description", content: "Centro de cierre mensual: normaliza CFDI, resuelve excepciones y declara lista la etapa documental del periodo." },
      { property: "og:title", content: "Cierre mensual documental · ContaClick" },
      { property: "og:description", content: "Contadores del periodo, bandeja de excepciones y criterios verificables antes de contabilizar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function periodoActual(): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date());
  return f.slice(0, 7);
}
function desplazar(periodo: string, meses: number): string {
  const [y, m] = periodo.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + meses, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function etiquetaPeriodo(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return `${MESES[(m ?? 1) - 1]} ${y}`;
}
const fmtFecha = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" }) : "—";

function CierrePage() {
  const { cliente } = useActiveCliente();
  const qc = useQueryClient();
  const [periodo, setPeriodo] = useState(() => desplazar(periodoActual(), -1));
  const [decision, setDecision] = useState<{ id: string; titulo: string; accion: "resuelta" | "aceptada" } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [motivoReapertura, setMotivoReapertura] = useState("");
  const [reabrirOpen, setReabrirOpen] = useState(false);
  const [dirs, setDirs] = useState<{ emitidos: boolean; recibidos: boolean }>({ emitidos: true, recibidos: true });

  const cargar = useServerFn(getCierreMensual);
  const corteFn = useServerFn(registrarCorte);
  const decidirFn = useServerFn(decidirExcepcion);
  const tareaFn = useServerFn(crearTareaExcepcion);
  const reprocesarFn = useServerFn(reprocesarPeriodo);
  const declararFn = useServerFn(declararEtapaDocumental);
  const reabrirFn = useServerFn(reabrirEtapaDocumental);

  const key = ["cierre", cliente?.id, periodo];
  const q = useQuery({
    enabled: !!cliente?.id,
    queryKey: key,
    queryFn: () => cargar({ data: { cliente_id: cliente!.id, periodo } }),
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: ["cierre", cliente?.id] });
  const conError = (e: unknown) => toast.error((e as Error)?.message ?? "No se pudo completar la operación");

  const mCorte = useMutation({
    mutationFn: () => {
      const direcciones = [dirs.emitidos && "emitidos", dirs.recibidos && "recibidos"].filter(Boolean) as Array<"emitidos" | "recibidos">;
      if (!direcciones.length) throw new Error("Indica al menos una dirección descargada.");
      return corteFn({ data: { cliente_id: cliente!.id, periodo, direcciones } });
    },
    onSuccess: () => { toast.success("Corte documentado"); refrescar(); },
    onError: conError,
  });

  const mDecidir = useMutation({
    mutationFn: () => decidirFn({ data: { cliente_id: cliente!.id, excepcion_id: decision!.id, accion: decision!.accion, motivo: motivo.trim() || undefined } }),
    onSuccess: () => { toast.success("Excepción actualizada"); setDecision(null); setMotivo(""); refrescar(); },
    onError: conError,
  });

  const mReabrirExc = useMutation({
    mutationFn: (id: string) => decidirFn({ data: { cliente_id: cliente!.id, excepcion_id: id, accion: "reabrir" } }),
    onSuccess: () => { toast.success("Excepción reabierta"); refrescar(); },
    onError: conError,
  });

  const mTarea = useMutation({
    mutationFn: (id: string) => tareaFn({ data: { cliente_id: cliente!.id, excepcion_id: id } }),
    onSuccess: () => { toast.success("Tarea creada en el tablero"); refrescar(); },
    onError: conError,
  });

  const mReprocesar = useMutation({
    mutationFn: () => reprocesarFn({ data: { cliente_id: cliente!.id, periodo } }),
    onSuccess: (r: any) => {
      toast.success(`Reprocesados ${r.reprocesados} comprobantes${r.sin_xml_original ? ` · ${r.sin_xml_original} sin XML original` : ""}`);
      refrescar();
    },
    onError: conError,
  });

  const mDeclarar = useMutation({
    mutationFn: () => declararFn({ data: { cliente_id: cliente!.id, periodo } }),
    onSuccess: () => { toast.success("Etapa documental declarada lista"); refrescar(); },
    onError: conError,
  });

  const mReabrir = useMutation({
    mutationFn: () => reabrirFn({ data: { cliente_id: cliente!.id, periodo, motivo: motivoReapertura.trim() } }),
    onSuccess: () => { toast.success("Etapa documental reabierta"); setReabrirOpen(false); setMotivoReapertura(""); refrescar(); },
    onError: conError,
  });

  const d = q.data;
  const excepciones = d?.excepciones ?? [];
  const pendientes = useMemo(() => excepciones.filter((e: any) => e.estado === "pendiente"), [excepciones]);
  const atendidas = useMemo(() => excepciones.filter((e: any) => e.estado !== "pendiente"), [excepciones]);

  if (!cliente) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/5 p-8 flex items-start gap-4">
        <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div>
          <div className="font-medium">Selecciona un expediente</div>
          <p className="text-sm text-muted-foreground mt-1">
            El cierre mensual opera sobre un solo RFC. Elige el expediente en la barra superior.
          </p>
        </div>
      </div>
    );
  }

  const lista = d?.corte?.etapa_documental === "lista";

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
            <ListChecks className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cierre mensual · etapa documental</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {cliente.razon_social} · {cliente.rfc} · Hora del centro de México
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <HerramientaHelp slug="cierre-mensual" />
          <Button variant="glass" size="sm" onClick={() => setPeriodo((p) => desplazar(p, -1))} aria-label="Mes anterior">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="text-base font-semibold px-2 min-w-[9rem] text-center">{etiquetaPeriodo(periodo)}</div>
          <Button variant="glass" size="sm" onClick={() => setPeriodo((p) => desplazar(p, 1))} aria-label="Mes siguiente">
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="glass" size="sm" onClick={() => mReprocesar.mutate()} disabled={mReprocesar.isPending}>
            {mReprocesar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Reprocesar XML</span>
          </Button>
        </div>
      </header>

      {q.isLoading ? (
        <div className="flex items-center gap-3 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Evaluando el periodo…</div>
      ) : q.error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">{(q.error as Error).message}</div>
      ) : !d ? null : (
        <>
          {/* Estado de la etapa */}
          <section className={`rounded-xl border p-5 flex items-start justify-between gap-4 flex-wrap ${lista ? "border-success/40 bg-success/5" : "border-border bg-card"}`}>
            <div className="flex items-start gap-3">
              {lista ? <ShieldCheck className="h-5 w-5 text-success mt-0.5" /> : <ClipboardList className="h-5 w-5 text-muted-foreground mt-0.5" />}
              <div>
                <div className="font-medium">
                  {lista ? "Etapa documental lista" : "Etapa documental en proceso"}
                </div>
                <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                  Declarar la etapa documental no presenta declaraciones ni cierra la contabilidad: certifica que los
                  comprobantes del periodo están completos, clasificados y sin excepciones bloqueantes pendientes.
                  {lista ? ` Declarada el ${fmtFecha(d.corte.declarada_at)}.` : ""}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {lista ? (
                <Button variant="glass" size="sm" onClick={() => setReabrirOpen(true)}>
                  <Unlock className="h-4 w-4 mr-2" /> Reabrir
                </Button>
              ) : (
                <Button variant="hero" size="sm" disabled={!d.puedeDeclararse || mDeclarar.isPending} onClick={() => mDeclarar.mutate()}>
                  {mDeclarar.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Declarar documentos listos
                </Button>
              )}
            </div>
          </section>

          {/* Contadores */}
          <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <Kpi label="Comprobantes" value={d.contadores.total} />
            <Kpi label="Emitidos" value={d.contadores.emitidos} />
            <Kpi label="Recibidos" value={d.contadores.recibidos} />
            <Kpi label="PUE / PPD" value={`${d.contadores.pue} / ${d.contadores.ppd}`} />
            <Kpi label="PPD sin complemento" value={d.contadores.ppdSinComplemento} tone={d.contadores.ppdSinComplemento ? "warning" : undefined} />
            <Kpi label="Cobertura documental" value={`${d.contadores.coberturaDocumental}%`} />
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-3">Clasificación del periodo</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(Object.entries(d.contadores.porClase) as Array<[ClaseDocumental, number]>)
                .filter(([, n]) => n > 0)
                .map(([clase, n]) => (
                  <div key={clase} className="rounded-lg border border-border/60 px-3 py-2">
                    <div className="text-xs text-muted-foreground">{ETIQUETA_CLASE[clase]}</div>
                    <div className="text-lg font-semibold tabular-nums">{n}</div>
                  </div>
                ))}
              {d.contadores.total === 0 && (
                <p className="text-sm text-muted-foreground col-span-full">
                  Sin comprobantes en este periodo. Descarga del SAT o carga XML para comenzar.
                </p>
              )}
            </div>
          </section>

          {/* Corte documentado */}
          <section className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold">Corte documentado</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Registra qué direcciones se descargaron y cuándo. Sin este dato la etapa no puede declararse.
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                Último corte: {fmtFecha(d.corte.corte_at)}
                {d.corte.direcciones.length ? ` · ${d.corte.direcciones.join(" y ")}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={dirs.emitidos} onCheckedChange={(v) => setDirs((s) => ({ ...s, emitidos: !!v }))} /> Emitidos
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={dirs.recibidos} onCheckedChange={(v) => setDirs((s) => ({ ...s, recibidos: !!v }))} /> Recibidos
              </label>
              <Button size="sm" variant="glass" onClick={() => mCorte.mutate()} disabled={mCorte.isPending}>
                {mCorte.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Registrar corte ahora
              </Button>
            </div>
          </section>

          {/* Criterios */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-3">Criterios de “documentos listos”</h2>
            <ul className="space-y-2">
              {d.criterios.map((c: any) => (
                <li key={c.id} className="flex items-start gap-3 text-sm">
                  {c.cumplido
                    ? <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                    : <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />}
                  <div>
                    <div className={c.cumplido ? "" : "font-medium"}>{c.etiqueta}</div>
                    <div className="text-xs text-muted-foreground">{c.detalle}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Bandeja de excepciones */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Bandeja de excepciones · {pendientes.length} pendiente(s)</h2>
              {atendidas.length > 0 && <span className="text-xs text-muted-foreground">{atendidas.length} atendida(s)</span>}
            </div>
            {excepciones.length === 0 ? (
              <div className="rounded-xl border border-success/40 bg-success/5 p-5 text-sm flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-success" /> Sin excepciones en el periodo.
              </div>
            ) : (
              <div className="space-y-3">
                {[...pendientes, ...atendidas].map((e: any) => (
                  <ExcepcionCard
                    key={e.id}
                    e={e}
                    onDecidir={(accion) => { setDecision({ id: e.id, titulo: e.titulo, accion }); setMotivo(""); }}
                    onReabrir={() => mReabrirExc.mutate(e.id)}
                    onTarea={() => mTarea.mutate(e.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Diálogo de decisión */}
      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision?.accion === "aceptada" ? "Aceptar con motivo" : "Marcar como resuelta"}</DialogTitle>
            <DialogDescription>{decision?.titulo}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivo}
            onChange={(ev) => setMotivo(ev.target.value)}
            placeholder={decision?.accion === "aceptada"
              ? "Explica por qué el periodo puede continuar con esta excepción (mínimo 10 caracteres). Queda en bitácora."
              : "Describe qué se corrigió (opcional)."}
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDecision(null)}>Cancelar</Button>
            <Button
              variant="hero"
              disabled={mDecidir.isPending || (decision?.accion === "aceptada" && motivo.trim().length < 10)}
              onClick={() => mDecidir.mutate()}
            >
              {mDecidir.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de reapertura */}
      <Dialog open={reabrirOpen} onOpenChange={setReabrirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir la etapa documental</DialogTitle>
            <DialogDescription>Queda registrado el motivo. Úsalo cuando lleguen comprobantes nuevos del periodo.</DialogDescription>
          </DialogHeader>
          <Textarea value={motivoReapertura} onChange={(ev) => setMotivoReapertura(ev.target.value)} rows={3} placeholder="Motivo (mínimo 10 caracteres)" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReabrirOpen(false)}>Cancelar</Button>
            <Button variant="hero" disabled={motivoReapertura.trim().length < 10 || mReabrir.isPending} onClick={() => mReabrir.mutate()}>
              Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: "warning" }) {
  return (
    <div className={`rounded-xl border p-4 ${tone === "warning" ? "border-warning/40 bg-warning/5" : "border-border bg-card"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function ExcepcionCard({
  e, onDecidir, onReabrir, onTarea,
}: {
  e: any;
  onDecidir: (a: "resuelta" | "aceptada") => void;
  onReabrir: () => void;
  onTarea: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const pendiente = e.estado === "pendiente";
  const sev = e.severidad as "bloqueante" | "advertencia" | "informativa";
  const Icono = sev === "bloqueante" ? FileWarning : sev === "advertencia" ? AlertTriangle : Info;
  const color = sev === "bloqueante" ? "text-destructive" : sev === "advertencia" ? "text-warning" : "text-muted-foreground";
  const doc = e.cfdi_xml;

  return (
    <div className={`rounded-xl border p-4 ${pendiente && sev === "bloqueante" ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <Icono className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{e.titulo}</span>
              <Badge variant="outline" className="text-[10px] uppercase">{sev}</Badge>
              {!pendiente && <Badge variant="secondary" className="text-[10px]">{e.estado}</Badge>}
            </div>
            {doc && (
              <div className="text-xs text-muted-foreground mt-1 break-all">
                {doc.uuid} · {doc.tipo_cfdi} · {doc.rfc_emisor} → {doc.rfc_receptor}
              </div>
            )}
            {e.guia && (
              <p className="text-xs text-muted-foreground mt-2 max-w-3xl">
                <span className="font-medium text-foreground">Qué pasó: </span>{e.guia.quePasa}{" "}
                <span className="font-medium text-foreground">Qué hacer: </span>{e.guia.queHacer}
              </p>
            )}
            {e.motivo && <p className="text-xs mt-2"><span className="text-muted-foreground">Motivo registrado: </span>{e.motivo}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pendiente ? (
            <>
              <Button size="sm" variant="glass" onClick={() => onDecidir("resuelta")}>Resuelta</Button>
              <Button size="sm" variant="outline" onClick={() => onDecidir("aceptada")}>Aceptar con motivo</Button>
              {!e.tarea_id && <Button size="sm" variant="ghost" onClick={onTarea}>Crear tarea</Button>}
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={onReabrir}>Reabrir</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setAbierto((v) => !v)}>{abierto ? "Ocultar" : "Detalle"}</Button>
        </div>
      </div>
      {abierto && (
        <pre className="mt-3 rounded-lg bg-muted/40 p-3 text-[11px] overflow-x-auto">
          {JSON.stringify(e.detalle ?? {}, null, 2)}
        </pre>
      )}
    </div>
  );
}
