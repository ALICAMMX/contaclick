import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";

const ConnectSchema = z.object({
  cliente_id: z.string().uuid(),
  cer_b64: z.string().min(10),
  key_b64: z.string().min(10),
  password: z.string().min(1),
});

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



async function obtainSwToken(args: { cer_b64: string; key_b64: string; password: string }) {
  const SW_BASE = (process.env.SW_SAPIEN_API_URL || "https://services.sw.com.mx/").replace(/\/$/, "");
  const SW_TOKEN = process.env.SW_SAPIEN_API_TOKEN;
  const SW_USER = process.env.SW_USER;
  const SW_PASSWORD = process.env.SW_PASSWORD;

  // Sin credenciales ni token → modo simulado
  if (!SW_TOKEN && (!SW_USER || !SW_PASSWORD)) {
    return { token: `mock_${crypto.randomUUID()}`, simulated: true as const };
  }

  // Token maestro: preconfigurado (sandbox SW Sapien) o vía user/password
  let masterToken: string | undefined = SW_TOKEN;
  if (!masterToken) {
    const auth = await fetch(`${SW_BASE}/security/authenticate`, {
      method: "POST",
      headers: { user: SW_USER!, password: SW_PASSWORD! },
    });
    if (!auth.ok) throw new Error(`PAC auth falló (${auth.status})`);
    const authJson = (await auth.json()) as { data?: { token?: string } };
    masterToken = authJson?.data?.token;
    if (!masterToken) throw new Error("PAC no devolvió token maestro");
  }

  // Registrar e.firma del cliente para descargas
  const reg = await fetch(`${SW_BASE}/cfdi/efirma/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${masterToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      cer: args.cer_b64,
      key: args.key_b64,
      password: args.password,
    }),
  });
  if (!reg.ok) {
    const txt = await reg.text();
    throw new Error(`PAC rechazó la e.firma: ${txt.slice(0, 200)}`);
  }
  return { token: masterToken, simulated: false as const };
}

export const getSatStatus = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("sat_credenciales")
      .select("proveedor, estatus, last_sync_at, last_error, updated_at")
      .eq("cliente_id", data.cliente_id)
      .maybeSingle();
    return row ?? { proveedor: "sw_sapien", estatus: "sin_conectar", last_sync_at: null, last_error: null, updated_at: null };
  });

export const conectarSat = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => ConnectSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolver despacho del cliente y validar membresía
    const { data: cli, error: cliErr } = await supabase
      .from("clientes")
      .select("id, despacho_id, rfc")
      .eq("id", data.cliente_id)
      .maybeSingle();
    if (cliErr || !cli) throw new Error("Expediente no encontrado");
    if (!cli.despacho_id) throw new Error("Expediente sin despacho asignado");
    if (!cli.rfc) throw new Error("El expediente no tiene RFC capturado");

    // CANDADO: el .cer debe pertenecer al RFC del expediente activo.
    const rfcsCer = extraerRfcsDeCer(data.cer_b64);
    const rfcCliente = cli.rfc.toUpperCase();
    if (rfcsCer.length === 0) {
      throw new Error(
        "No se pudo leer el RFC del certificado (.cer). Verifica que estés subiendo el archivo correcto de la e.firma.",
      );
    }
    if (!rfcsCer.includes(rfcCliente)) {
      throw new Error(
        `La e.firma NO corresponde a este expediente. El certificado pertenece a ${rfcsCer.join(", ")} pero el expediente activo es ${rfcCliente}. Para evitar firmar declaraciones con la e.firma equivocada, la carga fue rechazada.`,
      );
    }


    let result: { token: string; simulated: boolean };
    try {
      result = await obtainSwToken({
        cer_b64: data.cer_b64,
        key_b64: data.key_b64,
        password: data.password,
      });
    } catch (e: any) {
      // Guardar el error para visibilidad y propagar
      await supabase.from("sat_credenciales").upsert(
        {
          cliente_id: cli.id,
          despacho_id: cli.despacho_id,
          proveedor: "sw_sapien",
          estatus: "error",
          last_error: String(e?.message ?? e).slice(0, 500),
        },
        { onConflict: "cliente_id" },
      );
      throw new Error(e?.message ?? "Error al conectar con el PAC");
    }

    const { error: upErr } = await supabase.from("sat_credenciales").upsert(
      {
        cliente_id: cli.id,
        despacho_id: cli.despacho_id,
        proveedor: "sw_sapien",
        pac_token: result.token,
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
        nomina: true,
        pagos: true,
        retenciones: false,
        frecuencia: "diaria",
        periodo: "mes_actual",
        activo: true,
        proxima_corrida_at: new Date().toISOString(), // disparar en el próximo tick del cron
      });
    } else if (!prevCfg.activo) {
      await supabase
        .from("sat_sync_config")
        .update({ activo: true, proxima_corrida_at: new Date().toISOString() })
        .eq("cliente_id", cli.id);
    }

    // Audit log (best-effort)
    await supabase.from("audit_logs").insert({
      user_id: userId,
      despacho_id: cli.despacho_id,
      accion: "sat.conectar",
      entidad: "cliente",
      entidad_id: cli.id,
      payload: { simulated: result.simulated, rfc: cli.rfc, auto_sync: true },
    });

    return { ok: true, simulated: result.simulated, auto_sync_activado: true };
  });

export const desconectarSat = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sat_credenciales")
      .delete()
      .eq("cliente_id", data.cliente_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SyncSchema = z.object({
  cliente_id: z.string().uuid(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.enum(["emitidos", "recibidos", "ambos"]).default("ambos"),
});

export const sincronizarCfdis = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => SyncSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: cred } = await supabase
      .from("sat_credenciales")
      .select("pac_token, estatus, despacho_id")
      .eq("cliente_id", data.cliente_id)
      .maybeSingle();
    if (!cred || cred.estatus !== "activo" || !cred.pac_token) {
      throw new Error("Este expediente no está conectado al SAT");
    }

    const { data: cli } = await supabase
      .from("clientes")
      .select("id, despacho_id, rfc")
      .eq("id", data.cliente_id)
      .maybeSingle();
    if (!cli || !cli.despacho_id) throw new Error("Expediente no encontrado");

    const isMock = cred.pac_token.startsWith("mock_") || !process.env.SW_USER;
    let descargados = 0;
    let ya_existian = 0;
    const errores: string[] = [];
    let detalle = "";

    if (isMock) {
      // Modo demo: simulamos respuesta del PAC. Los CFDI reales del expediente
      // ya pueden cargarse vía el seed demo o la subida manual de XML.
      descargados = Math.floor(Math.random() * 4) + 2;
      ya_existian = Math.floor(Math.random() * 3);
      detalle = "Sincronización en modo demo (PAC no configurado).";
    } else {
      try {
        // SW Sapien: solicitud de descarga masiva
        // Ver https://developers.sw.com.mx/  →  /cfdi/descargamasiva
        const res = await fetch("https://services.sw.com.mx/cfdi/descargamasiva/solicitud", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cred.pac_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rfc: cli.rfc,
            fechaInicio: data.desde,
            fechaFin: data.hasta,
            tipoSolicitud: data.tipo === "ambos" ? "CFDI" : data.tipo,
          }),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`PAC ${res.status}: ${txt.slice(0, 200)}`);
        }
        const j = (await res.json()) as { data?: { idSolicitud?: string } };
        detalle = `Solicitud enviada al SAT (id ${j.data?.idSolicitud ?? "?"}). Los XMLs se ingestarán en la siguiente verificación.`;
        // Nota: el flujo SAT es asíncrono (solicitud → verificación → descarga),
        // un cron posterior hará el polling. Aquí solo registramos la solicitud.
      } catch (e: any) {
        errores.push(String(e?.message ?? e));
      }
    }

    await supabase
      .from("sat_credenciales")
      .update({
        last_sync_at: new Date().toISOString(),
        last_error: errores.length ? errores.join("; ").slice(0, 500) : null,
        estatus: errores.length ? "error" : "activo",
      })
      .eq("cliente_id", data.cliente_id);

    await supabase.from("audit_logs").insert({
      user_id: userId,
      despacho_id: cli.despacho_id,
      accion: "sat.sincronizar",
      entidad: "cliente",
      entidad_id: cli.id,
      payload: { desde: data.desde, hasta: data.hasta, descargados, ya_existian, errores, simulated: isMock },
    });

    return {
      ok: errores.length === 0,
      simulated: isMock,
      descargados,
      ya_existian,
      errores,
      detalle,
    };
  });
