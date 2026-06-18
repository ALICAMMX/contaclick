import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { UserRound, ShieldAlert, FileText, ArrowRight, Search, Sparkles, Loader2, Inbox, Bell } from "lucide-react";
import { useActiveCliente } from "@/lib/active-cliente";
import { Button } from "@/components/ui/button";
import { listExpedientes, type Expediente } from "@/lib/expedientes/expedientes.functions";
import { seedDemo } from "@/lib/demo/demo.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/app/expedientes")({ component: ExpedientesPage });

function riesgoColor(score: number) {
  if (score >= 67) return { dot: "bg-red-500", text: "text-red-600 dark:text-red-300", label: "Alto" };
  if (score >= 34) return { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-300", label: "Medio" };
  return { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-300", label: "Bajo" };
}

function fmtMoney(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

function ExpedientesPage() {
  const { setCliente } = useActiveCliente();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listExpedientes);
  const seed = useServerFn(seedDemo);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"todos" | "rojo" | "amarillo" | "verde">("todos");

  const query = useQuery({ queryKey: ["expedientes"], queryFn: () => list() });

  const seedMut = useMutation({
    mutationFn: () => seed(),
    onSuccess: (r) => {
      toast.success(r?.alreadySeeded ? "Datos demo ya estaban cargados" : "Datos demo cargados");
      qc.invalidateQueries({ queryKey: ["expedientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = query.data?.items ?? [];
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((e) => {
      if (filter !== "todos" && (e.semaforo ?? "amarillo") !== filter) return false;
      if (!t) return true;
      return (
        e.rfc.toLowerCase().includes(t) ||
        e.razon_social.toLowerCase().includes(t) ||
        (e.regimen_fiscal ?? "").toLowerCase().includes(t)
      );
    });
  }, [items, q, filter]);

  const elegir = (e: Expediente) => {
    setCliente({ id: e.id, rfc: e.rfc, razon_social: e.razon_social, regimen_fiscal: e.regimen_fiscal });
    toast.success(`Expediente activo: ${e.razon_social}`);
    navigate({ to: "/app" });
  };

  const totalRiesgo = items.filter((i) => i.riesgo >= 67).length;
  const totalAlertas = items.reduce((a, b) => a + b.alertas_altas, 0);
  const totalIngresos = items.reduce((a, b) => a + b.ingresos_mes, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary mb-2">
            <span className="h-1 w-6 bg-primary" /> Cartera de clientes
          </div>
          <h1 className="serif text-3xl text-foreground">Expedientes</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Datos en vivo de tu despacho. Selecciona un expediente para que todas las herramientas trabajen sobre él.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => seedMut.mutate()}
          disabled={seedMut.isPending}
        >
          {seedMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Cargar datos demo
        </Button>
      </header>

      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Expedientes" value={items.length.toString()} />
          <KPI label="En riesgo alto" value={totalRiesgo.toString()} tone={totalRiesgo > 0 ? "danger" : "muted"} />
          <KPI label="Alertas críticas" value={totalAlertas.toString()} tone={totalAlertas > 0 ? "warn" : "muted"} />
          <KPI label="Ingresos del mes" value={fmtMoney(totalIngresos)} />
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por RFC, razón social o régimen…"
              className="w-full h-10 pl-9 pr-3 rounded-md bg-background border border-border text-sm"
            />
          </div>
          {(["todos", "rojo", "amarillo", "verde"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`h-10 px-3 text-xs rounded-md border transition-colors ${
                filter === f ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "todos" ? "Todos" : f === "rojo" ? "Riesgo alto" : f === "amarillo" ? "Atención" : "Al corriente"}
            </button>
          ))}
        </div>
      )}

      {query.isLoading ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Cargando expedientes…
        </div>
      ) : items.length === 0 ? (
        <EmptyState onSeed={() => seedMut.mutate()} loading={seedMut.isPending} />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Sin resultados para los filtros actuales.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-4">
          {filtered.map((e) => {
            const r = riesgoColor(e.riesgo);
            return (
              <button
                key={e.id}
                onClick={() => elegir(e)}
                className="group text-left rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5 transition-all p-5"
              >
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                    <UserRound className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{e.razon_social}</div>
                    <div className="text-xs font-mono text-muted-foreground mt-0.5">{e.rfc}</div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">{e.regimen_fiscal ?? "—"}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
                <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-3">
                  <Stat icon={<ShieldAlert className="h-3 w-3" />} label="Riesgo SAT">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${r.dot}`} />
                      <span className={`text-sm font-medium ${r.text}`}>{e.riesgo}/100 · {r.label}</span>
                    </span>
                  </Stat>
                  <Stat icon={<Bell className="h-3 w-3" />} label="Alertas">
                    <span className="text-sm">
                      {e.alertas_altas > 0 ? (
                        <span className="text-red-600 dark:text-red-300 font-medium">{e.alertas_altas} crítica{e.alertas_altas > 1 ? "s" : ""}</span>
                      ) : e.alertas_total > 0 ? (
                        <span className="text-amber-600 dark:text-amber-300">{e.alertas_total} pendiente{e.alertas_total > 1 ? "s" : ""}</span>
                      ) : (
                        <span className="text-muted-foreground">Sin alertas</span>
                      )}
                    </span>
                  </Stat>
                  <Stat icon={<FileText className="h-3 w-3" />} label="CFDI">
                    <span className="text-sm">{e.cfdi_count} · {e.ultimo_cfdi ? new Date(e.ultimo_cfdi).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—"}</span>
                  </Stat>
                  <Stat icon={<Sparkles className="h-3 w-3" />} label="Ingresos mes">
                    <span className="text-sm tabular-nums">{fmtMoney(e.ingresos_mes)}</span>
                  </Stat>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "danger" | "warn" }) {
  const color = tone === "danger" ? "text-red-600 dark:text-red-300" : tone === "warn" ? "text-amber-600 dark:text-amber-300" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">{icon} {label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function EmptyState({ onSeed, loading }: { onSeed: () => void; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center mx-auto mb-3">
        <Inbox className="h-6 w-6" />
      </div>
      <h3 className="serif text-xl">Aún no hay expedientes</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
        Para una demo rápida, carga datos de ejemplo: clientes con CFDIs, movimientos bancarios, alertas y obligaciones de varios meses.
      </p>
      <Button variant="hero" className="mt-5" onClick={onSeed} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Cargar datos demo
      </Button>
    </div>
  );
}
