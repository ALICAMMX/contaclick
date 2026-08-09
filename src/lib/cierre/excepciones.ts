// ─────────────────────────────────────────────────────────────────────────────
// PLANIFICADOR PURO DE LA BANDEJA DE EXCEPCIONES.
//
// Regla dura: NUNCA se borra una excepción. Cuando su causa desaparece se
// cierra automáticamente con motivo estructurado y su bitácora se conserva.
// Si la causa reaparece se crea una OCURRENCIA NUEVA ligada a la anterior.
//
// Módulo puro: sin base de datos. Se prueba en memoria.
// ─────────────────────────────────────────────────────────────────────────────

export const MOTIVO_CAUSA_DESAPARECIO = "CAUSA_DESAPARECIO";
export const ESTADO_CIERRE_AUTOMATICO = "resuelta_automatica";
export const ACTOR_SISTEMA = "sistema";

/** Estados que representan una excepción todavía "viva" para el periodo. */
const ESTADOS_ACTIVOS = new Set(["pendiente", "aceptada", "resuelta"]);

export type ExcepcionExistente = {
  id: string;
  codigo: string;
  cfdi_id: string | null;
  estado: string;
  ocurrencia?: number | null;
  created_at?: string | null;
};

export type ExcepcionVigente = {
  codigo: string;
  cfdi_id: string | null;
  titulo: string;
  detalle: unknown;
};

export type PlanExcepciones = {
  nuevas: Array<{
    codigo: string;
    cfdi_id: string | null;
    titulo: string;
    detalle: unknown;
    ocurrencia: number;
    excepcion_previa_id: string | null;
  }>;
  /** Excepciones pendientes cuya causa desapareció: se CIERRAN, no se borran. */
  cerrar: string[];
};

export function clave(codigo: string, cfdi: string | null): string {
  return `${codigo}|${cfdi ?? ""}`;
}

export function planificarExcepciones(args: {
  existentes: ExcepcionExistente[];
  vigentes: ExcepcionVigente[];
}): PlanExcepciones {
  const porClave = new Map<string, ExcepcionExistente[]>();
  for (const e of args.existentes) {
    const k = clave(e.codigo, e.cfdi_id);
    porClave.set(k, [...(porClave.get(k) ?? []), e]);
  }

  const nuevas: PlanExcepciones["nuevas"] = [];
  for (const v of args.vigentes) {
    const previas = porClave.get(clave(v.codigo, v.cfdi_id)) ?? [];
    if (previas.some((p) => ESTADOS_ACTIVOS.has(p.estado))) continue; // idempotente

    const cerradas = previas.filter((p) => p.estado === ESTADO_CIERRE_AUTOMATICO);
    const ultima = cerradas[cerradas.length - 1] ?? null;
    const ocurrencia = previas.reduce((max, p) => Math.max(max, Number(p.ocurrencia ?? 1)), 0) + 1;
    nuevas.push({
      codigo: v.codigo,
      cfdi_id: v.cfdi_id,
      titulo: v.titulo,
      detalle: v.detalle,
      ocurrencia,
      excepcion_previa_id: ultima?.id ?? null,
    });
  }

  const vigentesClaves = new Set(args.vigentes.map((v) => clave(v.codigo, v.cfdi_id)));
  const cerrar = args.existentes
    .filter((e) => e.estado === "pendiente" && !vigentesClaves.has(clave(e.codigo, e.cfdi_id)))
    .map((e) => e.id);

  return { nuevas, cerrar };
}
