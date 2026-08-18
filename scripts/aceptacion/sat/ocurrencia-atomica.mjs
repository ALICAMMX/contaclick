// ─────────────────────────────────────────────────────────────────────────────
// ACEPTACIÓN ENFOCADA — RESOLUCIÓN ATÓMICA DE OCURRENCIAS DEL DESPACHADOR SAT
//
// Verifica el RPC `sat_programacion_resolver_ocurrencia`: bitácora, estado y
// avance del calendario viven en UNA sola transacción, con rollback total.
//
// NUNCA contacta al SAT, nunca usa e.firma y nunca toca expedientes reales:
// crea un despacho marcado como sandbox y lo purga al final.
//
//   bun scripts/aceptacion/sat/ocurrencia-atomica.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import { cliente, entorno } from "../fixtures.mjs";
import { llaveOcurrencia } from "../../../src/lib/sat/programacion.ts";

const casos = [];
let n = 0;
function caso(nombre, esperado, obtenido, ok) {
  n++;
  casos.push({ n, nombre, esperado, obtenido: String(obtenido), resultado: ok ? "PASA" : "FALLA" });
  console.log(`${ok ? "✓" : "✗"} ${String(n).padStart(2, "0")} ${nombre} → ${obtenido}`);
}
const igual = (nombre, esperado, obtenido) =>
  caso(nombre, String(esperado), obtenido, String(esperado) === String(obtenido));
// Postgres devuelve "+00:00"; se compara el instante, no el formato.
const instante = (v) => (v ? new Date(v).toISOString() : String(v));
const igualFecha = (nombre, esperado, obtenido) =>
  caso(nombre, instante(esperado), instante(obtenido), instante(esperado) === instante(obtenido));

async function main() {
  const env = entorno();
  if (!env.completo) throw new Error(`Configuración ausente: ${env.faltantes.join(", ")}`);
  const api = cliente(env);

  const qa = randomUUID().slice(0, 8);
  const email = `qa.${qa}.satocur@contaclick-qa.invalid`;
  const password = `Qa-${randomUUID()}`;
  const userId = await api.crearUsuario(email, password);
  const token = await api.iniciarSesion(email, password);
  const desp = await api.rest("PATCH", `despachos?owner_user_id=eq.${userId}`, {
    cuerpo: { es_sandbox: true, nombre: `QA SATOCUR ${qa}`, estado: "activo" },
    representar: true,
  });
  const despachoId = desp.cuerpo?.[0]?.id;
  if (!despachoId) throw new Error("No se creó el despacho sintético.");

  const expedientes = [];
  const nuevoCliente = async (etiqueta) => {
    const [c] = await api.insertar("clientes", {
      despacho_id: despachoId,
      user_id: userId,
      rfc: `Q${etiqueta.slice(0, 2).toUpperCase()}${qa.slice(0, 6).toUpperCase()}A`,
      razon_social: `Expediente QA ${etiqueta} ${qa}`,
      regimen_fiscal: "612",
      tipo_persona: "fisica",
    });
    expedientes.push(c.id);
    return c.id;
  };

  const bloqueo = new Date().toISOString();
  const programada = new Date("2026-08-17T08:00:00.000Z").toISOString();
  const proxima = new Date("2026-08-18T08:00:00.000Z").toISOString();

  const nuevaProg = async (etiqueta, campos = {}) => {
    const cid = await nuevoCliente(etiqueta);
    const [p] = await api.insertar("sat_programaciones", {
      despacho_id: despachoId,
      cliente_id: cid,
      creado_por: userId,
      actualizado_por: userId,
      tipo: "recurrente",
      recurrencia: "diaria",
      hora: 2,
      minuto: 0,
      periodo_opcion: "dia_anterior",
      tolerancia_minutos: 60,
      politica_retraso: "recuperar",
      proxima_ejecucion_at: programada,
      bloqueo_at: bloqueo,
      ...campos,
    });
    return p;
  };
  const leer = async (id) => (await api.rest("GET", `sat_programaciones?id=eq.${id}&select=*`)).cuerpo?.[0];
  const bitacoras = async (id) =>
    (await api.rest("GET", `sat_programacion_bitacora?programacion_id=eq.${id}&select=id,accion,resultado`))
      .cuerpo ?? [];

  const resolver = (args, tok) =>
    api.rpc(
      "sat_programacion_resolver_ocurrencia",
      {
        _bloqueo: bloqueo,
        _programada: programada,
        _proxima: proxima,
        _retraso: 0,
        _detalle: {},
        _avanzar: true,
        _marcar_ejecucion: false,
        ...args,
      },
      tok,
    );

  try {
    // A1. Camino feliz: bitácora + avance en una sola transacción.
    const p1 = await nuevaProg("feliz");
    const clave1 = llaveOcurrencia(p1.id, new Date(programada));
    const r1 = await resolver({
      _programacion: p1.id,
      _ocurrencia: clave1,
      _accion: "ejecucion",
      _resultado: "completada",
      _ultimo_detalle: "ok sintético",
    });
    const e1 = await leer(p1.id);
    const b1 = await bitacoras(p1.id);
    igual("Recibo de resolución exitosa", "resuelta", r1.cuerpo?.estado);
    caso("Recibo trae id de bitácora", "uuid", r1.cuerpo?.bitacora_id, !!r1.cuerpo?.bitacora_id);
    igual("Bitácora escrita una sola vez", 1, b1.length);
    igualFecha("Avanza próxima ejecución", proxima, e1.proxima_ejecucion_at);
    igual("Registra la llave de ocurrencia", clave1, e1.ultima_ocurrencia_key);
    igual("Libera el bloqueo", "null", String(e1.bloqueo_at));
    igual("Guarda el resultado", "completada", e1.ultimo_resultado);

    // A2. Segundo worker con la misma llave: idempotente, sin segunda bitácora.
    const r2 = await resolver({
      _programacion: p1.id,
      _ocurrencia: clave1,
      _accion: "ejecucion",
      _resultado: "completada",
    });
    igual("Misma llave → idempotente", "idempotente", r2.cuerpo?.estado);
    igual("No duplica bitácora (un solo recibo)", 1, (await bitacoras(p1.id)).length);

    // A3. Bloqueo ajeno: otro worker ya tomó la ocurrencia.
    const p3 = await nuevaProg("ajeno");
    const clave3 = llaveOcurrencia(p3.id, new Date(programada));
    const r3 = await resolver({
      _programacion: p3.id,
      _ocurrencia: clave3,
      _accion: "ejecucion",
      _bloqueo: new Date("2020-01-01T00:00:00Z").toISOString(),
    });
    igual("Bloqueo ajeno rechazado", "bloqueo_ajeno", r3.cuerpo?.estado);
    igual("Bloqueo ajeno no deja bitácora", 0, (await bitacoras(p3.id)).length);
    igualFecha("Bloqueo ajeno no avanza el calendario", programada, (await leer(p3.id)).proxima_ejecucion_at);

    // A4. Llave/ocurrencia antigua o distinta a la vigente.
    const r4 = await resolver({
      _programacion: p3.id,
      _ocurrencia: llaveOcurrencia(p3.id, new Date("2026-01-01T08:00:00Z")),
      _programada: new Date("2026-01-01T08:00:00Z").toISOString(),
      _accion: "ejecucion",
    });
    igual("Ocurrencia antigua rechazada", "ocurrencia_rechazada", r4.cuerpo?.estado);
    igual("Ocurrencia antigua no deja bitácora", 0, (await bitacoras(p3.id)).length);

    // A5. Fallo inducido de la bitácora (acción nula): rollback total.
    const r5 = await resolver({ _programacion: p3.id, _ocurrencia: clave3, _accion: null });
    caso("Bitácora inválida → error", "error", r5.status, r5.status >= 400);
    const e5 = await leer(p3.id);
    igualFecha("Fallo de bitácora deja estado intacto", programada, e5.proxima_ejecucion_at);
    igual("Fallo de bitácora no escribe llave", "null", String(e5.ultima_ocurrencia_key));
    igualFecha("Fallo de bitácora conserva el bloqueo (reintento seguro)", bloqueo, e5.bloqueo_at);

    // A6. Fallo inducido del UPDATE (corrida inexistente): sin bitácora huérfana.
    const r6 = await resolver({
      _programacion: p3.id,
      _ocurrencia: clave3,
      _accion: "ejecucion",
      _resultado: "completada",
      _marcar_ejecucion: true,
      _corrida: randomUUID(),
    });
    caso("UPDATE inválido → error", "error", r6.status, r6.status >= 400);
    igual("Sin bitácora huérfana tras fallo de UPDATE", 0, (await bitacoras(p3.id)).length);
    igualFecha("Sin avance tras fallo de UPDATE", programada, (await leer(p3.id)).proxima_ejecucion_at);

    // A7. Encolada: deja recibo pero NO consume la ocurrencia.
    const p7 = await nuevaProg("cola");
    const clave7 = llaveOcurrencia(p7.id, new Date(programada));
    const r7 = await resolver({
      _programacion: p7.id,
      _ocurrencia: clave7,
      _accion: "encolada",
      _resultado: "en_cola",
      _avanzar: false,
      _ultimo_detalle: "En cola por límite global.",
    });
    const e7 = await leer(p7.id);
    igual("Encolada devuelve recibo", "encolada", r7.cuerpo?.estado);
    igual("Encolada deja evidencia en bitácora", 1, (await bitacoras(p7.id)).length);
    igualFecha("Encolada NO se pierde: conserva la ocurrencia", programada, e7.proxima_ejecucion_at);
    igual("Encolada no marca la llave como resuelta", "null", String(e7.ultima_ocurrencia_key));
    igual("Encolada libera el bloqueo para reintentar", "null", String(e7.bloqueo_at));

    // A8. Ejecución fallida conserva evidencia y avanza el calendario.
    const p8 = await nuevaProg("fallo");
    const clave8 = llaveOcurrencia(p8.id, new Date(programada));
    await resolver({
      _programacion: p8.id,
      _ocurrencia: clave8,
      _accion: "fallo",
      _resultado: "fallida",
      _retraso: 1200,
      _detalle: { etapa: "preflight", codigo: "SIN_EFIRMA" },
      _ultimo_detalle: "Preflight sintético fallido",
    });
    const e8 = await leer(p8.id);
    const b8 = await bitacoras(p8.id);
    igual("Fallo conserva evidencia en bitácora", "fallo", b8[0]?.accion);
    igual("Fallo marca el resultado", "fallida", e8.ultimo_resultado);
    igual("Fallo registra retraso", 1200, e8.ultimo_retraso_ms);
    igualFecha("Fallo avanza el calendario", proxima, e8.proxima_ejecucion_at);

    // A9. El RPC es interno: anon y authenticated no pueden ejecutarlo.
    const anon = await api.rpcAnon("sat_programacion_resolver_ocurrencia", {
      _programacion: p8.id,
      _ocurrencia: clave8,
      _programada: programada,
      _bloqueo: bloqueo,
      _accion: "ejecucion",
    });
    caso("Anon no puede ejecutar el RPC", "bloqueado", anon.status, anon.status >= 400);
    const auth = await resolver(
      { _programacion: p8.id, _ocurrencia: clave8, _accion: "ejecucion" },
      token,
    );
    caso("Authenticated no puede ejecutar el RPC", "bloqueado", auth.status, auth.status >= 400);

    // A10. Cero contacto con SAT y e.firma reales.
    const runs = await api.contar("sat_sync_runs", `despacho_id=eq.${despachoId}`);
    const cred = await api.contar("sat_credenciales", `despacho_id=eq.${despachoId}`);
    igual("Cero corridas SAT creadas", 0, runs);
    igual("Cero credenciales e.firma tocadas", 0, cred);
  } finally {
    for (const cid of expedientes) {
      await api.borrar("sat_programacion_bitacora", `cliente_id=eq.${cid}`);
      await api.borrar("sat_programaciones", `cliente_id=eq.${cid}`);
      await api.borrar("clientes", `id=eq.${cid}`);
    }
    await api.borrar("despachos", `id=eq.${despachoId}`);
    await api.borrarUsuario(userId);
    const residuo =
      (await api.contar("sat_programaciones", `despacho_id=eq.${despachoId}`)) +
      (await api.contar("clientes", `despacho_id=eq.${despachoId}`));
    igual("Residuo cero tras la purga", 0, residuo);
  }

  const fallidos = casos.filter((c) => c.resultado === "FALLA");
  console.log(`\n${casos.length - fallidos.length}/${casos.length} casos PASAN`);
  if (fallidos.length) {
    console.log(fallidos.map((c) => `  ✗ ${c.n} ${c.nombre} (esperado ${c.esperado}, obtenido ${c.obtenido})`).join("\n"));
    process.exit(1);
  }
  console.log("DESPACHADOR_OCURRENCIA_ATOMICA=VERIFICADA");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
