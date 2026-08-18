import { describe, expect, it } from "vitest";
import { assertClienteScope } from "./scope";

// Stub mínimo del cliente: sólo lo que usa `assertClienteScope`.
function stub(opciones: { rpc: { data: unknown; error: unknown } }) {
  const cliente = {
    id: "c1",
    rfc: "AAA010101AAA",
    razon_social: "QA",
    despacho_id: "d1",
    tipo_relacion: null,
    cliente_padre_id: null,
  };
  const tabla = (nombre: string) => {
    const fila =
      nombre === "clientes" ? cliente : nombre === "user_memberships" ? { id: "m1" } : null;
    const encadenable: any = {
      select: () => encadenable,
      eq: () => encadenable,
      is: () => encadenable,
      maybeSingle: async () => ({ data: fila, error: null }),
    };
    return encadenable;
  };
  return {
    from: (nombre: string) => tabla(nombre),
    rpc: async () => opciones.rpc,
  } as any;
}

describe("assertClienteScope · fallo cerrado de autorización", () => {
  it("rechaza cuando el RPC de acceso devuelve error", async () => {
    const supabase = stub({ rpc: { data: null, error: { message: "boom" } } });
    await expect(assertClienteScope(supabase, "u1", "c1")).rejects.toThrow(
      /No se pudo verificar tu acceso/,
    );
  });

  it("rechaza cuando el RPC devuelve null", async () => {
    const supabase = stub({ rpc: { data: null, error: null } });
    await expect(assertClienteScope(supabase, "u1", "c1")).rejects.toThrow(/No tienes acceso/);
  });

  it("rechaza cuando el RPC devuelve una respuesta inesperada", async () => {
    const supabase = stub({ rpc: { data: "quizá", error: null } });
    await expect(assertClienteScope(supabase, "u1", "c1")).rejects.toThrow(/No tienes acceso/);
  });

  it("sólo permite el acceso cuando el RPC devuelve exactamente true", async () => {
    const supabase = stub({ rpc: { data: true, error: null } });
    await expect(assertClienteScope(supabase, "u1", "c1")).resolves.toMatchObject({
      cliente_id: "c1",
      despacho_id: "d1",
    });
  });
});
