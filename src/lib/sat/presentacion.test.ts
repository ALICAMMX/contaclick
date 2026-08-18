import { describe, expect, it } from "vitest";
import { presentarResultadoSat, runIdDeResultado } from "./presentacion";

const RESPALDO = "No se pudo completar la sincronización. Consulta el detalle de la corrida.";

const exito = {
  ok: true,
  duplicada: false,
  run_id: "run-1",
  estado: "completada",
  mensaje: "Descarga terminada: 3 nuevos, 0 duplicados, 0 rechazados.",
  nuevos: 3,
  duplicados: 0,
  rechazados: 0,
  errores: [],
};

const duplicada = { ...exito, duplicada: true, mensaje: "Ya hay una corrida en proceso." };

const falloPreflight = {
  ok: false,
  error: {
    etapa: "preflight",
    codigo: "sin_credencial",
    mensaje: "La e.firma no está conectada.",
    accion: "Conecta la e.firma del expediente.",
    corrida_creada: false,
    solicitud_enviada: false,
    run_id: null,
  },
};

const falloCosecha = {
  ok: false,
  error: {
    etapa: "cosecha",
    codigo: "respuesta_sat_no_completada",
    mensaje: "El SAT rechazó la solicitud 305.",
    accion: "Revisa el detalle de la corrida.",
    corrida_creada: true,
    solicitud_enviada: true,
    run_id: "run-9",
  },
};

describe("presentarResultadoSat", () => {
  it("éxito normal conserva su mensaje", () => {
    expect(presentarResultadoSat(exito).mensaje).toContain("Descarga terminada");
  });

  it("corrida duplicada conserva su mensaje", () => {
    expect(presentarResultadoSat(duplicada).mensaje).toBe("Ya hay una corrida en proceso.");
  });

  it("fallo de preflight muestra motivo y acción", () => {
    const p = presentarResultadoSat(falloPreflight);
    expect(p.mensaje).toBe("La e.firma no está conectada.");
    expect(p.accion).toBe("Conecta la e.firma del expediente.");
  });

  it("rechazo terminal del SAT tras crear corrida expone run_id", () => {
    expect(presentarResultadoSat(falloCosecha).mensaje).toBe("El SAT rechazó la solicitud 305.");
    expect(runIdDeResultado(falloCosecha)).toBe("run-9");
  });

  it("respuesta histórica {ok:false, mensaje, errores} no rompe y muestra motivo", () => {
    const historico = { ok: false, mensaje: "Cobertura nula", errores: [{ fase: "cosecha", mensaje: "x" }] };
    expect(presentarResultadoSat(historico).mensaje).toBe("Cobertura nula");
  });

  it("respuesta sólo con errores[] usa el primer mensaje", () => {
    const r = { ok: false, errores: [{ fase: "solicitud", mensaje: "Timeout del SAT" }] };
    expect(presentarResultadoSat(r).mensaje).toBe("Timeout del SAT");
  });

  it("undefined, null y objetos vacíos devuelven el respaldo", () => {
    for (const v of [undefined, null, {}, { ok: false }, 42, []]) {
      expect(presentarResultadoSat(v).mensaje).toBe(RESPALDO);
    }
  });

  it("excepción lanzada se presenta con su message", () => {
    expect(presentarResultadoSat(new Error("Boom")).mensaje).toBe("Boom");
    expect(presentarResultadoSat("Falla de red").mensaje).toBe("Falla de red");
  });

  it("nunca lanza con formas hostiles", () => {
    const hostil = { error: 123, mensaje: "   ", errores: [null, { mensaje: "" }, "real"] };
    expect(presentarResultadoSat(hostil).mensaje).toBe("real");
    expect(runIdDeResultado(undefined)).toBeNull();
  });
});
