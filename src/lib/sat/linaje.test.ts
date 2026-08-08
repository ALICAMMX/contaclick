// Contrato de trazabilidad de la Descarga Masiva SAT.
// Módulo puro: sin red, sin base de datos, sin e.firma.

import { describe, expect, it } from "vitest";
import {
  clasificarCfdi,
  corridaReintentable,
  enmascararRfc,
  enmascararUuid,
  errorVisibleCredencial,
  esErrorDeCredencial,
  esReintentable,
  motivoSinReintento,
  paqueteSaneado,
  requiereRecalculo,
} from "./linaje";

const RFC = "AAA010101AAA";

describe("clasificación del comprobante", () => {
  it("distingue ingreso de gasto por el RFC del expediente", () => {
    expect(
      clasificarCfdi({ tipo_cfdi: "I", rfc_emisor: RFC, rfc_receptor: "BBB020202BB2", rfc_expediente: RFC }),
    ).toBe("ingreso");
    expect(
      clasificarCfdi({ tipo_cfdi: "I", rfc_emisor: "BBB020202BB2", rfc_receptor: RFC, rfc_expediente: RFC }),
    ).toBe("gasto");
  });

  it("reconoce nómina, pago, egreso y traslado", () => {
    expect(clasificarCfdi({ tipo_cfdi: "N", rfc_expediente: RFC })).toBe("nomina");
    expect(clasificarCfdi({ tipo_cfdi: "P", rfc_expediente: RFC })).toBe("pago");
    expect(clasificarCfdi({ tipo_cfdi: "E", rfc_expediente: RFC })).toBe("egreso");
    expect(clasificarCfdi({ tipo_cfdi: "T", rfc_expediente: RFC })).toBe("traslado");
  });

  it("sin RFC del expediente no inventa la dirección del ingreso", () => {
    expect(clasificarCfdi({ tipo_cfdi: "I", rfc_emisor: RFC })).toBe("otro");
  });
});

describe("enmascarado", () => {
  it("nunca publica el identificador completo", () => {
    const uuid = "BCDD4B19-D8A6-40C0-975E-F84A2CD34703";
    const visible = enmascararUuid(uuid);
    expect(visible).not.toBe(uuid);
    expect(visible.startsWith("BCDD4B19")).toBe(true);
    expect(enmascararRfc(RFC)).not.toBe(RFC);
    expect(paqueteSaneado("PAQUETE_TOKEN_LARGO_0001")).not.toContain("TOKEN_LARGO_00");
  });
});

describe("errores de credencial vs errores de corrida", () => {
  it("el rechazo 301 del SAT NO es un error de la e.firma", () => {
    const msg = "301 · XML Mal Formado. No se permite la descarga de xml cancelados.";
    expect(esErrorDeCredencial(msg)).toBe(false);
    expect(errorVisibleCredencial(msg)).toBeNull();
  });

  it("un fallo de paquete o de cosecha tampoco lo es", () => {
    expect(esErrorDeCredencial("No se pudo descargar el paquete del SAT")).toBe(false);
    expect(esErrorDeCredencial("SAT 500: An error occurred when verifying security")).toBe(false);
  });

  it("el certificado vencido o la contraseña sí pertenecen a la tarjeta", () => {
    expect(esErrorDeCredencial("El certificado está vencido")).toBe(true);
    expect(esErrorDeCredencial("No se pudo abrir la llave privada: revisa la contraseña")).toBe(true);
    expect(errorVisibleCredencial("El certificado está vencido")).toContain("vencido");
  });

  it("sin mensaje no se muestra nada", () => {
    expect(errorVisibleCredencial(null)).toBeNull();
    expect(errorVisibleCredencial("")).toBeNull();
  });
});

describe("reintentos", () => {
  it("un rechazo terminal no admite reintento", () => {
    expect(esReintentable("301")).toBe(false);
    const run = { estado: "error", solicitudes: [{ id_solicitud: "F1", codigo: "301" }] };
    expect(corridaReintentable(run)).toBe(false);
    expect(motivoSinReintento(run)).toMatch(/corrida nueva/i);
  });

  it("una solicitud en proceso con folio vivo sí admite reintento", () => {
    const run = { estado: "parcial", solicitudes: [{ id_solicitud: "F1", codigo: "5000" }] };
    expect(corridaReintentable(run)).toBe(esReintentable("5000"));
  });

  it("sin folio SAT no hay nada que reintentar", () => {
    const run = { estado: "error", solicitudes: [{ codigo: "5000" }] };
    expect(corridaReintentable(run)).toBe(false);
    expect(motivoSinReintento(run)).toMatch(/no tiene solicitudes vivas/i);
  });

  it("una corrida viva no ofrece reintento", () => {
    expect(corridaReintentable({ estado: "esperando_sat", solicitudes: [{ id_solicitud: "F1" }] })).toBe(false);
  });
});

describe("recálculos obligatorios", () => {
  it("una corrida con comprobantes nuevos exige pasar por recalculando", () => {
    expect(requiereRecalculo({ estado: "completada", xml_nuevos: 3 })).toBe(true);
  });

  it("sin comprobantes nuevos se cierra directo", () => {
    expect(requiereRecalculo({ estado: "completada", xml_nuevos: 0 })).toBe(false);
    expect(requiereRecalculo({ estado: "error", xml_nuevos: 5 })).toBe(false);
  });
});
