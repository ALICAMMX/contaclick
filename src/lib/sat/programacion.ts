// =====================================================================
// Programación de Descargas Masivas SAT — módulo PURO.
//
// Calcula CUÁNDO ContaClick debe enviar la solicitud al SAT. No promete
// nada sobre cuándo el SAT entregará los paquetes: el servicio es
// asíncrono y su tiempo de preparación no es controlable.
//
// Sin red, sin base de datos: todo aquí es determinista y probable.
// =====================================================================

export const ZONA_PREDETERMINADA = "America/Mexico_City";

export const AVISO_ASINCRONO =
  "ContaClick enviará la solicitud aproximadamente a esta hora. El SAT procesa " +
  "las descargas de forma asíncrona y puede tardar en entregar los XML.";

export type TipoProgramacion = "unica" | "recurrente";
export type Recurrencia = "diaria" | "semanal" | "mensual";
export type PoliticaRetraso = "recuperar" | "omitir";

export type PeriodoOpcion =
  | "dia_anterior"
  | "ultimos_3"
  | "ultimos_7"
  | "mes_anterior"
  | "desde_ultima"
  | "rango_fijo";

export const PERIODO_LABEL: Record<PeriodoOpcion, string> = {
  dia_anterior: "Día anterior",
  ultimos_3: "Últimos 3 días",
  ultimos_7: "Últimos 7 días",
  mes_anterior: "Mes anterior completo",
  desde_ultima: "Desde la última descarga exitosa",
  rango_fijo: "Rango fijo (sólo ejecución única)",
};

/** Estados visibles de una ocurrencia programada. */
export type EstadoOcurrencia =
  | "programada"
  | "en_cola"
  | "enviada"
  | "esperando_sat"
  | "completada"
  | "omitida"
  | "retrasada"
  | "fallida"
  | "pausada";

export const ESTADO_OCURRENCIA_LABEL: Record<EstadoOcurrencia, string> = {
  programada: "Programada",
  en_cola: "En cola",
  enviada: "Enviada al SAT",
  esperando_sat: "Esperando al SAT",
  completada: "Completada",
  omitida: "Omitida",
  retrasada: "Retrasada",
  fallida: "Fallida",
  pausada: "Pausada",
};

export type ReglaProgramacion = {
  zona_horaria: string;
  tipo: TipoProgramacion;
  recurrencia: Recurrencia | null;
  /** 0 = domingo … 6 = sábado. Sólo para recurrencia semanal. */
  dias_semana: number[] | null;
  /** 1–31; 31 se interpreta como "último día del mes". */
  dia_mes: number | null;
  hora: number;
  minuto: number;
  /** AAAA-MM-DD, sólo para ejecución única. */
  fecha_unica: string | null;
};

// ---------------------------------------------------------------------
// Conversión zona IANA ⇄ UTC
// ---------------------------------------------------------------------

function partesEn(tz: string, d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return {
    anio: Number(g("year")),
    mes: Number(g("month")),
    dia: Number(g("day")),
    hora: Number(g("hour")) % 24,
    minuto: Number(g("minute")),
    segundo: Number(g("second")),
  };
}

/** Desfase de la zona respecto de UTC, en minutos, en ese instante. */
export function desfaseMinutos(tz: string, d: Date): number {
  const p = partesEn(tz, d);
  const comoUtc = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return Math.round((comoUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** Instante UTC que corresponde a una hora de pared en la zona indicada. */
export function horaLocalAUtc(
  tz: string,
  anio: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
): Date {
  const tentativo = Date.UTC(anio, mes - 1, dia, hora, minuto, 0);
  let d = new Date(tentativo - desfaseMinutos(tz, new Date(tentativo)) * 60000);
  // Segunda pasada: corrige los saltos de horario de verano.
  d = new Date(tentativo - desfaseMinutos(tz, d) * 60000);
  return d;
}

/** Componentes de calendario locales de un instante. */
export function calendarioLocal(tz: string, d: Date) {
  const p = partesEn(tz, d);
  const diaSemana = new Date(Date.UTC(p.anio, p.mes - 1, p.dia)).getUTCDay();
  return { ...p, dia_semana: diaSemana };
}

export function fechaLocal(tz: string, d: Date): string {
  const p = partesEn(tz, d);
  return `${p.anio}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function sumarDiasLocal(anio: number, mes: number, dia: number, n: number) {
  const d = new Date(Date.UTC(anio, mes - 1, dia + n));
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

// ---------------------------------------------------------------------
// Próxima ejecución
// ---------------------------------------------------------------------

/**
 * Próxima ocurrencia estrictamente posterior a `desde`.
 * Devuelve null cuando la programación ya no tiene ocurrencias futuras
 * (ejecución única cuya fecha ya pasó, o regla incompleta).
 */
export function proximaEjecucion(regla: ReglaProgramacion, desde: Date = new Date()): Date | null {
  const tz = regla.zona_horaria || ZONA_PREDETERMINADA;
  const hora = clamp(regla.hora, 0, 23);
  const minuto = clamp(regla.minuto, 0, 59);

  if (regla.tipo === "unica") {
    if (!regla.fecha_unica) return null;
    const [a, m, d] = regla.fecha_unica.split("-").map(Number);
    if (!a || !m || !d) return null;
    const inst = horaLocalAUtc(tz, a, m, d, hora, minuto);
    return inst.getTime() > desde.getTime() ? inst : null;
  }

  const hoy = calendarioLocal(tz, desde);

  if (regla.recurrencia === "diaria") {
    for (let i = 0; i <= 2; i++) {
      const c = sumarDiasLocal(hoy.anio, hoy.mes, hoy.dia, i);
      const inst = horaLocalAUtc(tz, c.anio, c.mes, c.dia, hora, minuto);
      if (inst.getTime() > desde.getTime()) return inst;
    }
    return null;
  }

  if (regla.recurrencia === "semanal") {
    const dias = (regla.dias_semana ?? []).filter((n) => n >= 0 && n <= 6);
    if (dias.length === 0) return null;
    for (let i = 0; i <= 14; i++) {
      const c = sumarDiasLocal(hoy.anio, hoy.mes, hoy.dia, i);
      const dow = new Date(Date.UTC(c.anio, c.mes - 1, c.dia)).getUTCDay();
      if (!dias.includes(dow)) continue;
      const inst = horaLocalAUtc(tz, c.anio, c.mes, c.dia, hora, minuto);
      if (inst.getTime() > desde.getTime()) return inst;
    }
    return null;
  }

  if (regla.recurrencia === "mensual") {
    const pedido = clamp(regla.dia_mes ?? 1, 1, 31);
    for (let i = 0; i <= 24; i++) {
      const anio = hoy.anio + Math.floor((hoy.mes - 1 + i) / 12);
      const mes = ((hoy.mes - 1 + i) % 12) + 1;
      // Meses cortos: el día pedido se ajusta al último día real del mes.
      const dia = Math.min(pedido, diasDelMes(anio, mes));
      const inst = horaLocalAUtc(tz, anio, mes, dia, hora, minuto);
      if (inst.getTime() > desde.getTime()) return inst;
    }
    return null;
  }

  return null;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

// ---------------------------------------------------------------------
// Política de retraso
// ---------------------------------------------------------------------

export type DecisionOcurrencia = {
  accion: "ejecutar" | "omitir";
  retraso_ms: number;
  motivo: string;
};

/**
 * Qué hacer con una ocurrencia cuya hora ya pasó.
 * Nunca se acumulan varias ocurrencias: se recupera como máximo UNA y
 * después se recalcula la siguiente.
 */
export function decidirOcurrencia(args: {
  programada_at: Date;
  ahora: Date;
  tolerancia_minutos: number;
  politica: PoliticaRetraso;
}): DecisionOcurrencia {
  const retraso = Math.max(0, args.ahora.getTime() - args.programada_at.getTime());
  const tol = Math.max(0, args.tolerancia_minutos) * 60000;
  // Dentro de la tolerancia la ocurrencia siempre se ejecuta, sin importar la
  // política: la tolerancia ES el margen aceptado de retraso.
  if (retraso <= tol) {
    return {
      accion: "ejecutar",
      retraso_ms: retraso,
      motivo: retraso > 0 ? "Ocurrencia recuperada dentro de la tolerancia." : "Ocurrencia puntual.",
    };
  }
  if (args.politica === "omitir") {
    return {
      accion: "omitir",
      retraso_ms: retraso,
      motivo: `La ocurrencia se retrasó ${Math.round(retraso / 60000)} min, por encima de la tolerancia de ${args.tolerancia_minutos} min, y la política configurada es omitirla.`,
    };
  }
  // Política "recuperar": se ejecuta UNA sola vez, aunque haya pasado la
  // tolerancia. Nunca se acumulan ocurrencias anteriores.
  return {
    accion: "ejecutar",
    retraso_ms: retraso,
    motivo: `Ocurrencia recuperada con ${Math.round(retraso / 60000)} min de retraso.`,
  };
}

// ---------------------------------------------------------------------
// Periodo que se solicitará
// ---------------------------------------------------------------------

export type RangoSolicitud = { desde: string; hasta: string; nota: string };

/**
 * Rango de fechas (AAAA-MM-DD, hora local de la zona configurada) que la
 * ocurrencia debe pedir al SAT.
 *
 * `desde_ultima` aplica un solapamiento deliberado: se vuelve a pedir un
 * tramo ya descargado y la idempotencia por UUID descarta los duplicados.
 * Es preferible repetir a perder comprobantes.
 */
export function resolverPeriodoProgramado(args: {
  opcion: PeriodoOpcion;
  zona_horaria: string;
  ahora: Date;
  ultima_exitosa_hasta?: string | null;
  solapamiento_dias?: number;
  rango_desde?: string | null;
  rango_hasta?: string | null;
}): RangoSolicitud {
  const tz = args.zona_horaria || ZONA_PREDETERMINADA;
  const hoy = calendarioLocal(tz, args.ahora);
  const fmt = (c: { anio: number; mes: number; dia: number }) =>
    `${c.anio}-${String(c.mes).padStart(2, "0")}-${String(c.dia).padStart(2, "0")}`;
  const menos = (n: number) => fmt(sumarDiasLocal(hoy.anio, hoy.mes, hoy.dia, -n));

  switch (args.opcion) {
    case "dia_anterior":
      return { desde: menos(1), hasta: menos(1), nota: "Día natural anterior completo." };
    case "ultimos_3":
      return { desde: menos(3), hasta: menos(0), nota: "Últimos 3 días naturales." };
    case "ultimos_7":
      return { desde: menos(7), hasta: menos(0), nota: "Últimos 7 días naturales." };
    case "mes_anterior": {
      const anio = hoy.mes === 1 ? hoy.anio - 1 : hoy.anio;
      const mes = hoy.mes === 1 ? 12 : hoy.mes - 1;
      return {
        desde: fmt({ anio, mes, dia: 1 }),
        hasta: fmt({ anio, mes, dia: diasDelMes(anio, mes) }),
        nota: "Mes natural anterior completo.",
      };
    }
    case "rango_fijo": {
      if (args.rango_desde && args.rango_hasta) {
        return {
          desde: args.rango_desde,
          hasta: args.rango_hasta,
          nota: "Rango fijo capturado por el usuario.",
        };
      }
      return { desde: menos(1), hasta: menos(0), nota: "Rango fijo incompleto: se usó el día anterior." };
    }
    case "desde_ultima":
    default: {
      const sol = Math.max(0, args.solapamiento_dias ?? 1);
      if (!args.ultima_exitosa_hasta) {
        return {
          desde: menos(7),
          hasta: menos(0),
          nota: "Sin descarga exitosa previa: se usaron los últimos 7 días.",
        };
      }
      const [a, m, d] = args.ultima_exitosa_hasta.split("-").map(Number);
      const base = new Date(Date.UTC(a ?? hoy.anio, (m ?? 1) - 1, (d ?? 1) - sol));
      const desde = fmt({
        anio: base.getUTCFullYear(),
        mes: base.getUTCMonth() + 1,
        dia: base.getUTCDate(),
      });
      const hasta = menos(0);
      return {
        desde: desde <= hasta ? desde : hasta,
        hasta,
        nota: `Desde la última descarga exitosa con ${sol} día(s) de solapamiento; los duplicados se descartan por UUID.`,
      };
    }
  }
}

/** Llave estable por programación + ocurrencia: impide ejecuciones dobles. */
export function llaveOcurrencia(programacionId: string, programadaAt: Date): string {
  return `${programacionId}|${programadaAt.toISOString().slice(0, 16)}`;
}

/** Texto corto y honesto del estado de la programación. */
export function describirProgramacion(p: {
  activa: boolean;
  pausada: boolean;
  tipo: TipoProgramacion;
  recurrencia: Recurrencia | null;
  proxima_ejecucion_at: string | null;
}): string {
  if (p.pausada) return "Programación pausada.";
  if (!p.activa) return "Programación inactiva.";
  if (!p.proxima_ejecucion_at) return "Sin próximas ejecuciones.";
  return p.tipo === "unica"
    ? "Ejecución única pendiente."
    : `Recurrencia ${p.recurrencia ?? "—"} activa.`;
}
