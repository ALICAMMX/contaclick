import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

// ============================================================================
// AUDITOR DE NÓMINA (NO timbra, NO calcula recibos): revisa CFDI de nómina
// ya emitidos (tipo "N") y detecta inconsistencias contra LISR/LSS/LIVA.
// ============================================================================

type FindingNomina = {
  uuid: string;
  empleado: string;
  fecha: string;
  total: number;
  severidad: "alta" | "media" | "baja";
  titulo: string;
  detalle: string;
  fundamento: string;
};

export const auditarNomina = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      year: z.number().int().min(2018).max(2100).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const year = data.year ?? new Date().getFullYear();
    const ini = `${year}-01-01`;
    const fin = `${year}-12-31`;
    const { data: rows, error } = await context.supabase
      .from("cfdi_xml")
      .select("uuid, fecha, total, receptor_nombre, receptor_rfc, metadata")
      .eq("cliente_id", data.cliente_id)
      .eq("tipo_comprobante", "N")
      .gte("fecha", ini)
      .lte("fecha", fin)
      .order("fecha", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const findings: FindingNomina[] = [];
    const porEmpleado: Map<string, { total: number; cfdi: number; rfc: string }> = new Map();

    for (const r of rows ?? []) {
      const meta = (r as any).metadata ?? {};
      const total = Number(r.total ?? 0);
      const emp = r.receptor_nombre ?? r.receptor_rfc ?? "Sin nombre";
      const acc = porEmpleado.get(emp) ?? { total: 0, cfdi: 0, rfc: r.receptor_rfc ?? "" };
      acc.total += total; acc.cfdi++; porEmpleado.set(emp, acc);

      // Reglas básicas — extensibles
      const isr = Number(meta?.nomina?.isr_retenido ?? 0);
      const subsidio = Number(meta?.nomina?.subsidio ?? 0);
      const sueldoGravado = Number(meta?.nomina?.sueldo_gravado ?? 0);
      const prestExentas = Number(meta?.nomina?.prestaciones_exentas ?? 0);

      // 1) ISR retenido = 0 con sueldo gravado > 16,500/mes ⇒ probable error
      if (sueldoGravado > 16500 && isr === 0) {
        findings.push({
          uuid: r.uuid, empleado: emp, fecha: String(r.fecha).slice(0, 10), total,
          severidad: "alta",
          titulo: "ISR no retenido con sueldo gravado relevante",
          detalle: `Sueldo gravado $${sueldoGravado.toFixed(2)} sin retención de ISR. Revisar tabla art. 96 LISR.`,
          fundamento: "Art. 96 LISR · tarifa mensual ISR sueldos",
        });
      }
      // 2) Subsidio al empleo con sueldo > $10,171/mes ⇒ no aplicable
      if (sueldoGravado > 10171 && subsidio > 0) {
        findings.push({
          uuid: r.uuid, empleado: emp, fecha: String(r.fecha).slice(0, 10), total,
          severidad: "media",
          titulo: "Subsidio al empleo otorgado fuera de tope",
          detalle: `Subsidio $${subsidio.toFixed(2)} pero sueldo gravado supera límite ($10,171/mes).`,
          fundamento: "Decreto subsidio al empleo · Tabla art. tercero",
        });
      }
      // 3) Prestaciones exentas > 53% del total ⇒ riesgo simulación
      if (total > 0 && prestExentas / total > 0.53) {
        findings.push({
          uuid: r.uuid, empleado: emp, fecha: String(r.fecha).slice(0, 10), total,
          severidad: "media",
          titulo: "Proporción de prestaciones exentas anormalmente alta",
          detalle: `Exentas representan ${((prestExentas / total) * 100).toFixed(0)}% del CFDI. Riesgo de reclasificación SAT.`,
          fundamento: "Art. 28 fracc. XXX LISR · deducción topada al 53%",
        });
      }
    }

    return {
      year,
      cfdi_revisados: (rows ?? []).length,
      empleados_unicos: porEmpleado.size,
      total_nomina: Array.from(porEmpleado.values()).reduce((a, b) => a + b.total, 0),
      findings,
      ranking: Array.from(porEmpleado.entries())
        .map(([nombre, v]) => ({ nombre, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
    };
  });

// ============================================================================
// SIMULADOR DE COSTO PATRONAL — no timbra. Calcula carga social aproximada.
// Tasas vigentes 2026 (ajustables vía parámetros).
// ============================================================================

const SimSchema = z.object({
  cliente_id: z.string().uuid(),
  nombre: z.string().min(1).max(200),
  empleados: z.array(
    z.object({
      etiqueta: z.string().max(120).default("Empleado"),
      sd_diario: z.number().min(0),          // Salario diario (no integrado)
      dias_periodo: z.number().int().min(1).max(31).default(30),
    }),
  ).min(1).max(500),
  factor_integracion: z.number().min(1).max(2).default(1.0452), // SDI = SD × FI (mínimo legal: 1.0452 con 15 días aguinaldo + 6 vacaciones + 25% prima)
  tasa_isn_estatal: z.number().min(0).max(0.05).default(0.03),  // ISN promedio 3%
  tope_sdi_imss: z.number().min(0).default(0),                  // 0 = sin tope, usa 25 UMAs en runtime
  uma_diaria: z.number().min(0).default(113.14),                // UMA 2026 estimada
});

export const simularCostoPatronal = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => SimSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cli } = await supabase.from("clientes").select("despacho_id").eq("id", data.cliente_id).maybeSingle();
    if (!cli) throw new Error("Cliente no encontrado");

    const topeSDI = data.tope_sdi_imss > 0 ? data.tope_sdi_imss : data.uma_diaria * 25;

    // Tasas patronales IMSS aproximadas (2026, sin descuentos por GMP):
    // Enfermedades y maternidad: 20.40% UMA + 1.10% (excedente >3 UMA) + 0.70% prest dinero + 1.05% GMP = ~3.05% promedio sobre SDI
    // Riesgos de trabajo: 1.0% (clase II promedio)
    // Invalidez y vida: 1.75%
    // Cesantía y vejez: 3.150% (transición reforma pensiones, sube anual)
    // Guarderías: 1.0%
    // Total IMSS patrón aproximado: ~10.05% sobre SDI
    const TASA_IMSS_PATRON = 0.1005;
    const TASA_INFONAVIT = 0.05; // 5% sobre SDI
    const TASA_RCV_PATRON = 0.02; // adicional retiro (incluida arriba parcialmente)

    let totalNominaBase = 0;
    let totalIMSS = 0;
    let totalInfonavit = 0;
    let totalISN = 0;
    let totalProvAguinaldo = 0;
    let totalProvVacaciones = 0;
    let totalProvPTU = 0;
    const detalle: any[] = [];

    for (const e of data.empleados) {
      const sdi = Math.min(e.sd_diario * data.factor_integracion, topeSDI);
      const nominaBase = e.sd_diario * e.dias_periodo;
      const baseIMSS = sdi * e.dias_periodo;
      const imss = baseIMSS * TASA_IMSS_PATRON;
      const infonavit = baseIMSS * TASA_INFONAVIT;
      const isn = nominaBase * data.tasa_isn_estatal;
      // Provisiones contables (no son pago directo pero impactan costo anual prorrateado al período)
      const factorPeriodo = e.dias_periodo / 365;
      const provAguinaldo = e.sd_diario * 15 * factorPeriodo;
      const provVacaciones = e.sd_diario * 6 * factorPeriodo;
      const provPTU = nominaBase * 0.10 * (e.dias_periodo / 365); // estimación

      totalNominaBase += nominaBase;
      totalIMSS += imss;
      totalInfonavit += infonavit;
      totalISN += isn;
      totalProvAguinaldo += provAguinaldo;
      totalProvVacaciones += provVacaciones;
      totalProvPTU += provPTU;

      detalle.push({
        etiqueta: e.etiqueta,
        sd_diario: e.sd_diario,
        sdi,
        dias: e.dias_periodo,
        nomina_base: nominaBase,
        imss_patron: imss,
        infonavit,
        isn,
        prov_aguinaldo: provAguinaldo,
        prov_vacaciones: provVacaciones,
        prov_ptu: provPTU,
        costo_total: nominaBase + imss + infonavit + isn + provAguinaldo + provVacaciones + provPTU,
      });
    }

    const costoTotal = totalNominaBase + totalIMSS + totalInfonavit + totalISN + totalProvAguinaldo + totalProvVacaciones + totalProvPTU;

    const resultado = {
      empleados_count: data.empleados.length,
      nomina_base: totalNominaBase,
      imss_patron: totalIMSS,
      infonavit: totalInfonavit,
      isn_estatal: totalISN,
      prov_aguinaldo: totalProvAguinaldo,
      prov_vacaciones: totalProvVacaciones,
      prov_ptu: totalProvPTU,
      costo_patronal_total: costoTotal,
      factor_costo: totalNominaBase > 0 ? costoTotal / totalNominaBase : 0,
      detalle,
      supuestos: {
        tasa_imss_patron: TASA_IMSS_PATRON,
        tasa_infonavit: TASA_INFONAVIT,
        tasa_isn: data.tasa_isn_estatal,
        factor_integracion: data.factor_integracion,
        uma_diaria: data.uma_diaria,
        tope_sdi: topeSDI,
      },
    };

    const id = crypto.randomUUID();
    const { error } = await supabase.from("nomina_simulaciones").insert({
      id,
      despacho_id: cli.despacho_id,
      cliente_id: data.cliente_id,
      nombre: data.nombre,
      entrada: data as any,
      resultado: resultado as any,
      created_by: userId,
    });
    if (error) throw new Error(error.message);

    return { id, ...resultado };
  });

export const listarSimulaciones = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("nomina_simulaciones")
      .select("id, nombre, resultado, created_at")
      .eq("cliente_id", data.cliente_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
