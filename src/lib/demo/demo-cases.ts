// Casos de muestra precargables en cada herramienta (modo demo).
// No tocan BD; solo devuelven payloads sintéticos para que el usuario
// vea qué arroja la herramienta en escenarios buenos vs en riesgo.

import { EFOS_DEMO_RFCS } from "./perfiles";
import { CFDI_INTEGRO_XML, CFDI_RIESGO_XML } from "./cfdi-fixtures";

export type DemoCase = {
  label: string;
  variant: "ok" | "riesgo";
  payload: any;
  hint: string;
};

export type ToolDemoCases = {
  [variant: string]: DemoCase;
};

export const DEMO_CASES: Record<string, ToolDemoCases> = {
  "cfdi-validator": {
    ok: {
      variant: "ok",
      label: "Caso OK — CFDI 4.0 íntegro",
      hint: "Sellado, timbrado, con conceptos e impuestos; la aritmética cuadra. No debe arrojar hallazgos.",
      payload: { xml: CFDI_INTEGRO_XML },
    },
    riesgo: {
      variant: "riesgo",
      label: "Caso en riesgo — sin timbre, PUE/99 y totales que no cuadran",
      hint: "Sin TimbreFiscalDigital, sello vacío, PUE con forma 99, diferencia aritmética y emisor en lista 69-B.",
      payload: { xml: CFDI_RIESGO_XML },
    },
  },

  "efos-validator": {
    ok: { variant: "ok", label: "RFC limpio", hint: "Proveedor sin antecedentes en listas 69 / 69-B.", payload: { rfcs: ["DEMPRV001AA1", "DEMPRV002AA1"] } },
    riesgo: { variant: "riesgo", label: "RFC en listas 69-B", hint: "Detección de presunto + definitivo demo.", payload: { rfcs: [EFOS_DEMO_RFCS.presunto, EFOS_DEMO_RFCS.definitivo, "DEMPRV003AA1"] } },
  },
  "deducibility": {
    ok: { variant: "ok", label: "Gasto deducible", hint: "Pago bancarizado, CFDI 4.0, requisitos cumplidos.", payload: { monto: 8500, metodo_pago: "03", forma_pago: "transferencia", uso_cfdi: "G03", concepto: "Renta oficina" } },
    riesgo: { variant: "riesgo", label: "Gasto no deducible", hint: "Pago en efectivo > $2,000, sin CFDI compatible.", payload: { monto: 12500, metodo_pago: "01", forma_pago: "efectivo", uso_cfdi: "S01", concepto: "Comida sin desglose" } },
  },
  "isr-iva": {
    ok: { variant: "ok", label: "Periodo en regla", hint: "Ingresos y deducciones consistentes con CFDI.", payload: { ingresos: 250000, deducciones: 95000, retenciones: 5000 } },
    riesgo: { variant: "riesgo", label: "Periodo con discrepancia", hint: "Discrepancia entre lo declarado y CFDI emitidos.", payload: { ingresos: 80000, deducciones: 320000, retenciones: 0, alerta: "Deducciones > ingresos — posible observación" } },
  },
  "shadow-payroll": {
    ok: { variant: "ok", label: "Plantilla regular", hint: "Todos los trabajadores con CFDI de nómina vigente.", payload: { trabajadores: 8, cfdi_nomina: 8, pagos_pf_sin_cfdi: 0 } },
    riesgo: { variant: "riesgo", label: "Nómina oculta detectada", hint: "Pagos recurrentes a PF sin CFDI ni asimilados.", payload: { trabajadores: 8, cfdi_nomina: 3, pagos_pf_sin_cfdi: 5, monto_estimado: 180000 } },
  },
  "bank-reconciler": {
    ok: { variant: "ok", label: "Conciliación 100%", hint: "Todos los movimientos casan con un CFDI.", payload: { match_pct: 1.0, orphans: 0 } },
    riesgo: { variant: "riesgo", label: "40% sin identificar", hint: "Muchos depósitos huérfanos — falta CFDI.", payload: { match_pct: 0.6, orphans: 18 } },
  },
};

export function getDemoCases(toolKey: string): ToolDemoCases | null {
  return DEMO_CASES[toolKey] ?? null;
}
