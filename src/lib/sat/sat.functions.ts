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

async function obtainSwToken(args: { cer_b64: string; key_b64: string; password: string }) {
  const SW_USER = process.env.SW_USER;
  const SW_PASSWORD = process.env.SW_PASSWORD;
  // Modo simulado si no hay credenciales del PAC configuradas
  if (!SW_USER || !SW_PASSWORD) {
    return { token: `mock_${crypto.randomUUID()}`, simulated: true as const };
  }
  // Autenticación contra SW Sapien (https://services.sw.com.mx)
  const auth = await fetch("https://services.sw.com.mx/security/authenticate", {
    method: "POST",
    headers: {
      user: SW_USER,
      password: SW_PASSWORD,
    },
  });
  if (!auth.ok) throw new Error(`PAC auth falló (${auth.status})`);
  const authJson = (await auth.json()) as { data?: { token?: string } };
  const masterToken = authJson?.data?.token;
  if (!masterToken) throw new Error("PAC no devolvió token maestro");

  // Registrar e.firma del cliente para descargas
  const reg = await fetch("https://services.sw.com.mx/cfdi/efirma/register", {
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

    // Audit log (best-effort)
    await supabase.from("audit_logs").insert({
      user_id: userId,
      despacho_id: cli.despacho_id,
      accion: "sat.conectar",
      entidad: "cliente",
      entidad_id: cli.id,
      payload: { simulated: result.simulated, rfc: cli.rfc },
    });

    return { ok: true, simulated: result.simulated };
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
