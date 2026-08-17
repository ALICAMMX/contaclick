import { describe, expect, it } from "vitest";
import { aCentavos, cuentaComoConciliado, cuentaParaCierre, reservaMiembros } from "./contrato";
import {
  conciliarUnoAUno,
  huellaEntrada,
  type CfdiEntrada,
  type EntradaMotor,
  type MovimientoEntrada,
} from "./motor";

const mov = (o: Partial<MovimientoEntrada> & { id: string }): MovimientoEntrada => ({
  fecha: "2026-03-10",
  importe_centavos: 116000,
  direccion: "abono",
  descripcion: null,
  referencia: null,
  moneda: "MXN",
  ignorado: false,
  no_fiscal: false,
  ...o,
});

const cfdi = (o: Partial<CfdiEntrada> & { id: string }): CfdiEntrada => ({
  uuid: null,
  fecha: "2026-03-10",
  total_centavos: 116000,
  direccion: "emitido",
  tipo_cfdi: "I",
  metodo_pago: "PUE",
  estatus_sat: "vigente",
  moneda: "MXN",
  rfc_contraparte: null,
  nombre_contraparte: null,
  ...o,
});

describe("dinero en centavos", () => {
  it("convierte sin residuos flotantes", () => {
    expect(aCentavos(1160.1)).toBe(116010);
    expect(aCentavos("1,160.10")).toBe(116010);
    expect(aCentavos(0.07 * 3)).toBe(21);
    expect(aCentavos(null)).toBe(0);
  });
});

describe("contrato de estados", () => {
  it("sólo confirmado cuenta como conciliado", () => {
    expect(cuentaComoConciliado("confirmado")).toBe(true);
    for (const e of ["propuesto", "rechazado", "ignorado"] as const) {
      expect(cuentaComoConciliado(e)).toBe(false);
    }
  });

  it("el cierre exige confirmación humana", () => {
    expect(cuentaParaCierre("confirmado", null)).toBe(false);
    expect(cuentaParaCierre("confirmado", "usuario-1")).toBe(true);
  });

  it("rechazado e ignorado liberan a sus miembros", () => {
    expect(reservaMiembros("rechazado")).toBe(false);
    expect(reservaMiembros("ignorado")).toBe(false);
    expect(reservaMiembros("propuesto")).toBe(true);
  });
});

describe("motor uno a uno", () => {
  const uuid = "A1B2C3D4-0000-0000-0000-99887766AABB";

  it("confirma automáticamente sólo con candidato único, importe exacto y dos señales fuertes", () => {
    const r = conciliarUnoAUno({
      movimientos: [mov({ id: "m1", descripcion: "SPEI ACME SA DE CV", referencia: "REF99887766AABB" })],
      cfdi: [cfdi({ id: "c1", uuid, nombre_contraparte: "ACME SA DE CV" })],
    });
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].estado).toBe("confirmado");
    expect(r.grupos[0].origen).toBe("motor");
    expect(r.grupos[0].evidencia.senales_fuertes).toBeGreaterThanOrEqual(2);
  });

  it("importe y fecha por sí solos nunca confirman", () => {
    const r = conciliarUnoAUno({
      movimientos: [mov({ id: "m1", descripcion: "DEPOSITO" })],
      cfdi: [cfdi({ id: "c1", uuid })],
    });
    expect(r.grupos[0].estado).toBe("propuesto");
  });

  it("un empate deja todo para revisión y no confirma nada", () => {
    const r = conciliarUnoAUno({
      movimientos: [mov({ id: "m1", descripcion: "DEPOSITO" })],
      cfdi: [cfdi({ id: "c1" }), cfdi({ id: "c2" })],
    });
    expect(r.grupos.every((g) => g.estado === "propuesto")).toBe(true);
    expect(r.grupos[0].evidencia.candidatos_alternativos).toBe(1);
    expect(r.metricas.ambiguos).toBe(1);
  });

  it("no reutiliza un CFDI dentro de la misma corrida", () => {
    const r = conciliarUnoAUno({
      movimientos: [mov({ id: "m1" }), mov({ id: "m2" })],
      cfdi: [cfdi({ id: "c1" })],
    });
    const usados = r.grupos.map((g) => g.cfdi_id);
    expect(new Set(usados).size).toBe(usados.length);
    expect(r.movimientos_sin_candidato).toContain("m2");
  });

  it("el orden de lectura no cambia el resultado", () => {
    const base: EntradaMotor = {
      movimientos: [
        mov({ id: "m1", descripcion: "SPEI ACME", referencia: "REF99887766AABB" }),
        mov({ id: "m2", fecha: "2026-03-12", importe_centavos: 46400, direccion: "cargo", descripcion: "PAGO PROVEEDOR" }),
        mov({ id: "m3", fecha: "2026-03-14", importe_centavos: 23200, direccion: "cargo" }),
      ],
      cfdi: [
        cfdi({ id: "c1", uuid, nombre_contraparte: "ACME SA DE CV" }),
        cfdi({ id: "c2", fecha: "2026-03-12", total_centavos: 46400, direccion: "recibido" }),
        cfdi({ id: "c3", fecha: "2026-03-14", total_centavos: 23200, direccion: "recibido" }),
      ],
    };
    const a = conciliarUnoAUno(base);
    const b = conciliarUnoAUno({
      movimientos: [...base.movimientos].reverse(),
      cfdi: [...base.cfdi].reverse(),
    });
    expect(b.grupos).toEqual(a.grupos);
    expect(huellaEntrada(base, "2026-03")).toBe(
      huellaEntrada({ movimientos: [...base.movimientos].reverse(), cfdi: [...base.cfdi].reverse() }, "2026-03"),
    );
  });

  it("excluye cancelados, complementos de pago y PPD sin complemento", () => {
    const r = conciliarUnoAUno({
      movimientos: [mov({ id: "m1" })],
      cfdi: [
        cfdi({ id: "c1", estatus_sat: "cancelado" }),
        cfdi({ id: "c2", tipo_cfdi: "P", total_centavos: 0 }),
        cfdi({ id: "c3", metodo_pago: "PPD" }),
      ],
    });
    expect(r.grupos).toHaveLength(0);
    expect(r.exclusiones.map((e) => e.codigo).sort()).toEqual(["cancelado", "complemento_pago", "ppd_sin_complemento"]);
  });

  it("un rechazo libera al movimiento y permite otro candidato en la corrida siguiente", () => {
    const entrada: EntradaMotor = {
      movimientos: [mov({ id: "m1", descripcion: "DEPOSITO" })],
      cfdi: [cfdi({ id: "c1" }), cfdi({ id: "c2" })],
    };
    const primera = conciliarUnoAUno(entrada);
    const elegido = primera.grupos[0].cfdi_id;
    const segunda = conciliarUnoAUno({ ...entrada, pares_rechazados: [`m1|${elegido}`] });
    expect(segunda.grupos).toHaveLength(1);
    expect(segunda.grupos[0].cfdi_id).not.toBe(elegido);
  });

  it("la doble ejecución es idempotente por llave", () => {
    const entrada: EntradaMotor = {
      movimientos: [mov({ id: "m1", descripcion: "SPEI ACME", referencia: "REF99887766AABB" })],
      cfdi: [cfdi({ id: "c1", uuid, nombre_contraparte: "ACME SA DE CV" })],
    };
    const a = conciliarUnoAUno(entrada);
    const b = conciliarUnoAUno(entrada);
    expect(b.grupos.map((g) => g.idempotency_key)).toEqual(a.grupos.map((g) => g.idempotency_key));
  });

  it("respeta la dirección: abono contra emitido, cargo contra recibido", () => {
    const r = conciliarUnoAUno({
      movimientos: [mov({ id: "m1", direccion: "cargo" })],
      cfdi: [cfdi({ id: "c1", direccion: "emitido" })],
    });
    expect(r.grupos).toHaveLength(0);
  });

  it("no toca movimientos ignorados ni no fiscales", () => {
    const r = conciliarUnoAUno({
      movimientos: [mov({ id: "m1", ignorado: true }), mov({ id: "m2", no_fiscal: true })],
      cfdi: [cfdi({ id: "c1" })],
    });
    expect(r.grupos).toHaveLength(0);
    expect(r.metricas.movimientos_evaluados).toBe(0);
  });

  it("distingue dos operaciones legítimas idénticas por su identificador", () => {
    const r = conciliarUnoAUno({
      movimientos: [
        mov({ id: "m1", descripcion: "SPEI ACME", referencia: "REF99887766AABB" }),
        mov({ id: "m2", descripcion: "SPEI ACME", referencia: "REF99887766AABB" }),
      ],
      cfdi: [
        cfdi({ id: "c1", uuid, nombre_contraparte: "ACME SA DE CV" }),
        cfdi({ id: "c2", uuid, nombre_contraparte: "ACME SA DE CV" }),
      ],
    });
    expect(r.grupos).toHaveLength(2);
    expect(new Set(r.grupos.map((g) => g.cfdi_id)).size).toBe(2);
  });
});
