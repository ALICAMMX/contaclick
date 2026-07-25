import { z } from "zod";

export function normalizeBankDescription(value: unknown): string {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (text || "(sin descripción)").slice(0, 480);
}

export function normalizeBankReference(value: unknown): string | null {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 120) : null;
}

const MovimientoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  descripcion: z.preprocess(normalizeBankDescription, z.string()),
  referencia: z.preprocess(normalizeBankReference, z.string().nullable()),
  cargo: z.number().min(0).default(0),
  abono: z.number().min(0).default(0),
  saldo: z.number().nullable().default(null),
});

const UploadSchema = z.object({
  cliente_id: z.string().uuid(),
  cuenta_id: z.string().uuid().optional(),
  banco: z.string().min(1).max(60).optional(),
  alias: z.string().max(80).optional(),
  mask: z.string().max(40).optional(),
  movimientos: z.array(MovimientoSchema).min(1).max(5000),
});

function normalizeUploadPayload(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const payload = value as Record<string, unknown>;
  const movimientos = Array.isArray(payload.movimientos)
    ? payload.movimientos.map((item) => {
        if (!item || typeof item !== "object") return item;
        const movimiento = item as Record<string, unknown>;
        return {
          ...movimiento,
          descripcion: normalizeBankDescription(movimiento.descripcion),
          referencia: normalizeBankReference(movimiento.referencia),
        };
      })
    : payload.movimientos;

  return { ...payload, movimientos };
}

export function parseUploadMovimientosInput(data: unknown) {
  return UploadSchema.parse(normalizeUploadPayload(data));
}

export function parseListMovimientosInput(data: unknown) {
  return z.object({
    cliente_id: z.string().uuid(),
    cuenta_id: z.string().uuid().optional(),
    limit: z.number().min(1).max(1000).default(500),
  }).parse(data);
}

export function parseClienteInput(data: unknown) {
  return z.object({ cliente_id: z.string().uuid() }).parse(data);
}

export function parseRunReconciliationInput(data: unknown) {
  return z.object({
    cliente_id: z.string().uuid(),
    tolerancia_pct: z.number().min(0).max(5).default(0.5),
    dias_ventana: z.number().min(0).max(30).default(5),
  }).parse(data);
}

export function parseUpdateConciliacionInput(data: unknown) {
  return z.object({
    id: z.string().uuid(),
    estatus: z.enum(["propuesto", "confirmado", "rechazado", "ignorado"]),
  }).parse(data);
}