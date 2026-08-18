// Presentación segura del resultado de una corrida SAT.
//
// La UI NUNCA debe acceder directamente a `r.error.mensaje`: existen respuestas
// históricas con `{ ok:false, mensaje, errores }` sin objeto `error`, respuestas
// malformadas y excepciones lanzadas. Esta función pura resuelve el motivo real
// sin generar una segunda excepción.

export type PresentacionSat = { mensaje: string; accion?: string };

const RESPALDO = "No se pudo completar la sincronización. Consulta el detalle de la corrida.";

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function presentarResultadoSat(resultado: unknown): PresentacionSat {
  if (texto(resultado)) return { mensaje: texto(resultado)! };

  if (resultado instanceof Error) {
    return { mensaje: texto(resultado.message) ?? RESPALDO };
  }

  if (resultado && typeof resultado === "object") {
    const r = resultado as Record<string, any>;

    const err = r["error"];
    if (err && typeof err === "object") {
      const m = texto(err.mensaje) ?? texto(err.message);
      if (m) return { mensaje: m, accion: texto(err.accion) ?? undefined };
    }
    const errTexto = texto(err);
    if (errTexto) return { mensaje: errTexto };

    const m = texto(r["mensaje"]);
    if (m) return { mensaje: m, accion: texto(r["accion"]) ?? undefined };

    const lista = Array.isArray(r["errores"]) ? r["errores"] : [];
    for (const e of lista) {
      const em = typeof e === "object" && e ? texto((e as any).mensaje) : texto(e);
      if (em) return { mensaje: em };
    }

    const msg = texto(r["message"]);
    if (msg) return { mensaje: msg };
  }

  return { mensaje: RESPALDO };
}

/** Extrae el run_id de cualquier forma de respuesta, sin lanzar. */
export function runIdDeResultado(resultado: unknown): string | null {
  if (!resultado || typeof resultado !== "object") return null;
  const r = resultado as Record<string, any>;
  const directo = typeof r["run_id"] === "string" ? r["run_id"] : null;
  const anidado =
    r["error"] && typeof r["error"] === "object" && typeof r["error"].run_id === "string"
      ? (r["error"].run_id as string)
      : null;
  return directo ?? anidado;
}
