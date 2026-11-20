import { describe, expect, it } from "vitest";
import { unirLecturas, verificarLecturaIA, type LecturaIA } from "./verificacion-ia";

const lectura = (o: Partial<LecturaIA> = {}): LecturaIA => ({
  banco: "Banco Ejemplo",
  periodo_inicio: "2026-03-01",
  periodo_fin: "2026-03-31",
  saldo_inicial: 1000,
  saldo_final: 1350,
  movimientos: [
    { fecha: "2026-03-02", descripcion: "DEPOSITO CLIENTE", cargo: null, abono: 500, saldo: 1500 },
    { fecha: "2026-03-05", descripcion: "COMISION", cargo: 150, abono: null, saldo: 1350 },
  ],
  ...o,
});

describe("verificación de la lectura con IA", () => {
  it("acepta una lectura cuyos saldos cierran", () => {
    const r = verificarLecturaIA(lectura());
    expect(r.ok).toBe(true);
    expect(r.movimientos).toHaveLength(2);
    expect(r.resumen.saldo_final_calculado).toBe(1350);
  });

  it("corrige el sentido cuando la IA lo invirtió y el saldo lo demuestra", () => {
    const r = verificarLecturaIA(
      lectura({
        movimientos: [
          { fecha: "2026-03-02", descripcion: "DEPOSITO CLIENTE", cargo: 500, abono: null, saldo: 1500 },
          { fecha: "2026-03-05", descripcion: "COMISION", cargo: 150, abono: null, saldo: 1350 },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.correcciones).toHaveLength(1);
    expect(r.movimientos[0]).toMatchObject({ abono: 500, cargo: 0 });
  });

  it("rechaza cuando falta un movimiento (el saldo no cierra)", () => {
    const r = verificarLecturaIA(
      lectura({ movimientos: [{ fecha: "2026-03-05", descripcion: "COMISION", cargo: 150, abono: null, saldo: 1350 }] }),
    );
    expect(r.ok).toBe(false);
    expect(r.problemas.map((p) => p.codigo)).toContain("SALDO_NO_CIERRA");
  });

  it("rechaza si el saldo final no coincide con el del estado de cuenta", () => {
    const r = verificarLecturaIA(lectura({ saldo_final: 9999 }));
    expect(r.ok).toBe(false);
    expect(r.problemas.map((p) => p.codigo)).toContain("SALDO_FINAL_DISTINTO");
  });

  it("sin saldo inicial no se puede comprobar nada", () => {
    const r = verificarLecturaIA(lectura({ saldo_inicial: null }));
    expect(r.ok).toBe(false);
    expect(r.problemas.map((p) => p.codigo)).toContain("SIN_SALDO_INICIAL");
  });

  it("si faltan saldos por renglón y no hay saldo final, no demuestra el sentido y rechaza", () => {
    const r = verificarLecturaIA(
      lectura({
        saldo_final: null,
        movimientos: [
          { fecha: "2026-03-02", descripcion: "DEPOSITO", cargo: null, abono: 500, saldo: null },
          { fecha: "2026-03-05", descripcion: "COMISION", cargo: 150, abono: null, saldo: 1350 },
        ],
      }),
    );
    expect(r.problemas.map((p) => p.codigo)).toContain("POCOS_SALDOS");
  });

  it("detecta fechas inválidas, fuera de periodo y renglones sin importe", () => {
    const r = verificarLecturaIA(
      lectura({
        saldo_final: null,
        movimientos: [
          { fecha: "2026-02-30", descripcion: "X", cargo: 1, abono: null, saldo: 999 },
          { fecha: "2026-04-02", descripcion: "Y", cargo: 1, abono: null, saldo: 998 },
          { fecha: "2026-03-10", descripcion: "Z", cargo: null, abono: null, saldo: 998 },
        ],
      }),
    );
    const codigos = r.problemas.map((p) => p.codigo);
    expect(codigos).toContain("FECHA_INVALIDA");
    expect(codigos).toContain("FECHA_FUERA_PERIODO");
    expect(codigos).toContain("SIN_IMPORTE");
  });

  it("trabaja en centavos: no se pierde un centavo con decimales", () => {
    const r = verificarLecturaIA(
      lectura({
        saldo_inicial: 0.1,
        saldo_final: 0.3,
        movimientos: [
          { fecha: "2026-03-02", descripcion: "A", cargo: null, abono: 0.1, saldo: 0.2 },
          { fecha: "2026-03-03", descripcion: "B", cargo: null, abono: 0.1, saldo: 0.3 },
        ],
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("un renglón sin saldo se comprueba con el siguiente saldo impreso", () => {
    const ok = verificarLecturaIA(
      lectura({
        movimientos: [
          { fecha: "2026-03-02", descripcion: "DEPOSITO", cargo: null, abono: 500, saldo: null },
          { fecha: "2026-03-05", descripcion: "COMISION", cargo: 150, abono: null, saldo: 1350 },
        ],
      }),
    );
    expect(ok.ok).toBe(true);
    const mal = verificarLecturaIA(
      lectura({
        movimientos: [
          { fecha: "2026-03-02", descripcion: "DEPOSITO", cargo: 500, abono: null, saldo: null },
          { fecha: "2026-03-05", descripcion: "COMISION", cargo: 150, abono: null, saldo: 1350 },
        ],
      }),
    );
    expect(mal.ok).toBe(false);
  });

  it("une bloques de páginas: saldo inicial del primero y final del último", () => {
    const u = unirLecturas([
      { ...lectura(), saldo_final: null, movimientos: [lectura().movimientos[0]] },
      { ...lectura(), saldo_inicial: null, movimientos: [lectura().movimientos[1]] },
    ]);
    expect(u.saldo_inicial).toBe(1000);
    expect(u.saldo_final).toBe(1350);
    expect(verificarLecturaIA(u).ok).toBe(true);
  });
});
