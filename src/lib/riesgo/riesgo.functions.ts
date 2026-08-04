import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { lookupEfos } from "@/lib/efos/lista-demo";
import { FUENTES_RIESGO, RIESGO_METODOLOGIA } from "@/lib/riesgo/criterios-fuentes";
import { COBERTURA_MINIMA, calcularScoreRiesgo, type SemaforoRiesgo } from "@/lib/riesgo/score";

const Input = z.object({
  cliente_id: z.string().uuid(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type NivelCriterio = "verde" | "amarillo" | "rojo" | "no_evaluable";
export { COBERTURA_MINIMA, type SemaforoRiesgo };

export type CriterioRiesgo = {
  id: number;
  nombre: string;
  descripcion: string;
  nivel: NivelCriterio;
  /** null cuando el criterio no es evaluable por falta de información. */
  puntos: number | null;
  /** false = no hay datos suficientes; NO cuenta para el score. */
  evaluable: boolean;
  /** Qué información falta para poder evaluarlo. */
  motivo_no_evaluable?: string;
  hallazgos: string[];
  accion: string;
  /** Fundamento legal del criterio */
  fundamento?: string;
  /** URL de la fuente oficial */
  fuenteUrl?: string;
  /** Datos del expediente usados para evaluarlo */
  datosUtilizados?: string;
  /** Regla determinista vs. análisis generado por IA */
  naturaleza?: "determinista" | "ia";
};

export type RiesgoSAT = {
  notFound?: false;
  /** null cuando la cobertura de información es insuficiente. */
  score: number | null;
  semaforo: SemaforoRiesgo;
  criterios: CriterioRiesgo[];
  meta: {
    cliente: { rfc: string; razon_social: string };
    periodo: { desde: string; hasta: string };
    n_cfdi: number;
    n_mov: number;
    cobertura: {
      evaluables: number;
      total: number;
      porcentaje: number;
      minimo: number;
      suficiente: boolean;
      /** Explicación lista para mostrar cuando no alcanza la cobertura. */
      mensaje: string | null;
      faltantes: string[];
    };
    metodologia: typeof RIESGO_METODOLOGIA;
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
    const emitidos = cfdi.filter((c) => (c.rfc_emisor as string)?.toUpperCase() === rfcCli && c.tipo_cfdi === "I");
    const recibidos = cfdi.filter((c) => (c.rfc_receptor as string)?.toUpperCase() === rfcCli && c.tipo_cfdi === "I");
    const sum = (a: any[], k: string) => a.reduce((x, y) => x + Number(y[k] ?? 0), 0);

    const criterios: CriterioRiesgo[] = [];

    /** Registra un criterio evaluado con datos reales. */
    const evaluado = (c: Omit<CriterioRiesgo, "nivel" | "evaluable" | "puntos"> & { puntos: number }) => {
      criterios.push({
        ...c,
        puntos: Math.round(c.puntos),
        nivel: level(c.puntos),
        evaluable: true,
      });
    };

    /** Registra un criterio SIN información: nunca aporta puntos ni "verde". */
    const noEvaluable = (
      c: Pick<CriterioRiesgo, "id" | "nombre" | "descripcion" | "accion">,
      motivo: string,
    ) => {
      criterios.push({
        ...c,
        nivel: "no_evaluable",
        puntos: null,
        evaluable: false,
        motivo_no_evaluable: motivo,
        hallazgos: [`Sin información suficiente: ${motivo}`],
      });
    };

    // 1. EFOS / 69-B — cruce real contra la lista negra
    {
      const base = {
        id: 1,
        nombre: "Proveedores EFOS / 69-B",
        descripcion: "Cruce de tus proveedores contra la lista negra del SAT (art. 69-B CFF).",
        accion: "Elimina deducciones de RFC listados y prepara reverso de IVA acreditable.",
      };
      if (recibidos.length === 0) {
        noEvaluable(base, "no hay CFDI recibidos cargados en el periodo para cruzar contra la lista 69-B.");
      } else {
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
        evaluado({
          ...base,
          puntos: p,
          hallazgos: matches.length
            ? [
                `${matches.length} proveedor(es) en lista 69-B por $${monto.toFixed(0)}`,
                ...(definitivos.length ? [`${definitivos.length} en situación DEFINITIVA (deducción improcedente)`] : []),
              ]
            : [`Ninguno de los ${provs.size} proveedores del periodo aparece en la lista 69-B.`],
          accion: matches.length
            ? base.accion
            : "Mantén el monitoreo activo: la lista se actualiza cada semana.",
        });
      }
    }

    // 2. Pérdidas / tendencia anormal
    {
      const base = {
        id: 2,
        nombre: "Pérdidas o tendencia anormal",
        descripcion: "Egresos vs ingresos del periodo: ratios elevados disparan auditoría.",
        accion: "Documenta justificación de pérdida con soporte.",
      };
      const ingresos = sum(emitidos, "subtotal");
      if (emitidos.length === 0 || ingresos <= 0) {
        noEvaluable(base, "no hay CFDI de ingreso emitidos en el periodo para comparar contra los egresos.");
      } else {
        const egresos = sum(recibidos, "subtotal");
        const ratio = egresos / ingresos;
        const p = ratio > 1 ? Math.min(100, (ratio - 1) * 120) : ratio > 0.85 ? 40 : 10;
        evaluado({
          ...base,
          puntos: p,
          hallazgos: [`Ingresos $${ingresos.toFixed(0)} · Egresos $${egresos.toFixed(0)} (${(ratio * 100).toFixed(0)}%)`],
          accion: ratio > 1 ? base.accion : "Mantén bitácora de variaciones.",
        });
      }
    }

    // 3. Tasa efectiva IVA
    {
      const base = {
        id: 3,
        nombre: "Tasa efectiva ISR/IVA debajo del sector",
        descripcion: "IVA trasladado / ingresos vs benchmark típico del 16%.",
        accion: "Revisa mezcla de tasas (0% / exento) y soporta operaciones no gravadas.",
      };
      const ingresos = sum(emitidos, "subtotal");
      if (emitidos.length === 0 || ingresos <= 0) {
        noEvaluable(base, "sin ingresos facturados en el periodo no puede calcularse una tasa efectiva.");
      } else {
        const ivaT = sum(emitidos, "iva_trasladado");
        const ivaA = sum(recibidos, "iva_trasladado");
        const tasa = (ivaT / ingresos) * 100;
        const benchmark = 14; // %
        const p = tasa < benchmark - 4 ? 70 : tasa < benchmark - 2 ? 40 : 10;
        evaluado({
          ...base,
          puntos: p,
          hallazgos: [`IVA trasladado ${tasa.toFixed(2)}% de los ingresos · acreditable $${ivaA.toFixed(0)}`],
        });
      }
    }

    // 4. Inconsistencias CFDI vs IVA
    {
      const base = {
        id: 4,
        nombre: "Inconsistencias CFDI vs IVA",
        descripcion: "CFDI cuyo total no cuadra con subtotal + IVA.",
        accion: "Refactura o emite nota de corrección antes del cierre mensual.",
      };
      if (emitidos.length === 0) {
        noEvaluable(base, "no hay CFDI emitidos cargados para validar su aritmética.");
      } else {
        const inconsist = emitidos.filter((c) => {
          const t = Number(c.total ?? 0);
          const s = Number(c.subtotal ?? 0);
          const iva = Number(c.iva_trasladado ?? 0);
          return Math.abs(t - (s + iva)) > 1;
        });
        const p = Math.min(100, (inconsist.length / emitidos.length) * 200);
        evaluado({
          ...base,
          puntos: p,
          hallazgos: [`${inconsist.length} de ${emitidos.length} CFDI con diferencia aritmética`],
        });
      }
    }

    // 5. Concentración de proveedores
    {
      const base = {
        id: 5,
        nombre: "Concentración de proveedores",
        descripcion: "Dependencia de pocos proveedores eleva riesgo si alguno entra a lista 69-B.",
        accion: "Valida materialidad y diversifica donde sea posible.",
      };
      if (recibidos.length === 0) {
        noEvaluable(base, "no hay CFDI recibidos para medir la concentración del gasto.");
      } else {
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
        evaluado({
          ...base,
          puntos: p,
          hallazgos: [`Top 3 de ${map.size} proveedores concentran ${pct.toFixed(0)}% del gasto`],
        });
      }
    }

    // 6. Nómina oculta (PF recurrentes en gastos)
    {
      const base = {
        id: 6,
        nombre: "Posible nómina oculta",
        descripcion: "PF que emiten servicios recurrentes pueden ser relación laboral disfrazada.",
        accion: "Documenta independencia o regulariza relación laboral.",
      };
      if (recibidos.length === 0) {
        noEvaluable(base, "no hay CFDI recibidos para detectar personas físicas recurrentes.");
      } else {
        const pf = recibidos.filter((c) => ((c.rfc_emisor as string) ?? "").length === 13);
        const map = new Map<string, number>();
        for (const c of pf) {
          const r = c.rfc_emisor as string;
          map.set(r, (map.get(r) ?? 0) + 1);
        }
        const recurrentes = Array.from(map.values()).filter((n) => n >= 3).length;
        const p = recurrentes > 5 ? 70 : recurrentes > 2 ? 40 : 10;
        evaluado({
          ...base,
          puntos: p,
          hallazgos: [`${recurrentes} personas físicas facturando ≥ 3 veces en el periodo`],
        });
      }
    }

    // 7. Deducciones sin requisitos
    {
      const base = {
        id: 7,
        nombre: "Deducciones sin requisitos fiscales",
        descripcion: "CFDI recibidos sin método o forma de pago capturada.",
        accion: "Solicita reexpedición y bloquea registros incompletos.",
      };
      if (recibidos.length === 0) {
        noEvaluable(base, "no hay CFDI recibidos cargados para revisar sus requisitos.");
      } else {
        const malos = recibidos.filter((c) => !c.metodo_pago || !c.forma_pago);
        const p = Math.min(100, (malos.length / recibidos.length) * 150);
        evaluado({
          ...base,
          puntos: p,
          hallazgos: [`${malos.length} de ${recibidos.length} CFDI incompletos`],
        });
      }
    }

    // 8. Ingresos no declarados (depósitos sin CFDI)
    {
      const base = {
        id: 8,
        nombre: "Ingresos no declarados (depósitos sin CFDI)",
        descripcion: "Depósitos bancarios sin CFDI emitido equivalente.",
        accion: "Concilia, emite CFDI o documenta préstamos/transferencias entre cuentas.",
      };
      const totalAbono = mov.reduce((a, b) => a + Number(b.abono ?? 0), 0);
      if (mov.length === 0 || totalAbono <= 0) {
        noEvaluable(
          base,
          "no hay movimientos bancarios con depósitos cargados; sube el estado de cuenta en Conciliación.",
        );
      } else {
        const depSinCfdi = mov.filter((m) => Number(m.abono ?? 0) > 0 && !matchMov.has(m.id));
        const monto = depSinCfdi.reduce((a, b) => a + Number(b.abono ?? 0), 0);
        const pct = (monto / totalAbono) * 100;
        const p = pct > 30 ? 90 : pct > 15 ? 60 : pct > 5 ? 30 : 10;
        evaluado({
          ...base,
          puntos: p,
          hallazgos: [`$${monto.toFixed(0)} en ${depSinCfdi.length} depósitos sin CFDI (${pct.toFixed(0)}% del abono)`],
        });
      }
    }

    // 9. Estímulos fiscales — ContaClick aún no captura estímulos aplicados.
    noEvaluable(
      {
        id: 9,
        nombre: "Abuso de estímulos fiscales",
        descripcion: "Requiere las declaraciones donde se aplican estímulos o acreditamientos.",
        accion: "Carga tus declaraciones o acuses para habilitar este criterio.",
      },
      "el expediente no tiene declaraciones ni acuses cargados que declaren estímulos.",
    );

    // 10. Operaciones internacionales
    {
      const base = {
        id: 10,
        nombre: "Operaciones con extranjeros",
        descripcion: "CFDI con RFC genérico extranjero (XEXX010101000).",
        accion: "Si hay paraísos fiscales o partes relacionadas, prepara transfer pricing.",
      };
      if (cfdi.length === 0) {
        noEvaluable(base, "no hay CFDI cargados en el periodo.");
      } else {
        const extr = cfdi.filter((c) => {
          const e = (c.rfc_emisor as string)?.toUpperCase() ?? "";
          const r = (c.rfc_receptor as string)?.toUpperCase() ?? "";
          return e.startsWith("XEXX") || r.startsWith("XEXX");
        });
        const p = extr.length > 5 ? 60 : extr.length > 0 ? 30 : 5;
        evaluado({
          ...base,
          puntos: p,
          hallazgos: [`${extr.length} de ${cfdi.length} CFDI involucran RFC genérico extranjero`],
        });
      }
    }

    // 11. Devoluciones de IVA (a favor)
    {
      const base = {
        id: 11,
        nombre: "Devoluciones improcedentes",
        descripcion: "IVA a favor alto frente a ingresos eleva probabilidad de revisión.",
        accion: "Prepara papel de trabajo y soporte documental antes de solicitar.",
      };
      const ingresos = sum(emitidos, "subtotal");
      if (emitidos.length === 0 || ingresos <= 0) {
        noEvaluable(base, "sin ingresos facturados no puede estimarse un saldo a favor.");
      } else {
        const ivaT = sum(emitidos, "iva_trasladado");
        const ivaA = sum(recibidos, "iva_trasladado");
        const aFavor = Math.max(ivaA - ivaT, 0);
        const pct = (aFavor / ingresos) * 100;
        const p = pct > 20 ? 70 : pct > 10 ? 40 : 10;
        evaluado({
          ...base,
          puntos: p,
          hallazgos: [`Saldo a favor estimado $${aFavor.toFixed(0)} (${pct.toFixed(0)}% de ingresos)`],
        });
      }
    }

    // 12. Importaciones — requiere pedimentos, aún no integrados.
    noEvaluable(
      {
        id: 12,
        nombre: "Importaciones con precios bajo mercado",
        descripcion: "Requiere pedimentos de comercio exterior para comparar precios.",
        accion: "Si importas, sube los pedimentos para habilitar este criterio.",
      },
      "no hay pedimentos de importación cargados en el expediente.",
    );

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

    // --- Score: SOLO sobre criterios con información real ---
    const { score, semaforo, cobertura } = calcularScoreRiesgo(criterios);

    return {
      score,
      semaforo,
      criterios,
      meta: {
        cliente: { rfc: cli.rfc as string, razon_social: cli.razon_social as string },
        periodo: { desde, hasta },
        n_cfdi: cfdi.length,
        n_mov: mov.length,
        cobertura,
        metodologia: RIESGO_METODOLOGIA,
      },
    };
  });
