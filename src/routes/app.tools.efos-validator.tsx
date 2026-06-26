import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldAlert, ShieldCheck, Search, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToolShell } from "@/components/ToolShell";
import { DemoCaseButtons } from "@/components/DemoCaseButtons";
import { useActiveCliente } from "@/lib/active-cliente";
import { lookupEfosRfc, scanClienteEfos, efosCatalog } from "@/lib/efos/efos.functions";
import type { EfosSituacion } from "@/lib/efos/lista-demo";

export const Route = createFileRoute("/app/tools/efos-validator")({ component: EfosValidator });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SIT_LABEL: Record<EfosSituacion, string> = {
  definitivo: "Definitivo",
  presunto: "Presunto",
  desvirtuado: "Desvirtuado",
  sentencia_favorable: "Sentencia favorable",
  cancelado: "Cancelado",
};
const SIT_COLOR: Record<EfosSituacion, string> = {
  definitivo: "bg-destructive/15 text-destructive border-destructive/30",
  presunto: "bg-warning/15 text-warning border-warning/30",
  desvirtuado: "bg-success/15 text-success border-success/30",
  sentencia_favorable: "bg-success/15 text-success border-success/30",
  cancelado: "bg-muted text-muted-foreground border-border",
};

function EfosValidator() {
  const { cliente } = useActiveCliente();
  const isDemo = !!cliente?.id && !UUID_RE.test(cliente.id);

  const catalog = useServerFn(efosCatalog);
  const lookup = useServerFn(lookupEfosRfc);
  const scan = useServerFn(scanClienteEfos);

  const catalogQ = useQuery({ queryKey: ["efos", "catalog"], queryFn: () => catalog() });
  const scanQ = useQuery({
    queryKey: ["efos", "scan", cliente?.id],
    queryFn: () => scan({ data: { cliente_id: cliente!.id } }),
    enabled: !!cliente?.id && !isDemo,
  });

  const [rfcInput, setRfcInput] = useState("");
  const [lookupResult, setLookupResult] = useState<Awaited<ReturnType<typeof lookupEfosRfc>>["results"] | null>(
    null,
  );
  const [lookingUp, setLookingUp] = useState(false);

  const onLookup = async () => {
    const rfcs = rfcInput
      .split(/[\s,;]+/)
      .map((r) => r.trim().toUpperCase())
      .filter((r) => r.length >= 8 && r.length <= 13);
    if (!rfcs.length) return;
    setLookingUp(true);
    try {
      const r = await lookup({ data: { rfcs } });
      setLookupResult(r.results);
    } finally {
      setLookingUp(false);
    }
  };

  return (
    <ToolShell helpSlug="efos-validator"
      title="Validador 69-B / EFOS"
      description="Detecta proveedores en lista negra del SAT antes de declarar. La corresponsabilidad por trabajar con un EFOS recae en el contribuyente y su contador."
      icon={<ShieldAlert className="h-5 w-5 text-primary-foreground" />}
    >
      {/* Aviso de fuente demo */}
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning-foreground/90">
        <strong>Datos demo.</strong> Esta versión usa una lista de muestra ({catalogQ.data?.meta.total_registros ?? "—"} RFCs).
        La sincronización oficial con el archivo 69-B del SAT se activa en plan Pro.
      </div>

      {/* Catálogo resumen */}
      {catalogQ.data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          {(Object.keys(catalogQ.data.counts) as EfosSituacion[]).map((s) => (
            <div key={s} className={`rounded-md border px-3 py-2 ${SIT_COLOR[s]}`}>
              <div className="text-[10px] uppercase tracking-wide opacity-80">{SIT_LABEL[s]}</div>
              <div className="text-base font-semibold">{catalogQ.data.counts[s]}</div>
            </div>
          ))}
        </div>
      )}

      {/* Escaneo del expediente */}
      <section className="space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" /> Escaneo del expediente activo
        </h3>
        {!cliente && (
          <div className="rounded-lg border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground text-center">
            Selecciona un expediente para escanear sus proveedores.{" "}
            <Link to="/app/clientes" className="text-primary hover:underline">
              Ver expedientes →
            </Link>
          </div>
        )}
        {cliente && isDemo && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-200">
            <span className="font-mono">{cliente.rfc}</span> es un expediente demo sin CFDI cargados. Crea o
            selecciona un expediente real para correr el escaneo.
          </div>
        )}
        {cliente && !isDemo && scanQ.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Cruzando proveedores con lista 69-B…
          </div>
        )}
        {scanQ.data && (
          <ScanReport data={scanQ.data} />
        )}
      </section>

      {/* Lookup manual */}
      <section className="space-y-3 pt-2 border-t border-border/40">
        <h3 className="font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" /> Consulta manual por RFC
        </h3>
        <p className="text-xs text-muted-foreground">
          Pega uno o varios RFCs (separados por coma o salto de línea). Útil cuando un cliente te manda un CFDI suelto.
        </p>
        <DemoCaseButtons
          toolKey="efos-validator"
          onLoad={(payload) => {
            setRfcInput((payload.rfcs as string[]).join(", "));
            setTimeout(() => onLookup(), 50);
          }}
        />
        <div className="flex flex-col md:flex-row gap-2">
          <Input
            value={rfcInput}
            onChange={(e) => setRfcInput(e.target.value.toUpperCase())}
            placeholder="ABC120101AB1, XAXX010101000…"
            className="font-mono"
          />
          <Button onClick={onLookup} disabled={lookingUp || !rfcInput.trim()}>
            {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Validar
          </Button>
        </div>
        {lookupResult && (
          <div className="rounded-xl border border-border/60 bg-card/40 divide-y divide-border/40">
            {lookupResult.map((r) => (
              <div key={r.rfc} className="px-4 py-3 flex items-center gap-3 text-sm">
                <div className="font-mono w-32 shrink-0">{r.rfc}</div>
                {r.encontrado && r.registro ? (
                  <>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${SIT_COLOR[r.registro.situacion]}`}>
                      {SIT_LABEL[r.registro.situacion]}
                    </span>
                    <div className="flex-1 truncate text-muted-foreground">{r.registro.nombre}</div>
                    <div className="text-xs text-muted-foreground">DOF {r.registro.publicacion_dof}</div>
                  </>
                ) : (
                  <>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success border border-success/30">
                      Limpio
                    </span>
                    <div className="flex-1 text-muted-foreground">Sin coincidencias en lista 69-B.</div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <a
          href="http://omawww.sat.gob.mx/cifras_sat/Paginas/datos/vinculo.html?page=ListCompleta69B.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> Lista oficial 69-B del SAT
        </a>
      </section>
    </ToolShell>
  );
}

function ScanReport({ data }: { data: Awaited<ReturnType<typeof scanClienteEfos>> }) {
  const hayMatches = data.matches.length > 0;
  const definitivos = data.matches.filter((m) => m.efos.situacion === "definitivo").length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi label="Proveedores únicos" value={data.proveedores_totales.toLocaleString("es-MX")} />
        <Kpi label="CFDI analizados" value={data.cfdi_totales.toLocaleString("es-MX")} />
        <Kpi
          label="En lista 69-B"
          value={data.matches.length.toString()}
          tone={data.matches.length ? "bad" : "ok"}
        />
        <Kpi
          label="Monto en riesgo"
          value={`$${data.monto_en_riesgo.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`}
          tone={data.monto_en_riesgo > 0 ? "bad" : "ok"}
        />
      </div>

      {!hayMatches && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-4 flex items-center gap-2 text-sm text-success">
          <ShieldCheck className="h-4 w-4" /> Ningún proveedor del expediente está en la lista 69-B.
        </div>
      )}

      {hayMatches && (
        <>
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              Se encontraron <strong>{data.matches.length} proveedor(es)</strong> en lista 69-B
              {definitivos > 0 && (
                <> · <strong>{definitivos} en situación definitiva</strong> (deducciones improcedentes)</>
              )}
              . Revisa antes de presentar la declaración: la corresponsabilidad recae en el contribuyente.
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/40 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/30">
                <tr>
                  <th className="text-left font-medium px-4 py-2">RFC / Razón social</th>
                  <th className="text-left font-medium px-4 py-2">Situación</th>
                  <th className="text-right font-medium px-4 py-2">CFDI</th>
                  <th className="text-right font-medium px-4 py-2">Monto</th>
                  <th className="text-left font-medium px-4 py-2">Periodo facturado</th>
                  <th className="text-left font-medium px-4 py-2">DOF</th>
                </tr>
              </thead>
              <tbody>
                {data.matches.map((m) => (
                  <tr key={m.rfc} className="border-t border-border/30">
                    <td className="px-4 py-2">
                      <div className="font-mono text-xs">{m.rfc}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                        {m.nombre_emisor ?? m.efos.nombre}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${SIT_COLOR[m.efos.situacion]}`}>
                        {SIT_LABEL[m.efos.situacion]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.n_cfdi}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">
                      ${m.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {m.primer_fecha} → {m.ultima_fecha}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{m.efos.publicacion_dof}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "bad" | "ok" }) {
  const cls =
    tone === "bad"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "ok"
        ? "border-success/30 bg-success/5"
        : "border-border/60 bg-card/50";
  return (
    <div className={`rounded-xl border ${cls} p-3`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
