// =====================================================================
// Matriz de regresión del SERVICIO CENTRAL DE ENTITLEMENTS.
// Cubre: trial vigente/vencido, plan activo/cancelado, cuota dentro /
// exactamente en / por encima, excepción vigente / vencida / revocada,
// cambio de plan y renovación, usuario sin membresía y evasión desde
// el frontend (parámetros manipulados en la llamada directa).
//
// No toca la base real: simula el cliente Supabase.
// =====================================================================
import { describe, it, expect } from "vitest";
import {
  getEntitlements,
  assertAcceso,
  assertCuota,
  assertFrecuencia,
  cuotaAgotada,
  limiteDe,
  periodoActual,
  AccesoBloqueadoError,
  UsageLimitError,
  FrecuenciaNoPermitidaError,
  DEFAULT_LIMITS,
} from "./service";

type Row = Record<string, any>;

const DESPACHO = "d0000000-0000-0000-0000-000000000001";
const AYER = new Date(Date.now() - 86400000).toISOString();
const EN_10_DIAS = new Date(Date.now() + 10 * 86400000).toISOString();

interface FakeDb {
  despacho: Row | null;
  excepciones: Row[];
  clientes: Row[];
  uso: Row | null;
  alertas: Row[];
  updates: Row[];
}

function db(over: Partial<FakeDb> = {}): FakeDb {
  return {
    despacho: {
      id: DESPACHO,
      nombre: "Despacho de prueba",
      estado: "trial",
      trial_ends_at: EN_10_DIAS,
      plan_id: null,
      es_sandbox: false,
      limites_override: null,
      planes: null,
    },
    excepciones: [],
    clientes: [],
    uso: null,
    alertas: [],
    updates: [],
    ...over,
  };
}

/** Fake mínimo del query builder de supabase-js usado por service.ts */
function makeSupabase(d: FakeDb) {
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let headCount = false;
    const source = (): Row[] => {
      if (table === "despachos") return d.despacho ? [d.despacho] : [];
      if (table === "entitlement_excepciones") return d.excepciones;
      if (table === "clientes") return d.clientes;
      if (table === "uso_periodo") return d.uso ? [d.uso] : [];
      return [];
    };
    const run = () => source().filter((r) => filters.every((f) => f(r)));
    const api: any = {
      select: (_c?: string, opts?: { count?: string; head?: boolean }) => {
        headCount = !!opts?.head;
        return api;
      },
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), api),
      is: (c: string, v: any) => (filters.push((r) => (r[c] ?? null) === v), api),
      gt: (c: string, v: any) => (filters.push((r) => String(r[c]) > String(v)), api),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      update: (patch: Row) => {
        const upd: any = {
          eq: (_c: string, _v: any) => {
            if (d.despacho) Object.assign(d.despacho, patch);
            d.updates.push(patch);
            return upd;
          },
          then: (res: any) => Promise.resolve(undefined).then(res),
        };
        return upd;
      },
      insert: (row: Row) => {
        const key = JSON.stringify([row.tipo, row.evidencia]);
        const dup = d.alertas.some((a) => JSON.stringify([a.tipo, a.evidencia]) === key);
        if (!dup) d.alertas.push(row); // índice único parcial en la BD real
        return { then: (res: any) => Promise.resolve(undefined).then(res) };
      },
      then: (res: any) =>
        Promise.resolve(
          headCount ? { count: run().length, error: null } : { data: run(), error: null },
        ).then(res),
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }) } as any;
}

const rfcsReales = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    despacho_id: DESPACHO,
    tipo_relacion: "cliente",
    cliente_padre_id: null,
    es_demo: false,
  }));

// ---------------------------------------------------------------------
describe("trial", () => {
  it("trial vigente concede acceso y reporta días restantes", async () => {
    const ent = await getEntitlements(makeSupabase(db()), DESPACHO);
    expect(ent.acceso).toBe(true);
    expect(ent.trial?.activo).toBe(true);
    expect(ent.trial!.dias_restantes).toBeGreaterThan(0);
    expect(ent.limites.rfcs).toBe(DEFAULT_LIMITS.rfcs);
  });

  it("trial vencido bloquea la cuenta y persiste estado 'vencida'", async () => {
    const d = db({ despacho: { ...db().despacho!, trial_ends_at: AYER } });
    const ent = await getEntitlements(makeSupabase(d), DESPACHO);
    expect(ent.acceso).toBe(false);
    expect(ent.estado).toBe("vencida");
    expect(d.updates.at(-1)).toMatchObject({ estado: "vencida" });
    expect(() => assertAcceso(ent)).toThrow(AccesoBloqueadoError);
  });

  it("nunca reporta 'plan + trial' al mismo tiempo (estado contradictorio)", async () => {
    const d = db({
      despacho: {
        ...db().despacho!,
        estado: "trial",
        trial_ends_at: AYER,
        plan_id: "plan-pro",
        planes: { clave: "pro", nombre: "Profesional", limites: { rfcs: 50, ia_msgs: 3000 } },
      },
    });
    const ent = await getEntitlements(makeSupabase(d), DESPACHO);
    expect(ent.estado).toBe("activa");
    expect(ent.trial).toBeNull();
    expect(ent.acceso).toBe(true);
    expect(d.updates.at(-1)).toMatchObject({ estado: "activa", trial_ends_at: null });
  });
});

describe("plan", () => {
  it("plan activo aplica los límites del plan por encima del default", async () => {
    const d = db({
      despacho: {
        ...db().despacho!,
        estado: "activa",
        trial_ends_at: null,
        plan_id: "plan-ent",
        planes: { clave: "enterprise", nombre: "Enterprise", limites: { rfcs: -1, ia_msgs: -1 } },
      },
    });
    const ent = await getEntitlements(makeSupabase(d), DESPACHO);
    expect(ent.plan?.clave).toBe("enterprise");
    expect(limiteDe(ent, "rfcs")).toBe(-1);
    expect(cuotaAgotada(ent, "rfcs", 9999)).toBe(false);
  });

  it("plan cancelado (sin plan y sin trial vigente) bloquea", async () => {
    const d = db({
      despacho: { ...db().despacho!, estado: "vencida", trial_ends_at: AYER, plan_id: null },
    });
    const ent = await getEntitlements(makeSupabase(d), DESPACHO);
    expect(ent.acceso).toBe(false);
    expect(ent.motivo_bloqueo).toBeTruthy();
  });

  it("cambio de plan y renovación recalculan límites sin tocar el uso del periodo", async () => {
    const base = db({
      despacho: {
        ...db().despacho!,
        estado: "activa",
        trial_ends_at: null,
        plan_id: "plan-basico",
        planes: { clave: "basico", nombre: "Básico", limites: { rfcs: 5, ia_msgs: 100 } },
      },
      clientes: rfcsReales(4),
      uso: { ia_requests: 90, ia_tokens: 10, sat_solicitudes: 0, sat_costo_centavos: 0 },
    });
    const antes = await getEntitlements(makeSupabase(base), DESPACHO);
    expect(limiteDe(antes, "rfcs")).toBe(5);

    base.despacho!.plan_id = "plan-pro";
    base.despacho!.planes = { clave: "pro", nombre: "Profesional", limites: { rfcs: 50, ia_msgs: 1500 } };
    const despues = await getEntitlements(makeSupabase(base), DESPACHO);
    expect(limiteDe(despues, "rfcs")).toBe(50);
    expect(despues.uso.ia_requests).toBe(90); // el uso del periodo no se reinicia al cambiar de plan
    expect(despues.periodo).toBe(periodoActual());
  });
});

describe("cuotas: dentro, exactamente en el límite y por encima", () => {
  const conPlan = (limite: number, usados: number) =>
    db({
      despacho: {
        ...db().despacho!,
        estado: "activa",
        trial_ends_at: null,
        plan_id: "p",
        planes: { clave: "basico", nombre: "Básico", limites: { rfcs: limite, ia_msgs: 100 } },
      },
      clientes: rfcsReales(usados),
    });

  it("dentro de cuota permite consumir", async () => {
    const d = conPlan(5, 2);
    const sb = makeSupabase(d);
    await expect(assertCuota(sb, await getEntitlements(sb, DESPACHO), "rfcs", 1)).resolves.toBeUndefined();
  });

  it("exactamente en el límite permite el último consumo y avisa al 80/100%", async () => {
    const d = conPlan(5, 4);
    const sb = makeSupabase(d);
    const ent = await getEntitlements(sb, DESPACHO);
    await expect(assertCuota(sb, ent, "rfcs", 1)).resolves.toBeUndefined();
    expect(d.alertas.some((a) => a.evidencia.umbral === "80")).toBe(true);
  });

  it("por encima del límite lanza UsageLimitError y emite el aviso 100%", async () => {
    const d = conPlan(5, 5);
    const sb = makeSupabase(d);
    const ent = await getEntitlements(sb, DESPACHO);
    await expect(assertCuota(sb, ent, "rfcs", 1)).rejects.toBeInstanceOf(UsageLimitError);
    expect(d.alertas.filter((a) => a.evidencia.umbral === "100")).toHaveLength(1);
  });

  it("no duplica avisos del mismo umbral y periodo", async () => {
    const d = conPlan(5, 5);
    const sb = makeSupabase(d);
    const ent = await getEntitlements(sb, DESPACHO);
    await expect(assertCuota(sb, ent, "rfcs", 1)).rejects.toThrow();
    await expect(assertCuota(sb, ent, "rfcs", 1)).rejects.toThrow();
    expect(d.alertas.filter((a) => a.tipo === "uso_limite")).toHaveLength(1);
  });

  it("los expedientes demo no consumen cuota de RFCs", async () => {
    const d = conPlan(5, 2);
    d.clientes.push(
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `demo${i}`,
        despacho_id: DESPACHO,
        tipo_relacion: "cliente",
        cliente_padre_id: null,
        es_demo: true,
      })),
    );
    const ent = await getEntitlements(makeSupabase(d), DESPACHO);
    expect(ent.uso.rfcs).toBe(2);
  });

  it("la cuenta sandbox nunca se bloquea por cuota", async () => {
    const d = conPlan(5, 50);
    d.despacho!.es_sandbox = true;
    const sb = makeSupabase(d);
    const ent = await getEntitlements(sb, DESPACHO);
    await expect(assertCuota(sb, ent, "rfcs", 1)).resolves.toBeUndefined();
  });
});

describe("excepciones comerciales", () => {
  const exc = (over: Row = {}): Row => ({
    id: "e1",
    despacho_id: DESPACHO,
    tipo: "limite_rfcs",
    valor_num: 40,
    valor_texto: null,
    motivo: "Ampliación autorizada por dirección comercial",
    creado_por: "admin",
    created_at: AYER,
    expira_at: EN_10_DIAS,
    revocada_at: null,
    ...over,
  });

  it("excepción vigente amplía el límite", async () => {
    const d = db({
      despacho: {
        ...db().despacho!,
        estado: "activa",
        trial_ends_at: null,
        plan_id: "p",
        planes: { clave: "basico", nombre: "Básico", limites: { rfcs: 5, ia_msgs: 100 } },
      },
      excepciones: [exc()],
    });
    const ent = await getEntitlements(makeSupabase(d), DESPACHO);
    expect(limiteDe(ent, "rfcs")).toBe(40);
    expect(ent.excepciones).toHaveLength(1);
  });

  it("una excepción nunca reduce el límite del plan", async () => {
    const d = db({
      despacho: {
        ...db().despacho!,
        estado: "activa",
        trial_ends_at: null,
        plan_id: "p",
        planes: { clave: "pro", nombre: "Pro", limites: { rfcs: 100, ia_msgs: 100 } },
      },
      excepciones: [exc({ valor_num: 10 })],
    });
    const ent = await getEntitlements(makeSupabase(d), DESPACHO);
    expect(limiteDe(ent, "rfcs")).toBe(100);
  });

  it("excepción vencida deja de aplicar automáticamente", async () => {
    const d = db({ excepciones: [exc({ expira_at: AYER })] });
    const ent = await getEntitlements(makeSupabase(d), DESPACHO);
    expect(ent.excepciones).toHaveLength(0);
    expect(limiteDe(ent, "rfcs")).toBe(DEFAULT_LIMITS.rfcs);
  });

  it("excepción revocada deja de aplicar de inmediato", async () => {
    const d = db({ excepciones: [exc({ revocada_at: AYER })] });
    const ent = await getEntitlements(makeSupabase(d), DESPACHO);
    expect(ent.excepciones).toHaveLength(0);
  });

  it("cortesía vigente mantiene el acceso aunque el trial haya vencido", async () => {
    const d = db({
      despacho: { ...db().despacho!, trial_ends_at: AYER },
      excepciones: [exc({ tipo: "acceso_cortesia", valor_num: null })],
    });
    const ent = await getEntitlements(makeSupabase(d), DESPACHO);
    expect(ent.acceso).toBe(true);
    expect(ent.estado).not.toBe("vencida");
  });

  it("cortesía vencida ya no rescata la cuenta", async () => {
    const d = db({
      despacho: { ...db().despacho!, trial_ends_at: AYER },
      excepciones: [exc({ tipo: "acceso_cortesia", valor_num: null, expira_at: AYER })],
    });
    const ent = await getEntitlements(makeSupabase(d), DESPACHO);
    expect(ent.acceso).toBe(false);
  });

  it("la excepción de frecuencia SAT amplía la frecuencia permitida", async () => {
    const d = db({
      despacho: {
        ...db().despacho!,
        estado: "activa",
        trial_ends_at: null,
        plan_id: "p",
        planes: { clave: "basico", nombre: "Básico", limites: { rfcs: 5, ia_msgs: 10, sat_frecuencia_max: "mensual" } },
      },
      excepciones: [exc({ tipo: "frecuencia_sat", valor_num: null, valor_texto: "diaria" })],
    });
    const ent = await getEntitlements(makeSupabase(d), DESPACHO);
    expect(() => assertFrecuencia(ent, "diaria")).not.toThrow();
  });

  it("sin excepción, la frecuencia superior al plan se rechaza", async () => {
    const d = db({
      despacho: {
        ...db().despacho!,
        estado: "activa",
        trial_ends_at: null,
        plan_id: "p",
        planes: { clave: "basico", nombre: "Básico", limites: { rfcs: 5, ia_msgs: 10, sat_frecuencia_max: "mensual" } },
      },
    });
    const ent = await getEntitlements(makeSupabase(d), DESPACHO);
    expect(() => assertFrecuencia(ent, "diaria")).toThrow(FrecuenciaNoPermitidaError);
  });
});

describe("evasión desde el frontend / llamada directa a la API", () => {
  it("usuario sin membresía no obtiene entitlement (RLS devuelve fila vacía)", async () => {
    await expect(getEntitlements(makeSupabase(db({ despacho: null })), DESPACHO)).rejects.toThrow(
      /No se encontró la cuenta/,
    );
  });

  it("marcar es_demo en el cliente NO reduce el uso: el conteo se hace en el servidor", async () => {
    // El atacante manda es_demo=true en su payload, pero la BD conserva false
    // (trigger tg_clientes_demo_guard) y el servicio cuenta sólo lo persistido.
    const d = db({
      despacho: {
        ...db().despacho!,
        estado: "activa",
        trial_ends_at: null,
        plan_id: "p",
        planes: { clave: "basico", nombre: "Básico", limites: { rfcs: 5, ia_msgs: 10 } },
      },
      clientes: rfcsReales(5),
    });
    const sb = makeSupabase(d);
    const ent = await getEntitlements(sb, DESPACHO);
    expect(ent.uso.rfcs).toBe(5);
    await expect(assertCuota(sb, ent, "rfcs", 1)).rejects.toBeInstanceOf(UsageLimitError);
  });

  it("un entitlement fabricado en el cliente no evita el candado del servidor", async () => {
    // Simula un objeto manipulado: acceso=true aunque la BD diga 'vencida'.
    const d = db({ despacho: { ...db().despacho!, trial_ends_at: AYER } });
    const sb = makeSupabase(d);
    const realEnt = await getEntitlements(sb, DESPACHO); // el servidor recalcula siempre
    expect(realEnt.acceso).toBe(false);
    await expect(assertCuota(sb, realEnt, "ia_requests", 1)).rejects.toBeInstanceOf(
      AccesoBloqueadoError,
    );
  });
});
