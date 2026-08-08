import { describe, it, expect } from "vitest";
import {
  candadoRecuperable,
  decidirRecuperacion,
  RECLAMO_CANDADO_MS,
  SEMANTICA_MODULO,
} from "./reconciliacion";
import { evaluarProcesamiento, llaveModulo } from "./procesamiento";

const ahora = Date.parse("2026-08-08T21:00:00.000Z");

describe("semántica declarada de los módulos", () => {
  it("sólo Salud Fiscal persiste datos derivados y lo hace por reemplazo total", () => {
    expect(SEMANTICA_MODULO["salud_fiscal"]).toMatchObject({
      escribe: true,
      idempotencia: "reemplazo_total",
      llave_natural: "cliente_id,periodo",
    });
    for (const m of ["riesgo_sat", "auditor_cfdi", "efos"]) {
      expect(SEMANTICA_MODULO[m]!.escribe).toBe(false);
    }
  });
});

describe("decisión de recuperación", () => {
  it("módulo ejecutado pero evento final fallido: hay efectos probables → se reconstruye sin reejecutar", () => {
    const d = decidirRecuperacion({
      module_id: "salud_fiscal",
      evidencia: {
        existe: true,
        determinable: true,
        resultado: { score: 47, semaforo: "rojo" },
        at: "2026-08-08T20:26:48Z",
        fuente: "salud_fiscal_snapshots",
      },
    });
    expect(d.accion).toBe("reconstruir");
    expect(d.seguro_reejecutar).toBe(true);
  });

  it("efectos existentes sin resultado probable: recálculo de reemplazo, nunca acumulación", () => {
    const d = decidirRecuperacion({
      module_id: "salud_fiscal",
      evidencia: { existe: true, determinable: false },
    });
    expect(d.accion).toBe("ejecutar");
    expect(d.motivo).toMatch(/sustituye la fila completa/);
  });

  it("caso ambiguo con escritura acumulativa queda bloqueado", () => {
    const original = SEMANTICA_MODULO["salud_fiscal"]!;
    SEMANTICA_MODULO["salud_fiscal"] = { ...original, idempotencia: "acumulativa" };
    const d = decidirRecuperacion({
      module_id: "salud_fiscal",
      evidencia: { existe: true, determinable: false },
    });
    SEMANTICA_MODULO["salud_fiscal"] = original;
    expect(d.accion).toBe("bloquear");
    expect(d.seguro_reejecutar).toBe(false);
  });

  it("módulos de sólo lectura siempre son seguros de reejecutar", () => {
    for (const m of ["riesgo_sat", "auditor_cfdi", "efos"]) {
      const d = decidirRecuperacion({ module_id: m, evidencia: null });
      expect(d).toMatchObject({ accion: "ejecutar", seguro_reejecutar: true });
    }
  });

  it("sin efectos previos y con reemplazo total: se ejecuta", () => {
    const d = decidirRecuperacion({
      module_id: "salud_fiscal",
      evidencia: { existe: false, determinable: false },
    });
    expect(d.accion).toBe("ejecutar");
  });

  it("módulo desconocido nunca se ejecuta a ciegas", () => {
    expect(decidirRecuperacion({ module_id: "inventado" }).accion).toBe("bloquear");
  });
});

describe("candado por run_id + module_id", () => {
  it("la llave es estable y distingue módulo y corrida (doble clic y dos workers chocan)", () => {
    const a = llaveModulo("run-1", "salud_fiscal");
    const b = llaveModulo("run-1", "salud_fiscal");
    const c = llaveModulo("run-1", "riesgo_sat");
    const d = llaveModulo("run-2", "salud_fiscal");
    expect(a).toBe(b);
    expect(new Set([a, c, d]).size).toBe(3);
  });

  it("un evento iniciado reciente bloquea otra ejecución", () => {
    expect(
      candadoRecuperable({
        module_id: "salud_fiscal",
        iniciado_at: new Date(ahora - 60_000).toISOString(),
        ahora,
      }),
    ).toBe(false);
  });

  it("tras una caída, el candado vencido se reclama y el procesamiento se reanuda", () => {
    expect(
      candadoRecuperable({
        module_id: "salud_fiscal",
        iniciado_at: new Date(ahora - RECLAMO_CANDADO_MS - 1).toISOString(),
        ahora,
      }),
    ).toBe(true);
  });

  it("un candado sin fecha jamás se reclama", () => {
    expect(candadoRecuperable({ module_id: "salud_fiscal", iniciado_at: null, ahora })).toBe(false);
  });
});

describe("lectura de estado tras la recuperación", () => {
  const base = { cobertura: "total", nuevos: 1 };

  it("un evento iniciado persistente mantiene la corrida en recalculando y oculta el botón", () => {
    const e = evaluarProcesamiento({
      ...base,
      eventos: [{ module_id: "salud_fiscal", estado: "iniciado", iniciado_at: "x" }],
    });
    expect(e.estado_honesto).toBe("recalculando");
    expect(e.accion_label).toBeNull();
  });

  it("reconstrucción histórica + módulos de lectura cierran la corrida sin acumular", () => {
    const eventos = [
      { module_id: "salud_fiscal", estado: "completado" as const, motivo: null },
      { module_id: "riesgo_sat", estado: "completado" as const },
      { module_id: "auditor_cfdi", estado: "completado" as const },
      { module_id: "efos", estado: "omitido" as const, motivo: "Sin proveedores que contrastar." },
    ];
    const uno = evaluarProcesamiento({ ...base, eventos });
    const dos = evaluarProcesamiento({ ...base, eventos: [...eventos, ...eventos] });
    expect(uno.completo).toBe(true);
    expect(uno.accion_label).toBeNull();
    expect(dos.estado_honesto).toBe(uno.estado_honesto);
    expect(dos.faltantes).toEqual(uno.faltantes);
  });
});
