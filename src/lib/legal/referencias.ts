// Catálogo central de fundamentos legales y justificación de color para hallazgos.
// Una sola fuente de verdad: si la RMF / ley cambia, se actualiza aquí y se
// refleja en todas las herramientas. Incluye fecha de verificación.

export const LEGISLACION_VERIFICADA_AL = "2026-06-22";

export type Severidad = "alta" | "media" | "baja";
export type RiskLevel = "alto" | "medio" | "bajo" | "ok";

export type LegalRef = {
  ley: "CFF" | "LISR" | "LIVA" | "RMF" | "LFT" | "Ley Aduanera" | "Guía SAT" | "Anexo 20";
  cita: string;       // "Art. 29-A fracc. VII"
  vigencia: string;   // "2026"
  url?: string;
};

export type FindingMeta = {
  /** Frase corta que explica por qué se pinta de ese color. */
  why: string;
  /** Artículos / reglas vigentes que sustentan el hallazgo. */
  legal: LegalRef[];
  /** Acción concreta sugerida al contador. */
  action?: string;
};

/* ------------------------------------------------------------------ */
/* Helpers de color                                                    */
/* ------------------------------------------------------------------ */

export function whyForLevel(level: RiskLevel | Severidad): string {
  switch (level) {
    case "alto":
    case "alta":
      return "Rojo: el SAT puede rechazar la deducción/acreditamiento y aplicar multa. Requiere corrección inmediata.";
    case "medio":
    case "media":
      return "Ámbar: hallazgo formal o inconsistencia. No es ilegal por sí mismo, pero abre la puerta a un requerimiento. Revisa antes del cierre.";
    case "bajo":
    case "baja":
      return "Azul: aviso preventivo. La operación es válida pero conviene documentar el soporte por si hay revisión.";
    case "ok":
    default:
      return "Verde: sin observaciones automáticas bajo la legislación vigente.";
  }
}

export function severidadToLevel(s: Severidad): RiskLevel {
  return s === "alta" ? "alto" : s === "media" ? "medio" : "bajo";
}

/* ------------------------------------------------------------------ */
/* CFDI — códigos de risk.ts                                            */
/* ------------------------------------------------------------------ */

export const META_CFDI_RISK: Record<string, FindingMeta> = {
  VERSION: {
    why: "Rojo: un CFDI fuera de versión 4.0 no produce efectos fiscales y no es deducible/acreditable.",
    legal: [
      { ley: "CFF", cita: "Art. 29 y 29-A", vigencia: "2026" },
      { ley: "Anexo 20", cita: "CFDI 4.0", vigencia: "2026" },
      { ley: "RMF", cita: "Regla 2.7.1.32", vigencia: "2026" },
    ],
    action: "Solicita al emisor un CFDI re-emitido en versión 4.0.",
  },
  SIN_TIMBRE: {
    why: "Rojo: sin TimbreFiscalDigital el comprobante no fue certificado por un PAC; legalmente no existe ante el SAT.",
    legal: [
      { ley: "CFF", cita: "Art. 29 fracc. IV", vigencia: "2026" },
      { ley: "RMF", cita: "Regla 2.7.2", vigencia: "2026" },
    ],
    action: "Exige al emisor un CFDI timbrado por PAC autorizado.",
  },
  SIN_RFC_EMISOR: {
    why: "Rojo: faltan datos del emisor; el comprobante es nulo de pleno derecho.",
    legal: [{ ley: "CFF", cita: "Art. 29-A fracc. I", vigencia: "2026" }],
    action: "No contabilices el CFDI hasta que el emisor lo re-emita correctamente.",
  },
  SIN_RFC_RECEPTOR: {
    why: "Rojo: sin RFC del receptor no procede la deducción ni el acreditamiento.",
    legal: [{ ley: "CFF", cita: "Art. 29-A fracc. IV", vigencia: "2026" }],
    action: "Cancela con motivo 02 y solicita re-emisión con RFC y régimen del receptor.",
  },
  PUE_FORMA_99: {
    why: "Ámbar: si el método es PUE (pago en una exhibición) la forma de pago debe ser la real, no 99 (por definir).",
    legal: [
      { ley: "RMF", cita: "Regla 2.7.1.32", vigencia: "2026" },
      { ley: "Guía SAT", cita: "Llenado CFDI 4.0 — apéndice 7", vigencia: "2026" },
    ],
    action: "Cancela y re-emite con la forma de pago real (01 efectivo, 03 transferencia, 04 TDC, etc.).",
  },
  FORMA_PAGO_INVALIDA: {
    why: "Ámbar: la forma de pago no está en el catálogo c_FormaPago del SAT; el PAC pudo haberlo timbrado por error.",
    legal: [
      { ley: "Anexo 20", cita: "Catálogo c_FormaPago", vigencia: "2026" },
      { ley: "RMF", cita: "Regla 2.7.1.32", vigencia: "2026" },
    ],
    action: "Re-emite usando una clave vigente del catálogo c_FormaPago.",
  },
  USO_CFDI: {
    why: "Azul: el uso CFDI debe ser congruente con el régimen fiscal del receptor; si no, el SAT puede invalidar la deducción.",
    legal: [
      { ley: "RMF", cita: "Regla 2.7.1.32 y Anexo 20 (c_UsoCFDI)", vigencia: "2026" },
    ],
    action: "Confirma con el receptor el uso correcto conforme a su constancia de situación fiscal.",
  },
  DIF_MATEMATICA: {
    why: "Rojo: subtotal − descuento + traslados − retenciones no cuadra contra el total. CFDI con error aritmético es rechazable.",
    legal: [
      { ley: "Anexo 20", cita: "Reglas de validación aritmética", vigencia: "2026" },
      { ley: "CFF", cita: "Art. 29-A fracc. V y VII", vigencia: "2026" },
    ],
    action: "Cancela con motivo 02 (errores con relación) y re-emite con los importes correctos.",
  },
  MONTO_ALTO_SIN_RET: {
    why: "Azul: monto alto sin retenciones puede indicar omisión de retención de ISR/IVA cuando aplique (p. ej. servicios profesionales a PF).",
    legal: [
      { ley: "LISR", cita: "Art. 106 y 116", vigencia: "2026" },
      { ley: "LIVA", cita: "Art. 1-A fracc. II", vigencia: "2026" },
    ],
    action: "Verifica si la operación obliga a retener y, en su caso, presenta la declaración complementaria.",
  },
  RFC_AJENO: {
    why: "Rojo: el CFDI no involucra al cliente activo; podría estar contabilizado en el expediente equivocado.",
    legal: [{ ley: "CFF", cita: "Art. 28 fracc. III (contabilidad por contribuyente)", vigencia: "2026" }],
    action: "Mueve el CFDI al expediente del RFC correcto.",
  },
};

/* ------------------------------------------------------------------ */
/* Auditor express — tipo                                               */
/* ------------------------------------------------------------------ */

export const META_AUDIT: Record<string, FindingMeta> = {
  duplicado: {
    why: "Rojo: el mismo UUID timbrado dos veces puede duplicar ingresos/deducciones declarados.",
    legal: [
      { ley: "CFF", cita: "Art. 28 y 29", vigencia: "2026" },
      { ley: "RMF", cita: "Regla 2.7.1", vigencia: "2026" },
    ],
    action: "Identifica el origen del duplicado y elimínalo de la contabilidad antes del cierre.",
  },
  nc_huerfana: {
    why: "Rojo: una nota de crédito sin CFDI de ingreso relacionado disminuye ingresos sin sustento; el SAT lo reclasifica como ingreso omitido.",
    legal: [
      { ley: "CFF", cita: "Art. 29-A penúltimo párrafo (CFDI relacionados)", vigencia: "2026" },
      { ley: "Guía SAT", cita: "Tipos de relación 01 'Nota de crédito'", vigencia: "2026" },
    ],
    action: "Cancela la NC y re-emítela relacionando el UUID del ingreso original.",
  },
  cancelado_declarado: {
    why: "Ámbar: si el CFDI cancelado ya formó parte de una declaración previa, se debe presentar declaración complementaria.",
    legal: [
      { ley: "CFF", cita: "Art. 32 (complementarias) y 29-A", vigencia: "2026" },
      { ley: "RMF", cita: "Regla 2.7.1.34 (cancelación con aceptación)", vigencia: "2026" },
    ],
    action: "Revisa si el CFDI estaba en la declaración del periodo y, en su caso, presenta complementaria.",
  },
  ppd_sin_pago: {
    why: "Rojo: PPD sin Complemento de Pago genera multa de ~$400–$600 por CFDI y puede reclasificarse como ingreso no acumulado para el emisor.",
    legal: [
      { ley: "CFF", cita: "Art. 29-A y 81 fracc. XLII / 82 fracc. XL", vigencia: "2026" },
      { ley: "RMF", cita: "Regla 2.7.1.32 y 2.7.1.35", vigencia: "2026" },
      { ley: "Guía SAT", cita: "Complemento de Recepción de Pagos v2.0", vigencia: "2026" },
    ],
    action: "Si ya hubo cobro: emite el REP dentro de los 5 días naturales del mes siguiente. Si fue error de método: cancela con motivo 02 y re-emite como PUE.",
  },
  fuera_periodo: {
    why: "Azul: el CFDI cae fuera del año fiscal analizado; podría pertenecer a otro ejercicio.",
    legal: [{ ley: "LISR", cita: "Art. 17 (acumulación) y 27 (deducción)", vigencia: "2026" }],
    action: "Confirma el ejercicio al que corresponde y reclasifícalo si es necesario.",
  },
};

/* ------------------------------------------------------------------ */
/* Deducibilidad — regla (string libre)                                 */
/* ------------------------------------------------------------------ */

export const META_DEDUC_BY_REGLA: Record<string, FindingMeta> = {
  "Pago en efectivo > $2,000": {
    why: "Rojo: la LISR exige medio de pago bancarizado para gastos > $2,000; en efectivo no son deducibles.",
    legal: [{ ley: "LISR", cita: "Art. 27 fracc. III", vigencia: "2026" }],
    action: "Reembolsa por transferencia/TDC y solicita re-emisión del CFDI con forma de pago correcta, o reclasifica como no deducible.",
  },
  "PUE con forma 99": {
    why: "Ámbar: PUE exige forma de pago real al timbrar; con 99 el SAT puede rechazar la deducción.",
    legal: [
      { ley: "RMF", cita: "Regla 2.7.1.32", vigencia: "2026" },
      { ley: "Guía SAT", cita: "CFDI 4.0", vigencia: "2026" },
    ],
    action: "Pide al proveedor cancelar (motivo 02) y re-emitir con la forma de pago correcta.",
  },
  "CFDI cancelado contabilizado": {
    why: "Rojo: los CFDI cancelados no producen efectos fiscales; deducirlos genera diferencia con el SAT.",
    legal: [{ ley: "CFF", cita: "Art. 29-A último párrafo", vigencia: "2026" }],
    action: "Reversa la deducción en pólizas y solicita un CFDI sustituto vigente.",
  },
  "Donativo — validar donataria autorizada": {
    why: "Ámbar: solo donativos a donatarias autorizadas son deducibles y con tope (7% utilidad fiscal del ejercicio anterior).",
    legal: [
      { ley: "LISR", cita: "Art. 27 fracc. I y 82", vigencia: "2026" },
      { ley: "RMF", cita: "Anexo 14 (Donatarias autorizadas)", vigencia: "2026", url: "https://www.sat.gob.mx/consultas/operacion/03083/consulta-las-donatarias-autorizadas" },
    ],
    action: "Verifica el RFC del emisor en el padrón del SAT y comprueba el tope del 7%.",
  },
  "Pago al extranjero sin retención": {
    why: "Rojo: pagos a residentes en el extranjero requieren retención de ISR (Título V). Sin retención, el gasto no es deducible.",
    legal: [
      { ley: "LISR", cita: "Arts. 153–175 (Título V)", vigencia: "2026" },
      { ley: "LIVA", cita: "Art. 1-A fracc. III (IVA por importación de servicios)", vigencia: "2026" },
    ],
    action: "Calcula y entera la retención correspondiente; emite constancia y, en su caso, presenta complementaria.",
  },
  "Comprobante a público en general": {
    why: "Rojo: el RFC genérico XAXX no permite identificar al contribuyente; el CFDI no soporta deducción ni acreditamiento.",
    legal: [
      { ley: "RMF", cita: "Regla 2.7.1.21", vigencia: "2026" },
      { ley: "CFF", cita: "Art. 29-A fracc. IV", vigencia: "2026" },
    ],
    action: "Solicita CFDI nominativo con RFC y régimen del receptor.",
  },
  "Consumo en restaurante sin tarjeta de crédito": {
    why: "Rojo: los consumos en restaurantes solo son deducibles al 8.5% si se pagan con TDC, TDD o monedero electrónico autorizado.",
    legal: [{ ley: "LISR", cita: "Art. 28 fracc. XX", vigencia: "2026" }],
    action: "Reclasifica el gasto como no deducible o paga con el medio autorizado y solicita re-emisión.",
  },
  "Restaurante — deducibilidad limitada al 8.5%": {
    why: "Azul: pago correcto, pero la ley limita la deducción al 8.5% del total. Lo demás es no deducible.",
    legal: [{ ley: "LISR", cita: "Art. 28 fracc. XX", vigencia: "2026" }],
    action: "Registra el 8.5% como deducible y el resto en cuenta no deducible.",
  },
  "Bebidas alcohólicas": {
    why: "Rojo: bebidas alcohólicas y gastos de representación son no deducibles.",
    legal: [{ ley: "LISR", cita: "Art. 28 fracc. XX y XXIII", vigencia: "2026" }],
    action: "Reclasifica el importe completo como no deducible.",
  },
  "Viáticos — verificar tope diario": {
    why: "Ámbar: la LISR fija topes de hospedaje (nacional $3,850 / extranjero USD $850 por día); el excedente no es deducible.",
    legal: [{ ley: "LISR", cita: "Art. 28 fracc. V", vigencia: "2026" }],
    action: "Documenta días, destino y boleto de transporte. Limita la deducción al tope diario.",
  },
  "Tasa de IVA inusual": {
    why: "Ámbar: el IVA acreditable debe corresponder a tasas válidas (0%, 8% frontera u 16%). Una tasa fuera de rango sugiere error en el CFDI.",
    legal: [
      { ley: "LIVA", cita: "Arts. 1, 2 y 2-A", vigencia: "2026" },
      { ley: "Anexo 20", cita: "Catálogo c_TasaOCuota", vigencia: "2026" },
    ],
    action: "Revisa los traslados del XML y solicita re-emisión si la tasa es incorrecta.",
  },
};

/* ------------------------------------------------------------------ */
/* Nómina oculta / Precios importación — meta única                     */
/* ------------------------------------------------------------------ */

export const META_SHADOW_PAYROLL: FindingMeta = {
  why: "Rojo: pagos periódicos de monto similar al mismo beneficiario sin CFDI de honorarios ni nómina pueden ser reclasificados por el SAT como salarios disimulados.",
  legal: [
    { ley: "LISR", cita: "Art. 94 (asimilados y salarios)", vigencia: "2026" },
    { ley: "LISR", cita: "Art. 27 fracc. V y XVIII (requisitos de deducción)", vigencia: "2026" },
    { ley: "LFT", cita: "Art. 20 (relación laboral)", vigencia: "2026" },
    { ley: "CFF", cita: "Art. 5-A (cláusula antiabuso)", vigencia: "2026" },
  ],
  action: "Documenta la naturaleza del pago: si es honorario, exige CFDI 4.0 tipo I. Si es relación laboral, regulariza alta en IMSS y CFDI de nómina.",
};

export const META_IMPORT_PRICE_OUTLIER: FindingMeta = {
  why: "Rojo/ámbar según desviación: precios fuera de la mediana en operaciones con extranjeros exigen estudio de comparabilidad. Subvaluar es delito aduanero; sobrevaluar es transferencia de utilidades.",
  legal: [
    { ley: "LISR", cita: "Art. 76-A y 179–180 (partes relacionadas y precios de transferencia)", vigencia: "2026" },
    { ley: "Ley Aduanera", cita: "Art. 64–78 (valor en aduana)", vigencia: "2026" },
    { ley: "RMF", cita: "Capítulo 3.9 (precios de transferencia)", vigencia: "2026" },
  ],
  action: "Adjunta estudio de precios de transferencia o comparable de mercado independiente que justifique el valor unitario.",
};

export const META_IMPORT_PRICE_DESC_GENERICA: FindingMeta = {
  why: "Ámbar: descripción genérica impide validar el bien/servicio y por tanto su valor; el SAT puede invalidar el CFDI.",
  legal: [
    { ley: "CFF", cita: "Art. 29-A fracc. V", vigencia: "2026" },
    { ley: "RMF", cita: "Regla 2.7.1.32", vigencia: "2026" },
  ],
  action: "Solicita re-emisión con descripción específica (marca, modelo, características técnicas).",
};

/* ------------------------------------------------------------------ */
/* Lookups con fallback                                                 */
/* ------------------------------------------------------------------ */

export function metaForCfdi(code: string): FindingMeta {
  return META_CFDI_RISK[code] ?? {
    why: "Aviso generado por las reglas internas de CFDI 4.0.",
    legal: [{ ley: "Anexo 20", cita: "CFDI 4.0", vigencia: "2026" }],
  };
}

export function metaForAudit(tipo: string): FindingMeta {
  return META_AUDIT[tipo] ?? {
    why: "Hallazgo de auditoría.",
    legal: [{ ley: "CFF", cita: "Art. 28", vigencia: "2026" }],
  };
}

export function metaForDeduc(regla: string): FindingMeta {
  return META_DEDUC_BY_REGLA[regla] ?? {
    why: "Regla de deducibilidad activada.",
    legal: [{ ley: "LISR", cita: "Art. 27 (requisitos de deducción)", vigencia: "2026" }],
  };
}

export function formatLegal(refs: LegalRef[]): string {
  return refs.map((r) => `${r.ley} ${r.cita} (vig. ${r.vigencia})`).join(" · ");
}
