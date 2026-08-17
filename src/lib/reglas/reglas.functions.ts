// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 2 · Reglas contables POR CONCEPTO (fuente única).
//
// Regla del bloque: “Cada concepto de CFDI debe resolver exactamente una
// asignación contable vigente; una póliza puede incluir varios conceptos, cada
// uno como renglón separado.”
//
// Escritura sólo por RPC versionado y auditado (`regla_concepto_guardar`).
// Una sugerencia automática NUNCA se convierte sola en decisión: se guarda con
// origen `sugerencia` y el resolutor la ignora hasta que una persona la asuma.
// ─────────────────────────────────────────────────────────────────────────────
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import { rangoMensual } from "@/lib/cierre/periodo";

const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo con formato AAAA-MM");
const motivoSchema = z.string().min(10, "Se exige un motivo de al menos 10 caracteres.").max(1000);

export const listarReglasConcepto = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), incluir_inactivas: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    let q = supabase
      .from("reglas_concepto")
      .select("id, clave_prod_serv, rfc_contraparte, patron_descripcion, cuenta, tratamiento_iva, tipo_operacion, vigencia_desde, vigencia_hasta, origen, version, motivo, activa, created_at")
      .eq("cliente_id", scope.cliente_id)
      .order("clave_prod_serv")
      .order("vigencia_desde", { ascending: false })
      .limit(1000);
    if (!data.incluir_inactivas) q = q.eq("activa", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const guardarReglaConcepto = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        clave_prod_serv: z.string().min(1).max(20),
        cuenta: z.string().min(1).max(60),
        tratamiento_iva: z.enum(["trasladado", "acreditable", "exento", "tasa_cero", "no_objeto", "sin_iva"]),
        tipo_operacion: z.enum(["ingreso", "gasto", "activo", "otro"]),
        vigencia_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        vigencia_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        rfc_contraparte: z.string().max(13).nullable().optional(),
        patron_descripcion: z.string().max(200).nullable().optional(),
        origen: z.enum(["contador", "regla", "sugerencia"]).default("contador"),
        motivo: motivoSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: res, error } = await supabase.rpc("regla_concepto_guardar", {
      _cliente_id: scope.cliente_id,
      _clave_prod_serv: data.clave_prod_serv,
      _cuenta: data.cuenta,
      _tratamiento_iva: data.tratamiento_iva,
      _tipo_operacion: data.tipo_operacion,
      _vigencia_desde: data.vigencia_desde,
      _motivo: data.motivo,
      _rfc_contraparte: data.rfc_contraparte ?? null,
      _patron_descripcion: data.patron_descripcion ?? null,
      _vigencia_hasta: data.vigencia_hasta ?? null,
      _origen: data.origen,
    } as never);
    if (error) throw new Error(error.message);
    return res;
  });

export const desactivarReglaConcepto = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), regla_id: z.string().uuid(), motivo: motivoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: res, error } = await supabase.rpc("regla_concepto_desactivar", {
      _regla_id: data.regla_id,
      _motivo: data.motivo,
    } as never);
    if (error) throw new Error(error.message);
    return res;
  });

/**
 * Conceptos del periodo agrupados por ClaveProdServ con su estado de
 * resolución. Es la lista de trabajo de “resolver conceptos”.
 */
export const conceptosPendientesPeriodo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const rango = rangoMensual(data.periodo);

    const { data: cfdis, error: errC } = await supabase
      .from("cfdi_xml")
      .select("id, uuid, rfc_emisor, rfc_receptor, fecha")
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo)
      .limit(2000);
    if (errC) throw new Error(errC.message);
    const ids = (cfdis ?? []).map((c) => c.id);
    if (!ids.length) return { grupos: [], sin_resolver: 0, periodo: data.periodo };

    const porCfdi = new Map(ids.map((id, i) => [id, (cfdis ?? [])[i]]));
    const conceptos: any[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data: pagina, error } = await supabase
        .from("cfdi_conceptos")
        .select("cfdi_id, clave_prod_serv, descripcion, importe")
        .in("cfdi_id", ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
      conceptos.push(...(pagina ?? []));
    }

    type Grupo = {
      clave_prod_serv: string;
      descripcion_ejemplo: string;
      conceptos: number;
      importe_centavos: number;
      estado: string;
      cuenta: string | null;
      motivo: string | null;
    };
    const grupos = new Map<string, Grupo>();
    for (const c of conceptos) {
      const clave = String(c.clave_prod_serv ?? "").trim() || "(sin clave)";
      const g = grupos.get(clave) ?? {
        clave_prod_serv: clave,
        descripcion_ejemplo: String(c.descripcion ?? ""),
        conceptos: 0,
        importe_centavos: 0,
        estado: "pendiente",
        cuenta: null,
        motivo: null,
      };
      g.conceptos += 1;
      g.importe_centavos += Math.round(Number(c.importe ?? 0) * 100);
      grupos.set(clave, g);
    }

    for (const [clave, g] of grupos) {
      const ejemplo = conceptos.find((c) => (String(c.clave_prod_serv ?? "").trim() || "(sin clave)") === clave);
      const cfdi = ejemplo ? porCfdi.get(ejemplo.cfdi_id) : null;
      const contraparte =
        cfdi && String(cfdi.rfc_emisor ?? "") === scope.rfc ? cfdi.rfc_receptor : cfdi?.rfc_emisor ?? null;
      const { data: res, error } = await supabase.rpc("regla_concepto_resolver", {
        _cliente_id: scope.cliente_id,
        _clave_prod_serv: clave,
        _rfc_contraparte: contraparte,
        _descripcion: g.descripcion_ejemplo,
        _fecha: rango.desde.slice(0, 10),
      } as never);
      if (error) throw new Error(error.message);
      const r = res as any;
      g.estado = r?.estado ?? "sin_regla";
      g.cuenta = r?.cuenta ?? null;
      g.motivo = r?.motivo ?? null;
    }

    const lista = [...grupos.values()].sort((a, b) => b.importe_centavos - a.importe_centavos);
    return {
      grupos: lista,
      sin_resolver: lista.filter((g) => g.estado !== "resuelta").length,
      periodo: data.periodo,
    };
  });
