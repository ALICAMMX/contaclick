// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 4 — funciones servidoras de pólizas del cierre mensual.
//
// La aplicación NO escribe en `polizas` ni en `poliza_renglones`: todo pasa por
// los RPC de negocio `poliza_generar_borrador`, `poliza_aprobar` y
// `poliza_rechazar` (SECURITY DEFINER), que validan partida doble al centavo,
// catálogo de cuentas, motivo humano y reabren la cascada del periodo.
//
// La generación delega en el generador único de `lib/polizas`: una póliza por
// CFDI; regenerar versiona la existente y nunca toca una ya aprobada.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";

const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo con formato AAAA-MM");
const motivoSchema = z.string().min(10, "Se exige un motivo de al menos 10 caracteres.").max(1000);


/** Pólizas del periodo con sus renglones y el diagnóstico de la etapa. */
export const getPolizasPeriodo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    const { data: polizas, error } = await supabase
      .from("polizas")
      // Columnas CANÓNICAS reales: la póliza usa `referencia` (no "folio") y el
      // renglón se ordena por `numero` (no "orden").
      .select("id, referencia, tipo, fecha, concepto, estado, version, origen, nivel_evidencia, evidencia_detalle, input_hash, idempotency_key, rechazo_motivo, aprobada_at, created_at, poliza_renglones(id, numero, cuenta, cuenta_nombre, concepto, cargo_centavos, abono_centavos)")
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo)
      .order("fecha", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);

    const { data: diagnostico, error: errDiag } = await supabase.rpc("cierre_diag_polizas", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
    });
    if (errDiag) throw new Error(errDiag.message);

    return { polizas: polizas ?? [], diagnostico };
  });

/**
 * Genera (o regenera) los borradores del periodo desde los CFDI vigentes.
 * Devuelve el detalle por comprobante: nada se “omite en silencio”.
 */
export const generarBorradoresPeriodo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Un solo generador de pólizas para toda la aplicación: el del módulo de
    // Pólizas (reglas por concepto, evidencia de cobro/pago, sin duplicados).
    const { generarBorradoresDelPeriodo } = await import("@/lib/polizas/polizas.functions");
    const r = await generarBorradoresDelPeriodo(supabase, userId, data);
    return { generadas: r.generadas, revisados: r.revisados, detalle: r.detalle };
  });

/** Aprobación humana con motivo: cuadre al centavo y catálogo validados en SQL. */
export const aprobarPolizaCierre = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), poliza_id: z.string().uuid(), motivo: motivoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: res, error } = await supabase.rpc("poliza_aprobar", {
      _poliza_id: data.poliza_id,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return res;
  });

/** Rechazo humano: exige motivo y queda en la bitácora inmutable del periodo. */
export const rechazarPolizaCierre = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), poliza_id: z.string().uuid(), motivo: motivoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: res, error } = await supabase.rpc("poliza_rechazar", {
      _poliza_id: data.poliza_id,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return res;
  });

/** Tolerancia bancaria del expediente (etapa 3): explícita, con motivo. */
export const setToleranciaBancos = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        tolerancia_centavos: z.number().int().min(0).max(100000),
        motivo: motivoSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: res, error } = await supabase.rpc("cierre_set_tolerancia_bancos", {
      _cliente_id: scope.cliente_id,
      _tolerancia_centavos: data.tolerancia_centavos,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return res;
  });
