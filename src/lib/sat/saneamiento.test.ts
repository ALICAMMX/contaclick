import { describe, it, expect } from "vitest";
import {
  clasificarCorridaAtorada,
  puedeCerrarseManualmente,
  tieneFolioSat,
  MINUTOS_ATORADA,
} from "./saneamiento";

const AHORA = Date.parse("2026-01-10T12:00:00.000Z");
const haceMin = (m: number) => new Date(AHORA - m * 60_000).toISOString();

describe("saneamiento de corridas atoradas", () => {
  it("no toca una corrida recién iniciada", () => {
    const d = clasificarCorridaAtorada(
      { id: "a", estado: "solicitando", iniciado_at: haceMin(2), solicitudes: [] },
      AHORA,
    );
    expect(d.accion).toBe("ninguna");
  });

  it("cierra como inicio incompleto la que lleva más de 15 minutos sin folio", () => {
    const d = clasificarCorridaAtorada(
      { id: "a", estado: "solicitando", iniciado_at: haceMin(MINUTOS_ATORADA + 40), solicitudes: [] },
      AHORA,
    );
    expect(d.accion).toBe("cerrar_error");
    if (d.accion === "cerrar_error") expect(d.codigo).toBe("error_inicio_incompleto");
  });

  it("reencauza a esperando_sat cuando el SAT sí devolvió folio", () => {
    const d = clasificarCorridaAtorada(
      {
        id: "a",
        estado: "solicitando",
        iniciado_at: haceMin(120),
        solicitudes: [{ id_solicitud: "F-1", estado: "pendiente" } as any],
      },
      AHORA,
    );
    expect(d.accion).toBe("continuar_esperando");
  });

  it("nunca reabre una corrida ya cerrada", () => {
    const d = clasificarCorridaAtorada(
      { id: "a", estado: "error", iniciado_at: haceMin(500), solicitudes: [] },
      AHORA,
    );
    expect(d.accion).toBe("ninguna");
  });

  it("permite el cierre manual sin folio y lo impide con folio reciente", () => {
    expect(
      puedeCerrarseManualmente(
        { id: "a", estado: "solicitando", iniciado_at: haceMin(60), solicitudes: [] },
        AHORA,
      ).permitido,
    ).toBe(true);

    expect(
      puedeCerrarseManualmente(
        {
          id: "a",
          estado: "esperando_sat",
          iniciado_at: haceMin(60),
          solicitudes: [{ id_solicitud: "F-1", estado: "pendiente" } as any],
        },
        AHORA,
      ).permitido,
    ).toBe(false);
  });

  it("detecta folio SAT en cualquier solicitud", () => {
    expect(tieneFolioSat([{ estado: "pendiente" } as any])).toBe(false);
    expect(tieneFolioSat([{ id_solicitud: "F-9" } as any])).toBe(true);
  });
});
