// Pruebas de regresión del aislamiento entre expedientes (multi-tenant).
// Simulan el cliente Supabase para verificar que el alcance falla CERRADO.
import { describe, it, expect } from "vitest";
import { assertClienteScope, assertRecordScope, EXPEDIENTE_REQUERIDO, REGISTRO_FUERA_DE_ALCANCE } from "./scope";

type Row = Record<string, any>;


/** Fake mínimo del query builder de supabase-js usado por scope.ts */
function makeSupabase(db: {
  clientes: Row[];
  memberships: Row[];
  despachos: Row[];
  tables?: Record<string, Row[]>;
  clienteAccess?: boolean;
}) {
  const from = (table: string) => {
    const source =
      table === "clientes" ? db.clientes
      : table === "user_memberships" ? db.memberships
      : table === "despachos" ? db.despachos
      : (db.tables?.[table] ?? []);
    const filters: Array<(r: Row) => boolean> = [];
    const api: any = {
      select: () => api,
      eq: (col: string, val: any) => { filters.push((r) => r[col] === val); return api; },
      is: (col: string, val: any) => { filters.push((r) => (r[col] ?? null) === val); return api; },
      limit: () => api,
      maybeSingle: async () => {
        const found = source.find((r) => filters.every((f) => f(r))) ?? null;
        return { data: found, error: null };
      },
    };
    return api;
  };
  return {
    from,
    rpc: async () => ({ data: db.clienteAccess ?? true, error: null }),
  } as any;
}

const DESPACHO_A = "11111111-1111-1111-1111-111111111111";
const DESPACHO_B = "22222222-2222-2222-2222-222222222222";
const CLI_A1 = "aaaaaaa1-0000-0000-0000-000000000001";
const CLI_A2 = "aaaaaaa1-0000-0000-0000-000000000002";
const CLI_B1 = "bbbbbbb1-0000-0000-0000-000000000001";
const USER = "user-1";

const baseDb = (): {
  clientes: Row[];
  memberships: Row[];
  despachos: Row[];
  tables: Record<string, Row[]>;
  clienteAccess?: boolean;
} => ({
  clientes: [
    { id: CLI_A1, rfc: "AAA010101AAA", razon_social: "Alfa", despacho_id: DESPACHO_A, tipo_relacion: "cliente", cliente_padre_id: null },
    { id: CLI_A2, rfc: "AAA020202AAA", razon_social: "Beta", despacho_id: DESPACHO_A, tipo_relacion: "cliente", cliente_padre_id: null },
    { id: CLI_B1, rfc: "BBB030303BBB", razon_social: "Otro despacho", despacho_id: DESPACHO_B, tipo_relacion: "cliente", cliente_padre_id: null },
  ],
  memberships: [{ id: "m1", user_id: USER, despacho_id: DESPACHO_A, estado: "activo" }],
  despachos: [{ id: DESPACHO_A, owner_user_id: USER }],
  tables: {
    reportes_ejecutivos: [
      { id: "rep-a1", cliente_id: CLI_A1, despacho_id: DESPACHO_A },
      { id: "rep-a2", cliente_id: CLI_A2, despacho_id: DESPACHO_A },
      { id: "rep-b1", cliente_id: CLI_B1, despacho_id: DESPACHO_B },
    ],
  },
});

describe("assertClienteScope", () => {
  it("falla cerrado cuando no hay expediente activo", async () => {
    const sb = makeSupabase(baseDb());
    await expect(assertClienteScope(sb, USER, null)).rejects.toThrow(EXPEDIENTE_REQUERIDO);
    await expect(assertClienteScope(sb, USER, "")).rejects.toThrow(EXPEDIENTE_REQUERIDO);
  });

  it("resuelve el expediente propio del despacho", async () => {
    const sb = makeSupabase(baseDb());
    const scope = await assertClienteScope(sb, USER, CLI_A1);
    expect(scope).toMatchObject({ cliente_id: CLI_A1, despacho_id: DESPACHO_A, rfc: "AAA010101AAA" });
  });

  it("bloquea expedientes de otro despacho (manipulación de parámetro)", async () => {
    const sb = makeSupabase(baseDb());
    await expect(assertClienteScope(sb, USER, CLI_B1)).rejects.toThrow("No tienes acceso a este expediente.");
  });

  it("bloquea al usuario sin membresía activa", async () => {
    const db = baseDb();
    db.memberships[0].estado = "inactivo";
    db.despachos = [];
    await expect(assertClienteScope(makeSupabase(db), USER, CLI_A1)).rejects.toThrow("No tienes acceso a este expediente.");
  });

  it("respeta el permiso fino por expediente (has_cliente_access = false)", async () => {
    const sb = makeSupabase({ ...baseDb(), clienteAccess: false });
    await expect(assertClienteScope(sb, USER, CLI_A1)).rejects.toThrow("No tienes acceso a este expediente.");
  });

  it("resuelve el expediente padre cuando se apunta a un tercero", async () => {
    const db = baseDb();
    db.clientes.push({
      id: "tercero-1", rfc: "PRV040404PRV", razon_social: "Proveedor",
      despacho_id: DESPACHO_A, tipo_relacion: "proveedor", cliente_padre_id: CLI_A1,
    });
    const scope = await assertClienteScope(makeSupabase(db), USER, "tercero-1");
    expect(scope.cliente_id).toBe(CLI_A1);
  });

  it("no expone datos de un expediente inexistente", async () => {
    await expect(assertClienteScope(makeSupabase(baseDb()), USER, "no-existe")).rejects.toThrow(EXPEDIENTE_REQUERIDO);
  });
});

describe("assertRecordScope", () => {
  it("acepta el registro del expediente activo", async () => {
    const scope = await assertRecordScope(makeSupabase(baseDb()), USER, "reportes_ejecutivos", "rep-a1", CLI_A1);
    expect(scope.cliente_id).toBe(CLI_A1);
  });

  it("bloquea un registro de OTRO expediente del MISMO despacho", async () => {
    await expect(
      assertRecordScope(makeSupabase(baseDb()), USER, "reportes_ejecutivos", "rep-a2", CLI_A1),
    ).rejects.toThrow(REGISTRO_FUERA_DE_ALCANCE);
  });

  it("bloquea un registro de otro despacho", async () => {
    await expect(
      assertRecordScope(makeSupabase(baseDb()), USER, "reportes_ejecutivos", "rep-b1", CLI_B1),
    ).rejects.toThrow(REGISTRO_FUERA_DE_ALCANCE);
  });

  it("bloquea ids inexistentes y vacíos sin filtrar información", async () => {
    const sb = makeSupabase(baseDb());
    await expect(assertRecordScope(sb, USER, "reportes_ejecutivos", "")).rejects.toThrow(REGISTRO_FUERA_DE_ALCANCE);
    await expect(assertRecordScope(sb, USER, "reportes_ejecutivos", "rep-zzz")).rejects.toThrow(REGISTRO_FUERA_DE_ALCANCE);
  });
});
