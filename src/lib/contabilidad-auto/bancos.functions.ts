import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import { llaveIdempotencia } from "@/lib/polizas/motor";

// Cuentas por defecto usadas para movimientos bancarios sin clasificar.
const CTA_BANCOS = { c: "102-01", n: "Bancos" };
const CTA_ING_POR_IDENT = { c: "499-01", n: "Ingresos por identificar" };
const CTA_GTO_POR_IDENT = { c: "699-01", n: "Gastos por identificar" };

type ReglaBanco = {
  id: string;
  nombre: string;
  prioridad: number;
  activa: boolean;
  cuenta_cargo: string;
  cuenta_abono: string;
  condicion: {
    keyword?: string | null;
    min_monto?: number | null;
    max_monto?: number | null;
    tipo_cfdi?: string | null; // ignorado para bancos
  } | null;
};

function matchReglaBanco(desc: string, monto: number, reglas: ReglaBanco[]) {
  const sorted = [...reglas].filter((r) => r.activa).sort((a, b) => b.prioridad - a.prioridad);
  for (const r of sorted) {
    const cd = r.condicion ?? {};
    if (cd.keyword && !desc.toLowerCase().includes(cd.keyword.toLowerCase())) continue;
    if (cd.min_monto != null && monto < cd.min_monto) continue;
    if (cd.max_monto != null && monto > cd.max_monto) continue;
    return r;
  }
  return null;
}

// ---------- Listar movimientos bancarios sin póliza ----------
export const listarMovimientosSinPoliza = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      desde: z.string().optional(),
      hasta: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("movimientos_bancarios")
      .select("id, fecha, descripcion, referencia, cargo, abono, cuenta_id")
      .eq("cliente_id", data.cliente_id)
      // Sólo movimientos de importaciones validadas por una persona.
      .not("validado_at", "is", null)
      .order("fecha", { ascending: false })
      .limit(data.limit);
    if (data.desde) q = q.gte("fecha", data.desde);
    if (data.hasta) q = q.lte("fecha", data.hasta);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.id);
    let yaPolizados = new Set<string>();
    if (ids.length) {
      // El contrato canónico liga el movimiento en los RENGLONES de la póliza
      // (la columna polizas.movimiento_bancario_id es legada). Se revisan ambos
      // y se ignoran las pólizas rechazadas.
      const [{ data: ren }, { data: pol }] = await Promise.all([
        supabase
          .from("poliza_renglones")
          .select("movimiento_bancario_id, polizas!inner(estado)")
          .eq("cliente_id", data.cliente_id)
          .in("movimiento_bancario_id", ids),
        supabase
          .from("polizas")
          .select("movimiento_bancario_id, estado")
          .eq("cliente_id", data.cliente_id)
          .in("movimiento_bancario_id", ids),
      ]);
      yaPolizados = new Set(
        [
          ...((ren ?? []) as any[]).filter((r) => r.polizas?.estado !== "rechazada"),
          ...((pol ?? []) as any[]).filter((p) => p.estado !== "rechazada"),
        ]
          .map((r) => r.movimiento_bancario_id)
          .filter(Boolean),
      );
    }
    return (rows ?? []).filter((r) => !yaPolizados.has(r.id));
  });

// ---------- Generar pólizas borrador desde movimientos ----------
// MIGRADO AL CONTRATO CANÓNICO: ya no inserta en `polizas` ni escribe
// `metadata.asientos`. Todo pasa por `poliza_generar_borrador`, que valida
// partida doble al centavo, versiona y reabre la cascada del periodo.
export const generarPolizasDesdeMovimientos = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      movimiento_ids: z.array(z.string().uuid()).min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    const { data: movs, error } = await supabase
      .from("movimientos_bancarios")
      .select("id, fecha, descripcion, referencia, cargo, abono, validado_at, importacion_id")
      .eq("cliente_id", scope.cliente_id)
      .in("id", data.movimiento_ids);
    if (error) throw new Error(error.message);

    const { data: reglasRows } = await supabase
      .from("reglas_contables")
      .select("id, nombre, prioridad, activa, cuenta_cargo, cuenta_abono, condicion")
      .eq("cliente_id", scope.cliente_id)
      .eq("activa", true);
    const reglas: ReglaBanco[] = (reglasRows ?? []) as any;

    // Conciliaciones confirmadas por una persona: única fuente de evidencia
    // bancaria. Sin ellas el movimiento se contabiliza sin reconocer flujo.
    const { data: concs } = await supabase
      .from("conciliaciones")
      .select("movimiento_bancario_id, estado")
      .eq("cliente_id", scope.cliente_id)
      .in("movimiento_bancario_id", data.movimiento_ids);
    const confirmados = new Set(
      (concs ?? []).filter((c: any) => c.estado === "confirmada").map((c: any) => c.movimiento_bancario_id),
    );

    const cent = (n: unknown) => Math.round((Number(n) || 0) * 100);
    const detalle: Array<{ movimiento_id: string; accion: string; motivo?: string }> = [];
    let generadas = 0;
    let omitidos = 0;

    for (const m of movs ?? []) {
      if (!(m as any).validado_at) {
        omitidos++;
        detalle.push({
          movimiento_id: m.id,
          accion: "omitida",
          motivo: "La importación bancaria de origen aún no ha sido validada por una persona.",
        });
        continue;
      }
      const cargo = cent(m.cargo);
      const abono = cent(m.abono);
      if (cargo === 0 && abono === 0) {
        omitidos++;
        detalle.push({ movimiento_id: m.id, accion: "omitida", motivo: "Movimiento sin importe." });
        continue;
      }
      const esIngreso = abono > 0;
      const monto = esIngreso ? abono : cargo;
      const desc = m.descripcion ?? "(sin descripción)";
      const regla = matchReglaBanco(desc, monto / 100, reglas);

      const cuentaCargo = esIngreso ? CTA_BANCOS.c : (regla?.cuenta_cargo ?? CTA_GTO_POR_IDENT.c);
      const nombreCargo = esIngreso ? CTA_BANCOS.n : (regla ? `${regla.nombre}` : CTA_GTO_POR_IDENT.n);
      const cuentaAbono = esIngreso ? (regla?.cuenta_abono ?? CTA_ING_POR_IDENT.c) : CTA_BANCOS.c;
      const nombreAbono = esIngreso ? (regla ? `${regla.nombre}` : CTA_ING_POR_IDENT.n) : CTA_BANCOS.n;

      const concepto = `Banco · ${esIngreso ? "depósito" : "cargo"} · ${desc.slice(0, 80)}`;
      const renglones = [
        {
          cuenta: cuentaCargo,
          cuenta_nombre: nombreCargo,
          concepto,
          cargo_centavos: monto,
          abono_centavos: 0,
          movimiento_bancario_id: m.id,
        },
        {
          cuenta: cuentaAbono,
          cuenta_nombre: nombreAbono,
          concepto,
          cargo_centavos: 0,
          abono_centavos: monto,
          movimiento_bancario_id: m.id,
        },
      ];

      const fecha = String(m.fecha).slice(0, 10);
      const nivel = confirmados.has(m.id) ? "banco_confirmado" : "sin_evidencia";
      const { error: errRpc } = await supabase.rpc("poliza_generar_borrador", {
        _cliente_id: scope.cliente_id,
        _periodo: fecha.slice(0, 7),
        _idempotency_key: llaveIdempotencia("banco", m.id, `banco@${nivel}`),
        _tipo: esIngreso ? "ingreso" : "egreso",
        _fecha: fecha,
        _concepto: concepto,
        _origen: "auto_banco",
        _renglones: renglones as never,
      } as never);
      if (errRpc) {
        detalle.push({ movimiento_id: m.id, accion: "error", motivo: errRpc.message });
        continue;
      }
      generadas += 1;
      detalle.push({
        movimiento_id: m.id,
        accion: "creada",
        motivo: regla ? undefined : "Sin regla contable: quedó en cuenta por identificar.",
      });
    }

    return { insertadas: generadas, omitidos, detalle };
  });

