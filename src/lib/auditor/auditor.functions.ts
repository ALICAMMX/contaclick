import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Schema = z.object({
  cliente_id: z.string().min(1),
  year: z.number().int().min(2018).max(2100).optional(),
});

export type AuditFinding = {
  tipo: "duplicado" | "nc_huerfana" | "cancelado_declarado" | "ppd_sin_pago" | "fuera_periodo";
  severidad: "alta" | "media" | "baja";
  uuid: string;
  fecha: string | null;
  monto: number;
  descripcion: string;
  rfc_contraparte?: string | null;
};

export const runExpressAudit = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    if (!UUID_RE.test(data.cliente_id)) {
      return {
        findings: [] as AuditFinding[],
        stats: { duplicados: 0, nc_huerfanas: 0, cancelados_declarados: 0, ppd_sin_pago: 0, fuera_periodo: 0, total: 0 },
        year: data.year ?? new Date().getFullYear(),
      };
    }
    const { supabase } = context;
    const year = data.year ?? new Date().getFullYear();
    const yStart = `${year}-01-01T00:00:00Z`;
    const yEnd = `${year + 1}-01-01T00:00:00Z`;

    const { data: cli } = await supabase.from("clientes").select("rfc").eq("id", data.cliente_id).maybeSingle();
    const rfcCli = ((cli?.rfc as string) ?? "").toUpperCase();

    const { data: cfdis } = await supabase
      .from("cfdi_xml")
      .select("id, uuid, tipo_cfdi, fecha, metodo_pago, total, estatus_sat, rfc_emisor, rfc_receptor, nombre_emisor, nombre_receptor")
      .eq("cliente_id", data.cliente_id);

    const list = cfdis ?? [];
    const ids = list.map((c) => c.id as string);

    let relaciones: Array<{ cfdi_id: string; uuid_relacionado: string; tipo_relacion: string }> = [];
    if (ids.length) {
      const { data: rel } = await supabase
        .from("cfdi_relaciones")
        .select("cfdi_id, uuid_relacionado, tipo_relacion")
        .in("cfdi_id", ids);
      relaciones = (rel ?? []) as typeof relaciones;
    }

    // Indexes
    const byUuid = new Map<string, typeof list>();
    for (const c of list) {
      const arr = byUuid.get(c.uuid as string) ?? [];
      arr.push(c);
      byUuid.set(c.uuid as string, arr);
    }
    const uuidsExistentes = new Set(list.map((c) => (c.uuid as string).toUpperCase()));
    // Pagos (tipo P) referencian ingresos vía cfdi_relaciones.uuid_relacionado
    const pagosUuidsRef = new Set<string>();
    const pagosIds = new Set(list.filter((c) => c.tipo_cfdi === "P").map((c) => c.id as string));
    for (const r of relaciones) {
      if (pagosIds.has(r.cfdi_id)) pagosUuidsRef.add(r.uuid_relacionado.toUpperCase());
    }
    // Relaciones por cfdi
    const relByCfdi = new Map<string, string[]>();
    for (const r of relaciones) {
      const arr = relByCfdi.get(r.cfdi_id) ?? [];
      arr.push(r.uuid_relacionado.toUpperCase());
      relByCfdi.set(r.cfdi_id, arr);
    }

    const findings: AuditFinding[] = [];

    // (a) Duplicados — mismo UUID en >1 fila
    for (const [uuid, arr] of byUuid) {
      if (arr.length > 1) {
        for (const c of arr) {
          findings.push({
            tipo: "duplicado",
            severidad: "alta",
            uuid,
            fecha: (c.fecha as string) ?? null,
            monto: Number(c.total ?? 0),
            descripcion: `UUID emitido ${arr.length} veces en el expediente`,
            rfc_contraparte: (c.rfc_receptor as string) ?? null,
          });
        }
      }
    }

    for (const c of list) {
      const tipo = c.tipo_cfdi as string;
      const fecha = c.fecha as string;
      const monto = Number(c.total ?? 0);
      const uuid = c.uuid as string;
      const metodo = (c.metodo_pago as string) ?? "";
      const estatus = ((c.estatus_sat as string) ?? "").toLowerCase();

      // (b) Notas de crédito huérfanas (egreso 'E' emitido por el cliente)
      if (tipo === "E" && (c.rfc_emisor as string)?.toUpperCase() === rfcCli) {
        const rels = relByCfdi.get(c.id as string) ?? [];
        const hasIngresoRelacionado = rels.some((u) => uuidsExistentes.has(u));
        if (!rels.length || !hasIngresoRelacionado) {
          findings.push({
            tipo: "nc_huerfana",
            severidad: "alta",
            uuid,
            fecha,
            monto,
            descripcion: rels.length
              ? "Nota de crédito relaciona UUIDs que no están en el expediente"
              : "Nota de crédito sin CFDI de ingreso relacionado",
            rfc_contraparte: (c.rfc_receptor as string) ?? null,
          });
        }
      }

      // (c) CFDIs cancelados (potencial monto ya declarado)
      if (estatus === "cancelado") {
        findings.push({
          tipo: "cancelado_declarado",
          severidad: "media",
          uuid,
          fecha,
          monto,
          descripcion: "CFDI cancelado — verifica si fue declarado en un periodo anterior",
          rfc_contraparte: (c.rfc_receptor as string) ?? (c.rfc_emisor as string) ?? null,
        });
      }

      // (d) PPD sin complemento de pago
      if (tipo === "I" && metodo.toUpperCase() === "PPD") {
        if (!pagosUuidsRef.has(uuid.toUpperCase())) {
          findings.push({
            tipo: "ppd_sin_pago",
            severidad: "alta",
            uuid,
            fecha,
            monto,
            descripcion: "CFDI PPD sin complemento de pago timbrado",
            rfc_contraparte: (c.rfc_receptor as string) ?? null,
          });
        }
      }

      // (e) Fuera del periodo declarado (año fiscal seleccionado)
      if (fecha < yStart || fecha >= yEnd) {
        findings.push({
          tipo: "fuera_periodo",
          severidad: "baja",
          uuid,
          fecha,
          monto,
          descripcion: `CFDI fuera del año fiscal ${year}`,
          rfc_contraparte: (c.rfc_receptor as string) ?? (c.rfc_emisor as string) ?? null,
        });
      }
    }

    const stats = {
      duplicados: findings.filter((f) => f.tipo === "duplicado").length,
      nc_huerfanas: findings.filter((f) => f.tipo === "nc_huerfana").length,
      cancelados_declarados: findings.filter((f) => f.tipo === "cancelado_declarado").length,
      ppd_sin_pago: findings.filter((f) => f.tipo === "ppd_sin_pago").length,
      fuera_periodo: findings.filter((f) => f.tipo === "fuera_periodo").length,
      total: list.length,
    };

    return { findings, stats, year };
  });
