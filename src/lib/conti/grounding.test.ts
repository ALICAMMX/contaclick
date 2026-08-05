import { describe, it, expect } from "vitest";
import { validarRespuestaConti } from "./validador";
import { pasoGuia, pasosGuia, navegacionPara, SIN_CRITERIO_REGISTRADO, EFOS_ALCANCE } from "./guia";
import { ejecutarHerramientaConti } from "./motores";
import { CAPABILITIES, getCapabilityByRoute } from "@/lib/capabilities/registry";
import { calcularSaludScore, type DimensionSalud } from "@/lib/salud/cobertura";

const base = { modo: "guia" as const, expediente: null, motoresEjecutados: [] as string[] };

describe("Fundamento RESICO", () => {
  it("rechaza que el 113-F regule la resta mensual", () => {
    const { content, violaciones } = validarRespuestaConti(
      "El artículo 113-F indica que el pago mensual se determina restando las retenciones efectuadas.",
      { ...base, modo: "consulta", motoresEjecutados: ["conti_calcular_resico"] },
    );
    expect(violaciones.some((v) => v.regla === "resico_113f_mensual")).toBe(true);
    expect(content).not.toMatch(/113-?\s?F[^.\n]*pago mensual[^.\n]*rest/i);
    expect(content).toMatch(/113-E/);
    expect(content).toMatch(/113-J/);
  });

  it("conserva la atribución correcta del 113-F a la anual", () => {
    const texto =
      "El art. 113-F corresponde a la determinación anual, en la que se disminuyen los pagos mensuales y las retenciones.";
    const { content, violaciones } = validarRespuestaConti(texto, { ...base, modo: "consulta" });
    expect(violaciones.some((v) => v.regla === "resico_113f_mensual")).toBe(false);
    expect(content).toContain("113-F");
  });

  it("el motor conserva el resultado y describe cada artículo por su función", () => {
    const r = ejecutarHerramientaConti("conti_calcular_resico", {
      periodo: "2026-07",
      ingresosCobrados: 10000,
      acumuladoAnualPrevio: 0,
      retencionPersonaMoral: true,
      retencionesEfectuadas: null,
    });
    expect(r.ok).toBe(true);
    expect(r.resultado?.isrCausado).toBe(100);
    expect(r.resultado?.retencion).toBe(125);
    expect(r.resultado?.diferenciaRetencionVsCausado).toBe(25);
    const f = r.fundamentos.join(" ");
    expect(f).toMatch(/113-E[^.]*cobrados/i);
    expect(f).toMatch(/113-J[^.]*1\.25/);
    expect(f).toMatch(/113-F[^.]*ANUAL/i);
    expect(r.limitaciones.join(" ")).toMatch(/NO atribuyas al art\. 113-F la resta mensual/);
  });
});

describe("Rutas y nombres registrados", () => {
  it("la calculadora RESICO registrada es la única ruta enlazable", () => {
    const cap = getCapabilityByRoute("/app/tools/resico-calculator");
    expect(cap?.nombre).toBe("Calculadora RESICO PF");
    const { content, navegacion } = validarRespuestaConti(
      "Usa la [calculadora](/app/tools/resico-calculator) para el mensual.",
      { ...base, modo: "consulta" },
    );
    expect(content).toContain("[Calculadora RESICO PF](/app/tools/resico-calculator)");
    expect(navegacion).toEqual([
      { capabilityId: "resico-calculator", nombre: "Calculadora RESICO PF", ruta: "/app/tools/resico-calculator", madurez: "operativa" },
    ]);
  });

  it("no existe el módulo Impuestos", () => {
    expect(CAPABILITIES.some((c) => c.nombre.toLowerCase() === "impuestos")).toBe(false);
    const { content, violaciones } = validarRespuestaConti(
      'Entra al módulo "Impuestos" y presenta la declaración.',
      base,
    );
    expect(violaciones.some((v) => v.regla === "nombre_ui_inexistente")).toBe(true);
    expect(content).not.toMatch(/Impuestos/);
  });

  it("no existe la opción Pagos Provisionales / Definitivos", () => {
    const { content, violaciones } = validarRespuestaConti(
      'Selecciona la opción "Pagos Provisionales / Definitivos".',
      base,
    );
    expect(violaciones.some((v) => v.regla === "nombre_ui_inexistente")).toBe(true);
    expect(content).not.toMatch(/Pagos Provisionales/i);
  });

  it("toda navegación publicada tiene capabilityId", () => {
    const { content, navegacion } = validarRespuestaConti(
      "Ve a [Impuestos](/app/impuestos) o a [Salud](/app/salud-fiscal).",
      base,
    );
    expect(content).not.toContain("/app/impuestos");
    expect(navegacion.length).toBe(1);
    for (const n of navegacion) {
      expect(n.capabilityId).toBeTruthy();
      expect(getCapabilityByRoute(n.ruta)?.id).toBe(n.capabilityId);
    }
  });
});

describe("Guía sellada campo por campo", () => {
  it("cada paso declara capabilityId, ruta y fuente de evidencia registrados", () => {
    for (const p of pasosGuia()) {
      expect(p.capabilityId).toBeTruthy();
      expect(getCapabilityByRoute(p.ruta)?.id).toBe(p.capabilityId);
      expect(p.evidenceSource).toContain(p.capabilityId);
      expect(p.madurez).not.toBe("obsoleta");
    }
  });

  it("no inventa prerrequisitos: si no hay registrados, la lista queda vacía", () => {
    for (const p of pasosGuia()) {
      expect(Array.isArray(p.prerequisites)).toBe(true);
      for (const pre of p.prerequisites) expect(pre.length).toBeGreaterThan(0);
    }
    const conc = pasoGuia("conciliacion")!;
    expect(conc.prerequisites.every((x) => typeof x === "string")).toBe(true);
  });

  it("toda condición de cierre proviene de completionCriteria", () => {
    for (const p of pasosGuia()) {
      const registrados = getCapabilityByRoute(p.ruta)?.criteriosTerminacion ?? [];
      expect(p.completionCriteria).toEqual(registrados);
    }
  });

  it("sin criterio registrado se responde con el texto obligatorio", () => {
    const p = pasoGuia("conciliacion")!;
    if (p.completionCriteria.length === 0) {
      expect(SIN_CRITERIO_REGISTRADO).toMatch(/no tiene un criterio automático registrado/);
    }
  });

  it("Guía no puede inventar cantidades de incidencias ni umbrales de cierre", () => {
    const { content, violaciones } = validarRespuestaConti(
      "Resuelve las 7 incidencias. Cierra cuando Salud Fiscal sea mayor a 80 y la conciliación supere el 95%. Marca el reporte como enviado sin alertas rojas.",
      base,
    );
    expect(content).not.toMatch(/mayor a 80/i);
    expect(content).not.toMatch(/95\s*%/);
    expect(violaciones.length).toBeGreaterThan(0);
  });

  it("EFOS se presenta con su limitación registrada", () => {
    const paso = pasoGuia("efos-validator")!;
    expect(paso.limitations.join(" ")).toContain(EFOS_ALCANCE);
    const { content, violaciones } = validarRespuestaConti(
      "Asegura que ningún proveedor esté en listas negras del 69-B.",
      base,
    );
    expect(violaciones.some((v) => v.regla === "efos_alcance")).toBe(true);
    expect(content).toContain("fecha de corte");
  });
});

describe("Salud Fiscal con cobertura cero", () => {
  const dims: DimensionSalud[] = [
    ["cumplimiento", "Obligaciones y tareas del expediente", "/app/calendario", "Generar calendario fiscal"],
    ["riesgo_sat", "Evaluación de los criterios de riesgo SAT", "/app/riesgo", "Evaluar riesgo SAT"],
    ["cfdi", "CFDI del periodo", "/app/sat-sync", "Descargar o cargar CFDI"],
    ["bancos", "Estados de cuenta conciliados", "/app/conciliacion", "Conciliar banco"],
    ["laboral", "CFDI de nómina o expediente laboral", "/app/admin/nomina", "Auditar nómina"],
    ["documental", "Revisión documental del expediente", "/app/expedientes", "Completar expediente"],
  ].map(([key, que, ruta, cta]) => ({
    key: key as string,
    label: key as string,
    peso: 1,
    estado: "no_evaluable" as const,
    score: null,
    detalles: [],
    faltante: { que: que as string, ruta: ruta as string, cta: cta as string },
  }));

  it("entrega acciones para conseguir cobertura, no 'sin pendientes'", () => {
    const { score, cobertura } = calcularSaludScore(dims);
    expect(score).toBeNull();
    expect(cobertura.porcentaje).toBe(0);
    expect(cobertura.faltantes).toHaveLength(6);
    for (const f of cobertura.faltantes) {
      expect(getCapabilityByRoute(f.ruta)).toBeTruthy();
      expect(f.cta.length).toBeGreaterThan(0);
    }
  });
});

describe("No se alteró lo ya corregido", () => {
  it("el aislamiento de modos sigue rechazando fuga de expediente", () => {
    const r = validarRespuestaConti("El expediente ACME SA de CV con RFC AAA010101AAA tiene pendientes.", {
      modo: "guia",
      expediente: { id: "1", razonSocial: "ACME SA de CV", rfc: "AAA010101AAA" } as never,
      motoresEjecutados: [],
    });
    expect(r.requiereRegeneracion).toBe(true);
  });

  it("los motores deterministas siguen sellando su normativa", () => {
    const r = ejecutarHerramientaConti("conti_calcular_iva", {
      periodo: "2026-07",
      ivaTrasladado: 1600,
      ivaAcreditable: 600,
      ivaRetenido: null,
      saldoAFavorAnterior: null,
    });
    expect(r.ok).toBe(true);
    expect(r.normativa?.hash).toBeTruthy();
  });
});
