// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 2 · FUENTE ÚNICA de pólizas contables.
//
// `poliza_renglones` (centavos enteros) es la única fuente contable.
// `metadata.asientos` quedó como formato LEGADO de sólo lectura: la base
// rechaza cualquier escritura nueva sobre ese campo.
//
// Ninguna función de aplicación cambia `polizas.estado` directamente: generar,
// regenerar, aprobar y rechazar pasan por `poliza_generar_borrador`,
// `poliza_aprobar` y `poliza_rechazar` (SECURITY DEFINER).
//
// /app/polizas y el Centro de Cierre leen y escriben esto mismo (generarBorradoresDelPeriodo).
// ─────────────────────────────────────────────────────────────────────────────
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import { elegirCuentasSistema, type CuentaCatalogo } from "./cuentas";
import {
  construirBorradorCfdi,
  llaveIdempotencia,
  CUENTA_POR_IDENTIFICAR,
  type ConceptoCfdi,
  type ResolucionConcepto,
} from "./motor";
import { aPolizaExportable, validarLote, type LotePolizasExportable } from "./exportacion";
import type { NivelEvidencia } from "./evidencia";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo con formato AAAA-MM");
const motivoSchema = z.string().min(10, "Se exige un motivo de al menos 10 caracteres.").max(1000);

const cent = (n: unknown) => Math.round(Number(n ?? 0) * 100);

const SELECT_POLIZA =
  "id, fecha, periodo, tipo, concepto, estado, version, origen, referencia, uuid_cfdi, nivel_evidencia, evidencia_detalle, input_hash, idempotency_key, rechazo_motivo, aprobada_por, aprobada_at, created_at, poliza_renglones(id, numero, cuenta, cuenta_nombre, concepto, cargo_centavos, abono_centavos, cfdi_id, movimiento_bancario_id)";

/** Bloqueos derivados de los renglones canónicos (nunca de metadata). */
function analizar(p: any) {
  const renglones = (p.poliza_renglones ?? []) as any[];
  const cargos = renglones.reduce((s, r) => s + Number(r.cargo_centavos ?? 0), 0);
  const abonos = renglones.reduce((s, r) => s + Number(r.abono_centavos ?? 0), 0);
  const porIdentificar = renglones.filter((r) => /por identificar/i.test(String(r.cuenta ?? ""))).length;
  const bloqueos: string[] = [];
  if (renglones.length < 2) bloqueos.push("La póliza necesita al menos dos renglones.");
  if (cargos !== abonos) bloqueos.push(`No puede aprobarse: descuadre de ${Math.abs(cargos - abonos)} centavos.`);
  if (porIdentificar > 0) {
    bloqueos.push(
      porIdentificar === 1
        ? "No puede aprobarse: contiene una cuenta por identificar."
        : `No puede aprobarse: contiene ${porIdentificar} cuentas por identificar.`,
    );
  }
  return {
    ...p,
    cargos_centavos: cargos,
    abonos_centavos: abonos,
    diferencia_centavos: cargos - abonos,
    conceptos_sin_resolver: porIdentificar,
    bloqueos,
    aprobable: bloqueos.length === 0 && p.estado === "borrador",
  };
}

/** Versión de reglas del expediente: cambia al cambiar cualquier regla activa. */
async function versionReglas(supabase: any, cliente_id: string): Promise<string> {
  const { data } = await supabase
    .from("reglas_concepto")
    .select("id, updated_at")
    .eq("cliente_id", cliente_id)
    .eq("activa", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  const ultima = (data ?? [])[0];
  const { count } = await supabase
    .from("reglas_concepto")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", cliente_id)
    .eq("activa", true);
  return `r${count ?? 0}@${String(ultima?.updated_at ?? "sin-reglas").slice(0, 19)}`;
}

// ───────────────────────────── Lectura unificada ─────────────────────────────
export const listarPolizasCanonicas = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        periodo: periodoSchema.optional(),
        estado: z.enum(["borrador", "aprobada", "rechazada", "confirmada"]).optional(),
        limit: z.number().int().min(1).max(500).default(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    let q = supabase
      .from("polizas")
      .select(SELECT_POLIZA)
      .eq("cliente_id", scope.cliente_id)
      .order("fecha", { ascending: false })
      .limit(data.limit);
    if (data.periodo) q = q.eq("periodo", data.periodo);
    if (data.estado) q = q.eq("estado", data.estado);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const polizas = (rows ?? []).map(analizar);
    return {
      polizas,
      resumen: {
        total: polizas.length,
        borradores: polizas.filter((p) => p.estado === "borrador").length,
        por_revisar: polizas.filter((p) => p.estado === "borrador" && p.aprobable).length,
        bloqueadas: polizas.filter((p) => p.estado === "borrador" && !p.aprobable).length,
        aprobadas: polizas.filter((p) => p.estado === "aprobada").length,
        rechazadas: polizas.filter((p) => p.estado === "rechazada").length,
        conceptos_sin_resolver: polizas.reduce((s, p) => s + p.conceptos_sin_resolver, 0),
      },
    };
  });

/** Lectura del formato LEGADO `metadata.asientos` — sólo consulta histórica. */
export const leerAsientosLegado = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), poliza_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: row, error } = await supabase
      .from("polizas")
      .select("id, metadata")
      .eq("cliente_id", scope.cliente_id)
      .eq("id", data.poliza_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const asientos = ((row?.metadata as any)?.asientos ?? []) as any[];
    return { legado: true, asientos, nota: "Formato legado de sólo lectura; no alimenta exportaciones." };
  });

// ─────────────────────── Generación canónica de borradores ───────────────────
/**
 * Generador ÚNICO de pólizas borrador desde CFDI. Lo usan /app/polizas y el
 * Centro de Cierre; no existe otro camino que escriba pólizas desde CFDI.
 */
export async function generarBorradoresDelPeriodo(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: { cliente_id: string; periodo: string },
) {
  const scope = await assertClienteScope(supabase, userId, data.cliente_id);

  const { data: cuentasRows, error: errCat } = await supabase
    .from("catalogo_cuentas")
    .select("codigo, nombre, naturaleza, tipo_sat, activa")
    .eq("cliente_id", scope.cliente_id);
  if (errCat) throw new Error(errCat.message);
  let catalogo = (cuentasRows ?? []) as unknown as CuentaCatalogo[];
  let catalogo_sembrado: string | null = null;
  if (!catalogo.length) {
    // Sin catálogo no se frena al contador: se siembra la plantilla IMCP
    // (códigos agrupadores SAT) que corresponde a su régimen. Es editable.
    catalogo_sembrado = await sembrarCatalogoBase(supabase, scope.cliente_id);
    const { data: recargado, error: errRe } = await supabase
      .from("catalogo_cuentas")
      .select("codigo, nombre, naturaleza, tipo_sat, activa")
      .eq("cliente_id", scope.cliente_id);
    if (errRe) throw new Error(errRe.message);
    catalogo = (recargado ?? []) as unknown as CuentaCatalogo[];
    if (!catalogo.length) {
      throw new Error(
        "El expediente no tiene catálogo de cuentas y no se pudo cargar el catálogo base. Impórtalo en Pólizas → Catálogo de cuentas.",
      );
    }
  }
  const { cuentas, faltantes } = elegirCuentasSistema(catalogo);
  const version = await versionReglas(supabase, scope.cliente_id);

  // Paginación exhaustiva: un periodo puede superar el tope por página.
  const cfdis: any[] = [];
  for (let desde = 0; ; desde += 500) {
    const { data: pagina, error } = await supabase
      .from("cfdi_xml")
      .select("id, uuid, tipo_cfdi, metodo_pago, fecha, rfc_emisor, rfc_receptor, subtotal, descuento, iva_trasladado, ieps_trasladado, iva_retenido, isr_retenido, total, estatus_sat")
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo)
      .order("fecha", { ascending: true })
      .range(desde, desde + 499);
    if (error) throw new Error(error.message);
    cfdis.push(...(pagina ?? []));
    if ((pagina ?? []).length < 500) break;
  }

  const ids = cfdis.map((c) => c.id);
  const conceptosPorCfdi = new Map<string, ConceptoCfdi[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: pagina, error: errCon } = await supabase
      .from("cfdi_conceptos")
      .select("cfdi_id, numero, clave_prod_serv, descripcion, importe, descuento")
      .in("cfdi_id", ids.slice(i, i + 200));
    if (errCon) throw new Error(errCon.message);
    for (const c of pagina ?? []) {
      const lista = conceptosPorCfdi.get(c.cfdi_id) ?? [];
      lista.push({
        numero: Number(c.numero ?? lista.length + 1),
        clave_prod_serv: c.clave_prod_serv ?? null,
        descripcion: c.descripcion ?? null,
        importe_centavos: cent(c.importe),
        descuento_centavos: cent(c.descuento),
      });
      conceptosPorCfdi.set(c.cfdi_id, lista);
    }
  }

  // Complementos de pago del periodo: la evidencia de flujo de cada factura
  // sale de aquí, y su importe se reparte sin duplicar cobros.
  const complementoPorCfdi = new Map<string, { cfdi_pago_id: string; importe_centavos: number }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: docs } = await supabase
      .from("cfdi_pago_documentos")
      .select("cfdi_id, cfdi_padre_id, imp_pagado")
      .in("cfdi_id", ids.slice(i, i + 200));
    for (const d of docs ?? []) {
      if (!d.cfdi_padre_id) continue;
      const previo = complementoPorCfdi.get(d.cfdi_padre_id);
      const suma = (previo?.importe_centavos ?? 0) + cent(d.imp_pagado);
      complementoPorCfdi.set(d.cfdi_padre_id, { cfdi_pago_id: d.cfdi_id, importe_centavos: suma });
    }
  }

  // Una sola póliza por CFDI, venga de donde venga (versiones anteriores de
  // reglas, Contabilidad automática o el Cierre): si ya existe, se versiona
  // ESA póliza en lugar de crear otra; si ya fue aprobada, no se toca.
  const existentePorCfdi = await polizasExistentesPorCfdi(supabase, scope.cliente_id, ids);

  const cache = new Map<string, ResolucionConcepto>();
  const resolver = async (clave: string, rfc: string | null, desc: string, fecha: string) => {
    const k = `${clave}|${rfc ?? ""}|${desc.slice(0, 40)}`;
    const hit = cache.get(k);
    if (hit) return hit;
    const { data: res, error: errR } = await supabase.rpc("regla_concepto_resolver", {
      _cliente_id: scope.cliente_id,
      _clave_prod_serv: clave,
      _rfc_contraparte: rfc,
      _descripcion: desc,
      _fecha: fecha,
    } as never);
    if (errR) throw new Error(errR.message);
    const r = res as unknown as ResolucionConcepto;
    cache.set(k, r);
    return r;
  };

  const detalle: Array<{ uuid: string; accion: string; motivo?: string }> = [];
  let generadas = 0;
  let bloqueadas = 0;

  for (const c of cfdis) {
    if (c.estatus_sat !== "vigente") {
      detalle.push({ uuid: c.uuid, accion: "omitida", motivo: `Estatus SAT “${c.estatus_sat ?? "desconocido"}”: sólo se contabiliza evidencia vigente.` });
      continue;
    }
    const previa = existentePorCfdi.get(c.id);
    if (previa?.aprobada) {
      detalle.push({ uuid: c.uuid, accion: "sin_cambio", motivo: "Ya tiene una póliza aprobada." });
      continue;
    }
    const esIngreso = String(c.rfc_emisor ?? "").toUpperCase() === scope.rfc.toUpperCase();
    const contraparte = esIngreso ? c.rfc_receptor : c.rfc_emisor;
    const conceptos = (conceptosPorCfdi.get(c.id) ?? []).sort((a, b) => a.numero - b.numero);
    // La póliza debe caer dentro del periodo fiscal (hora del centro). Si la
    // fecha UTC del CFDI cae en el mes vecino, se ajusta al borde del periodo.
    const fecha = ajustarAlPeriodo(String(c.fecha).slice(0, 10), data.periodo);

    const resoluciones: Record<number, ResolucionConcepto> = {};
    for (const con of conceptos) {
      resoluciones[con.numero] = await resolver(
        String(con.clave_prod_serv ?? "").trim() || "(sin clave)",
        contraparte ?? null,
        String(con.descripcion ?? ""),
        fecha,
      );
    }

    let conciliacion: {
      confirmada: boolean;
      movimiento_bancario_id?: string | null;
      actor?: string | null;
      fecha?: string | null;
    } | null = null;
    if (c.tipo_cfdi === "P") {
      const { data: conc } = await supabase
        .from("conciliaciones")
        .select("movimiento_id, estatus, estado_grupo, confirmado_por, confirmado_at")
        .eq("cliente_id", scope.cliente_id)
        .eq("cfdi_id", c.id)
        .order("confirmado_at", { ascending: false, nullsFirst: false })
        .limit(1);
      const fila = (conc ?? [])[0] as any;
      // La conciliación sólo cuenta como evidencia de flujo cuando una
      // persona la confirmó: una propuesta automática nunca reconoce pago.
      const confirmada = fila?.estatus === "confirmado" || fila?.estado_grupo === "confirmado";
      conciliacion = {
        confirmada,
        movimiento_bancario_id: confirmada ? (fila?.movimiento_id ?? null) : null,
        actor: fila?.confirmado_por ?? null,
        fecha: fila?.confirmado_at ?? null,
      };
    }

    const borrador = construirBorradorCfdi({
      cfdi: {
        id: c.id,
        uuid: c.uuid,
        tipo_cfdi: c.tipo_cfdi ?? null,
        metodo_pago: (c as any).metodo_pago ?? null,
        fecha,
        rfc_emisor: c.rfc_emisor ?? null,
        rfc_receptor: c.rfc_receptor ?? null,
        total_centavos: cent(c.total),
        subtotal_centavos: cent(c.subtotal),
        descuento_centavos: cent(c.descuento),
        iva_trasladado_centavos: cent(c.iva_trasladado),
        ieps_trasladado_centavos: cent(c.ieps_trasladado),
        iva_retenido_centavos: cent(c.iva_retenido),
        isr_retenido_centavos: cent(c.isr_retenido),
      },
      esIngreso,
      conceptos,
      resoluciones,
      cuentas,
      conciliacion,
      complemento: complementoPorCfdi.get(c.id) ?? null,
    });

    if (!borrador.cuadra) {
      bloqueadas += 1;
      detalle.push({ uuid: c.uuid, accion: "bloqueada", motivo: borrador.bloqueos.join(" ") });
      continue;
    }

    const { data: res, error: errRpc } = await supabase.rpc("poliza_generar_borrador", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
      _idempotency_key: previa?.llave ?? llaveIdempotencia("cfdi", c.id, version),
      _tipo: borrador.tipo,
      _fecha: fecha,
      _concepto: borrador.concepto,
      _origen: "auto_sat",
      _renglones: borrador.renglones as never,
    } as never);
    if (errRpc) {
      detalle.push({ uuid: c.uuid, accion: "error", motivo: errRpc.message });
      continue;
    }
    generadas += 1;
    const polizaId = (res as any)?.poliza_id ?? (res as any)?.id ?? null;
    if (polizaId) {
      const { error: errEv } = await supabase.rpc("poliza_marcar_evidencia", {
        _poliza_id: polizaId,
        _nivel: borrador.evidencia.nivel as NivelEvidencia,
        _detalle: {
          leyenda: borrador.evidencia.leyenda,
          refuerzos: borrador.refuerzos,
          incidencias: borrador.incidencias,
          movimiento_bancario_id: borrador.evidencia.movimiento_bancario_id,
          cfdi_pago_id: borrador.evidencia.cfdi_pago_id,
        },
      } as never);
      // El nivel de evidencia es parte del contrato: si no puede registrarse,
      // la póliza no debe publicarse con un nivel silenciosamente falso.
      if (errEv) throw new Error(`No se pudo registrar la evidencia de cobro/pago: ${errEv.message}`);
    }
    detalle.push({
      uuid: c.uuid,
      accion: ((res as any)?.accion as string) ?? "creada",
      motivo: borrador.conceptos_sin_resolver
        ? `Faltan ${borrador.conceptos_sin_resolver} conceptos por asignar a una cuenta.`
        : undefined,
    });
  }

  const { error: errEval } = await supabase.rpc("cierre_evaluar_polizas", {
    _cliente_id: scope.cliente_id,
    _periodo: data.periodo,
  } as never);
  if (errEval) throw new Error(errEval.message);

  return {
    generadas,
    bloqueadas,
    revisados: cfdis.length,
    version_reglas: version,
    cuentas_faltantes: faltantes,
    catalogo_sembrado,
    detalle,
  };
}

/** Lleva una fecha AAAA-MM-DD al rango del periodo AAAA-MM. */
export function ajustarAlPeriodo(fecha: string, periodo: string): string {
  if (fecha.slice(0, 7) === periodo) return fecha;
  const [y, m] = periodo.split("-").map(Number);
  if (fecha < `${periodo}-01`) return `${periodo}-01`;
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${periodo}-${String(ultimo).padStart(2, "0")}`;
}

/** Pólizas vivas (no rechazadas) que ya contabilizan cada CFDI. */
async function polizasExistentesPorCfdi(
  supabase: any,
  clienteId: string,
  cfdiIds: string[],
): Promise<Map<string, { llave: string; aprobada: boolean }>> {
  const out = new Map<string, { llave: string; aprobada: boolean }>();
  for (let i = 0; i < cfdiIds.length; i += 200) {
    const { data: filas, error } = await supabase
      .from("poliza_renglones")
      .select("cfdi_id, polizas!inner(id, estado, idempotency_key, created_at)")
      .eq("cliente_id", clienteId)
      .in("cfdi_id", cfdiIds.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const f of (filas ?? []) as any[]) {
      const p = f.polizas;
      if (!f.cfdi_id || !p || p.estado === "rechazada") continue;
      const llave = String(p.idempotency_key ?? "");
      // Sólo pólizas generadas desde un CFDI (no capturas manuales ni bancos).
      if (!/^(b2:cfdi:|cierre:)/.test(llave)) continue;
      const aprobada = p.estado === "aprobada" || p.estado === "confirmada";
      const prev = out.get(f.cfdi_id);
      if (!prev || (aprobada && !prev.aprobada)) out.set(f.cfdi_id, { llave, aprobada });
    }
  }
  return out;
}

/**
 * Siembra la plantilla IMCP según el régimen del expediente. Escribe por el
 * RPC `catalogo_importar_lote` (la tabla no admite INSERT directo).
 */
async function sembrarCatalogoBase(
  supabase: SupabaseClient<Database>,
  clienteId: string,
): Promise<string | null> {
  const { PLANTILLAS_IMCP } = await import("@/lib/contabilidad-auto/imcp-catalog");
  const { huellaImportacion } = await import("@/lib/catalogo/importar");
  const { data: cli } = await supabase
    .from("clientes")
    .select("regimen_fiscal, tipo_persona")
    .eq("id", clienteId)
    .maybeSingle();
  const reg = String(cli?.regimen_fiscal ?? "");
  const clave =
    cli?.tipo_persona === "moral" || /\b60[13]\b/.test(reg)
      ? "pm_general"
      : /\b626\b/.test(reg)
        ? "pf_resico"
        : "pf_act_emp";
  const plantilla = PLANTILLAS_IMCP[clave];
  const filas = plantilla.cuentas.map((c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    naturaleza: (c.naturaleza === "D" ? "deudora" : "acreedora") as "deudora" | "acreedora",
    nivel: c.nivel,
    agrupador_sat: c.agrupador_sat,
    activa: true,
  }));
  const { error } = await supabase.rpc("catalogo_importar_lote", {
    _cliente_id: clienteId,
    _modo: "agregar",
    _cuentas: filas as never,
    _huella: `imcp:${clave}:${huellaImportacion(filas as never)}`.slice(0, 120),
  } as never);
  // Si no se pudo sembrar, el llamador da el mensaje amigable de siempre.
  if (error) return null;
  return plantilla.nombre;
}

export const generarBorradoresCanonicos = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    return generarBorradoresDelPeriodo(supabase, userId, data);
  });

// ─────────────────────────── Captura manual auditada ─────────────────────────
export const crearPolizaManual = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        periodo: periodoSchema,
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        tipo: z.enum(["ingreso", "egreso", "diario"]),
        concepto: z.string().min(3).max(500),
        referencia: z.string().max(120).optional(),
        renglones: z
          .array(
            z.object({
              cuenta: z.string().min(1).max(60),
              cuenta_nombre: z.string().max(200).optional(),
              concepto: z.string().max(300).optional(),
              cargo_centavos: z.number().int().min(0),
              abono_centavos: z.number().int().min(0),
            }),
          )
          .min(2)
          .max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const cargos = data.renglones.reduce((s, r) => s + r.cargo_centavos, 0);
    const abonos = data.renglones.reduce((s, r) => s + r.abono_centavos, 0);
    if (cargos !== abonos) {
      throw new Error(`La póliza no cuadra: cargos ${cargos} vs abonos ${abonos} (centavos).`);
    }
    const llave = llaveIdempotencia(
      "manual",
      `${data.fecha}:${data.concepto.slice(0, 40)}:${cargos}`,
      "manual",
    );
    const { data: res, error } = await supabase.rpc("poliza_generar_borrador", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
      _idempotency_key: llave,
      _tipo: data.tipo,
      _fecha: data.fecha,
      _concepto: data.concepto,
      _origen: "manual",
      _renglones: data.renglones as never,
    } as never);
    if (error) throw new Error(error.message);
    return res;
  });

// ───────────────────────────── Revisión humana ───────────────────────────────
export const aprobarPoliza = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), poliza_id: z.string().uuid(), motivo: motivoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: res, error } = await supabase.rpc("poliza_aprobar", {
      _poliza_id: data.poliza_id,
      _motivo: data.motivo,
    } as never);
    if (error) throw new Error(error.message);
    return res;
  });

export const rechazarPoliza = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), poliza_id: z.string().uuid(), motivo: motivoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: res, error } = await supabase.rpc("poliza_rechazar", {
      _poliza_id: data.poliza_id,
      _motivo: data.motivo,
    } as never);
    if (error) throw new Error(error.message);
    return res;
  });

// ───────────────────── Contrato canónico de exportación ──────────────────────
export const loteExportable = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<LotePolizasExportable> => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: rows, error } = await supabase
      .from("polizas")
      .select(SELECT_POLIZA)
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo)
      .eq("estado", "aprobada")
      .order("fecha", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);

    // UUID y contraparte se derivan del CFDI ligado a los renglones canónicos.
    const cfdiIds = [
      ...new Set(
        (rows ?? []).flatMap((p: any) => (p.poliza_renglones ?? []).map((r: any) => r.cfdi_id).filter(Boolean)),
      ),
    ] as string[];
    const meta = new Map<string, { uuid: string; rfc: string | null }>();
    for (let i = 0; i < cfdiIds.length; i += 200) {
      const { data: cs } = await supabase
        .from("cfdi_xml")
        .select("id, uuid, rfc_emisor, rfc_receptor")
        .in("id", cfdiIds.slice(i, i + 200));
      for (const c of cs ?? []) {
        const contraparte =
          String(c.rfc_emisor ?? "").toUpperCase() === scope.rfc.toUpperCase() ? c.rfc_receptor : c.rfc_emisor;
        meta.set(c.id, { uuid: c.uuid, rfc: contraparte ?? null });
      }
    }

    const polizas = (rows ?? []).map((p: any, i: number) => {
      const primerCfdi = (p.poliza_renglones ?? []).find((r: any) => r.cfdi_id)?.cfdi_id ?? null;
      const m = primerCfdi ? meta.get(primerCfdi) : null;
      return aPolizaExportable(
        { ...p, uuid_cfdi: p.uuid_cfdi ?? m?.uuid ?? null, contraparte_rfc: m?.rfc ?? null },
        i,
      );
    });

    const lote: LotePolizasExportable = {
      cliente_id: scope.cliente_id,
      rfc: scope.rfc,
      periodo: data.periodo,
      generado_at: new Date().toISOString(),
      polizas,
      total_centavos: polizas.reduce((s, p) => s + p.total_centavos, 0),
      advertencias: [],
    };
    lote.advertencias = validarLote(lote);
    return lote;
  });

export { CUENTA_POR_IDENTIFICAR };
