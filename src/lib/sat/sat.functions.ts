import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";

const ConnectSchema = z.object({
  cliente_id: z.string().uuid(),
  cer_b64: z.string().min(10),
  key_b64: z.string().min(10),
  password: z.string().min(1),
  consentimiento: z.literal(true, {
    errorMap: () => ({
      message:
        "Debes confirmar que cuentas con autorización del contribuyente para resguardar y usar su e.firma.",
    }),
  }),
});

/** Versión del texto de consentimiento aceptado al cargar la e.firma. */
const CONSENTIMIENTO_VERSION = "efirma-2026-01";

// RFC: 3-4 letras (incluye Ñ y &) + 6 dígitos (fecha) + 3 alfanuméricos (homoclave).
// Sin \b: en el DER el RFC puede estar rodeado de bytes alfanuméricos (longitudes ASN.1).
const RFC_REGEX = /([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z0-9]{2}[0-9A])/g;

/**
 * Extrae los RFC presentes en el Subject del certificado .cer (DER en base64).
 * El SAT incluye el RFC en el campo x500UniqueIdentifier (OID 2.5.4.45) en texto plano.
 * Probamos varias decodificaciones para tolerar uploads PEM/DER y caracteres no-ASCII.
 */
function extraerRfcsDeCer(cer_b64: string): string[] {
  const found = new Set<string>();
  const candidates: string[] = [];
  try {
    const limpio = cer_b64.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    const buf = Buffer.from(limpio, "base64");
    if (buf.length > 0) {
      candidates.push(buf.toString("latin1"));
      candidates.push(buf.toString("utf8"));
      candidates.push(buf.toString("ascii"));
    }
    // Por si llegó ya decodificado / no era base64 válido
    candidates.push(cer_b64);
  } catch {
    candidates.push(cer_b64);
  }
  for (const txt of candidates) {
    const re = new RegExp(RFC_REGEX.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) {
      // Validar mes 01-12 y día 01-31 para reducir falsos positivos
      const mes = Number(m[3]);
      const dia = Number(m[4]);
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) continue;
      found.add((m[1] + m[2] + m[3] + m[4] + m[5]).toUpperCase());
    }
  }
  return Array.from(found);
}

// Nota: la conexión al SAT ya NO pasa por un PAC. Se usa el Web Service oficial
// de Descarga Masiva firmado con la e.firma del contribuyente (costo $0 por solicitud).


export const getSatStatus = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("sat_credenciales")
      .select(
        "proveedor, estatus, last_sync_at, last_error, updated_at, efirma_rfc, efirma_vence_at, consentimiento_at, consentimiento_version, vault_version",
      )
      .eq("cliente_id", data.cliente_id)
      .maybeSingle();
    return (
      row ?? {
        proveedor: "sat_directo",
        estatus: "sin_conectar",
        last_sync_at: null,
        last_error: null,
        updated_at: null,
        efirma_rfc: null,
        efirma_vence_at: null,
        consentimiento_at: null,
        consentimiento_version: null,
        vault_version: null,
      }
    );
  });

export const conectarSat = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => ConnectSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Alcance: el usuario debe tener acceso al expediente.
    const { assertClienteScope } = await import("@/lib/despacho/scope");
    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);

    const { data: cli, error: cliErr } = await supabase
      .from("clientes")
      .select("id, despacho_id, rfc")
      .eq("id", scope.cliente_id)
      .maybeSingle();
    if (cliErr || !cli) throw new Error("Expediente no encontrado");
    if (!cli.despacho_id) throw new Error("Expediente sin despacho asignado");
    if (!cli.rfc) throw new Error("El expediente no tiene RFC capturado");

    const rfcCliente = cli.rfc.toUpperCase();

    // Estado previo: una credencial revocada no puede reactivarse sin reemplazo válido.
    const { data: prev } = await supabase
      .from("sat_credenciales")
      .select("estatus")
      .eq("cliente_id", cli.id)
      .maybeSingle();

    // 1) Validación local completa (no contacta al SAT): legibilidad, contraseña,
    //    correspondencia llave↔certificado, RFC, vigencia y tipo de certificado.
    const { validarEFirma, EFirmaInvalida } = await import("@/lib/sat/efirma-validacion.server");
    let vence: string | null = null;
    try {
      const v = validarEFirma({
        cer_b64: data.cer_b64,
        key_b64: data.key_b64,
        password: data.password,
        rfcExpediente: rfcCliente,
      });
      vence = v.vence_at;
    } catch (e: any) {
      if (e instanceof EFirmaInvalida) throw new Error(e.message);
      throw new Error("No se pudo validar la e.firma. Revisa los archivos y la contraseña.");
    }

    // 2) Validación contra el SAT: si el servicio acepta el token, la credencial sirve.
    try {
      const { abrirEFirma, satAutenticar } = await import(
        "@/lib/sat/providers/sat-directo.server"
      );
      const creds = abrirEFirma({
        cer_b64: data.cer_b64,
        key_b64: data.key_b64,
        password: data.password,
      });
      await satAutenticar(creds);
    } catch (e: any) {
      await supabase.from("sat_credenciales").upsert(
        {
          cliente_id: cli.id,
          despacho_id: cli.despacho_id,
          proveedor: "sat_directo",
          estatus: "error",
          last_error: String(e?.message ?? e).slice(0, 500),
        },
        { onConflict: "cliente_id" },
      );
      throw new Error(e?.message ?? "No se pudo validar la e.firma con el SAT");
    }


    const { cifrar, aadExpediente, VAULT_VERSION } = await import(
      "@/lib/sat/efirma-vault.server"
    );
    const aadFor = (campo: string) =>
      aadExpediente({ despachoId: cli.despacho_id, clienteId: cli.id, rfc: rfcCliente, campo });
    const { error: upErr } = await supabase.from("sat_credenciales").upsert(
      {
        cliente_id: cli.id,
        despacho_id: cli.despacho_id,
        proveedor: "sat_directo",
        pac_token: null,
        efirma_cer: data.cer_b64,
        efirma_key_enc: await cifrar(data.key_b64, aadFor("key")),
        efirma_pass_enc: await cifrar(data.password, aadFor("pass")),
        efirma_rfc: rfcCliente,
        efirma_vence_at: vence,
        vault_version: VAULT_VERSION,
        vault_key_id: process.env["SAT_EFIRMA_KEY_ID"] || "k1",
        consentimiento_at: new Date().toISOString(),
        consentimiento_user_id: userId,
        consentimiento_version: CONSENTIMIENTO_VERSION,
        estatus: "activo",
        last_error: null,
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "cliente_id" },
    );
    if (upErr) throw new Error(upErr.message);


    // Auto-activar descarga automática para este expediente (idempotente).
    // Si no existe configuración, se crea con defaults sensatos y queda lista
    // para que el cron horario la procese de inmediato.
    const { data: prevCfg } = await supabase
      .from("sat_sync_config")
      .select("cliente_id, activo")
      .eq("cliente_id", cli.id)
      .maybeSingle();
    if (!prevCfg) {
      await supabase.from("sat_sync_config").insert({
        cliente_id: cli.id,
        despacho_id: cli.despacho_id,
        emitidos: true,
        recibidos: true,
        clasificar_nomina: true,
        clasificar_pagos: true,
        proveedor: "sat_directo",
        frecuencia: "diaria",
        // Últimos 30 días: cubre los CFDI que el proveedor timbra tarde (los
        // primeros días de cada mes) sin duplicar nada (idempotencia por UUID).
        periodo: "30d",
        activo: true,
        proxima_corrida_at: new Date().toISOString(), // disparar en el próximo tick del cron
      });
    } else if (!prevCfg.activo) {
      await supabase
        .from("sat_sync_config")
        .update({ activo: true, proxima_corrida_at: new Date().toISOString() })
        .eq("cliente_id", cli.id);
    }

    // Bitácora (sin secretos): distingue alta de reemplazo.
    await supabase.from("audit_logs").insert({
      user_id: userId,
      despacho_id: cli.despacho_id,
      accion: prev ? "sat.efirma.reemplazar" : "sat.efirma.conectar",
      entidad: "cliente",
      entidad_id: cli.id,
      payload: {
        proveedor: "sat_directo",
        rfc: rfcCliente,
        auto_sync: true,
        vence_at: vence,
        estatus_previo: prev?.estatus ?? null,
        vault_version: VAULT_VERSION,
        consentimiento_version: CONSENTIMIENTO_VERSION,
      },
    });

    return { ok: true, simulated: false, auto_sync_activado: true, vence_at: vence };

  });

export const desconectarSat = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertClienteScope } = await import("@/lib/despacho/scope");
    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);

    const { error } = await supabase
      .from("sat_credenciales")
      .delete()
      .eq("cliente_id", scope.cliente_id);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      user_id: userId,
      despacho_id: scope.despacho_id,
      accion: "sat.efirma.eliminar",
      entidad: "cliente",
      entidad_id: scope.cliente_id,
      payload: { proveedor: "sat_directo" },
    });

    return { ok: true };

  });

// El flujo de descarga masiva vive en `sat-sync.functions.ts` (proveedor SAT directo).
// La ruta antigua vía PAC (`sincronizarCfdis`) fue retirada.
