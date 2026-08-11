// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES SINTÉTICOS DE ACEPTACIÓN
//
// Construye, por API, expedientes de prueba COMPLETAMENTE sintéticos: usuarios
// nuevos, despachos marcados como sandbox, clientes, comprobantes, bancos y
// pólizas. Nunca toca datos reales de clientes y nunca contacta SAT, PAC,
// e.firma, correo ni IA.
//
// Reglas:
//  · Todo lo creado queda etiquetado con un identificador de corrida (qa) para
//    que la purga sea exhaustiva y verificable.
//  · Los tokens viven sólo en memoria: no se imprimen ni se persisten.
//  · La purga debe dejar residuo CERO; las bitácoras inmutables sólo aceptan
//    borrado cuando el despacho está marcado como sandbox.
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";

export function entorno() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const faltantes = Object.entries({
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_PUBLISHABLE_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  return { url, anon, service, faltantes, completo: faltantes.length === 0 };
}

const json = { "content-type": "application/json" };

async function pedir(url, opciones) {
  const r = await fetch(url, opciones);
  const texto = await r.text();
  let cuerpo = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = texto;
  }
  return { status: r.status, ok: r.ok, cuerpo };
}

export function cliente(env) {
  const svc = { apikey: env.service, authorization: `Bearer ${env.service}` };

  const rest = async (metodo, ruta, { token, cuerpo, representar } = {}) => {
    const headers = token
      ? { apikey: env.anon, authorization: `Bearer ${token}`, ...json }
      : { ...svc, ...json };
    if (representar) headers.prefer = "return=representation";
    return pedir(`${env.url}/rest/v1/${ruta}`, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  };

  return {
    rest,
    insertar: async (tabla, filas) => {
      const r = await rest("POST", tabla, { cuerpo: filas, representar: true });
      if (!r.ok) throw new Error(`No se pudo insertar en ${tabla}: ${r.status} ${JSON.stringify(r.cuerpo)}`);
      return r.cuerpo;
    },
    borrar: (tabla, filtro) => rest("DELETE", `${tabla}?${filtro}`),
    contar: async (tabla, filtro) => {
      const r = await pedir(`${env.url}/rest/v1/${tabla}?${filtro}&select=id`, {
        headers: { ...svc, prefer: "count=exact", range: "0-0" },
      });
      return Array.isArray(r.cuerpo) ? r.cuerpo.length : 0;
    },
    rpc: (fn, args, token) =>
      pedir(`${env.url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: token
          ? { apikey: env.anon, authorization: `Bearer ${token}`, ...json }
          : { ...svc, ...json },
        body: JSON.stringify(args),
      }),
    rpcAnon: (fn, args) =>
      pedir(`${env.url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: env.anon, ...json },
        body: JSON.stringify(args),
      }),
    crearUsuario: async (email, password) => {
      const r = await pedir(`${env.url}/auth/v1/admin/users`, {
        method: "POST",
        headers: { ...svc, ...json },
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      if (!r.ok) throw new Error(`No se pudo crear el usuario sintético: ${r.status}`);
      return r.cuerpo.id;
    },
    borrarUsuario: (id) =>
      pedir(`${env.url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: svc }),
    iniciarSesion: async (email, password) => {
      const r = await pedir(`${env.url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: env.anon, ...json },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) throw new Error(`No se pudo iniciar sesión sintética: ${r.status}`);
      return r.cuerpo.access_token; // sólo en memoria
    },
  };
}

const dinero = (n) => Number(n.toFixed(2));

async function crearUsuarioCompleto(api, { qa, etiqueta, periodo, regimen }) {
  const email = `qa.${qa}.${etiqueta}@contaclick-qa.invalid`;
  const password = `Qa-${randomUUID()}`;
  const userId = await api.crearUsuario(email, password);
  const token = await api.iniciarSesion(email, password);

  const desp = await api.rest("PATCH", `despachos?owner_user_id=eq.${userId}`, {
    cuerpo: { es_sandbox: true, nombre: `QA ${qa} ${etiqueta}`, estado: "activo" },
    representar: true,
  });
  if (!desp.ok || !desp.cuerpo?.[0]) {
    throw new Error(`El despacho sintético no se creó: ${desp.status} ${JSON.stringify(desp.cuerpo)}`);
  }
  const despachoId = desp.cuerpo[0].id;

  const [cli] = await api.insertar("clientes", {
    despacho_id: despachoId,
    user_id: userId,
    rfc: `QA${etiqueta.toUpperCase()}${qa.slice(0, 6).toUpperCase()}`,
    razon_social: `Expediente QA ${etiqueta}`,
    regimen_fiscal: regimen,
    tipo_persona: regimen === "601" ? "moral" : "fisica",
  });
  const clienteId = cli.id;

  const [rfcRow] = await api.insertar("rfcs", {
    despacho_id: despachoId,
    cliente_id: clienteId,
    rfc: cli.rfc,
    tipo_persona: cli.tipo_persona,
    regimen_fiscal: regimen,
  });

  const fecha = `${periodo}-15`;
  const cfdiBase = {
    despacho_id: despachoId,
    cliente_id: clienteId,
    rfc_id: rfcRow.id,
    version: "4.0",
    moneda: "MXN",
    fecha,
    fecha_timbrado: `${fecha}T12:00:00Z`,
    metodo_pago: "PUE",
    forma_pago: "03",
    uso_cfdi: "G03",
    estatus_sat: "vigente",
    estatus_sat_fuente: "fixture_sintetico",
    estatus_sat_evidencia_at: new Date().toISOString(),
    periodo,
    clase_documental: "ingreso",
    estado_procesamiento: "normalizado",
    normalizado_at: new Date().toISOString(),
    normalizacion_version: "qa@1",
    origen: "fixture_qa",
    tipo_cfdi: "I",
  };

  const cfdis = await api.insertar("cfdi_xml", [
    {
      ...cfdiBase,
      uuid: randomUUID().toUpperCase(),
      archivo_hash: randomUUID().replace(/-/g, ""),
      direccion: "emitido",
      rfc_emisor: cli.rfc,
      nombre_emisor: cli.razon_social,
      rfc_receptor: "XAXX010101000",
      nombre_receptor: "PÚBLICO QA",
      subtotal: dinero(1000),
      iva_trasladado: dinero(160),
      total: dinero(1160),
    },
    {
      ...cfdiBase,
      uuid: randomUUID().toUpperCase(),
      archivo_hash: randomUUID().replace(/-/g, ""),
      direccion: "recibido",
      rfc_emisor: "XAXX010101000",
      nombre_emisor: "PROVEEDOR QA",
      rfc_receptor: cli.rfc,
      nombre_receptor: cli.razon_social,
      subtotal: dinero(400),
      iva_trasladado: dinero(64),
      total: dinero(464),
    },
    {
      ...cfdiBase,
      uuid: randomUUID().toUpperCase(),
      archivo_hash: randomUUID().replace(/-/g, ""),
      direccion: "recibido",
      rfc_emisor: "XAXX010101000",
      nombre_emisor: "PROVEEDOR MIXTO QA",
      rfc_receptor: cli.rfc,
      nombre_receptor: cli.razon_social,
      subtotal: dinero(200),
      iva_trasladado: dinero(32),
      total: dinero(232),
    },
  ]);

  const [emitido, deducible, parcial] = cfdis;

  const [cuenta] = await api.insertar("cuentas_bancarias", {
    despacho_id: despachoId,
    cliente_id: clienteId,
    banco: "BANCO QA",
    alias: "Cuenta QA",
    numero_cuenta_mask: "****0000",
  });

  await api.insertar("cierre_config_bancos", {
    cliente_id: clienteId,
    despacho_id: despachoId,
    tolerancia_centavos: 100,
    motivo: "Tolerancia estándar del escenario sintético.",
    actualizado_por: userId,
  });

  const movimientos = await api.insertar(
    "movimientos_bancarios",
    cfdis.map((c, i) => ({
      despacho_id: despachoId,
      cliente_id: clienteId,
      cuenta_id: cuenta.id,
      fecha,
      descripcion: `Movimiento QA ${i + 1}`,
      referencia: `QA-${i + 1}`,
      cargo: c.direccion === "recibido" ? c.total : 0,
      abono: c.direccion === "emitido" ? c.total : 0,
      hash: randomUUID(),
    })),
  );

  await api.insertar(
    "conciliaciones",
    movimientos.map((m, i) => ({
      despacho_id: despachoId,
      cliente_id: clienteId,
      movimiento_id: m.id,
      cfdi_id: cfdis[i].id,
      tipo_match: "exacto",
      probabilidad: 1,
      diferencia: 0,
      estatus: "confirmado",
      motivo: "Conciliación sintética confirmada para la aceptación automatizada.",
      confirmado_por: userId,
      confirmado_at: new Date().toISOString(),
    })),
  );

  await api.insertar("catalogo_cuentas", [
    { cliente_id: clienteId, despacho_id: despachoId, codigo: "102.01", nombre: "Bancos QA", naturaleza: "deudora", activa: true },
    { cliente_id: clienteId, despacho_id: despachoId, codigo: "401.01", nombre: "Ingresos QA", naturaleza: "acreedora", activa: true },
  ]);

  const [poliza] = await api.insertar("polizas", {
    despacho_id: despachoId,
    cliente_id: clienteId,
    tipo: "ingreso",
    fecha,
    concepto: "Póliza sintética de ingreso",
    cuenta: "102.01",
    monto: emitido.total,
    periodo,
    estado: "borrador",
    origen: "auto_sat",
    idempotency_key: `qa-${qa}-${etiqueta}-ingreso`,
    input_hash: randomUUID().replace(/-/g, ""),
    version: 1,
    cfdi_id: emitido.id,
    created_by: userId,
  });

  await api.insertar("poliza_renglones", [
    {
      poliza_id: poliza.id,
      despacho_id: despachoId,
      cliente_id: clienteId,
      numero: 1,
      cuenta: "102.01",
      cuenta_nombre: "Bancos QA",
      concepto: "Cobro sintético",
      cargo_centavos: Math.round(emitido.total * 100),
      abono_centavos: 0,
      cfdi_id: emitido.id,
    },
    {
      poliza_id: poliza.id,
      despacho_id: despachoId,
      cliente_id: clienteId,
      numero: 2,
      cuenta: "401.01",
      cuenta_nombre: "Ingresos QA",
      concepto: "Ingreso sintético",
      cargo_centavos: 0,
      abono_centavos: Math.round(emitido.total * 100),
      cfdi_id: emitido.id,
    },
  ]);

  // La póliza sólo puede aprobarse una vez que cuadra al centavo.
  const aprob = await api.rest("PATCH", `polizas?id=eq.${poliza.id}`, {
    cuerpo: { estado: "aprobada", aprobada_por: userId, aprobada_at: new Date().toISOString() },
  });
  if (!aprob.ok) throw new Error(`No se pudo aprobar la póliza sintética: ${aprob.status} ${JSON.stringify(aprob.cuerpo)}`);

  await api.insertar("cierre_periodos", {
    despacho_id: despachoId,
    cliente_id: clienteId,
    periodo,
    etapa_documental: "en_proceso",
    direcciones: ["emitido", "recibido"],
  });

  return {
    etiqueta,
    email,
    userId,
    token,
    despachoId,
    clienteId,
    regimen,
    cfdi: { emitido: emitido.id, deducible: deducible.id, parcial: parcial.id },
    poliza: poliza.id,
  };
}

/**
 * Crea dos expedientes independientes (A y B) con evidencia suficiente para
 * recorrer el flujo mensual completo. Devuelve el escenario y su purga.
 */
export async function crearEscenario({ periodo = "2026-01", regimen = "612" } = {}) {
  const env = entorno();
  if (!env.completo) throw new Error(`Configuración ausente: ${env.faltantes.join(", ")}`);
  const api = cliente(env);
  const qa = randomUUID().slice(0, 8);
  const a = await crearUsuarioCompleto(api, { qa, etiqueta: "a", periodo, regimen });
  const b = await crearUsuarioCompleto(api, { qa, etiqueta: "b", periodo, regimen });
  return { qa, periodo, env, api, a, b };
}

const TABLAS_PURGA = [
  "cierre_eventos",
  "cierre_snapshots",
  "cierre_reaperturas",
  "cierre_excepcion_bitacora",
  "cierre_excepciones",
  "cierre_etapas",
  "cierre_resultado_fiscal",
  "cierre_periodos",
  "cierre_config_bancos",
  "cfdi_decisiones_fiscales",
  "cfdi_decisiones_historial",
  "poliza_renglones",
  "polizas",
  "conciliaciones",
  "movimientos_bancarios",
  "cuentas_bancarias",
  "catalogo_cuentas",
  "cfdi_impuestos",
  "cfdi_conceptos",
  "cfdi_xml",
  "rfcs",
  "clientes",
];

const SIN_CLIENTE = new Set(["cierre_excepcion_bitacora", "poliza_renglones", "cfdi_impuestos", "cfdi_conceptos"]);

async function purgarUsuario(api, u) {
  // Tablas hijas sin cliente_id: se depuran por su padre antes que el padre.
  const exc = await api.rest("GET", `cierre_excepciones?cliente_id=eq.${u.clienteId}&select=id`);
  const ids = Array.isArray(exc.cuerpo) ? exc.cuerpo.map((e) => e.id) : [];
  if (ids.length > 0) await api.borrar("cierre_excepcion_bitacora", `excepcion_id=in.(${ids.join(",")})`);
  for (const tabla of TABLAS_PURGA) {
    if (SIN_CLIENTE.has(tabla)) continue;
    await api.borrar(tabla, `cliente_id=eq.${u.clienteId}`);
  }
  await api.borrar("user_roles", `user_id=eq.${u.userId}`);
  await api.borrar("user_memberships", `user_id=eq.${u.userId}`);
  await api.borrar("despachos", `id=eq.${u.despachoId}`);
  await api.borrar("profiles", `id=eq.${u.userId}`);
  await api.borrarUsuario(u.userId);
}

export async function purgar(escenario) {
  const { api } = escenario;
  // poliza_renglones y detalle de CFDI se borran por su despacho antes del resto.
  for (const u of [escenario.a, escenario.b]) {
    await api.borrar("poliza_renglones", `cliente_id=eq.${u.clienteId}`);
  }
  await purgarUsuario(api, escenario.a);
  await purgarUsuario(api, escenario.b);
}

/** Verificación de residuo: debe ser 0 en todas las tablas del escenario. */
export async function residuos(escenario) {
  const { api } = escenario;
  const detalle = {};
  for (const u of [escenario.a, escenario.b]) {
    for (const tabla of TABLAS_PURGA) {
      if (SIN_CLIENTE.has(tabla)) continue;
      const n = await api.contar(tabla, `cliente_id=eq.${u.clienteId}`);
      if (n > 0) detalle[`${tabla}:${u.etiqueta}`] = n;
    }
    const d = await api.contar("despachos", `id=eq.${u.despachoId}`);
    if (d > 0) detalle[`despachos:${u.etiqueta}`] = d;
  }
  return { total: Object.values(detalle).reduce((a, b) => a + b, 0), detalle };
}
