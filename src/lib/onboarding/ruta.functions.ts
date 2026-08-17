// Ruta guiada del expediente — E/S. Toda lectura pasa por `assertClienteScope`.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import { construirRuta, progresoRuta, siguientePaso, type SnapshotRuta } from "./ruta";
import { rangoMensual } from "@/lib/cierre/periodo";

const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const Schema = z.object({
  cliente_id: z.string().uuid(),
  periodo: z.string().regex(PERIODO_RE, "Periodo con formato AAAA-MM"),
});

export const getRutaExpediente = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const clienteId = scope.cliente_id;
    const periodo = data.periodo;
    const rango = rangoMensual(periodo);

    const cnt = { count: "exact" as const, head: true };

    const [cliente, credencial, cfdiTotal, cfdiSinOriginal, movimientos, cuentas, etapas, decisiones, polizas] =
      await Promise.all([
        supabase
          .from("clientes")
          .select("regimen_fiscal, domicilio_fiscal, codigo_postal, csf_ultima_emision, obligaciones")
          .eq("id", clienteId)
          .maybeSingle(),
        supabase
          .from("sat_credenciales")
          .select("estatus, efirma_vence_at, last_sync_at")
          .eq("cliente_id", clienteId)
          .maybeSingle(),
        supabase.from("cfdi_xml").select("id", cnt).eq("cliente_id", clienteId).eq("periodo", periodo),
        supabase
          .from("cfdi_xml")
          .select("id", cnt)
          .eq("cliente_id", clienteId)
          .eq("periodo", periodo)
          .neq("original_estado", "verificado"),
        supabase
          .from("movimientos_bancarios")
          .select("id", cnt)
          .eq("cliente_id", clienteId)
          .gte("fecha", rango.desde)
          .lt("fecha", rango.hastaExclusivo),
        supabase.from("cuentas_bancarias").select("id", cnt).eq("cliente_id", clienteId),
        supabase.from("cierre_etapas").select("etapa, estado").eq("cliente_id", clienteId).eq("periodo", periodo),
        supabase
          .from("cfdi_decisiones_fiscales")
          .select("id", cnt)
          .eq("cliente_id", clienteId)
          .eq("periodo", periodo)
          .eq("decision", "pendiente"),
        supabase
          .from("polizas")
          .select("id", cnt)
          .eq("cliente_id", clienteId)
          .eq("periodo", periodo)
          .eq("estado", "borrador"),
      ]);

    const mapaEtapas: Record<string, string> = {};
    for (const e of etapas.data ?? []) mapaEtapas[e.etapa] = e.estado;

    const snapshot: SnapshotRuta = {
      regimenFiscal: cliente.data?.regimen_fiscal ?? null,
      domicilioFiscal: cliente.data?.domicilio_fiscal ?? null,
      codigoPostal: cliente.data?.codigo_postal ?? null,
      csfUltimaEmision: cliente.data?.csf_ultima_emision ?? null,
      obligaciones: cliente.data?.obligaciones ?? 0,
      efirmaEstatus: credencial.data?.estatus ?? null,
      efirmaVenceAt: credencial.data?.efirma_vence_at ?? null,
      efirmaUltimaSync: credencial.data?.last_sync_at ?? null,
      cfdiPeriodo: cfdiTotal.count ?? 0,
      cfdiSinOriginal: cfdiSinOriginal.count ?? 0,
      movimientosPeriodo: movimientos.count ?? 0,
      cuentasBancarias: cuentas.count ?? 0,
      etapas: mapaEtapas,
      decisionesPendientes: decisiones.count ?? 0,
      polizasBorrador: polizas.count ?? 0,
    };

    const pasos = construirRuta(snapshot);

    return {
      expediente: { id: clienteId, rfc: scope.rfc, razon_social: scope.razon_social },
      periodo,
      pasos,
      progreso: progresoRuta(pasos),
      siguiente: siguientePaso(pasos),
    };
  });
