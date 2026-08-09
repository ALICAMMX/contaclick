import { describe, expect, it } from "vitest";
import {
  criterioTemporal,
  dentroDelPeriodo,
  explicarInclusion,
  fechaHoraLocalSat,
  fechaLocalSat,
  periodoEfectivo,
} from "./periodo";
import { construirSolicitudDescarga } from "./solicitud-xml";

describe("periodo efectivo", () => {
  it("ambos extremos son inclusivos", () => {
    const p = periodoEfectivo("2026-07-29", "2026-08-01");
    expect(p.valido).toBe(true);
    if (!p.valido) return;
    expect(p.fechaInicial).toBe("2026-07-29T00:00:00");
    expect(p.fechaFinal).toBe("2026-08-01T23:59:59");
    expect(p.dias).toBe(4);
  });

  it("un solo día es un día, no cero", () => {
    const p = periodoEfectivo("2026-08-01", "2026-08-01");
    expect(p.valido && p.dias).toBe(1);
  });

  it("cruza cambio de mes y de año sin perder días", () => {
    expect(periodoEfectivo("2026-01-30", "2026-02-02")).toMatchObject({ dias: 4 });
    expect(periodoEfectivo("2025-12-30", "2026-01-02")).toMatchObject({ dias: 4 });
  });

  it("rechaza rangos invertidos y formatos malos", () => {
    expect(periodoEfectivo("2026-08-03", "2026-08-01").valido).toBe(false);
    expect(periodoEfectivo("03/08/2026", "2026-08-01").valido).toBe(false);
  });

  it("coincide exactamente con lo que se envía al SAT", () => {
    const s = construirSolicitudDescarga({
      rfc: "AAA010101AAA",
      rfcSolicitante: "AAA010101AAA",
      desde: "2026-07-29",
      hasta: "2026-08-01",
      direccion: "recibidos",
      tipo: "CFDI",
      estado: "Vigente",
    });
    const p = periodoEfectivo("2026-07-29", "2026-08-01");
    expect(p.valido).toBe(true);
    if (!p.valido) return;
    expect(s.campos["FechaInicial"]).toBe(p.fechaInicial);
    expect(s.campos["FechaFinal"]).toBe(p.fechaFinal);
  });
});

describe("fechas en la zona del SAT", () => {
  it("no adelanta el día por usar UTC", () => {
    // 2026-08-01 18:00 hora del centro = 2026-08-02T00:00Z
    expect(fechaLocalSat(new Date("2026-08-02T00:00:00Z"))).toBe("2026-08-01");
  });

  it("convierte la marca almacenada a hora local del centro", () => {
    expect(fechaHoraLocalSat(new Date("2026-08-02T05:26:04Z"))).toBe("2026-08-01T23:26:04");
    expect(fechaHoraLocalSat(new Date("2026-08-02T09:15:29Z"))).toBe("2026-08-02T03:15:29");
  });
});

describe("caso real BCDD4B19 — comportamiento observado no explicado", () => {
  // HECHO OFICIAL: FechaInicial/FechaFinal filtran por fecha de emisión,
  // en ambas direcciones. No hay fuente oficial que documente certificación.
  const emision = "2026-08-02T05:26:04Z"; // 2026-08-01 23:26:04 centro
  const certificacion = "2026-08-02T09:15:29Z"; // 2026-08-02 03:15:29 centro

  it("según el criterio documentado, la emisión SÍ cae en 07-29 → 08-01", () => {
    expect(dentroDelPeriodo(emision, "2026-07-29", "2026-08-01")).toBe(true);
  });

  it("la explicación usa emisión, nunca certificación, como criterio", () => {
    const e = explicarInclusion({
      direccion: "recibidos",
      desde: "2026-07-29",
      hasta: "2026-08-01",
      emision,
      certificacion,
    });
    expect(e.incluido).toBe(true);
    expect(e.instante).toBe("2026-08-01T23:26:04");
    expect(e.criterio).toBe(criterioTemporal("recibidos"));
    expect(e.criterio).toBe(criterioTemporal("emitidos"));
    expect(e.criterio).toMatch(/emisión/);
    expect(e.criterio).not.toMatch(/certificaci/i);
  });

  it("la certificación se reporta aparte, sólo como dato informativo", () => {
    const e = explicarInclusion({
      direccion: "recibidos",
      desde: "2026-07-29",
      hasta: "2026-08-01",
      emision,
      certificacion,
    });
    expect(e.certificacion).toBe("2026-08-02T03:15:29");
  });

  it("la ausencia se clasifica como anomalía sin causa atribuida", () => {
    const c = clasificarAusencia({
      direccion: "recibidos",
      desde: "2026-07-29",
      hasta: "2026-08-01",
      emision,
      certificacion,
    });
    expect(c.esperado).toBe(true);
    expect(c.anomalia).toBe(true);
    expect(c.etiqueta).toMatch(/no explicado/);
    expect(c.hipotesis.length).toBeGreaterThan(3);
  });

  it("ninguna nota del producto afirma que recibidos usen certificación", () => {
    expect(notaCriterio("recibidos")).toMatch(/fecha de emisión/);
    expect(notaCriterio("recibidos")).not.toMatch(/el SAT filtra por fecha de certificación/i);
  });
});

