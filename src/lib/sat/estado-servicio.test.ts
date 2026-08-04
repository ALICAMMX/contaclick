import { describe, it, expect } from "vitest";
import { decidirEstadoSat, nivelPac } from "./estado-servicio";

const base = {
  acceso: true,
  previstas: 5,
  credencialActiva: true,
  ilimitado: false,
  restante: 100,
  periodo: "2026-01",
  esSandbox: false,
  nivelServicio: "ok" as const,
};

describe("Estado del servicio SAT", () => {
  it("permite sincronizar cuando todo está en orden", () => {
    expect(decidirEstadoSat(base)).toMatchObject({ puede_ejecutar: true, causa: "ok" });
  });

  it("bloquea cuando el saldo del servicio es insuficiente", () => {
    const r = decidirEstadoSat({ ...base, nivelServicio: "insuficiente" });
    expect(r.puede_ejecutar).toBe(false);
    expect(r.causa).toBe("servicio_sin_saldo");
    expect(r.motivo).toContain("No se consumirá nada de tu cuota");
  });

  it("bloquea cuando la cuota del plan no alcanza y explica el motivo", () => {
    const r = decidirEstadoSat({ ...base, previstas: 40, restante: 10 });
    expect(r.causa).toBe("cuota_agotada");
    expect(r.motivo).toContain("40");
    expect(r.motivo).toContain("10");
  });

  it("bloquea sin credencial SAT activa", () => {
    expect(decidirEstadoSat({ ...base, credencialActiva: false }).causa).toBe("sin_credencial");
  });

  it("bloquea si no hay tipos de comprobante seleccionados", () => {
    expect(decidirEstadoSat({ ...base, previstas: 0 }).causa).toBe("sin_seleccion");
  });

  it("la cuenta bloqueada gana sobre cualquier otra causa", () => {
    const r = decidirEstadoSat({ ...base, acceso: false, motivoBloqueo: "Trial vencido", previstas: 0 });
    expect(r.causa).toBe("cuenta_bloqueada");
    expect(r.motivo).toBe("Trial vencido");
  });

  it("el sandbox nunca depende del saldo real del proveedor", () => {
    const r = decidirEstadoSat({ ...base, esSandbox: true, nivelServicio: "agotado" });
    expect(r.puede_ejecutar).toBe(true);
  });

  it("clasifica el nivel de saldo PAC", () => {
    expect(nivelPac(0, 5, 100)).toBe("agotado");
    expect(nivelPac(3, 5, 100)).toBe("insuficiente");
    expect(nivelPac(50, 5, 100)).toBe("critico");
    expect(nivelPac(5000, 5, 100)).toBe("ok");
  });
});
