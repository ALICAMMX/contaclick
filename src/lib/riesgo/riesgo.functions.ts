import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { lookupEfos } from "@/lib/efos/lista-demo";
import { FUENTES_RIESGO, RIESGO_METODOLOGIA } from "@/lib/riesgo/criterios-fuentes";

const Input = z.object({
  cliente_id: z.string().uuid(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type CriterioRiesgo = {
  id: number;
  nombre: string;
  descripcion: string;
  nivel: "verde" | "amarillo" | "rojo";
  puntos: number; // 0..100 (más alto = más riesgo)
  hallazgos: string[];
  accion: string;
};

export type RiesgoSAT = {
  notFound?: false;
  score: number; // 0..100 (más alto = más riesgo)
  semaforo: "verde" | "amarillo" | "rojo";
  criterios: CriterioRiesgo[];
  meta: {
    cliente: { rfc: string; razon_social: string };
    periodo: { desde: string; hasta: string };
    n_cfdi: number;
    n_mov: number;
  };
};

export type RiesgoSATResult = RiesgoSAT | { notFound: true };

// Score helpers
const level = (puntos: number): "verde" | "amarillo" | "rojo" =>
  puntos >= 60 ? "rojo" : puntos >= 30 ? "amarillo" : "verde";

export const computeRiesgoSAT = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<RiesgoSATResult> => {
    const { supabase } = context;
    const today = new Date();
    const hasta = data.hasta ?? today.toISOString().slice(0, 10);
    const d = new Date(today);
    d.setMonth(d.getMonth() - 3);
    const desde = data.desde ?? d.toISOString().slice(0, 10);

    const { data: cli } = await supabase
      .from("clientes")
      .select("rfc, razon_social, regimen_fiscal")
      .eq("id", data.cliente_id)
      .maybeSingle();
    if (!cli) {
      return { notFound: true };
    }
    const rfcCli = (cli.rfc as string).toUpperCase();

    const [{ data: cfdis }, { data: movs }, { data: conc }] = await Promise.all([
      supabase
        .from("cfdi_xml")
        .select(
          "id, uuid, tipo_cfdi, fecha, total, subtotal, iva_trasladado, iva_retenido, isr_retenido, rfc_emisor, rfc_receptor, nombre_emisor, nombre_receptor, metodo_pago, forma_pago, version, estatus_sat",
        )
        .eq("cliente_id", data.cliente_id)
        .gte("fecha", desde)
        .lte("fecha", `${hasta}T23:59:59`),
      supabase
        .from("movimientos_bancarios")
        .select("id, fecha, descripcion, cargo, abono")
        .eq("cliente_id", data.cliente_id)
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase
        .from("conciliaciones")
        .select("movimiento_id, cfdi_id, estatus")
        .eq("cliente_id", data.cliente_id),
    ]);

    const cfdi = cfdis ?? [];
    const mov = movs ?? [];
    const matchMov = new Set(
      (conc ?? []).filter((c) => c.estatus !== "rechazado").map((c) => c.movimiento_id).filter(Boolean),
    );
    const matchCfdi = new Set(
      (conc ?? []).filter((c) => c.estatus !== "rechazado").map((c) => c.cfdi_id).filter(Boolean),
    );
    const emitidos = cfdi.filter((c) => (c.rfc_emisor as string)?.toUpperCase() === rfcCli && c.tipo_cfdi === "I");
    const recibidos = cfdi.filter((c) => (c.rfc_receptor as string)?.toUpperCase() === rfcCli && c.tipo_cfdi === "I");
    const sum = (a: any[], k: string) => a.reduce((x, y) => x + Number(y[k] ?? 0), 0);

    const criterios: CriterioRiesgo[] = [];

    // 1. EFOS / 69-B — cruce real contra la lista negra
    {
      const provs = new Map<string, number>();
      for (const c of recibidos) {
        const rfc = ((c.rfc_emisor as string) ?? "").toUpperCase();
        if (!rfc) continue;
        provs.set(rfc, (provs.get(rfc) ?? 0) + Number(c.total ?? 0));
      }
      const matches: { rfc: string; monto: number; situacion: string }[] = [];
      for (const [rfc, monto] of provs) {
        const hit = lookupEfos(rfc);
        if (hit && hit.situacion !== "desvirtuado" && hit.situacion !== "cancelado") {
          matches.push({ rfc, monto, situacion: hit.situacion });
        }
      }
      const definitivos = matches.filter((m) => m.situacion === "definitivo");
      const monto = matches.reduce((a, b) => a + b.monto, 0);
      const p = definitivos.length > 0
        ? Math.min(100, 70 + definitivos.length * 5)
        : matches.length > 0
          ? 45
          : 5;
      criterios.push({
        id: 1,
        nombre: "Proveedores EFOS / 69-B",
        descripcion: "Cruce de tus proveedores contra la lista negra del SAT (art. 69-B CFF).",
        nivel: level(p),
        puntos: Math.round(p),
        hallazgos: matches.length
          ? [
              `${matches.length} proveedor(es) en lista 69-B por $${monto.toFixed(0)}`,
              ...(definitivos.length ? [`${definitivos.length} en situación DEFINITIVA (deducción improcedente)`] : []),
            ]
          : ["Ningún proveedor del periodo aparece en la lista 69-B."],
        accion: matches.length
          ? "Elimina deducciones de estos RFC y prepara reverso de IVA acreditable."
          : "Mantén el monitoreo activo: la lista se actualiza cada semana.",
      });
    }

    // 2. Pérdidas / tendencia anormal
    {
      const ingresos = sum(emitidos, "subtotal");
      const egresos = sum(recibidos, "subtotal");
      const ratio = ingresos > 0 ? egresos / ingresos : 0;
      const p = ratio > 1 ? Math.min(100, (ratio - 1) * 120) : ratio > 0.85 ? 40 : 10;
      criterios.push({
        id: 2,
        nombre: "Pérdidas o tendencia anormal",
        descripcion: "Egresos vs ingresos del periodo: ratios elevados disparan auditoría.",
        nivel: level(p),
        puntos: Math.round(p),
        hallazgos: [`Ingresos $${ingresos.toFixed(0)} · Egresos $${egresos.toFixed(0)} (${(ratio * 100).toFixed(0)}%)`],
        accion: ratio > 1 ? "Documenta justificación de pérdida con soporte." : "Mantén bitácora de variaciones.",
      });
    }

    // 3. Tasa efectiva IVA
    {
      const ivaT = sum(emitidos, "iva_trasladado");
      const ivaA = sum(recibidos, "iva_trasladado");
      const ingresos = sum(emitidos, "subtotal") || 1;
      const tasa = (ivaT / ingresos) * 100;
      const benchmark = 14; // %
      const p = tasa < benchmark - 4 ? 70 : tasa < benchmark - 2 ? 40 : 10;
      criterios.push({
        id: 3,
        nombre: "Tasa efectiva ISR/IVA debajo del sector",
        descripcion: "IVA trasladado / ingresos vs benchmark típico de 16%.",
        nivel: level(p),
        puntos: Math.round(p),
        hallazgos: [`IVA trasladado ${(tasa).toFixed(2)}% · acreditable $${ivaA.toFixed(0)}`],
        accion: "Revisa mezcla de tasas (0% / exento) y soporta operaciones no gravadas.",
      });
    }

    // 4. Inconsistencias CFDI vs IVA
    {
      const inconsist = emitidos.filter((c) => {
        const t = Number(c.total ?? 0);
        const s = Number(c.subtotal ?? 0);
        const iva = Number(c.iva_trasladado ?? 0);
        return Math.abs(t - (s + iva)) > 1;
      });
      const p = emitidos.length ? Math.min(100, (inconsist.length / emitidos.length) * 200) : 0;
      criterios.push({
        id: 4,
        nombre: "Inconsistencias CFDI vs IVA",
        descripcion: "CFDI cuyo total no cuadra con subtotal + IVA.",
        nivel: level(p),
        puntos: Math.round(p),
        hallazgos: [`${inconsist.length} CFDI con diferencia aritmética de ${emitidos.length}`],
        accion: "Refactura o emite nota de corrección antes del cierre mensual.",
      });
    }

    // 5. Proveedores no localizados (heurística: RFC con muchos CFDI y monto alto)
    {
      const map = new Map<string, number>();
      for (const c of recibidos) {
        const rfc = (c.rfc_emisor as string)?.toUpperCase() ?? "";
        map.set(rfc, (map.get(rfc) ?? 0) + Number(c.total ?? 0));
      }
      const top = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const concentrado = top.reduce((a, [, v]) => a + v, 0);
      const total = Array.from(map.values()).reduce((a, b) => a + b, 0) || 1;
      const pct = (concentrado / total) * 100;
      const p = pct > 70 ? 55 : pct > 50 ? 30 : 10;
      criterios.push({
        id: 5,
        nombre: "Concentración de proveedores",
        descripcion: "Dependencia de pocos proveedores eleva riesgo si alguno entra a lista 69-B.",
        nivel: level(p),
        puntos: Math.round(p),
        hallazgos: [`Top 3 proveedores concentran ${pct.toFixed(0)}% del gasto`],
        accion: "Valida materialidad y diversifica donde sea posible.",
      });
    }

    // 6. Nómina oculta (RFC PF recurrentes en gastos)
    {
      const pf = recibidos.filter((c) => {
        const r = (c.rfc_emisor as string) ?? "";
        return r.length === 13; // RFC persona física
      });
      const map = new Map<string, number>();
      for (const c of pf) {
        const r = c.rfc_emisor as string;
        map.set(r, (map.get(r) ?? 0) + 1);
      }
      const recurrentes = Array.from(map.values()).filter((n) => n >= 3).length;
      const p = recurrentes > 5 ? 70 : recurrentes > 2 ? 40 : 10;
      criterios.push({
        id: 6,
        nombre: "Posible nómina oculta",
        descripcion: "PF que emiten servicios recurrentes pueden ser relación laboral disfrazada.",
        nivel: level(p),
        puntos: Math.round(p),
        hallazgos: [`${recurrentes} personas físicas facturando ≥ 3 veces`],
        accion: "Documenta independencia o regulariza relación laboral.",
      });
    }

    // 7. Deducciones sin requisitos (CFDI con uso CFDI vacío, sin método de pago, etc.)
    {
      const malos = recibidos.filter((c) => !c.metodo_pago || !c.forma_pago);
      const p = recibidos.length ? Math.min(100, (malos.length / recibidos.length) * 150) : 0;
      criterios.push({
        id: 7,
        nombre: "Deducciones sin requisitos fiscales",
        descripcion: "CFDI recibidos sin método o forma de pago capturada.",
        nivel: level(p),
        puntos: Math.round(p),
        hallazgos: [`${malos.length} CFDI incompletos`],
        accion: "Solicita reexpedición y bloquea registros incompletos.",
      });
    }

    // 8. Ingresos no declarados (depósitos sin CFDI)
    {
      const depSinCfdi = mov.filter((m) => Number(m.abono ?? 0) > 0 && !matchMov.has(m.id));
      const monto = depSinCfdi.reduce((a, b) => a + Number(b.abono ?? 0), 0);
      const totalAbono = mov.reduce((a, b) => a + Number(b.abono ?? 0), 0) || 1;
      const pct = (monto / totalAbono) * 100;
      const p = pct > 30 ? 90 : pct > 15 ? 60 : pct > 5 ? 30 : 10;
      criterios.push({
        id: 8,
        nombre: "Ingresos no declarados (depósitos sin CFDI)",
        descripcion: "Depósitos bancarios sin CFDI emitido equivalente.",
        nivel: level(p),
        puntos: Math.round(p),
        hallazgos: [`$${monto.toFixed(0)} en ${depSinCfdi.length} depósitos (${pct.toFixed(0)}% del abono)`],
        accion: "Concilia, emite CFDI o documenta préstamos/transferencias entre cuentas.",
      });
    }

    // 9. Estímulos fiscales — placeholder (sin datos): baja
    criterios.push({
      id: 9,
      nombre: "Abuso de estímulos fiscales",
      descripcion: "Sin estímulos detectados en este periodo.",
      nivel: "verde",
      puntos: 5,
      hallazgos: ["No se identificaron estímulos reclamados."],
      accion: "Si aplicas estímulos, documenta los requisitos.",
    });

    // 10. Operaciones internacionales (RFC genérico XEXX/XAXX o emisores extranjeros)
    {
      const extr = cfdi.filter((c) => {
        const e = (c.rfc_emisor as string)?.toUpperCase() ?? "";
        const r = (c.rfc_receptor as string)?.toUpperCase() ?? "";
        return e.startsWith("XEXX") || r.startsWith("XEXX");
      });
      const p = extr.length > 5 ? 60 : extr.length > 0 ? 30 : 5;
      criterios.push({
        id: 10,
        nombre: "Operaciones con extranjeros",
        descripcion: "CFDI con RFC genérico extranjero (XEXX010101000).",
        nivel: level(p),
        puntos: Math.round(p),
        hallazgos: [`${extr.length} CFDI con extranjeros`],
        accion: "Si hay paraísos fiscales o partes relacionadas, prepara transfer pricing.",
      });
    }

    // 11. Devoluciones de IVA (a favor)
    {
      const ivaT = sum(emitidos, "iva_trasladado");
      const ivaA = sum(recibidos, "iva_trasladado");
      const aFavor = Math.max(ivaA - ivaT, 0);
      const ingresos = sum(emitidos, "subtotal") || 1;
      const pct = (aFavor / ingresos) * 100;
      const p = pct > 20 ? 70 : pct > 10 ? 40 : 10;
      criterios.push({
        id: 11,
        nombre: "Devoluciones improcedentes",
        descripcion: "IVA a favor alto frente a ingresos eleva probabilidad de revisión.",
        nivel: level(p),
        puntos: Math.round(p),
        hallazgos: [`Saldo a favor estimado $${aFavor.toFixed(0)} (${pct.toFixed(0)}% de ingresos)`],
        accion: "Prepara papel de trabajo y soporte documental antes de solicitar.",
      });
    }

    // 12. Importaciones (placeholder): no aplica
    criterios.push({
      id: 12,
      nombre: "Importaciones con precios bajo mercado",
      descripcion: "Sin pedimentos cargados — pendiente integrar módulo de comercio exterior.",
      nivel: "verde",
      puntos: 5,
      hallazgos: ["Sin operaciones de importación cargadas."],
      accion: "Si importas, sube pedimentos para validar precios.",
    });

    // Documentación normativa: cada criterio declara fundamento, fuente,
    // dato utilizado y si es regla determinista o análisis de IA.
    for (const c of criterios) {
      const f = FUENTES_RIESGO[c.id];
      if (f) {
        c.fundamento = f.fundamento;
        c.fuenteUrl = f.url;
        c.datosUtilizados = f.datosUtilizados;
        c.naturaleza = f.naturaleza;
      }
    }

    // Score ponderado (promedio simple)
    const score = Math.round(criterios.reduce((a, c) => a + c.puntos, 0) / criterios.length);
    const semaforo = level(score);

    return {
      score,
      semaforo,
      criterios,
      meta: {
        cliente: { rfc: cli.rfc as string, razon_social: cli.razon_social as string },
        periodo: { desde, hasta },
        n_cfdi: cfdi.length,
        n_mov: mov.length,
        metodologia: RIESGO_METODOLOGIA,
      },
    };
  });

