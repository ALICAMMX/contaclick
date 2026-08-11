import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { resolverAlcance, PERIODO_RE, type Alcance } from "./alcance";
import { evaluarEvidencia, estadoAnalisis, type EstadoAnalisis } from "@/lib/cierre/evidencia";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Schema = z.object({
  cliente_id: z.string().min(1),
  year: z.number().int().min(2018).max(2100).optional(),
  /** Alcance mensual del cierre (AAAA-MM). Cuando viene, manda sobre el año. */
  periodo: z.string().regex(PERIODO_RE).optional(),
  origen: z.enum(["cierre", "directo"]).optional(),
});

export type DeducFinding = {
  cfdi_id: string;
  uuid: string;
  fecha: string | null;
  rfc_emisor: string;
  nombre_emisor: string | null;
  total: number;
  regla: string;
  fundamento: string;
  severidad: "alta" | "media" | "baja";
  detalle: string;
};

export type DeducNoEvaluable = {
  cfdi_id: string;
  uuid: string;
  fecha: string | null;
  rfc_emisor: string;
  nombre_emisor: string | null;
  total: number;
  estatus_sat: string;
  xml_original_disponible: boolean;
  limitaciones: string[];
};


const RFC_EXTRANJERO = "XEXX010101000";
const RFC_PUBLICO_GENERAL = "XAXX010101000";

// Claves SAT (prefijos) de servicios típicamente no deducibles o restringidos
const CLAVES_RESTAURANTES = ["90101"]; // 90101500-90101800 Servicios de alimentación
const CLAVES_BEBIDAS_ALCOHOL = ["50202306", "50202307", "50202309"];
const CLAVES_ENTRETENIMIENTO = ["90111", "90121", "90131", "90141", "90151"]; // Hoteles, viajes, etc.

export const runDeducibilityCheck = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    const alcance: Alcance = resolverAlcance({ periodo: data.periodo, year: data.year });
    const year = alcance.modo === "anual" ? alcance.year : Number(alcance.periodo.slice(0, 4));
    const empty = {
      findings: [] as DeducFinding[],
      no_evaluables: [] as DeducNoEvaluable[],
      stats: {
        total_cfdi: 0,
        evaluables: 0,
        no_evaluables: 0,
        hallazgos: 0,
        monto_riesgo: 0,
        no_deducibles: 0,
        revisar: 0,
      },
      estado: "no_analizado" as EstadoAnalisis,
      alcance,
      year,
    };
    if (!UUID_RE.test(data.cliente_id)) return empty;

    const { supabase } = context;
    const { data: cli } = await supabase.from("clientes").select("rfc").eq("id", data.cliente_id).maybeSingle();
    const rfcCli = ((cli?.rfc as string) ?? "").toUpperCase();
    if (!rfcCli) return empty;

    const CAMPOS =
      "id, uuid, fecha, rfc_emisor, nombre_emisor, total, subtotal, iva_trasladado, iva_retenido, metodo_pago, forma_pago, uso_cfdi, estatus_sat, estatus_sat_fuente, tipo_cfdi, detalle_reconstruible, normalizacion_version";

    // Alcance mensual: exactamente el mismo universo del Centro de cierre
    // (comprobantes recibidos del periodo). Alcance anual: gastos del ejercicio.
    const consulta =
      alcance.modo === "mensual"
        ? supabase
            .from("cfdi_xml")
            .select(CAMPOS)
            .eq("cliente_id", data.cliente_id)
            .eq("periodo", alcance.periodo)
            .eq("direccion", "recibido")
        : supabase
            .from("cfdi_xml")
            .select(CAMPOS)
            .eq("cliente_id", data.cliente_id)
            .eq("tipo_cfdi", "I")
            .eq("rfc_receptor", rfcCli)
            .gte("fecha", alcance.desde)
            .lt("fecha", alcance.hasta);

    const { data: cfdis } = await consulta;

    const universo = cfdis ?? [];
    if (universo.length === 0) return empty;

    // Un comprobante sin estatus SAT confirmado o sin XML original NO se
    // analiza: se declara "no evaluable" con su motivo. Nunca se presenta como
    // correcto por ausencia de hallazgos.
    const list: typeof universo = [];
    const noEvaluables: DeducNoEvaluable[] = [];
    for (const c of universo) {
      const ev = evaluarEvidencia({
        estatus_sat: (c.estatus_sat as string) ?? null,
        estatus_sat_fuente: (c.estatus_sat_fuente as string) ?? null,
        detalle_reconstruible: c.detalle_reconstruible as boolean | null,
        normalizacion_version: (c.normalizacion_version as string) ?? null,
      });
      if (ev.suficiente) {
        list.push(c);
        continue;
      }
      noEvaluables.push({
        cfdi_id: c.id as string,
        uuid: c.uuid as string,
        fecha: c.fecha as string | null,
        rfc_emisor: c.rfc_emisor as string,
        nombre_emisor: c.nombre_emisor as string | null,
        total: Number(c.total ?? 0),
        estatus_sat: ev.estatus_sat,
        xml_original_disponible: ev.xml_original_disponible,
        limitaciones: ev.limitaciones,
      });
    }

    const ids = list.map((c) => c.id as string);
    const { data: conceptos } = ids.length
      ? await supabase
          .from("cfdi_conceptos")
          .select("cfdi_id, clave_prod_serv, descripcion, importe")
          .in("cfdi_id", ids)
      : { data: [] as { cfdi_id: string; clave_prod_serv: string | null; descripcion: string | null; importe: number }[] };

    const concByCfdi = new Map<string, Array<{ clave: string | null; desc: string | null; importe: number }>>();
    (conceptos ?? []).forEach((c) => {
      const arr = concByCfdi.get(c.cfdi_id as string) ?? [];
      arr.push({
        clave: (c.clave_prod_serv as string) ?? null,
        desc: (c.descripcion as string) ?? null,
        importe: Number(c.importe ?? 0),
      });
      concByCfdi.set(c.cfdi_id as string, arr);
    });

    const findings: DeducFinding[] = [];

    for (const c of list) {

      const total = Number(c.total ?? 0);
      const conc = concByCfdi.get(c.id as string) ?? [];
      const claves = conc.map((x) => x.clave ?? "").filter(Boolean);
      const descLower = conc.map((x) => (x.desc ?? "").toLowerCase()).join(" | ");

      const base = {
        cfdi_id: c.id as string,
        uuid: c.uuid as string,
        fecha: c.fecha as string | null,
        rfc_emisor: c.rfc_emisor as string,
        nombre_emisor: c.nombre_emisor as string | null,
        total,
      };

      // 1. Efectivo > $2,000 (art. 27-III LISR)
      if (c.forma_pago === "01" && total > 2000) {
        findings.push({
          ...base,
          regla: "Pago en efectivo > $2,000",
          fundamento: "LISR art. 27 fracc. III — deducciones autorizadas requieren medio de pago bancarizado.",
          severidad: "alta",
          detalle: `Forma de pago 01 (efectivo) por $${total.toFixed(2)}. No deducible.`,
        });
      }

      // 2. Forma de pago "Por definir" (99) con PUE
      if (c.forma_pago === "99" && c.metodo_pago === "PUE") {
        findings.push({
          ...base,
          regla: "PUE con forma 99",
          fundamento: "Guía CFDI 4.0 — PUE requiere forma de pago específica al timbrar.",
          severidad: "media",
          detalle: "Método PUE con forma 99 (por definir). El SAT puede rechazar la deducción.",
        });
      }

      // 3. CFDI cancelado
      if (c.estatus_sat === "cancelado") {
        findings.push({
          ...base,
          regla: "CFDI cancelado contabilizado",
          fundamento: "CFF art. 29-A — los comprobantes cancelados no producen efectos fiscales.",
          severidad: "alta",
          detalle: "Este CFDI está cancelado y no puede sustentar la deducción.",
        });
      }

      // 4. Donativos sin validación
      if (c.uso_cfdi === "D04") {
        findings.push({
          ...base,
          regla: "Donativo — validar donataria autorizada",
          fundamento: "LISR art. 27 fracc. I y 82 — solo donativos a donatarias autorizadas.",
          severidad: "media",
          detalle: `Verifica que ${c.rfc_emisor} esté en el padrón de donatarias autorizadas del SAT.`,
        });
      }

      // 5. Pago a extranjero sin retención
      if (c.rfc_emisor === RFC_EXTRANJERO && Number(c.iva_retenido ?? 0) === 0 && total > 0) {
        findings.push({
          ...base,
          regla: "Pago al extranjero sin retención",
          fundamento: "LISR Título V (arts. 153-175) — pagos al extranjero requieren retención de ISR.",
          severidad: "alta",
          detalle: "RFC genérico de extranjero sin retención de IVA/ISR registrada.",
        });
      }

      // 6. Operación con público en general
      if (c.rfc_emisor === RFC_PUBLICO_GENERAL || c.rfc_emisor.startsWith("XAXX")) {
        findings.push({
          ...base,
          regla: "Comprobante a público en general",
          fundamento: "RMF regla 2.7.1.21 — no soporta deducción.",
          severidad: "alta",
          detalle: "RFC genérico XAXX. No es deducible ni acreditable.",
        });
      }

      // 7. Restaurantes / consumos (gastos de representación)
      const esRestaurante = claves.some((k) => CLAVES_RESTAURANTES.some((p) => k.startsWith(p))) ||
        /restaurante|consumo|alimento/.test(descLower);
      if (esRestaurante) {
        // Si forma pago no es 04 (tarjeta de crédito) → no deducible art. 28-XX
        if (c.forma_pago !== "04") {
          findings.push({
            ...base,
            regla: "Consumo en restaurante sin tarjeta de crédito",
            fundamento: "LISR art. 28 fracc. XX — solo deducible al 8.5% si se paga con tarjeta de crédito, débito o monedero.",
            severidad: "alta",
            detalle: `Forma de pago ${c.forma_pago ?? "—"}. Si fue restaurante, requiere TDC para 8.5% deducible.`,
          });
        } else {
          findings.push({
            ...base,
            regla: "Restaurante — deducibilidad limitada al 8.5%",
            fundamento: "LISR art. 28 fracc. XX.",
            severidad: "baja",
            detalle: `Solo $${(total * 0.085).toFixed(2)} es deducible (8.5% del total).`,
          });
        }
      }

      // 8. Bebidas alcohólicas
      const esAlcohol = claves.some((k) => CLAVES_BEBIDAS_ALCOHOL.includes(k)) ||
        /vino|tequila|whisky|cerveza|alcohol|licor/.test(descLower);
      if (esAlcohol) {
        findings.push({
          ...base,
          regla: "Bebidas alcohólicas",
          fundamento: "LISR art. 28 fracc. XX — gastos de representación no deducibles.",
          severidad: "alta",
          detalle: "Concepto identificado como bebida alcohólica. Generalmente no deducible.",
        });
      }

      // 9. Hospedaje / viajes (viáticos)
      const esViaje = claves.some((k) => CLAVES_ENTRETENIMIENTO.some((p) => k.startsWith(p))) ||
        /hotel|hospedaje|hospedaj|viaje|vuelo|avion/.test(descLower);
      if (esViaje && total > 850 * 30) {
        findings.push({
          ...base,
          regla: "Viáticos — verificar tope diario",
          fundamento: "LISR art. 28 fracc. V — hospedaje nacional $3,850 / extranjero $850 USD por día.",
          severidad: "media",
          detalle: "Verifica que no exceda topes diarios y que tenga comprobante de transporte.",
        });
      }

      // 10. IVA acreditado sin IVA trasladado coherente (16% típico)
      const subt = Number(c.subtotal ?? 0);
      const iva = Number(c.iva_trasladado ?? 0);
      if (subt > 0 && iva > 0) {
        const tasa = iva / subt;
        if (tasa > 0.18 || (tasa > 0.01 && tasa < 0.07)) {
          findings.push({
            ...base,
            regla: "Tasa de IVA inusual",
            fundamento: "LIVA arts. 1 y 2 — tasas válidas 0%, 8% (frontera) o 16%.",
            severidad: "media",
            detalle: `IVA detectado al ${(tasa * 100).toFixed(2)}%. Revisa traslados del XML.`,
          });
        }
      }
    }

    const noDeducibles = findings.filter((f) => f.severidad === "alta").length;
    const revisar = findings.filter((f) => f.severidad !== "alta").length;
    const montoRiesgo = findings
      .filter((f) => f.severidad === "alta")
      .reduce((a, b) => a + b.total, 0);

    return {
      findings,
      stats: {
        total_cfdi: list.length,
        hallazgos: findings.length,
        monto_riesgo: montoRiesgo,
        no_deducibles: noDeducibles,
        revisar,
      },
      year,
    };
  });
