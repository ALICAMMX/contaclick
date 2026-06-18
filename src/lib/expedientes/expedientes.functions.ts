import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

export type Expediente = {
  id: string;
  rfc: string;
  razon_social: string;
  regimen_fiscal: string | null;
  semaforo: string | null;
  estado_mes: string | null;
  cfdi_count: number;
  ultimo_cfdi: string | null;
  alertas_total: number;
  alertas_altas: number;
  ingresos_mes: number;
  egresos_mes: number;
  riesgo: number;
};

export const listExpedientes = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: Expediente[] }> => {
    const { supabase } = context;

    const { data: clientes, error } = await supabase
      .from("clientes")
      .select("id, rfc, razon_social, regimen_fiscal, semaforo, estado_mes")
      .order("razon_social", { ascending: true });
    if (error) throw new Error(error.message);
    const list = clientes ?? [];
    if (list.length === 0) return { items: [] };

    const ids = list.map((c) => c.id as string);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [{ data: cfdis }, { data: alertas }] = await Promise.all([
      supabase
        .from("cfdi_xml")
        .select("cliente_id, total, fecha, tipo_cfdi, rfc_emisor")
        .in("cliente_id", ids),
      supabase
        .from("alertas")
        .select("cliente_id, nivel, estatus")
        .in("cliente_id", ids),
    ]);

    const items: Expediente[] = list.map((c) => {
      const cfClient = (cfdis ?? []).filter((x) => x.cliente_id === c.id);
      const ultimo = cfClient.reduce<string | null>((acc, x) => {
        const f = (x.fecha as string) ?? null;
        if (!f) return acc;
        if (!acc || f > acc) return f;
        return acc;
      }, null);
      const ingresos_mes = cfClient
        .filter((x) => x.rfc_emisor === c.rfc && (x.fecha as string) >= monthStart)
        .reduce((a, b) => a + Number(b.total ?? 0), 0);
      const egresos_mes = cfClient
        .filter((x) => x.rfc_emisor !== c.rfc && (x.fecha as string) >= monthStart)
        .reduce((a, b) => a + Number(b.total ?? 0), 0);
      const aClient = (alertas ?? []).filter((a) => a.cliente_id === c.id && a.estatus !== "resuelta");
      const altas = aClient.filter((a) => a.nivel === "alto").length;
      const semaforo = (c.semaforo as string | null) ?? null;
      const riesgo =
        semaforo === "rojo" ? 80 : semaforo === "amarillo" ? 50 : semaforo === "verde" ? 18 : 35;
      return {
        id: c.id as string,
        rfc: c.rfc as string,
        razon_social: c.razon_social as string,
        regimen_fiscal: (c.regimen_fiscal as string) ?? null,
        semaforo,
        estado_mes: (c.estado_mes as string) ?? null,
        cfdi_count: cfClient.length,
        ultimo_cfdi: ultimo,
        alertas_total: aClient.length,
        alertas_altas: altas,
        ingresos_mes,
        egresos_mes,
        riesgo: Math.min(100, riesgo + Math.min(20, altas * 8)),
      };
    });

    return { items };
  });
