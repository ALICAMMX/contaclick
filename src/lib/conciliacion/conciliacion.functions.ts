import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { ensureCuenta, sha256Hex } from "@/lib/conciliacion/conciliacion.server";
import { assertClienteScope } from "@/lib/despacho/scope";
import { aCentavos, ALGORITMO_VERSION, type EstadoConciliacion } from "@/lib/conciliacion/contrato";
import {
  analizarImportacion,
  incidenciasPorCodigo,
  periodoDominante,
  serializacionCanonica,
  PARSER_VERSION,
  type FilaImportacion,
  type Incidencia,
} from "@/lib/conciliacion/importacion";
import {
  conciliarUnoAUno,
  huellaEntrada,
  type CfdiEntrada,
  type EntradaMotor,
  type MovimientoEntrada,
} from "@/lib/conciliacion/motor";
import {
  parseClienteInput,
  parseConfirmarImportacionInput,
  parseDecisionGrupoInput,
  parseIgnorarMovimientoInput,
  parseImportacionIdInput,
  parseListarImportacionesInput,
  parseListMovimientosInput,
  parsePrevisualizarImportacionInput,
  parseRechazarImportacionInput,
  parseRunReconciliationInput,
} from "@/lib/conciliacion/conciliacion.validators";
import { aiFetch, aiApiKey } from "@/lib/ai/gateway";

/** Rango mensual semiabierto [inicio, inicio del mes siguiente) en fechas locales. */
function rangoFechas(periodo: string): { desde: string; hastaExclusivo: string } {
  const [y, m] = periodo.split("-").map(Number);
  const sigY = m === 12 ? y + 1 : y;
  const sigM = m === 12 ? 1 : m + 1;
  return {
    desde: `${periodo}-01`,
    hastaExclusivo: `${String(sigY).padStart(4, "0")}-${String(sigM).padStart(2, "0")}-01`,
  };
}

/** Muestra acotada para la vista previa: nunca el archivo completo. */
function muestraDe(filas: FilaImportacion[]) {
  return filas.slice(0, 12).map((f, i) => ({
    fila: i + 1,
    fecha: f.fecha,
    descripcion: (f.descripcion ?? "").slice(0, 60),
    cargo: Number(f.cargo) || 0,
    abono: Number(f.abono) || 0,
    saldo: f.saldo == null ? null : Number(f.saldo),
  }));
}

const SELECT_IMPORTACION =
  "id, cliente_id, cuenta_id, estado, bloqueada, archivo_nombre, archivo_sha256, archivo_bytes, formato, " +
  "parser_version, periodo_declarado, periodo_detectado, filas_hash, filas_totales, filas_insertadas, " +
  "filas_reimportadas, candidatos_duplicado, resumen, incidencias, error, actor, created_at, " +
  "validada_por, validada_at, rechazada_por, rechazada_at, motivo_rechazo";

// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 1 — Vista previa: interpreta, mide y deja la importación PENDIENTE.
// Ningún movimiento cargado aquí puede conciliarse ni contabilizarse.
// ─────────────────────────────────────────────────────────────────────────────
export const previsualizarImportacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(parsePrevisualizarImportacionInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);
    const despachoId = scope.despacho_id;

    let cuentaId: string;
    let cuentaEtiqueta: string;
    if (data.cuenta_id) {
      const { data: cta, error: ctaErr } = await supabase
        .from("cuentas_bancarias")
        .select("id, cliente_id, banco, alias, numero_cuenta_mask")
        .eq("id", data.cuenta_id)
        .maybeSingle();
      if (ctaErr || !cta) throw new Error("Cuenta bancaria no encontrada.");
      if (cta.cliente_id !== data.cliente_id) {
        throw new Error(
          `La cuenta seleccionada (${cta.banco} · ${cta.alias ?? ""}) pertenece a otro expediente. Para no mezclar contabilidades, la carga fue rechazada.`,
        );
      }
      cuentaId = data.cuenta_id;
      cuentaEtiqueta = `${cta.banco} · ${cta.alias ?? ""}`.trim();
    } else {
      if (!data.banco) throw new Error("Indica una cuenta existente o un banco para crearla.");
      cuentaId = await ensureCuenta(supabase, {
        despachoId,
        clienteId: data.cliente_id,
        banco: data.banco,
        alias: data.alias,
        mask: data.mask,
      });
      cuentaEtiqueta = `${data.banco} · ${data.alias ?? "Principal"}`;
    }

    // Reimportar el MISMO archivo en la misma cuenta es idempotente.
    const { data: previaRow } = await supabase
      .from("conciliacion_importaciones")
      .select(SELECT_IMPORTACION)
      .eq("cuenta_id", cuentaId)
      .eq("archivo_sha256", data.archivo.sha256)
      .in("estado", ["procesando", "pendiente_validacion", "validada"])
      .maybeSingle();
    const previa = previaRow as any;

    if (previa) {
      return {
        cuenta_id: cuentaId,
        cuenta_etiqueta: cuentaEtiqueta,
        importacion: previa,
        muestra: muestraDe(data.movimientos as FilaImportacion[]),
        reimportacion: true,
        mensaje:
          previa.estado === "validada"
            ? "Este archivo ya fue validado en esta cuenta. No se duplicó ningún movimiento."
            : "Este archivo ya tiene una vista previa pendiente de validación en esta cuenta.",
      };
    }

    const filas: FilaImportacion[] = data.movimientos.map((m) => ({
      fecha: m.fecha,
      descripcion: m.descripcion,
      referencia: m.referencia,
      cargo: m.cargo,
      abono: m.abono,
      saldo: m.saldo,
      moneda: m.moneda,
    }));

    const periodoDeclarado = data.periodo_declarado ?? data.deteccion?.periodo ?? periodoDominante(filas);
    const analisis = analizarImportacion({
      movimientos: filas,
      periodo_declarado: periodoDeclarado,
      cuenta_seleccionada: true,
      periodo_rango:
        data.deteccion?.periodo_inicio && data.deteccion?.periodo_fin
          ? { inicio: data.deteccion.periodo_inicio, fin: data.deteccion.periodo_fin }
          : null,
    });
    // Trazabilidad del lector: banco, adaptador, huella, saldos y filas.
    const resumenConTraza = data.deteccion
      ? { ...analisis.resumen, adaptador: { ...data.deteccion, validacion: data.deteccion.auto ? "automatica" : "humana" } }
      : analisis.resumen;

    const filasHash = await sha256Hex(serializacionCanonica(filas));

    const { data: imp, error: impErr } = await supabase
      .from("conciliacion_importaciones")
      .insert({
        despacho_id: despachoId,
        cliente_id: data.cliente_id,
        cuenta_id: cuentaId,
        archivo_sha256: data.archivo.sha256,
        archivo_nombre: data.archivo.nombre,
        archivo_bytes: data.archivo.bytes,
        formato: data.archivo.formato,
        parser_version: PARSER_VERSION,
        periodo_declarado: periodoDeclarado ?? null,
        periodo_detectado: periodoDominante(filas),
        filas_hash: filasHash,
        filas_totales: filas.length,
        estado: "procesando",
        actor: userId,
      })
      .select("id")
      .single();
    if (impErr || !imp) throw new Error(impErr?.message ?? "No se pudo registrar la importación.");
    const importacionId = imp.id as string;

    const incidencias: Incidencia[] = [...analisis.incidencias];
    let insertadas = 0;
    let candidatos = 0;

    try {
      if (!analisis.bloqueada) {
        // Cada fila conserva su posición: dos operaciones legítimas idénticas
        // dentro del mismo archivo sobreviven como dos movimientos distintos.
        const preparadas = [];
        for (let i = 0; i < filas.length; i += 1) {
          const m = filas[i];
          const hash = await sha256Hex(
            `${cuentaId}|${m.fecha}|${m.cargo}|${m.abono}|${m.descripcion}|${m.referencia ?? ""}`,
          );
          preparadas.push({
            despacho_id: despachoId,
            cliente_id: data.cliente_id,
            cuenta_id: cuentaId,
            importacion_id: importacionId,
            fila_origen: i + 1,
            fecha: m.fecha,
            descripcion: m.descripcion,
            referencia: m.referencia,
            cargo: aCentavos(m.cargo) / 100,
            abono: aCentavos(m.abono) / 100,
            saldo: m.saldo,
            moneda: (m.moneda ?? "MXN").toUpperCase().slice(0, 3),
            hash,
            duplicado_candidato_de: null as string | null,
          });
        }

        // Coincidencia con OTRO archivo: se marca como candidata a duplicado y
        // se conserva. Sólo una persona puede excluirla.
        const hashes = [...new Set(preparadas.map((f) => f.hash))];
        const { data: previos } = hashes.length
          ? await supabase
              .from("movimientos_bancarios")
              .select("id, hash, importacion_id")
              .eq("cuenta_id", cuentaId)
              .in("hash", hashes)
          : { data: [] as { id: string; hash: string; importacion_id: string | null }[] };
        const mapaPrevios = new Map(
          (previos ?? [])
            .filter((p) => p.importacion_id !== importacionId)
            .map((p) => [p.hash as string, p.id as string]),
        );
        for (const fila of preparadas) {
          const gemelo = mapaPrevios.get(fila.hash);
          if (gemelo) {
            fila.duplicado_candidato_de = gemelo;
            candidatos += 1;
          }
        }
        if (candidatos > 0) {
          incidencias.push({
            codigo: "DUPLICADO_ENTRE_ARCHIVOS",
            severidad: "aviso",
            fila: null,
            mensaje: `${candidatos} movimiento(s) coinciden con otra importación de la misma cuenta. Se conservan marcados como candidatos a duplicado; ninguno se eliminó automáticamente.`,
          });
        }

        for (let i = 0; i < preparadas.length; i += 500) {
          const chunk = preparadas.slice(i, i + 500);
          const { error } = await supabase.from("movimientos_bancarios").insert(chunk);
          if (error) throw new Error(error.message);
          insertadas += chunk.length;
        }
      }
    } catch (e) {
      await supabase
        .from("movimientos_bancarios")
        .delete()
        .eq("importacion_id", importacionId)
        .is("validado_at", null);
      await supabase
        .from("conciliacion_importaciones")
        .update({ estado: "fallida", error: (e as Error).message, filas_insertadas: 0 })
        .eq("id", importacionId);
      throw new Error(
        `No se pudo preparar la vista previa: ${(e as Error).message}. No quedó ningún movimiento cargado.`,
      );
    }

    const { data: actualizada, error: updErr } = await supabase
      .from("conciliacion_importaciones")
      .update({
        estado: "pendiente_validacion",
        bloqueada: analisis.bloqueada,
        resumen: resumenConTraza as never,
        incidencias: incidencias as never,
        filas_insertadas: insertadas,
        candidatos_duplicado: candidatos,
      })
      .eq("id", importacionId)
      .select(SELECT_IMPORTACION)
      .single();
    if (updErr) throw new Error(updErr.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("conciliacion_importacion_bitacora").insert({
      despacho_id: despachoId,
      cliente_id: data.cliente_id,
      importacion_id: importacionId,
      estado_anterior: "procesando",
      estado_nuevo: "pendiente_validacion",
      actor: userId,
      detalle: {
        parser_version: PARSER_VERSION,
        filas: filas.length,
        bloqueada: analisis.bloqueada,
        incidencias: incidenciasPorCodigo(incidencias),
        adaptador: data.deteccion
          ? {
              banco: data.deteccion.banco,
              adaptador: data.deteccion.adaptador,
              version: data.deteccion.version,
              huella: data.deteccion.huella,
              confianza: data.deteccion.confianza,
              auto: data.deteccion.auto,
              diferencia: data.deteccion.calculado.diferencia,
            }
          : null,
      },
    });

    const auto = !!data.deteccion?.auto && !analisis.bloqueada;
    return {
      cuenta_id: cuentaId,
      cuenta_etiqueta: cuentaEtiqueta,
      importacion: actualizada,
      muestra: muestraDe(filas),
      reimportacion: false,
      auto,
      mensaje: analisis.bloqueada
        ? "La lectura tiene incidencias que impiden incorporar el archivo. Revisa el detalle."
        : auto
          ? `PDF ${data.deteccion!.banco} validado: ${filas.length} movimientos, ${data.deteccion!.calculado.cargos.toLocaleString("es-MX", { style: "currency", currency: "MXN" })} en cargos y ${data.deteccion!.calculado.abonos.toLocaleString("es-MX", { style: "currency", currency: "MXN" })} en abonos. Los saldos cuadran con el estado de cuenta.`
          : "Vista previa lista. Compara los totales con tu estado de cuenta antes de confirmar.",
    };

  });

// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 2 — Confirmación humana: sella exactamente las filas previsualizadas.
// ─────────────────────────────────────────────────────────────────────────────
export const confirmarImportacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(parseConfirmarImportacionInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClienteScope(supabase as any, userId, data.cliente_id);

    const { data: imp, error } = await supabase
      .from("conciliacion_importaciones")
      .select("id, cliente_id")
      .eq("id", data.importacion_id)
      .maybeSingle();
    if (error || !imp) throw new Error("Importación no encontrada.");
    if (imp.cliente_id !== data.cliente_id) {
      throw new Error("La importación pertenece a otro expediente. La operación fue rechazada.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error: rpcErr } = await (supabaseAdmin as any).rpc(
      "conciliacion_importacion_validar",
      {
        _importacion_id: data.importacion_id,
        _actor: userId,
        _archivo_sha256: data.archivo_sha256,
        _parser_version: data.parser_version,
        _filas_hash: data.filas_hash,
      },
    );
    if (rpcErr) throw new Error(rpcErr.message);
    return res;
  });

export const rechazarImportacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(parseRechazarImportacionInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClienteScope(supabase as any, userId, data.cliente_id);

    const { data: imp, error } = await supabase
      .from("conciliacion_importaciones")
      .select("id, cliente_id")
      .eq("id", data.importacion_id)
      .maybeSingle();
    if (error || !imp) throw new Error("Importación no encontrada.");
    if (imp.cliente_id !== data.cliente_id) {
      throw new Error("La importación pertenece a otro expediente. La operación fue rechazada.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error: rpcErr } = await (supabaseAdmin as any).rpc(
      "conciliacion_importacion_rechazar",
      { _importacion_id: data.importacion_id, _actor: userId, _motivo: data.motivo },
    );
    if (rpcErr) throw new Error(rpcErr.message);
    return res;
  });

export const listarImportaciones = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(parseListarImportacionesInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertClienteScope(supabase as any, context.userId, data.cliente_id);
    let q = supabase
      .from("conciliacion_importaciones")
      .select(SELECT_IMPORTACION)
      .eq("cliente_id", data.cliente_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.periodo) q = q.eq("periodo_declarado", data.periodo);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { importaciones: rows ?? [] };
  });

/**
 * Diagnóstico para soporte: cifras y códigos, jamás nombres, cuentas,
 * descripciones, referencias ni movimientos.
 */
export const diagnosticoImportacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(parseImportacionIdInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertClienteScope(supabase as any, context.userId, data.cliente_id);
    const { data: impRow, error } = await supabase
      .from("conciliacion_importaciones")
      .select(SELECT_IMPORTACION)
      .eq("id", data.importacion_id)
      .maybeSingle();
    const imp = impRow as any;
    if (error || !imp) throw new Error("Importación no encontrada.");
    if (imp.cliente_id !== data.cliente_id) throw new Error("La importación pertenece a otro expediente.");

    const resumen = (imp.resumen ?? {}) as Record<string, unknown>;
    return {
      importacion_id: imp.id,
      estado: imp.estado,
      bloqueada: imp.bloqueada,
      parser_version: imp.parser_version,
      huella_abreviada: String(imp.archivo_sha256 ?? "").slice(0, 12),
      formato: imp.formato,
      periodo: imp.periodo_declarado ?? imp.periodo_detectado ?? null,
      movimientos: resumen.movimientos ?? 0,
      cargos_num: resumen.cargos_num ?? 0,
      cargos_centavos: resumen.cargos_centavos ?? 0,
      abonos_num: resumen.abonos_num ?? 0,
      abonos_centavos: resumen.abonos_centavos ?? 0,
      saldo_inicial_centavos: resumen.saldo_inicial_centavos ?? null,
      saldo_final_centavos: resumen.saldo_final_centavos ?? null,
      diferencia_centavos: resumen.diferencia_centavos ?? null,
      fecha_min: resumen.fecha_min ?? null,
      fecha_max: resumen.fecha_max ?? null,
      incidencias_por_codigo: incidenciasPorCodigo((imp.incidencias ?? []) as Incidencia[]),
      candidatos_duplicado: imp.candidatos_duplicado ?? 0,
      created_at: imp.created_at,
    };
  });


// ─────────────────────────────────────────────────────────────────────────────
// Listado canónico del periodo
// ─────────────────────────────────────────────────────────────────────────────
export const listMovimientos = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(parseListMovimientosInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertClienteScope(supabase as any, context.userId, data.cliente_id);
    const { desde, hastaExclusivo } = rangoFechas(data.periodo);

    let q = supabase
      .from("movimientos_bancarios")
      .select(
        "id, fecha, descripcion, referencia, cargo, abono, saldo, cuenta_id, importe_centavos, moneda, no_fiscal, ignorado_motivo, ignorado_at, duplicado_candidato_de, fila_origen",
      )
      .eq("cliente_id", data.cliente_id)
      .gte("fecha", desde)
      .lt("fecha", hastaExclusivo)
      .order("fecha", { ascending: false })
      .limit(data.limit);
    if (data.cuenta_id) q = q.eq("cuenta_id", data.cuenta_id);
    const { data: movimientos, error } = await q;
    if (error) throw new Error(error.message);

    const [{ data: grupos }, { data: miembros }, { data: cuentas }] = await Promise.all([
      supabase
        .from("conciliacion_grupos")
        .select(
          "id, periodo, tipo, origen, estado, nivel_propuesta, probabilidad_bp, importe_banco_centavos, importe_cfdi_centavos, diferencia_centavos, evidencia, motivo, confirmado_por, confirmado_at, rechazado_por, rechazado_at, created_at",
        )
        .eq("cliente_id", data.cliente_id)
        .eq("periodo", data.periodo)
        .order("created_at", { ascending: false }),
      supabase
        .from("conciliaciones")
        .select("id, grupo_id, movimiento_id, cfdi_id, asignado_centavos, estado_grupo")
        .eq("cliente_id", data.cliente_id)
        .eq("periodo", data.periodo),
      supabase
        .from("cuentas_bancarias")
        .select("id, banco, alias, numero_cuenta_mask")
        .eq("cliente_id", data.cliente_id),
    ]);

    const cfdiIds = [...new Set((miembros ?? []).map((m) => m.cfdi_id).filter(Boolean) as string[])];
    const { data: cfdis } = cfdiIds.length
      ? await supabase
          .from("cfdi_xml")
          .select("id, uuid, fecha, total, direccion, tipo_cfdi, metodo_pago, estatus_sat, nombre_emisor, nombre_receptor")
          .in("id", cfdiIds)
      : { data: [] as any[] };

    return {
      periodo: data.periodo,
      movimientos: movimientos ?? [],
      grupos: grupos ?? [],
      miembros: miembros ?? [],
      cfdi: cfdis ?? [],
      cuentas: cuentas ?? [],
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Motor: la función servidora sólo arma el insumo y persiste por RPC
// ─────────────────────────────────────────────────────────────────────────────
export const runReconciliation = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(parseRunReconciliationInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const scope = await assertClienteScope(supabase as any, context.userId, data.cliente_id);
    const clienteId = scope.cliente_id;
    const rfc = (scope.rfc ?? "").toUpperCase();
    const { desde, hastaExclusivo } = rangoFechas(data.periodo);

    const [{ data: movs }, { data: cfdis }, { data: miembros }] = await Promise.all([
      supabase
        .from("movimientos_bancarios")
        .select("id, fecha, cargo, abono, descripcion, referencia, moneda, no_fiscal, ignorado_at, importe_centavos")
        .eq("cliente_id", clienteId)
        // Candado: sólo movimientos cuya importación validó una persona.
        .not("validado_at", "is", null)
        .gte("fecha", desde)
        .lt("fecha", hastaExclusivo),
      supabase
        .from("cfdi_xml")
        .select(
          "id, uuid, fecha, total, direccion, tipo_cfdi, metodo_pago, estatus_sat, moneda, rfc_emisor, rfc_receptor, nombre_emisor, nombre_receptor",
        )
        .eq("cliente_id", clienteId)
        .eq("periodo", data.periodo),
      supabase
        .from("conciliaciones")
        .select("movimiento_id, cfdi_id, estado_grupo")
        .eq("cliente_id", clienteId),
    ]);

    const movimientos: MovimientoEntrada[] = (movs ?? []).map((m) => {
      const abono = Number(m.abono ?? 0);
      const cargo = Number(m.cargo ?? 0);
      const esAbono = abono > 0;
      return {
        id: m.id as string,
        fecha: String(m.fecha).slice(0, 10),
        importe_centavos: Number(m.importe_centavos ?? aCentavos(esAbono ? abono : cargo)),
        direccion: esAbono ? "abono" : "cargo",
        descripcion: (m.descripcion as string) ?? null,
        referencia: (m.referencia as string) ?? null,
        moneda: (m.moneda as string) ?? "MXN",
        ignorado: !!m.ignorado_at,
        no_fiscal: !!m.no_fiscal,
      };
    });

    const cfdi: CfdiEntrada[] = (cfdis ?? []).map((c) => {
      const emitido =
        (c.direccion as string) === "emitido" ||
        (!c.direccion && (c.rfc_emisor as string)?.toUpperCase() === rfc);
      return {
        id: c.id as string,
        uuid: (c.uuid as string) ?? null,
        fecha: String(c.fecha).slice(0, 10),
        total_centavos: aCentavos(c.total as number),
        direccion: emitido ? "emitido" : "recibido",
        tipo_cfdi: (c.tipo_cfdi as string) ?? null,
        metodo_pago: (c.metodo_pago as string) ?? null,
        estatus_sat: (c.estatus_sat as string) ?? null,
        moneda: (c.moneda as string) ?? "MXN",
        rfc_contraparte: (emitido ? (c.rfc_receptor as string) : (c.rfc_emisor as string)) ?? null,
        nombre_contraparte: (emitido ? (c.nombre_receptor as string) : (c.nombre_emisor as string)) ?? null,
      };
    });

    const activos = (miembros ?? []).filter((k) =>
      ["propuesto", "confirmado"].includes(String(k.estado_grupo)),
    );
    const rechazados = (miembros ?? []).filter((k) =>
      ["rechazado", "ignorado"].includes(String(k.estado_grupo)),
    );

    const entrada: EntradaMotor = {
      movimientos,
      cfdi,
      movimientos_bloqueados: activos.map((k) => k.movimiento_id as string).filter(Boolean),
      cfdi_bloqueados: activos.map((k) => k.cfdi_id as string).filter(Boolean),
      pares_rechazados: rechazados
        .filter((k) => k.movimiento_id && k.cfdi_id)
        .map((k) => `${k.movimiento_id}|${k.cfdi_id}`),
      parametros: { dias_ventana: data.dias_ventana, tolerancia_centavos: data.tolerancia_centavos },
    };

    const resultado = conciliarUnoAUno(entrada);
    const inputHash = huellaEntrada(entrada, data.periodo);
    const idempotencyKey = `${ALGORITMO_VERSION}:${data.periodo}:${inputHash}`;

    // El escritor de corridas está revocado para el navegador: sólo el servidor
    // interno (llave de servicio) puede invocarlo, y siempre con el actor real.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rpc, error: rpcErr } = await (supabaseAdmin as any).rpc("conciliacion_ejecutar_corrida", {
      _cliente_id: clienteId,
      _periodo: data.periodo,
      _actor: context.userId,
      _idempotency_key: idempotencyKey,
      _input_hash: inputHash,
      _algoritmo_version: ALGORITMO_VERSION,
      _parametros: resultado.parametros,
      _dias_ventana: resultado.parametros.dias_ventana,
      _grupos: resultado.grupos.map((g) => ({
        tipo: g.tipo,
        movimiento_id: g.movimiento_id,
        cfdi_id: g.cfdi_id,
        estado: g.estado,
        nivel_propuesta: g.nivel_propuesta,
        probabilidad_bp: g.probabilidad_bp,
        importe_banco_centavos: g.importe_banco_centavos,
        importe_cfdi_centavos: g.importe_cfdi_centavos,
        diferencia_centavos: g.diferencia_centavos,
        evidencia: g.evidencia,
        motivo: g.motivo,
        idempotency_key: g.idempotency_key,
      })),
    });
    if (rpcErr) throw new Error(rpcErr.message);


    return {
      periodo: data.periodo,
      version: resultado.version,
      input_hash: inputHash,
      corrida: rpc ?? null,
      metricas: resultado.metricas,
      movimientos_sin_candidato: resultado.movimientos_sin_candidato.length,
      cfdi_sin_movimiento: resultado.cfdi_sin_movimiento.length,
      exclusiones: resultado.exclusiones,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Decisiones humanas (todas por procedimiento atómico con actor real)
// ─────────────────────────────────────────────────────────────────────────────
export const decidirGrupo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(parseDecisionGrupoInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertClienteScope(supabase as any, context.userId, data.cliente_id);

    // El grupo debe pertenecer al expediente autorizado.
    const { data: grupo, error: gErr } = await supabase
      .from("conciliacion_grupos")
      .select("id, cliente_id")
      .eq("id", data.grupo_id)
      .maybeSingle();
    if (gErr || !grupo) throw new Error("Grupo de conciliación no encontrado.");
    if (grupo.cliente_id !== data.cliente_id) {
      throw new Error("El grupo pertenece a otro expediente. La operación fue rechazada.");
    }

    const fn =
      data.accion === "confirmar"
        ? "conciliacion_confirmar_grupo"
        : data.accion === "rechazar"
          ? "conciliacion_rechazar_grupo"
          : "conciliacion_revertir_grupo";

    const { data: res, error } = await (supabase as any).rpc(fn, {
      _grupo_id: data.grupo_id,
      _motivo: data.motivo ?? null,
    });
    if (error) throw new Error(error.message);
    return res ?? { ok: true };
  });

export const ignorarMovimiento = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(parseIgnorarMovimientoInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertClienteScope(supabase as any, context.userId, data.cliente_id);
    const { data: mov, error: mErr } = await supabase
      .from("movimientos_bancarios")
      .select("id, cliente_id")
      .eq("id", data.movimiento_id)
      .maybeSingle();
    if (mErr || !mov) throw new Error("Movimiento bancario no encontrado.");
    if (mov.cliente_id !== data.cliente_id) {
      throw new Error("El movimiento pertenece a otro expediente. La operación fue rechazada.");
    }
    const { data: res, error } = await (supabase as any).rpc("conciliacion_ignorar_movimiento", {
      _movimiento_id: data.movimiento_id,
      _motivo: data.motivo,
      _no_fiscal: data.no_fiscal,
    });
    if (error) throw new Error(error.message);
    return res ?? { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores operativos (nunca "precisión" inventada)
// ─────────────────────────────────────────────────────────────────────────────
export const getReconciliationStats = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(parseClienteInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertClienteScope(supabase as any, context.userId, data.cliente_id);

    let movQ = supabase
      .from("movimientos_bancarios")
      .select("id, cargo, abono, importe_centavos, no_fiscal, ignorado_at")
      .eq("cliente_id", data.cliente_id)
      .not("validado_at", "is", null);
    let cfdiQ = supabase
      .from("cfdi_xml")
      .select("id, total, estatus_sat, tipo_cfdi, metodo_pago")
      .eq("cliente_id", data.cliente_id);
    let miembroQ = supabase
      .from("conciliaciones")
      .select("movimiento_id, cfdi_id, estado_grupo, periodo")
      .eq("cliente_id", data.cliente_id);
    let gruposQ = supabase
      .from("conciliacion_grupos")
      .select("id, estado, nivel_propuesta, confirmado_por, periodo")
      .eq("cliente_id", data.cliente_id);

    if (data.periodo) {
      const { desde, hastaExclusivo } = rangoFechas(data.periodo);
      movQ = movQ.gte("fecha", desde).lt("fecha", hastaExclusivo);
      cfdiQ = cfdiQ.eq("periodo", data.periodo);
      miembroQ = miembroQ.eq("periodo", data.periodo);
      gruposQ = gruposQ.eq("periodo", data.periodo);
    }

    const [{ data: movs }, { data: cfdis }, { data: miembros }, { data: grupos }] = await Promise.all([
      movQ,
      cfdiQ,
      miembroQ,
      gruposQ,
    ]);

    const evaluables = (movs ?? []).filter((m) => !m.no_fiscal && !m.ignorado_at);
    const ingresos = evaluables.reduce((a, m) => a + aCentavos(m.abono as number), 0);
    const egresos = evaluables.reduce((a, m) => a + aCentavos(m.cargo as number), 0);

    const porEstado = (estado: EstadoConciliacion) =>
      (miembros ?? []).filter((k) => String(k.estado_grupo) === estado);

    // Sólo cuenta como conciliado lo confirmado por una persona identificada.
    const gruposHumanos = new Set(
      (grupos ?? []).filter((g) => g.estado === "confirmado" && g.confirmado_por).map((g) => g.id as string),
    );
    const confirmados = porEstado("confirmado");
    const propuestos = porEstado("propuesto");
    const altaConfianza = (grupos ?? []).filter(
      (g) => g.estado === "propuesto" && g.nivel_propuesta === "automatica_alta_confianza",
    ).length;
    const movConfirmados = new Set(confirmados.map((k) => k.movimiento_id).filter(Boolean));
    const cfdiConfirmados = new Set(confirmados.map((k) => k.cfdi_id).filter(Boolean));

    const sinCfdi = evaluables.filter((m) => !movConfirmados.has(m.id)).length;
    const cfdiSinPago = (cfdis ?? []).filter((c) => !cfdiConfirmados.has(c.id)).length;
    // Cobertura operativa: movimientos confirmados por persona / movimientos evaluables.
    const cobertura = evaluables.length ? Math.round((movConfirmados.size / evaluables.length) * 100) : 0;

    return {
      periodo: data.periodo ?? null,
      total_movimientos: evaluables.length,
      movimientos_ignorados: (movs ?? []).length - evaluables.length,
      total_cfdi: (cfdis ?? []).length,
      ingresos: ingresos / 100,
      egresos: egresos / 100,
      matched: movConfirmados.size,
      /** Confirmaciones humanas: la única medida que el cierre reconoce. */
      confirmados: confirmados.length,
      confirmaciones_humanas: gruposHumanos.size,
      propuestos: propuestos.length,
      propuestas_alta_confianza: altaConfianza,
      rechazados: porEstado("rechazado").length,
      ignorados: porEstado("ignorado").length,
      sinCfdi,
      cfdiSinPago,
      /** Conservados por compatibilidad de la interfaz: confirmados y propuestos. */
      exactos: confirmados.length,
      probables: propuestos.length,
      /** Cobertura operativa, NO precisión: no existe verdad de prueba en datos reales. */
      tasa: cobertura,
      cobertura,
    };
  });


// ─────────────────────────────────────────────────────────────────────────────
// Lectura de IA: sólo redacta un resumen; NUNCA decide coincidencias
// ─────────────────────────────────────────────────────────────────────────────
export const analyzeReconciliationAI = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(parseClienteInput)
  .handler(async ({ data, context }) => {
    const apiKey = aiApiKey();
    if (!apiKey) return { error: "IA no configurada", content: "" };

    const { supabase } = context;
    const scope = await assertClienteScope(supabase as any, context.userId, data.cliente_id);
    const [{ data: movs }, { data: cfdis }, { data: grupos }] = await Promise.all([
      supabase.from("movimientos_bancarios").select("fecha, descripcion, cargo, abono").eq("cliente_id", scope.cliente_id).limit(50),
      supabase.from("cfdi_xml").select("uuid, tipo_cfdi, fecha, total, rfc_emisor, rfc_receptor").eq("cliente_id", scope.cliente_id).limit(50),
      supabase.from("conciliacion_grupos").select("estado, origen, diferencia_centavos, motivo").eq("cliente_id", scope.cliente_id).limit(100),
    ]);

    const prompt = `Eres contador fiscalista mexicano. Analiza esta conciliación bancaria y entrega:
1) Resumen ejecutivo (1 párrafo)
2) Riesgos fiscales detectados (depósitos sin CFDI, posibles ingresos omitidos, duplicidades)
3) 3 acciones recomendadas concretas
4) Una carta corta (3 líneas) para el cliente

No decidas coincidencias ni afirmes que algo está conciliado: sólo cuenta confirmado.

Datos:
Movimientos: ${JSON.stringify(movs?.slice(0, 30))}
CFDIs: ${JSON.stringify(cfdis?.slice(0, 30))}
Grupos de conciliación: ${JSON.stringify(grupos?.slice(0, 30))}

Responde en español, formato markdown, conciso.`;

    try {
      const res = await aiFetch("chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Eres ContaClick IA, contador fiscalista mexicano experto en conciliaciones bancarias y SAT." },
            { role: "user", content: prompt },
          ],
          max_tokens: 8000,
          maxOutputTokens: 8000,
        }),
      });
      if (res.status === 429) return { error: "Demasiadas solicitudes.", content: "" };
      if (res.status === 402) return { error: "Sin créditos de IA.", content: "" };
      if (!res.ok) return { error: "Error del servicio de IA.", content: "" };
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { error: null as string | null, content: json.choices?.[0]?.message?.content ?? "" };
    } catch (e) {
      console.error("analyzeReconciliationAI", e);
      return { error: "Error de red.", content: "" };
    }
  });
