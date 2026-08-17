// ─────────────────────────────────────────────────────────────────────────────
// E2E SINTÉTICO DEL BLOQUE 2 (PÓLIZAS) — CAMINO DE PRODUCCIÓN
//
// Recorre el flujo real llamando a las MISMAS funciones servidoras que usa la
// interfaz (importarCatalogo, guardarReglaConcepto, generarBorradoresCanonicos,
// aprobarPoliza, loteExportable, exportarContpaqi, exportarAnexo24Polizas)
// sobre dos despachos sandbox temporales. No usa SAT, PAC, IA, correo ni datos
// reales, y al final purga los datos operativos demostrando residuo cero.
//
// Uso:
//   bun --preload ./scripts/aceptacion/conciliacion/precarga-url.mjs \
//       scripts/aceptacion/polizas/e2e.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from "node:crypto";
import { entorno, cliente } from "../fixtures.mjs";
import { llamar, precalentarRuta, POLIZAS, CATALOGO, REGLAS, EXPORTES } from "../conciliacion/serverfn.mjs";
import { parsearCatalogo } from "../../../src/lib/catalogo/importar.ts";
import {
  CATALOGO as CATALOGO_FILAS,
  catalogoCsv,
  catalogoXlsx,
  catalogoInvalidoCsv,
  comprobantes,
  uuidSintetico,
  hashSintetico,
  CLAVE_INGRESO,
  CLAVE_GASTO,
} from "./fixtures.mjs";

precalentarRuta("/app/polizas");
precalentarRuta("/app/contabilidad-auto");

const PERIODO = "2026-07";
const MOTIVO = "Prueba de aceptación sintética del bloque de pólizas contables.";
const pasos = [];
const fallos = [];
const metricas = {
  polizas_creadas: 0,
  versiones_creadas: 0,
  renglones_creados: 0,
  aprobaciones_humanas: 0,
  duplicados: 0,
  diferencias_centavos: 0,
  accesos_cruzados_rechazados: 0,
};

function paso(n, nombre, ok, esperado, obtenido, capa) {
  pasos.push({ n, caso: nombre, esperado, obtenido, resultado: ok ? "PASA" : "FALLA", capa });
  if (!ok) fallos.push({ n, caso: nombre, esperado, obtenido, capa });
  console.log(`${ok ? "✓" : "✗"} ${n}. ${nombre} — esperado: ${esperado} | obtenido: ${obtenido}`);
}

async function rechazado(fn) {
  try {
    await fn();
    return { rechazado: false, motivo: "permitido" };
  } catch (e) {
    return { rechazado: true, motivo: String(e?.message ?? e).slice(0, 120) };
  }
}

async function crearSandbox(api, qa, etiqueta) {
  const email = `qa.polizas.${qa}.${etiqueta}@contaclick-qa.invalid`;
  const password = `Qa-${randomUUID()}`;
  const userId = await api.crearUsuario(email, password);
  const token = await api.iniciarSesion(email, password);
  const desp = await api.rest("PATCH", `despachos?owner_user_id=eq.${userId}`, {
    cuerpo: { es_sandbox: true, nombre: `QA POLIZAS ${qa} ${etiqueta}`, estado: "activo" },
    representar: true,
  });
  if (!desp.ok || !desp.cuerpo?.[0]) throw new Error(`Despacho sandbox no creado: ${desp.status}`);
  const despachoId = desp.cuerpo[0].id;
  const rfc = etiqueta === "a" ? "SAND010101AAA" : "SAND020202BBB";
  const [cli] = await api.insertar("clientes", {
    despacho_id: despachoId,
    user_id: userId,
    rfc,
    razon_social: `EXPEDIENTE SANDBOX POLIZAS ${etiqueta.toUpperCase()}`,
    regimen_fiscal: "601",
    tipo_persona: "moral",
  });
  const [rfcRow] = await api.insertar("rfcs", {
    despacho_id: despachoId,
    cliente_id: cli.id,
    rfc,
    tipo_persona: "moral",
    regimen_fiscal: "601",
  });
  return { etiqueta, email, userId, token, despachoId, clienteId: cli.id, rfcId: rfcRow.id, rfc };
}

async function importarArchivo(api, sandbox, nombre, bytes, tipo, modo) {
  const lectura = await parsearCatalogo(new File([bytes], nombre, { type: tipo }));
  return llamar(
    CATALOGO,
    "importarCatalogo",
    { cliente_id: sandbox.clienteId, modo, huella: lectura.huella, cuentas: lectura.filas },
    sandbox.token,
  );
}

async function sembrarCfdi(api, s, def, etiqueta) {
  const [fila] = await api.insertar("cfdi_xml", {
    ...def.fila,
    despacho_id: s.despachoId,
    cliente_id: s.clienteId,
    rfc_id: s.rfcId,
    uuid: uuidSintetico(),
    archivo_hash: hashSintetico(`${s.clienteId}:${etiqueta}`),
  });
  if (def.conceptos.length) {
    await api.insertar("cfdi_conceptos", def.conceptos.map((c) => ({ ...c, cfdi_id: fila.id })));
  }
  return fila;
}

const suma = (rs, k) => rs.reduce((t, r) => t + Number(r[k] ?? 0), 0);

async function main() {
  const env = entorno();
  if (!env.completo) throw new Error(`Configuración ausente: ${env.faltantes.join(", ")}`);
  const api = cliente(env);
  const qa = randomUUID().slice(0, 8);
  let a = null;
  let b = null;
  let bitacoraRetenida = 0;
  let residuoTotal = 0;
  let residuoDetalle = {};

  try {
    // ── 1 · Dos despachos sandbox con expediente propio ─────────────────────
    a = await crearSandbox(api, qa, "a");
    b = await crearSandbox(api, qa, "b");
    paso(1, "Crear sandbox A y sandbox B", !!a.clienteId && !!b.clienteId && a.despachoId !== b.despachoId,
      "2 despachos sandbox independientes", `despachos=2, expedientes=2`, "fixtures sandbox");

    // ── 2 · Importar catálogo CSV por la función servidora real ─────────────
    const csv = Buffer.from(catalogoCsv(), "utf8");
    const imp1 = await importarArchivo(api, a, "catalogo.csv", csv, "text/csv", "agregar_actualizar");
    paso(2, "Importar catálogo CSV con importarCatalogo",
      imp1.guardado === true && imp1.altas === CATALOGO_FILAS.length && imp1.errores.length === 0,
      `${CATALOGO_FILAS.length} cuentas dadas de alta`,
      `guardado=${imp1.guardado}, altas=${imp1.altas}, errores=${imp1.errores.length}`, "catalogo_importar_lote");

    // ── 3 · Cuentas, jerarquía, naturaleza y sistema de centavos ────────────
    const cat = await llamar(CATALOGO, "listarCatalogoCuentas", { cliente_id: a.clienteId, incluir_inactivas: true }, a.token);
    const porCodigo = new Map(cat.cuentas.map((c) => [c.codigo, c]));
    const jerarquiaOk = CATALOGO_FILAS.every(([cod, , , padre]) => (porCodigo.get(cod)?.codigo_padre ?? "") === padre);
    const naturalezaOk = CATALOGO_FILAS.every(([cod, , nat]) => porCodigo.get(cod)?.naturaleza === nat);
    const ok3 = cat.cuentas.length === CATALOGO_FILAS.length && jerarquiaOk && naturalezaOk && cat.faltantes.length === 0;
    paso(3, "Verificar cuentas, jerarquía, naturaleza y cuentas de sistema", ok3,
      "catálogo íntegro y sin cuentas de sistema faltantes",
      `cuentas=${cat.cuentas.length}, jerarquia=${jerarquiaOk}, naturaleza=${naturalezaOk}, faltantes=${cat.faltantes.join("|") || "0"}`,
      "listarCatalogoCuentas / elegirCuentasSistema");

    // ── 4 · Reimportar el mismo CSV: cero duplicados ────────────────────────
    const imp2 = await importarArchivo(api, a, "catalogo.csv", csv, "text/csv", "agregar_actualizar");
    const totalCat2 = await api.contar("catalogo_cuentas", `cliente_id=eq.${a.clienteId}`);
    const ok4 = imp2.altas === 0 && imp2.omitidas === CATALOGO_FILAS.length && totalCat2 === CATALOGO_FILAS.length;
    if (totalCat2 !== CATALOGO_FILAS.length) metricas.duplicados += totalCat2 - CATALOGO_FILAS.length;
    paso(4, "Reimportar el mismo CSV no duplica cuentas", ok4, "0 altas y catálogo sin crecer",
      `altas=${imp2.altas}, omitidas=${imp2.omitidas}, total=${totalCat2}`, "catalogo_importar_lote");

    // ── 5 · XLSX equivalente: mismo catálogo, cero diferencias ──────────────
    const imp3 = await importarArchivo(api, a, "catalogo.xlsx", catalogoXlsx(),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "agregar_actualizar");
    const totalCat3 = await api.contar("catalogo_cuentas", `cliente_id=eq.${a.clienteId}`);
    const ok5 = imp3.altas === 0 && imp3.actualizadas === 0 && totalCat3 === CATALOGO_FILAS.length;
    paso(5, "Importar XLSX equivalente no produce diferencias", ok5, "mismo catálogo, 0 altas y 0 actualizaciones",
      `altas=${imp3.altas}, actualizadas=${imp3.actualizadas}, total=${totalCat3}`, "parsearCatalogo / catalogo_importar_lote");

    // ── 6 · Archivo inválido: rollback total ────────────────────────────────
    let imp4 = null;
    const rechazoInvalido = await rechazado(async () => {
      imp4 = await importarArchivo(api, a, "catalogo-invalido.csv", Buffer.from(catalogoInvalidoCsv(), "utf8"),
        "text/csv", "agregar_actualizar");
      if (imp4.guardado) throw new Error("__guardado__");
    });
    const totalCat4 = await api.contar("catalogo_cuentas", `cliente_id=eq.${a.clienteId}`);
    const ok6 = rechazoInvalido.rechazado && rechazoInvalido.motivo !== "__guardado__" &&
      totalCat4 === CATALOGO_FILAS.length;
    paso(6, "Importar archivo inválido revierte por completo", ok6, "no se guarda ninguna fila del archivo inválido",
      `rechazo=${rechazoInvalido.rechazado}, catalogo=${totalCat4}`, "validación de importación / catalogo_importar_lote");

    // ── 7 · Regla válida por concepto ───────────────────────────────────────
    const reglaIngreso = await llamar(REGLAS, "guardarReglaConcepto", {
      cliente_id: a.clienteId, clave_prod_serv: CLAVE_INGRESO, cuenta: "401-001",
      tratamiento_iva: "trasladado", tipo_operacion: "ingreso", vigencia_desde: "2026-01-01", motivo: MOTIVO,
    }, a.token);
    await llamar(REGLAS, "guardarReglaConcepto", {
      cliente_id: a.clienteId, clave_prod_serv: CLAVE_GASTO, cuenta: "601-001",
      tratamiento_iva: "acreditable", tipo_operacion: "gasto", vigencia_desde: "2026-01-01", motivo: MOTIVO,
    }, a.token);
    const reglas = await llamar(REGLAS, "listarReglasConcepto", { cliente_id: a.clienteId, incluir_inactivas: false }, a.token);
    paso(7, "Registrar una regla válida por concepto", reglas.length === 2 && reglas.every((r) => r.activa),
      "2 reglas activas del contador", `reglas_activas=${reglas.length}`, "regla_concepto_guardar");

    // ── 8 · Dos reglas activas ambiguas: bloqueo comprobado ────────────────
    // El camino autorizado versiona en lugar de duplicar, y la escritura directa
    // está cerrada: nunca pueden coexistir dos reglas activas para la misma clave.
    await llamar(REGLAS, "guardarReglaConcepto", {
      cliente_id: a.clienteId, clave_prod_serv: CLAVE_INGRESO, cuenta: "401-001",
      tratamiento_iva: "trasladado", tipo_operacion: "ingreso", vigencia_desde: "2026-01-01", motivo: MOTIVO,
    }, a.token);
    const directaAmbigua = await api.rest("POST", "reglas_concepto", {
      token: a.token, representar: true,
      cuerpo: {
        cliente_id: a.clienteId, despacho_id: a.despachoId, clave_prod_serv: CLAVE_INGRESO,
        cuenta: "401-002", tratamiento_iva: "trasladado", tipo_operacion: "ingreso",
        vigencia_desde: "2026-01-01", origen: "contador", activa: true,
      },
    });
    const vigentes = ((await api.rest("GET",
      `reglas_concepto?cliente_id=eq.${a.clienteId}&clave_prod_serv=eq.${CLAVE_INGRESO}&activa=eq.true&select=cuenta,vigencia_desde,vigencia_hasta`)).cuerpo ?? [])
      .filter((r) => r.vigencia_desde <= `${PERIODO}-15` && (!r.vigencia_hasta || r.vigencia_hasta >= `${PERIODO}-15`));
    const resuelta = await api.rpc("regla_concepto_resolver", {
      _cliente_id: a.clienteId, _clave_prod_serv: CLAVE_INGRESO, _rfc_contraparte: "XAXX010101000",
      _descripcion: "Servicio profesional sintetico", _fecha: `${PERIODO}-15`,
    }, a.token);
    const ok8 = !directaAmbigua.ok && vigentes.length === 1 && resuelta.cuerpo?.estado === "resuelta";
    paso(8, "Dos reglas activas ambiguas quedan bloqueadas", ok8,
      "escritura directa rechazada, una sola regla vigente y resolución determinista",
      `directa=${directaAmbigua.ok ? "PERMITIDA" : "RECHAZADA"}, vigentes=${vigentes.length}, resolucion=${resuelta.cuerpo?.estado}`,
      "regla_concepto_guardar / GRANT");

    // ── Siembra de comprobantes sintéticos ──────────────────────────────────
    const defs = comprobantes(PERIODO, a.rfc);
    const f1 = await sembrarCfdi(api, a, defs.f1, "f1");
    const f2 = await sembrarCfdi(api, a, defs.f2, "f2");
    const f3 = await sembrarCfdi(api, a, defs.f3, "f3");
    const f4 = await sembrarCfdi(api, a, defs.f4, "f4");
    const f5 = await sembrarCfdi(api, a, defs.f5, "f5");
    const p1 = await sembrarCfdi(api, a, defs.p1, "p1");

    const gen1 = await llamar(POLIZAS, "generarBorradoresCanonicos", { cliente_id: a.clienteId, periodo: PERIODO }, a.token);
    const leer = async (token = a.token) =>
      llamar(POLIZAS, "listarPolizasCanonicas", { cliente_id: a.clienteId, periodo: PERIODO, limit: 500 }, token);
    let vista = await leer();
    const deCfdi = (lista, cfdiId) =>
      lista.polizas.filter((p) => (p.poliza_renglones ?? []).some((r) => r.cfdi_id === cfdiId));
    const ultima = (lista, cfdiId) => deCfdi(lista, cfdiId).sort((x, y) => (x.created_at < y.created_at ? 1 : -1))[0];

    // ── 9 · Borrador de ingreso PUE ─────────────────────────────────────────
    const pF1 = ultima(vista, f1.id);
    const rF1 = pF1?.poliza_renglones ?? [];
    const ok9 = !!pF1 && pF1.tipo === "ingreso" && pF1.estado === "borrador" &&
      rF1.some((r) => r.cuenta === "105-001" && r.cargo_centavos === 116000) &&
      rF1.some((r) => r.cuenta === "401-001" && r.abono_centavos === 100000) &&
      rF1.some((r) => r.cuenta === "209-001" && r.abono_centavos === 16000);
    paso(9, "Generar borrador de ingreso pagado en una exhibición", ok9,
      "clientes 116000 cargo, ingresos 100000 abono, IVA cobrado 16000 abono",
      `renglones=${rF1.map((r) => `${r.cuenta}:${r.cargo_centavos}/${r.abono_centavos}`).join(" ")}`,
      "generarBorradoresCanonicos / motor");

    // ── 10 · Evidencia documental, jamás bancaria ───────────────────────────
    paso(10, "El ingreso PUE se publica como evidencia documental", pF1?.nivel_evidencia === "documental_pue",
      "nivel_evidencia=documental_pue", `nivel_evidencia=${pF1?.nivel_evidencia}`, "resolverEvidencia / poliza_marcar_evidencia");

    // ── 11 · Borrador de gasto PUE ──────────────────────────────────────────
    const pF2 = ultima(vista, f2.id);
    const rF2 = pF2?.poliza_renglones ?? [];
    const ok11 = !!pF2 && pF2.tipo === "egreso" &&
      rF2.some((r) => r.cuenta === "601-001" && r.cargo_centavos === 50000) &&
      rF2.some((r) => r.cuenta === "113-001" && r.cargo_centavos === 8000) &&
      rF2.some((r) => r.cuenta === "201-001" && r.abono_centavos === 58000);
    paso(11, "Generar borrador de gasto pagado en una exhibición", ok11,
      "gasto 50000 cargo, IVA acreditable pagado 8000 cargo, proveedores 58000 abono",
      `renglones=${rF2.map((r) => `${r.cuenta}:${r.cargo_centavos}/${r.abono_centavos}`).join(" ")}`,
      "generarBorradoresCanonicos / motor");

    // ── 12 · PPD sin complemento: devengo sin inventar pago ─────────────────
    const pF3 = ultima(vista, f3.id);
    const rF3 = pF3?.poliza_renglones ?? [];
    const ok12 = !!pF3 && rF3.some((r) => r.cuenta === "208-001" && r.abono_centavos === 32000) &&
      !rF3.some((r) => r.cuenta === "209-001") && !rF3.some((r) => r.cuenta === "102-001") &&
      pF3.nivel_evidencia === "sin_evidencia";
    paso(12, "CFDI en parcialidades sin complemento conserva sólo el devengo", ok12,
      "IVA trasladado pendiente 32000 y sin bancos ni IVA cobrado",
      `nivel=${pF3?.nivel_evidencia}, cuentas=${rF3.map((r) => r.cuenta).join("|")}`, "motor / evidencia");

    // ── 13 · Complemento relacionado: el pago se reconoce una sola vez ──────
    const [pago] = await api.insertar("cfdi_pagos", {
      cfdi_id: p1.id, despacho_id: a.despachoId, cliente_id: a.clienteId, numero_pago: 1,
      fecha_pago: `${PERIODO}-20T12:00:00Z`, forma_pago_p: "03", moneda_p: "MXN", monto: 2320,
    });
    await api.insertar("cfdi_pago_documentos", {
      pago_id: pago.id, cfdi_id: p1.id, cfdi_padre_id: f3.id, id_documento: f3.uuid,
      moneda_dr: "MXN", num_parcialidad: 1, imp_saldo_ant: 2320, imp_pagado: 2320, imp_saldo_insoluto: 0,
    });
    await llamar(POLIZAS, "generarBorradoresCanonicos", { cliente_id: a.clienteId, periodo: PERIODO }, a.token);
    vista = await leer();
    const pP1 = ultima(vista, p1.id);
    const rP1 = pP1?.poliza_renglones ?? [];
    const pF3b = ultima(vista, f3.id);
    const bancosCargo = vista.polizas.flatMap((p) => p.poliza_renglones ?? [])
      .filter((r) => r.cuenta === "102-001").reduce((t, r) => t + r.cargo_centavos, 0);
    const ok13 = !!pP1 && rP1.length === 2 && bancosCargo === 232000 &&
      pP1.nivel_evidencia === "complemento_pago" && pF3b?.nivel_evidencia === "complemento_pago";
    paso(13, "El complemento relacionado reconoce el pago exactamente una vez", ok13,
      "un solo cargo a bancos por 232000 y evidencia complemento_pago",
      `bancos_cargo=${bancosCargo}, nivel_complemento=${pP1?.nivel_evidencia}, nivel_factura=${pF3b?.nivel_evidencia}`,
      "construirBorradorComplementoPago");

    // ── 14 · Conciliación bancaria confirmada: sin duplicar flujo ───────────
    const [cuentaBanco] = await api.insertar("cuentas_bancarias", {
      despacho_id: a.despachoId, cliente_id: a.clienteId, banco: "BANCO SANDBOX",
      alias: "Cuenta laboratorio", numero_cuenta_mask: "****0000",
    });
    const [movPago] = await api.insertar("movimientos_bancarios", {
      despacho_id: a.despachoId, cliente_id: a.clienteId, cuenta_id: cuentaBanco.id,
      fecha: `${PERIODO}-20`, descripcion: "Cobro sintetico de parcialidad", referencia: "QA-PAGO",
      cargo: 0, abono: 2320, hash: randomUUID(),
    });
    await api.insertar("conciliaciones", {
      despacho_id: a.despachoId, cliente_id: a.clienteId, movimiento_id: movPago.id, cfdi_id: p1.id,
      tipo_match: "exacto", probabilidad: 1, diferencia: 0, estatus: "confirmado", estado_grupo: "confirmado",
      motivo: "Conciliación sintética confirmada por persona para la aceptación.",
      confirmado_por: a.userId, confirmado_at: new Date().toISOString(), periodo: PERIODO,
    });
    await llamar(POLIZAS, "generarBorradoresCanonicos", { cliente_id: a.clienteId, periodo: PERIODO }, a.token);
    vista = await leer();
    const pP1b = ultima(vista, p1.id);
    const bancosCargo2 = vista.polizas.flatMap((p) => p.poliza_renglones ?? [])
      .filter((r) => r.cuenta === "102-001").reduce((t, r) => t + r.cargo_centavos, 0);
    const ivaPpd = (ultima(vista, f3.id)?.poliza_renglones ?? [])
      .filter((r) => r.cuenta === "209-001").reduce((t, r) => t + r.abono_centavos, 0);
    const ok14 = pP1b?.nivel_evidencia === "banco_confirmado" && bancosCargo2 === 232000 && ivaPpd === 0 &&
      (pP1b?.evidencia_detalle?.refuerzos ?? []).includes("complemento_pago");
    paso(14, "La conciliación confirmada no duplica cobro, pago ni IVA", ok14,
      "banco_confirmado con complemento como refuerzo, bancos 232000 y sin IVA cobrado duplicado",
      `nivel=${pP1b?.nivel_evidencia}, bancos=${bancosCargo2}, iva_cobrado_duplicado=${ivaPpd}`,
      "resolverEvidencia / conciliaciones");

    // ── 15 · Propuesta bancaria sin confirmar no genera póliza aprobable ────
    const [movPropuesto] = await api.insertar("movimientos_bancarios", {
      despacho_id: a.despachoId, cliente_id: a.clienteId, cuenta_id: cuentaBanco.id,
      fecha: `${PERIODO}-16`, descripcion: "Deposito sintetico sin confirmar", referencia: "QA-PROP",
      cargo: 0, abono: 1160, hash: randomUUID(),
    });
    await api.insertar("conciliaciones", {
      despacho_id: a.despachoId, cliente_id: a.clienteId, movimiento_id: movPropuesto.id, cfdi_id: f1.id,
      tipo_match: "exacto", probabilidad: 1, diferencia: 0, estatus: "propuesto", estado_grupo: "propuesto",
      periodo: PERIODO,
    });
    await llamar(POLIZAS, "generarBorradoresCanonicos", { cliente_id: a.clienteId, periodo: PERIODO }, a.token);
    vista = await leer();
    const ligadas = vista.polizas.flatMap((p) => p.poliza_renglones ?? [])
      .filter((r) => r.movimiento_bancario_id === movPropuesto.id).length;
    const pF1b = ultima(vista, f1.id);
    const ok15 = ligadas === 0 && pF1b?.nivel_evidencia === "documental_pue";
    paso(15, "Una propuesta bancaria sin confirmar no produce póliza aprobable", ok15,
      "0 renglones ligados al movimiento propuesto y evidencia sin ascender",
      `renglones_ligados=${ligadas}, nivel_factura=${pF1b?.nivel_evidencia}`, "motor / evidencia");

    // ── 16 · Varios servicios: varios renglones base ────────────────────────
    const pF4 = ultima(vista, f4.id);
    const rF4 = pF4?.poliza_renglones ?? [];
    const base4 = rF4.filter((r) => r.cuenta === "401-001");
    const ok16 = base4.length === 3 && suma(base4, "abono_centavos") === 100000;
    paso(16, "Un CFDI con varios servicios produce varios renglones base", ok16,
      "3 renglones de ingreso que suman 100000 centavos",
      `renglones_base=${base4.length}, suma=${suma(base4, "abono_centavos")}`, "motor repartirBase");

    // ── 17 · Concepto sin regla: cuenta por identificar y bloqueo ───────────
    const pF5 = ultima(vista, f5.id);
    const rF5 = pF5?.poliza_renglones ?? [];
    const porIdentificar = rF5.filter((r) => /por identificar/i.test(r.cuenta)).length;
    const intentoAprobar = await rechazado(() => llamar(POLIZAS, "aprobarPoliza",
      { cliente_id: a.clienteId, poliza_id: pF5.id, motivo: MOTIVO }, a.token));
    const ok17 = porIdentificar === 1 && pF5.aprobable === false && intentoAprobar.rechazado;
    paso(17, "Un concepto sin regla queda por identificar y bloquea la aprobación", ok17,
      "renglón POR IDENTIFICAR y aprobación rechazada",
      `por_identificar=${porIdentificar}, aprobable=${pF5?.aprobable}, aprobacion_rechazada=${intentoAprobar.rechazado}`,
      "motor / poliza_aprobar");

    // ── 18 · Partida doble exacta en centavos ───────────────────────────────
    const descuadres = vista.polizas.filter((p) => p.cargos_centavos !== p.abonos_centavos);
    metricas.diferencias_centavos = descuadres.reduce((t, p) => t + Math.abs(p.diferencia_centavos), 0);
    paso(18, "Toda póliza cuadra al centavo", descuadres.length === 0, "debe = haber en todas las pólizas",
      `descuadradas=${descuadres.length}, diferencia=${metricas.diferencias_centavos}`, "poliza_generar_borrador");

    // ── 19 · Póliza descuadrada rechazada ───────────────────────────────────
    const descuadrada = await rechazado(() => llamar(POLIZAS, "crearPolizaManual", {
      cliente_id: a.clienteId, periodo: PERIODO, fecha: `${PERIODO}-18`, tipo: "diario",
      concepto: "Intento sintético descuadrado",
      renglones: [
        { cuenta: "102-001", cargo_centavos: 10000, abono_centavos: 0 },
        { cuenta: "401-001", cargo_centavos: 0, abono_centavos: 9999 },
      ],
    }, a.token));
    paso(19, "Una póliza descuadrada se rechaza", descuadrada.rechazado, "rechazo del intento descuadrado",
      `rechazo=${descuadrada.rechazado}`, "crearPolizaManual / poliza_generar_borrador");

    // ── 20 · Reejecutar la misma generación es idempotente ──────────────────
    const antes = vista.polizas.map((p) => `${p.id}:${p.version}:${p.input_hash}`).sort().join(",");
    const genRepetida = await llamar(POLIZAS, "generarBorradoresCanonicos", { cliente_id: a.clienteId, periodo: PERIODO }, a.token);
    vista = await leer();
    const despues = vista.polizas.map((p) => `${p.id}:${p.version}:${p.input_hash}`).sort().join(",");
    const ok20 = antes === despues && genRepetida.detalle.every((d) => d.accion === "idempotente" || d.accion === "omitida");
    paso(20, "Reejecutar la misma generación no crea duplicados", ok20, "misma póliza y versión, cero duplicados",
      `identicas=${antes === despues}, acciones=${[...new Set(genRepetida.detalle.map((d) => d.accion))].join("|")}`,
      "poliza_generar_borrador");

    // ── 21 · Cambiar una regla: nuevo borrador sin sobrescribir el anterior ─
    const previa = ultima(vista, f1.id);
    await llamar(REGLAS, "desactivarReglaConcepto", { cliente_id: a.clienteId, regla_id: reglaIngreso.regla_id ?? reglaIngreso.id, motivo: MOTIVO }, a.token);
    await llamar(REGLAS, "guardarReglaConcepto", {
      cliente_id: a.clienteId, clave_prod_serv: CLAVE_INGRESO, cuenta: "401-002",
      tratamiento_iva: "trasladado", tipo_operacion: "ingreso", vigencia_desde: "2026-01-01", motivo: MOTIVO,
    }, a.token);
    await llamar(POLIZAS, "generarBorradoresCanonicos", { cliente_id: a.clienteId, periodo: PERIODO }, a.token);
    vista = await leer();
    const historicas = deCfdi(vista, f1.id);
    const conservada = historicas.find((p) => p.id === previa.id);
    const nueva = historicas.find((p) => p.id !== previa.id);
    const ok21 = historicas.length === 2 &&
      (conservada?.poliza_renglones ?? []).some((r) => r.cuenta === "401-001") &&
      (nueva?.poliza_renglones ?? []).some((r) => r.cuenta === "401-002");
    paso(21, "Cambiar una regla crea un borrador nuevo sin sobrescribir el anterior", ok21,
      "borrador anterior intacto con 401-001 y borrador nuevo con 401-002",
      `borradores=${historicas.length}, anterior_ok=${!!conservada}, nuevo_ok=${!!nueva}`, "llaveIdempotencia / RPC");

    // ── 22 · Aprobación con actor y motivo humano ───────────────────────────
    const aprobable = historicas.find((p) => p.id !== previa.id && p.aprobable) ?? nueva;
    const intento = await rechazado(() => llamar(POLIZAS, "aprobarPoliza",
      { cliente_id: a.clienteId, poliza_id: aprobable.id, motivo: MOTIVO }, a.token));
    if (intento.rechazado) {
      console.log(`   · diagnóstico 22: aprobable=${aprobable.aprobable} cuentas=${(aprobable.poliza_renglones ?? []).map((r) => r.cuenta).join("|")} motivo=${intento.motivo}`);
    }
    vista = await leer();
    const aprobada = vista.polizas.find((p) => p.id === aprobable.id);
    metricas.aprobaciones_humanas = vista.polizas.filter((p) => p.estado === "aprobada" && p.aprobada_por).length;
    paso(22, "Aprobar con actor y motivo humano", aprobada?.estado === "aprobada" && aprobada?.aprobada_por === a.userId,
      "estado=aprobada con actor real", `estado=${aprobada?.estado}, actor_real=${aprobada?.aprobada_por === a.userId}`,
      "poliza_aprobar");

    // ── 23 · La póliza aprobada no admite UPDATE ni DELETE ──────────────────
    const upd = await api.rest("PATCH", `polizas?id=eq.${aprobable.id}`, { token: a.token, cuerpo: { concepto: "alteración" }, representar: true });
    const del = await api.rest("DELETE", `polizas?id=eq.${aprobable.id}`, { token: a.token, representar: true });
    const [tras] = (await api.rest("GET", `polizas?id=eq.${aprobable.id}&select=concepto,estado`)).cuerpo ?? [];
    const ok23 = tras?.estado === "aprobada" && tras?.concepto !== "alteración" &&
      (!upd.ok || (upd.cuerpo ?? []).length === 0) && (!del.ok || (del.cuerpo ?? []).length === 0);
    paso(23, "UPDATE y DELETE de una póliza aprobada quedan rechazados", ok23,
      "ambos intentos sin efecto y póliza intacta",
      `update=${upd.status}/${(upd.cuerpo ?? []).length}, delete=${del.status}/${(del.cuerpo ?? []).length}, estado=${tras?.estado}`,
      "RLS polizas");

    // ── 24 · /app/polizas y el diagnóstico de /app/cierre coinciden ─────────
    const diag = await api.rpc("cierre_diag_polizas", { _cliente_id: a.clienteId, _periodo: PERIODO }, a.token);
    const res = diag.cuerpo?.resultado ?? diag.cuerpo ?? {};
    const ok24 = Number(res.total ?? res.polizas ?? -1) === vista.polizas.length &&
      Number(res.aprobadas ?? -1) === vista.resumen.aprobadas;
    paso(24, "La lista de pólizas y el diagnóstico de cierre leen lo mismo", ok24,
      `total=${vista.polizas.length}, aprobadas=${vista.resumen.aprobadas}`,
      `diagnostico total=${res.total ?? res.polizas}, aprobadas=${res.aprobadas}`, "cierre_diag_polizas");

    // ── 25 · Contrato canónico de exportación ───────────────────────────────
    const lote = await llamar(POLIZAS, "loteExportable", { cliente_id: a.clienteId, periodo: PERIODO }, a.token);
    const totalAprobado = suma(aprobada.poliza_renglones, "cargo_centavos");
    const ok25 = lote.polizas.length === vista.resumen.aprobadas && lote.total_centavos === totalAprobado &&
      lote.rfc === a.rfc && lote.advertencias.length === 0;
    paso(25, "Obtener el contrato canónico de exportación", ok25,
      `1 póliza aprobada por ${totalAprobado} centavos y sin advertencias`,
      `polizas=${lote.polizas.length}, total=${lote.total_centavos}, advertencias=${lote.advertencias.length}`,
      "loteExportable / exportacion");

    // ── 26 · CONTPAQi y Anexo 24 leen renglones, no metadata ───────────────
    const contpaqi = await llamar(EXPORTES, "exportarContpaqi", { cliente_id: a.clienteId, anio: 2026, mes: 7 }, a.token);
    const anexo = await llamar(EXPORTES, "exportarAnexo24Polizas", { cliente_id: a.clienteId, anio: 2026, mes: 7 }, a.token);
    const [metaRow] = (await api.rest("GET", `polizas?id=eq.${aprobable.id}&select=metadata`)).cuerpo ?? [];
    const sinMetadata = !(metaRow?.metadata?.asientos?.length > 0);
    const ok26 = contpaqi.renglones === aprobada.poliza_renglones.length &&
      contpaqi.contenido.includes("401-002") && anexo.contenido.includes('NumCta="401-002"') && sinMetadata;
    paso(26, "CONTPAQi y Anexo 24 leen poliza_renglones y no metadata.asientos", ok26,
      "exportaciones con las cuentas canónicas y metadata.asientos vacío",
      `contpaqi_renglones=${contpaqi.renglones}, anexo_contiene_cuenta=${anexo.contenido.includes('NumCta="401-002"')}, metadata_vacia=${sinMetadata}`,
      "adaptador / export.functions");

    // ── 27 · Aislamiento entre despachos ────────────────────────────────────
    const cruzados = [];
    for (const [nombre, modulo, args] of [
      ["listarPolizasCanonicas", POLIZAS, { cliente_id: a.clienteId, periodo: PERIODO }],
      ["generarBorradoresCanonicos", POLIZAS, { cliente_id: a.clienteId, periodo: PERIODO }],
      ["aprobarPoliza", POLIZAS, { cliente_id: a.clienteId, poliza_id: pF2.id, motivo: MOTIVO }],
      ["importarCatalogo", CATALOGO, { cliente_id: a.clienteId, modo: "agregar", huella: "ataque-qa", cuentas: [{ codigo: "999", nombre: "Intrusa", naturaleza: "deudora" }] }],
      ["loteExportable", POLIZAS, { cliente_id: a.clienteId, periodo: PERIODO }],
    ]) {
      const r = await rechazado(() => llamar(modulo, nombre, args, b.token));
      cruzados.push(`${nombre}:${r.rechazado ? "RECHAZADO" : "PERMITIDO"}`);
      if (r.rechazado) metricas.accesos_cruzados_rechazados += 1;
    }
    paso(27, "El sandbox B no accede al expediente del sandbox A", cruzados.every((x) => x.endsWith("RECHAZADO")),
      "5 intentos rechazados", cruzados.join(", "), "assertClienteScope / RLS");

    // ── 28 · Escrituras directas como authenticated ─────────────────────────
    const directos = [];
    for (const [tabla, fila] of [
      ["catalogo_cuentas", { cliente_id: a.clienteId, despacho_id: a.despachoId, codigo: "999-999", nombre: "Directa", naturaleza: "deudora", activa: true }],
      ["polizas", { cliente_id: a.clienteId, despacho_id: a.despachoId, tipo: "diario", fecha: `${PERIODO}-18`, periodo: PERIODO, concepto: "Directa", monto: 1, estado: "aprobada", origen: "manual" }],
      ["poliza_renglones", { poliza_id: aprobable.id, cliente_id: a.clienteId, despacho_id: a.despachoId, numero: 99, cuenta: "102-001", cargo_centavos: 1, abono_centavos: 0 }],
      ["reglas_concepto", { cliente_id: a.clienteId, despacho_id: a.despachoId, clave_prod_serv: "11111111", cuenta: "601-001", tratamiento_iva: "acreditable", tipo_operacion: "gasto", vigencia_desde: "2026-01-01", origen: "contador" }],
    ]) {
      const r = await api.rest("POST", tabla, { token: a.token, cuerpo: fila, representar: true });
      directos.push(`${tabla}:${r.ok ? "PERMITIDO" : "RECHAZADO"}`);
    }
    paso(28, "Las escrituras directas como authenticated quedan rechazadas", directos.every((x) => x.endsWith("RECHAZADO")),
      "4 escrituras directas rechazadas", directos.join(", "), "GRANT / RLS");

    // ── 29 · Dos generaciones concurrentes: una sola póliza canónica ────────
    const clavesAntes = await api.contar("polizas", `cliente_id=eq.${a.clienteId}`);
    await Promise.all([
      llamar(POLIZAS, "generarBorradoresCanonicos", { cliente_id: a.clienteId, periodo: PERIODO }, a.token).catch(() => null),
      llamar(POLIZAS, "generarBorradoresCanonicos", { cliente_id: a.clienteId, periodo: PERIODO }, a.token).catch(() => null),
    ]);
    const clavesDespues = await api.contar("polizas", `cliente_id=eq.${a.clienteId}`);
    const llaves = (await api.rest("GET", `polizas?cliente_id=eq.${a.clienteId}&select=idempotency_key`)).cuerpo ?? [];
    const unicas = new Set(llaves.map((x) => x.idempotency_key)).size;
    if (clavesDespues !== clavesAntes) metricas.duplicados += clavesDespues - clavesAntes;
    const ok29 = clavesDespues === clavesAntes && unicas === llaves.length;
    paso(29, "Dos generaciones concurrentes producen una sola póliza canónica", ok29,
      "sin pólizas adicionales y llaves de idempotencia únicas",
      `polizas ${clavesAntes}→${clavesDespues}, llaves_unicas=${unicas}/${llaves.length}`,
      "pg_advisory_xact_lock / poliza_generar_borrador");

    // ── 30 · Reapertura pólizas → impuestos → cierre ────────────────────────
    // Precondición: las etapas deben estar “listas” para poder reabrirse. Se
    // siembran con el rol de servicio (fixture), no por el camino de usuario.
    for (const etapa of ["polizas", "impuestos", "cierre"]) {
      const upd = await api.rest("PATCH",
        `cierre_etapas?cliente_id=eq.${a.clienteId}&periodo=eq.${PERIODO}&etapa=eq.${etapa}`,
        { cuerpo: { estado: "lista" }, representar: true });
      if (!(upd.cuerpo ?? []).length) {
        await api.insertar("cierre_etapas", {
          despacho_id: a.despachoId, cliente_id: a.clienteId, periodo: PERIODO, etapa,
          estado: "lista", criterios_cumplidos: [], criterios_pendientes: [], resultado: {}, version: 1,
        });
      }
    }
    // Disparo real: rechazar la póliza aprobada reabre la cadena contable.
    await llamar(POLIZAS, "rechazarPoliza",
      { cliente_id: a.clienteId, poliza_id: aprobable.id, motivo: MOTIVO }, a.token);
    const etapas = (await api.rest("GET",
      `cierre_etapas?cliente_id=eq.${a.clienteId}&periodo=eq.${PERIODO}&select=etapa,estado`)).cuerpo ?? [];
    const eventos = (await api.rest("GET",
      `cierre_eventos?cliente_id=eq.${a.clienteId}&periodo=eq.${PERIODO}&evento=eq.reapertura&select=etapa,fuente`)).cuerpo ?? [];
    const alcanzadas = new Set((eventos ?? []).map((e) => e.etapa));
    const cerradas = etapas.filter((e) => ["polizas", "impuestos", "cierre"].includes(e.etapa) && e.estado === "aprobada");
    const ok30 = ["polizas", "impuestos", "cierre"].every((e) => alcanzadas.has(e)) && cerradas.length === 0;
    paso(30, "Cambiar evidencia o regla reabre pólizas, impuestos y cierre", ok30,
      "reapertura registrada en las tres etapas y ninguna queda aprobada",
      `etapas_reabiertas=${[...alcanzadas].join("|") || "0"}, aprobadas=${cerradas.length}`, "cierre_reabrir_cascada");

    // Métricas contables de la corrida.
    const todos = vista.polizas.flatMap((p) => p.poliza_renglones ?? []);
    metricas.polizas_creadas = vista.polizas.length;
    metricas.versiones_creadas = vista.polizas.reduce((t, p) => t + Number(p.version ?? 1), 0);
    metricas.renglones_creados = todos.length;
    void gen1;
  } finally {
    // ── Limpieza de datos operativos ────────────────────────────────────────
    const OPERATIVAS = [
      "poliza_renglones", "polizas", "conciliaciones", "movimientos_bancarios", "cuentas_bancarias",
      "catalogo_cuentas", "catalogo_importaciones", "reglas_concepto",
      "cierre_snapshots", "cierre_resultado_fiscal", "cierre_etapas", "cierre_periodos",
      "cfdi_decisiones_fiscales", "cfdi_xml", "rfcs", "clientes",
    ];
    const INMUTABLES = ["cierre_eventos", "reglas_concepto_historial", "cierre_reaperturas"];
    for (const u of [a, b].filter(Boolean)) {
      const cfdis = (await api.rest("GET", `cfdi_xml?cliente_id=eq.${u.clienteId}&select=id`)).cuerpo ?? [];
      const ids = cfdis.map((c) => c.id);
      if (ids.length) {
        await api.borrar("cfdi_pago_documentos", `cfdi_id=in.(${ids.join(",")})`);
        await api.borrar("cfdi_pagos", `cfdi_id=in.(${ids.join(",")})`);
        await api.borrar("cfdi_conceptos", `cfdi_id=in.(${ids.join(",")})`);
      }
      for (const t of OPERATIVAS) await api.borrar(t, `cliente_id=eq.${u.clienteId}`);
      await api.borrar("user_roles", `user_id=eq.${u.userId}`);
      await api.borrar("user_memberships", `user_id=eq.${u.userId}`);
      await api.borrar("despachos", `id=eq.${u.despachoId}`);
      await api.borrar("profiles", `id=eq.${u.userId}`);
      await api.borrarUsuario(u.userId);
      for (const t of OPERATIVAS) {
        const n = await api.contar(t, `cliente_id=eq.${u.clienteId}`);
        if (n > 0) residuoDetalle[`${t}:${u.etiqueta}`] = n;
      }
      const d = await api.contar("despachos", `id=eq.${u.despachoId}`);
      if (d > 0) residuoDetalle[`despachos:${u.etiqueta}`] = d;
      for (const t of INMUTABLES) bitacoraRetenida += await api.contar(t, `cliente_id=eq.${u.clienteId}`);
    }
    residuoTotal = Object.values(residuoDetalle).reduce((x, y) => x + y, 0);
  }

  console.log("\n#  | caso | esperado | obtenido | resultado");
  for (const p of pasos) console.log(`${p.n} | ${p.caso} | ${p.esperado} | ${p.obtenido} | ${p.resultado}`);

  console.log(`\nE2E_POLIZAS_RESULTADO=${fallos.length === 0 ? "TODAS_PASARON" : "FALLA"}`);
  console.log(`polizas_creadas=${metricas.polizas_creadas}`);
  console.log(`versiones_creadas=${metricas.versiones_creadas}`);
  console.log(`renglones_creados=${metricas.renglones_creados}`);
  console.log(`aprobaciones_humanas=${metricas.aprobaciones_humanas}`);
  console.log(`duplicados_encontrados=${metricas.duplicados}`);
  console.log(`diferencias_centavos=${metricas.diferencias_centavos}`);
  console.log(`accesos_cruzados_rechazados=${metricas.accesos_cruzados_rechazados}`);
  console.log(`datos_operativos_residuales=${residuoTotal} ${JSON.stringify(residuoDetalle)}`);
  console.log(`bitacora_sandbox_retenida=${bitacoraRetenida}`);

  if (fallos.length > 0) {
    console.error(JSON.stringify({ fallos }, null, 2));
    process.exit(1);
  }
}

await main();
