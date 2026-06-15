import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { EFOS_DEMO, EFOS_META, lookupEfos, type EfosRecord, type EfosSituacion } from "./lista-demo";

const SEVERIDAD: Record<EfosSituacion, "alta" | "media" | "baja"> = {
  definitivo: "alta",
  presunto: "media",
  sentencia_favorable: "baja",
  desvirtuado: "baja",
  cancelado: "baja",
};

export type ProveedorMatch = {
  rfc: string;
  nombre_emisor: string | null;
  n_cfdi: number;
  monto: number;
  primer_fecha: string | null;
  ultima_fecha: string | null;
  efos: EfosRecord;
  severidad: "alta" | "media" | "baja";
};

export type ScanResult = {
  cliente: { rfc: string; razon_social: string } | null;
  proveedores_totales: number;
  cfdi_totales: number;
  matches: ProveedorMatch[];
  monto_en_riesgo: number;
  meta: typeof EFOS_META;
};

// ------- Single / multi RFC lookup (sin tocar BD) -------

export const lookupEfosRfc = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ rfcs: z.array(z.string().min(8).max(13)).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data }) => {
    const results = data.rfcs.map((rfc) => {
      const hit = lookupEfos(rfc);
      return {
        rfc: rfc.trim().toUpperCase(),
        encontrado: !!hit,
        registro: hit,
        severidad: hit ? SEVERIDAD[hit.situacion] : null,
      };
    });
    return { results, meta: EFOS_META };
  });

// ------- Scan completo del expediente activo -------

export const scanClienteEfos = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ScanResult> => {
    const { supabase } = context;

    const [{ data: cli }, { data: cfdis }] = await Promise.all([
      supabase.from("clientes").select("rfc, razon_social").eq("id", data.cliente_id).single(),
      supabase
        .from("cfdi_xml")
        .select("rfc_emisor, nombre_emisor, total, fecha")
        .eq("cliente_id", data.cliente_id),
    ]);

    const all = cfdis ?? [];
    const byRfc = new Map<
      string,
      { nombre: string | null; n: number; monto: number; min: string | null; max: string | null }
    >();
    for (const c of all) {
      const rfc = ((c.rfc_emisor as string) ?? "").toUpperCase();
      if (!rfc) continue;
      const agg = byRfc.get(rfc) ?? { nombre: (c.nombre_emisor as string) ?? null, n: 0, monto: 0, min: null, max: null };
      agg.n += 1;
      agg.monto += Number(c.total ?? 0);
      const f = (c.fecha as string)?.slice(0, 10) ?? null;
      if (f) {
        if (!agg.min || f < agg.min) agg.min = f;
        if (!agg.max || f > agg.max) agg.max = f;
      }
      byRfc.set(rfc, agg);
    }

    const matches: ProveedorMatch[] = [];
    for (const [rfc, agg] of byRfc) {
      const efos = lookupEfos(rfc);
      if (!efos) continue;
      matches.push({
        rfc,
        nombre_emisor: agg.nombre,
        n_cfdi: agg.n,
        monto: agg.monto,
        primer_fecha: agg.min,
        ultima_fecha: agg.max,
        efos,
        severidad: SEVERIDAD[efos.situacion],
      });
    }
    matches.sort((a, b) => {
      const order = { alta: 0, media: 1, baja: 2 } as const;
      if (order[a.severidad] !== order[b.severidad]) return order[a.severidad] - order[b.severidad];
      return b.monto - a.monto;
    });

    return {
      cliente: cli ? { rfc: cli.rfc as string, razon_social: cli.razon_social as string } : null,
      proveedores_totales: byRfc.size,
      cfdi_totales: all.length,
      matches,
      monto_en_riesgo: matches.filter((m) => m.severidad !== "baja").reduce((a, b) => a + b.monto, 0),
      meta: EFOS_META,
    };
  });

// ------- Catálogo (para mostrar info de la lista) -------

export const efosCatalog = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async () => {
    const counts = EFOS_DEMO.reduce<Record<EfosSituacion, number>>(
      (acc, r) => ({ ...acc, [r.situacion]: (acc[r.situacion] ?? 0) + 1 }),
      { definitivo: 0, presunto: 0, desvirtuado: 0, sentencia_favorable: 0, cancelado: 0 },
    );
    return { counts, meta: EFOS_META };
  });
