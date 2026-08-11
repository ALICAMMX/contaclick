// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 6 — funciones servidoras del sellado de cierre.
//
// Regla del bloque: la aplicación NO calcula estado de cierre. Todo —etapas,
// resumen en centavos, bloqueos, huella y vigencia del sello— proviene de
// `cierre_estado`, que reconstruye el mismo manifiesto canónico que se sella.
// Así la pantalla no puede mostrar un número distinto al sellado.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import type { EstadoCierre } from "./snapshot";

const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo con formato AAAA-MM");

/**
 * Estado de terminación del periodo, leído de la fuente canónica.
 * `sello_vigente` sólo viene lleno cuando la huella del sello coincide con la
 * huella actual de la evidencia; si algo cambió después de sellar, llega
 * `sello_obsoleto` con las secciones que difieren.
 */
export const getEstadoCierre = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<EstadoCierre & { puedeSellar: boolean }> => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    const { data: estado, error } = await supabase.rpc("cierre_estado", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
    });
    if (error) throw new Error(error.message);

    const e = estado as unknown as EstadoCierre;
    return { ...e, puedeSellar: (e.bloqueos ?? []).length === 0 };
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
