// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 5 — funciones servidoras de impuestos preliminares.
//
// PUENTE REAL: la base entrega las entradas normalizadas del periodo
// (`cierre_entradas_fiscales`, todo en centavos) y ESTE servidor ejecuta los
// motores versionados de `src/lib/fiscal/normativa/motor.ts` (ISR PF, ISR PM,
// RESICO, IVA). El resultado —con su sello normativo— se registra con
// `cierre_registrar_resultado_fiscal`, que vuelve a calcular la huella de la
// evidencia del lado del servidor: el llamador NO puede imponer un resultado
// sobre evidencia distinta ni saltarse los motores.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import { calcularPreliminar, type EntradasFiscales, type ParametrosFiscales } from "./impuestos";
import { calcularYRegistrar, leerEntradasFiscales } from "./impuestos.puente";

const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo con formato AAAA-MM");

const parametrosSchema = z
  .object({
    coeficiente_utilidad: z.number().min(0).max(5).nullable().optional(),
    pagos_provisionales_anteriores_centavos: z.number().int().min(0).nullable().optional(),
    saldo_iva_a_favor_anterior_centavos: z.number().int().min(0).nullable().optional(),
    resico_acumulado_previo_centavos: z.number().int().min(0).nullable().optional(),
    resico_receptor_persona_moral: z.boolean().nullable().optional(),
  })
  .default({});

const leerEntradas = (supabase: any, clienteId: string, periodo: string): Promise<EntradasFiscales> =>
  leerEntradasFiscales(supabase, clienteId, periodo);

/** Entradas normalizadas + simulación del preliminar SIN registrar nada. */
export const getImpuestosPreliminar = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        periodo: periodoSchema,
        parametros: parametrosSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const entradas = await leerEntradas(supabase, scope.cliente_id, data.periodo);
    const preliminar = calcularPreliminar(entradas, (data.parametros ?? {}) as ParametrosFiscales);

    const { data: diagnostico, error } = await supabase.rpc("cierre_diag_impuestos", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
    });
    if (error) throw new Error(error.message);

    return { entradas, preliminar, diagnostico };
  });

/**
 * Ejecuta los motores y REGISTRA el resultado del periodo. Si no es evaluable
 * no se registra nada: devolver un cero silencioso sería afirmar un impuesto
 * que la evidencia no sostiene.
 */
export const calcularImpuestosPreliminar = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        periodo: periodoSchema,
        parametros: parametrosSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const parametros = (data.parametros ?? {}) as ParametrosFiscales;
    const puente = await calcularYRegistrar(supabase, scope.cliente_id, data.periodo, parametros);
    if (!puente.registrado) {
      return {
        registrado: false as const,
        motivo: puente.motivo ?? null,
        entradas: puente.entradas,
        preliminar: puente.preliminar,
      };
    }
    const { data: evaluacion, error } = await supabase.rpc("cierre_evaluar_impuestos", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
    });
    if (error) throw new Error(error.message);
    return {
      registrado: true as const,
      motivo: null,
      entradas: puente.entradas,
      preliminar: puente.preliminar,
      evaluacion,
    };
  });

/** Historial de cálculos registrados del periodo (auditoría). */
export const getHistorialFiscal = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: filas, error } = await supabase
      .from("cierre_resultado_fiscal")
      .select("id, periodo, regimen, motor_version, normativa_sha256, input_hash, resultado, fundamentos, fuentes, created_at")
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { historial: filas ?? [] };
  });
