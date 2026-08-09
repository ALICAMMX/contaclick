// Ciclo de vida de una excepción: aparece → se decide → desaparece (cierre
// automático, NUNCA borrado) → reaparece como ocurrencia nueva ligada.

import { describe, expect, it } from "vitest";
import { ESTADO_CIERRE_AUTOMATICO, planificarExcepciones } from "./excepciones";

const vigente = { codigo: "cfdi_sin_impuestos", cfdi_id: "c1", titulo: "T", detalle: {} };

describe("bandeja de excepciones sin borrados", () => {
  it("crea la primera ocurrencia", () => {
    const p = planificarExcepciones({ existentes: [], vigentes: [vigente] });
    expect(p.nuevas).toHaveLength(1);
    expect(p.nuevas[0]!.ocurrencia).toBe(1);
    expect(p.nuevas[0]!.excepcion_previa_id).toBeNull();
    expect(p.cerrar).toHaveLength(0);
  });

  it("es idempotente mientras la causa sigue viva", () => {
    for (const estado of ["pendiente", "aceptada", "resuelta"]) {
      const p = planificarExcepciones({
        existentes: [{ id: "e1", codigo: vigente.codigo, cfdi_id: "c1", estado, ocurrencia: 1 }],
        vigentes: [vigente],
      });
      expect(p.nuevas).toHaveLength(0);
      expect(p.cerrar).toHaveLength(0);
    }
  });

  it("al desaparecer la causa cierra, no borra", () => {
    const p = planificarExcepciones({
      existentes: [{ id: "e1", codigo: vigente.codigo, cfdi_id: "c1", estado: "pendiente", ocurrencia: 1 }],
      vigentes: [],
    });
    expect(p.cerrar).toEqual(["e1"]);
    expect(p.nuevas).toHaveLength(0);
  });

  it("no reabre ni toca decisiones humanas ya cerradas por el usuario", () => {
    const p = planificarExcepciones({
      existentes: [{ id: "e1", codigo: vigente.codigo, cfdi_id: "c1", estado: "aceptada", ocurrencia: 1 }],
      vigentes: [],
    });
    expect(p.cerrar).toHaveLength(0);
  });

  it("si la causa reaparece crea una ocurrencia nueva ligada a la anterior", () => {
    const p = planificarExcepciones({
      existentes: [
        { id: "e1", codigo: vigente.codigo, cfdi_id: "c1", estado: ESTADO_CIERRE_AUTOMATICO, ocurrencia: 1 },
      ],
      vigentes: [vigente],
    });
    expect(p.nuevas).toHaveLength(1);
    expect(p.nuevas[0]!.ocurrencia).toBe(2);
    expect(p.nuevas[0]!.excepcion_previa_id).toBe("e1");
  });

  it("las ocurrencias se acumulan sin perder historial", () => {
    const p = planificarExcepciones({
      existentes: [
        { id: "e1", codigo: vigente.codigo, cfdi_id: "c1", estado: ESTADO_CIERRE_AUTOMATICO, ocurrencia: 1 },
        { id: "e2", codigo: vigente.codigo, cfdi_id: "c1", estado: ESTADO_CIERRE_AUTOMATICO, ocurrencia: 2 },
      ],
      vigentes: [vigente],
    });
    expect(p.nuevas[0]!.ocurrencia).toBe(3);
    expect(p.nuevas[0]!.excepcion_previa_id).toBe("e2");
  });
});
