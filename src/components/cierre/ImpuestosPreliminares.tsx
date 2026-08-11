// Etapa 5 · Impuestos preliminares. La pantalla no calcula: muestra lo que los
// motores versionados devolvieron y su sello normativo. Sin evidencia completa
// se dice “no evaluable”, nunca cero.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Calculator, Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import {
  calcularImpuestosPreliminar,
  getImpuestosPreliminar,
} from "@/lib/cierre/impuestos.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const moneda = (c: number | null | undefined) =>
  c == null
    ? "—"
    : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(c / 100);

const ETIQUETA_REGIMEN: Record<string, string> = {
  PF_GENERAL_MENSUAL: "Persona física · actividad empresarial y profesional",
  PF_RESICO: "Persona física · RESICO",
  PM_GENERAL: "Persona moral · régimen general",
};

export function ImpuestosPreliminares({ clienteId, periodo }: { clienteId: string; periodo: string }) {
  const qc = useQueryClient();
  const cargar = useServerFn(getImpuestosPreliminar);
  const calcular = useServerFn(calcularImpuestosPreliminar);

  const [coeficiente, setCoeficiente] = useState("");
  const [pagosPrevios, setPagosPrevios] = useState("");
  const [saldoIva, setSaldoIva] = useState("");
  const [resicoPrevio, setResicoPrevio] = useState("");

  const pesosACentavos = (v: string) => (v.trim() === "" ? null : Math.round(Number(v) * 100));
  const parametros = () => ({
    coeficiente_utilidad: coeficiente.trim() === "" ? null : Number(coeficiente),
    pagos_provisionales_anteriores_centavos: pesosACentavos(pagosPrevios),
    saldo_iva_a_favor_anterior_centavos: pesosACentavos(saldoIva),
    resico_acumulado_previo_centavos: pesosACentavos(resicoPrevio),
  });

  const q = useQuery({
    queryKey: ["impuestos-preliminar", clienteId, periodo],
    queryFn: () => cargar({ data: { cliente_id: clienteId, periodo } }),
  });

  const m = useMutation({
    mutationFn: () => calcular({ data: { cliente_id: clienteId, periodo, parametros: parametros() } }),
    onSuccess: (r: any) => {
      if (r.registrado) toast.success("Cálculo preliminar registrado con los motores versionados");
      else toast.warning(r.motivo ?? "El periodo no es evaluable todavía");
      qc.invalidateQueries({ queryKey: ["impuestos-preliminar", clienteId] });
      qc.invalidateQueries({ queryKey: ["flujo-mensual", clienteId] });
      qc.invalidateQueries({ queryKey: ["estado-cierre", clienteId] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "No se pudo calcular"),
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Leyendo entradas fiscales del periodo…
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm">
        {(q.error as Error).message}
      </div>
    );
  }

  const { entradas, preliminar } = q.data!;
  const res = preliminar.resultado;
  const esPm = preliminar.regimen === "PM_GENERAL";
  const esResico = preliminar.regimen === "PF_RESICO";
  // Sin comprobantes reconocidos no se muestran importes: cero significaría
  // afirmar una base gravable que la evidencia no sostiene.
  const sinEvidencia = (entradas.documentos_periodo ?? 0) <= 0;
  const bloqueado = !preliminar.evaluable;

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Calculator className="h-4 w-4" /> 5. Impuestos preliminares
          </h2>
          <p className="text-xs text-muted-foreground">
            {preliminar.regimen
              ? (ETIQUETA_REGIMEN[preliminar.regimen] ?? preliminar.regimen)
              : `Régimen “${entradas.regimen_sat ?? "sin registrar"}” no soportado por los motores.`}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {preliminar.evaluable ? "Evaluable" : "No evaluable"}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-xs">
        <Dato
          titulo="Comprobantes reconocidos"
          valor={`${entradas.documentos_periodo ?? 0} (${entradas.documentos_emitidos ?? 0} emitidos · ${entradas.documentos_recibidos ?? 0} recibidos)`}
        />
        <Dato titulo="Ingresos cobrados" valor={sinEvidencia ? "—" : moneda(entradas.ingresos_cobrados_centavos)} />
        <Dato titulo="Deducciones pagadas" valor={sinEvidencia ? "—" : moneda(entradas.deducciones_pagadas_centavos)} />
        <Dato titulo="IVA trasladado cobrado" valor={sinEvidencia ? "—" : moneda(entradas.iva_trasladado_cobrado_centavos)} />
        <Dato titulo="IVA acreditable pagado" valor={sinEvidencia ? "—" : moneda(entradas.iva_acreditable_pagado_centavos)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {esPm && (
          <Campo
            id="coef"
            etiqueta="Coeficiente de utilidad (art. 14 LISR)"
            valor={coeficiente}
            onChange={setCoeficiente}
            placeholder="0.1500"
          />
        )}
        {esResico && (
          <Campo
            id="resico"
            etiqueta="Ingresos acumulados previos del ejercicio (MXN)"
            valor={resicoPrevio}
            onChange={setResicoPrevio}
            placeholder="0.00"
          />
        )}
        <Campo id="ppa" etiqueta="Pagos provisionales anteriores (MXN)" valor={pagosPrevios} onChange={setPagosPrevios} placeholder="0.00" />
        <Campo id="ivafav" etiqueta="Saldo de IVA a favor anterior (MXN)" valor={saldoIva} onChange={setSaldoIva} placeholder="0.00" />
      </div>

      {preliminar.motivos.length > 0 && (
        <ul className="text-xs text-warning space-y-1">
          {preliminar.motivos.map((mv) => (
            <li key={mv.codigo} className="flex gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {mv.detalle}
            </li>
          ))}
        </ul>
      )}

      {res && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <Dato titulo="ISR a cargo" valor={moneda(res.isr_a_cargo_centavos)} />
          <Dato titulo="IVA a cargo" valor={moneda(res.iva_a_cargo_centavos)} />
          <Dato titulo="IVA a favor" valor={moneda(res.iva_a_favor_centavos)} />
          <Dato titulo="Total a cargo" valor={moneda(res.total_a_cargo_centavos)} />
        </div>
      )}

      {preliminar.fundamentos.length > 0 && (
        <div className="text-[11px] text-muted-foreground space-y-1">
          <div className="flex items-center gap-1 font-medium">
            <ScrollText className="h-3.5 w-3.5" /> Fundamento aplicado
          </div>
          {preliminar.fundamentos.map((f) => (
            <p key={f}>· {f}</p>
          ))}
          {preliminar.normativa_sha256 && (
            <p className="font-mono break-all">Huella normativa: {preliminar.normativa_sha256}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending || bloqueado}>
          {m.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
          Calcular y registrar preliminar
        </Button>
        {bloqueado && (
          <span className="text-[11px] text-warning">
            No evaluable: resuelva primero los pendientes listados arriba. El servidor también rechaza el
            registro mientras la evidencia esté incompleta.
          </span>
        )}
        <p className="text-[11px] text-muted-foreground italic">
          Estimación interna de apoyo. No es una declaración ni sustituye el cálculo oficial ante el SAT.
        </p>
      </div>
    </section>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-muted-foreground">{titulo}</div>
      <div className="font-medium tabular-nums">{valor}</div>
    </div>
  );
}

function Campo({
  id, etiqueta, valor, onChange, placeholder,
}: { id: string; etiqueta: string; valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px]">{etiqueta}</Label>
      <Input id={id} inputMode="decimal" value={valor} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
