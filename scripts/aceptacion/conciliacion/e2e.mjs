// ─────────────────────────────────────────────────────────────────────────────
// E2E SINTÉTICO DEL BLOQUE 1 DE CONCILIACIÓN — CAMINO DE PRODUCCIÓN
//
// Recorre el flujo real de la aplicación llamando a las MISMAS funciones
// servidoras que usa la interfaz (uploadMovimientos, listMovimientos,
// runReconciliation, decidirGrupo) sobre un despacho, usuarios y expediente
// SANDBOX temporales. No usa SAT, e.firma, PAC, IA, correo ni datos reales,
// y al final purga todo lo creado demostrando residuo cero.
//
// Uso:
//   bun --preload ./scripts/aceptacion/conciliacion/precarga-url.mjs \
//       scripts/aceptacion/conciliacion/e2e.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { escribir, SALIDA } from "./generador.mjs";
import { entorno, cliente } from "../fixtures.mjs";
import { llamar, CONCILIACION } from "./serverfn.mjs";
import { parseBankFile } from "../../../src/lib/conciliacion/parsers.ts";

const PERIODO = "2026-07";
const pasos = [];
const fallos = [];

function paso(n, nombre, ok, esperado, obtenido, responsable) {
  pasos.push({ paso: n, nombre, resultado: ok ? "OK" : "FALLA", esperado, obtenido, responsable });
  if (!ok) fallos.push({ paso: n, nombre, esperado, obtenido, responsable });
  console.log(`${ok ? "✓" : "✗"} ${n}. ${nombre} — esperado: ${esperado} | obtenido: ${obtenido}`);
}

async function crearSandbox(api, qa, etiqueta) {
  const email = `qa.conc.${qa}.${etiqueta}@contaclick-qa.invalid`;
  const password = `Qa-${randomUUID()}`;
  const userId = await api.crearUsuario(email, password);
  const token = await api.iniciarSesion(email, password);
  const desp = await api.rest("PATCH", `despachos?owner_user_id=eq.${userId}`, {
    cuerpo: { es_sandbox: true, nombre: `QA CONC ${qa} ${etiqueta}`, estado: "activo" },
    representar: true,
  });
  if (!desp.ok || !desp.cuerpo?.[0]) throw new Error(`Despacho sandbox no creado: ${desp.status}`);
  const despachoId = desp.cuerpo[0].id;
  const rfc = etiqueta === "a" ? "SAND010101AAA" : "SAND020202BBB";
  const [cli] = await api.insertar("clientes", {
    despacho_id: despachoId,
    user_id: userId,
    rfc,
    razon_social: `EXPEDIENTE SANDBOX ${etiqueta.toUpperCase()}`,
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

async function main() {
  const env = entorno();
  if (!env.completo) throw new Error(`Configuración ausente: ${env.faltantes.join(", ")}`);
  const api = cliente(env);
  const qa = randomUUID().slice(0, 8);

  const { manifiesto, cfdi, movimientos: movsEsperados } = escribir();
  const rutaCsv = join(SALIDA, "estado_cuenta.csv");
  const bytes = readFileSync(rutaCsv);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const filas = await parseBankFile(new File([bytes], "estado_cuenta.csv", { type: "text/csv" }));

  let a = null;
  let b = null;
  try {
    // ── 1. Despacho, usuarios y expediente sandbox ───────────────────────────
    a = await crearSandbox(api, qa, "a");
    b = await crearSandbox(api, qa, "b");
    const cfdiFilas = cfdi.map((c) => ({
      despacho_id: a.despachoId,
      cliente_id: a.clienteId,
      rfc_id: a.rfcId,
      uuid: c.uuid,
      archivo_hash: createHash("sha256").update(c.id + qa).digest("hex"),
      version: "4.0",
      moneda: "MXN",
      fecha: c.fecha,
      fecha_timbrado: `${c.fecha}T12:05:00Z`,
      metodo_pago: "PUE",
      forma_pago: "03",
      uso_cfdi: "G03",
      tipo_cfdi: "I",
      direccion: c.direccion,
      rfc_emisor: c.direccion === "emitido" ? a.rfc : c.rfc_contraparte,
      nombre_emisor: c.direccion === "emitido" ? "EXPEDIENTE SANDBOX A" : c.nombre_contraparte,
      rfc_receptor: c.direccion === "emitido" ? c.rfc_contraparte : a.rfc,
      nombre_receptor: c.direccion === "emitido" ? c.nombre_contraparte : "EXPEDIENTE SANDBOX A",
      subtotal: c.total,
      total: c.total,
      periodo: PERIODO,
      clase_documental: c.direccion === "emitido" ? "ingreso" : "gasto",
      estado_procesamiento: "normalizado",
      estatus_sat: "sintetico_no_verificado",
      estatus_sat_fuente: "laboratorio_sintetico",
      origen: "laboratorio_qa",
    }));
    for (let i = 0; i < cfdiFilas.length; i += 100) await api.insertar("cfdi_xml", cfdiFilas.slice(i, i + 100));
    paso(1, "Despacho, usuarios y expediente sandbox creados", true, "2 despachos sandbox + 112 CFDI sintéticos",
      `despachos=2, cfdi=${cfdiFilas.length}`, "fixtures sandbox");

    // ── 2. Importación por la función servidora real ─────────────────────────
    const carga = {
      cliente_id: a.clienteId,
      banco: "BANCO SANDBOX",
      alias: "Cuenta laboratorio",
      mask: "****0000",
      archivo: { sha256, nombre: "estado_cuenta.csv", bytes: bytes.length, formato: "csv" },
      movimientos: filas.map((f) => ({
        fecha: f.fecha,
        descripcion: f.descripcion,
        referencia: f.referencia ?? null,
        cargo: f.cargo ?? 0,
        abono: f.abono ?? 0,
        saldo: f.saldo ?? null,
        moneda: "MXN",
      })),
    };
    const imp = await llamar(CONCILIACION, "uploadMovimientos", carga, a.token);
    paso(2, "Importar estado de cuenta con uploadMovimientos", imp.inserted === 97 && !imp.reimportacion,
      "97 movimientos insertados", `insertados=${imp.inserted}, reimportacion=${imp.reimportacion}`,
      "uploadMovimientos");

    // ── 3. Conteo y conservación de operaciones idénticas legítimas ──────────
    const totMov = await api.contar("movimientos_bancarios", `cliente_id=eq.${a.clienteId}`);
    const dupResp = await api.rest(
      "GET",
      `movimientos_bancarios?cliente_id=eq.${a.clienteId}&select=id,fecha,descripcion,cargo,abono`,
    );
    const porHash = new Map();
    // Operación idéntica = misma fecha, concepto e importe (la referencia bancaria difiere).
    for (const m of dupResp.cuerpo ?? []) {
      const k = `${m.fecha}|${m.descripcion}|${m.cargo}|${m.abono}`;
      porHash.set(k, (porHash.get(k) ?? 0) + 1);
    }
    const gemelos = [...porHash.values()].filter((n) => n === 2).length;
    paso(3, "97 movimientos y las dos operaciones idénticas conservadas", totMov === 97 && gemelos === 1,
      "97 movimientos y 1 par idéntico conservado (2 filas)", `movimientos=${totMov}, pares idénticos=${gemelos}`,
      "movimientos_bancarios");

    // ── 4. Reimportación idempotente ─────────────────────────────────────────
    const imp2 = await llamar(CONCILIACION, "uploadMovimientos", { ...carga, cuenta_id: imp.cuenta_id }, a.token);
    const totMov2 = await api.contar("movimientos_bancarios", `cliente_id=eq.${a.clienteId}`);
    paso(4, "Reimportar el mismo archivo no agrega movimientos",
      imp2.reimportacion === true && imp2.inserted === 0 && totMov2 === 97,
      "0 movimientos adicionales", `insertados=${imp2.inserted}, total=${totMov2}`, "uploadMovimientos");

    // ── 5. Listado real del periodo ──────────────────────────────────────────
    const lista = await llamar(CONCILIACION, "listMovimientos", { cliente_id: a.clienteId, periodo: PERIODO, limit: 500 }, a.token);
    paso(5, "Consultar el periodo con listMovimientos", lista.movimientos.length === 97,
      "97 movimientos listados", `listados=${lista.movimientos.length}`, "listMovimientos");

    const diagAntes = await api.rpc("cierre_diag_bancos", { _cliente_id: a.clienteId, _periodo: PERIODO });

    // ── 6. Conciliación por runReconciliation ────────────────────────────────
    const corrida = await llamar(CONCILIACION, "runReconciliation",
      { cliente_id: a.clienteId, periodo: PERIODO, dias_ventana: 5, tolerancia_centavos: 0 }, a.token);
    const grupos = (await api.rest("GET",
      `conciliacion_grupos?cliente_id=eq.${a.clienteId}&select=id,estado,nivel_propuesta,confirmado_por,origen,periodo`)).cuerpo ?? [];
    paso(6, "Ejecutar la conciliación con runReconciliation", grupos.length > 0,
      "grupos persistidos por la función servidora", `grupos=${grupos.length}, version=${corrida.version}`,
      "runReconciliation / conciliacion_ejecutar_corrida");

    // ── 7. Sólo propuestas, sin confirmaciones automáticas y bitácora ────────
    const noPropuestos = grupos.filter((g) => g.estado !== "propuesto").length;
    const autoConfirmados = grupos.filter((g) => g.confirmado_por).length;
    const alta = grupos.filter((g) => g.nivel_propuesta === "automatica_alta_confianza").length;
    const bit = (await api.rest("GET",
      `conciliacion_bitacora?cliente_id=eq.${a.clienteId}&select=accion,actor,detalle,estado_nuevo`)).cuerpo ?? [];
    const bitPropuesta = bit.filter((x) => x.accion === "propuesta");
    const bitOk = bitPropuesta.length > 0 &&
      bitPropuesta.every((x) => x.detalle?.origen === "motor" && x.actor === a.userId && x.estado_nuevo === "propuesto");
    const ok7 = noPropuestos === 0 && autoConfirmados === 0 && alta === 66 && bitOk;
    paso(7, "Sólo propuestas, cero autoconfirmaciones, 66 de alta confianza y bitácora íntegra", ok7,
      "no_propuestos=0, autoconfirmados=0, alta_confianza=66, bitácora propuesta/motor/actor real",
      `no_propuestos=${noPropuestos}, autoconfirmados=${autoConfirmados}, alta_confianza=${alta}, bitacora_ok=${bitOk}`,
      "conciliacion_grupos / conciliacion_bitacora");

    // ── 8. Confirmación humana con decidirGrupo ──────────────────────────────
    const paraConfirmar = grupos.find((g) => g.nivel_propuesta === "automatica_alta_confianza");
    await llamar(CONCILIACION, "decidirGrupo",
      { cliente_id: a.clienteId, grupo_id: paraConfirmar.id, accion: "confirmar" }, a.token);
    const [confirmado] = (await api.rest("GET",
      `conciliacion_grupos?id=eq.${paraConfirmar.id}&select=estado,confirmado_por,confirmado_at`)).cuerpo ?? [];
    paso(8, "Confirmar una propuesta con decidirGrupo",
      confirmado?.estado === "confirmado" && confirmado?.confirmado_por === a.userId && !!confirmado?.confirmado_at,
      "estado=confirmado con actor y sello de tiempo reales",
      `estado=${confirmado?.estado}, actor_real=${confirmado?.confirmado_por === a.userId}, at=${!!confirmado?.confirmado_at}`,
      "decidirGrupo / conciliacion_confirmar_grupo");

    // ── 9. Evento inmutable y aumento de cobertura ───────────────────────────
    const [evento] = (await api.rest("GET",
      `conciliacion_bitacora?grupo_id=eq.${paraConfirmar.id}&accion=eq.confirmar&select=id,actor`)).cuerpo ?? [];
    const intentoEdicion = await api.rest("PATCH", `conciliacion_bitacora?id=eq.${evento?.id}`, { cuerpo: { motivo: "alteración" } });
    const intentoBorrado = await api.rest("DELETE", `conciliacion_bitacora?id=eq.${evento?.id}`);
    const diagDespues = await api.rpc("cierre_diag_bancos", { _cliente_id: a.clienteId, _periodo: PERIODO });
    // cierre_diag_bancos@5 publica la cobertura humana en resultado.movimientos_confirmados_por_persona.
    const covAntes = diagAntes.cuerpo?.resultado?.movimientos_confirmados_por_persona ?? 0;
    const covDespues = diagDespues.cuerpo?.resultado?.movimientos_confirmados_por_persona ?? 0;
    const ok9 = !!evento && evento.actor === a.userId && !intentoEdicion.ok && !intentoBorrado.ok && covDespues === covAntes + 1;
    paso(9, "Evento inmutable y cobertura bancaria actualizada", ok9,
      "evento con actor real, edición y borrado rechazados, conciliados +1",
      `evento=${!!evento}, edicion_bloqueada=${!intentoEdicion.ok}, borrado_bloqueado=${!intentoBorrado.ok}, conciliados ${covAntes}→${covDespues}`,
      "conciliacion_bitacora / cierre_diag_bancos");

    // ── 10. Rechazo con motivo y no reaparición del par ──────────────────────
    const paraRechazar = grupos.find((g) => g.id !== paraConfirmar.id && g.nivel_propuesta === "automatica_alta_confianza");
    const [miembroRechazado] = (await api.rest("GET",
      `conciliaciones?grupo_id=eq.${paraRechazar.id}&select=movimiento_id,cfdi_id`)).cuerpo ?? [];
    await llamar(CONCILIACION, "decidirGrupo", {
      cliente_id: a.clienteId,
      grupo_id: paraRechazar.id,
      accion: "rechazar",
      motivo: "El comprobante no corresponde a esta operación bancaria del laboratorio sintético.",
    }, a.token);
    await llamar(CONCILIACION, "runReconciliation",
      { cliente_id: a.clienteId, periodo: PERIODO, dias_ventana: 5, tolerancia_centavos: 0 }, a.token);
    const miembros = (await api.rest("GET",
      `conciliaciones?cliente_id=eq.${a.clienteId}&movimiento_id=eq.${miembroRechazado.movimiento_id}&cfdi_id=eq.${miembroRechazado.cfdi_id}&select=id,estado_grupo`)).cuerpo ?? [];
    const reapareció = miembros.filter((m) => m.estado_grupo === "propuesto").length;
    paso(10, "Par rechazado con motivo no reaparece en otra corrida", reapareció === 0,
      "0 reapariciones del par rechazado", `reapariciones=${reapareció}`, "runReconciliation / motor pares_rechazados");

    // ── 11. Idempotencia de la corrida ───────────────────────────────────────
    const gruposAntes = await api.contar("conciliacion_grupos", `cliente_id=eq.${a.clienteId}`);
    const corridasAntes = await api.contar("conciliacion_corridas", `cliente_id=eq.${a.clienteId}`);
    await llamar(CONCILIACION, "runReconciliation",
      { cliente_id: a.clienteId, periodo: PERIODO, dias_ventana: 5, tolerancia_centavos: 0 }, a.token);
    const gruposDespues = await api.contar("conciliacion_grupos", `cliente_id=eq.${a.clienteId}`);
    const corridasDespues = await api.contar("conciliacion_corridas", `cliente_id=eq.${a.clienteId}`);
    paso(11, "Repetir la misma corrida es idempotente",
      gruposAntes === gruposDespues && corridasAntes === corridasDespues,
      "sin grupos ni corridas adicionales",
      `grupos ${gruposAntes}→${gruposDespues}, corridas ${corridasAntes}→${corridasDespues}`,
      "conciliacion_ejecutar_corrida");

    // ── 12. Aislamiento entre despachos ──────────────────────────────────────
    const intentos = [];
    for (const [nombre, args] of [
      ["listMovimientos", { cliente_id: a.clienteId, periodo: PERIODO, limit: 10 }],
      ["runReconciliation", { cliente_id: a.clienteId, periodo: PERIODO, dias_ventana: 5, tolerancia_centavos: 0 }],
      ["decidirGrupo", { cliente_id: a.clienteId, grupo_id: paraConfirmar.id, accion: "rechazar", motivo: "Intento de acceso no autorizado desde otro despacho." }],
    ]) {
      try {
        await llamar(CONCILIACION, nombre, args, b.token);
        intentos.push(`${nombre}:PERMITIDO`);
      } catch {
        intentos.push(`${nombre}:RECHAZADO`);
      }
    }
    paso(12, "Un segundo despacho no accede al expediente ajeno", intentos.every((x) => x.endsWith("RECHAZADO")),
      "3 intentos rechazados", intentos.join(", "), "assertClienteScope / RLS");

    // ── 12b. La RPC de corridas no es invocable por el navegador ─────────────
    const rpcAuth = await api.rpc("conciliacion_ejecutar_corrida", {
      _cliente_id: a.clienteId, _periodo: PERIODO, _actor: a.userId, _idempotency_key: "ataque",
      _input_hash: "ataque", _algoritmo_version: "x", _parametros: {}, _grupos: [], _dias_ventana: 5,
    }, a.token);
    const rpcAnon = await api.rpcAnon("conciliacion_ejecutar_corrida", {
      _cliente_id: a.clienteId, _periodo: PERIODO, _actor: a.userId, _idempotency_key: "ataque",
      _input_hash: "ataque", _algoritmo_version: "x", _parametros: {}, _grupos: [], _dias_ventana: 5,
    });
    paso(13, "authenticated y anon no pueden invocar conciliacion_ejecutar_corrida",
      !rpcAuth.ok && !rpcAnon.ok, "ambos rechazados",
      `authenticated=${rpcAuth.status}, anon=${rpcAnon.status}`, "GRANT conciliacion_ejecutar_corrida");
  } finally {
    // ── 14. Purga y residuo cero ─────────────────────────────────────────────
    const TABLAS = [
      "conciliacion_bitacora",
      "conciliacion_score_historico",
      "conciliaciones",
      "conciliacion_grupos",
      "conciliacion_corridas",
      "conciliacion_importaciones",
      "movimientos_bancarios",
      "cuentas_bancarias",
      "cfdi_xml",
      "rfcs",
      "clientes",
    ];
    const restantes = {};
    for (const u of [a, b].filter(Boolean)) {
      await api.borrar("conciliacion_respaldo_bloque1", `despacho_id=eq.${u.despachoId}`);
      for (const t of TABLAS) await api.borrar(t, `cliente_id=eq.${u.clienteId}`);
      await api.borrar("user_roles", `user_id=eq.${u.userId}`);
      await api.borrar("user_memberships", `user_id=eq.${u.userId}`);
      await api.borrar("despachos", `id=eq.${u.despachoId}`);
      await api.borrar("profiles", `id=eq.${u.userId}`);
      await api.borrarUsuario(u.userId);
      for (const t of TABLAS) {
        const n = await api.contar(t, `cliente_id=eq.${u.clienteId}`);
        if (n > 0) restantes[`${t}:${u.etiqueta}`] = n;
      }
      const d = await api.contar("despachos", `id=eq.${u.despachoId}`);
      if (d > 0) restantes[`despachos:${u.etiqueta}`] = d;
    }
    const total = Object.values(restantes).reduce((x, y) => x + y, 0);
    paso(14, "Purga completa del sandbox con residuo cero", total === 0, "residuo=0",
      `residuo=${total} ${JSON.stringify(restantes)}`, "purga E2E");
  }

  console.log("\n" + JSON.stringify({ manifiesto: manifiesto.conteos, pasos, fallos }, null, 2));
  if (fallos.length > 0) {
    console.error("E2E NO SUPERADO");
    process.exit(1);
  }
  console.log("E2E SUPERADO");
}

await main();
