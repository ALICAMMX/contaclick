#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Regresión automatizada de AISLAMIENTO por API (sustituye a la antigua prueba
// supabase/tests/cierre_aislamiento.sql, que era inválida: se ejecutaba como
// superusuario de base y por tanto ignoraba RLS y los RPC SECURITY DEFINER, de
// modo que "pasaba" incluso con el aislamiento roto).
//
// Ejecuta las llamadas reales que hace la aplicación contra la API pública y
// exige que un expediente ajeno sea rechazado (401/403/400) y que el propio sea
// aceptado (200). NO guarda secretos: las credenciales de prueba se leen del
// entorno y sólo viven en memoria.
//
//   CC_TEST_EMAIL=... CC_TEST_PASSWORD=... CC_CLIENTE_PROPIO=<uuid> \
//   CC_CLIENTE_AJENO=<uuid> node scripts/regresion-aislamiento.mjs
// ─────────────────────────────────────────────────────────────────────────────

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.CC_TEST_EMAIL;
const PASSWORD = process.env.CC_TEST_PASSWORD;
const PROPIO = process.env.CC_CLIENTE_PROPIO;
const AJENO = process.env.CC_CLIENTE_AJENO;

if (!URL || !ANON || !EMAIL || !PASSWORD || !PROPIO || !AJENO) {
  console.log(
    "Omitida: faltan variables de entorno (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, CC_TEST_EMAIL, CC_TEST_PASSWORD, CC_CLIENTE_PROPIO, CC_CLIENTE_AJENO).",
  );
  process.exit(0);
}

const PERIODO = process.env.CC_PERIODO ?? "2026-01";

async function login() {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`No se pudo iniciar sesión de prueba: ${r.status}`);
  const j = await r.json();
  return j.access_token;
}

async function rpc(token, fn, args) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  return { status: r.status, cuerpo: await r.text() };
}

// Lecturas y mutaciones que deben respetar el expediente activo.
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
  ["cierre_autorizar_expediente", (c) => ({ _cliente_id: c })],
];

const token = await login();
let fallos = 0;

for (const [fn, args] of CASOS) {
  const ajeno = await rpc(token, fn, args(AJENO));
  const propio = await rpc(token, fn, args(PROPIO));

  const ajenoOk = ajeno.status >= 400;
  const propioOk = propio.status === 200;
  if (!ajenoOk || !propioOk) fallos += 1;

  console.log(
    `${ajenoOk && propioOk ? "OK  " : "FALLA"} ${fn.padEnd(30)} ajeno=${ajeno.status} propio=${propio.status}`,
  );
  if (!ajenoOk) console.log(`      expediente ajeno ACEPTADO: ${ajeno.cuerpo.slice(0, 200)}`);
  if (!propioOk) console.log(`      expediente propio rechazado: ${propio.cuerpo.slice(0, 200)}`);
}

// Escritura directa a tablas del cierre: la app no debe poder escribir sin RPC.
const escrituraDirecta = await fetch(`${URL}/rest/v1/cierre_etapas`, {
  method: "POST",
  headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ cliente_id: PROPIO, periodo: PERIODO, etapa: "documentos", estado: "aprobada" }),
});
const escrituraBloqueada = escrituraDirecta.status >= 400;
if (!escrituraBloqueada) fallos += 1;
console.log(
  `${escrituraBloqueada ? "OK  " : "FALLA"} escritura directa cierre_etapas   status=${escrituraDirecta.status}`,
);

console.log(fallos === 0 ? "\nRegresión de aislamiento: sin hallazgos." : `\n${fallos} casos fallidos.`);
process.exit(fallos === 0 ? 0 : 1);
