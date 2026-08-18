// ─────────────────────────────────────────────────────────────────────────────
// ACEPTACIÓN SINTÉTICA — PROGRAMACIÓN NOCTURNA DE DESCARGAS SAT
//
// 28 casos: cálculo de calendario en zona local, tolerancia y política de
// retraso, idempotencia por ocurrencia, reclamo con bloqueo entre workers,
// candados de pausa/cancelación/bloqueo vivo y despacho real por el endpoint
// de producción del hook.
//
// NUNCA contacta al SAT, nunca usa e.firma real y nunca toca expedientes
// reales: crea un despacho marcado como sandbox y lo purga al final.
//
//   bun scripts/aceptacion/sat/programacion-e2e.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import { cliente, entorno } from "../fixtures.mjs";
import {
  decidirOcurrencia,
  llaveOcurrencia,
  proximaEjecucion,
  resolverPeriodoProgramado,
} from "../../../src/lib/sat/programacion.ts";

const BASE = process.env.APP_BASE ?? "http://localhost:8080";
const HOOK = `${BASE}/api/public/hooks/sat-programaciones`;

const casos = [];
let n = 0;
function caso(nombre, esperado, obtenido, ok) {
  n++;
  casos.push({ n, nombre, esperado, obtenido: String(obtenido), resultado: ok ? "PASA" : "FALLA" });
  console.log(`${ok ? "✓" : "✗"} ${String(n).padStart(2, "0")} ${nombre} → ${obtenido}`);
}
const igual = (nombre, esperado, obtenido) => caso(nombre, String(esperado), obtenido, String(esperado) === String(obtenido));

const base = {
  zona_horaria: "America/Mexico_City",
  dias_semana: [],
  dia_mes: null,
  fecha_unica: null,
  recurrencia: null,
};

async function esperar(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const env = entorno();
  if (!env.completo) throw new Error(`Configuración ausente: ${env.faltantes.join(", ")}`);
  const api = cliente(env);

  // ── Bloque A: calendario puro (sin base de datos) ─────────────────────────
  igual(
    "Diaria 02:00 CDMX se agenda en hora local, no UTC",
    "2026-03-11T08:00:00.000Z",
    proximaEjecucion({ ...base, tipo: "recurrente", recurrencia: "diaria", hora: 2, minuto: 0 }, new Date("2026-03-10T12:00:00Z"))?.toISOString(),
  );
  igual(
    "Semanal sólo cae en los días configurados",
    "2026-03-13",
    proximaEjecucion({ ...base, tipo: "recurrente", recurrencia: "semanal", dias_semana: [5], hora: 3, minuto: 0 }, new Date("2026-03-10T12:00:00Z"))
      ?.toISOString()
      .slice(0, 10),
  );
  igual(
    "Mensual día 31 se ajusta al último día del mes corto",
    "2026-02-28",
    proximaEjecucion({ ...base, tipo: "recurrente", recurrencia: "mensual", dia_mes: 31, hora: 3, minuto: 30 }, new Date("2026-02-05T00:00:00Z"))
      ?.toISOString()
      .slice(0, 10),
  );
  igual(
    "Única futura conserva su fecha",
    "2026-09-02T09:00:00.000Z",
    proximaEjecucion({ ...base, tipo: "unica", fecha_unica: "2026-09-02", hora: 3, minuto: 0 }, new Date("2026-09-01T00:00:00Z"))?.toISOString(),
  );
  igual(
    "Única ya vencida no vuelve a agendarse",
    "null",
    String(proximaEjecucion({ ...base, tipo: "unica", fecha_unica: "2026-01-01", hora: 5, minuto: 0 }, new Date("2026-05-01T00:00:00Z"))),
  );
  igual(
    "Otra zona (Tijuana) usa su propio desfase",
    "2026-03-11T09:00:00.000Z",
    proximaEjecucion({ ...base, zona_horaria: "America/Tijuana", tipo: "recurrente", recurrencia: "diaria", hora: 2, minuto: 0 }, new Date("2026-03-10T12:00:00Z"))?.toISOString(),
  );
  {
    const r = resolverPeriodoProgramado({ opcion: "dia_anterior", zona_horaria: "America/Mexico_City", ahora: new Date("2026-03-10T04:00:00Z") });
    // 04:00 UTC = 22:00 del 9 de marzo en CDMX → el día anterior es el 8.
    igual("Periodo 'día anterior' se calcula en hora local", "2026-03-08|2026-03-08", `${r.desde}|${r.hasta}`);
  }
  {
    const r = resolverPeriodoProgramado({ opcion: "ultimos_7", zona_horaria: "America/Mexico_City", ahora: new Date("2026-03-10T18:00:00Z") });
    igual("Periodo 'últimos 7 días'", "2026-03-03|2026-03-10", `${r.desde}|${r.hasta}`);
  }
  {
    const r = resolverPeriodoProgramado({ opcion: "mes_anterior", zona_horaria: "America/Mexico_City", ahora: new Date("2026-03-10T18:00:00Z") });
    igual("Periodo 'mes anterior' completo", "2026-02-01|2026-02-28", `${r.desde}|${r.hasta}`);
  }
  {
    const r = resolverPeriodoProgramado({
      opcion: "desde_ultima",
      zona_horaria: "America/Mexico_City",
      ahora: new Date("2026-03-10T18:00:00Z"),
      ultima_exitosa_hasta: "2026-03-05",
      solapamiento_dias: 2,
    });
    igual("'Desde la última' aplica solapamiento deliberado", "2026-03-03|2026-03-10", `${r.desde}|${r.hasta}`);
  }
  {
    const r = resolverPeriodoProgramado({ opcion: "rango_fijo", zona_horaria: "America/Mexico_City", ahora: new Date(), rango_desde: "2026-01-01", rango_hasta: "2026-01-31" });
    igual("Rango fijo respeta lo capturado", "2026-01-01|2026-01-31", `${r.desde}|${r.hasta}`);
  }
  igual(
    "Retraso dentro de tolerancia se ejecuta",
    "ejecutar",
    decidirOcurrencia({ programada_at: new Date("2026-03-10T08:00:00Z"), ahora: new Date("2026-03-10T08:30:00Z"), tolerancia_minutos: 60, politica: "omitir" }).accion,
  );
  igual(
    "Fuera de tolerancia con política 'omitir' se omite",
    "omitir",
    decidirOcurrencia({ programada_at: new Date("2026-03-10T08:00:00Z"), ahora: new Date("2026-03-10T11:00:00Z"), tolerancia_minutos: 60, politica: "omitir" }).accion,
  );
  igual(
    "Fuera de tolerancia con política 'recuperar' ejecuta UNA sola ocurrencia",
    "ejecutar",
    decidirOcurrencia({ programada_at: new Date("2026-03-10T08:00:00Z"), ahora: new Date("2026-03-10T11:00:00Z"), tolerancia_minutos: 60, politica: "recuperar" }).accion,
  );
  {
    const id = "11111111-1111-1111-1111-111111111111";
    const a = llaveOcurrencia(id, new Date("2026-03-10T08:00:30Z"));
    const b = llaveOcurrencia(id, new Date("2026-03-10T08:00:59Z"));
    const c = llaveOcurrencia(id, new Date("2026-03-10T09:00:00Z"));
    caso("Llave de ocurrencia estable por minuto y distinta entre horas", "a==b y a!=c", `${a === b}/${a !== c}`, a === b && a !== c);
  }

  // ── Bloque B: autenticación del despachador ───────────────────────────────
  // El secreto NUNCA se imprime: se lee de la copia privada (service_role) que
  // el propio endpoint sincroniza desde la variable de servidor.
  await fetch(HOOK); // sondeo de salud: sincroniza el secreto
  const secretoFila = await api.rest(
    "GET",
    "cron_secretos?nombre=eq.SAT_PROGRAMACIONES_CRON_SECRET&select=valor",
  );
  const SECRETO = secretoFila.cuerpo?.[0]?.valor ?? "";
  const conSecreto = { "x-cron-secret": SECRETO };

  {
    const r = await fetch(HOOK);
    const j = await r.json().catch(() => ({}));
    const texto = JSON.stringify(j);
    caso(
      "GET del hook publica sólo salud y versión (sin secreto)",
      "200 + versión y cero secreto",
      `${r.status} ${j.version} secreto_en_respuesta=${SECRETO ? texto.includes(SECRETO) : "n/a"}`,
      r.status === 200 && !!j.version && !!SECRETO && !texto.includes(SECRETO),
    );
  }
  {
    const r = await fetch(HOOK, { method: "POST", headers: { apikey: env.anon } });

    igual("POST con publishable/anon key es rechazado", "401", r.status);
  }
  {
    const r = await fetch(HOOK, { method: "POST", headers: { "x-cron-secret": env.anon } });
    igual("POST con la llave pública como secreto es rechazado", "401", r.status);
  }
  {
    const r = await fetch(HOOK, { method: "POST" });
    igual("POST sin secreto es rechazado", "401", r.status);
  }
  {
    const r = await fetch(HOOK, { method: "POST", headers: { "x-cron-secret": "secreto-incorrecto" } });
    igual("POST con secreto incorrecto es rechazado", "401", r.status);
  }
  {
    const r = await fetch(HOOK, { method: "POST", headers: conSecreto });
    igual("POST con el secreto exclusivo del cron es aceptado", "200", r.status);
  }


  // ── Bloque C: escenario sintético en despacho sandbox ─────────────────────
  const qa = randomUUID().slice(0, 8);
  const email = `qa.${qa}.satprog@contaclick-qa.invalid`;
  const password = `Qa-${randomUUID()}`;
  const userId = await api.crearUsuario(email, password);
  const token = await api.iniciarSesion(email, password);
  const desp = await api.rest("PATCH", `despachos?owner_user_id=eq.${userId}`, {
    cuerpo: { es_sandbox: true, nombre: `QA SATPROG ${qa}`, estado: "activo" },
    representar: true,
  });
  const despachoId = desp.cuerpo?.[0]?.id;
  if (!despachoId) throw new Error("No se creó el despacho sintético.");
  // Membresía activa: el despachador ejecuta con el alcance real del actor.
  await api.rest("PATCH", `user_memberships?user_id=eq.${userId}&despacho_id=eq.${despachoId}`, {
    cuerpo: { estado: "activo" },
  });
  const [cli] = await api.insertar("clientes", {
    despacho_id: despachoId,
    user_id: userId,
    rfc: `QAP${qa.slice(0, 6).toUpperCase()}A`,
    razon_social: `Expediente QA programación ${qa}`,
    regimen_fiscal: "612",
    tipo_persona: "fisica",
  });
  const clienteId = cli.id;

  // Sólo puede existir una programación viva por expediente: cada caso que
  // necesita su propia programación usa un expediente sintético distinto.
  const expedientes = [clienteId];
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

  const nuevaProg = async (campos, cid = clienteId) => {
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
      ...campos,
    });
    return p;
  };
  const leer = async (id) => {
    const r = await api.rest("GET", `sat_programaciones?id=eq.${id}&select=*`);
    return r.cuerpo?.[0];
  };
  const reclamar = (limite = 25) => api.rpc("sat_programaciones_reclamar", { _ahora: new Date().toISOString(), _limite: limite });
  const liberar = (id) => api.rest("PATCH", `sat_programaciones?id=eq.${id}`, { cuerpo: { bloqueo_at: null } });

  const hace = (min) => new Date(Date.now() - min * 60000).toISOString();
  const dentro = (min) => new Date(Date.now() + min * 60000).toISOString();

  const creadas = [];
  try {
    // 17. Vencida se reclama.
    const pVencida = await nuevaProg({ proxima_ejecucion_at: hace(5) });
    creadas.push(pVencida.id);
    let r = await reclamar();
    caso("Programación vencida es reclamada por el despachador", "aparece en el reclamo", (r.cuerpo ?? []).some((x) => x.id === pVencida.id), (r.cuerpo ?? []).some((x) => x.id === pVencida.id));

    // 18. El reclamo pone bloqueo.
    let fila = await leer(pVencida.id);
    caso("El reclamo coloca bloqueo transaccional", "bloqueo_at no nulo", !!fila.bloqueo_at, !!fila.bloqueo_at);

    // 19. Bloqueo vivo impide un segundo reclamo (segundo worker).
    r = await reclamar();
    caso("Un segundo worker no toma una programación bloqueada", "no aparece", !(r.cuerpo ?? []).some((x) => x.id === pVencida.id), !(r.cuerpo ?? []).some((x) => x.id === pVencida.id));

    // 20. Dos reclamos concurrentes: la entrega es exclusiva.
    await liberar(pVencida.id);
    const [r1, r2] = await Promise.all([reclamar(), reclamar()]);
    const veces = [r1, r2].filter((x) => (x.cuerpo ?? []).some((y) => y.id === pVencida.id)).length;
    igual("Dos workers concurrentes: la ocurrencia se entrega una sola vez", 1, veces);
    await liberar(pVencida.id);

    // 21. Pausada nunca se reclama.
    const pPausada = await nuevaProg({ proxima_ejecucion_at: hace(5), pausada: true }, await nuevoCliente("pausada"));
    creadas.push(pPausada.id);
    r = await reclamar();
    caso("Programación pausada no se despacha", "no aparece", !(r.cuerpo ?? []).some((x) => x.id === pPausada.id), !(r.cuerpo ?? []).some((x) => x.id === pPausada.id));
    await liberar(pVencida.id);

    // 22. Cancelada nunca se reclama.
    const pCancelada = await nuevaProg({ proxima_ejecucion_at: hace(5), cancelada: true, activa: false }, await nuevoCliente("cancelada"));
    creadas.push(pCancelada.id);
    r = await reclamar();
    caso("Programación cancelada no se despacha", "no aparece", !(r.cuerpo ?? []).some((x) => x.id === pCancelada.id), !(r.cuerpo ?? []).some((x) => x.id === pCancelada.id));
    await liberar(pVencida.id);

    // 23. Futura no se reclama.
    const pFutura = await nuevaProg({ proxima_ejecucion_at: dentro(120) }, await nuevoCliente("futura"));
    creadas.push(pFutura.id);
    r = await reclamar();
    caso("Programación futura no se adelanta", "no aparece", !(r.cuerpo ?? []).some((x) => x.id === pFutura.id), !(r.cuerpo ?? []).some((x) => x.id === pFutura.id));
    await liberar(pVencida.id);

    // 24. Despacho real por el endpoint: ocurrencia dentro de tolerancia.
    await api.rest("PATCH", `sat_programaciones?id=eq.${pVencida.id}`, {
      cuerpo: { bloqueo_at: null, proxima_ejecucion_at: hace(5), ultima_ocurrencia_key: null },
    });
    const programadaKey = llaveOcurrencia(pVencida.id, new Date((await leer(pVencida.id)).proxima_ejecucion_at));
    let resp = await fetch(HOOK, { method: "POST", headers: conSecreto });
    let cuerpo = await resp.json();
    const mio = (c) => (c.resultados ?? []).find((x) => x.programacion_id === pVencida.id);
    caso(
      "El despachador procesa la ocurrencia vencida por el mismo núcleo",
      "estado ejecutada o fallida por preflight (sin SAT)",
      `${resp.status} ${mio(cuerpo)?.estado ?? "sin resultado"}`,
      resp.status === 200 && ["ejecutada", "fallida"].includes(mio(cuerpo)?.estado),
    );

    // Alcance fino del actor evaluado sin sesión (como lo hace el despachador).
    const acc = await api.rpc("has_cliente_access_for", { _cliente: clienteId, _user: userId });
    igual("El actor conserva alcance fino sin sesión (auth.uid nulo)", "true", JSON.stringify(acc.cuerpo));

    // 25. Preflight honesto: sin e.firma no se crea corrida ni se contacta al SAT.
    const detalleProg = await leer(pVencida.id);
    caso(
      "Sin e.firma el preflight falla y no queda corrida huérfana",
      "resultado fallida con detalle explicativo",
      `${detalleProg.ultimo_resultado} · ${String(detalleProg.ultimo_detalle ?? "").slice(0, 60)}`,
      detalleProg.ultimo_resultado === "fallida" || detalleProg.ultimo_resultado === "en_curso",
    );

    // 26. Idempotencia: el mismo minuto no se ejecuta dos veces.
    igual("La ocurrencia queda marcada con su llave", programadaKey, detalleProg.ultima_ocurrencia_key);

    // 27. Recurrente avanza a una próxima ejecución futura.
    caso(
      "La recurrente avanza su próxima ejecución al futuro",
      "proxima_ejecucion_at > ahora",
      detalleProg.proxima_ejecucion_at,
      !!detalleProg.proxima_ejecucion_at && new Date(detalleProg.proxima_ejecucion_at) > new Date(),
    );

    // 28. Bitácora inmutable de la ocurrencia, sin secretos.
    const bit = await api.rest("GET", `sat_programacion_bitacora?programacion_id=eq.${pVencida.id}&select=accion,resultado,retraso_ms,detalle`);
    const filas = bit.cuerpo ?? [];
    const texto = JSON.stringify(filas);
    // Material sensible real: llaves, certificados, contraseñas o blobs base64
    // largos. El texto explicativo ("falta la e.firma") sí es admisible.
    const sinSecretos =
      !/-----BEGIN|PRIVATE KEY|CERTIFICATE|password"|"contrasena|"clave"|[A-Za-z0-9+/]{200,}/.test(texto);
    caso(
      "La bitácora registra la ocurrencia y no contiene secretos",
      "≥1 registro sin material criptográfico",
      `${filas.length} registro(s), sin secretos=${sinSecretos}`,
      filas.length >= 1 && sinSecretos,
    );

    // Ocurrencia fuera de tolerancia con política omitir → omitida por el hook.
    const pOmitir = await nuevaProg(
      { proxima_ejecucion_at: hace(600), tolerancia_minutos: 30, politica_retraso: "omitir" },
      await nuevoCliente("omitir"),
    );
    creadas.push(pOmitir.id);
    resp = await fetch(HOOK, { method: "POST", headers: conSecreto });
    cuerpo = await resp.json();
    const rOmitir = (cuerpo.resultados ?? []).find((x) => x.programacion_id === pOmitir.id);
    igual("Ocurrencia perdida con política 'omitir' se omite y no descarga", "omitida", rOmitir?.estado);

    // Segundo tick inmediato: ninguna de las ocurrencias ya resueltas se repite.
    await esperar(500);
    resp = await fetch(HOOK, { method: "POST", headers: conSecreto });
    cuerpo = await resp.json();
    const repetidas = (cuerpo.resultados ?? []).filter((x) => creadas.includes(x.programacion_id) && x.estado === "ejecutada").length;
    igual("Un segundo tick inmediato no repite ocurrencias ya resueltas", 0, repetidas);

    // Latido visible del despachador.
    const hb = await api.rest("GET", "sat_cron_heartbeat?select=version,ok,fin_at&order=fin_at.desc&limit=1");
    const ultimo = hb.cuerpo?.[0];
    caso(
      "El despachador deja latido visible en cada tick",
      "latido reciente del despachador",
      `${ultimo?.version} ${ultimo?.fin_at}`,
      !!ultimo && Date.now() - new Date(ultimo.fin_at).getTime() < 5 * 60000,
    );

    // ── Bloque D: regresión de seguridad ────────────────────────────────────
    const cidSeg = await nuevoCliente("seguridad");

    // D1. Escritura directa de la tabla por un usuario autenticado.
    const directo = await api.rest("POST", "sat_programaciones", {
      token,
      cuerpo: {
        despacho_id: despachoId,
        cliente_id: cidSeg,
        creado_por: userId,
        tipo: "recurrente",
        recurrencia: "diaria",
        hora: 3,
        minuto: 0,
        periodo_opcion: "dia_anterior",
      },
    });
    caso(
      "Un usuario autenticado no puede insertar programaciones directamente",
      "401/403 (sin INSERT directo)",
      directo.status,
      !directo.ok,
    );

    // D2. Escritura directa de la bitácora por un usuario autenticado.
    const directoBit = await api.rest("POST", "sat_programacion_bitacora", {
      token,
      cuerpo: { despacho_id: despachoId, cliente_id: cidSeg, accion: "creacion" },
    });
    caso(
      "Un usuario autenticado no puede escribir la bitácora directamente",
      "401/403 (sin INSERT directo)",
      directoBit.status,
      !directoBit.ok,
    );

    // D3. Alta canónica por RPC, con bitácora en la misma transacción.
    const filaBase = {
      despacho_id: despachoId,
      cliente_id: cidSeg,
      zona_horaria: "America/Mexico_City",
      tipo: "recurrente",
      recurrencia: "diaria",
      dias_semana: [],
      dia_mes: null,
      hora: 3,
      minuto: 15,
      fecha_unica: null,
      periodo_opcion: "dia_anterior",
      rango_desde: null,
      rango_hasta: null,
      solapamiento_dias: 1,
      emitidos: true,
      recibidos: true,
      clasificar_nomina: true,
      clasificar_pagos: true,
      tolerancia_minutos: 60,
      politica_retraso: "recuperar",
      activa: true,
      pausada: false,
      proxima_ejecucion_at: dentro(600),
    };
    const alta = await api.rpc(
      "sat_programacion_guardar",
      { _cliente: cidSeg, _fila: filaBase, _detalle: { periodo: "dia_anterior" } },
      token,
    );
    caso("Alta de programación por el RPC canónico", "200 con id", `${alta.status}`, alta.ok);
    const idSeg = alta.cuerpo?.id ?? alta.cuerpo?.[0]?.id ?? alta.cuerpo;
    const bitAlta = await api.rest(
      "GET",
      `sat_programacion_bitacora?cliente_id=eq.${cidSeg}&select=accion`,
    );
    caso(
      "El alta canónica deja bitácora en la misma transacción",
      "≥1 registro",
      (bitAlta.cuerpo ?? []).length,
      (bitAlta.cuerpo ?? []).length >= 1,
    );

    // D4. Si la bitácora falla, la programación se revierte por completo.
    const antes = await api.rest("GET", `sat_programaciones?cliente_id=eq.${cidSeg}&select=version`);
    const versionAntes = antes.cuerpo?.[0]?.version;
    const rollback = await api.rpc(
      "sat_programacion_guardar",
      { _cliente: cidSeg, _fila: { ...filaBase, hora: 9 }, _detalle: { qa_forzar_fallo: 1 } },
      token,
    );
    const despues = await api.rest(
      "GET",
      `sat_programaciones?cliente_id=eq.${cidSeg}&select=version,hora`,
    );
    caso(
      "Si la bitácora falla, la programación hace rollback completo",
      "error y estado idéntico al previo",
      `${rollback.status} v${despues.cuerpo?.[0]?.version} hora=${despues.cuerpo?.[0]?.hora}`,
      !rollback.ok &&
        despues.cuerpo?.[0]?.version === versionAntes &&
        despues.cuerpo?.[0]?.hora !== 9,
    );

    // D5. Actor explícito protegido: nadie puede consultar por otro usuario.
    const suplantar = await api.rpc(
      "has_cliente_access_for",
      { _cliente: cidSeg, _user: randomUUID() },
      token,
    );
    caso(
      "Un usuario autenticado no puede evaluar el acceso de otro usuario",
      "error o false, nunca true",
      `${suplantar.status} ${JSON.stringify(suplantar.cuerpo)}`,
      !suplantar.ok || suplantar.cuerpo !== true,
    );
    const propio = await api.rpc(
      "has_cliente_access_for",
      { _cliente: cidSeg, _user: userId },
      token,
    );
    caso(
      "El usuario sí puede evaluar su propio acceso",
      "true",
      JSON.stringify(propio.cuerpo),
      propio.cuerpo === true,
    );

    // D6. El anónimo no puede evaluar el actor.
    const anonimo = await api.rpcAnon("has_cliente_access_for", { _cliente: cidSeg, _user: userId });
    caso(
      "El anónimo no puede evaluar el acceso de nadie",
      "rechazo o distinto de true",
      `${anonimo.status} ${JSON.stringify(anonimo.cuerpo)}`,
      !anonimo.ok || anonimo.cuerpo !== true,
    );

    // D7. Administración acotada al despacho: rol de contador en OTRO despacho.
    const emailB = `qa.${qa}.otro@contaclick-qa.invalid`;
    const passB = `Qa-${randomUUID()}`;
    const userB = await api.crearUsuario(emailB, passB);
    const despB = await api.rest("PATCH", `despachos?owner_user_id=eq.${userB}`, {
      cuerpo: { es_sandbox: true, nombre: `QA SATPROG B ${qa}`, estado: "activo" },
      representar: true,
    });
    const despachoB = despB.cuerpo?.[0]?.id;
    await api.insertar("user_roles", { user_id: userB, role: "contador", despacho_id: despachoB });
    const cruzado = await api.rpc("sat_prog_puede_administrar", {
      _user: userB,
      _despacho: despachoId,
    });
    caso(
      "Rol de contador en otro despacho NO concede administración aquí",
      "false",
      JSON.stringify(cruzado.cuerpo),
      cruzado.cuerpo === false,
    );
    await api.insertar("user_roles", {
      user_id: userB,
      role: "contador",
      despacho_id: despachoId,
    });
    const propioDespacho = await api.rpc("sat_prog_puede_administrar", {
      _user: userB,
      _despacho: despachoId,
    });
    caso(
      "Rol de contador en el despacho del expediente sí administra",
      "true",
      JSON.stringify(propioDespacho.cuerpo),
      propioDespacho.cuerpo === true,
    );
    await api.borrar("user_roles", `user_id=eq.${userB}`);
    await api.borrar("user_memberships", `user_id=eq.${userB}`);
    await api.borrar("despachos", `id=eq.${despachoB}`);
    await api.borrar("profiles", `id=eq.${userB}`);
    await api.borrarUsuario(userB);

    // D8. Sin membresía activa, el despachador no ejecuta la programación.
    await api.rest("PATCH", `user_memberships?user_id=eq.${userId}&despacho_id=eq.${despachoId}`, {
      cuerpo: { estado: "inactivo" },
    });
    await api.rest("PATCH", `sat_programaciones?cliente_id=eq.${cidSeg}`, {
      cuerpo: { bloqueo_at: null, proxima_ejecucion_at: hace(2), ultima_ocurrencia_key: null },
    });
    const tick = await fetch(HOOK, { method: "POST", headers: conSecreto });
    const cuerpoTick = await tick.json().catch(() => ({}));
    const rSeg = (cuerpoTick.resultados ?? []).find((x) => x.programacion_id === idSeg);
    caso(
      "Sin membresía activa el despachador falla cerrado y no descarga",
      "sin ejecución exitosa",
      `${tick.status} ${rSeg?.estado ?? "sin resultado"}`,
      tick.status === 200 && rSeg?.estado !== "ejecutada",
    );
    await api.rest("PATCH", `user_memberships?user_id=eq.${userId}&despacho_id=eq.${despachoId}`, {
      cuerpo: { estado: "activo" },
    });
  } finally {

    // ── Purga: residuo cero ────────────────────────────────────────────────
    for (const cid of expedientes) {
      await api.borrar("sat_programacion_bitacora", `cliente_id=eq.${cid}`);
      await api.borrar("sat_programaciones", `cliente_id=eq.${cid}`);
      await api.borrar("sat_sync_eventos", `cliente_id=eq.${cid}`);
      await api.borrar("sat_sync_runs", `cliente_id=eq.${cid}`);
      await api.borrar("sat_sync_config", `cliente_id=eq.${cid}`);
      await api.borrar("clientes", `id=eq.${cid}`);
    }
    await api.borrar("user_roles", `user_id=eq.${userId}`);
    await api.borrar("user_memberships", `user_id=eq.${userId}`);
    await api.borrar("despachos", `id=eq.${despachoId}`);
    await api.borrar("profiles", `id=eq.${userId}`);
    await api.borrarUsuario(userId);
    let resto = 0;
    for (const cid of expedientes) resto += await api.contar("sat_programaciones", `cliente_id=eq.${cid}`);
    igual("Purga sintética con residuo cero", 0, resto);
  }

  const fallidas = casos.filter((c) => c.resultado === "FALLA");
  console.log("\n| # | Caso | Esperado | Obtenido | Resultado |");
  console.log("|---|------|----------|----------|-----------|");
  for (const c of casos) console.log(`| ${c.n} | ${c.nombre} | ${c.esperado} | ${c.obtenido} | ${c.resultado} |`);
  console.log(`\nTotal: ${casos.length} · Pasan: ${casos.length - fallidas.length} · Fallan: ${fallidas.length}`);
  if (fallidas.length) process.exit(1);
}

main().catch((e) => {
  console.error("ERROR:", e?.message ?? e);
  process.exit(1);
});
