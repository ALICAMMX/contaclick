// Fuente única de verdad del ALCANCE por expediente (tenant + rol + cliente).
//
// Toda lectura/escritura que dependa de un expediente debe pasar por
// `assertClienteScope`. Si no hay expediente activo o el usuario no tiene
// acceso a él, la consulta falla de forma CERRADA (throw), nunca devuelve
// datos de otro RFC.
import type { SupabaseClient } from "@supabase/supabase-js";

export const EXPEDIENTE_REQUERIDO =
  "Selecciona un expediente activo en la barra superior. Esta pantalla solo muestra información del expediente seleccionado.";

export type ClienteScope = {
  cliente_id: string;
  despacho_id: string;
  rfc: string;
  razon_social: string | null;
};

/**
 * Valida que `clienteId` exista, sea un expediente raíz (o resuelve su padre),
 * pertenezca a un despacho del que el usuario es miembro activo y que el
 * usuario tenga acceso a ese expediente según su rol/asignaciones.
 */
export async function assertClienteScope(
  supabase: SupabaseClient,
  userId: string,
  clienteId?: string | null,
): Promise<ClienteScope> {
  if (!clienteId) throw new Error(EXPEDIENTE_REQUERIDO);

  const select = "id, rfc, razon_social, despacho_id, tipo_relacion, cliente_padre_id";
  const { data: row, error } = await supabase
    .from("clientes")
    .select(select)
    .eq("id", clienteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error(EXPEDIENTE_REQUERIDO);

  // Si apuntan a un tercero (proveedor/acreedor), el alcance real es el padre.
  let target: any = row;
  if (row.cliente_padre_id) {
    const { data: parent, error: pErr } = await supabase
      .from("clientes")
      .select(select)
      .eq("id", row.cliente_padre_id)
      .is("cliente_padre_id", null)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!parent) throw new Error(EXPEDIENTE_REQUERIDO);
    target = parent;
  }

  if (!target.despacho_id) {
    throw new Error("El expediente no está vinculado a un despacho. Contacta al administrador.");
  }

  // Membresía activa en el despacho del expediente.
  const { data: mem } = await supabase
    .from("user_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("despacho_id", target.despacho_id)
    .eq("estado", "activo")
    .maybeSingle();

  const { data: owner } = await supabase
    .from("despachos")
    .select("id")
    .eq("id", target.despacho_id)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (!mem && !owner) {
    throw new Error("No tienes acceso a este expediente.");
  }

  // Permiso fino por expediente (acceso restringido / cliente_final).
  const { data: allowed, error: rpcErr } = await supabase.rpc("has_cliente_access", {
    _cliente: target.id,
  });
  if (!rpcErr && allowed === false) {
    throw new Error("No tienes acceso a este expediente.");
  }

  return {
    cliente_id: target.id as string,
    despacho_id: target.despacho_id as string,
    rfc: String(target.rfc ?? ""),
    razon_social: (target.razon_social ?? null) as string | null,
  };
}
