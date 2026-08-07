import { describe, expect, it } from "vitest";
import { decidirEstadoSat, nivelPac } from "./estado-servicio";

const base = {
  proveedor: "sat_directo" as const,
  acceso: true,
  previstas: 2,
  rangoValido: true,
  credencialActiva: true,
  ilimitado: false,
  restante: 10,
  periodo: "2026-08",
  esSandbox: false,
};

describe("nivelPac", () => {
  it("clasifica el saldo del proveedor", () => {
    expect(nivelPac(0, 2, 200)).toBe("agotado");
    expect(nivelPac(1, 2, 200)).toBe("insuficiente");
    expect(nivelPac(150, 2, 200)).toBe("critico");
    expect(nivelPac(5000, 2, 200)).toBe("ok");
  });
});

describe("decidirEstadoSat", () => {
  it("autoriza cuando todo está en orden", () => {
    const d = decidirEstadoSat(base);
    expect(d.puede_ejecutar).toBe(true);
    expect(d.causa).toBe("ok");
  });

  it("bloquea sin dirección seleccionada", () => {
    const d = decidirEstadoSat({ ...base, previstas: 0 });
    expect(d.causa).toBe("sin_seleccion");
    expect(d.accion).toBeTruthy();
  });

  it("bloquea con rango de fechas inválido", () => {
    const d = decidirEstadoSat({ ...base, rangoValido: false });
    expect(d.causa).toBe("rango_invalido");
  });

  it("bloquea sin e.firma activa", () => {
    const d = decidirEstadoSat({ ...base, credencialActiva: false });
    expect(d.causa).toBe("sin_credencial");
    expect(d.motivo).toMatch(/e\.firma/i);
  });

  it("bloquea con e.firma vencida", () => {
    const d = decidirEstadoSat({
      ...base,
      efirmaVenceAt: "2020-01-01T00:00:00Z",
      ahora: Date.parse("2026-08-01T00:00:00Z"),
    });
    expect(d.causa).toBe("efirma_vencida");
  });

  it("bloquea si ya hay una corrida activa con la misma ventana", () => {
    const d = decidirEstadoSat({ ...base, solicitudActiva: true });
    expect(d.causa).toBe("solicitud_activa");
    expect(d.motivo).toMatch(/asíncrono/i);
  });

  it("bloquea cuando la cuota del plan no alcanza", () => {
    const d = decidirEstadoSat({ ...base, previstas: 50, restante: 3 });
    expect(d.causa).toBe("cuota_agotada");
  });

  it("bloquea con la cuenta suspendida", () => {
    const d = decidirEstadoSat({ ...base, acceso: false, motivoBloqueo: "Suscripción vencida" });
    expect(d.causa).toBe("cuenta_bloqueada");
    expect(d.motivo).toBe("Suscripción vencida");
  });

  it("SAT directo NUNCA se bloquea por saldo de proveedor", () => {
    const d = decidirEstadoSat({ ...base, nivelServicio: "agotado" });
    expect(d.puede_ejecutar).toBe(true);
    expect(d.causa).toBe("ok");
  });

  it("el PAC no está disponible mientras no se contrate", () => {
    const d = decidirEstadoSat({ ...base, proveedor: "pac" });
    expect(d.causa).toBe("proveedor_no_disponible");
    expect(d.motivo).toMatch(/pendiente de configuración/i);
  });

  it("sandbox no consulta saldo de proveedor", () => {
    const d = decidirEstadoSat({ ...base, esSandbox: true, nivelServicio: "agotado" });
    expect(d.puede_ejecutar).toBe(true);
  });
});
