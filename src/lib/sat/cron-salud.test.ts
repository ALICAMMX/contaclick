import { describe, it, expect } from "vitest";
import { evaluarSaludCron } from "./cron-salud";
import { CRON_SAT_VERSION } from "./cron-version";
import { sanearCorridasAtoradas } from "./saneamiento.server";

const AHORA = Date.parse("2026-01-10T12:00:00.000Z");
const haceMin = (m: number) => new Date(AHORA - m * 60_000).toISOString();

/**
 * Doble de la base de datos: reproduce el subconjunto de PostgREST que usa el
 * saneamiento (filtros in/is/eq, order, limit, update condicional y rpc).
 */
function fakeDb(filas: any[]) {
  const rpc: { nombre: string; args: any }[] = [];
  const tabla = () => {
    const estado = { filtros: [] as ((r: any) => boolean)[], modo: "select" as string, patch: {} as any };
    const api: any = {
      select() {
        return api;
      },
      in(col: string, vals: any[]) {
        estado.filtros.push((r) => vals.includes(r[col]));
        return api;
      },
      is(col: string, val: any) {
        estado.filtros.push((r) => (r[col] ?? null) === val);
        return api;
      },
      eq(col: string, val: any) {
        estado.filtros.push((r) => r[col] === val);
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return Promise.resolve({ data: filas.filter((r) => estado.filtros.every((f) => f(r))) });
      },
      maybeSingle() {
        const r = filas.find((x) => estado.filtros.every((f) => f(x))) ?? null;
        return Promise.resolve({ data: r });
      },
      update(patch: any) {
        estado.modo = "update";
        estado.patch = patch;
        return api;
      },
      then(res: any) {
        // se resuelve al terminar la cadena de update
        const objetivo = filas.filter((r) => estado.filtros.every((f) => f(r)));
        if (estado.modo === "update") for (const r of objetivo) Object.assign(r, estado.patch);
        return Promise.resolve({ data: objetivo, error: null }).then(res);
      },
    };
    return api;
  };
  return {
    rpc: (nombre: string, args: any) => {
      rpc.push({ nombre, args });
      return Promise.resolve({ data: true, error: null });
    },
    from: () => tabla(),
    llamadasRpc: rpc,
  } as any;
}

describe("cron SAT · saneamiento desplegado", () => {
  it("cierra una corrida solicitando vieja aunque no haya nada que cosechar", async () => {
    const filas = [
      {
        id: "r1",
        estado: "solicitando",
        estatus: "en_curso",
        iniciado_at: haceMin(660),
        solicitudes: [],
        errores: [],
        idempotency_key: "k1",
      },
    ];
    const db = fakeDb(filas);
    const res = await sanearCorridasAtoradas(db, 50, AHORA);
    expect(res.cerradas).toBe(1);
    expect(filas[0].estado).toBe("error");
    expect(filas[0].estatus).toBe("error");
    expect(db.llamadasRpc[0]?.nombre).toBe("pac_devolver_reserva");
  });

  it("rescata corridas heredadas sin columna estado usando el estatus en_curso", async () => {
    const filas = [
      {
        id: "r2",
        estado: null,
        estatus: "en_curso",
        iniciado_at: null,
        created_at: haceMin(300),
        solicitudes: [],
        errores: [],
        idempotency_key: null,
      },
    ];
    const res = await sanearCorridasAtoradas(fakeDb(filas), 50, AHORA);
    expect(res.cerradas).toBe(1);
  });

  it("es idempotente: la segunda pasada ya no encuentra nada", async () => {
    const filas = [
      {
        id: "r3",
        estado: "solicitando",
        estatus: "en_curso",
        iniciado_at: haceMin(60),
        solicitudes: [],
        errores: [],
      },
    ];
    const db = fakeDb(filas);
    await sanearCorridasAtoradas(db, 50, AHORA);
    const segunda = await sanearCorridasAtoradas(db, 50, AHORA);
    expect(segunda.cerradas).toBe(0);
    expect(segunda.revisadas).toBe(0);
  });

  it("dos ejecuciones simultáneas dejan el mismo resultado final", async () => {
    const filas = [
      {
        id: "r4",
        estado: "solicitando",
        estatus: "en_curso",
        iniciado_at: haceMin(90),
        solicitudes: [],
        errores: [],
      },
    ];
    const db = fakeDb(filas);
    await Promise.all([
      sanearCorridasAtoradas(db, 50, AHORA),
      sanearCorridasAtoradas(db, 50, AHORA),
    ]);
    expect(filas[0].estado).toBe("error");
  });

  it("una corrida con folio se reencauza a esperando_sat sin reenviar nada", async () => {
    const filas = [
      {
        id: "r5",
        estado: "solicitando",
        estatus: "en_curso",
        iniciado_at: haceMin(120),
        solicitudes: [{ id_solicitud: "F-1", estado: "pendiente" }],
        errores: [],
      },
    ];
    const db = fakeDb(filas);
    const res = await sanearCorridasAtoradas(db, 50, AHORA);
    expect(res.reencauzadas).toBe(1);
    expect(filas[0].estado).toBe("esperando_sat");
    expect(db.llamadasRpc.length).toBe(0);
  });

  it("no consume cuota: nunca invoca incrementar_uso_sat", async () => {
    const filas = [
      { id: "r6", estado: "solicitando", estatus: "en_curso", iniciado_at: haceMin(600), solicitudes: [], errores: [] },
    ];
    const db = fakeDb(filas);
    await sanearCorridasAtoradas(db, 50, AHORA);
    expect(db.llamadasRpc.some((c: any) => c.nombre === "incrementar_uso_sat")).toBe(false);
  });

  it("respeta la zona horaria: fechas UTC con desfase se miden igual", async () => {
    const filas = [
      {
        id: "r7",
        estado: "solicitando",
        estatus: "en_curso",
        iniciado_at: "2026-01-10T05:00:00.000-06:00", // = 11:00Z, 60 min antes
        solicitudes: [],
        errores: [],
      },
    ];
    const res = await sanearCorridasAtoradas(fakeDb(filas), 50, AHORA);
    expect(res.cerradas).toBe(1);
  });
});

describe("cron SAT · heartbeat y alerta", () => {
  it("marca degradado después de 20 minutos sin éxito", () => {
    const s = evaluarSaludCron(haceMin(25), AHORA);
    expect(s.estado).toBe("degradado");
  });

  it("marca saludable dentro de la ventana", () => {
    expect(evaluarSaludCron(haceMin(9), AHORA).estado).toBe("saludable");
  });

  it("sin ejecuciones registradas informa sin_datos, nunca saludable", () => {
    expect(evaluarSaludCron(null, AHORA).estado).toBe("sin_datos");
  });

  it("la versión desplegada es detectable", () => {
    expect(CRON_SAT_VERSION).toMatch(/^sat-cron-/);
  });
});
