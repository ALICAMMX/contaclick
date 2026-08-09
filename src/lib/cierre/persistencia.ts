// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCIA DE LA NORMALIZACIÓN Y DEL PERIODO.
//
// Recibe siempre un cliente Supabase ya autenticado y con alcance validado por
// `assertClienteScope`. No abre conexiones propias ni usa el cliente admin.
//
// Idempotencia: reprocesar el mismo XML reemplaza su detalle (impuestos, pagos,
// documentos relacionados, conceptos y relaciones) en lugar de acumularlo.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarCfdi, NORMALIZACION_VERSION } from "@/lib/cfdi/normalizacion";
import { clasificarDocumento } from "@/lib/cfdi/clasificacion";
import {
  evaluarPeriodo,
  periodoDeFecha,
  rangoMensual,
  type DocumentoPagoPeriodo,
  type DocumentoPeriodo,
  type EvaluacionPeriodo,
} from "./periodo";
import { MOTIVOS_EXCEPCION, type CodigoExcepcion } from "./motivos";
import {
  ACTOR_SISTEMA,
  MOTIVO_CAUSA_DESAPARECIO,
  planificarExcepciones,
} from "./excepciones";

export type ResultadoNormalizacion = {
  cfdi_id: string;
  periodo: string | null;
  impuestos: number;
  pagos: number;
  documentos_relacionados: number;
  periodo_reabierto: boolean;
  clasificacion: ReturnType<typeof clasificarDocumento>;
};

/**
 * Normaliza UN documento y persiste su detalle EN UNA SOLA TRANSACCIÓN.
 *
 * La escritura entera (borrado del detalle previo, conceptos, impuestos,
 * relaciones, pagos, documentos relacionados, impuestos del pago y cabecera)
 * ocurre dentro de la función SQL `cfdi_normalizacion_reemplazar`. Si algo
 * falla, la base revierte todo: nunca queda un documento con detalle a medias.
 *
 * No ejecuta Salud Fiscal, Riesgo, conciliación ni cálculos fiscales.
 */
export async function normalizarYPersistir(
  supabase: SupabaseClient,
  args: {
    cfdiId: string;
    despachoId: string;
    clienteId: string;
    rfcExpediente: string;
    xml: string;
    guardarXml?: boolean;
    /** Sólo la ingesta de documentos NUEVOS reabre un periodo ya declarado listo. */
    reabrirPeriodo?: boolean;
  },
): Promise<ResultadoNormalizacion> {
  const n = normalizarCfdi(args.xml);
  const enc = n.encabezado;
  const guardarXml = args.guardarXml !== false;

  // EVIDENCIA DEL SAT: se lee y se conserva. Renormalizar el XML no puede
  // borrar que el comprobante fue consultado y resultó vigente o cancelado.
  const { data: previo } = await supabase
    .from("cfdi_xml")
    .select("estatus_sat, estatus_sat_check_at")
    .eq("id", args.cfdiId)
    .maybeSingle();

  const clasificacion = clasificarDocumento(
    {
      uuid: enc.uuid ?? null,
      tipo_cfdi: enc.tipoComprobante ?? null,
      rfc_emisor: enc.emisor.rfc ?? null,
      rfc_receptor: enc.receptor.rfc ?? null,
      metodo_pago: enc.metodoPago ?? null,
      estatus_sat: (previo?.estatus_sat as string | null) ?? null,
      detalle_reconstruible: guardarXml,
      avisos: n.avisos,
    },
    { rfcExpediente: args.rfcExpediente },
  );

  const periodo = periodoDeFecha(enc.fecha ?? null);

  const payload = {
    conceptos: enc.conceptos.slice(0, 500).map((c, i) => ({
      numero: i + 1,
      clave_prod_serv: c.claveProdServ ?? null,
      descripcion: c.descripcion ?? null,
      cantidad: c.cantidad ?? null,
      valor_unitario: c.valorUnitario ?? null,
      importe: c.importe ?? null,
    })),
    impuestos: n.impuestos.map((i) => ({
      nivel: i.nivel,
      concepto_numero: i.concepto_numero,
      tipo: i.tipo,
      impuesto: i.impuesto,
      impuesto_nombre: i.impuesto_nombre,
      base: i.base,
      tipo_factor: i.tipo_factor,
      tasa_cuota: i.tasa_cuota,
      importe: i.importe,
    })),
    relaciones: dedupRelaciones(enc.relacionados),
    pagos: n.pagos.map((p) => ({
      numero_pago: p.numero_pago,
      fecha_pago: p.fecha_pago ? new Date(p.fecha_pago).toISOString() : null,
      forma_pago_p: p.forma_pago_p,
      moneda_p: p.moneda_p,
      tipo_cambio_p: p.tipo_cambio_p,
      monto: p.monto,
      num_operacion: p.num_operacion,
      documentos: p.documentos.map((d) => ({
        id_documento: d.id_documento,
        serie: d.serie,
        folio: d.folio,
        moneda_dr: d.moneda_dr,
        equivalencia_dr: d.equivalencia_dr,
        num_parcialidad: d.num_parcialidad,
        imp_saldo_ant: d.imp_saldo_ant,
        imp_pagado: d.imp_pagado,
        imp_saldo_insoluto: d.imp_saldo_insoluto,
        objeto_imp_dr: d.objeto_imp_dr,
      })),
      impuestos: p.impuestos.map((i) => ({
        documento_indice: i.documento_indice,
        ambito: i.ambito,
        tipo: i.tipo,
        impuesto: i.impuesto,
        base: i.base,
        tipo_factor: i.tipo_factor,
        tasa_cuota: i.tasa_cuota,
        importe: i.importe,
      })),
    })),
    cabecera: {
      guardar_xml: guardarXml,
      xml_raw: guardarXml ? args.xml : null,
      detalle_reconstruible: guardarXml,
      normalizacion_version: NORMALIZACION_VERSION,
      periodo,
      direccion: clasificacion.direccion,
      clase_documental: clasificacion.clase,
      estado_relacion: enc.tipoComprobante === "P" ? "completo" : "no_aplica",
      estado_procesamiento: clasificacion.estado_procesamiento,
      motivos: clasificacion.motivos,
    },
    reabrir_periodo: args.reabrirPeriodo === true,
  };

  const { data: res, error } = await supabase.rpc("cfdi_normalizacion_reemplazar", {
    _cfdi_id: args.cfdiId,
    _payload: payload,
  });
  if (error) throw new Error(`La normalización no se guardó (transacción revertida): ${error.message}`);

  const salida = (res ?? {}) as { documentos_relacionados?: number; periodo_reabierto?: boolean };

  return {
    cfdi_id: args.cfdiId,
    periodo,
    impuestos: n.impuestos.length,
    pagos: n.pagos.length,
    documentos_relacionados: salida.documentos_relacionados ?? 0,
    periodo_reabierto: salida.periodo_reabierto === true,
    clasificacion,
  };
}

function dedupRelaciones(relacionados: Array<{ uuid: string; tipo?: string; tipoRelacion?: string | null }>) {
  const vistos = new Set<string>();
  const filas: Array<{ uuid_relacionado: string; tipo_relacion: string }> = [];
  for (const r of relacionados) {
    const fila = {
      uuid_relacionado: r.uuid.toUpperCase(),
      tipo_relacion: r.tipo === "pago" ? "pago" : (r.tipoRelacion ?? "relacion"),
    };
    const k = `${fila.uuid_relacionado}|${fila.tipo_relacion}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    filas.push(fila);
  }
  return filas;
}


// ─────────────────────────────────────────────────────────────────────────────
// Evaluación y sincronización del periodo (idempotente).
// ─────────────────────────────────────────────────────────────────────────────

export async function cargarPeriodo(
  supabase: SupabaseClient,
  args: { clienteId: string; rfcExpediente: string; periodo: string },
): Promise<{ evaluacion: EvaluacionPeriodo; documentos: DocumentoPeriodo[]; corte: any }> {
  // Fuente única del rango mensual (hora local de America/Mexico_City).
  const rango = rangoMensual(args.periodo);
  const desde = rango.desde;
  const hasta = rango.hastaExclusivo;


  const [{ data: docsRaw }, { data: universo }, { data: corte }] = await Promise.all([
    supabase
      .from("cfdi_xml")
      .select("id, uuid, tipo_cfdi, rfc_emisor, rfc_receptor, metodo_pago, estatus_sat, fecha, periodo, total, moneda, archivo_hash, detalle_reconstruible, motivos, fecha_carga")
      .eq("cliente_id", args.clienteId)
      .gte("fecha", desde)
      .lt("fecha", hasta)
      .order("fecha", { ascending: false })
      .limit(5000),
    supabase.from("cfdi_xml").select("uuid, rfc_emisor").eq("cliente_id", args.clienteId).limit(20000),
    supabase.from("cierre_periodos").select("*").eq("cliente_id", args.clienteId).eq("periodo", args.periodo).maybeSingle(),
  ]);

  const documentos: DocumentoPeriodo[] = (docsRaw ?? []).map((d: any) => ({
    id: d.id,
    uuid: d.uuid,
    tipo_cfdi: d.tipo_cfdi,
    rfc_emisor: d.rfc_emisor,
    rfc_receptor: d.rfc_receptor,
    metodo_pago: d.metodo_pago,
    estatus_sat: d.estatus_sat,
    fecha: d.fecha,
    periodo: d.periodo,
    total: d.total,
    moneda: d.moneda,
    archivo_hash: d.archivo_hash,
    detalle_reconstruible: d.detalle_reconstruible,
    fecha_carga: d.fecha_carga,
    avisos: [],
  }));

  const idsPago = documentos.filter((d) => String(d.tipo_cfdi).toUpperCase() === "P").map((d) => d.id);
  let pagos: DocumentoPagoPeriodo[] = [];
  if (idsPago.length) {
    const { data: pagosRaw } = await supabase
      .from("cfdi_pagos")
      .select("id, cfdi_id, numero_pago, monto, cfdi_pago_documentos(id_documento, num_parcialidad, imp_saldo_ant, imp_pagado, imp_saldo_insoluto)")
      .in("cfdi_id", idsPago);
    pagos = (pagosRaw ?? []).map((p: any) => ({
      cfdi_id: p.cfdi_id,
      numero_pago: p.numero_pago,
      monto: p.monto,
      documentos: (p.cfdi_pago_documentos ?? []).map((d: any) => ({
        id_documento: d.id_documento,
        num_parcialidad: d.num_parcialidad,
        imp_saldo_ant: d.imp_saldo_ant,
        imp_pagado: d.imp_pagado,
        imp_saldo_insoluto: d.imp_saldo_insoluto,
      })),
    }));
  }

  const { data: decisiones } = await supabase
    .from("cierre_excepciones")
    .select("codigo, cfdi_id, estado")
    .eq("cliente_id", args.clienteId)
    .eq("periodo", args.periodo);

  const evaluacion = evaluarPeriodo({
    rfcExpediente: args.rfcExpediente,
    periodo: args.periodo,
    documentos,
    universoUuids: (universo ?? []).map((u: any) => ({ uuid: u.uuid, rfc_emisor: u.rfc_emisor })),
    pagos,
    decisiones: (decisiones ?? []) as any,
    corte: {
      corte_at: corte?.corte_at ?? null,
      direcciones: (corte?.direcciones as string[] | null) ?? [],
      ultima_revision_at: corte?.ultima_revision_at ?? null,
    },
  });

  return { evaluacion, documentos, corte };
}

/**
 * Sincroniza la bandeja con la evaluación. Idempotente y SIN borrados: una
 * excepción cuya causa desapareció se cierra automáticamente y conserva su
 * bitácora; si la causa reaparece se crea una ocurrencia nueva ligada a ella.
 */
export async function sincronizarExcepciones(
  supabase: SupabaseClient,
  args: { despachoId: string; clienteId: string; periodo: string; evaluacion: EvaluacionPeriodo },
): Promise<{ creadas: number; cerradas: number; vigentes: number }> {
  const { data: existentes, error: errLectura } = await supabase
    .from("cierre_excepciones")
    .select("id, codigo, cfdi_id, estado, ocurrencia, created_at")
    .eq("cliente_id", args.clienteId)
    .eq("periodo", args.periodo)
    .order("created_at", { ascending: true });
  if (errLectura) throw new Error(`No se pudo leer la bandeja de excepciones: ${errLectura.message}`);

  const plan = planificarExcepciones({
    existentes: (existentes ?? []) as any,
    vigentes: args.evaluacion.excepciones.map((e) => ({
      codigo: e.codigo,
      cfdi_id: e.cfdi_id,
      titulo: e.titulo,
      detalle: e.detalle,
    })),
  });

  // ALTA + EVENTO DE REAPARICIÓN: una sola transacción por ocurrencia. Si la
  // bitácora falla, la base revierte el alta: nunca queda un evento huérfano
  // ni una reaparición sin rastro.
  for (const e of plan.nuevas) {
    const { error } = await supabase.rpc("cierre_excepcion_crear_ocurrencia", {
      _despacho_id: args.despachoId,
      _cliente_id: args.clienteId,
      _periodo: args.periodo,
      _cfdi_id: e.cfdi_id,
      _codigo: e.codigo,
      _severidad: MOTIVOS_EXCEPCION[e.codigo as CodigoExcepcion].severidad,
      _titulo: e.titulo,
      _detalle: (e.detalle ?? {}) as any,
      _ocurrencia: e.ocurrencia,
      _excepcion_previa_id: e.excepcion_previa_id,
      _actor: ACTOR_SISTEMA,
    });
    if (error) throw new Error(`La excepción no se registró (transacción revertida): ${error.message}`);
  }

  // CIERRE AUTOMÁTICO + BITÁCORA: también atómico y sin DELETE.
  if (plan.cerrar.length) {
    const { error } = await supabase.rpc("cierre_excepcion_cerrar_automatica", {
      _ids: plan.cerrar,
      _motivo: MOTIVO_CAUSA_DESAPARECIO,
      _actor: ACTOR_SISTEMA,
    });
    if (error) throw new Error(`El cierre automático no se guardó (transacción revertida): ${error.message}`);
  }

  return {
    creadas: plan.nuevas.length,
    cerradas: plan.cerrar.length,
    vigentes: args.evaluacion.excepciones.length,
  };
}


