import { describe, expect, it } from "vitest";
import {
  analizarImportacion,
  incidenciasPorCodigo,
  periodoDominante,
  sentidoPorDescripcion,
  serializacionCanonica,
  type FilaImportacion,
} from "./importacion";

function fila(p: Partial<FilaImportacion>): FilaImportacion {
  return {
    fecha: "2026-07-01",
    descripcion: "MOVIMIENTO",
    referencia: null,
    cargo: 0,
    abono: 0,
    saldo: null,
    ...p,
  };
}

/** Estado sintético que cuadra al centavo: 10,000 + 3,000 − 1,500 = 11,500. */
const ESTADO_LIMPIO: FilaImportacion[] = [
  fila({ fecha: "2026-07-02", descripcion: "SPEI RECIBIDO CLIENTE", abono: 3000, saldo: 13000 }),
  fila({ fecha: "2026-07-05", descripcion: "SPEI ENVIADO PROVEEDOR", cargo: 1500, saldo: 11500 }),
];

const codigos = (r: ReturnType<typeof analizarImportacion>) => r.incidencias.map((i) => i.codigo);

describe("analizarImportacion", () => {
  it("acepta un estado de cuenta consistente y cuadra la ecuación bancaria", () => {
    const r = analizarImportacion({ movimientos: ESTADO_LIMPIO, periodo_declarado: "2026-07" });
    expect(r.bloqueada).toBe(false);
    expect(r.resumen.saldo_inicial_centavos).toBe(1_000_000);
    expect(r.resumen.saldo_final_centavos).toBe(1_150_000);
    expect(r.resumen.diferencia_centavos).toBe(0);
    expect(r.resumen.ecuacion_cuadra).toBe(true);
    expect(r.resumen.cargos_num).toBe(1);
    expect(r.resumen.abonos_num).toBe(1);
  });

  it("bloquea fechas inválidas", () => {
    const r = analizarImportacion({
      movimientos: [fila({ fecha: "2026-02-30", abono: 100 })],
      periodo_declarado: "2026-02",
    });
    expect(codigos(r)).toContain("FECHA_INVALIDA");
    expect(r.bloqueada).toBe(true);
  });

  it("bloquea fechas fuera del periodo declarado", () => {
    const r = analizarImportacion({
      movimientos: [fila({ fecha: "2026-08-01", abono: 100 })],
      periodo_declarado: "2026-07",
    });
    expect(codigos(r)).toContain("FECHA_FUERA_PERIODO");
    expect(r.bloqueada).toBe(true);
    expect(r.resumen.fuera_periodo).toBe(1);
  });

  it("bloquea cargo y abono simultáneos", () => {
    const r = analizarImportacion({
      movimientos: [fila({ cargo: 100, abono: 100 })],
      periodo_declarado: "2026-07",
    });
    expect(codigos(r)).toContain("SENTIDO_DOBLE");
    expect(r.bloqueada).toBe(true);
  });

  it("bloquea movimientos sin importe", () => {
    const r = analizarImportacion({ movimientos: [fila({})], periodo_declarado: "2026-07" });
    expect(codigos(r)).toContain("SENTIDO_CERO");
  });

  it("bloquea contradicción entre descripción y columna", () => {
    const r = analizarImportacion({
      movimientos: [fila({ descripcion: "RETIRO CAJERO AUTOMATICO", abono: 2000 })],
      periodo_declarado: "2026-07",
    });
    expect(codigos(r)).toContain("CONTRADICCION_DESCRIPCION");
    expect(r.bloqueada).toBe(true);
  });

  it("bloquea contradicción con la variación del saldo", () => {
    const r = analizarImportacion({
      movimientos: [
        fila({ fecha: "2026-07-02", descripcion: "DEPOSITO", abono: 1000, saldo: 11000 }),
        // El saldo baja aunque la fila dice depósito.
        fila({ fecha: "2026-07-03", descripcion: "DEPOSITO", abono: 500, saldo: 10500 }),
      ],
      periodo_declarado: "2026-07",
    });
    expect(codigos(r)).toContain("CONTRADICCION_SALDO");
    expect(r.bloqueada).toBe(true);
  });

  it("bloquea cuando la ecuación de saldos difiere más de un centavo", () => {
    const r = analizarImportacion({
      movimientos: [
        fila({ fecha: "2026-07-02", descripcion: "DEPOSITO", abono: 1000, saldo: 11000 }),
        fila({ fecha: "2026-07-03", descripcion: "DEPOSITO", abono: 1000, saldo: 12000.5 }),
      ],
      periodo_declarado: "2026-07",
    });
    expect(r.bloqueada).toBe(true);
    expect(codigos(r).some((c) => c === "ECUACION_SALDOS" || c === "CONTRADICCION_SALDO")).toBe(true);
  });

  it("bloquea archivo vacío, periodo no identificable y cuenta no seleccionada", () => {
    const r = analizarImportacion({ movimientos: [], periodo_declarado: null, cuenta_seleccionada: false });
    expect(codigos(r)).toEqual(
      expect.arrayContaining(["ARCHIVO_VACIO", "PERIODO_NO_IDENTIFICABLE", "CUENTA_NO_SELECCIONADA"]),
    );
    expect(r.bloqueada).toBe(true);
  });

  it("avisa sin bloquear cuando el archivo no trae columna de saldo", () => {
    const r = analizarImportacion({
      movimientos: [fila({ descripcion: "SPEI ENVIADO", cargo: 100 })],
      periodo_declarado: "2026-07",
    });
    expect(codigos(r)).toContain("SIN_COLUMNA_SALDO");
    expect(r.bloqueada).toBe(false);
    expect(r.resumen.ecuacion_evaluable).toBe(false);
  });

  it("conserva dos operaciones idénticas dentro del mismo archivo", () => {
    const gemelas = [
      fila({ fecha: "2026-07-04", descripcion: "PAGO A TERCERO", cargo: 250, saldo: 9750 }),
      fila({ fecha: "2026-07-04", descripcion: "PAGO A TERCERO", cargo: 250, saldo: 9500 }),
    ];
    const r = analizarImportacion({ movimientos: gemelas, periodo_declarado: "2026-07" });
    expect(r.bloqueada).toBe(false);
    expect(r.resumen.movimientos).toBe(2);
    expect(r.resumen.cargos_centavos).toBe(50_000);
  });
});

describe("apoyos deterministas", () => {
  it("clasifica el sentido sugerido por la descripción", () => {
    expect(sentidoPorDescripcion("SPEI ENVIADO STP")).toBe("cargo");
    expect(sentidoPorDescripcion("RETIRO CAJERO")).toBe("cargo");
    expect(sentidoPorDescripcion("PAGO A TERCERO")).toBe("cargo");
    expect(sentidoPorDescripcion("SPEI RECIBIDO")).toBe("abono");
    expect(sentidoPorDescripcion("OPERACION")).toBeNull();
  });

  it("determina el periodo dominante", () => {
    expect(periodoDominante(ESTADO_LIMPIO)).toBe("2026-07");
    expect(periodoDominante([])).toBeNull();
  });

  it("la serialización canónica es estable e identifica cualquier cambio", () => {
    const a = serializacionCanonica(ESTADO_LIMPIO);
    expect(a).toBe(serializacionCanonica(ESTADO_LIMPIO.map((f) => ({ ...f }))));
    const alterado = [{ ...ESTADO_LIMPIO[0], cargo: 1 }, ESTADO_LIMPIO[1]];
    expect(serializacionCanonica(alterado)).not.toBe(a);
  });

  it("agrupa incidencias por código para soporte", () => {
    const r = analizarImportacion({
      movimientos: [fila({ fecha: "2026-13-01", abono: 10 }), fila({ fecha: "2026-13-02", abono: 10 })],
      periodo_declarado: "2026-07",
    });
    expect(incidenciasPorCodigo(r.incidencias).FECHA_INVALIDA).toBe(2);
  });
});
