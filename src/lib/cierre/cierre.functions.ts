// ─────────────────────────────────────────────────────────────────────────────
// CENTRO DE CIERRE MENSUAL — funciones servidoras.
//
// Todo pasa por `assertClienteScope`: ninguna lectura o escritura puede salirse
// del despacho y expediente activos. La lógica de negocio vive en módulos puros
// (`periodo.ts`, `clasificacion.ts`, `normalizacion.ts`); aquí sólo hay E/S.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope, assertRecordScope } from "@/lib/despacho/scope";
import { cargarPeriodo, normalizarYPersistir, sincronizarExcepciones } from "./persistencia";
import { rangoMensual } from "./periodo";
import { COLUMNAS_CANONICAS, repararDerivadosCfdi, type FilaCanonica } from "./reparacion";
import { MOTIVOS_EXCEPCION, type CodigoExcepcion } from "./motivos";

const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const periodoSchema = z.string().regex(PERIODO_RE, "Periodo con formato AAAA-MM");

const BaseSchema = z.object({
  cliente_id: z.string().uuid(),
  periodo: periodoSchema,
});

/** Panorama completo del periodo: contadores, criterios y bandeja. */
export const getCierreMensual = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => BaseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    const { evaluacion, corte } = await cargarPeriodo(supabase, {
      clienteId: scope.cliente_id,
      rfcExpediente: scope.rfc,
      periodo: data.periodo,
    });
    await sincronizarExcepciones(supabase, {
      despachoId: scope.despacho_id,
      clienteId: scope.cliente_id,
      periodo: data.periodo,
      evaluacion,
    });

    const { data: excepciones } = await supabase
      .from("cierre_excepciones")
      .select("id, codigo, severidad, titulo, detalle, estado, motivo, resuelta_at, cfdi_id, tarea_id, cfdi_xml(uuid, tipo_cfdi, fecha, total, rfc_emisor, rfc_receptor)")
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo)
      .order("severidad", { ascending: true })
      .order("created_at", { ascending: true });

    return {
      expediente: { id: scope.cliente_id, rfc: scope.rfc, razon_social: scope.razon_social },
      periodo: data.periodo,
      rango: rangoMensual(data.periodo),
      contadores: evaluacion.contadores,
      criterios: evaluacion.criterios,
      puedeDeclararse: evaluacion.puedeDeclararse,
      corte: corte
        ? {
            corte_at: corte.corte_at,
            direcciones: (corte.direcciones as string[] | null) ?? [],
            etapa_documental: corte.etapa_documental,
            declarada_at: corte.declarada_at,
            ultima_revision_at: corte.ultima_revision_at,
          }
        : { corte_at: null, direcciones: [] as string[], etapa_documental: "en_proceso", declarada_at: null, ultima_revision_at: null },
      excepciones: (excepciones ?? []).map((e: any) => ({
        ...e,
        guia: MOTIVOS_EXCEPCION[e.codigo as CodigoExcepcion] ?? null,
      })),
    };
  });

/** Documenta el corte: direcciones descargadas y fecha. */
export const registrarCorte = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    BaseSchema.extend({
      direcciones: z.array(z.enum(["emitidos", "recibidos"])).min(1),
      corte_at: z.string().datetime().optional(),
      notas: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const fila = {
      despacho_id: scope.despacho_id,
      cliente_id: scope.cliente_id,
      periodo: data.periodo,
      corte_at: data.corte_at ?? new Date().toISOString(),
      direcciones: data.direcciones,
      notas: data.notas ?? null,
      ultima_revision_at: new Date().toISOString(),
    };
    const { data: existente } = await supabase
      .from("cierre_periodos")
      .select("id")
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo)
      .maybeSingle();
    if (existente?.id) await supabase.from("cierre_periodos").update(fila).eq("id", existente.id);
    else await supabase.from("cierre_periodos").insert(fila);
    return { ok: true };
  });

/** Resuelve o acepta una excepción. Aceptar exige motivo. Siempre deja bitácora. */
export const decidirExcepcion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        excepcion_id: z.string().uuid(),
        accion: z.enum(["resuelta", "aceptada", "reabrir"]),
        motivo: z.string().max(1000).optional(),
      })
      .refine((v) => v.accion !== "aceptada" || (v.motivo?.trim().length ?? 0) >= 10, {
        message: "Aceptar una excepción exige un motivo de al menos 10 caracteres.",
        path: ["motivo"],
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClienteScope(supabase, userId, data.cliente_id);
    await assertRecordScope(supabase, userId, "cierre_excepciones", data.excepcion_id, data.cliente_id);

    const estado = data.accion === "reabrir" ? "pendiente" : data.accion;
    await supabase
      .from("cierre_excepciones")
      .update({
        estado,
        motivo: data.motivo ?? null,
        resuelta_por: estado === "pendiente" ? null : userId,
        resuelta_at: estado === "pendiente" ? null : new Date().toISOString(),
      })
      .eq("id", data.excepcion_id);

    await supabase.from("cierre_excepcion_bitacora").insert({
      excepcion_id: data.excepcion_id,
      user_id: userId,
      accion: data.accion,
      motivo: data.motivo ?? null,
    });
    return { ok: true, estado };
  });

/** Bitácora de una excepción. */
export const getBitacoraExcepcion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid(), excepcion_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRecordScope(supabase, userId, "cierre_excepciones", data.excepcion_id, data.cliente_id);
    const { data: rows } = await supabase
      .from("cierre_excepcion_bitacora")
      .select("id, accion, motivo, created_at, user_id")
      .eq("excepcion_id", data.excepcion_id)
      .order("created_at", { ascending: false });
    return { bitacora: rows ?? [] };
  });

/** Crea una tarea de seguimiento ligada a la excepción. */
export const crearTareaExcepcion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), excepcion_id: z.string().uuid(), titulo: z.string().min(3).max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    await assertRecordScope(supabase, userId, "cierre_excepciones", data.excepcion_id, data.cliente_id);

    const { data: exc } = await supabase
      .from("cierre_excepciones")
      .select("codigo, titulo, periodo")
      .eq("id", data.excepcion_id)
      .maybeSingle();
    const guia = MOTIVOS_EXCEPCION[(exc?.codigo ?? "") as CodigoExcepcion];

    const { data: tarea, error } = await supabase
      .from("tareas")
      .insert({
        despacho_id: scope.despacho_id,
        cliente_id: scope.cliente_id,
        titulo: data.titulo ?? `Cierre ${exc?.periodo}: ${exc?.titulo ?? "excepción documental"}`,
        descripcion: guia ? `${guia.quePasa}\n\nQué hacer: ${guia.queHacer}` : "Excepción documental del cierre mensual.",
        prioridad: guia?.bloquea ? "alta" : "media",
        tipo: "otro",
        origen: "cierre_mensual",
        kanban_estado: "pendiente",
        estatus: "pendiente",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("cierre_excepciones").update({ tarea_id: tarea.id }).eq("id", data.excepcion_id);
    await supabase.from("cierre_excepcion_bitacora").insert({
      excepcion_id: data.excepcion_id,
      user_id: userId,
      accion: "tarea_creada",
      motivo: null,
    });
    return { tarea_id: tarea.id as string };
  });

/**
 * Re-normaliza los documentos del periodo desde su XML original.
 * Los CFDI sin XML almacenado NO se tocan: se informan como no reconstruibles.
 */
export const reprocesarPeriodo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => BaseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    const rango = rangoMensual(data.periodo);

    const { data: docs, error: errDocs } = await supabase
      .from("cfdi_xml")
      .select(`xml_raw, ${COLUMNAS_CANONICAS}`)
      .eq("cliente_id", scope.cliente_id)
      .gte("fecha", rango.desde)
      .lt("fecha", rango.hastaExclusivo)
      .limit(2000);
    if (errDocs) throw new Error(errDocs.message);


    let reprocesados = 0;
    let sinXml = 0;
    let reparados = 0;
    for (const d of (docs ?? []) as any[]) {
      if (!d.xml_raw) {
        // Sin XML el detalle no se puede reconstruir, pero el ENCABEZADO
        // canónico sí permite recuperar periodo, dirección y clase: de otro
        // modo el documento existe y el cierre no lo ve.
        sinXml += 1;
        const r = await repararDerivadosCfdi(supabase, d as FilaCanonica, scope.rfc);
        if (r.cambiado) reparados += 1;
        continue;
      }
      await normalizarYPersistir(supabase, {
        cfdiId: d.id as string,
        despachoId: scope.despacho_id,
        clienteId: scope.cliente_id,
        rfcExpediente: scope.rfc,
        xml: d.xml_raw as string,
      });
      reprocesados += 1;
    }

    const { evaluacion } = await cargarPeriodo(supabase, {
      clienteId: scope.cliente_id,
      rfcExpediente: scope.rfc,
      periodo: data.periodo,
    });
    const sync = await sincronizarExcepciones(supabase, {
      despachoId: scope.despacho_id,
      clienteId: scope.cliente_id,
      periodo: data.periodo,
      evaluacion,
    });
    return { reprocesados, reparados, sin_xml_original: sinXml, excepciones: sync };
  });

/**
 * Declara la ETAPA DOCUMENTAL lista. No cierra el mes: sólo certifica que los
 * documentos están completos para continuar a contabilidad y conciliación.
 */
export const declararEtapaDocumental = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => BaseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    const { evaluacion } = await cargarPeriodo(supabase, {
      clienteId: scope.cliente_id,
      rfcExpediente: scope.rfc,
      periodo: data.periodo,
    });
    await sincronizarExcepciones(supabase, {
      despachoId: scope.despacho_id,
      clienteId: scope.cliente_id,
      periodo: data.periodo,
      evaluacion,
    });
    if (!evaluacion.puedeDeclararse) {
      const faltan = evaluacion.criterios.filter((c) => !c.cumplido).map((c) => c.etiqueta);
      throw new Error(`La etapa documental no puede declararse lista. Falta: ${faltan.join("; ")}.`);
    }

    const { data: existente } = await supabase
      .from("cierre_periodos")
      .select("id")
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo)
      .maybeSingle();
    const fila = {
      etapa_documental: "lista",
      declarada_por: userId,
      declarada_at: new Date().toISOString(),
      ultima_revision_at: new Date().toISOString(),
    };
    if (existente?.id) await supabase.from("cierre_periodos").update(fila).eq("id", existente.id);
    else
      await supabase.from("cierre_periodos").insert({
        despacho_id: scope.despacho_id,
        cliente_id: scope.cliente_id,
        periodo: data.periodo,
        ...fila,
      });

    await supabase.from("audit_logs").insert({
      user_id: userId,
      despacho_id: scope.despacho_id,
      accion: "cierre.etapa_documental.lista",
      entidad: "cierre_periodos",
      payload: { cliente_id: scope.cliente_id, periodo: data.periodo, contadores: evaluacion.contadores },
    });

    return { ok: true, etapa_documental: "lista" as const };
  });

/** Reabre la etapa documental (por ejemplo, al llegar CFDI nuevos). */
export const reabrirEtapaDocumental = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => BaseSchema.extend({ motivo: z.string().min(10).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    await supabase
      .from("cierre_periodos")
      .update({ etapa_documental: "en_proceso", declarada_at: null, declarada_por: null, notas: data.motivo })
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo);
    return { ok: true };
  });
