// =====================================================================
// SERVICIO CENTRAL DE ENTITLEMENTS — ÚNICA FUENTE DE VERDAD
// ---------------------------------------------------------------------
// Toda regla de estado de cuenta, trial, plan, periodo de facturación,
// límites (RFC, IA, SAT), frecuencia y excepciones comerciales vive aquí.
// Ningún componente ni server function debe reimplementar estas reglas:
// deben llamar a getEntitlements / assertAcceso / assertCuota.
//
// No es un serverFn: recibe el cliente Supabase autenticado del caller,
// por lo que RLS sigue aplicando y no puede evadirse desde el frontend.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type Recurso = "ia_requests" | "ia_tokens" | "rfcs" | "sat_solicitudes";
export type FrecuenciaSat = "manual" | "mensual" | "semanal" | "diaria";
export type EstadoCuenta = "trial" | "activa" | "vencida" | "suspendida";

export interface Limites {
  rfcs: number;
  ia_msgs: number;
  ia_tokens?: number;
  xml_mes?: number;
  clientes?: number;
  max_miembros?: number;
  sat_solicitudes_mes?: number;
  sat_frecuencia_max?: FrecuenciaSat;
}

export interface ExcepcionVigente {
  id: string;
  tipo: string;
  valor_num: number | null;
  valor_texto: string | null;
  motivo: string;
  creado_por: string;
  created_at: string;
  expira_at: string;
}

export interface UsoActual {
  rfcs: number;
  /** Expedientes demo/showroom: visibles, pero fuera de toda cuota. */
  rfcs_demo: number;
  ia_requests: number;
  ia_tokens: number;
  sat_solicitudes: number;
  sat_costo_centavos: number;
}

export interface Entitlements {
  despacho_id: string;
  nombre: string;
  es_sandbox: boolean;
  /** Estado real y ya reconciliado (nunca contradictorio con el plan). */
  estado: EstadoCuenta;
  /** false = la cuenta no puede operar (trial vencido sin plan ni cortesía). */
  acceso: boolean;
  motivo_bloqueo: string | null;
  plan: { clave: string; nombre: string } | null;
  trial: { activo: boolean; ends_at: string | null; dias_restantes: number } | null;
  /** Periodo de facturación/uso vigente, formato YYYY-MM (UTC). */
  periodo: string;
  periodo_inicia: string;
  periodo_termina: string;
  /** Límites del plan (default < plan < override) ANTES de excepciones. */
  limites_base: Limites;
  /** Límites efectivos tras aplicar las excepciones comerciales vigentes. */
  limites: Limites;
  uso: UsoActual;
  excepciones: ExcepcionVigente[];
}

// El default equivale al plan Profesional: es lo que otorga el trial de 14 días.
export const DEFAULT_LIMITS: Limites = {
  rfcs: 25,
  ia_msgs: 1500,
  ia_tokens: 5_000_000,
  sat_solicitudes_mes: 1000,
  sat_frecuencia_max: "diaria",
};

const FREC_RANK: Record<FrecuenciaSat, number> = {
  manual: 0,
  mensual: 1,
  semanal: 2,
  diaria: 3,
};

// ---------------------------------------------------------------------
// Errores tipados (el frontend los muestra tal cual)
// ---------------------------------------------------------------------

export class AccesoBloqueadoError extends Error {
  readonly code = "ACCESO_BLOQUEADO";
  constructor(motivo: string) {
    super(motivo);
  }
}

export class UsageLimitError extends Error {
  readonly code = "LIMITE_ALCANZADO";
  recurso: Recurso;
  limite: number;
  usado: number;
  constructor(recurso: Recurso, usado: number, limite: number, extra?: string) {
    super(
      `Alcanzaste el límite de tu plan — ${labelRecurso(recurso)}: ${usado} de ${limite}. ` +
        (extra ??
          "Puedes liberar espacio, contratar un plan mayor en /precios o esperar al siguiente periodo."),
    );
    this.recurso = recurso;
    this.limite = limite;
    this.usado = usado;
  }
}

export class FrecuenciaNoPermitidaError extends Error {
  readonly code = "FRECUENCIA_NO_PERMITIDA";
  constructor(permitida: FrecuenciaSat, pedida: FrecuenciaSat) {
    super(`Tu plan permite frecuencia máxima ${permitida}. Para usar ${pedida}, mejora tu plan.`);
  }
}

export function labelRecurso(r: Recurso): string {
  if (r === "ia_requests") return "Solicitudes IA";
  if (r === "ia_tokens") return "Tokens IA";
  if (r === "sat_solicitudes") return "Descargas SAT";
  return "RFC activos";
}

// ---------------------------------------------------------------------
// Periodo
// ---------------------------------------------------------------------

export function periodoActual(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rangoPeriodo(d: Date = new Date()) {
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59));
  return { inicia: inicio.toISOString(), termina: fin.toISOString() };
}

// ---------------------------------------------------------------------
// Núcleo
// ---------------------------------------------------------------------

const EXC_A_LIMITE: Record<string, keyof Limites> = {
  limite_rfcs: "rfcs",
  limite_ia_msgs: "ia_msgs",
  limite_ia_tokens: "ia_tokens",
  limite_sat_solicitudes: "sat_solicitudes_mes",
};

/**
 * Calcula el entitlement efectivo del despacho. Reconcilia estado/plan/trial
 * y aplica excepciones comerciales vigentes. Si detecta un estado
 * contradictorio o un trial vencido, lo corrige de forma idempotente.
 */
export async function getEntitlements(
  supabase: SupabaseClient,
  despachoId: string,
): Promise<Entitlements> {
  const now = new Date();
  const periodo = periodoActual(now);
  const rango = rangoPeriodo(now);

  const { data: d, error } = await supabase
    .from("despachos")
    .select(
      "id, nombre, estado, trial_ends_at, plan_id, es_sandbox, limites_override, planes(clave, nombre, limites)",
    )
    .eq("id", despachoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!d) throw new Error("No se encontró la cuenta del despacho.");

  const plan = (d as any).planes
    ? { clave: (d as any).planes.clave as string, nombre: (d as any).planes.nombre as string }
    : null;

  // --- Excepciones comerciales vigentes ---
  const { data: excRows } = await supabase
    .from("entitlement_excepciones")
    .select("id, tipo, valor_num, valor_texto, motivo, creado_por, created_at, expira_at")
    .eq("despacho_id", despachoId)
    .is("revocada_at", null)
    .gt("expira_at", now.toISOString());
  const excepciones = (excRows ?? []) as ExcepcionVigente[];
  const cortesiaAcceso = excepciones.find(
    (e) => e.tipo === "trial_extension" || e.tipo === "acceso_cortesia",
  );

  // --- Reconciliación de estado (nunca trial + plan al mismo tiempo) ---
  let estado = (d.estado ?? "trial") as EstadoCuenta;
  let trialEnds: string | null = (d.trial_ends_at ?? null) as string | null;
  const tienePlan = !!d.plan_id;
  let necesitaPersistir = false;

  if (tienePlan) {
    // Con plan contratado el trial deja de existir: no hay "Trial: 0 días".
    if (estado === "trial" || trialEnds) {
      estado = "activa";
      trialEnds = null;
      necesitaPersistir = true;
    }
  } else if (estado === "trial" && trialEnds && new Date(trialEnds).getTime() <= now.getTime()) {
    if (!cortesiaAcceso && !d.es_sandbox) {
      estado = "vencida";
      necesitaPersistir = true;
    }
  }

  if (necesitaPersistir) {
    // Idempotente: sólo escribe cuando el valor almacenado difiere.
    await supabase
      .from("despachos")
      .update({ estado, trial_ends_at: trialEnds })
      .eq("id", despachoId)
      .then(
        () => undefined,
        () => undefined,
      );
  }

  const trialVigente =
    !tienePlan && !!trialEnds && new Date(trialEnds).getTime() > now.getTime();
  const diasRestantes = trialEnds
    ? Math.max(0, Math.ceil((new Date(trialEnds).getTime() - now.getTime()) / 86400000))
    : 0;

  const acceso =
    d.es_sandbox === true ||
    estado === "activa" ||
    trialVigente ||
    !!cortesiaAcceso;

  const motivo_bloqueo = acceso
    ? null
    : estado === "suspendida"
      ? "Tu cuenta está suspendida. Contacta a soporte para reactivarla."
      : "Tu prueba gratuita venció. Elige un plan para volver a operar; tus expedientes siguen guardados.";

  // --- Límites efectivos: default < plan (SOT) < override comercial < excepción ---
  // La fuente única de verdad de capacidad por plan es src/lib/payments/plans.ts.
  // La tabla `planes` sólo aporta valores para claves que aún no existan ahí.
  const claveDb = String((d as any).planes?.clave ?? d.plan_id ?? "");
  const planSot = isValidPlan(claveDb) || claveDb === "enterprise" ? PLANS[claveDb as PlanId] : null;
  const limitesSot: Partial<Limites> = planSot
    ? {
        rfcs: planSot.maxRfcs,
        ia_msgs: planSot.capacidadOperativa.ia_msgs,
        ia_tokens: planSot.capacidadOperativa.ia_tokens,
        sat_solicitudes_mes: planSot.capacidadOperativa.sat_solicitudes_mes,
        sat_frecuencia_max: planSot.capacidadOperativa.sat_frecuencia_max,
        almacenamiento_gb: planSot.capacidadOperativa.almacenamiento_gb,
        max_miembros: planSot.capacidadOperativa.max_miembros,
      }
    : {};
  const limites_base: Limites = {
    ...DEFAULT_LIMITS,
    ...(((d as any).planes?.limites as Limites | undefined) ?? {}),
    ...limitesSot,
    ...(((d as any).limites_override as Partial<Limites> | null) ?? {}),
  };

  const limites: Limites = { ...limites_base };
  for (const e of excepciones) {
    const campo = EXC_A_LIMITE[e.tipo];
    if (campo && e.valor_num != null) {
      const actual = Number((limites as any)[campo] ?? 0);
      // -1 (ilimitado) siempre gana; si no, la excepción sólo puede ampliar.
      if (actual !== -1 && Number(e.valor_num) > actual) {
        (limites as any)[campo] = Number(e.valor_num);
      }
    }
    if (e.tipo === "frecuencia_sat" && e.valor_texto) {
      limites.sat_frecuencia_max = e.valor_texto as FrecuenciaSat;
    }
  }

  const uso = await getUso(supabase, despachoId, periodo);

  return {
    despacho_id: despachoId,
    nombre: d.nombre as string,
    es_sandbox: d.es_sandbox === true,
    estado,
    acceso,
    motivo_bloqueo,
    plan,
    trial: tienePlan
      ? null
      : { activo: trialVigente, ends_at: trialEnds, dias_restantes: diasRestantes },
    periodo,
    periodo_inicia: rango.inicia,
    periodo_termina: rango.termina,
    limites_base,
    limites,
    uso,
    excepciones,
  };
}

/**
 * Uso real del periodo. Los expedientes demo/showroom NO cuentan:
 * están marcados con `es_demo` y quedan fuera de toda cuota.
 */
export async function getUso(
  supabase: SupabaseClient,
  despachoId: string,
  periodo = periodoActual(),
): Promise<UsoActual> {
  const [{ count }, { count: countDemo }, { data: up }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .eq("despacho_id", despachoId)
      .eq("tipo_relacion", "cliente")
      .is("cliente_padre_id", null)
      .eq("es_demo", false),
    supabase
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .eq("despacho_id", despachoId)
      .eq("tipo_relacion", "cliente")
      .is("cliente_padre_id", null)
      .eq("es_demo", true),
    supabase
      .from("uso_periodo")
      .select("ia_requests, ia_tokens, sat_solicitudes, sat_costo_centavos")
      .eq("despacho_id", despachoId)
      .eq("periodo", periodo)
      .maybeSingle(),
  ]);

  return {
    rfcs: count ?? 0,
    rfcs_demo: countDemo ?? 0,
    ia_requests: (up as any)?.ia_requests ?? 0,
    ia_tokens: Number((up as any)?.ia_tokens ?? 0),
    sat_solicitudes: (up as any)?.sat_solicitudes ?? 0,
    sat_costo_centavos: Number((up as any)?.sat_costo_centavos ?? 0),
  };
}

// ---------------------------------------------------------------------
// Candados (se aplican SIEMPRE en backend; la UI sólo los refleja)
// ---------------------------------------------------------------------

/** Bloquea cualquier operación si la cuenta no tiene acceso vigente. */
export function assertAcceso(ent: Entitlements) {
  if (!ent.acceso) throw new AccesoBloqueadoError(ent.motivo_bloqueo!);
}

export function limiteDe(ent: Entitlements, recurso: Recurso): number {
  if (recurso === "ia_requests") return ent.limites.ia_msgs ?? 0;
  if (recurso === "ia_tokens") return ent.limites.ia_tokens ?? 0;
  if (recurso === "sat_solicitudes") return ent.limites.sat_solicitudes_mes ?? 0;
  return ent.limites.rfcs ?? 0;
}

export function usadoDe(ent: Entitlements, recurso: Recurso): number {
  if (recurso === "ia_requests") return ent.uso.ia_requests;
  if (recurso === "ia_tokens") return ent.uso.ia_tokens;
  if (recurso === "sat_solicitudes") return ent.uso.sat_solicitudes;
  return ent.uso.rfcs;
}

/** true = ya no se puede consumir más de este recurso. */
export function cuotaAgotada(ent: Entitlements, recurso: Recurso, incremento = 1): boolean {
  const limite = limiteDe(ent, recurso);
  if (limite < 0) return false; // -1 = ilimitado
  if (limite === 0) return false; // sin límite configurado
  return usadoDe(ent, recurso) + incremento > limite;
}

/**
 * Verifica cuota ANTES de ejecutar. Emite aviso al cruzar 80% y bloquea al 100%.
 * El despacho sandbox nunca consume ni se bloquea.
 */
export async function assertCuota(
  supabase: SupabaseClient,
  ent: Entitlements,
  recurso: Recurso,
  incremento = 1,
) {
  assertAcceso(ent);
  if (ent.es_sandbox) return;

  const limite = limiteDe(ent, recurso);
  if (limite <= 0) return; // -1 ilimitado / 0 sin configurar

  const usado = usadoDe(ent, recurso);
  const proyectado = usado + incremento;
  const pct = (proyectado / limite) * 100;

  if (pct >= 80 && pct < 100) {
    await emitirAvisoUso(supabase, ent, recurso, "80", usado, limite);
  }
  if (proyectado > limite) {
    await emitirAvisoUso(supabase, ent, recurso, "100", usado, limite);
    throw new UsageLimitError(recurso, usado, limite, mensajeAccion(ent, recurso));
  }
}

function mensajeAccion(ent: Entitlements, recurso: Recurso): string {
  if (recurso === "rfcs") {
    return (
      "Para dar de alta más expedientes: archiva o elimina alguno que ya no operes, " +
      "contrata un plan mayor en /precios, o solicita una ampliación a soporte." +
      (ent.excepciones.some((e) => e.tipo === "limite_rfcs")
        ? " (Tu cuenta ya opera con una ampliación temporal registrada.)"
        : "")
    );
  }
  if (recurso === "sat_solicitudes") {
    return "Espera al siguiente periodo o contrata un plan con más descargas SAT.";
  }
  return "Espera al siguiente periodo o contrata un plan mayor en /precios.";
}

export function assertFrecuencia(ent: Entitlements, pedida: FrecuenciaSat) {
  const permitida = (ent.limites.sat_frecuencia_max ?? "manual") as FrecuenciaSat;
  if (FREC_RANK[pedida] > FREC_RANK[permitida]) {
    throw new FrecuenciaNoPermitidaError(permitida, pedida);
  }
}

async function emitirAvisoUso(
  supabase: SupabaseClient,
  ent: Entitlements,
  recurso: Recurso,
  umbral: "80" | "100",
  usado: number,
  limite: number,
) {
  const titulo =
    umbral === "100"
      ? `Límite alcanzado: ${labelRecurso(recurso)}`
      : `Estás cerca del límite: ${labelRecurso(recurso)}`;
  const descripcion =
    umbral === "100"
      ? `Tu plan permite ${limite} ${labelRecurso(recurso)} y ya usaste ${usado}.`
      : `Has usado ${usado} de ${limite} ${labelRecurso(recurso)} (${Math.round(
          (usado / limite) * 100,
        )}%).`;

  // Índice único parcial => el aviso de cada umbral se emite una sola vez por periodo.
  await supabase
    .from("alertas")
    .insert({
      despacho_id: ent.despacho_id,
      tipo: "uso_limite",
      nivel: umbral === "100" ? "alto" : "medio",
      titulo,
      descripcion,
      recomendacion: mensajeAccion(ent, recurso),
      accion_sugerida: "Ver planes",
      evidencia: { recurso, periodo: ent.periodo, umbral, usado, limite },
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

/** Atajo usado por casi todas las escrituras: entitlement + candado en una llamada. */
export async function assertPuedeConsumir(
  supabase: SupabaseClient,
  despachoId: string,
  recurso: Recurso,
  incremento = 1,
): Promise<Entitlements> {
  const ent = await getEntitlements(supabase, despachoId);
  await assertCuota(supabase, ent, recurso, incremento);
  return ent;
}
