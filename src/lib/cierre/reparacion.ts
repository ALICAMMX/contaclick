// ─────────────────────────────────────────────────────────────────────────────
// REPARACIÓN DE DATOS DERIVADOS DEL CFDI (sin XML original).
//
// Un comprobante puede existir en el expediente con su ENCABEZADO canónico
// completo (UUID, fecha, RFC, importes) y sin el XML guardado: es el caso de
// los paquetes del SAT cuya normalización no llegó a completarse. Esos
// documentos quedaban con `periodo`, `direccion` y `clase_documental` en NULL
// y, por lo tanto, INVISIBLES para el Centro de cierre.
//
// Esta capa recalcula ÚNICAMENTE los datos derivados a partir de columnas
// canónicas ya almacenadas. Es idempotente y NUNCA toca:
//   · el XML canónico ni el UUID,
//   · el estatus SAT ni su fuente/evidencia,
//   · el linaje de la corrida SAT.
// El detalle fiscal (conceptos, impuestos, complementos) sigue exigiendo el
// XML: por eso el documento se marca como detalle NO reconstruible.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { clasificarDocumento } from "@/lib/cfdi/clasificacion";
import { periodoDeFecha } from "./periodo";

/** Columnas canónicas mínimas necesarias para derivar. */
export type FilaCanonica = {
  id: string;
  uuid: string | null;
  tipo_cfdi: string | null;
  rfc_emisor: string | null;
  rfc_receptor: string | null;
  metodo_pago: string | null;
  estatus_sat: string | null;
  fecha: string | null;
  periodo?: string | null;
  direccion?: string | null;
  clase_documental?: string | null;
  estado_relacion?: string | null;
};

export type DerivadosCfdi = {
  periodo: string | null;
  direccion: string;
  clase_documental: string;
  estado_relacion: string | null;
  estado_procesamiento: string;
  detalle_reconstruible: false;
  motivos: Array<{ codigo: string; mensaje: string }>;
};

/**
 * Deriva los campos del cierre desde el encabezado ya almacenado.
 * Función PURA: no consulta la base y no depende de la interfaz.
 */
export function derivarDesdeEncabezado(
  fila: FilaCanonica,
  rfcExpediente: string,
): DerivadosCfdi {
  const clasificacion = clasificarDocumento(
    {
      uuid: fila.uuid ?? null,
      tipo_cfdi: fila.tipo_cfdi ?? null,
      rfc_emisor: fila.rfc_emisor ?? null,
      rfc_receptor: fila.rfc_receptor ?? null,
      metodo_pago: fila.metodo_pago ?? null,
      estatus_sat: fila.estatus_sat ?? null,
      // Sin XML no puede reconstruirse el detalle: se declara tal cual.
      detalle_reconstruible: false,
    },
    { rfcExpediente },
  );

  const esPago = String(fila.tipo_cfdi ?? "").trim().toUpperCase() === "P";

  return {
    periodo: periodoDeFecha(fila.fecha ?? null),
    direccion: clasificacion.direccion,
    clase_documental: clasificacion.clase,
    // El estado de relación de un complemento de pago sólo puede afirmarse con
    // su detalle: si no hay XML, se deja intacto el valor previo (null aquí).
    estado_relacion: esPago ? null : "no_aplica",
    estado_procesamiento: clasificacion.estado_procesamiento,
    detalle_reconstruible: false,
    motivos: clasificacion.motivos,
  };
}

/**
 * Aplica la reparación a un documento concreto. Idempotente: si los valores ya
 * coinciden, no escribe. Devuelve `true` cuando hubo cambio real.
 */
export async function repararDerivadosCfdi(
  supabase: SupabaseClient,
  fila: FilaCanonica,
  rfcExpediente: string,
): Promise<{ cambiado: boolean; derivados: DerivadosCfdi }> {
  const d = derivarDesdeEncabezado(fila, rfcExpediente);

  const cambiado =
    (fila.periodo ?? null) !== d.periodo ||
    (fila.direccion ?? null) !== d.direccion ||
    (fila.clase_documental ?? null) !== d.clase_documental;

  const patch: Record<string, unknown> = {
    periodo: d.periodo,
    direccion: d.direccion,
    clase_documental: d.clase_documental,
    estado_procesamiento: d.estado_procesamiento,
    detalle_reconstruible: false,
    motivos: d.motivos,
  };
  if (d.estado_relacion !== null) patch.estado_relacion = d.estado_relacion;

  const { error } = await supabase.from("cfdi_xml").update(patch).eq("id", fila.id);
  if (error) throw new Error(`No se pudieron reparar los datos derivados: ${error.message}`);

  return { cambiado, derivados: d };
}

export const COLUMNAS_CANONICAS =
  "id, uuid, tipo_cfdi, rfc_emisor, rfc_receptor, metodo_pago, estatus_sat, fecha, periodo, direccion, clase_documental, estado_relacion";
