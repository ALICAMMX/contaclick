import { describe, expect, it } from "vitest";
import {
  CASCADA, ETAPAS, ORDEN_ETAPAS, dependenciasSatisfechas, etapasAReabrir,
  siguienteAccion, tonoEstado, type EstadoEtapa, type EtapaId,
} from "./flujo";

describe("flujo mensual · fuente única", () => {
  it("declara seis etapas en orden y sin duplicados", () => {
    expect(ORDEN_ETAPAS).toEqual(["documentos", "clasificacion", "bancos", "polizas", "impuestos", "cierre"]);
    expect(new Set(ORDEN_ETAPAS).size).toBe(6);
    ETAPAS.forEach((e, i) => expect(e.orden).toBe(i + 1));
  });

  it("cada dependencia es una etapa anterior en el orden", () => {
    for (const e of ETAPAS) {
      for (const d of e.dependencias) {
        expect(ORDEN_ETAPAS.indexOf(d)).toBeLessThan(ORDEN_ETAPAS.indexOf(e.id));
      }
    }
  });
});

describe("dependencias", () => {
  it("bloquea una etapa cuya anterior no está resuelta", () => {
    const r = dependenciasSatisfechas("polizas", { bancos: "en_proceso" });
    expect(r.ok).toBe(false);
    expect(r.faltantes).toEqual(["bancos"]);
  });

  it("acepta lista, aprobada y no_aplica como dependencia satisfecha", () => {
    for (const estado of ["lista", "aprobada", "no_aplica"] as EstadoEtapa[]) {
      expect(dependenciasSatisfechas("polizas", { bancos: estado }).ok).toBe(true);
    }
  });

  it("una etapa sin estado equivale a no iniciada", () => {
    expect(dependenciasSatisfechas("clasificacion", {}).ok).toBe(false);
  });
});

describe("reapertura en cascada", () => {
  const todasAprobadas: Record<EtapaId, EstadoEtapa> = {
    documentos: "aprobada", clasificacion: "aprobada", bancos: "aprobada",
    polizas: "aprobada", impuestos: "aprobada", cierre: "aprobada",
  };

  it("un CFDI nuevo reabre las seis etapas", () => {
    expect(etapasAReabrir("cfdi", todasAprobadas)).toEqual(CASCADA.cfdi);
  });

  it("un movimiento bancario no reabre documentos ni clasificación", () => {
    const r = etapasAReabrir("banco", todasAprobadas);
    expect(r).toEqual(["bancos", "polizas", "impuestos", "cierre"]);
    expect(r).not.toContain("documentos");
  });

  it("un parámetro fiscal sólo reabre impuestos y cierre", () => {
    expect(etapasAReabrir("parametro_fiscal", todasAprobadas)).toEqual(["impuestos", "cierre"]);
  });

  it("no reabre etapas que nunca se declararon (idempotencia lógica)", () => {
    expect(etapasAReabrir("cfdi", { documentos: "en_proceso" })).toEqual([]);
    const unaSola = etapasAReabrir("cfdi", { ...todasAprobadas, cierre: "no_iniciada" });
    expect(unaSola).not.toContain("cierre");
  });
});

describe("siguiente acción y tono honesto", () => {
  it("apunta a la primera etapa sin resolver", () => {
    expect(siguienteAccion({ documentos: "lista" })?.id).toBe("clasificacion");
    expect(siguienteAccion({})?.id).toBe("documentos");
  });

  it("no devuelve etapa cuando todo está resuelto", () => {
    expect(siguienteAccion({
      documentos: "lista", clasificacion: "lista", bancos: "no_aplica",
      polizas: "aprobada", impuestos: "lista", cierre: "aprobada",
    })).toBeNull();
  });

  it("nunca pinta verde la ausencia de datos", () => {
    expect(tonoEstado("no_iniciada")).toBe("neutro");
    expect(tonoEstado("no_aplica")).toBe("neutro");
    expect(tonoEstado("bloqueada")).toBe("peligro");
    expect(tonoEstado("lista")).toBe("exito");
  });
});
