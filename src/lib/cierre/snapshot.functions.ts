// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 6 — funciones servidoras del sellado de cierre.
// El sello es inmutable y sólo se emite cuando NO hay bloqueos reales.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import { ORDEN_ETAPAS, type EstadoEtapa, type EtapaId } from "./flujo";
import type { EtapaSnapshot, ResumenCierre } from "./snapshot";

const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo con formato AAAA-MM");

async function reunirEvidencia(supabase: any, clienteId: string, periodo: string) {
  const [{ data: etapasFilas }, { data: cfdis }, { count: excepciones }, { data: polizas }] =
    await Promise.all([
      supabase
        .from("cierre_etapas")
        .select("etapa, estado, cobertura, version, motivo")
        .eq("cliente_id", clienteId)
        .eq("periodo", periodo),
      supabase
        .from("cfdi_xml")
        .select("direccion, clase_documental, total, iva_trasladado")
        .eq("cliente_id", clienteId)
        .eq("periodo", periodo)
        .limit(20000),
      supabase
        .from("cierre_excepciones")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", clienteId)
        .eq("periodo", periodo)
        .eq("estado", "pendiente"),
      supabase
        .from("polizas")
        .select("id, estado, cuenta")
        .eq("cliente_id", clienteId)
        .gte("fecha", `${periodo}-01`)
        .lte("fecha", `${periodo}-31`)
        .limit(20000),
    ]);

  const etapas: EtapaSnapshot[] = ORDEN_ETAPAS.map((id) => {
    const f = (etapasFilas ?? []).find((x: any) => x.etapa === id);
    return {
      id: id as EtapaId,
      estado: (f?.estado as EstadoEtapa) ?? "no_iniciada",
      cobertura: f?.cobertura != null ? Number(f.cobertura) : null,
      version: f?.version ?? 1,
      motivo: f?.motivo ?? null,
    };
  });

  const filas = (cfdis ?? []) as any[];
  const emitidos = filas.filter((c) => c.direccion === "emitido");
  const recibidos = filas.filter((c) => c.direccion === "recibido");
  const suma = (xs: any[], campo: string) =>
    Math.round(xs.reduce((a, x) => a + (Number(x[campo]) || 0), 0) * 100) / 100;

  const bloqueadas = (polizas ?? []).filter(
    (p: any) => p.estado === "bloqueada" || !p.cuenta || /por identificar/i.test(String(p.cuenta)),
  ).length;

  const resumen: ResumenCierre = {
    cfdi_total: filas.length,
    cfdi_emitidos: emitidos.length,
    cfdi_recibidos: recibidos.length,
    ingresos: suma(emitidos, "total"),
    egresos: suma(recibidos, "total"),
    iva_trasladado: suma(emitidos, "iva_trasladado"),
    iva_acreditable: suma(recibidos, "iva_trasladado"),
    excepciones_pendientes: excepciones ?? 0,
    polizas_bloqueadas: bloqueadas,
  };

  return { etapas, resumen };
}

/**
 * Estado de terminación. Los bloqueos NO se calculan aquí: se piden a la base
 * (`cierre_bloqueos`), que es la misma comprobación que corre dentro del sellado.
 * El resumen local es sólo presentación.
 */
export const getEstadoCierre = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { etapas, resumen } = await reunirEvidencia(supabase, scope.cliente_id, data.periodo);

    const { data: bloqueosRpc, error: errBloqueos } = await supabase.rpc("cierre_bloqueos", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
    });
    if (errBloqueos) throw new Error(errBloqueos.message);
    const bloqueos = (bloqueosRpc ?? []) as { codigo: string; detalle: string }[];

    const { data: sellos } = await supabase
      .from("cierre_snapshots")
      .select("id, version, motivo, huella, resumen, etapas, created_at, sellado_por")
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo)
      .order("version", { ascending: false });

    return {
      periodo: data.periodo,
      evaluador: "manifiesto@1",
      etapas,
      resumen,
      bloqueos,
      puedeSellar: bloqueos.length === 0,
      // La huella la calcula la base al sellar, sobre el manifiesto real.
      huella: (sellos ?? [])[0]?.huella ?? null,
      selloVigente: (sellos ?? [])[0] ?? null,
      sellos: sellos ?? [],
    };
  });

/**
 * Sella el periodo. El navegador sólo aporta expediente, periodo y motivo: la
 * base reconstruye el manifiesto desde las fuentes, recomprueba los bloqueos
 * dentro del candado y calcula la huella. Repetirlo es idempotente.
 */
export const sellarCierre = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        periodo: periodoSchema,
        motivo: z.string().min(10).max(1000),
        idempotency_key: z.string().min(8).max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    const { data: sello, error } = await supabase.rpc("cierre_sellar_manifiesto", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
      _motivo: data.motivo,
      _idempotency_key: data.idempotency_key ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true, sello };
  });

/** Manifiesto verificable del periodo, tal como lo reconstruye la base. */
export const getManifiestoCierre = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: manifiesto, error } = await supabase.rpc("cierre_manifiesto", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
    });
    if (error) throw new Error(error.message);
    return manifiesto;
  });
