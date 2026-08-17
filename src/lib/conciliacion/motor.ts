// ─────────────────────────────────────────────────────────────────────────────
// MOTOR DE CONCILIACIÓN UNO-A-UNO — módulo PURO
//
// Sin base de datos, sin red, sin IA y sin reloj. Recibe los movimientos y los
// comprobantes del periodo y devuelve grupos uno_a_uno deterministas.
// El mismo insumo, en cualquier orden de lectura, produce exactamente el mismo
// resultado.
//
// El archivo de verdad esperada del laboratorio sintético NO puede importarse
// aquí: el motor jamás conoce la respuesta.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ALGORITMO_VERSION,
  type EvidenciaConciliacion,
  type OrigenConciliacion,
} from "./contrato";

export type MovimientoEntrada = {
  id: string;
  /** AAAA-MM-DD, ya resuelta en hora de la Ciudad de México. */
  fecha: string;
  /** Positivo. La dirección se decide con `direccion`. */
  importe_centavos: number;
  direccion: "abono" | "cargo";
  descripcion: string | null;
  referencia: string | null;
  moneda: string | null;
  ignorado: boolean;
  no_fiscal: boolean;
};

export type CfdiEntrada = {
  id: string;
  uuid: string | null;
  fecha: string;
  total_centavos: number;
  /** Emitido por el contribuyente (ingreso) o recibido (egreso). */
  direccion: "emitido" | "recibido";
  tipo_cfdi: string | null;
  metodo_pago: string | null;
  estatus_sat: string | null;
  moneda: string | null;
  rfc_contraparte: string | null;
  nombre_contraparte: string | null;
};

export type ParametrosMotor = {
  /** Ventana de días naturales alrededor de la fecha del comprobante. */
  dias_ventana: number;
  /** Tolerancia en CENTAVOS enteros. Nunca porcentaje flotante. */
  tolerancia_centavos: number;
};

export const PARAMETROS_POR_DEFECTO: ParametrosMotor = {
  dias_ventana: 5,
  tolerancia_centavos: 0,
};

export type GrupoPropuesto = {
  tipo: "uno_a_uno";
  origen: OrigenConciliacion;
  /** El motor sólo puede producir "propuesto" o "confirmado" automático. */
  estado: "propuesto" | "confirmado";
  movimiento_id: string;
  cfdi_id: string;
  importe_banco_centavos: number;
  importe_cfdi_centavos: number;
  diferencia_centavos: number;
  probabilidad_bp: number;
  evidencia: EvidenciaConciliacion;
  idempotency_key: string;
  motivo: string;
};

export type ExclusionMotor = {
  cfdi_id: string;
  codigo: "cancelado" | "complemento_pago" | "ppd_sin_complemento" | "traslado" | "importe_cero";
  detalle: string;
};

export type ResultadoMotor = {
  version: string;
  parametros: ParametrosMotor;
  grupos: GrupoPropuesto[];
  /** Movimientos evaluables que no obtuvieron ningún candidato. */
  movimientos_sin_candidato: string[];
  /** CFDI evaluables que quedaron sin movimiento. */
  cfdi_sin_movimiento: string[];
  /** Documentos que este bloque no puede conciliar todavía. */
  exclusiones: ExclusionMotor[];
  metricas: {
    movimientos_evaluados: number;
    cfdi_evaluados: number;
    propuestos: number;
    automaticos: number;
    ambiguos: number;
  };
};

export type EntradaMotor = {
  movimientos: MovimientoEntrada[];
  cfdi: CfdiEntrada[];
  /** Movimientos ya reservados por un grupo activo. */
  movimientos_bloqueados?: string[];
  /** CFDI ya reservados por un grupo activo. */
  cfdi_bloqueados?: string[];
  /** Parejas "movimientoId|cfdiId" rechazadas: no se vuelven a proponer. */
  pares_rechazados?: string[];
  parametros?: Partial<ParametrosMotor>;
};

// ── Normalización de texto ──────────────────────────────────────────────────

export function normalizaTexto(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function diasEntre(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((da - db) / 86400000));
}

// ── Exclusiones del Bloque 1 ────────────────────────────────────────────────

export function excluirCfdi(c: CfdiEntrada): ExclusionMotor | null {
  const estatus = (c.estatus_sat ?? "").toLowerCase();
  if (estatus === "cancelado") {
    return { cfdi_id: c.id, codigo: "cancelado", detalle: "Comprobante cancelado ante el SAT: no es candidato activo." };
  }
  const tipo = (c.tipo_cfdi ?? "").toUpperCase();
  if (tipo === "P") {
    return {
      cfdi_id: c.id,
      codigo: "complemento_pago",
      detalle: "Complemento de pago: queda fuera del Bloque 1 y se resolverá en el Bloque 2. No se compara usando Total = 0.",
    };
  }
  if (tipo === "T") {
    return { cfdi_id: c.id, codigo: "traslado", detalle: "Comprobante de traslado: no representa flujo de efectivo." };
  }
  if ((c.metodo_pago ?? "").toUpperCase() === "PPD") {
    return {
      cfdi_id: c.id,
      codigo: "ppd_sin_complemento",
      detalle: "Pago en parcialidades o diferido sin complemento: no se fuerza una coincidencia en el Bloque 1.",
    };
  }
  if (c.total_centavos <= 0) {
    return { cfdi_id: c.id, codigo: "importe_cero", detalle: "Importe cero: no es conciliable contra un movimiento bancario." };
  }
  return null;
}

// ── Señales ─────────────────────────────────────────────────────────────────

type Senales = {
  importe_coincide: boolean;
  diferencia_centavos: number;
  dias: number;
  referencia: boolean;
  uuid: boolean;
  contraparte: boolean;
  moneda: boolean;
};

function evaluaSenales(m: MovimientoEntrada, c: CfdiEntrada): Senales {
  const diferencia = m.importe_centavos - c.total_centavos;
  const desc = normalizaTexto(m.descripcion);
  const ref = normalizaTexto(m.referencia);
  const texto = `${desc}${ref}`;

  const uuidPlano = normalizaTexto(c.uuid);
  // Fragmento inequívoco: los últimos 8 caracteres del folio fiscal.
  const cola = uuidPlano.length >= 8 ? uuidPlano.slice(-8) : "";
  const uuidCoincide = !!cola && texto.includes(cola);

  const rfc = normalizaTexto(c.rfc_contraparte);
  const nombre = normalizaTexto(c.nombre_contraparte);
  const contraparte =
    (!!rfc && rfc.length >= 12 && texto.includes(rfc)) ||
    (!!nombre && nombre.length >= 8 && texto.includes(nombre.slice(0, 12)));

  // La referencia sólo cuenta cuando el banco trae una referencia propia y
  // aparece en el comprobante o viceversa; nunca por coincidencia trivial.
  const referencia = !!ref && ref.length >= 6 && (uuidCoincide || (!!cola && ref.includes(cola)) || (!!rfc && ref.includes(rfc)));

  const monedaMov = (m.moneda ?? "MXN").toUpperCase();
  const monedaCfdi = (c.moneda ?? "MXN").toUpperCase();

  return {
    importe_coincide: diferencia === 0,
    diferencia_centavos: diferencia,
    dias: diasEntre(m.fecha, c.fecha),
    referencia,
    uuid: uuidCoincide,
    contraparte,
    moneda: monedaMov === monedaCfdi,
  };
}

/** Puntaje entero en puntos base (0–10000). Sin aritmética flotante frágil. */
export function puntaje(s: Senales, p: ParametrosMotor): number {
  let bp = 0;
  bp += s.importe_coincide ? 4000 : Math.max(0, 2500 - Math.abs(s.diferencia_centavos));
  const ventana = Math.max(1, p.dias_ventana);
  bp += Math.max(0, 1500 - Math.round((s.dias * 1500) / ventana));
  if (s.uuid) bp += 2000;
  if (s.referencia) bp += 1200;
  if (s.contraparte) bp += 1200;
  if (s.moneda) bp += 100;
  return Math.max(0, Math.min(10000, bp));
}

function senalesFuertes(s: Senales): number {
  return (s.uuid ? 1 : 0) + (s.referencia ? 1 : 0) + (s.contraparte ? 1 : 0);
}

// ── Motor ───────────────────────────────────────────────────────────────────

export function conciliarUnoAUno(entrada: EntradaMotor): ResultadoMotor {
  const p: ParametrosMotor = { ...PARAMETROS_POR_DEFECTO, ...(entrada.parametros ?? {}) };
  const movBloqueados = new Set(entrada.movimientos_bloqueados ?? []);
  const cfdiBloqueados = new Set(entrada.cfdi_bloqueados ?? []);
  const rechazados = new Set(entrada.pares_rechazados ?? []);

  const exclusiones: ExclusionMotor[] = [];
  const cfdiActivos: CfdiEntrada[] = [];
  for (const c of [...entrada.cfdi].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (cfdiBloqueados.has(c.id)) continue;
    const ex = excluirCfdi(c);
    if (ex) {
      exclusiones.push(ex);
      continue;
    }
    cfdiActivos.push(c);
  }

  // Orden determinista de proceso: fecha, importe, id.
  const movimientos = [...entrada.movimientos]
    .filter((m) => !m.ignorado && !m.no_fiscal && !movBloqueados.has(m.id) && m.importe_centavos > 0)
    .sort((a, b) =>
      a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1
      : a.importe_centavos - b.importe_centavos || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

  const usados = new Set<string>();
  const grupos: GrupoPropuesto[] = [];
  const sinCandidato: string[] = [];
  let ambiguos = 0;

  for (const m of movimientos) {
    const direccionEsperada = m.direccion === "abono" ? "emitido" : "recibido";

    type Cand = { c: CfdiEntrada; s: Senales; bp: number };
    const candidatos: Cand[] = [];
    for (const c of cfdiActivos) {
      // El CFDI ya se usó en ESTA misma corrida: se consulta el conjunto vivo.
      if (usados.has(c.id)) continue;
      if (c.direccion !== direccionEsperada) continue;
      if (rechazados.has(`${m.id}|${c.id}`)) continue;
      const s = evaluaSenales(m, c);
      if (s.dias > p.dias_ventana) continue;
      if (Math.abs(s.diferencia_centavos) > p.tolerancia_centavos) continue;
      candidatos.push({ c, s, bp: puntaje(s, p) });
    }

    if (candidatos.length === 0) {
      sinCandidato.push(m.id);
      continue;
    }

    candidatos.sort((a, b) => b.bp - a.bp || (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0));
    const mejor = candidatos[0];
    const empate = candidatos.length > 1 && candidatos[1].bp === mejor.bp;
    const alternativos = candidatos.slice(1).map((x) => x.c.id);
    const fuertes = senalesFuertes(mejor.s);

    // Confirmación automática: candidato único, importe exacto al centavo,
    // dirección correcta y al menos dos señales independientes fuertes.
    const automatico =
      candidatos.length === 1 && !empate && mejor.s.importe_coincide && fuertes >= 2;

    if (empate) ambiguos += 1;
    else if (!automatico && candidatos.length > 1) ambiguos += 1;

    const evidencia: EvidenciaConciliacion = {
      importe_coincide: mejor.s.importe_coincide,
      diferencia_centavos: mejor.s.diferencia_centavos,
      dias_separacion: mejor.s.dias,
      direccion: m.direccion === "abono" ? "ingreso" : "egreso",
      direccion_coincide: true,
      referencia_coincide: mejor.s.referencia,
      uuid_coincide: mejor.s.uuid,
      contraparte_coincide: mejor.s.contraparte,
      moneda_coincide: mejor.s.moneda,
      candidatos_alternativos: alternativos.length,
      candidatos_alternativos_ids: alternativos,
      senales_fuertes: fuertes,
      regla: automatico ? "unico_exacto_dos_senales" : empate ? "empate_requiere_revision" : "candidato_para_revision",
      version: ALGORITMO_VERSION,
    };

    usados.add(mejor.c.id);
    grupos.push({
      tipo: "uno_a_uno",
      origen: "motor",
      estado: automatico ? "confirmado" : "propuesto",
      movimiento_id: m.id,
      cfdi_id: mejor.c.id,
      importe_banco_centavos: m.importe_centavos,
      importe_cfdi_centavos: mejor.c.total_centavos,
      diferencia_centavos: mejor.s.diferencia_centavos,
      probabilidad_bp: mejor.bp,
      evidencia,
      idempotency_key: `1a1:${m.id}:${mejor.c.id}`,
      motivo: automatico
        ? "Coincidencia automática: candidato único, importe exacto y dos señales fuertes independientes."
        : empate
          ? "Varios comprobantes empatan con este movimiento: requiere revisión humana."
          : "Candidato con evidencia insuficiente para confirmar automáticamente: requiere revisión humana.",
    });
  }

  const asignados = new Set(grupos.map((g) => g.cfdi_id));
  const cfdiSinMovimiento = cfdiActivos.filter((c) => !asignados.has(c.id)).map((c) => c.id);

  return {
    version: ALGORITMO_VERSION,
    parametros: p,
    grupos,
    movimientos_sin_candidato: sinCandidato,
    cfdi_sin_movimiento: cfdiSinMovimiento,
    exclusiones,
    metricas: {
      movimientos_evaluados: movimientos.length,
      cfdi_evaluados: cfdiActivos.length,
      propuestos: grupos.filter((g) => g.estado === "propuesto").length,
      automaticos: grupos.filter((g) => g.estado === "confirmado").length,
      ambiguos,
    },
  };
}

/** Huella estable del insumo: dos corridas con el mismo insumo comparten hash. */
export function huellaEntrada(entrada: EntradaMotor, periodo: string): string {
  const p: ParametrosMotor = { ...PARAMETROS_POR_DEFECTO, ...(entrada.parametros ?? {}) };
  const partes = [
    `p=${periodo}`,
    `v=${ALGORITMO_VERSION}`,
    `d=${p.dias_ventana}`,
    `t=${p.tolerancia_centavos}`,
    "m=" + [...entrada.movimientos].map((m) => `${m.id}:${m.fecha}:${m.importe_centavos}:${m.direccion}:${m.ignorado ? 1 : 0}${m.no_fiscal ? 1 : 0}`).sort().join(","),
    "c=" + [...entrada.cfdi].map((c) => `${c.id}:${c.fecha}:${c.total_centavos}:${c.direccion}:${c.estatus_sat ?? ""}`).sort().join(","),
    "bm=" + [...(entrada.movimientos_bloqueados ?? [])].sort().join(","),
    "bc=" + [...(entrada.cfdi_bloqueados ?? [])].sort().join(","),
    "r=" + [...(entrada.pares_rechazados ?? [])].sort().join(","),
  ].join("|");
  // FNV-1a de 64 bits en hexadecimal: determinista y sin dependencias.
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < partes.length; i += 1) {
    h ^= BigInt(partes.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}
