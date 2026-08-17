// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 2 · Catálogo de cuentas del contador (fuente única).
//
// `authenticated` NO escribe la tabla: toda alta/edición pasa por los RPC
// SECURITY DEFINER `catalogo_importar_lote`, `catalogo_cuenta_guardar` y
// `catalogo_cuenta_desactivar`, que validan el expediente y son atómicos.
// ─────────────────────────────────────────────────────────────────────────────
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import { elegirCuentasSistema, type CuentaCatalogo } from "@/lib/polizas/cuentas";

const filaSchema = z.object({
  codigo: z.string().min(1).max(60),
  nombre: z.string().min(1).max(300),
  naturaleza: z.enum(["deudora", "acreedora"]),
  nivel: z.number().int().min(1).max(20).nullable().optional(),
  codigo_padre: z.string().max(60).nullable().optional(),
  agrupador_sat: z.string().max(20).nullable().optional(),
  moneda: z.string().max(3).nullable().optional(),
  activa: z.boolean().optional(),
  external_id: z.string().max(120).nullable().optional(),
});

export const listarCatalogoCuentas = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), incluir_inactivas: z.boolean().default(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    let q = supabase
      .from("catalogo_cuentas")
      .select("id, codigo, nombre, naturaleza, tipo_sat, codigo_padre, nivel, moneda, fuente, external_id, activa, actualizada_at")
      .eq("cliente_id", scope.cliente_id)
      .order("codigo");
    if (!data.incluir_inactivas) q = q.eq("activa", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const seleccion = elegirCuentasSistema((rows ?? []) as unknown as CuentaCatalogo[]);
    return { cuentas: rows ?? [], cuentas_sistema: seleccion.cuentas, faltantes: seleccion.faltantes };
  });

/** Importación atómica: si alguna fila falla, no se guarda nada y se explica. */
export const importarCatalogo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        modo: z.enum(["agregar", "agregar_actualizar"]),
        huella: z.string().min(3).max(120),
        cuentas: z.array(filaSchema).min(1).max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: res, error } = await supabase.rpc("catalogo_importar_lote", {
      _cliente_id: scope.cliente_id,
      _modo: data.modo,
      _cuentas: data.cuentas as never,
      _huella: data.huella,
    } as never);
    if (error) throw new Error(error.message);
    return res as unknown as {
      guardado: boolean;
      filas: number;
      altas: number;
      actualizadas: number;
      omitidas: number;
      errores: Array<{ fila?: number; codigo?: string; error: string }>;
      mensaje?: string;
    };
  });

export const guardarCuenta = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        codigo: z.string().min(1).max(60),
        nombre: z.string().min(1).max(300),
        naturaleza: z.enum(["deudora", "acreedora"]),
        agrupador_sat: z.string().max(20).nullable().optional(),
        codigo_padre: z.string().max(60).nullable().optional(),
        moneda: z.string().max(3).default("MXN"),
        activa: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: res, error } = await supabase.rpc("catalogo_cuenta_guardar", {
      _cliente_id: scope.cliente_id,
      _codigo: data.codigo,
      _nombre: data.nombre,
      _naturaleza: data.naturaleza,
      _agrupador_sat: data.agrupador_sat ?? null,
      _codigo_padre: data.codigo_padre ?? null,
      _moneda: data.moneda,
      _activa: data.activa,
    } as never);
    if (error) throw new Error(error.message);
    return res;
  });

export const desactivarCuenta = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), codigo: z.string().min(1).max(60) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: res, error } = await supabase.rpc("catalogo_cuenta_desactivar", {
      _cliente_id: scope.cliente_id,
      _codigo: data.codigo,
    } as never);
    if (error) throw new Error(error.message);
    return res;
  });

export const listarImportacionesCatalogo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: rows, error } = await supabase
      .from("catalogo_importaciones")
      .select("id, modo, huella, filas, altas, actualizadas, omitidas, errores, created_at")
      .eq("cliente_id", scope.cliente_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
