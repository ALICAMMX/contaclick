import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { ensureCuenta, sha256Hex } from "@/lib/conciliacion/conciliacion.server";
import { assertClienteScope } from "@/lib/despacho/scope";
import { aCentavos, ALGORITMO_VERSION, type EstadoConciliacion } from "@/lib/conciliacion/contrato";
import {
  conciliarUnoAUno,
  huellaEntrada,
  type CfdiEntrada,
  type EntradaMotor,
  type MovimientoEntrada,
} from "@/lib/conciliacion/motor";
import {
  parseClienteInput,
  parseDecisionGrupoInput,
  parseIgnorarMovimientoInput,
  parseListMovimientosInput,
  parseRunReconciliationInput,
  parseUploadMovimientosInput,
} from "@/lib/conciliacion/conciliacion.validators";

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

// ─────────────────────────────────────────────────────────────────────────────
// Carga de estados de cuenta con identidad de archivo
// ─────────────────────────────────────────────────────────────────────────────
export const uploadMovimientos = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(parseUploadMovimientosInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);
    const despachoId = scope.despacho_id;

    let cuentaId: string;
    if (data.cuenta_id) {
      const { data: cta, error: ctaErr } = await supabase
        .from("cuentas_bancarias")
        .select("id, cliente_id, banco, alias")
        .eq("id", data.cuenta_id)
        .maybeSingle();
      if (ctaErr || !cta) throw new Error("Cuenta bancaria no encontrada.");
      if (cta.cliente_id !== data.cliente_id) {
        throw new Error(
          `La cuenta seleccionada (${cta.banco} · ${cta.alias ?? ""}) pertenece a otro expediente. Para no mezclar contabilidades, la carga fue rechazada.`,
        );
      }
      cuentaId = data.cuenta_id;
    } else {
      if (!data.banco) throw new Error("Indica una cuenta existente o un banco para crearla.");
      cuentaId = await ensureCuenta(supabase, {
        despachoId,
        clienteId: data.cliente_id,
        banco: data.banco,
        alias: data.alias,
        mask: data.mask,
      });
    }

    // Reimportar el MISMO archivo es idempotente: no vuelve a insertar nada.
    const { data: previa } = await supabase
      .from("conciliacion_importaciones")
      .select("id, filas_insertadas, filas_totales, created_at")
      .eq("cuenta_id", cuentaId)
      .eq("archivo_sha256", data.archivo.sha256)
      .eq("estado", "completada")
      .maybeSingle();

    if (previa) {
      return {
        cuenta_id: cuentaId,
        importacion_id: previa.id as string,
        reimportacion: true,
        inserted: 0,
        duplicates: 0,
        duplicados_candidatos: 0,
        total: data.movimientos.length,
        mensaje: "Este archivo ya se había importado en esta cuenta. No se duplicó ningún movimiento.",
      };
    }

    const fechas = data.movimientos.map((m) => m.fecha).sort();
    const periodoDetectado = fechas.length ? fechas[Math.floor(fechas.length / 2)].slice(0, 7) : null;

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
        periodo_detectado: periodoDetectado,
        filas_totales: data.movimientos.length,
        estado: "procesando",
        actor: userId,
      })
      .select("id")
      .single();
    if (impErr || !imp) throw new Error(impErr?.message ?? "No se pudo registrar la importación.");
    const importacionId = imp.id as string;

    // Cada fila conserva su posición: dos operaciones legítimas idénticas
    // sobreviven como dos movimientos distintos.
    const filas = [];
    for (let i = 0; i < data.movimientos.length; i += 1) {
      const m = data.movimientos[i];
      const hash = await sha256Hex(
        `${cuentaId}|${m.fecha}|${m.cargo}|${m.abono}|${m.descripcion}|${m.referencia ?? ""}`,
      );
      filas.push({
        despacho_id: despachoId,
        cliente_id: data.cliente_id,
        cuenta_id: cuentaId,
        importacion_id: importacionId,
        fila_origen: i + 1,
        fecha: m.fecha,
        descripcion: m.descripcion,
        referencia: m.referencia,
        cargo: m.cargo,
        abono: m.abono,
        saldo: m.saldo,
        moneda: (m.moneda ?? "MXN").toUpperCase().slice(0, 3),
        hash,
      });
    }

    // Un archivo DIFERENTE con operaciones parecidas marca candidatos a
    // duplicado; jamás los elimina en silencio.
    const hashes = [...new Set(filas.map((f) => f.hash))];
    const { data: previos } = hashes.length
      ? await supabase
          .from("movimientos_bancarios")
          .select("id, hash")
          .eq("cuenta_id", cuentaId)
          .in("hash", hashes)
      : { data: [] as { id: string; hash: string }[] };
    const mapaPrevios = new Map((previos ?? []).map((p) => [p.hash as string, p.id as string]));

    const conMarca = filas.map((f) => ({
      ...f,
      duplicado_candidato_de: mapaPrevios.get(f.hash) ?? null,
    }));

    let inserted = 0;
    for (let i = 0; i < conMarca.length; i += 500) {
      const chunk = conMarca.slice(i, i + 500);
      const { error } = await supabase.from("movimientos_bancarios").insert(chunk);
      if (error) {
        await supabase
          .from("conciliacion_importaciones")
          .update({ estado: "fallida", error: error.message })
          .eq("id", importacionId);
        throw new Error(error.message);
      }
      inserted += chunk.length;
    }

    const duplicadosCandidatos = conMarca.filter((f) => f.duplicado_candidato_de).length;
    await supabase
      .from("conciliacion_importaciones")
      .update({ estado: "completada", filas_insertadas: inserted, filas_reimportadas: 0 })
      .eq("id", importacionId);

    return {
      cuenta_id: cuentaId,
      importacion_id: importacionId,
      reimportacion: false,
      inserted,
      duplicates: 0,
      duplicados_candidatos: duplicadosCandidatos,
      total: filas.length,
      mensaje:
        duplicadosCandidatos > 0
          ? `Se importaron ${inserted} movimientos. ${duplicadosCandidatos} se parecen a operaciones ya registradas y quedaron marcados como candidatos a duplicado para tu revisión.`
          : `Se importaron ${inserted} movimientos.`,
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
          "id, periodo, tipo, origen, estado, probabilidad_bp, importe_banco_centavos, importe_cfdi_centavos, diferencia_centavos, evidencia, motivo, confirmado_por, confirmado_at, rechazado_por, rechazado_at, created_at",
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
      .eq("cliente_id", data.cliente_id);
    let cfdiQ = supabase
      .from("cfdi_xml")
      .select("id, total, estatus_sat, tipo_cfdi, metodo_pago")
      .eq("cliente_id", data.cliente_id);
    let miembroQ = supabase
      .from("conciliaciones")
      .select("movimiento_id, cfdi_id, estado_grupo, periodo")
      .eq("cliente_id", data.cliente_id);

    if (data.periodo) {
      const { desde, hastaExclusivo } = rangoFechas(data.periodo);
      movQ = movQ.gte("fecha", desde).lt("fecha", hastaExclusivo);
      cfdiQ = cfdiQ.eq("periodo", data.periodo);
      miembroQ = miembroQ.eq("periodo", data.periodo);
    }

    const [{ data: movs }, { data: cfdis }, { data: miembros }] = await Promise.all([movQ, cfdiQ, miembroQ]);

    const evaluables = (movs ?? []).filter((m) => !m.no_fiscal && !m.ignorado_at);
    const ingresos = evaluables.reduce((a, m) => a + aCentavos(m.abono as number), 0);
    const egresos = evaluables.reduce((a, m) => a + aCentavos(m.cargo as number), 0);

    const porEstado = (estado: EstadoConciliacion) =>
      (miembros ?? []).filter((k) => String(k.estado_grupo) === estado);

    const confirmados = porEstado("confirmado");
    const propuestos = porEstado("propuesto");
    const movConfirmados = new Set(confirmados.map((k) => k.movimiento_id).filter(Boolean));
    const cfdiConfirmados = new Set(confirmados.map((k) => k.cfdi_id).filter(Boolean));

    const sinCfdi = evaluables.filter((m) => !movConfirmados.has(m.id)).length;
    const cfdiSinPago = (cfdis ?? []).filter((c) => !cfdiConfirmados.has(c.id)).length;
    // Cobertura operativa: movimientos confirmados / movimientos evaluables.
    const cobertura = evaluables.length ? Math.round((movConfirmados.size / evaluables.length) * 100) : 0;

    return {
      periodo: data.periodo ?? null,
      total_movimientos: evaluables.length,
      movimientos_ignorados: (movs ?? []).length - evaluables.length,
      total_cfdi: (cfdis ?? []).length,
      ingresos: ingresos / 100,
      egresos: egresos / 100,
      matched: movConfirmados.size,
      confirmados: confirmados.length,
      propuestos: propuestos.length,
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
    const apiKey = process.env.LOVABLE_API_KEY;
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
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
