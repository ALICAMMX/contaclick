import { describe, expect, it } from "vitest";
import { resolverRangoSat, ultimoDiaCompletoSat } from "./periodo";
import { construirSolicitudDescarga } from "./solicitud-xml";
import { resolverRango } from "./sat-sync.functions";

// Instante real del incidente: 2026-08-17 22:38 hora del centro = 2026-08-18T04:38Z
const AHORA = new Date("2026-08-18T04:38:00Z");

describe("rango SAT — día UTC vs día del centro", () => {
  it("mes_actual termina en el último día completo del centro, nunca en el futuro", () => {
    const r = resolverRangoSat({ periodo: "mes_actual", ahora: AHORA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.desde).toBe("2026-08-01");
    expect(r.hasta).toBe("2026-08-16");
    expect(r.hasta).not.toBe("2026-08-18");
    expect(r.hasta).not.toBe("2026-08-17");
  });

  it("el último día completo se calcula en hora del centro", () => {
    expect(ultimoDiaCompletoSat(AHORA)).toBe("2026-08-16");
  });

  it("30d son 30 días completos que terminan ayer", () => {
    const r = resolverRangoSat({ periodo: "30d", ahora: AHORA });
    expect(r).toMatchObject({ ok: true, desde: "2026-07-18", hasta: "2026-08-16" });
  });

  it("ejercicio va del 1 de enero a ayer, sin cruzar de año", () => {
    expect(resolverRangoSat({ periodo: "ejercicio", ahora: AHORA })).toMatchObject({
      desde: "2026-01-01",
      hasta: "2026-08-16",
    });
  });

  it("el primer día del mes bloquea con motivo claro", () => {
    const r = resolverRangoSat({ periodo: "mes_actual", ahora: new Date("2026-09-01T15:00:00Z") });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/día completo de este mes/);
    expect(r.maximo).toBe("2026-08-31");
  });

  it("el primer día del año bloquea el ejercicio en curso", () => {
    const r = resolverRangoSat({ periodo: "ejercicio", ahora: new Date("2027-01-01T15:00:00Z") });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.maximo).toBe("2026-12-31");
  });

  it("respeta meses de 28, 29, 30 y 31 días y el cambio de año", () => {
    const casos: Array<[string, string, string]> = [
      ["2026-03-01T15:00:00Z", "2026-02-28", "2026-02-01"], // febrero 28
      ["2028-03-01T15:00:00Z", "2028-02-29", "2028-02-01"], // febrero bisiesto
      ["2026-05-01T15:00:00Z", "2026-04-30", "2026-04-01"], // abril 30
      ["2026-06-01T15:00:00Z", "2026-05-31", "2026-05-01"], // mayo 31
      ["2027-01-01T15:00:00Z", "2026-12-31", "2026-12-01"], // cambio de año
    ];
    for (const [iso, maximo, inicioMes] of casos) {
      const r = resolverRangoSat({
        periodo: "personalizado",
        fechaDesde: inicioMes,
        fechaHasta: maximo,
        ahora: new Date(iso),
      });
      expect(r).toMatchObject({ ok: true, desde: inicioMes, hasta: maximo });
    }
  });
});

describe("periodo personalizado", () => {
  it("rechaza una fecha final futura y muestra el máximo permitido", () => {
    const r = resolverRangoSat({
      periodo: "personalizado",
      fechaDesde: "2026-08-01",
      fechaHasta: "2026-08-18",
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("rango_sat_invalido");
    expect(r.accion).toContain("2026-08-16");
    expect(r.motivo).toMatch(/301/);
  });

  it("rechaza fecha inicial posterior a la final, sin corregir en silencio", () => {
    const r = resolverRangoSat({
      periodo: "personalizado",
      fechaDesde: "2026-08-10",
      fechaHasta: "2026-08-02",
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
  });

  it("acepta un rango de días completos", () => {
    expect(
      resolverRangoSat({
        periodo: "personalizado",
        fechaDesde: "2026-08-01",
        fechaHasta: "2026-08-16",
        ahora: AHORA,
      }),
    ).toMatchObject({ ok: true, desde: "2026-08-01", hasta: "2026-08-16" });
  });
});

describe("una sola fuente para vista previa, runner y programación", () => {
  it("resolverRango delega y produce el mismo rango con el mismo reloj", () => {
    const central = resolverRangoSat({ periodo: "mes_actual", ahora: AHORA });
    const runner = resolverRango("mes_actual", null, null, AHORA);
    expect(central.ok).toBe(true);
    if (!central.ok) return;
    expect(runner).toMatchObject({ ok: true, desde: central.desde, hasta: central.hasta });
  });

  it("un rango inválido no entrega fechas al runner", () => {
    const runner = resolverRango("personalizado", "2026-08-01", "2026-08-18", AHORA);
    expect(runner.ok).toBe(false);
    expect(runner.desde).toBe("");
    expect(runner.hasta).toBe("");
  });
});

describe("la solicitud firmada nunca lleva una fecha futura", () => {
  const base = {
    rfc: "AAA010101AAA",
    rfcSolicitante: "AAA010101AAA",
    direccion: "emitidos" as const,
    tipo: "CFDI" as const,
    estado: "Vigente" as const,
  };

  it("aborta antes de firmar si FechaFinal es futura", () => {
    expect(() =>
      construirSolicitudDescarga({
        ...base,
        desde: "2026-08-01",
        hasta: "2026-08-18",
        ahora: AHORA,
      }),
    ).toThrow(/día completo|Máximo permitido/);
  });

  it("aborta si el rango a firmar no es el confirmado por el usuario", () => {
    expect(() =>
      construirSolicitudDescarga({
        ...base,
        desde: "2026-08-01",
        hasta: "2026-08-16",
        ahora: AHORA,
        rangoConfirmado: { desde: "2026-08-01", hasta: "2026-08-15" },
      }),
    ).toThrow(/no coincide con el confirmado/);
  });

  it("ambas direcciones usan exactamente las mismas fechas validadas", () => {
    const r = resolverRangoSat({ periodo: "mes_actual", ahora: AHORA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const em = construirSolicitudDescarga({
      ...base,
      desde: r.desde,
      hasta: r.hasta,
      ahora: AHORA,
    });
    const re = construirSolicitudDescarga({
      ...base,
      direccion: "recibidos",
      desde: r.desde,
      hasta: r.hasta,
      ahora: AHORA,
    });
    expect(em.campos["FechaInicial"]).toBe("2026-08-01T00:00:00");
    expect(em.campos["FechaFinal"]).toBe("2026-08-16T23:59:59");
    expect(re.campos["FechaInicial"]).toBe(em.campos["FechaInicial"]);
    expect(re.campos["FechaFinal"]).toBe(em.campos["FechaFinal"]);
  });
});
