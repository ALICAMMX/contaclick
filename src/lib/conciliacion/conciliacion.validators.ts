import { z } from "zod";
import { MOTIVO_MINIMO } from "./contrato";

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

function isValidIsoDate(s: string): boolean {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12) return false;
  const lastDay = new Date(y, mo, 0).getDate();
  return d >= 1 && d <= lastDay;
}

const PeriodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El periodo debe indicarse como AAAA-MM.");

const MovimientoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidIsoDate, { message: "Fecha inválida" }),
  descripcion: z.preprocess(normalizeBankDescription, z.string()),
  referencia: z.preprocess(normalizeBankReference, z.string().nullable()),
  cargo: z.number().min(0).default(0),
  abono: z.number().min(0).default(0),
  saldo: z.number().nullable().default(null),
  moneda: z.string().max(3).nullable().default("MXN"),
});

const UploadSchema = z.object({
  cliente_id: z.string().uuid(),
  cuenta_id: z.string().uuid().optional(),
  banco: z.string().min(1).max(60).optional(),
  alias: z.string().max(80).optional(),
  mask: z.string().max(40).optional(),
  /** Identidad del archivo importado: permite reimportación idempotente. */
  archivo: z.object({
    sha256: z.string().regex(/^[0-9a-f]{64}$/, "Huella de archivo inválida."),
    nombre: z.string().min(1).max(240),
    bytes: z.number().int().min(0).max(200_000_000),
    formato: z.enum(["csv", "xlsx", "pdf", "manual"]).default("csv"),
  }),
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
    periodo: PeriodoSchema,
    cuenta_id: z.string().uuid().optional(),
    limit: z.number().min(1).max(1000).default(500),
  }).parse(data);
}

export function parseClienteInput(data: unknown) {
  return z.object({
    cliente_id: z.string().uuid(),
    periodo: PeriodoSchema.optional(),
  }).parse(data);
}

export function parseRunReconciliationInput(data: unknown) {
  return z.object({
    cliente_id: z.string().uuid(),
    periodo: PeriodoSchema,
    dias_ventana: z.number().int().min(0).max(30).default(5),
    /** Tolerancia en CENTAVOS enteros. Jamás porcentaje flotante. */
    tolerancia_centavos: z.number().int().min(0).max(10_000).default(0),
  }).parse(data);
}

const MotivoSchema = z
  .string()
  .trim()
  .min(MOTIVO_MINIMO, `Explica el motivo con al menos ${MOTIVO_MINIMO} caracteres.`)
  .max(600);

export function parseDecisionGrupoInput(data: unknown) {
  return z.object({
    cliente_id: z.string().uuid(),
    grupo_id: z.string().uuid(),
    accion: z.enum(["confirmar", "rechazar", "revertir"]),
    motivo: z.string().trim().max(600).optional(),
  })
    .superRefine((v, ctx) => {
      if (v.accion !== "confirmar" && !MotivoSchema.safeParse(v.motivo ?? "").success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["motivo"],
          message: `Rechazar o revertir exige un motivo de al menos ${MOTIVO_MINIMO} caracteres.`,
        });
      }
    })
    .parse(data);
}

export function parseIgnorarMovimientoInput(data: unknown) {
  return z.object({
    cliente_id: z.string().uuid(),
    movimiento_id: z.string().uuid(),
    motivo: MotivoSchema,
    no_fiscal: z.boolean().default(true),
  }).parse(data);
}
