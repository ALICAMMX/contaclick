// ─────────────────────────────────────────────────────────────────────────────
// REGRESIÓN EXACTA · AISLAMIENTO DE LA APROBACIÓN DE PÓLIZAS
//
// Mismo expediente y periodo, dos borradores:
//   A · balanceada y totalmente identificada  → debe aprobarse.
//   B · con cuenta POR IDENTIFICAR            → debe permanecer borrador y su
//                                               rechazo debe citar el ID de B.
// Se repite invirtiendo el orden de inserción: el resultado debe ser idéntico.
// No amplía alcance: sólo comprueba que la validación se limita a la póliza
// objetivo y que el fallo sigue cerrado.
//
// Uso:
//   bun --preload ./scripts/aceptacion/conciliacion/precarga-url.mjs \
//       scripts/aceptacion/polizas/regresion-aprobacion.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from "node:crypto";
import { entorno, cliente } from "../fixtures.mjs";
import { llamar, precalentarRuta, POLIZAS, CATALOGO } from "../conciliacion/serverfn.mjs";
import { parsearCatalogo } from "../../../src/lib/catalogo/importar.ts";
import { catalogoCsv } from "./fixtures.mjs";

precalentarRuta("/app/polizas");

const PERIODO = "2026-07";
const MOTIVO = "Regresión sintética de aislamiento de aprobación de pólizas.";
const fallos = [];

function paso(nombre, ok, detalle) {
  if (!ok) fallos.push(nombre);
  console.log(`${ok ? "✓" : "✗"} ${nombre} — ${detalle}`);
}

async function rechazado(fn) {
  try {
    await fn();
    return { rechazado: false, motivo: "permitido" };
  } catch (e) {
    return { rechazado: true, motivo: String(e?.message ?? e) };
  }
}

async function crearSandbox(api, etiqueta) {
  const email = `qa.aprob.${etiqueta}@contaclick-qa.invalid`;
  const password = `Qa-${randomUUID()}`;
  const userId = await api.crearUsuario(email, password);
  const token = await api.iniciarSesion(email, password);
  const desp = await api.rest("PATCH", `despachos?owner_user_id=eq.${userId}`, {
    cuerpo: { es_sandbox: true, nombre: `QA APROBACION ${etiqueta}`, estado: "activo" },
    representar: true,
  });
  if (!desp.ok || !desp.cuerpo?.[0]) throw new Error(`Despacho sandbox no creado: ${desp.status}`);
  const despachoId = desp.cuerpo[0].id;
  const rfc = "SAND030303CCC";
  const [cli] = await api.insertar("clientes", {
    despacho_id: despachoId,
    user_id: userId,
    rfc,
    razon_social: "EXPEDIENTE SANDBOX APROBACION",
    regimen_fiscal: "601",
    tipo_persona: "moral",
  });
  return { email, userId, token, despachoId, clienteId: cli.id, rfc };
}

const RENGLONES_A = [
  { cuenta: "105-001", cargo_centavos: 116000, abono_centavos: 0 },
  { cuenta: "401-001", cargo_centavos: 0, abono_centavos: 100000 },
  { cuenta: "208-001", cargo_centavos: 0, abono_centavos: 16000 },
];
const RENGLONES_B = [
  { cuenta: "POR IDENTIFICAR", cargo_centavos: 58000, abono_centavos: 0 },
  { cuenta: "401-001", cargo_centavos: 0, abono_centavos: 50000 },
  { cuenta: "208-001", cargo_centavos: 0, abono_centavos: 8000 },
];

async function crear(s, sufijo, renglones, dia) {
  return llamar(POLIZAS, "crearPolizaManual", {
    cliente_id: s.clienteId,
    periodo: PERIODO,
    fecha: `${PERIODO}-${dia}`,
    tipo: "diario",
    concepto: `Regresión aprobación ${sufijo}`,
    renglones,
  }, s.token);
}

async function leer(s) {
  const v = await llamar(POLIZAS, "listarPolizasCanonicas", { cliente_id: s.clienteId, periodo: PERIODO }, s.token);
  return new Map(v.polizas.map((p) => [p.id, p]));
}

async function escenario(api, s, orden) {
  const etiqueta = orden === "AB" ? "A primero" : "B primero";
  const primero = orden === "AB"
    ? await crear(s, `A-${orden}`, RENGLONES_A, "10")
    : await crear(s, `B-${orden}`, RENGLONES_B, "11");
  const segundo = orden === "AB"
    ? await crear(s, `B-${orden}`, RENGLONES_B, "11")
    : await crear(s, `A-${orden}`, RENGLONES_A, "10");
  const idA = orden === "AB" ? primero.poliza_id : segundo.poliza_id;
  const idB = orden === "AB" ? segundo.poliza_id : primero.poliza_id;

  const aprobarA = await rechazado(() => llamar(POLIZAS, "aprobarPoliza",
    { cliente_id: s.clienteId, poliza_id: idA, motivo: MOTIVO }, s.token));
  paso(`[${etiqueta}] Aprobar A funciona pese a que B está incompleta`, !aprobarA.rechazado,
    aprobarA.rechazado ? aprobarA.motivo.slice(0, 160) : "aprobada");

  let vista = await leer(s);
  paso(`[${etiqueta}] A queda aprobada con actor real`,
    vista.get(idA)?.estado === "aprobada" && vista.get(idA)?.aprobada_por === s.userId,
    `estado=${vista.get(idA)?.estado}`);
  paso(`[${etiqueta}] B permanece en borrador y no fue alterada`,
    vista.get(idB)?.estado === "borrador" && (vista.get(idB)?.poliza_renglones ?? []).length === 3,
    `estado=${vista.get(idB)?.estado}, renglones=${(vista.get(idB)?.poliza_renglones ?? []).length}`);

  const aprobarB = await rechazado(() => llamar(POLIZAS, "aprobarPoliza",
    { cliente_id: s.clienteId, poliza_id: idB, motivo: MOTIVO }, s.token));
  paso(`[${etiqueta}] Aprobar B falla citando el ID de B`,
    aprobarB.rechazado && aprobarB.motivo.includes(idB) && !aprobarB.motivo.includes(idA),
    aprobarB.motivo.slice(0, 200));

  vista = await leer(s);
  paso(`[${etiqueta}] B sigue en borrador tras el rechazo`, vista.get(idB)?.estado === "borrador",
    `estado=${vista.get(idB)?.estado}`);

  return { idA, idB };
}

const OPERATIVAS = [
  "poliza_renglones", "polizas", "catalogo_cuentas", "catalogo_importaciones", "reglas_concepto",
  "cierre_snapshots", "cierre_resultado_fiscal", "cierre_etapas", "cierre_periodos", "clientes",
];

async function limpiar(api, u) {
  for (const t of OPERATIVAS) await api.borrar(t, `cliente_id=eq.${u.clienteId}`);
  await api.borrar("user_roles", `user_id=eq.${u.userId}`);
  await api.borrar("user_memberships", `user_id=eq.${u.userId}`);
  await api.borrar("despachos", `id=eq.${u.despachoId}`);
  await api.borrar("profiles", `id=eq.${u.userId}`);
  await api.borrarUsuario(u.userId);
}

async function main() {
  const env = entorno();
  if (!env.completo) throw new Error(`Configuración ausente: ${env.faltantes.join(", ")}`);
  const api = cliente(env);
  let s = null;
  try {
    s = await crearSandbox(api, randomUUID().slice(0, 8));
    const lectura = await parsearCatalogo(new File([Buffer.from(catalogoCsv(), "utf8")], "catalogo.csv", { type: "text/csv" }));
    await llamar(CATALOGO, "importarCatalogo",
      { cliente_id: s.clienteId, modo: "agregar_actualizar", huella: lectura.huella, cuentas: lectura.filas }, s.token);

    const uno = await escenario(api, s, "AB");
    const dos = await escenario(api, s, "BA");

    // Póliza ajena: otro expediente no puede aprobarla.
    const ajeno = await crearSandbox(api, randomUUID().slice(0, 8));
    const cruzado = await rechazado(() => llamar(POLIZAS, "aprobarPoliza",
      { cliente_id: ajeno.clienteId, poliza_id: uno.idB, motivo: MOTIVO }, ajeno.token));
    paso("Una póliza ajena es rechazada", cruzado.rechazado, cruzado.motivo.slice(0, 120));

    // Reaprobar una póliza ya aprobada es idempotente y no la modifica.
    const repetida = await rechazado(() => llamar(POLIZAS, "aprobarPoliza",
      { cliente_id: s.clienteId, poliza_id: dos.idA, motivo: MOTIVO }, s.token));
    const vista = await leer(s);
    paso("Reaprobar una póliza aprobada no la modifica",
      !repetida.rechazado && vista.get(dos.idA)?.estado === "aprobada",
      `estado=${vista.get(dos.idA)?.estado}`);

    await limpiar(api, ajeno);
  } finally {
    if (s) await limpiar(api, s);
  }

  console.log(`\nREGRESION_APROBACION=${fallos.length === 0 ? "TODAS_PASARON" : `FALLOS:${fallos.join(" | ")}`}`);
  if (fallos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
