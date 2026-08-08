import { describe, expect, it } from "vitest";
import { nuevaSolicitud, reabrirSolicitudes, type SolicitudRegistro } from "./maquina-estados";

function sol(over: Partial<SolicitudRegistro>): SolicitudRegistro {
  return {
    ...nuevaSolicitud({
      direccion: "recibidos",
      desde: "2026-01-01",
      hasta: "2026-01-03",
      id_solicitud: "S-1",
    }),
    ...over,
  };
}

describe("reabrirSolicitudes (reintento manual)", () => {
  it("reabre una solicitud con folio vivo y código reintentable", () => {
    const r = reabrirSolicitudes([
      sol({ estado: "error", codigo: "5010", intentos: 8, error: "SAT no disponible" }),
    ]);
    expect(r.reabiertas).toBe(1);
    expect(r.solicitudes[0]!.estado).toBe("pendiente");
    expect(r.solicitudes[0]!.intentos).toBe(0);
    expect(r.solicitudes[0]!.siguiente_intento_at).toBeNull();
    expect(r.solicitudes[0]!.error).toBeNull();
  });

  it("reabre una solicitud detenida por agotarse el plazo (sin código)", () => {
    const r = reabrirSolicitudes([sol({ estado: "error", codigo: "", intentos: 8 })]);
    expect(r.reabiertas).toBe(1);
  });

  it("NO reabre una solicitud vencida: exige corrida nueva", () => {
    const r = reabrirSolicitudes([sol({ estado: "vencida", codigo: "5011" })]);
    expect(r.reabiertas).toBe(0);
    expect(r.irrecuperables[0]!.motivo).toMatch(/expiró/i);
  });

  it("NO reabre un rechazo definitivo del SAT", () => {
    const r = reabrirSolicitudes([sol({ estado: "error", codigo: "5002" })]);
    expect(r.reabiertas).toBe(0);
    expect(r.irrecuperables).toHaveLength(1);
  });

  it("NO reabre cuando el SAT nunca devolvió folio", () => {
    const r = reabrirSolicitudes([sol({ estado: "error", id_solicitud: "", codigo: "" })]);
    expect(r.reabiertas).toBe(0);
    expect(r.irrecuperables[0]!.motivo).toMatch(/folio/i);
  });

  it("conserva intacto lo ya descargado", () => {
    const listo = sol({
      estado: "listo",
      xml_nuevos: 40,
      paquetes_procesados: ["p1"],
    });
    const r = reabrirSolicitudes([listo, sol({ estado: "error", codigo: "5006" })]);
    expect(r.solicitudes[0]).toEqual(listo);
    expect(r.reabiertas).toBe(1);
  });

  it("no toca las solicitudes vacías", () => {
    const vacio = sol({ estado: "vacio", codigo: "5004" });
    const r = reabrirSolicitudes([vacio]);
    expect(r.solicitudes[0]).toEqual(vacio);
    expect(r.reabiertas).toBe(0);
    expect(r.irrecuperables).toHaveLength(0);
  });
});
