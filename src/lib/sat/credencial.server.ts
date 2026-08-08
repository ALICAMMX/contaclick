/**
 * RESOLVEDOR CENTRAL DE e.firma.
 *
 * Fuente ÚNICA de verdad sobre "¿este expediente tiene una e.firma utilizable?".
 * La tarjeta de conexión, la validación previa de la interfaz, el preflight de
 * la corrida, el runner, el cron y el reintento usan EXACTAMENTE esta función:
 * ya no pueden divergir.
 *
 * Nunca devuelve secretos. El material descifrado sólo se produce en
 * `materialEFirma`, vive en memoria del servidor y no se registra en bitácora.
 */
import { aadExpediente, descifrar } from "./efirma-vault.server";

export type MotivoCredencial =
  | "utilizable"
  | "no_conectada"
  | "sin_material"
  | "revocada"
  | "vencida"
  | "rfc_incompatible"
  | "no_descifrable"
  | "sin_config_servidor"
  | "error_lectura";

export type AccionCredencial = "conectar" | "reemplazar" | "renovar" | "soporte" | null;

export type CredencialEFirma = {
  /** Existe un registro de credencial para el expediente. */
  existe: boolean;
  /** Puede usarse para firmar solicitudes al SAT. */
  utilizable: boolean;
  motivo: MotivoCredencial;
  mensaje: string;
  accion: AccionCredencial;
  estatus: string | null;
  rfc: string | null;
  vence_at: string | null;
  vault_version: number | null;
  vault_key_id: string | null;
};

export class CredencialNoUtilizable extends Error {
  constructor(
    readonly motivo: MotivoCredencial,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "CredencialNoUtilizable";
  }
}

const MENSAJES: Record<MotivoCredencial, { mensaje: string; accion: AccionCredencial }> = {
  utilizable: { mensaje: "e.firma conectada y utilizable.", accion: null },
  no_conectada: {
    mensaje:
      "Este expediente no tiene una e.firma conectada. El SAT sólo entrega comprobantes a " +
      "solicitudes firmadas con la e.firma del propio contribuyente.",
    accion: "conectar",
  },
  sin_material: {
    mensaje:
      "La credencial existe pero no conserva el certificado y la llave de la e.firma " +
      "(registro heredado del esquema anterior).",
    accion: "conectar",
  },
  revocada: {
    mensaje: "La e.firma de este expediente fue marcada como no utilizable dentro de ContaClick.",
    accion: "reemplazar",
  },
  vencida: {
    mensaje: "El certificado de la e.firma está vencido y el SAT rechazará la autenticación.",
    accion: "renovar",
  },
  rfc_incompatible: {
    mensaje: "El RFC del certificado no coincide con el RFC del expediente.",
    accion: "reemplazar",
  },
  no_descifrable: {
    mensaje:
      "La e.firma está guardada pero no puede abrirse con la configuración actual de la bóveda.",
    accion: "reemplazar",
  },
  sin_config_servidor: {
    mensaje:
      "Falta la configuración de la bóveda de e.firma en el servidor. No es un problema de tu e.firma.",
    accion: "soporte",
  },
  error_lectura: {
    mensaje: "No se pudo leer el estado de la e.firma de este expediente.",
    accion: "soporte",
  },
};

function resultado(
  motivo: MotivoCredencial,
  base: Partial<CredencialEFirma> = {},
): CredencialEFirma {
  const m = MENSAJES[motivo];
  return {
    existe: false,
    utilizable: motivo === "utilizable",
    motivo,
    mensaje: m.mensaje,
    accion: m.accion,
    estatus: null,
    rfc: null,
    vence_at: null,
    vault_version: null,
    vault_key_id: null,
    ...base,
  };
}

const COLUMNAS =
  "despacho_id, cliente_id, estatus, efirma_cer, efirma_key_enc, efirma_pass_enc, " +
  "efirma_rfc, efirma_vence_at, vault_version, vault_key_id";

type FilaCredencial = {
  despacho_id: string | null;
  cliente_id: string;
  estatus: string | null;
  efirma_cer: string | null;
  efirma_key_enc: string | null;
  efirma_pass_enc: string | null;
  efirma_rfc: string | null;
  efirma_vence_at: string | null;
  vault_version: number | null;
  vault_key_id: string | null;
};

async function leerFila(
  supabase: any,
  clienteId: string,
  despachoId?: string | null,
): Promise<{ fila: FilaCredencial | null; error: string | null }> {
  let q = supabase.from("sat_credenciales").select(COLUMNAS).eq("cliente_id", clienteId);
  if (despachoId) q = q.eq("despacho_id", despachoId);
  const { data, error } = await q.maybeSingle();
  if (error) return { fila: null, error: String(error.message ?? error).slice(0, 200) };
  return { fila: (data ?? null) as FilaCredencial | null, error: null };
}

/** AAD exactamente como se construyó al cifrar, con variantes heredadas. */
function candidatosAad(fila: FilaCredencial, rfcExpediente: string | null, campo: string) {
  const rfcs = [fila.efirma_rfc, rfcExpediente, null];
  const vistos = new Set<string>();
  const out: (string | undefined)[] = [];
  for (const rfc of rfcs) {
    const aad = aadExpediente({
      despachoId: fila.despacho_id ?? null,
      clienteId: fila.cliente_id,
      rfc: rfc ?? null,
      campo,
    });
    if (!vistos.has(aad)) {
      vistos.add(aad);
      out.push(aad);
    }
  }
  // Cifrados v1 heredados: sin AAD.
  out.push(undefined);
  return out;
}

async function descifrarConAad(
  payload: string,
  fila: FilaCredencial,
  rfcExpediente: string | null,
  campo: string,
): Promise<string> {
  let ultimo: unknown = null;
  for (const aad of candidatosAad(fila, rfcExpediente, campo)) {
    try {
      return await descifrar(payload, aad);
    } catch (e) {
      ultimo = e;
    }
  }
  const msg = String((ultimo as Error)?.message ?? "");
  if (/llave maestra|no está disponible la llave/i.test(msg)) {
    throw new CredencialNoUtilizable("sin_config_servidor", MENSAJES.sin_config_servidor.mensaje);
  }
  throw new CredencialNoUtilizable("no_descifrable", MENSAJES.no_descifrable.mensaje);
}

/**
 * Metadatos (SIN secretos) de la e.firma activa del expediente.
 * `verificarDescifrado` prueba en memoria que el material puede abrirse con su
 * AAD y su versión de llave; es lo que ejecuta el preflight antes de crear una
 * corrida, para que la interfaz y el runner nunca discrepen.
 */
export async function resolverCredencialEFirma(
  supabase: any,
  args: {
    clienteId: string;
    despachoId?: string | null;
    rfcExpediente?: string | null;
    verificarDescifrado?: boolean;
    ahora?: number;
  },
): Promise<CredencialEFirma> {
  const { fila, error } = await leerFila(supabase, args.clienteId, args.despachoId ?? null);
  if (error) {
    console.error("[efirma] lectura de credencial falló:", error);
    return resultado("error_lectura");
  }
  if (!fila) return resultado("no_conectada");

  const base: Partial<CredencialEFirma> = {
    existe: true,
    estatus: fila.estatus,
    rfc: fila.efirma_rfc,
    vence_at: fila.efirma_vence_at,
    vault_version: fila.vault_version,
    vault_key_id: fila.vault_key_id,
  };

  if (!fila.efirma_cer || !fila.efirma_key_enc || !fila.efirma_pass_enc) {
    return resultado("sin_material", base);
  }
  if (fila.estatus && fila.estatus !== "activo" && fila.estatus !== "error") {
    return resultado("revocada", base);
  }
  if (fila.efirma_vence_at) {
    const t = new Date(fila.efirma_vence_at).getTime();
    if (!isNaN(t) && t <= (args.ahora ?? Date.now())) return resultado("vencida", base);
  }
  const rfcExp = (args.rfcExpediente ?? "").toUpperCase().trim();
  if (rfcExp && fila.efirma_rfc && fila.efirma_rfc.toUpperCase() !== rfcExp) {
    return resultado("rfc_incompatible", base);
  }

  if (args.verificarDescifrado) {
    try {
      await descifrarConAad(fila.efirma_key_enc, fila, rfcExp || null, "key");
      await descifrarConAad(fila.efirma_pass_enc, fila, rfcExp || null, "pass");
    } catch (e) {
      const motivo =
        e instanceof CredencialNoUtilizable ? e.motivo : ("no_descifrable" as MotivoCredencial);
      return resultado(motivo, base);
    }
  }

  return resultado("utilizable", base);
}

/**
 * Material de firma en memoria del servidor. Sólo debe llamarse cuando la
 * operación ya validó alcance y permisos. No se registra ni se devuelve al
 * cliente bajo ninguna circunstancia.
 */
export async function materialEFirma(
  supabase: any,
  args: { clienteId: string; despachoId?: string | null; rfcExpediente?: string | null },
): Promise<{ cer_b64: string; key_b64: string; password: string; rfc: string | null }> {
  const meta = await resolverCredencialEFirma(supabase, {
    clienteId: args.clienteId,
    despachoId: args.despachoId ?? null,
    rfcExpediente: args.rfcExpediente ?? null,
  });
  if (!meta.utilizable) throw new CredencialNoUtilizable(meta.motivo, meta.mensaje);

  const { fila } = await leerFila(supabase, args.clienteId, args.despachoId ?? null);
  if (!fila?.efirma_cer || !fila.efirma_key_enc || !fila.efirma_pass_enc) {
    throw new CredencialNoUtilizable("sin_material", MENSAJES.sin_material.mensaje);
  }
  const rfcExp = (args.rfcExpediente ?? "").toUpperCase().trim() || null;
  return {
    cer_b64: fila.efirma_cer,
    key_b64: await descifrarConAad(fila.efirma_key_enc, fila, rfcExp, "key"),
    password: await descifrarConAad(fila.efirma_pass_enc, fila, rfcExp, "pass"),
    rfc: fila.efirma_rfc,
  };
}
