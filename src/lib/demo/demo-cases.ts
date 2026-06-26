// Casos de muestra precargables en cada herramienta (modo demo).
// No tocan BD; solo devuelven payloads sintéticos para que el usuario
// vea qué arroja la herramienta en escenarios buenos vs en riesgo.

import { EFOS_DEMO_RFCS } from "./perfiles";

export type DemoCase = {
  label: string;
  variant: "ok" | "riesgo";
  payload: any;
  hint: string;
};

export type ToolDemoCases = {
  [variant: string]: DemoCase;
};

const xmlSimpleValido = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="A" Folio="1001" Fecha="2025-06-15T10:00:00" SubTotal="10000.00" Total="11600.00" TipoDeComprobante="I" MetodoPago="PUE" FormaPago="03" Moneda="MXN" LugarExpedicion="64000" Exportacion="01" Sello="SELLO_DEMO_VALIDO">
  <cfdi:Emisor Rfc="DEMOCEJ010101AA1" Nombre="Constructora Ejemplar SA de CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="PUBLICO EN GENERAL" DomicilioFiscalReceptor="64000" RegimenFiscalReceptor="616" UsoCFDI="G03"/>
</cfdi:Comprobante>`;

const xmlConProblemas = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="X" Folio="9999" Fecha="2025-06-15T10:00:00" SubTotal="50000.00" Total="58000.00" TipoDeComprobante="I" MetodoPago="PUE" FormaPago="01" Moneda="MXN" LugarExpedicion="64000" Exportacion="01" Sello="">
  <cfdi:Emisor Rfc="${EFOS_DEMO_RFCS.definitivo}" Nombre="Proveedor EFOS Definitivo Demo" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="DEMOTRA950404DD4" Nombre="Transportes Riesgo Alto SA" DomicilioFiscalReceptor="64000" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
</cfdi:Comprobante>`;

export const DEMO_CASES: Record<string, ToolDemoCases> = {
  "cfdi-validator": {
    ok: { variant: "ok", label: "Caso OK — CFDI íntegro", hint: "Sello correcto, RFC propio, totales cuadran.", payload: { xml: xmlSimpleValido } },
    riesgo: { variant: "riesgo", label: "Caso en riesgo — CFDI sin sello + EFOS", hint: "Sello vacío y proveedor en lista 69-B definitivos.", payload: { xml: xmlConProblemas } },
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
