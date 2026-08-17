import { describe, expect, it } from "vitest";
import {
  decidirOcurrencia,
  llaveOcurrencia,
  proximaEjecucion,
  resolverPeriodoProgramado,
} from "./programacion";

const base = {
  zona_horaria: "America/Mexico_City",
  dias_semana: [] as number[],
  dia_mes: null as number | null,
  fecha_unica: null as string | null,
  recurrencia: null as any,
};

describe("proximaEjecucion", () => {
  it("agenda la siguiente ocurrencia diaria en hora local, no UTC", () => {
    const d = proximaEjecucion(
      { ...base, tipo: "recurrente", recurrencia: "diaria", hora: 2, minuto: 0 },
      new Date("2026-03-10T12:00:00Z"),
    );
    // 02:00 en Ciudad de México del 11 de marzo = 08:00 UTC.
    expect(d?.toISOString()).toBe("2026-03-11T08:00:00.000Z");
  });

  it("respeta el día del mes y no se sale del mes corto", () => {
    const d = proximaEjecucion(
      { ...base, tipo: "recurrente", recurrencia: "mensual", dia_mes: 31, hora: 3, minuto: 30 },
      new Date("2026-02-05T00:00:00Z"),
    );
    expect(d).not.toBeNull();
    expect(d!.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("una ejecución única ya vencida no vuelve a agendarse", () => {
    const d = proximaEjecucion(
      { ...base, tipo: "unica", fecha_unica: "2026-01-01", hora: 5, minuto: 0 },
      new Date("2026-05-01T00:00:00Z"),
    );
    expect(d).toBeNull();
  });
});

describe("decidirOcurrencia", () => {
  const programada = new Date("2026-03-10T08:00:00Z");
  it("ejecuta dentro de la tolerancia", () => {
    const r = decidirOcurrencia({
      programada_at: programada,
      ahora: new Date("2026-03-10T08:20:00Z"),
      tolerancia_minutos: 60,
      politica: "omitir",
    });
    expect(r.accion).toBe("ejecutar");
  });
  it("omite fuera de tolerancia cuando la política es omitir", () => {
    const r = decidirOcurrencia({
      programada_at: programada,
      ahora: new Date("2026-03-10T11:00:00Z"),
      tolerancia_minutos: 60,
      politica: "omitir",
    });
    expect(r.accion).toBe("omitir");
  });
  it("recupera una sola ocurrencia atrasada", () => {
    const r = decidirOcurrencia({
      programada_at: programada,
      ahora: new Date("2026-03-10T11:00:00Z"),
      tolerancia_minutos: 60,
      politica: "recuperar",
    });
    expect(r.accion).toBe("ejecutar");
    expect(r.retraso_ms).toBe(3 * 3600 * 1000);
  });
});

describe("resolverPeriodoProgramado", () => {
  it("desde la última descarga aplica el traslape solicitado", () => {
    const r = resolverPeriodoProgramado({
      opcion: "desde_ultima",
      zona_horaria: "America/Mexico_City",
      ahora: new Date("2026-03-10T15:00:00Z"),
      ultima_exitosa_hasta: "2026-03-05",
      solapamiento_dias: 2,
      rango_desde: null,
      rango_hasta: null,
    });
    expect(r.desde).toBe("2026-03-03");
    expect(r.hasta >= r.desde).toBe(true);
  });

  it("el día anterior es un rango de un solo día local", () => {
    const r = resolverPeriodoProgramado({
      opcion: "dia_anterior",
      zona_horaria: "America/Mexico_City",
      ahora: new Date("2026-03-10T08:00:00Z"),
      ultima_exitosa_hasta: null,
      solapamiento_dias: 0,
      rango_desde: null,
      rango_hasta: null,
    });
    expect(r.desde).toBe("2026-03-09");
    expect(r.hasta).toBe("2026-03-09");
  });
});

describe("llaveOcurrencia", () => {
  it("es estable para la misma ocurrencia", () => {
    const a = llaveOcurrencia("abc", new Date("2026-03-10T08:00:00Z"));
    const b = llaveOcurrencia("abc", new Date("2026-03-10T08:00:00.000Z"));
    expect(a).toBe(b);
  });
});
