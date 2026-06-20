import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RFC_EXTRANJERO = "XEXX010101000";

const Schema = z.object({
  cliente_id: z.string().min(1),
  year: z.number().int().min(2018).max(2100).optional(),
  umbral_desviacion: z.number().min(0.1).max(5).default(0.5),
});

export type PrecioFinding = {
  cfdi_id: string;
  uuid: string;
  fecha: string | null;
  nombre_emisor: string | null;
  clave_prod_serv: string;
  descripcion: string;
  cantidad: number;
  valor_unitario: number;
  mediana_clave: number;
  desviacion_pct: number;
  severidad: "alta" | "media" | "baja";
  motivo: string;
  fundamento: string;
};

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const runImportPriceCheck = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    const year = data.year ?? new Date().getFullYear();
    const empty = {
      findings: [] as PrecioFinding[],
      stats: {
        cfdi_importacion: 0,
        conceptos_analizados: 0,
        claves_unicas: 0,
        hallazgos: 0,
        monto_total: 0,
        monto_riesgo: 0,
      },
      year,
    };
    if (!UUID_RE.test(data.cliente_id)) return empty;

    const { supabase } = context;
    const { data: cli } = await supabase.from("clientes").select("rfc").eq("id", data.cliente_id).maybeSingle();
    const rfcCli = ((cli?.rfc as string) ?? "").toUpperCase();
    if (!rfcCli) return empty;

    const yStart = `${year}-01-01T00:00:00Z`;
    const yEnd = `${year + 1}-01-01T00:00:00Z`;

    // CFDI de importación: emisor extranjero (XEXX) recibidos por el cliente
    const { data: cfdis } = await supabase
      .from("cfdi_xml")
      .select("id, uuid, fecha, rfc_emisor, nombre_emisor, total, subtotal")
      .eq("cliente_id", data.cliente_id)
      .eq("tipo_cfdi", "I")
      .eq("rfc_receptor", rfcCli)
      .eq("rfc_emisor", RFC_EXTRANJERO)
      .gte("fecha", yStart)
      .lt("fecha", yEnd);

    const cfdiList = cfdis ?? [];
    if (cfdiList.length === 0) return empty;

    const ids = cfdiList.map((c) => c.id as string);
    const { data: conceptos } = await supabase
      .from("cfdi_conceptos")
      .select("cfdi_id, clave_prod_serv, descripcion, cantidad, valor_unitario, importe")
      .in("cfdi_id", ids);

    const lista = (conceptos ?? []).filter(
      (c) => (c.valor_unitario ?? 0) > 0 && (c.cantidad ?? 0) > 0 && c.clave_prod_serv,
    );

    // Agrupar por clave para construir comparable interno (mediana del propio cliente)
    const grupos = new Map<string, number[]>();
    lista.forEach((c) => {
      const k = (c.clave_prod_serv as string).slice(0, 8);
      const arr = grupos.get(k) ?? [];
      arr.push(Number(c.valor_unitario));
      grupos.set(k, arr);
    });
    const medianas = new Map<string, number>();
    grupos.forEach((vals, k) => medianas.set(k, median(vals)));

    const findings: PrecioFinding[] = [];
    const byId = new Map(cfdiList.map((c) => [c.id as string, c]));

    lista.forEach((c) => {
      const clave = (c.clave_prod_serv as string).slice(0, 8);
      const med = medianas.get(clave) ?? 0;
      const vu = Number(c.valor_unitario);
      const desv = med > 0 ? (vu - med) / med : 0;
      const desvAbs = Math.abs(desv);
      const cfdi = byId.get(c.cfdi_id as string);
      if (!cfdi) return;

      // Hallazgo 1: outlier en precio respecto a la propia muestra
      const sampleSize = grupos.get(clave)?.length ?? 0;
      if (sampleSize >= 3 && desvAbs >= data.umbral_desviacion) {
        const sev: PrecioFinding["severidad"] = desvAbs >= 1 ? "alta" : desvAbs >= 0.75 ? "media" : "baja";
        findings.push({
          cfdi_id: c.cfdi_id as string,
          uuid: cfdi.uuid as string,
          fecha: cfdi.fecha as string | null,
          nombre_emisor: (cfdi.nombre_emisor as string | null) ?? null,
          clave_prod_serv: c.clave_prod_serv as string,
          descripcion: ((c.descripcion as string) ?? "").slice(0, 120),
          cantidad: Number(c.cantidad),
          valor_unitario: vu,
          mediana_clave: med,
          desviacion_pct: desv * 100,
          severidad: sev,
          motivo:
            desv > 0
              ? `Precio ${(desv * 100).toFixed(0)}% por arriba de la mediana del propio cliente para la clave ${clave}. Requiere comparable de mercado.`
              : `Precio ${(Math.abs(desv) * 100).toFixed(0)}% por debajo de la mediana del propio cliente. Riesgo de subvaluación aduanera.`,
          fundamento:
            "LISR art. 76-A y 179 (partes relacionadas y operaciones con extranjeros). Ley Aduanera art. 64-78 (valor en aduana). RMF 3.9.",
        });
      }

      // Hallazgo 2: descripción genérica que impide validar comparable
      const desc = ((c.descripcion as string) ?? "").trim().toLowerCase();
      if (!desc || desc.length < 8 || /^(varios|mercanc|productos?|servicios?)$/i.test(desc)) {
        findings.push({
          cfdi_id: c.cfdi_id as string,
          uuid: cfdi.uuid as string,
          fecha: cfdi.fecha as string | null,
          nombre_emisor: (cfdi.nombre_emisor as string | null) ?? null,
          clave_prod_serv: c.clave_prod_serv as string,
          descripcion: ((c.descripcion as string) ?? "(sin descripción)").slice(0, 120),
          cantidad: Number(c.cantidad),
          valor_unitario: vu,
          mediana_clave: med,
          desviacion_pct: 0,
          severidad: "media",
          motivo: "Descripción genérica o vacía. Imposible justificar valor de mercado ante revisión SAT/aduana.",
          fundamento: "CFF art. 29-A fr. V (descripción del bien o servicio). RMF 2.7.1.32.",
        });
      }
    });

    findings.sort((a, b) => Math.abs(b.desviacion_pct) - Math.abs(a.desviacion_pct));

    const montoTotal = cfdiList.reduce((a, b) => a + Number(b.total ?? 0), 0);
    const montoRiesgo = findings.reduce(
      (a, f) => a + f.cantidad * f.valor_unitario,
      0,
    );

    return {
      findings,
      stats: {
        cfdi_importacion: cfdiList.length,
        conceptos_analizados: lista.length,
        claves_unicas: grupos.size,
        hallazgos: findings.length,
        monto_total: montoTotal,
        monto_riesgo: montoRiesgo,
      },
      year,
    };
  });
