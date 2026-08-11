// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 6 — snapshot inmutable del cierre mensual.
//
// La huella es determinista: mismas fuentes ⇒ misma huella ⇒ el sellado es
// idempotente (el RPC `cierre_sellar` devuelve el sello existente). Cualquier
// cambio posterior produce huella distinta y obliga a una nueva versión.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { ORDEN_ETAPAS, ESTADOS_SATISFECHOS, type EstadoEtapa, type EtapaId } from "./flujo";

export type EtapaSnapshot = {
  id: EtapaId;
  estado: EstadoEtapa;
  cobertura: number | null;
  version: number;
  motivo?: string | null;
};

export type ResumenCierre = {
  cfdi_total: number;
  cfdi_emitidos: number;
  cfdi_recibidos: number;
  ingresos: number;
  egresos: number;
  iva_trasladado: number;
  iva_acreditable: number;
  excepciones_pendientes: number;
  polizas_bloqueadas: number;
};

/** Canonicalización estable (claves ordenadas) para que la huella no dependa del orden. */
export function canonicalizar(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor ?? null);
  if (Array.isArray(valor)) return `[${valor.map(canonicalizar).join(",")}]`;
  const obj = valor as Record<string, unknown>;
  const claves = Object.keys(obj).sort();
  return `{${claves.map((k) => `${JSON.stringify(k)}:${canonicalizar(obj[k])}`).join(",")}}`;
}

export function huellaCierre(args: {
  clienteId: string;
  periodo: string;
  etapas: EtapaSnapshot[];
  resumen: ResumenCierre;
  evaluador: string;
}): string {
  const etapas = [...args.etapas]
    .sort((a, b) => ORDEN_ETAPAS.indexOf(a.id) - ORDEN_ETAPAS.indexOf(b.id))
    .map((e) => ({ id: e.id, estado: e.estado, cobertura: e.cobertura, version: e.version }));
  const payload = canonicalizar({
    cliente: args.clienteId,
    periodo: args.periodo,
    evaluador: args.evaluador,
    etapas,
    resumen: args.resumen,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export type Bloqueo = { codigo: string; detalle: string };

/**
 * Criterios de terminación del periodo. Falla cerrada: sin evidencia suficiente
 * NO se sella. Nunca se asume "todo bien" por ausencia de datos.
 */
export function bloqueosDeCierre(args: {
  etapas: EtapaSnapshot[];
  resumen: ResumenCierre;
}): Bloqueo[] {
  const bloqueos: Bloqueo[] = [];
  const porId = new Map(args.etapas.map((e) => [e.id, e]));

  for (const id of ORDEN_ETAPAS) {
    if (id === "cierre") continue;
    const etapa = porId.get(id);
    const estado = etapa?.estado ?? "no_iniciada";
    if (!ESTADOS_SATISFECHOS.includes(estado)) {
      bloqueos.push({ codigo: `etapa_${id}`, detalle: `La etapa “${id}” está en estado “${estado}”.` });
    }
    if (estado === "no_aplica" && !(etapa?.motivo ?? "").trim()) {
      bloqueos.push({ codigo: `motivo_${id}`, detalle: `La etapa “${id}” se marcó “no aplica” sin motivo.` });
    }
  }

  if (args.resumen.excepciones_pendientes > 0) {
    bloqueos.push({
      codigo: "excepciones_pendientes",
      detalle: `${args.resumen.excepciones_pendientes} excepciones documentales sin decisión.`,
    });
  }
  if (args.resumen.polizas_bloqueadas > 0) {
    bloqueos.push({
      codigo: "polizas_bloqueadas",
      detalle: `${args.resumen.polizas_bloqueadas} pólizas descuadradas o con cuenta por identificar.`,
    });
  }
  if (args.resumen.cfdi_total === 0) {
    bloqueos.push({
      codigo: "sin_documentos",
      detalle: "El periodo no tiene comprobantes: no hay nada que sellar.",
    });
  }
  return bloqueos;
}
