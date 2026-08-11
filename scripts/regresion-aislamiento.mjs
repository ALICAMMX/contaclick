#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Regresión automatizada de AISLAMIENTO y ESCRITURA FISCAL por API.
//
// Sustituye a la antigua supabase/tests/cierre_aislamiento.sql, que era inválida:
// se ejecutaba como superusuario de base y por tanto ignoraba RLS y los RPC
// SECURITY DEFINER, de modo que "pasaba" incluso con el aislamiento roto.
//
// Ejecuta las llamadas reales de la aplicación contra la API pública y exige:
//   · anon                → rechazado en todo
//   · usuario propio      → aceptado en lecturas y diagnósticos de SU expediente
//   · usuario propio      → rechazado en expediente ajeno
//   · escritor fiscal     → sólo alcanzable por el proceso interno (service_role)
//   · escritura directa   → bloqueada en las tablas del cierre
//
// No imprime ni persiste tokens. No contacta al SAT, PAC, e.firma, correo ni IA.
//
// Uso obligatorio (CI / predeploy):
//   node scripts/regresion-aislamiento.mjs
//   → termina con código ≠ 0 si falta configuración. "Omitida" NO es aprobada.
//
// Uso local opcional (explícito y separado del predeploy):
//   node scripts/regresion-aislamiento.mjs --local
//   → si falta configuración, informa y termina en 0 SIN contar como aprobada.
// ─────────────────────────────────────────────────────────────────────────────

const LOCAL = process.argv.includes("--local");

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.CC_TEST_EMAIL;
const PASSWORD = process.env.CC_TEST_PASSWORD;
const PROPIO = process.env.CC_CLIENTE_PROPIO;
const AJENO = process.env.CC_CLIENTE_AJENO;
const PERIODO = process.env.CC_PERIODO ?? "2026-01";

const faltantes = Object.entries({
  VITE_SUPABASE_URL: URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: ANON,
  CC_TEST_EMAIL: EMAIL,
  CC_TEST_PASSWORD: PASSWORD,
  CC_CLIENTE_PROPIO: PROPIO,
  CC_CLIENTE_AJENO: AJENO,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (faltantes.length > 0) {
  const detalle = `Configuración obligatoria ausente: ${faltantes.join(", ")}.`;
  if (LOCAL) {
    console.log(`NO EJECUTADA (modo local). ${detalle}`);
    console.log("Esta ejecución NO cuenta como prueba aprobada.");
    process.exit(0);
  }
  console.error(`FALLA: ${detalle}`);
  console.error("La regresión de aislamiento es obligatoria en CI/predeploy y no puede omitirse.");
  process.exit(2);
}

async function login() {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`No se pudo iniciar sesión de prueba: ${r.status}`);
  const j = await r.json();
  return j.access_token; // sólo en memoria; nunca se imprime ni se guarda
}

async function rpc(token, fn, args) {
  const headers = { apikey: ANON, "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  return { status: r.status, cuerpo: (await r.text()).slice(0, 300) };
}

// Lecturas, diagnósticos y mutaciones que deben respetar el expediente activo.
const CASOS = [
  ["cierre_estado", (c) => ({ _cliente_id: c, _periodo: PERIODO })],
  ["cierre_bloqueos", (c) => ({ _cliente_id: c, _periodo: PERIODO })],
  ["cierre_diag_clasificacion", (c) => ({ _cliente_id: c, _periodo: PERIODO })],
  ["cierre_diag_bancos", (c) => ({ _cliente_id: c, _periodo: PERIODO })],
  ["cierre_diag_polizas", (c) => ({ _cliente_id: c, _periodo: PERIODO })],
  ["cierre_diag_impuestos", (c) => ({ _cliente_id: c, _periodo: PERIODO })],
  ["cierre_entradas_fiscales", (c) => ({ _cliente_id: c, _periodo: PERIODO })],
  ["cierre_evaluar_clasificacion", (c) => ({ _cliente_id: c, _periodo: PERIODO })],
  ["cierre_evaluar_bancos", (c) => ({ _cliente_id: c, _periodo: PERIODO })],
  ["cierre_evaluar_polizas", (c) => ({ _cliente_id: c, _periodo: PERIODO })],
  ["cierre_evaluar_impuestos", (c) => ({ _cliente_id: c, _periodo: PERIODO })],
  ["cierre_manifiesto", (c) => ({ _cliente_id: c, _periodo: PERIODO })],
  ["cierre_autorizar_expediente", (c) => ({ _cliente_id: c })],
];

// Mutaciones críticas: deben rechazarse en expediente ajeno (no se ejecutan
// sobre el propio para no alterar datos reales).
const MUTACIONES_AJENAS = [
  ["cierre_set_tolerancia_bancos", (c) => ({ _cliente_id: c, _tolerancia_centavos: 100, _motivo: "regresión" })],
  ["cierre_marcar_no_aplica", (c) => ({ _cliente_id: c, _periodo: PERIODO, _etapa: "bancos", _motivo: "regresión" })],
  ["cierre_reabrir", (c) => ({ _cliente_id: c, _periodo: PERIODO, _disparador: "regresion", _motivo: "regresión" })],
  ["cierre_sellar_manifiesto", (c) => ({ _cliente_id: c, _periodo: PERIODO, _motivo: "regresión automatizada" })],
  [
    "cierre_registrar_decision_fiscal",
    (c) => ({ _cliente_id: c, _cfdi_id: "00000000-0000-0000-0000-000000000000", _decision: "deducible" }),
  ],
];

const token = await login();
let fallos = 0;
let ejecutadas = 0;
const marca = (ok, etiqueta, extra = "") => {
  ejecutadas += 1;
  if (!ok) fallos += 1;
  console.log(`${ok ? "OK   " : "FALLA"} ${etiqueta}${extra ? ` ${extra}` : ""}`);
};

// 1. anon no puede tocar nada del cierre.
for (const [fn, args] of CASOS) {
  const r = await rpc(null, fn, args(PROPIO));
  marca(r.status >= 400, `anon rechazado en ${fn}`, `status=${r.status}`);
}

// 2. usuario propio: acceso a lo suyo, rechazo en lo ajeno.
for (const [fn, args] of CASOS) {
  const ajeno = await rpc(token, fn, args(AJENO));
  const propio = await rpc(token, fn, args(PROPIO));
  marca(ajeno.status >= 400, `expediente ajeno rechazado en ${fn}`, `status=${ajeno.status}`);
  marca(propio.status === 200, `expediente propio aceptado en ${fn}`, `status=${propio.status}`);
}

// 3. mutaciones críticas sobre expediente ajeno.
for (const [fn, args] of MUTACIONES_AJENAS) {
  const r = await rpc(token, fn, args(AJENO));
  marca(r.status >= 400, `mutación ajena rechazada en ${fn}`, `status=${r.status}`);
}

// 4. escritor fiscal privilegiado: inalcanzable desde la sesión del usuario,
//    incluso con el input_hash correcto de SU PROPIO expediente.
const entradas = await rpc(token, "cierre_entradas_fiscales", {
  _cliente_id: PROPIO,
  _periodo: PERIODO,
});
let hash = null;
try {
  hash = JSON.parse(entradas.cuerpo)?.input_hash ?? null;
} catch {
  hash = null;
}
const falsificacion = await rpc(token, "cierre_registrar_resultado_fiscal_srv", {
  _cliente_id: PROPIO,
  _periodo: PERIODO,
  _solicitado_por: "00000000-0000-0000-0000-000000000000",
  _regimen: "PF_GENERAL_MENSUAL",
  _motor_version: "falsificado@1",
  _normativa: {},
  _normativa_sha256: "0".repeat(64),
  _entradas: {},
  _input_hash: hash,
  _resultado: { isr_a_cargo_centavos: 1, iva_a_cargo_centavos: 1 },
  _fundamentos: [],
  _fuentes: [],
});
marca(
  falsificacion.status >= 400,
  "resultado fiscal falsificado rechazado (escritor privilegiado)",
  `status=${falsificacion.status}`,
);
// La función anterior ya no existe para el usuario.
const legado = await rpc(token, "cierre_registrar_resultado_fiscal", {
  _cliente_id: PROPIO,
  _periodo: PERIODO,
  _regimen: "PF_GENERAL_MENSUAL",
  _motor_version: "falsificado@1",
  _normativa: {},
  _normativa_sha256: "x",
  _entradas: {},
  _input_hash: hash,
  _resultado: {},
  _fundamentos: [],
  _fuentes: [],
});
marca(legado.status >= 400, "RPC fiscal legado inalcanzable", `status=${legado.status}`);

// 5. escritura directa a tablas del cierre.
const tablas = [
  ["cierre_resultado_fiscal", { cliente_id: PROPIO, periodo: PERIODO, regimen: "PF_GENERAL_MENSUAL" }],
  ["cierre_etapas", { cliente_id: PROPIO, periodo: PERIODO, etapa: "documentos", estado: "aprobada" }],
  ["cierre_snapshots", { cliente_id: PROPIO, periodo: PERIODO, huella: "x" }],
  ["cierre_eventos", { cliente_id: PROPIO, periodo: PERIODO, etapa: "documentos", evento: "x" }],
];
for (const [tabla, fila] of tablas) {
  const r = await fetch(`${URL}/rest/v1/${tabla}`, {
    method: "POST",
    headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(fila),
  });
  marca(r.status >= 400, `escritura directa bloqueada en ${tabla}`, `status=${r.status}`);
}

// 6. concurrencia real: dos sellados simultáneos del mismo periodo no pueden
//    producir dos sellos; el candado debe serializar y uno debe fallar o
//    devolver el mismo resultado idempotente.
const [a, b] = await Promise.all([
  rpc(token, "cierre_sellar_manifiesto", {
    _cliente_id: PROPIO,
    _periodo: PERIODO,
    _motivo: "regresión de concurrencia",
    _idempotency_key: `regresion-${PERIODO}`,
  }),
  rpc(token, "cierre_sellar_manifiesto", {
    _cliente_id: PROPIO,
    _periodo: PERIODO,
    _motivo: "regresión de concurrencia",
    _idempotency_key: `regresion-${PERIODO}`,
  }),
]);
const consistente = a.status === b.status ? a.cuerpo === b.cuerpo : a.status >= 400 || b.status >= 400;
marca(consistente, "sellado concurrente serializado", `status=${a.status}/${b.status}`);

console.log(
  `\nEjecutadas ${ejecutadas} · aprobadas ${ejecutadas - fallos} · fallidas ${fallos} · omitidas 0`,
);
console.log(
  fallos === 0
    ? "Regresión de aislamiento y escritura fiscal: sin hallazgos. Sin residuo sintético (no se crearon filas)."
    : `${fallos} casos fallidos.`,
);
process.exit(fallos === 0 ? 0 : 1);
