// ─────────────────────────────────────────────────────────────────────────────
// DESCARGA CONTROLADA DEL XML ORIGINAL.
//
// El archivero es privado: no hay URL pública ni lectura anónima. Cada descarga
// exige sesión, pertenencia del comprobante al expediente activo del despacho,
// genera un enlace firmado de vida corta y queda registrada en la bitácora.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import { BUCKET_ORIGINALES, originalVerificado } from "./original";

/** Vigencia del enlace firmado: suficiente para descargar, no para compartir. */
export const VIGENCIA_ENLACE_SEGUNDOS = 60;

export const descargarOriginalCfdi = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), cfdi_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Aislamiento: el expediente debe pertenecer al despacho del usuario.
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    // El comprobante debe pertenecer al expediente autorizado (RLS + filtro).
    const { data: fila, error } = await supabase
      .from("cfdi_xml")
      .select("id, uuid, original_path, original_estado, original_sha256")
      .eq("id", data.cfdi_id)
      .eq("cliente_id", scope.cliente_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!fila) throw new Error("El comprobante no pertenece al expediente activo.");
    if (!fila.original_path || !originalVerificado(fila.original_estado)) {
      throw new Error("Este comprobante no tiene XML original verificado en el archivero.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: firmado, error: errFirma } = await supabaseAdmin.storage
      .from(BUCKET_ORIGINALES)
      .createSignedUrl(fila.original_path, VIGENCIA_ENLACE_SEGUNDOS, {
        download: `${fila.uuid ?? "cfdi"}.xml`,
      });
    if (errFirma || !firmado?.signedUrl) {
      throw new Error(`No se pudo generar el enlace de descarga: ${errFirma?.message ?? "desconocido"}`);
    }

    await supabase.from("audit_logs").insert({
      user_id: userId,
      despacho_id: scope.despacho_id,
      accion: "cfdi.original.descargar",
      entidad: "cfdi_xml",
      entidad_id: fila.id,
      payload: { uuid: fila.uuid, sha256: fila.original_sha256, vigencia_s: VIGENCIA_ENLACE_SEGUNDOS },
    });

    return {
      url: firmado.signedUrl,
      expira_en_segundos: VIGENCIA_ENLACE_SEGUNDOS,
      uuid: fila.uuid as string | null,
      sha256: fila.original_sha256 as string | null,
    };
  });
