import { describe, expect, it } from "vitest";
import {
  candidatosReconciliacion,
  diasInclusivos,
  encontradosDeSolicitudes,
  evaluarCoherencia,
  formatearResultado,
  formatearValor,
  mismoUuid,
  normalizarUuid,
  reconstruirMetricas,
  resumirEnvio,
} from "./metricas";

const UUID = "BCDD4B19-D8A6-40C0-975E-F84A2CD34703";

describe("normalización de UUID", () => {
  it("canoniza espacios y minúsculas", () => {
    expect(normalizarUuid(` ${UUID.toLowerCase()} `)).toBe(UUID);
  });
  it("reconoce el mismo comprobante con distinta caja", () => {
    expect(mismoUuid(UUID, UUID.toLowerCase())).toBe(true);
    expect(mismoUuid(UUID, null)).toBe(false);
  });
});

describe("métricas reconstruidas", () => {
  const solicitudes = [{ xml_encontrados: 4 }, { xml_encontrados: 4 }];

  it("cuenta 8 entregados y 8 nuevos aunque falte el vínculo", () => {
    const m = reconstruirMetricas({
      solicitudes,
      documentos_vinculados: 0,
      documentos_huerfanos: 8,
      mostrados: 0,
    });
    expect(encontradosDeSolicitudes(solicitudes)).toBe(8);
    expect(m.nuevos).toBe(8);
    expect(m.vinculados).toBe(0);
  });

  it("prohíbe decir que no hubo comprobantes cuando sí los hubo", () => {
    const c = evaluarCoherencia(
      reconstruirMetricas({ solicitudes, documentos_vinculados: 0, documentos_huerfanos: 8 }),
    );
    expect(c.coherente).toBe(false);
    expect(c.linaje_incompleto).toBe(true);
    expect(c.cobertura_honesta).toBe("parcial");
    expect(c.mensaje).not.toMatch(/no incorporó/i);
    expect(c.mensaje).toMatch(/8/);
  });

  it("declara cobertura total sólo cuando todo cuadra", () => {
    const c = evaluarCoherencia(
      reconstruirMetricas({
        solicitudes,
        documentos_vinculados: 8,
        documentos_huerfanos: 0,
        mostrados: 8,
      }),
    );
    expect(c.coherente).toBe(true);
    expect(c.cobertura_honesta).toBe("total");
  });

  it("un periodo solapado que sólo trae duplicados no reporta nuevos", () => {
    const c = evaluarCoherencia(
      reconstruirMetricas({
        solicitudes: [{ xml_encontrados: 4 }],
        documentos_vinculados: 0,
        duplicados_persistidos: 4,
        mostrados: 0,
      }),
    );
    expect(c.mensaje).toMatch(/ya existían/);
    expect(c.cobertura_honesta).toBe("total");
  });

  it("detecta linaje presente pero invisible en el detalle", () => {
    const c = evaluarCoherencia(
      reconstruirMetricas({ solicitudes, documentos_vinculados: 8, mostrados: 3 }),
    );
    expect(c.problemas.join(" ")).toMatch(/no los recupera/);
  });

  it("sin entrega del SAT la cobertura es nula", () => {
    const c = evaluarCoherencia(
      reconstruirMetricas({ solicitudes: [], documentos_vinculados: 0 }),
    );
    expect(c.cobertura_honesta).toBe("nula");
    expect(c.mensaje).toMatch(/no entregó/);
  });
});

describe("candidatos de reconciliación", () => {
  const docs = [
    { id: "1", uuid: UUID, sat_paquete_id: "PKG-A", sat_run_id: null },
    { id: "2", uuid: UUID, sat_paquete_id: "pkg-a", sat_run_id: null },
    { id: "3", uuid: UUID, sat_paquete_id: "PKG-B", sat_run_id: "otra-corrida" },
    { id: "4", uuid: UUID, sat_paquete_id: "PKG-Z", sat_run_id: null },
  ];

  it("toma sólo los documentos sin vínculo de los paquetes de la corrida", () => {
    const r = candidatosReconciliacion({ paquetes: ["PKG-A", "PKG-B"], documentos: docs });
    expect(r.map((d) => d.id)).toEqual(["1", "2"]);
  });

  it("nunca toca documentos ya vinculados a otra corrida", () => {
    const r = candidatosReconciliacion({ paquetes: ["PKG-B"], documentos: docs });
    expect(r).toHaveLength(0);
  });

  it("es idempotente: tras vincular no quedan candidatos", () => {
    const vinculados = docs.map((d) => ({ ...d, sat_run_id: "esta" }));
    expect(candidatosReconciliacion({ paquetes: ["PKG-A"], documentos: vinculados })).toHaveLength(0);
  });
});

describe("resumen del envío", () => {
  it("cuenta días inclusivos", () => {
    expect(diasInclusivos("2026-07-29", "2026-08-01")).toBe(4);
    expect(diasInclusivos("2026-08-01", "2026-07-29")).toBe(0);
  });

  it("una solicitud por dirección", () => {
    const r = resumirEnvio({ emitidos: true, recibidos: true, desde: "2026-07-29", hasta: "2026-08-01" });
    expect(r.solicitudes).toBe(2);
    expect(r.direcciones_label).toBe("Emitidos y Recibidos");
    expect(r.valido).toBe(true);
  });

  it("bloquea sin dirección o con periodo inválido", () => {
    expect(resumirEnvio({ emitidos: false, recibidos: false, desde: "2026-07-29", hasta: "2026-08-01" }).valido).toBe(false);
    expect(resumirEnvio({ emitidos: true, recibidos: false, desde: "2026-08-05", hasta: "2026-08-01" }).valido).toBe(false);
  });
});

describe("presentación de resultados", () => {
  it("nunca produce [object Object]", () => {
    const filas = formatearResultado({
      score: 72,
      cobertura: { porcentaje: 40, dimensionesEvaluadas: 2 },
      faltantes: ["a", "b"],
      nulo: null,
    });
    const texto = filas.map((f) => `${f.campo}: ${f.valor}`).join(" · ");
    expect(texto).not.toContain("[object Object]");
    expect(formatearValor(undefined)).toBe("—");
    expect(formatearValor(true)).toBe("sí");
  });
});
