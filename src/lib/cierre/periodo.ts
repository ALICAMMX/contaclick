// ─────────────────────────────────────────────────────────────────────────────
// EVALUACIÓN DEL PERIODO — servicio PURO.
//
// Recibe los documentos ya normalizados del expediente y devuelve contadores,
// excepciones y el estado de los criterios de "Documentos listos".
// No consulta la base, no llama al SAT y no usa IA: la ruta y las funciones
// servidoras sólo cargan filas y delegan aquí.
// ─────────────────────────────────────────────────────────────────────────────

import { clasificarDocumento, type ClaseDocumental, type Direccion } from "@/lib/cfdi/clasificacion";
import { MOTIVOS_EXCEPCION, type CodigoExcepcion, type SeveridadExcepcion } from "./motivos";

export type DocumentoPeriodo = {
  id: string;
  uuid: string | null;
  tipo_cfdi: string | null;
  rfc_emisor: string | null;
  rfc_receptor: string | null;
  metodo_pago: string | null;
  estatus_sat: string | null;
  fecha: string | null;
  periodo: string | null;
  total: number | null;
  moneda: string | null;
  archivo_hash: string | null;
  detalle_reconstruible?: boolean;
  avisos?: string[];
  /** Fecha de carga; sirve para "nuevos desde la última revisión". */
  fecha_carga?: string | null;
};

export type DocumentoPagoPeriodo = {
  /** CFDI tipo P que contiene el pago. */
  cfdi_id: string;
  numero_pago: number;
  monto: number | null;
  documentos: Array<{
    id_documento: string;
    num_parcialidad: number | null;
    imp_saldo_ant: number | null;
    imp_pagado: number | null;
    imp_saldo_insoluto: number | null;
  }>;
};

export type ExcepcionCalculada = {
  codigo: CodigoExcepcion;
  cfdi_id: string | null;
  titulo: string;
  severidad: "bloqueante" | "advertencia" | "informativa";
  detalle: Record<string, unknown>;
};

export type ContadoresPeriodo = {
  total: number;
  emitidos: number;
  recibidos: number;
  ajenos: number;
  nuevos: number;
  porClase: Record<ClaseDocumental, number>;
  pue: number;
  ppd: number;
  ppdSinComplemento: number;
  pagosHuerfanos: number;
  duplicados: number;
  rechazados: number;
  estatusDesconocido: number;
  pendientesDecision: number;
  coberturaDocumental: number;
};

export type CriterioListo = { id: string; etiqueta: string; cumplido: boolean; detalle: string };

export type EvaluacionPeriodo = {
  contadores: ContadoresPeriodo;
  excepciones: ExcepcionCalculada[];
  criterios: CriterioListo[];
  puedeDeclararse: boolean;
};

const CLASES: ClaseDocumental[] = [
  "ingreso", "gasto", "nota_credito_emitida", "nota_credito_recibida", "nomina", "pago", "traslado", "indeterminado",
];

const up = (v: string | null | undefined) => String(v ?? "").trim().toUpperCase();

// ─────────────────────────────────────────────────────────────────────────────
// RANGO MENSUAL — FUENTE ÚNICA.
//
// Todo el sistema (lecturas, reproceso, contadores) debe usar `rangoMensual`.
// El mes se define en hora local de America/Mexico_City y se traduce a UTC:
// un CFDI emitido el último segundo del mes pertenece a ese mes, y uno emitido
// el 1° a las 00:00 locales pertenece al siguiente. El desplazamiento se
// calcula con la propia zona, así que los periodos con horario de verano
// histórico (anteriores a 2022) también quedan correctos.
// ─────────────────────────────────────────────────────────────────────────────

export const ZONA_FISCAL = "America/Mexico_City";

function desplazamientoMinutos(instante: Date, zona = ZONA_FISCAL): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instante)) if (part.type !== "literal") p[part.type] = part.value;
  const comoUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return (comoUtc - instante.getTime()) / 60000;
}

/** Convierte una fecha/hora LOCAL de la zona fiscal al instante UTC equivalente. */
export function localAUtc(
  y: number,
  m: number,
  d: number,
  h = 0,
  min = 0,
  s = 0,
  zona = ZONA_FISCAL,
): Date {
  const supuesto = Date.UTC(y, m - 1, d, h, min, s);
  let ts = supuesto - desplazamientoMinutos(new Date(supuesto), zona) * 60000;
  ts = supuesto - desplazamientoMinutos(new Date(ts), zona) * 60000;
  return new Date(ts);
}

export type RangoMensual = {
  periodo: string;
  zona: string;
  /** Inicio inclusivo, en UTC. */
  desde: string;
  /** Fin EXCLUSIVO (00:00 local del mes siguiente), en UTC. */
  hastaExclusivo: string;
  /** Último instante que pertenece al mes (23:59:59 local), en UTC. */
  ultimoInstante: string;
  /** Días naturales del mes: 28, 29, 30 o 31. */
  dias: number;
};

export function rangoMensual(periodo: string, zona = ZONA_FISCAL): RangoMensual {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodo);
  if (!m) throw new Error(`Periodo inválido: "${periodo}". Se espera AAAA-MM.`);
  const y = Number(m[1]);
  const mes = Number(m[2]);
  const sigY = mes === 12 ? y + 1 : y;
  const sigM = mes === 12 ? 1 : mes + 1;

  const desde = localAUtc(y, mes, 1, 0, 0, 0, zona);
  const hasta = localAUtc(sigY, sigM, 1, 0, 0, 0, zona);
  const dias = Math.round((Date.UTC(sigY, sigM - 1, 1) - Date.UTC(y, mes - 1, 1)) / 86400000);

  return {
    periodo,
    zona,
    desde: desde.toISOString(),
    hastaExclusivo: hasta.toISOString(),
    ultimoInstante: new Date(hasta.getTime() - 1000).toISOString(),
    dias,
  };
}

export function periodoDeFecha(fechaIso: string | null | undefined, zona = ZONA_FISCAL): string | null {
  if (!fechaIso) return null;
  const d = new Date(fechaIso);
  if (Number.isNaN(d.getTime())) return null;
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit" }).format(d);
  return f.slice(0, 7);
}


export function evaluarPeriodo(args: {
  rfcExpediente: string;
  periodo: string;
  /** Documentos del periodo. */
  documentos: DocumentoPeriodo[];
  /** UUIDs conocidos del expediente completo (para localizar facturas padre fuera del periodo). */
  universoUuids?: Array<{ uuid: string; rfc_emisor: string | null; cliente_id?: string | null }>;
  pagos: DocumentoPagoPeriodo[];
  /** Excepciones ya decididas: código+cfdi_id → estado. */
  decisiones?: Array<{ codigo: string; cfdi_id: string | null; estado: string }>;
  corte?: { corte_at: string | null; direcciones: string[]; ultima_revision_at?: string | null };
}): EvaluacionPeriodo {
  const { rfcExpediente, documentos, pagos } = args;
  const excepciones: ExcepcionCalculada[] = [];
  const porClase = Object.fromEntries(CLASES.map((c) => [c, 0])) as Record<ClaseDocumental, number>;

  const clasificados = documentos.map((d) => ({
    doc: d,
    cls: clasificarDocumento(d, { rfcExpediente }),
  }));

  const uuidsExpediente = new Map<string, { rfc_emisor: string | null }>();
  for (const u of args.universoUuids ?? []) uuidsExpediente.set(up(u.uuid), { rfc_emisor: u.rfc_emisor });
  for (const { doc } of clasificados) if (doc.uuid) uuidsExpediente.set(up(doc.uuid), { rfc_emisor: doc.rfc_emisor });

  // ── Duplicados ────────────────────────────────────────────────────────────
  const porUuid = new Map<string, string[]>();
  const porHash = new Map<string, string[]>();
  for (const { doc } of clasificados) {
    if (doc.uuid) porUuid.set(up(doc.uuid), [...(porUuid.get(up(doc.uuid)) ?? []), doc.id]);
    if (doc.archivo_hash) porHash.set(doc.archivo_hash, [...(porHash.get(doc.archivo_hash) ?? []), doc.id]);
  }
  const idsDuplicados = new Set<string>();
  for (const [clave, ids] of [...porUuid, ...porHash]) {
    if (ids.length > 1) {
      ids.forEach((id) => idsDuplicados.add(id));
      excepciones.push({
        codigo: "DUPLICADO",
        cfdi_id: ids[0]!,
        titulo: MOTIVOS_EXCEPCION.DUPLICADO.titulo,
        severidad: "bloqueante",
        detalle: { clave, ocurrencias: ids.length, cfdi_ids: ids },
      });
    }
  }

  // ── Pagos: relación con la factura padre ─────────────────────────────────
  const uuidsPagados = new Set<string>();
  for (const p of pagos) {
    for (const d of p.documentos) {
      const u = up(d.id_documento);
      uuidsPagados.add(u);
      const padre = uuidsExpediente.get(u);
      if (!padre) {
        excepciones.push({
          codigo: "PAGO_HUERFANO",
          cfdi_id: p.cfdi_id,
          titulo: MOTIVOS_EXCEPCION.PAGO_HUERFANO.titulo,
          severidad: "bloqueante",
          detalle: { uuid_pagado: u, numero_pago: p.numero_pago, imp_pagado: d.imp_pagado },
        });
      }
      const ant = d.imp_saldo_ant, pag = d.imp_pagado, ins = d.imp_saldo_insoluto;
      const inconsistente =
        (ant != null && pag != null && pag - ant > 0.01) ||
        (ant != null && pag != null && ins != null && Math.abs(ant - pag - ins) > 0.01);
      if (inconsistente) {
        excepciones.push({
          codigo: "PAGO_MONTO_INCONSISTENTE",
          cfdi_id: p.cfdi_id,
          titulo: MOTIVOS_EXCEPCION.PAGO_MONTO_INCONSISTENTE.titulo,
          severidad: "bloqueante",
          detalle: { uuid_pagado: u, imp_saldo_ant: ant, imp_pagado: pag, imp_saldo_insoluto: ins, num_parcialidad: d.num_parcialidad },
        });
      }
    }
  }

  // ── Excepciones por documento ────────────────────────────────────────────
  let estatusDesconocido = 0;
  let ppdSinComplemento = 0;
  for (const { doc, cls } of clasificados) {
    porClase[cls.clase] += 1;
    if (cls.estatus_sat === "desconocido") estatusDesconocido += 1;

    if (cls.motivos.some((m) => m.codigo === "RFC_AJENO")) {
      excepciones.push({
        codigo: "RFC_AJENO",
        cfdi_id: doc.id,
        titulo: MOTIVOS_EXCEPCION.RFC_AJENO.titulo,
        severidad: "bloqueante",
        detalle: { uuid: doc.uuid, emisor: doc.rfc_emisor, receptor: doc.rfc_receptor, rfc_expediente: rfcExpediente },
      });
    }
    if (cls.motivos.some((m) => m.codigo === "SIN_UUID" || m.codigo === "SIN_RFC")) {
      excepciones.push({
        codigo: "PARSEO_FALLIDO",
        cfdi_id: doc.id,
        titulo: MOTIVOS_EXCEPCION.PARSEO_FALLIDO.titulo,
        severidad: "bloqueante",
        detalle: { motivos: cls.motivos.map((m) => m.mensaje) },
      });
    }
    if (cls.estatus_sat === "cancelado") {
      excepciones.push({
        codigo: "CANCELADO_SAT",
        cfdi_id: doc.id,
        titulo: MOTIVOS_EXCEPCION.CANCELADO_SAT.titulo,
        severidad: "advertencia",
        detalle: { uuid: doc.uuid, total: doc.total },
      });
    }
    if (doc.detalle_reconstruible === false) {
      excepciones.push({
        codigo: "DETALLE_NO_RECONSTRUIBLE",
        cfdi_id: doc.id,
        titulo: MOTIVOS_EXCEPCION.DETALLE_NO_RECONSTRUIBLE.titulo,
        severidad: "informativa",
        detalle: { uuid: doc.uuid },
      });
    }
    const esFactura = cls.clase === "ingreso" || cls.clase === "gasto";
    if (esFactura && cls.metodo === "PPD" && doc.uuid && !uuidsPagados.has(up(doc.uuid))) {
      ppdSinComplemento += 1;
      excepciones.push({
        codigo: "PPD_SIN_COMPLEMENTO",
        cfdi_id: doc.id,
        titulo: MOTIVOS_EXCEPCION.PPD_SIN_COMPLEMENTO.titulo,
        severidad: "advertencia",
        detalle: { uuid: doc.uuid, total: doc.total, direccion: cls.direccion },
      });
    }
  }

  if (estatusDesconocido > 0) {
    excepciones.push({
      codigo: "ESTATUS_SAT_DESCONOCIDO",
      cfdi_id: null,
      titulo: MOTIVOS_EXCEPCION.ESTATUS_SAT_DESCONOCIDO.titulo,
      severidad: "informativa",
      detalle: { comprobantes: estatusDesconocido },
    });
  }

  // ── Corte documentado ────────────────────────────────────────────────────
  const direcciones = args.corte?.direcciones ?? [];
  const corteOk = !!args.corte?.corte_at && direcciones.length > 0;
  if (!corteOk) {
    excepciones.push({
      codigo: "CORTE_NO_DOCUMENTADO",
      cfdi_id: null,
      titulo: MOTIVOS_EXCEPCION.CORTE_NO_DOCUMENTADO.titulo,
      severidad: "bloqueante",
      detalle: { corte_at: args.corte?.corte_at ?? null, direcciones },
    });
  }

  // ── Decisiones humanas previas ───────────────────────────────────────────
  // Sólo cuentan las ocurrencias ACTUALMENTE pendientes: una ocurrencia
  // histórica (cerrada automáticamente o ya decidida) no puede tapar una nueva.
  const decision = new Map<string, string>();
  for (const d of args.decisiones ?? []) {
    const k = `${d.codigo}|${d.cfdi_id ?? ""}`;
    if (decision.get(k) === "pendiente") continue;
    decision.set(k, d.estado);
  }
  const pendiente = (e: ExcepcionCalculada) => {
    const estado = decision.get(`${e.codigo}|${e.cfdi_id ?? ""}`) ?? "pendiente";
    return estado === "pendiente";
  };

  const bloqueantesPendientes = excepciones.filter((e) => MOTIVOS_EXCEPCION[e.codigo].bloquea && pendiente(e));
  // CRITERIO ÚNICO: ninguna excepción pendiente —sea bloqueante, advertencia o
  // informativa— permite declarar "Documentos listos". Las advertencias e
  // informativas se resuelven o se aceptan con motivo; nunca se ignoran solas.
  const todasPendientes = excepciones.filter((e) => pendiente(e));
  const porSeveridad = (s: SeveridadExcepcion) =>
    todasPendientes.filter((e) => MOTIVOS_EXCEPCION[e.codigo].severidad === s).length;

  const cuenta = (c: CodigoExcepcion) => excepciones.filter((e) => e.codigo === c && pendiente(e)).length;

  const criterios: CriterioListo[] = [
    {
      id: "parseo",
      etiqueta: "Sin errores de lectura del XML",
      cumplido: cuenta("PARSEO_FALLIDO") === 0,
      detalle: `${cuenta("PARSEO_FALLIDO")} comprobante(s) sin UUID o sin RFC`,
    },
    {
      id: "rfc_ajeno",
      etiqueta: "Sin CFDI ajenos al RFC del expediente",
      cumplido: cuenta("RFC_AJENO") === 0,
      detalle: `${cuenta("RFC_AJENO")} comprobante(s) ajenos`,
    },
    {
      id: "relaciones",
      etiqueta: "Relaciones PPD/Pago consistentes o justificadas",
      cumplido: cuenta("PAGO_HUERFANO") + cuenta("PAGO_MONTO_INCONSISTENTE") + cuenta("PAGO_EMISOR_INCONSISTENTE") === 0,
      detalle: `${cuenta("PAGO_HUERFANO")} pago(s) huérfanos · ${cuenta("PAGO_MONTO_INCONSISTENTE")} con importes inconsistentes`,
    },
    {
      id: "duplicados",
      etiqueta: "Duplicados con decisión registrada",
      cumplido: cuenta("DUPLICADO") === 0,
      detalle: `${cuenta("DUPLICADO")} grupo(s) duplicados sin decisión`,
    },
    {
      id: "corte",
      etiqueta: "Direcciones descargadas y fecha de corte documentadas",
      cumplido: corteOk,
      detalle: corteOk ? `${direcciones.join(" y ")} · corte ${args.corte?.corte_at}` : "Sin registrar",
    },
    {
      id: "excepciones",
      etiqueta: "Toda excepción resuelta o aceptada con motivo por un contador",
      cumplido: todasPendientes.length === 0,
      detalle:
        todasPendientes.length === 0
          ? "Sin excepciones pendientes"
          : `${todasPendientes.length} pendiente(s): ${porSeveridad("bloqueante")} bloqueante(s) · ${porSeveridad("advertencia")} advertencia(s) · ${porSeveridad("informativa")} informativa(s)`,
    },
  ];


  const emitidos = clasificados.filter((c) => c.cls.direccion === "emitido").length;
  const recibidos = clasificados.filter((c) => c.cls.direccion === "recibido").length;
  const ajenos = clasificados.filter((c) => c.cls.direccion === "ajeno").length;
  const rechazados = clasificados.filter((c) => c.cls.estado_procesamiento === "rechazado").length;
  const revision = clasificados.filter((c) => c.cls.estado_procesamiento === "requiere_revision").length;
  const desdeRevision = args.corte?.ultima_revision_at ? new Date(args.corte.ultima_revision_at).getTime() : null;
  const nuevos = desdeRevision
    ? documentos.filter((d) => d.fecha_carga && new Date(d.fecha_carga).getTime() > desdeRevision).length
    : documentos.length;

  const total = documentos.length;
  const listos = clasificados.filter((c) => c.cls.estado_procesamiento === "listo").length;

  const contadores: ContadoresPeriodo = {
    total,
    emitidos,
    recibidos,
    ajenos,
    nuevos,
    porClase,
    pue: clasificados.filter((c) => c.cls.metodo === "PUE").length,
    ppd: clasificados.filter((c) => c.cls.metodo === "PPD").length,
    ppdSinComplemento,
    pagosHuerfanos: excepciones.filter((e) => e.codigo === "PAGO_HUERFANO").length,
    duplicados: idsDuplicados.size,
    rechazados,
    estatusDesconocido,
    pendientesDecision: todasPendientes.length + revision,
    coberturaDocumental: total === 0 ? 0 : Math.round((listos / total) * 100),
  };

  return {
    contadores,
    excepciones,
    criterios,
    puedeDeclararse: criterios.every((c) => c.cumplido) && total > 0,
  };
}
