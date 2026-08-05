// Reglas de riesgo CFDI 4.0 — puro JS, sin dependencias.
// Cada regla devuelve hallazgos con nivel, código y mensaje.

import type { CfdiParsed } from "@/lib/tools/cfdi-parser";

export type RiskFinding = {
  code: string;
  level: "bajo" | "medio" | "alto";
  message: string;
};

const USOS_VALIDOS_PF = ["G01","G02","G03","I01","I02","I03","I04","I05","I06","I07","I08",
  "D01","D02","D03","D04","D05","D06","D07","D08","D09","D10","S01","CP01","CN01"];

const FORMAS_PAGO = new Set([
  "01","02","03","04","05","06","08","12","13","14","15","17","23","24","25","26","27","28","29","30","31","99"
]);

export function analyzeCfdi(c: CfdiParsed, ctx?: { rfcCliente?: string }): RiskFinding[] {
  const out: RiskFinding[] = [];

  if (c.version && c.version !== "4.0") {
    out.push({ code: "VERSION", level: "alto", message: `Versión ${c.version}; el SAT exige 4.0.` });
  }
  if (!c.uuid) out.push({ code: "SIN_TIMBRE", level: "alto", message: "CFDI sin TimbreFiscalDigital (no timbrado)." });
  if (!c.emisor.rfc) out.push({ code: "SIN_RFC_EMISOR", level: "alto", message: "Falta RFC del emisor." });
  if (!c.receptor.rfc) out.push({ code: "SIN_RFC_RECEPTOR", level: "alto", message: "Falta RFC del receptor." });

  // Integridad del sellado (art. 29 CFF, fracc. III y IV)
  if (!c.sello) out.push({ code: "SIN_SELLO", level: "alto", message: "El comprobante no trae sello digital del emisor." });
  if (!c.certificado || !c.noCertificado) {
    out.push({ code: "SIN_CERTIFICADO", level: "alto", message: "Falta el certificado de sello digital (CSD) o su número." });
  }
  if (c.uuid && !c.selloSAT) {
    out.push({ code: "SIN_SELLO_SAT", level: "alto", message: "El timbre no contiene SelloSAT: el timbrado no puede verificarse." });
  }

  // Campos obligatorios en CFDI 4.0
  if (!c.exportacion) out.push({ code: "SIN_EXPORTACION", level: "medio", message: "Falta el atributo Exportacion, obligatorio en CFDI 4.0." });
  if (!c.receptor.regimenFiscalReceptor) {
    out.push({ code: "SIN_REGIMEN_RECEPTOR", level: "medio", message: "Falta RegimenFiscalReceptor, obligatorio en CFDI 4.0." });
  }
  if (!c.receptor.domicilioFiscalReceptor) {
    out.push({ code: "SIN_DOMICILIO_RECEPTOR", level: "medio", message: "Falta DomicilioFiscalReceptor (código postal), obligatorio en CFDI 4.0." });
  }
  if (c.conceptos.length === 0) {
    out.push({ code: "SIN_CONCEPTOS", level: "alto", message: "El comprobante no tiene conceptos." });
  } else if (c.conceptos.some((x) => !x.objetoImp)) {
    out.push({ code: "SIN_OBJETO_IMP", level: "medio", message: "Hay conceptos sin ObjetoImp, obligatorio en CFDI 4.0." });
  }


  // PUE con forma de pago 99 (por definir) suele ser inconsistente.
  if (c.metodoPago === "PUE" && c.formaPago === "99") {
    out.push({ code: "PUE_FORMA_99", level: "medio", message: "Método PUE con forma 99 (por definir) es inconsistente." });
  }
  if (c.formaPago && !FORMAS_PAGO.has(c.formaPago)) {
    out.push({ code: "FORMA_PAGO_INVALIDA", level: "medio", message: `Forma de pago ${c.formaPago} no está en el catálogo SAT.` });
  }
  if (c.receptor.usoCFDI && !USOS_VALIDOS_PF.includes(c.receptor.usoCFDI)) {
    out.push({ code: "USO_CFDI", level: "bajo", message: `Uso CFDI ${c.receptor.usoCFDI} requiere validación contra el régimen del receptor.` });
  }

  // Validación aritmética: subtotal - descuento + traslados - retenciones ≈ total
  const subtotal = c.subTotal ?? 0;
  const desc = c.descuento ?? 0;
  const tras = c.impuestos.totalTrasladados ?? 0;
  const ret = c.impuestos.totalRetenidos ?? 0;
  const total = c.total ?? 0;
  const calc = subtotal - desc + tras - ret;
  const diff = Math.abs(calc - total);
  if (total > 0 && diff > Math.max(1, total * 0.001)) {
    out.push({
      code: "DIF_MATEMATICA",
      level: "alto",
      message: `Inconsistencia aritmética: ${calc.toFixed(2)} calculado vs ${total.toFixed(2)} declarado (Δ ${diff.toFixed(2)}).`,
    });
  }

  // Monto sospechosamente alto sin retenciones
  if (subtotal > 100000 && ret === 0 && c.tipoComprobante === "I") {
    out.push({ code: "MONTO_ALTO_SIN_RET", level: "bajo", message: "Ingreso > $100,000 sin retenciones; revisa si aplica." });
  }

  // Cliente activo no aparece en el comprobante
  if (ctx?.rfcCliente) {
    const rfcU = ctx.rfcCliente.toUpperCase();
    if (c.emisor.rfc?.toUpperCase() !== rfcU && c.receptor.rfc?.toUpperCase() !== rfcU) {
      out.push({
        code: "RFC_AJENO",
        level: "alto",
        message: `Este CFDI no involucra al cliente activo ${rfcU} (emisor ${c.emisor.rfc}, receptor ${c.receptor.rfc}).`,
      });
    }
  }

  return out;
}

export function maxLevel(findings: RiskFinding[]): "bajo" | "medio" | "alto" | "ok" {
  if (findings.some((f) => f.level === "alto")) return "alto";
  if (findings.some((f) => f.level === "medio")) return "medio";
  if (findings.some((f) => f.level === "bajo")) return "bajo";
  return "ok";
}
