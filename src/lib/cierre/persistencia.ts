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
  type DocumentoPagoPeriodo,
  type DocumentoPeriodo,
  type EvaluacionPeriodo,
} from "./periodo";
import { MOTIVOS_EXCEPCION } from "./motivos";

export type ResultadoNormalizacion = {
  cfdi_id: string;
  periodo: string | null;
  impuestos: number;
  pagos: number;
  documentos_relacionados: number;
  clasificacion: ReturnType<typeof clasificarDocumento>;
};

/**
 * Normaliza UN documento y persiste su detalle. No ejecuta Salud Fiscal,
 * Riesgo, conciliación ni cálculos fiscales: eso es explícito y posterior.
 */
export async function normalizarYPersistir(
  supabase: SupabaseClient,
  args: { cfdiId: string; despachoId: string; clienteId: string; rfcExpediente: string; xml: string; guardarXml?: boolean },
): Promise<ResultadoNormalizacion> {
  const n = normalizarCfdi(args.xml);
  const enc = n.encabezado;

  // 1. Limpieza del detalle previo (reproceso idempotente).
  await supabase.from("cfdi_impuestos").delete().eq("cfdi_id", args.cfdiId);
  await supabase.from("cfdi_pagos").delete().eq("cfdi_id", args.cfdiId);
  await supabase.from("cfdi_conceptos").delete().eq("cfdi_id", args.cfdiId);
  await supabase.from("cfdi_relaciones").delete().eq("cfdi_id", args.cfdiId);

  // 2. Conceptos numerados.
  if (enc.conceptos.length) {
    await supabase.from("cfdi_conceptos").insert(
      enc.conceptos.slice(0, 500).map((c, i) => ({
        cfdi_id: args.cfdiId,
        numero: i + 1,
        clave_prod_serv: c.claveProdServ ?? null,
        descripcion: c.descripcion ?? null,
        cantidad: c.cantidad ?? null,
        valor_unitario: c.valorUnitario ?? null,
        importe: c.importe ?? null,
      })),
    );
  }

  // 3. Impuestos detallados (concepto y comprobante).
  if (n.impuestos.length) {
    await supabase.from("cfdi_impuestos").insert(
      n.impuestos.map((i) => ({
        cfdi_id: args.cfdiId,
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
    );
  }

  // 4. Relaciones declaradas (CfdiRelacionados y DoctoRelacionado).
  if (enc.relacionados.length) {
    const vistos = new Set<string>();
    const filas = enc.relacionados
      .map((r) => ({
        cfdi_id: args.cfdiId,
        uuid_relacionado: r.uuid.toUpperCase(),
        tipo_relacion: r.tipo === "pago" ? "pago" : (r.tipoRelacion ?? "relacion"),
      }))
      .filter((r) => {
        const k = `${r.uuid_relacionado}|${r.tipo_relacion}`;
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      });
    if (filas.length) await supabase.from("cfdi_relaciones").insert(filas);
  }

  // 5. Complemento de pagos 2.0.
  let docsRelacionados = 0;
  for (const p of n.pagos) {
    const { data: pagoRow, error: pagoErr } = await supabase
      .from("cfdi_pagos")
      .insert({
        cfdi_id: args.cfdiId,
        despacho_id: args.despachoId,
        cliente_id: args.clienteId,
        numero_pago: p.numero_pago,
        fecha_pago: p.fecha_pago ? new Date(p.fecha_pago).toISOString() : null,
        forma_pago_p: p.forma_pago_p,
        moneda_p: p.moneda_p,
        tipo_cambio_p: p.tipo_cambio_p,
        monto: p.monto,
        num_operacion: p.num_operacion,
      })
      .select("id")
      .single();
    if (pagoErr || !pagoRow) throw new Error(`No se pudo guardar el pago ${p.numero_pago}: ${pagoErr?.message}`);

    const idsDocs: string[] = [];
    for (const d of p.documentos) {
      const { data: padre } = await supabase
        .from("cfdi_xml")
        .select("id")
        .eq("cliente_id", args.clienteId)
        .ilike("uuid", d.id_documento)
        .maybeSingle();
      const { data: docRow } = await supabase
        .from("cfdi_pago_documentos")
        .insert({
          pago_id: pagoRow.id,
          cfdi_id: args.cfdiId,
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
          cfdi_padre_id: padre?.id ?? null,
        })
        .select("id")
        .single();
      idsDocs.push(docRow?.id ?? "");
      docsRelacionados += 1;
    }

    if (p.impuestos.length) {
      await supabase.from("cfdi_pago_impuestos").insert(
        p.impuestos.map((i) => ({
          pago_id: pagoRow.id,
          documento_id: i.documento_indice != null ? (idsDocs[i.documento_indice] || null) : null,
          ambito: i.ambito,
          tipo: i.tipo,
          impuesto: i.impuesto,
          base: i.base,
          tipo_factor: i.tipo_factor,
          tasa_cuota: i.tasa_cuota,
          importe: i.importe,
        })),
      );
    }
  }

  // 6. Clasificación documental sobre el propio documento.
  const clasificacion = clasificarDocumento(
    {
      uuid: enc.uuid ?? null,
      tipo_cfdi: enc.tipoComprobante ?? null,
      rfc_emisor: enc.emisor.rfc ?? null,
      rfc_receptor: enc.receptor.rfc ?? null,
      metodo_pago: enc.metodoPago ?? null,
      estatus_sat: null,
      detalle_reconstruible: true,
      avisos: n.avisos,
    },
    { rfcExpediente: args.rfcExpediente },
  );

  const periodo = periodoDeFecha(enc.fecha ?? null);

  await supabase
    .from("cfdi_xml")
    .update({
      xml_raw: args.guardarXml === false ? null : args.xml,
      detalle_reconstruible: args.guardarXml === false ? false : true,
      normalizado_at: new Date().toISOString(),
      normalizacion_version: NORMALIZACION_VERSION,
      periodo,
      direccion: clasificacion.direccion,
      clase_documental: clasificacion.clase,
      estado_relacion: enc.tipoComprobante === "P" ? "completo" : "no_aplica",
      estado_procesamiento: clasificacion.estado_procesamiento,
      motivos: clasificacion.motivos,
    })
    .eq("id", args.cfdiId);

  return {
    cfdi_id: args.cfdiId,
    periodo,
    impuestos: n.impuestos.length,
    pagos: n.pagos.length,
    documentos_relacionados: docsRelacionados,
    clasificacion,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluación y sincronización del periodo (idempotente).
// ─────────────────────────────────────────────────────────────────────────────

export async function cargarPeriodo(
  supabase: SupabaseClient,
  args: { clienteId: string; rfcExpediente: string; periodo: string },
): Promise<{ evaluacion: EvaluacionPeriodo; documentos: DocumentoPeriodo[]; corte: any }> {
  const desde = `${args.periodo}-01T00:00:00-06:00`;
  const hastaDate = new Date(`${args.periodo}-01T00:00:00Z`);
  hastaDate.setUTCMonth(hastaDate.getUTCMonth() + 1);
  const hasta = hastaDate.toISOString();

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

/** Sincroniza la bandeja de excepciones con la evaluación. Idempotente. */
export async function sincronizarExcepciones(
  supabase: SupabaseClient,
  args: { despachoId: string; clienteId: string; periodo: string; evaluacion: EvaluacionPeriodo },
): Promise<{ creadas: number; cerradas: number; vigentes: number }> {
  const { data: existentes } = await supabase
    .from("cierre_excepciones")
    .select("id, codigo, cfdi_id, estado")
    .eq("cliente_id", args.clienteId)
    .eq("periodo", args.periodo);

  const clave = (codigo: string, cfdi: string | null) => `${codigo}|${cfdi ?? ""}`;
  const mapa = new Map((existentes ?? []).map((e: any) => [clave(e.codigo, e.cfdi_id), e]));
  const vigentes = new Set(args.evaluacion.excepciones.map((e) => clave(e.codigo, e.cfdi_id)));

  const nuevas = args.evaluacion.excepciones
    .filter((e) => !mapa.has(clave(e.codigo, e.cfdi_id)))
    .map((e) => ({
      despacho_id: args.despachoId,
      cliente_id: args.clienteId,
      periodo: args.periodo,
      cfdi_id: e.cfdi_id,
      codigo: e.codigo,
      severidad: MOTIVOS_EXCEPCION[e.codigo].severidad,
      titulo: e.titulo,
      detalle: e.detalle as any,
      estado: "pendiente",
    }));
  if (nuevas.length) await supabase.from("cierre_excepciones").insert(nuevas);

  // Excepciones que ya no aplican y siguen pendientes: se retiran (la causa desapareció).
  const obsoletas = (existentes ?? [])
    .filter((e: any) => e.estado === "pendiente" && !vigentes.has(clave(e.codigo, e.cfdi_id)))
    .map((e: any) => e.id);
  if (obsoletas.length) await supabase.from("cierre_excepciones").delete().in("id", obsoletas);

  return { creadas: nuevas.length, cerradas: obsoletas.length, vigentes: vigentes.size };
}
