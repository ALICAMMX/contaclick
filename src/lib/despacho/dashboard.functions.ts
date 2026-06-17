import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

export type ClienteResumen = {
  id: string;
  rfc: string;
  razon_social: string;
  semaforo: "verde" | "amarillo" | "rojo";
  estado_mes: string | null;
  cfdi_mes: number;
  alertas_abiertas: number;
  obligaciones_proximas: number;
  proxima_obligacion: { clave: string; vencimiento: string } | null;
};

export const getDespachoDashboard = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: mem } = await supabase
      .from("user_memberships")
      .select("despacho_id")
      .eq("user_id", userId)
      .eq("estado", "activo")
      .limit(1)
      .maybeSingle();
    if (!mem?.despacho_id) {
      return {
        clientes: [] as ClienteResumen[],
        totales: { clientes: 0, rojo: 0, amarillo: 0, verde: 0, alertas: 0, vencidas: 0 },
      };
    }

    const despachoId = mem.despacho_id as string;

    // Mes corriente
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const in30 = new Date(now.getTime() + 30 * 86400_000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    const [clientesRes, alertasRes, cfdiRes, obligRes, rfcsRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, rfc, razon_social, semaforo, estado_mes")
        .eq("despacho_id", despachoId)
        .order("razon_social"),
      supabase
        .from("alertas")
        .select("cliente_id, nivel")
        .eq("despacho_id", despachoId)
        .eq("estatus", "abierta"),
      supabase
        .from("cfdi_xml")
        .select("cliente_id")
        .eq("despacho_id", despachoId)
        .gte("fecha", firstDay),
      supabase
        .from("obligaciones_fiscales")
        .select("rfc_id, clave, proximo_vencimiento, estatus")
        .eq("despacho_id", despachoId)
        .neq("estatus", "presentada")
        .lte("proximo_vencimiento", in30)
        .order("proximo_vencimiento", { ascending: true }),
      supabase
        .from("rfcs")
        .select("id, cliente_id")
        .eq("despacho_id", despachoId),
    ]);

    const alertasByCli = new Map<string, number>();
    (alertasRes.data ?? []).forEach((a: any) => {
      if (!a.cliente_id) return;
      alertasByCli.set(a.cliente_id, (alertasByCli.get(a.cliente_id) ?? 0) + 1);
    });

    const cfdiByCli = new Map<string, number>();
    (cfdiRes.data ?? []).forEach((c: any) => {
      cfdiByCli.set(c.cliente_id, (cfdiByCli.get(c.cliente_id) ?? 0) + 1);
    });

    const rfcToCli = new Map<string, string>();
    (rfcsRes.data ?? []).forEach((r: any) => rfcToCli.set(r.id, r.cliente_id));

    const obligByCli = new Map<string, { count: number; next: { clave: string; vencimiento: string } | null }>();
    (obligRes.data ?? []).forEach((o: any) => {
      const cli = rfcToCli.get(o.rfc_id);
      if (!cli) return;
      const cur = obligByCli.get(cli) ?? { count: 0, next: null };
      cur.count += 1;
      if (!cur.next) cur.next = { clave: o.clave, vencimiento: o.proximo_vencimiento };
      obligByCli.set(cli, cur);
    });

    const clientes: ClienteResumen[] = (clientesRes.data ?? []).map((c: any) => {
      const ob = obligByCli.get(c.id);
      return {
        id: c.id,
        rfc: c.rfc,
        razon_social: c.razon_social,
        semaforo: (c.semaforo ?? "verde") as ClienteResumen["semaforo"],
        estado_mes: c.estado_mes ?? null,
        cfdi_mes: cfdiByCli.get(c.id) ?? 0,
        alertas_abiertas: alertasByCli.get(c.id) ?? 0,
        obligaciones_proximas: ob?.count ?? 0,
        proxima_obligacion: ob?.next ?? null,
      };
    });

    const totales = {
      clientes: clientes.length,
      rojo: clientes.filter((c) => c.semaforo === "rojo").length,
      amarillo: clientes.filter((c) => c.semaforo === "amarillo").length,
      verde: clientes.filter((c) => c.semaforo === "verde").length,
      alertas: (alertasRes.data ?? []).length,
      vencidas: (obligRes.data ?? []).filter((o: any) => o.proximo_vencimiento && o.proximo_vencimiento < today).length,
    };

    return { clientes, totales };
  });
