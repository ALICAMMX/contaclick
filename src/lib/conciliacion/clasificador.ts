// ─────────────────────────────────────────────────────────────────────────────
// CLASIFICADOR DE MOVIMIENTOS SIN FACTURA — módulo PURO
//
// No todo movimiento bancario tiene un CFDI detrás: comisiones del banco,
// traspasos entre cuentas propias, pagos de impuestos, cuotas del IMSS,
// préstamos, aportaciones de socios. Este módulo SUGIERE a qué corresponde
// cada movimiento que quedó sin empate, para que el contador lo confirme en
// bloque en lugar de revisarlo renglón por renglón.
//
// Reglas:
//   - Nunca decide solo: sugiere con un nivel de confianza.
//   - Las reglas aprendidas del despacho (lo que el contador ya confirmó)
//     ganan sobre las reglas del sistema.
//   - Un depósito no identificado NO se clasifica como "sin factura": puede ser
//     un ingreso omitido y se deja visible a propósito.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizaTexto } from "./motor";

export const CATEGORIAS = [
  "comision_bancaria",
  "iva_comision",
  "traspaso_propio",
  "pago_impuestos",
  "pago_imss_infonavit",
  "nomina",
  "intereses_ganados",
  "isr_retenido_banco",
  "prestamo",
  "aportacion_retiro_socios",
  "retiro_efectivo",
  "otro_sin_cfdi",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const ETIQUETA_CATEGORIA: Record<Categoria, string> = {
  comision_bancaria: "Comisión bancaria",
  iva_comision: "IVA de comisión bancaria",
  traspaso_propio: "Traspaso entre cuentas propias",
  pago_impuestos: "Pago de impuestos (SAT / estatales)",
  pago_imss_infonavit: "Cuotas IMSS / INFONAVIT",
  nomina: "Pago de nómina",
  intereses_ganados: "Intereses ganados",
  isr_retenido_banco: "ISR retenido por el banco",
  prestamo: "Préstamo (entrada o abono)",
  aportacion_retiro_socios: "Aportación o retiro de socios",
  retiro_efectivo: "Retiro en efectivo",
  otro_sin_cfdi: "Otro movimiento sin factura",
};

export type Confianza = "alta" | "media";

export type MovimientoAClasificar = {
  id: string;
  fecha: string;
  importe_centavos: number;
  direccion: "abono" | "cargo";
  descripcion: string | null;
  referencia: string | null;
  cuenta_id: string | null;
};

/** Regla aprendida: lo que el contador confirmó para movimientos parecidos. */
export type ReglaAprendida = {
  id: string;
  patron: string;
  direccion: "abono" | "cargo" | null;
  categoria: Categoria;
};

export type Sugerencia = {
  movimiento_id: string;
  categoria: Categoria;
  confianza: Confianza;
  origen: "regla_aprendida" | "regla_sistema" | "traspaso_detectado";
  regla: string;
  regla_id?: string;
  /** Movimiento de la otra cuenta en un traspaso propio. */
  contraparte_movimiento_id?: string;
  explicacion: string;
};

type ReglaSistema = {
  id: string;
  re: RegExp;
  direccion: "abono" | "cargo" | null;
  categoria: Categoria;
  confianza: Confianza;
};

// Las reglas se comparan contra el texto con palabras separadas (sin acentos,
// en mayúsculas) y con límites de palabra, para que "SUA" no coincida dentro
// de "MENSUAL" ni "ISN" dentro de otra palabra.
const REGLAS_SISTEMA: ReglaSistema[] = [
  { id: "iva_comision", re: /\bIVA (DE |POR )?(LA )?COM(ISION)?\b|\bIVA COM\b|\bCOMISION IVA\b/, direccion: "cargo", categoria: "iva_comision", confianza: "alta" },
  { id: "comision", re: /\bCOMISION(ES)?\b|\bCOM X\b|\bANUALIDAD\b|\bMEMBRESIA\b|\bMANEJO DE CUENTA\b|\bSALDO PROMEDIO MINIMO\b/, direccion: "cargo", categoria: "comision_bancaria", confianza: "alta" },
  { id: "isr_intereses", re: /\bISR RETENIDO\b|\bRETENCION (DE )?ISR\b|\bISR (SOBRE )?INTERES(ES)?\b|\bIMPUESTO RETENIDO\b/, direccion: "cargo", categoria: "isr_retenido_banco", confianza: "alta" },
  { id: "intereses", re: /\bINTERES(ES)?\b|\bRENDIMIENTOS?\b/, direccion: "abono", categoria: "intereses_ganados", confianza: "media" },
  { id: "sat", re: /\bPAGO REFERENCIADO\b|\bSAT\b|\bLINEA DE CAPTURA\b|\bDECLARACION\b|\bIMPUESTOS? FEDERALES?\b|\bTESORERIA\b|\bIMPUESTO SOBRE NOMINA\b|\bISN\b|\bTENENCIA\b/, direccion: "cargo", categoria: "pago_impuestos", confianza: "alta" },
  { id: "imss", re: /\bIMSS\b|\bINFONAVIT\b|\bSUA\b|\bSIPARE\b|\bCUOTAS OBRERO\b/, direccion: "cargo", categoria: "pago_imss_infonavit", confianza: "alta" },
  { id: "nomina", re: /\bNOMINA\b|\bDISPERSION\b|\bSUELDOS?\b|\bAGUINALDO\b|\bFINIQUITO\b/, direccion: "cargo", categoria: "nomina", confianza: "media" },
  { id: "prestamo", re: /\bPRESTAMO\b|\bCREDITO (SIMPLE|PYME|REVOLVENTE)\b|\bAMORTIZACION\b|\bDISPOSICION DE CREDITO\b|\bPAGO (DE )?CREDITO\b/, direccion: null, categoria: "prestamo", confianza: "media" },
  { id: "retiro_efectivo", re: /\bRETIRO (EN )?(EFECTIVO|CAJERO|ATM)\b|\bCAJERO AUTOMATICO\b|\bDISPOSICION (DE )?EFECTIVO\b/, direccion: "cargo", categoria: "retiro_efectivo", confianza: "media" },
  { id: "socios", re: /\bAPORTACION (DE )?(CAPITAL|SOCIOS?)\b|\bRETIRO DE SOCIOS?\b|\bDIVIDENDOS?\b/, direccion: null, categoria: "aportacion_retiro_socios", confianza: "media" },
];

/** Texto con palabras separadas, sin acentos y en mayúsculas. */
function palabras(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}
const textoPalabras = (m: MovimientoAClasificar) => `${palabras(m.descripcion)} ${palabras(m.referencia)}`.trim();

const texto = (m: MovimientoAClasificar) => `${normalizaTexto(m.descripcion)}${normalizaTexto(m.referencia)}`;

/**
 * Patrón estable de una descripción bancaria para reconocer movimientos
 * parecidos: sin números, fechas ni referencias; las primeras palabras con
 * significado. "SPEI ENVIADO CFE 0123 REF 99/03" → "SPEI ENVIADO CFE".
 */
export function patronDe(descripcion: string | null): string {
  const palabras = (descripcion ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !/^(REF|NO|DE|LA|EL|DEL|POR|PARA|AL|EN|CTA|CUENTA|FOLIO|CLAVE|RASTREO)$/.test(w));
  return palabras.slice(0, 4).join(" ");
}

/** ¿El patrón aprendido aparece en la descripción del movimiento? */
function coincidePatron(m: MovimientoAClasificar, patron: string): boolean {
  const p = normalizaTexto(patron);
  return p.length >= 4 && texto(m).includes(p);
}

export type EntradaClasificador = {
  movimientos: MovimientoAClasificar[];
  reglas_aprendidas: ReglaAprendida[];
  /** RFC del contribuyente: un SPEI a su propio RFC es traspaso. */
  rfc_cliente: string | null;
  /** Terminaciones de las cuentas propias (últimos 4 dígitos) para detectar traspasos. */
  terminaciones_propias?: string[];
  /** Días máximos entre salida y entrada de un traspaso propio. */
  dias_traspaso?: number;
};

function dias(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000));
}

export function clasificarMovimientos(entrada: EntradaClasificador): Sugerencia[] {
  const out = new Map<string, Sugerencia>();
  const movs = [...entrada.movimientos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id < b.id ? -1 : 1));
  const rfc = normalizaTexto(entrada.rfc_cliente);
  const terminaciones = (entrada.terminaciones_propias ?? []).map((t) => t.replace(/\D/g, "")).filter((t) => t.length === 4);
  const maxDias = entrada.dias_traspaso ?? 2;

  // 1. Traspasos entre cuentas propias: un cargo en una cuenta y un abono del
  //    mismo importe en OTRA cuenta del mismo contribuyente, casi el mismo día.
  const usados = new Set<string>();
  for (const salida of movs.filter((m) => m.direccion === "cargo")) {
    if (usados.has(salida.id)) continue;
    const entradaMov = movs.find(
      (m) =>
        m.direccion === "abono" &&
        !usados.has(m.id) &&
        m.importe_centavos === salida.importe_centavos &&
        !!m.cuenta_id && !!salida.cuenta_id && m.cuenta_id !== salida.cuenta_id &&
        dias(m.fecha, salida.fecha) <= maxDias,
    );
    if (!entradaMov) continue;
    usados.add(salida.id);
    usados.add(entradaMov.id);
    for (const [a, b] of [[salida, entradaMov], [entradaMov, salida]] as const) {
      out.set(a.id, {
        movimiento_id: a.id,
        categoria: "traspaso_propio",
        confianza: "alta",
        origen: "traspaso_detectado",
        regla: "traspaso_entre_cuentas",
        contraparte_movimiento_id: b.id,
        explicacion: "El mismo importe sale de una cuenta y entra a otra cuenta del mismo contribuyente.",
      });
    }
  }

  for (const m of movs) {
    if (out.has(m.id)) continue;
    const t = texto(m);

    // 2. Lo que el despacho ya enseñó gana sobre todo lo demás.
    const aprendida = entrada.reglas_aprendidas
      .filter((r) => (!r.direccion || r.direccion === m.direccion) && coincidePatron(m, r.patron))
      .sort((a, b) => normalizaTexto(b.patron).length - normalizaTexto(a.patron).length)[0];
    if (aprendida) {
      out.set(m.id, {
        movimiento_id: m.id,
        categoria: aprendida.categoria,
        confianza: "alta",
        origen: "regla_aprendida",
        regla: aprendida.patron,
        regla_id: aprendida.id,
        explicacion: `Ya clasificaste movimientos con «${aprendida.patron}» como ${ETIQUETA_CATEGORIA[aprendida.categoria].toLowerCase()}.`,
      });
      continue;
    }

    // 3. Traspaso a una cuenta propia por RFC o terminación de cuenta.
    const mencionaPropio =
      (rfc.length >= 12 && t.includes(rfc)) ||
      (m.direccion === "cargo" && terminaciones.some((x) => t.includes(x)));
    if (mencionaPropio && /\b(TRASPASO|SPEI|TRANSFERENCIA|TEF|ENTRE CUENTAS)\b/.test(textoPalabras(m))) {
      out.set(m.id, {
        movimiento_id: m.id,
        categoria: "traspaso_propio",
        confianza: "media",
        origen: "regla_sistema",
        regla: "traspaso_rfc_o_cuenta_propia",
        explicacion: "La descripción menciona el RFC o una cuenta del propio contribuyente.",
      });
      continue;
    }

    // 4. Reglas del sistema.
    const tp = textoPalabras(m);
    const sistema = REGLAS_SISTEMA.find((r) => (!r.direccion || r.direccion === m.direccion) && r.re.test(tp));
    if (sistema) {
      out.set(m.id, {
        movimiento_id: m.id,
        categoria: sistema.categoria,
        confianza: sistema.confianza,
        origen: "regla_sistema",
        regla: sistema.id,
        explicacion: `La descripción del banco corresponde a ${ETIQUETA_CATEGORIA[sistema.categoria].toLowerCase()}.`,
      });
    }
    // Sin sugerencia: se queda visible. En especial los depósitos no
    // identificados, que pueden ser ingresos sin factura.
  }

  return movs.map((m) => out.get(m.id)).filter((s): s is Sugerencia => !!s);
}

/** Motivo que se guarda al confirmar: el procedimiento exige al menos 10 caracteres. */
export function motivoDeClasificacion(categoria: Categoria): string {
  return `Clasificado como ${ETIQUETA_CATEGORIA[categoria].toLowerCase()} (sin factura).`;
}
