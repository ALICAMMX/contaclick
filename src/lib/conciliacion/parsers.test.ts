import { describe, expect, it } from "vitest";
import { parsePdfMovimientos } from "./parsers";

describe("parsePdfMovimientos", () => {
  it("no interpreta la segunda fecha BBVA como año y clasifica retiro como cargo", () => {
    const rows = parsePdfMovimientos(`
      ESTADO DE CUENTA 2026
      02/ENE 02/ENE BNET 0163756815 FACTURA Referencia 0066398014 RETIRO CAJERO A... $2,000.00
    `);
    expect(rows).toEqual([
      expect.objectContaining({ fecha: "2026-01-02", cargo: 2000, abono: 0 }),
    ]);
  });

  it("clasifica SPEI enviado como cargo y SPEI recibido como abono", () => {
    const rows = parsePdfMovimientos(`
      PERIODO 2026
      12/FEB 12/FEB SPEI ENVIADO STP pago de préstamo $1,500.00
      13/FEB 13/FEB SPEI RECIBIDO CLIENTE FACTURA $3,250.00
    `);
    expect(rows[0]).toEqual(expect.objectContaining({ cargo: 1500, abono: 0 }));
    expect(rows[1]).toEqual(expect.objectContaining({ cargo: 0, abono: 3250 }));
  });

  it("rechaza un PDF ambiguo en vez de asumir que es depósito", () => {
    expect(() => parsePdfMovimientos(`
      ESTADO DE CUENTA 2026
      05/MAR 05/MAR OPERACION SIN CLASIFICACION $900.00
    `)).toThrow(/no puede determinarse con seguridad/i);
  });
});
describe("años implausibles en PDF", () => {
  it("no genera 2030, 2031 ni 2002 a partir del día repetido de BBVA", () => {
    const rows = parsePdfMovimientos(`
      ESTADO DE CUENTA 2026
      31/DIC 31/DIC SPEI ENVIADO PROVEEDOR $1,000.00
      30/DIC 30/DIC RETIRO CAJERO AUTOMATICO $500.00
      02/ENE 02/ENE PAGO A TERCERO TDC $250.00
    `);
    expect(rows.map((r) => r.fecha)).toEqual(["2026-12-31", "2026-12-30", "2026-01-02"]);
    expect(rows.every((r) => r.cargo > 0 && r.abono === 0)).toBe(true);
  });
});
