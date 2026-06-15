import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Schema = z.object({
  cliente_id: z.string().min(1),
  // YYYY-MM
  periodo: z.string().regex(/^\d{4}-\d{2}$/),
});

export type ResumenFiscalMes = {
  periodo: string;
  desde: string;
  hasta: string;
  ingresos: number;          // suma total CFDI tipo I emitidos (donde cliente es emisor)
  egresos: number;           // suma total CFDI tipo I recibidos (gastos deducibles)
  ivaTrasladado: number;     // IVA cobrado (ingresos)
  ivaAcreditable: number;    // IVA pagado (egresos)
  notasCreditoEmitidas: number; // CFDI tipo E emitidos
  cfdiCount: number;
  emisorRfc: string | null;
};

function endOfMonth(periodo: string): { desde: string; hasta: string } {
  const [y, m] = periodo.split("-").map(Number);
  const desde = `${periodo}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const hasta = `${periodo}-${String(last).padStart(2, "0")}`;
  return { desde, hasta };
}

export const getResumenFiscalMes = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data, context }): Promise<ResumenFiscalMes> => {
    const { supabase } = context;
    const { desde, hasta } = endOfMonth(data.periodo);
    const empty: ResumenFiscalMes = {
      periodo: data.periodo, desde, hasta,
      ingresos: 0, egresos: 0, ivaTrasladado: 0, ivaAcreditable: 0,
      notasCreditoEmitidas: 0, cfdiCount: 0, emisorRfc: null,
    };
    if (!UUID_RE.test(data.cliente_id)) return empty;

    const { data: cli } = await supabase
      .from("clientes").select("rfc").eq("id", data.cliente_id).maybeSingle();
    const rfc = (cli?.rfc as string | undefined)?.toUpperCase() ?? null;

    const { data: rows, error } = await supabase
      .from("cfdi_xml")
      .select("tipo_cfdi, total, iva_trasladado, iva_retenido, rfc_emisor, rfc_receptor, estatus_sat, fecha")
      .eq("cliente_id", data.cliente_id)
      .gte("fecha", `${desde}T00:00:00`)
      .lte("fecha", `${hasta}T23:59:59`);
    if (error) throw new Error(error.message);

    const r = (rows ?? []).filter((x) => x.estatus_sat !== "cancelado");
    let ingresos = 0, egresos = 0, ivaTrasladado = 0, ivaAcreditable = 0, nc = 0;

    for (const x of r) {
      const emisor = (x.rfc_emisor as string | null)?.toUpperCase();
      const esEmitido = rfc ? emisor === rfc : false;
      const total = Number(x.total ?? 0);
      const iva = Number(x.iva_trasladado ?? 0);
      if (x.tipo_cfdi === "I" && esEmitido) {
        ingresos += total;
        ivaTrasladado += iva;
      } else if (x.tipo_cfdi === "I" && !esEmitido) {
        egresos += total;
        ivaAcreditable += iva;
      } else if (x.tipo_cfdi === "E" && esEmitido) {
        nc += total;
      }
    }

    return {
      periodo: data.periodo, desde, hasta,
      ingresos: Math.max(ingresos - nc, 0),
      egresos,
      ivaTrasladado,
      ivaAcreditable,
      notasCreditoEmitidas: nc,
      cfdiCount: r.length,
      emisorRfc: rfc,
    };
  });
