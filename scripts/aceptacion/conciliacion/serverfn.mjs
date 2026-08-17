// ─────────────────────────────────────────────────────────────────────────────
// CLIENTE DE FUNCIONES SERVIDORAS (mismo camino que usa la aplicación)
//
// Habla el protocolo real de TanStack Start: POST a /_serverFn/<id> con el
// cuerpo serializado por seroval y la cabecera Authorization que en el
// navegador coloca `attachSupabaseAuth`. No inserta nada por su cuenta.
// ─────────────────────────────────────────────────────────────────────────────
import { toJSONAsync, fromCrossJSON } from "seroval";

const BASE = process.env.APP_BASE ?? "http://localhost:8080";

function idDe(archivo, exportado) {
  const meta = JSON.stringify({ file: `${archivo}?tss-serverfn-split`, export: `${exportado}_createServerFn_handler` });
  return Buffer.from(meta, "utf8").toString("base64url").replace(/=+$/, "");
}

/**
 * Invoca una función servidora exactamente como el navegador.
 * @param archivo ruta del módulo, p. ej. "/src/lib/conciliacion/conciliacion.functions.ts"
 */
let calentado = null;

/** El servidor de desarrollo registra las funciones al cargar la ruta que las usa. */
async function calentar() {
  if (!calentado) calentado = fetch(`${BASE}/app/conciliacion`).then(() => true).catch(() => false);
  return calentado;
}

export async function llamar(archivo, exportado, data, token) {
  await calentar();
  const url = `${BASE}/_serverFn/${idDe(archivo, exportado)}`;
  const cuerpo = JSON.stringify(await toJSONAsync({ data }));
  const headers = {
    "x-tsr-serverFn": "true",
    "content-type": "application/json",
    accept: "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const r = await fetch(url, { method: "POST", headers, body: cuerpo });
  const texto = await r.text();
  const tipo = r.headers.get("content-type") ?? "";

  if (!tipo.includes("application/json")) {
    if (!r.ok) throw new Error(`[${r.status}] ${texto.slice(0, 400)}`);
    return texto;
  }

  const json = JSON.parse(texto);
  const valor = r.headers.get("x-tss-serialized") ? fromCrossJSON(json, { plugins: [] }) : json;
  if (valor instanceof Error) throw valor;
  if (valor && typeof valor === "object" && valor.message && !r.ok) {
    throw new Error(String(valor.message));
  }
  if (!r.ok) throw new Error(`[${r.status}] ${texto.slice(0, 400)}`);
  return valor;
}

export const CONCILIACION = "/src/lib/conciliacion/conciliacion.functions.ts";
