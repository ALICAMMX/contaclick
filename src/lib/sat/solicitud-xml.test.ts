// Contrato del constructor de solicitudes de Descarga Masiva SAT.
// Estas pruebas FALLAN con el payload anterior (sin EstadoComprobante) y
// PASAN con el constructor corregido. No hay red ni e.firma real.

import { describe, expect, it } from "vitest";
import {
  construirSolicitudDescarga,
  intentarConstruir,
  SolicitudInvalidaError,
} from "./solicitud-xml";
import { validarContraEsquema } from "./contrato-wsdl";

const BASE = {
  rfc: "AAA010101AAA",
  rfcSolicitante: "AAA010101AAA",
  desde: "2026-08-01",
  hasta: "2026-08-03",
} as const;

/** Payload EXACTO que produjo el rechazo 301 (reconstruido, sin sello). */
const PAYLOAD_ANTERIOR =
  `<des:solicitud xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx" ` +
  `FechaFinal="2026-08-03T23:59:59" FechaInicial="2026-08-01T00:00:00" ` +
  `RfcReceptor="AAA010101AAA" RfcSolicitante="AAA010101AAA" TipoSolicitud="CFDI"></des:solicitud>`;

describe("payload anterior (causa real del 301)", () => {
  it("es rechazado por el esquema oficial: falta EstadoComprobante", () => {
    const fallas = validarContraEsquema(PAYLOAD_ANTERIOR, "SolicitaDescargaRecibidos");
    expect(fallas.map((f) => f.atributo)).toContain("EstadoComprobante");
    expect(fallas[0]!.motivo).toMatch(/Todos|cancelados/i);
  });

  it("un payload con EstadoComprobante=Todos y CFDI también se rechaza", () => {
    const xml = PAYLOAD_ANTERIOR.replace(
      `FechaFinal=`,
      `EstadoComprobante="Todos" FechaFinal=`,
    );
    const fallas = validarContraEsquema(xml, "SolicitaDescargaRecibidos");
    expect(fallas.some((f) => /cancelados/i.test(f.motivo))).toBe(true);
  });
});

describe("constructor corregido — XML recibidos", () => {
  const s = construirSolicitudDescarga({
    ...BASE,
    direccion: "recibidos",
    tipo: "CFDI",
    estado: "Vigente",
  });

  it("usa la única combinación oficial permitida", () => {
    expect(s.operacion).toBe("SolicitaDescargaRecibidos");
    expect(s.campos["TipoSolicitud"]).toBe("CFDI");
    expect(s.campos["EstadoComprobante"]).toBe("Vigente");
    expect(s.campos["RfcReceptor"]).toBe("AAA010101AAA");
    expect(s.campos["RfcEmisor"]).toBeUndefined();
  });

  it("no contiene Cancelado ni Todos", () => {
    expect(s.canonical).not.toMatch(/Cancelado|Todos/);
    expect(s.saneado).not.toMatch(/Cancelado|Todos/);
  });

  it("no hereda filtros de metadata", () => {
    expect(s.canonical).not.toMatch(/Metadata/);
    const permitidos = [
      "EstadoComprobante",
      "FechaFinal",
      "FechaInicial",
      "RfcReceptor",
      "RfcSolicitante",
      "TipoSolicitud",
    ];
    expect(Object.keys(s.campos).sort()).toEqual(permitidos);
  });

  it("pasa la validación WSDL/XSD antes de firmar", () => {
    expect(validarContraEsquema(s.canonical, s.operacion)).toEqual([]);
    expect(validarContraEsquema(s.saneado, s.operacion)).toEqual([]);
  });

  it("mantiene el orden alfabético de la canonicalización", () => {
    const orden = [...s.canonical.matchAll(/([\w:]+)="/g)]
      .map((m) => m[1]!)
      .filter((n) => !n.startsWith("xmlns") && n !== "des");
    expect(orden).toEqual([...orden].sort());

  });

  it("por omisión del estado cae en el valor seguro Vigente", () => {
    const d = construirSolicitudDescarga({ ...BASE, direccion: "recibidos", tipo: "CFDI" });
    expect(d.estado).toBe("Vigente");
  });
});

describe("rechazo local previo a la firma", () => {
  it("XML recibidos cancelados se rechaza sin construir sobre", () => {
    const r = intentarConstruir({
      ...BASE,
      direccion: "recibidos",
      tipo: "CFDI",
      estado: "Cancelado",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.motivo).toMatch(/cancelados/i);
    expect(() =>
      construirSolicitudDescarga({
        ...BASE,
        direccion: "recibidos",
        tipo: "CFDI",
        estado: "Cancelado",
      }),
    ).toThrow(SolicitudInvalidaError);
  });

  it("XML emitidos sí admite Cancelado y sigue cumpliendo el esquema", () => {
    const s = construirSolicitudDescarga({
      ...BASE,
      direccion: "emitidos",
      tipo: "CFDI",
      estado: "Cancelado",
    });
    expect(s.campos["RfcEmisor"]).toBe("AAA010101AAA");
    expect(validarContraEsquema(s.canonical, s.operacion)).toEqual([]);
  });

  it("Metadata sí admite Todos (no se contamina la modalidad CFDI)", () => {
    const s = construirSolicitudDescarga({
      ...BASE,
      direccion: "recibidos",
      tipo: "Metadata",
      estado: "Todos",
    });
    expect(validarContraEsquema(s.canonical, s.operacion)).toEqual([]);
  });
});
