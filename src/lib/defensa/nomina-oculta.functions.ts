import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Schema = z.object({
  cliente_id: z.string().min(1),
  year: z.number().int().min(2018).max(2100).optional(),
  monto_minimo: z.number().min(0).default(3000),
});

export type ShadowFinding = {
  patron: string;
  beneficiario: string;
  ocurrencias: number;
  monto_total: number;
  monto_promedio: number;
  primer_pago: string;
  ultimo_pago: string;
  cubierto_por_cfdi: number;
  diferencia: number;
  severidad: "alta" | "media" | "baja";
  evidencia: string;
  movimiento_ids: string[];
};

function normalizar(desc: string): string {
  return desc
    .toUpperCase()
    .replace(/\d{4,}/g, "")
    .replace(/\b(SPEI|TRANSF|TRANSFER|PAGO|ENVIO|REF|FOLIO|OPE|OPERACION|NO\.?)\b/g, "")
    .replace(/[^\w\sÁÉÍÓÚÑ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export const runShadowPayrollCheck = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    const year = data.year ?? new Date().getFullYear();
    const empty = {
      findings: [] as ShadowFinding[],
      stats: {
        cargos_analizados: 0,
        patrones_recurrentes: 0,
        sospechosos: 0,
        monto_sospechoso: 0,
        nomina_cfdi_total: 0,
        honorarios_cfdi_total: 0,
      },
      year,
    };
    if (!UUID_RE.test(data.cliente_id)) return empty;

    const { supabase } = context;
    const yStart = `${year}-01-01`;
    const yEnd = `${year + 1}-01-01`;

    // Cargos bancarios del año
    const { data: movs } = await supabase
      .from("movimientos_bancarios")
      .select("id, fecha, descripcion, referencia, cargo")
      .eq("cliente_id", data.cliente_id)
      .gt("cargo", 0)
      .gte("fecha", yStart)
      .lt("fecha", yEnd);

    const list = (movs ?? []).filter((m) => Number(m.cargo) >= data.monto_minimo);

    // CFDI Nómina recibidos por el cliente (tipo N) y Honorarios (tipo I con uso D04/G03 a PF)
    const { data: cfdiN } = await supabase
      .from("cfdi_xml")
      .select("rfc_receptor, total")
      .eq("cliente_id", data.cliente_id)
      .eq("tipo_cfdi", "N")
      .gte("fecha", `${year}-01-01T00:00:00Z`)
      .lt("fecha", `${year + 1}-01-01T00:00:00Z`);

    const { data: cfdiI } = await supabase
      .from("cfdi_xml")
      .select("rfc_emisor, nombre_emisor, total")
      .eq("cliente_id", data.cliente_id)
      .eq("tipo_cfdi", "I")
      .gte("fecha", `${year}-01-01T00:00:00Z`)
      .lt("fecha", `${year + 1}-01-01T00:00:00Z`);

    const nominaTotal = (cfdiN ?? []).reduce((a, b) => a + Number(b.total ?? 0), 0);

    // Mapa: nombre PF (proveedor) → monto facturado
    const cfdiPorNombre = new Map<string, number>();
    (cfdiI ?? []).forEach((c) => {
      const rfc = (c.rfc_emisor as string) ?? "";
      if (rfc.length !== 13) return; // solo PF (13 chars)
      const key = normalizar((c.nombre_emisor as string) ?? rfc);
      cfdiPorNombre.set(key, (cfdiPorNombre.get(key) ?? 0) + Number(c.total ?? 0));
    });
    const honorariosTotal = Array.from(cfdiPorNombre.values()).reduce((a, b) => a + b, 0);

    // Agrupar movimientos por patrón normalizado
    type Group = {
      patron: string;
      movs: Array<{ id: string; fecha: string; cargo: number; descripcion: string }>;
    };
    const groups = new Map<string, Group>();
    list.forEach((m) => {
      const desc = (m.descripcion as string) ?? (m.referencia as string) ?? "";
      const patron = normalizar(desc);
      if (!patron || patron.length < 4) return;
      const g = groups.get(patron) ?? { patron, movs: [] };
      g.movs.push({
        id: m.id as string,
        fecha: m.fecha as string,
        cargo: Number(m.cargo),
        descripcion: desc,
      });
      groups.set(patron, g);
    });

    const findings: ShadowFinding[] = [];
    for (const g of groups.values()) {
      if (g.movs.length < 3) continue; // necesita recurrencia

      // Verificar regularidad de monto (coef variación bajo)
      const montos = g.movs.map((m) => m.cargo);
      const avg = montos.reduce((a, b) => a + b, 0) / montos.length;
      const sd = Math.sqrt(montos.reduce((a, b) => a + (b - avg) ** 2, 0) / montos.length);
      const cv = sd / avg;
      if (cv > 0.45) continue; // demasiada variación, no parece nómina

      g.movs.sort((a, b) => a.fecha.localeCompare(b.fecha));
      const totalGrupo = montos.reduce((a, b) => a + b, 0);

      // ¿Está cubierto por CFDI honorarios con nombre similar?
      let cubierto = 0;
      for (const [nombre, monto] of cfdiPorNombre.entries()) {
        if (g.patron.includes(nombre) || nombre.includes(g.patron)) {
          cubierto += monto;
        }
      }

      const diferencia = totalGrupo - cubierto;
      if (diferencia <= totalGrupo * 0.1) continue; // cubierto >90%

      let severidad: ShadowFinding["severidad"] = "media";
      if (g.movs.length >= 6 && diferencia > 50000) severidad = "alta";
      else if (g.movs.length >= 4 && diferencia > 20000) severidad = "alta";
      else if (diferencia < 10000) severidad = "baja";

      const evidencia = cubierto > 0
        ? `Pago recurrente de $${avg.toFixed(0)} (${g.movs.length} veces). CFDI honorarios encontrados por $${cubierto.toFixed(0)}. Diferencia sin respaldo: $${diferencia.toFixed(0)}.`
        : `Pago recurrente de $${avg.toFixed(0)} en ${g.movs.length} ocasiones. Sin CFDI de honorarios ni recibo de nómina que lo respalde. Riesgo de reclasificación a salarios (LISR art. 94).`;

      findings.push({
        patron: g.patron,
        beneficiario: g.movs[0].descripcion.slice(0, 80),
        ocurrencias: g.movs.length,
        monto_total: totalGrupo,
        monto_promedio: avg,
        primer_pago: g.movs[0].fecha,
        ultimo_pago: g.movs[g.movs.length - 1].fecha,
        cubierto_por_cfdi: cubierto,
        diferencia,
        severidad,
        evidencia,
        movimiento_ids: g.movs.map((m) => m.id),
      });
    }

    findings.sort((a, b) => b.diferencia - a.diferencia);

    return {
      findings,
      stats: {
        cargos_analizados: list.length,
        patrones_recurrentes: findings.length,
        sospechosos: findings.filter((f) => f.severidad === "alta").length,
        monto_sospechoso: findings.reduce((a, b) => a + b.diferencia, 0),
        nomina_cfdi_total: nominaTotal,
        honorarios_cfdi_total: honorariosTotal,
      },
      year,
    };
  });
