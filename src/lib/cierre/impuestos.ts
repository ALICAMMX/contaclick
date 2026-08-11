// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 5 — impuestos preliminares con MOTORES VERSIONADOS.
//
// Esta capa NO calcula tarifas: traduce las entradas normalizadas que produce
// `cierre_entradas_fiscales` (flujo de efectivo: PUE del periodo + complementos
// de pago) a las entradas de los motores deterministas de
// `src/lib/fiscal/normativa/motor.ts`, y devuelve el resultado con su sello
// normativo (ejercicio, versión, SHA-256, fuente, fundamento).
//
// Regla dura: sin régimen soportado, sin evidencia completa o sin parámetro
// obligatorio del régimen, el resultado es NO EVALUABLE. Nunca cero, nunca
// "lista", nunca un motor por aproximación.
// ─────────────────────────────────────────────────────────────────────────────

import {
  NormativaNoVigenteError,
  calcularIsrPf,
  calcularIsrPm,
  calcularIva,
  calcularResicoPf,
  type SelloNormativo,
} from "@/lib/fiscal/normativa/motor";
import type { Regimen } from "@/lib/fiscal/normativa/catalogo";
import { construirSelloNormativo, type SelloNormativoCanonico } from "./sello-normativo";

/** Valor serializable JSON (los resultados viajan por RPC y se sellan). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export const MOTOR_IMPUESTOS_VERSION = "impuestos-preliminar@1";

/** Régimen fiscal soportado por los motores del cierre mensual. */
export type RegimenCierre = Extract<
  Regimen,
  "PF_GENERAL_MENSUAL" | "PF_RESICO" | "PM_GENERAL"
>;

const MAPA_SAT: Record<string, RegimenCierre> = {
  "601": "PM_GENERAL",
  "603": "PM_GENERAL",
  "606": "PF_GENERAL_MENSUAL",
  "612": "PF_GENERAL_MENSUAL",
  "626": "PF_RESICO",
};

/** Espejo exacto de `public.cierre_regimen_desde_sat`. */
export function regimenDesdeSat(regimenSat: string | null | undefined): RegimenCierre | null {
  const codigo = /\d{3}/.exec(regimenSat ?? "")?.[0];
  return (codigo && MAPA_SAT[codigo]) || null;
}

/** Entradas normalizadas tal como las entrega el RPC (todo en centavos). */
export type EntradasFiscales = {
  periodo: string;
  entradas_version: string;
  regimen_sat: string | null;
  regimen: RegimenCierre | null;
  criterio: string;
  /** Flujo de efectivo (PF/RESICO): PUE del periodo + complementos de pago. */
  ingresos_cobrados_centavos: number;
  ingresos_pue_centavos: number;
  ingresos_ppd_centavos: number;
  /** Base nominal acumulada del ejercicio (art. 14 LISR, personas morales). */
  ingresos_nominales_acumulados_centavos?: number;
  iva_trasladado_cobrado_centavos: number;
  deducciones_pagadas_centavos: number;
  deducciones_pue_centavos: number;
  deducciones_ppd_centavos: number;
  iva_acreditable_pagado_centavos: number;
  isr_retenido_centavos: number;
  iva_retenido_centavos: number;
  faltantes: {
    comprobantes_sin_estatus_sat: number;
    recibidos_sin_decision: number;
    /** Informativo: una PPD sin complemento NO es un error por sí misma. */
    ppd_sin_complemento: number;
    cancelados?: number;
    recibidos_sin_regla_iva?: number;
    ppd_pagado_sin_complemento?: number;
    sin_tipo_cambio?: number;
    complementos_duplicados?: number;
  };
  evaluable: boolean;
  input_hash: string;
};


/** Parámetros humanos que la evidencia no puede deducir. */
export type ParametrosFiscales = {
  /** Obligatorio en PM_GENERAL (art. 14 LISR). Decimal: 0.15 = 15%. */
  coeficiente_utilidad?: number | null;
  pagos_provisionales_anteriores_centavos?: number | null;
  saldo_iva_a_favor_anterior_centavos?: number | null;
  resico_acumulado_previo_centavos?: number | null;
  resico_receptor_persona_moral?: boolean | null;
};

export type MotivoNoEvaluable = { codigo: string; detalle: string };

export type ResultadoPreliminar = {
  evaluable: boolean;
  motivos: MotivoNoEvaluable[];
  regimen: RegimenCierre | null;
  motor_version: string;
  /** Objeto canónico de conjuntos normativos aplicados (con su SHA-256 real). */
  normativa: SelloNormativoCanonico;
  normativa_sha256: string;
  fundamentos: string[];
  fuentes: string[];
  resultado: {
    naturaleza: "estimacion_interna";
    advertencia: string;
    isr: Record<string, JsonValue> | null;
    iva: Record<string, JsonValue> | null;
    isr_a_cargo_centavos: number | null;
    iva_a_cargo_centavos: number | null;
    iva_a_favor_centavos: number | null;
    total_a_cargo_centavos: number | null;
  } | null;
};

const ADVERTENCIA =
  "Cálculo preliminar de apoyo. No es una declaración ni sustituye el cálculo oficial ante el SAT.";

const pesos = (centavos: number) => Math.round(centavos) / 100;
const centavos = (montoPesos: number) => Math.round(montoPesos * 100);

/**
 * Calcula el preliminar del periodo. Determinista: mismas entradas ⇒ mismo
 * resultado (salvo el instante `calculadoEn` del sello, que no entra al hash).
 */
export function calcularPreliminar(
  entradas: EntradasFiscales,
  parametros: ParametrosFiscales = {},
): ResultadoPreliminar {
  const motivos: MotivoNoEvaluable[] = [];
  const regimen = entradas.regimen ?? regimenDesdeSat(entradas.regimen_sat);

  if (!regimen) {
    motivos.push({
      codigo: "regimen_no_soportado",
      detalle: `El régimen “${entradas.regimen_sat ?? "sin registrar"}” no está soportado por los motores versionados: el cálculo no es evaluable.`,
    });
  }
  const f = entradas.faltantes;
  if (f.comprobantes_sin_estatus_sat > 0) {
    motivos.push({
      codigo: "estatus_sat_incompleto",
      detalle: `${f.comprobantes_sin_estatus_sat} comprobantes sin estatus SAT confirmado.`,
    });
  }
  if (f.recibidos_sin_decision > 0) {
    motivos.push({
      codigo: "deducibilidad_incompleta",
      detalle: `${f.recibidos_sin_decision} comprobantes recibidos sin decisión de deducibilidad.`,
    });
  }
  // Una PPD sin complemento NO bloquea: puede seguir legítimamente pendiente de
  // cobro. Bloquea sólo cuando ya existe un movimiento bancario CONCILIADO y
  // confirmado sin su complemento, porque entonces falta evidencia obligatoria.
  if ((f.ppd_pagado_sin_complemento ?? 0) > 0) {
    motivos.push({
      codigo: "ppd_pagado_sin_complemento",
      detalle: `${f.ppd_pagado_sin_complemento} comprobantes en parcialidades con cobro o pago bancario confirmado y sin complemento de pago: falta evidencia obligatoria.`,
    });
  }
  if ((f.recibidos_sin_regla_iva ?? 0) > 0) {
    motivos.push({
      codigo: "iva_sin_regla_propia",
      detalle: `${f.recibidos_sin_regla_iva} comprobantes con deducibilidad parcial y sin regla propia de acreditamiento de IVA. El porcentaje de ISR no se aplica automáticamente al IVA.`,
    });
  }
  if ((f.sin_tipo_cambio ?? 0) > 0) {
    motivos.push({
      codigo: "tipo_cambio_ausente",
      detalle: `${f.sin_tipo_cambio} comprobantes en moneda extranjera sin tipo de cambio verificable.`,
    });
  }
  if ((f.complementos_duplicados ?? 0) > 0) {
    motivos.push({
      codigo: "complementos_duplicados",
      detalle: `${f.complementos_duplicados} documentos pagados con complementos repetidos en la misma parcialidad.`,
    });
  }
  if (regimen === "PM_GENERAL") {
    if ((parametros.coeficiente_utilidad ?? null) == null) {
      motivos.push({
        codigo: "coeficiente_utilidad_ausente",
        detalle:
          "El pago provisional de persona moral exige el coeficiente de utilidad del ejercicio anterior (art. 14 LISR). Captúrelo para poder calcular.",
      });
    }
    if (entradas.ingresos_nominales_acumulados_centavos == null) {
      motivos.push({
        codigo: "ingresos_nominales_ausentes",
        detalle:
          "El pago provisional de persona moral se determina sobre ingresos nominales acumulados del ejercicio; la evidencia no los entrega. No se asume el flujo de efectivo de persona física.",
      });
    }
  }


  const vacio: ResultadoPreliminar = {
    evaluable: false,
    motivos,
    regimen,
    motor_version: MOTOR_IMPUESTOS_VERSION,
    normativa: { sello_version: "sello-normativo@1", conjuntos: [], sha256: "" },
    normativa_sha256: "",
    fundamentos: [],
    fuentes: [],
    resultado: null,
  };
  if (motivos.length > 0 || !regimen) return vacio;

  let isr: Record<string, JsonValue> | null = null;
  let selloIsr: SelloNormativo | null = null;
  let isrACargo = 0;
  const fundamentos: string[] = [];

  try {
    if (regimen === "PF_GENERAL_MENSUAL") {
      const r = calcularIsrPf({
        periodo: entradas.periodo,
        ingresos: pesos(entradas.ingresos_cobrados_centavos),
        deducciones: pesos(entradas.deducciones_pagadas_centavos),
        retenciones: pesos(entradas.isr_retenido_centavos),
        pagosProvisionalesAnteriores: pesos(parametros.pagos_provisionales_anteriores_centavos ?? 0),
      });
      isr = r as unknown as Record<string, JsonValue>;
      selloIsr = r.normativa;
      isrACargo = centavos(r.isrACargo);
      fundamentos.push("LISR art. 106 — pago provisional de personas físicas con actividad empresarial y profesional.");
      fundamentos.push("LISR art. 96 / Anexo 8 RMF — tarifa mensual aplicable al periodo.");
    } else if (regimen === "PF_RESICO") {
      const r = calcularResicoPf({
        periodo: entradas.periodo,
        ingresosCobrados: pesos(entradas.ingresos_cobrados_centavos),
        acumuladoAnualPrevio: pesos(parametros.resico_acumulado_previo_centavos ?? 0),
        ...(parametros.resico_receptor_persona_moral
          ? { retencionPersonaMoral: true }
          : { retencionesEfectuadas: pesos(entradas.isr_retenido_centavos) }),
      });
      isr = r as unknown as Record<string, JsonValue>;
      selloIsr = r.normativa;
      isrACargo = centavos(r.isrACargo);
      fundamentos.push("LISR art. 113-E — Régimen Simplificado de Confianza de personas físicas.");
      if (r.bloqueado) {
        return {
          ...vacio,
          motivos: [
            {
              codigo: "resico_fuera_de_rango",
              detalle: r.motivoBloqueo ?? "El contribuyente sale de RESICO en el periodo.",
            },
          ],
        };
      }
    } else {
      // Persona moral: art. 14 LISR sobre ingresos NOMINALES ACUMULADOS del
      // ejercicio, nunca sobre el flujo de efectivo de persona física.
      const r = calcularIsrPm({
        periodo: entradas.periodo,
        ingresosNominales: pesos(entradas.ingresos_nominales_acumulados_centavos!),
        coeficienteUtilidad: parametros.coeficiente_utilidad!,
        pagosProvisionalesAnteriores: pesos(parametros.pagos_provisionales_anteriores_centavos ?? 0),
        retenciones: pesos(entradas.isr_retenido_centavos),
      });
      isr = r as unknown as Record<string, JsonValue>;
      selloIsr = r.normativa;
      isrACargo = centavos(r.isrACargo);
      fundamentos.push("LISR art. 14 — pago provisional de personas morales sobre ingresos nominales acumulados y coeficiente de utilidad.");
    }

    const iva = calcularIva({
      periodo: entradas.periodo,
      ivaTrasladado: pesos(entradas.iva_trasladado_cobrado_centavos),
      ivaAcreditable: pesos(entradas.iva_acreditable_pagado_centavos),
      ivaRetenido: pesos(entradas.iva_retenido_centavos),
      saldoAFavorAnterior: pesos(parametros.saldo_iva_a_favor_anterior_centavos ?? 0),
    });
    fundamentos.push("LIVA arts. 1, 1-A y 5-D — IVA del periodo determinado por flujo de efectivo, con regla propia de acreditamiento.");

    const ivaACargo = centavos(iva.ivaACargo);
    const ivaAFavor = centavos(iva.ivaAFavor);
    // Sello normativo real: objeto canónico de los conjuntos aplicados + SHA-256
    // recalculable. No es la concatenación de dos huellas.
    const selloCanonico = construirSelloNormativo([
      { proposito: "isr", sello: selloIsr! },
      { proposito: "iva", sello: iva.normativa },
    ]);

    return {
      evaluable: true,
      motivos: [],
      regimen,
      motor_version: MOTOR_IMPUESTOS_VERSION,
      normativa: selloCanonico,
      normativa_sha256: selloCanonico.sha256,
      fundamentos,
      fuentes: [selloIsr!.url, iva.normativa.url].filter(Boolean),

      resultado: {
        naturaleza: "estimacion_interna",
        advertencia: ADVERTENCIA,
        isr,
        iva: iva as unknown as Record<string, JsonValue>,
        isr_a_cargo_centavos: isrACargo,
        iva_a_cargo_centavos: ivaACargo,
        iva_a_favor_centavos: ivaAFavor,
        total_a_cargo_centavos: isrACargo + ivaACargo,
      },
    };
  } catch (e) {
    const detalle =
      e instanceof NormativaNoVigenteError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Error desconocido del motor fiscal.";
    return { ...vacio, motivos: [{ codigo: "normativa_no_vigente", detalle }] };
  }
}
