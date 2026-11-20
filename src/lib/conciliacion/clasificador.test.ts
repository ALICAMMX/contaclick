import { describe, expect, it } from "vitest";
import {
  clasificarMovimientos,
  motivoDeClasificacion,
  patronDe,
  type MovimientoAClasificar,
} from "./clasificador";

const mov = (o: Partial<MovimientoAClasificar> & { id: string }): MovimientoAClasificar => ({
  fecha: "2026-03-10",
  importe_centavos: 10000,
  direccion: "cargo",
  descripcion: null,
  referencia: null,
  cuenta_id: "cta-a",
  ...o,
});

const base = { reglas_aprendidas: [], rfc_cliente: "PME920101AB1" };
const cat = (r: ReturnType<typeof clasificarMovimientos>, id: string) => r.find((s) => s.movimiento_id === id)?.categoria;

describe("reglas del sistema", () => {
  it("reconoce comisiones, IVA de comisión, SAT, IMSS y nómina", () => {
    const r = clasificarMovimientos({
      ...base,
      movimientos: [
        mov({ id: "1", descripcion: "COMISION POR MANEJO DE CUENTA" }),
        mov({ id: "2", descripcion: "IVA COMISION" }),
        mov({ id: "3", descripcion: "PAGO REFERENCIADO SAT 0423" }),
        mov({ id: "4", descripcion: "PAGO SUA IMSS" }),
        mov({ id: "5", descripcion: "DISPERSION NOMINA QUINCENA 05" }),
        mov({ id: "6", direccion: "abono", descripcion: "INTERESES GANADOS" }),
      ],
    });
    expect(cat(r, "1")).toBe("comision_bancaria");
    expect(cat(r, "2")).toBe("iva_comision");
    expect(cat(r, "3")).toBe("pago_impuestos");
    expect(cat(r, "4")).toBe("pago_imss_infonavit");
    expect(cat(r, "5")).toBe("nomina");
    expect(cat(r, "6")).toBe("intereses_ganados");
  });

  it("no clasifica un depósito no identificado (puede ser un ingreso sin factura)", () => {
    const r = clasificarMovimientos({
      ...base,
      movimientos: [mov({ id: "d", direccion: "abono", descripcion: "DEPOSITO EN EFECTIVO" }), mov({ id: "s", direccion: "abono", descripcion: "SPEI RECIBIDO CLIENTE X" })],
    });
    expect(r).toHaveLength(0);
  });

  it("no confunde palabras: 'MENSUAL' no es SUA ni 'COMISIONISTA' es comisión", () => {
    const r = clasificarMovimientos({
      ...base,
      movimientos: [mov({ id: "1", descripcion: "RENTA MENSUAL OFICINA" }), mov({ id: "2", descripcion: "PAGO COMISIONISTA JUAN" })],
    });
    expect(r).toHaveLength(0);
  });

  it("respeta la dirección: una 'comisión' que entra no es comisión bancaria", () => {
    const r = clasificarMovimientos({ ...base, movimientos: [mov({ id: "1", direccion: "abono", descripcion: "COMISION POR VENTA" })] });
    expect(cat(r, "1")).toBeUndefined();
  });
});

describe("traspasos entre cuentas propias", () => {
  it("empareja la salida de una cuenta con la entrada a otra del mismo contribuyente", () => {
    const r = clasificarMovimientos({
      ...base,
      movimientos: [
        mov({ id: "sal", cuenta_id: "cta-a", importe_centavos: 500000, descripcion: "SPEI ENVIADO" }),
        mov({ id: "ent", cuenta_id: "cta-b", fecha: "2026-03-11", direccion: "abono", importe_centavos: 500000, descripcion: "SPEI RECIBIDO" }),
      ],
    });
    expect(cat(r, "sal")).toBe("traspaso_propio");
    expect(cat(r, "ent")).toBe("traspaso_propio");
    expect(r.find((s) => s.movimiento_id === "sal")?.contraparte_movimiento_id).toBe("ent");
  });

  it("no empareja movimientos de la misma cuenta ni con días de diferencia", () => {
    const r = clasificarMovimientos({
      ...base,
      movimientos: [
        mov({ id: "a", cuenta_id: "cta-a", importe_centavos: 500000 }),
        mov({ id: "b", cuenta_id: "cta-a", direccion: "abono", importe_centavos: 500000 }),
        mov({ id: "c", cuenta_id: "cta-b", fecha: "2026-03-20", direccion: "abono", importe_centavos: 500000 }),
      ],
    });
    expect(r).toHaveLength(0);
  });

  it("detecta traspaso por el RFC propio en la descripción", () => {
    const r = clasificarMovimientos({ ...base, movimientos: [mov({ id: "t", descripcion: "TRASPASO A PME920101AB1" })] });
    expect(cat(r, "t")).toBe("traspaso_propio");
  });
});

describe("reglas aprendidas", () => {
  it("lo que el contador ya enseñó gana sobre las reglas del sistema", () => {
    const r = clasificarMovimientos({
      ...base,
      reglas_aprendidas: [{ id: "r1", patron: "SPEI ENVIADO CFE", direccion: "cargo", categoria: "otro_sin_cfdi" }],
      movimientos: [mov({ id: "m", descripcion: "SPEI ENVIADO CFE 00992 COMISION" })],
    });
    const s = r[0];
    expect(s.categoria).toBe("otro_sin_cfdi");
    expect(s.origen).toBe("regla_aprendida");
    expect(s.regla_id).toBe("r1");
  });

  it("patrón estable: sin números ni referencias", () => {
    expect(patronDe("SPEI ENVIADO CFE 0123 REF 99/03/2026")).toBe("SPEI ENVIADO CFE");
    expect(patronDe("Pago Teléfonos de México 5544")).toBe("PAGO TELEFONOS MEXICO");
  });
});

describe("motivo", () => {
  it("cumple el mínimo de 10 caracteres del procedimiento", () => {
    expect(motivoDeClasificacion("comision_bancaria").length).toBeGreaterThanOrEqual(10);
  });
});
