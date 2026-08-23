import { describe, expect, it } from "vitest";
import { leerBbvaDesdeElementos, detectarPeriodoBbva } from "./bbva-mx";
import { detectarAdaptador, leerPdfBancario } from "./registry";
import type { ElementoPdf } from "./tipos";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES ANONIMIZADOS: reproducen las coordenadas X/Y del formato real de
// BBVA México. No contienen datos bancarios de ningún contribuyente.
// ─────────────────────────────────────────────────────────────────────────────
const X = { oper: 40, liq: 78, desc: 112, cargo: 400, abono: 470, saldo: 540 };

function el(pagina: number, texto: string, x: number, y: number, ancho = texto.length * 5): ElementoPdf {
  return { pagina, texto, x, y, ancho, alto: 8 };
}

function importe(pagina: number, valor: number, centroX: number, y: number): ElementoPdf {
  const texto = valor.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ancho = texto.length * 5;
  return el(pagina, texto, centroX - ancho / 2, y, ancho);
}

type FilaFixture = {
  oper: string;
  liq?: string;
  desc: string;
  desc2?: string;
  cargo?: number;
  abono?: number;
  saldo?: number | null;
};

function encabezado(pagina: number, y: number): ElementoPdf[] {
  return [
    el(pagina, "OPER", X.oper, y, 24),
    el(pagina, "LIQ", X.liq, y, 18),
    el(pagina, "COD. DESCRIPCIÓN / REFERENCIA", X.desc, y, 160),
    el(pagina, "CARGOS", X.cargo - 20, y, 40),
    el(pagina, "ABONOS", X.abono - 20, y, 40),
    el(pagina, "SALDO", X.saldo - 18, y, 36),
  ];
}

function encabezadoPartido(pagina: number, y: number): ElementoPdf[] {
  return [
    el(pagina, "OPER", X.oper, y + 10, 24),
    el(pagina, "LIQ", X.liq, y + 10, 18),
    el(pagina, "COD. DESCRIPCIÓN / REFERENCIA", X.desc, y, 160),
    el(pagina, "CARGOS", X.cargo - 20, y, 40),
    el(pagina, "ABONOS", X.abono - 20, y, 40),
    el(pagina, "SALDO", X.saldo - 18, y, 36),
  ];
}

function construir(opts: {
  periodo: string;
  filas: FilaFixture[];
  paginaCorteEn?: number;
  totales?: { cargos?: number; abonos?: number; saldoInicial?: number; saldoFinal?: number };
  saldoAnterior?: number;
}): ElementoPdf[] {
  const out: ElementoPdf[] = [];
  let pagina = 1;
  let y = 700;
  out.push(el(1, "BBVA MÉXICO S.A.  ESTADO DE CUENTA", 40, 760, 220));
  out.push(el(1, `No. de Cuenta 0000000000   CLABE 012000000000000000   ${opts.periodo}`, 40, 745, 300));
  out.push(...encabezado(1, y));
  y -= 16;

  opts.filas.forEach((f, i) => {
    if (opts.paginaCorteEn != null && i === opts.paginaCorteEn) {
      pagina += 1;
      y = 700;
      out.push(el(pagina, "BBVA MÉXICO S.A.  Página 2 de 2", 40, 760, 200));
      out.push(...encabezado(pagina, y));
      y -= 16;
    }
    out.push(el(pagina, f.oper, X.oper, y, 26));
    out.push(el(pagina, f.liq ?? f.oper, X.liq, y, 26));
    out.push(el(pagina, f.desc, X.desc, y, Math.min(f.desc.length * 5, 250)));
    if (f.cargo) out.push(importe(pagina, f.cargo, X.cargo, y));
    if (f.abono) out.push(importe(pagina, f.abono, X.abono, y));
    if (f.saldo != null) out.push(importe(pagina, f.saldo, X.saldo, y));
    y -= 12;
    if (f.desc2) {
      out.push(el(pagina, f.desc2, X.desc + 8, y, Math.min(f.desc2.length * 5, 240)));
      y -= 12;
    }
  });

  if (opts.totales) {
    y -= 14;
    if (opts.totales.cargos != null) {
      out.push(el(pagina, "TOTAL DE CARGOS", X.desc, y, 90));
      out.push(importe(pagina, opts.totales.cargos, X.cargo, y));
      y -= 12;
    }
    if (opts.totales.abonos != null) {
      out.push(el(pagina, "TOTAL DE ABONOS", X.desc, y, 90));
      out.push(importe(pagina, opts.totales.abonos, X.abono, y));
      y -= 12;
    }
    if (opts.totales.saldoFinal != null) {
      out.push(el(pagina, "SALDO FINAL", X.desc, y, 70));
      out.push(importe(pagina, opts.totales.saldoFinal, X.saldo, y));
    }
  }
  return out;
}

/** Calcula la columna de saldo encadenada a partir de un saldo inicial. */
function conSaldos(inicial: number, filas: FilaFixture[]): FilaFixture[] {
  let saldo = inicial;
  return filas.map((f) => {
    saldo = Math.round((saldo + (f.abono ?? 0) - (f.cargo ?? 0)) * 100) / 100;
    return { ...f, saldo };
  });
}

const PERIODO_DIC = "Periodo DEL 26/12/2025 AL 25/01/2026";

const FILAS_BASE: FilaFixture[] = [
  { oper: "30/DIC", desc: "SPEI ENVIADO STP", desc2: "REFERENCIA 0066398014 CUENTA 0123", cargo: 19800 },
  { oper: "30/DIC", desc: "SPEI ENVIADO Spotify MX", cargo: 28700 },
  { oper: "31/DIC", desc: "PAGO CUENTA DE TERCERO", cargo: 1049 },
  { oper: "02/ENE", desc: "RETIRO CAJERO AUTOMATICO", cargo: 2000 },
  { oper: "05/ENE", desc: "SPEI RECIBIDO CLIENTE FACTURA", abono: 45000 },
];

function fixtureAscendente() {
  return construir({ periodo: PERIODO_DIC, filas: conSaldos(100000, FILAS_BASE), paginaCorteEn: 3 });
}

describe("adaptador BBVA México · lectura posicional", () => {
  it("detecta el periodo explícito del estado de cuenta", () => {
    expect(detectarPeriodoBbva(PERIODO_DIC)).toEqual({ inicio: "2025-12-26", fin: "2026-01-25" });
    expect(detectarPeriodoBbva("Periodo: ENERO 2026")).toEqual({ inicio: "2026-01-01", fin: "2026-01-31" });
  });

  it("importa automáticamente cuando columnas, fechas y saldos cuadran", () => {
    const r = leerBbvaDesdeElementos(fixtureAscendente());
    expect(r.problemas).toEqual([]);
    expect(r.auto).toBe(true);
    expect(r.confianza).toBe("alta");
    expect(r.movimientos).toHaveLength(5);
    expect(r.calculado.cargos).toBe(51549);
    expect(r.calculado.abonos).toBe(45000);
    expect(r.calculado.saldo_inicial).toBe(100000);
    expect(r.calculado.saldo_final).toBe(93451);
    expect(r.calculado.diferencia).toBe(0);
  });

  it("reconoce el encabezado real aunque OPER/LIQ estén en otra línea visual", () => {
    const elementos = fixtureAscendente();
    const sinEncabezadoPrimeraPagina = elementos.filter(
      (item) => !(item.pagina === 1 && item.y === 700),
    );
    sinEncabezadoPrimeraPagina.push(...encabezadoPartido(1, 700));
    const deteccion = detectarAdaptador(sinEncabezadoPrimeraPagina);
    const resultado = leerPdfBancario(sinEncabezadoPrimeraPagina);
    expect(deteccion.adaptador.adaptador).toBe("bbva-mx");
    expect(resultado.auto).toBe(true);
    expect(resultado.movimientos).toHaveLength(5);
  });

  it("reconoce F. OPER / F. LIQ y encabezados fusionados por pdf.js", () => {
    const elementos = fixtureAscendente().filter(
      (item) => !(item.pagina === 1 && item.y === 700),
    );
    elementos.push(
      el(1, "F. OPER   F. LIQ.", X.oper, 710, 58),
      el(1, "COD. DESCRIPCIÓN / REFERENCIA", X.desc, 700, 160),
      el(1, "CARGOS", X.cargo - 20, 700, 40),
      el(1, "ABONOS", X.abono - 20, 700, 40),
      el(1, "SALDO", X.saldo - 18, 700, 36),
    );
    const resultado = leerPdfBancario(elementos);
    expect(resultado.adaptador).toBe("bbva-mx");
    expect(resultado.auto).toBe(true);
    expect(resultado.movimientos).toHaveLength(5);
  });

  it("respeta el año del periodo y nunca produce 2002, 2030 ni 2031", () => {
    const r = leerBbvaDesdeElementos(fixtureAscendente());
    expect(r.movimientos.map((m) => m.fecha)).toEqual([
      "2025-12-30", "2025-12-30", "2025-12-31", "2026-01-02", "2026-01-05",
    ]);
    expect(r.movimientos.some((m) => /^(2002|2030|2031)/.test(m.fecha))).toBe(false);
  });

  it("clasifica por columna: SPEI enviado y retiro son cargo, SPEI recibido es abono", () => {
    const r = leerBbvaDesdeElementos(fixtureAscendente());
    const retiro = r.movimientos.find((m) => m.descripcion.includes("RETIRO"))!;
    const recibido = r.movimientos.find((m) => m.descripcion.includes("RECIBIDO"))!;
    expect([retiro.cargo, retiro.abono]).toEqual([2000, 0]);
    expect([recibido.cargo, recibido.abono]).toEqual([0, 45000]);
    expect(retiro.traza.columna_importe).toBe("cargo");
    expect(recibido.traza.evidencia_sentido).toBe("columna+saldo");
  });

  it("une descripciones de varias líneas al mismo movimiento", () => {
    const r = leerBbvaDesdeElementos(fixtureAscendente());
    expect(r.movimientos[0].descripcion).toContain("REFERENCIA 0066398014");
    expect(r.movimientos[0].cargo).toBe(19800);
    expect(r.movimientos[1].descripcion).not.toContain("REFERENCIA 0066398014");
  });

  it("conserva la traza de la primera y la última fila con página y coordenadas", () => {
    const r = leerBbvaDesdeElementos(fixtureAscendente());
    const primera = r.movimientos[0].traza;
    const ultima = r.movimientos[r.movimientos.length - 1].traza;
    expect(primera.pagina).toBe(1);
    expect(ultima.pagina).toBe(2); // encabezado repetido en la segunda página
    expect(primera.x_columna).toBeGreaterThan(0);
    expect(ultima.fecha_liquidacion).toBe("2026-01-05");
  });

  it("lee igual un estado impreso en orden descendente", () => {
    const asc = conSaldos(100000, FILAS_BASE);
    const desc = [...asc].reverse();
    const r = leerBbvaDesdeElementos(construir({ periodo: PERIODO_DIC, filas: desc }));
    expect(r.problemas).toEqual([]);
    expect(r.auto).toBe(true);
    expect(r.calculado.orden).toBe("descendente");
    expect(r.calculado.saldo_inicial).toBe(100000);
    expect(r.calculado.saldo_final).toBe(93451);
  });

  it("bloquea cuando el saldo contradice la columna, sin corregir nada", () => {
    const filas = conSaldos(100000, FILAS_BASE);
    filas[2] = { ...filas[2], saldo: (filas[2].saldo as number) + 500 };
    const r = leerBbvaDesdeElementos(construir({ periodo: PERIODO_DIC, filas }));
    expect(r.auto).toBe(false);
    expect(r.problemas.map((p) => p.codigo)).toContain("CONTRADICCION_SALDO");
    expect(r.problemas.find((p) => p.codigo === "CONTRADICCION_SALDO")?.fila_visual).toBeGreaterThan(0);
  });

  it("bloquea cuando los totales del resumen no coinciden con lo leído", () => {
    const r = leerBbvaDesdeElementos(
      construir({
        periodo: PERIODO_DIC,
        filas: conSaldos(100000, FILAS_BASE),
        totales: { cargos: 51000, abonos: 45000 },
      }),
    );
    expect(r.auto).toBe(false);
    expect(r.problemas.map((p) => p.codigo)).toContain("TOTALES_RESUMEN");
  });

  it("bloquea una fecha fuera del periodo declarado", () => {
    const filas = conSaldos(100000, [...FILAS_BASE, { oper: "30/ENE", desc: "PAGO", cargo: 500 }]);
    const r = leerBbvaDesdeElementos(construir({ periodo: PERIODO_DIC, filas }));
    expect(r.auto).toBe(false);
    expect(r.problemas.map((p) => p.codigo)).toContain("FECHA_FUERA_PERIODO");
  });

  it("acepta 30/ENE cuando el periodo sí lo cubre y lo clasifica como cargo", () => {
    const r = leerBbvaDesdeElementos(
      construir({
        periodo: "Periodo DEL 01/01/2026 AL 31/01/2026",
        filas: conSaldos(10000, [{ oper: "30/ENE", desc: "PAGO CUENTA DE TERCERO", cargo: 500 }]),
      }),
    );
    expect(r.auto).toBe(true);
    expect(r.movimientos[0]).toMatchObject({ fecha: "2026-01-30", cargo: 500, abono: 0 });
  });

  it("bloquea si el concepto contradice la columna en la que está el importe", () => {
    const filas = conSaldos(100000, [
      { oper: "10/ENE", desc: "SPEI ENVIADO PROVEEDOR", abono: 1000 },
    ]);
    const r = leerBbvaDesdeElementos(
      construir({ periodo: "Periodo DEL 01/01/2026 AL 31/01/2026", filas }),
    );
    expect(r.auto).toBe(false);
    expect(r.problemas.map((p) => p.codigo)).toContain("CONTRADICCION_DESCRIPCION");
    // No se corrige sola: el importe sigue donde el banco lo imprimió.
    expect(r.movimientos[0].abono).toBe(1000);
  });

  it("sin periodo explícito no puede importarse automáticamente", () => {
    const r = leerBbvaDesdeElementos(
      construir({ periodo: "Cuenta Maestra PyME", filas: conSaldos(1000, [{ oper: "10/ENE", desc: "PAGO", cargo: 100 }]) }),
    );
    expect(r.auto).toBe(false);
    expect(r.problemas.map((p) => p.codigo)).toContain("PERIODO_NO_DETECTADO");
  });
});

describe("registro de adaptadores · fallback cerrado", () => {
  it("reconoce el formato BBVA por señales combinadas", () => {
    const { adaptador, puntaje } = detectarAdaptador(fixtureAscendente());
    expect(adaptador.adaptador).toBe("bbva-mx");
    expect(puntaje).toBeGreaterThanOrEqual(6);
  });

  it("un PDF con la palabra BBVA pero sin la tabla conocida cae al genérico", () => {
    const elementos = [
      el(1, "BBVA MÉXICO — Estado de cuenta tarjeta de crédito", 40, 700, 260),
      el(1, "10/ENE Compra en línea 1,200.00", 40, 680, 200),
    ];
    const r = leerPdfBancario(elementos);
    expect(r.adaptador).toBe("generico");
    expect(r.auto).toBe(false);
    expect(r.confianza).toBe("insuficiente");
  });

  it("un PDF escaneado (sin elementos de texto) no se importa por confianza de OCR", () => {
    const r = leerPdfBancario([]);
    expect(r.auto).toBe(false);
    expect(r.movimientos).toEqual([]);
    expect(r.problemas.map((p) => p.codigo)).toContain("FORMATO_NO_RECONOCIDO");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESIÓN DE LA VARIANTE HISTÓRICA BBVA (huella de formato 51f8a291)
// Reproduce SÓLO la geometría observada en un estado de cuenta real: encabezado
// de dos niveles con etiquetas fusionadas por pdf.js, cuatro columnas numéricas
// alineadas a la derecha, dos columnas de saldo (operación y liquidación) y
// saldos impresos de forma dispersa. No contiene datos de ningún contribuyente.
// ─────────────────────────────────────────────────────────────────────────────
describe("BBVA · variante de dos niveles con saldos dispersos", () => {
  const R = { cargo: 417.4, abono: 457.8, saldoOp: 512.9, saldoLiq: 594.5 };

  /** Importe alineado por su borde DERECHO, como lo imprime el banco. */
  const der = (pagina: number, valor: number, xDer: number, y: number): ElementoPdf => {
    const texto = valor.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ancho = texto.length * 4.6;
    return el(pagina, texto, xDer - ancho, y, ancho);
  };

  type Fila = {
    oper: string; liq: string; desc: string; desc2?: string;
    cargo?: number; abono?: number; saldoOp?: number; saldoLiq?: number;
  };

  function documento(filas: Fila[]): ElementoPdf[] {
    const out: ElementoPdf[] = [
      el(1, "BBVA BANCOMER, S.A.", 40, 760, 120),
      el(1, "Periodo DEL 25/12/2021 AL 24/01/2022", 40, 745, 200),
      // Nivel 1 y nivel 2 del encabezado, con textos fusionados por pdf.js.
      el(1, "FECHA", 40, 275, 34),
      el(1, "SALDO", 520, 275, 34),
      el(1, "OPER", 40, 265.5, 24),
      el(1, "LIQ", 78, 265.5, 18),
      el(1, "COD. DESCRIPCIÓN / REFERENCIA", 112, 265.5, 160),
      el(1, "CARGOS ABONOS OPERACION", 380, 255.5, 150),
      el(1, "LIQUIDACION", 560, 255.5, 60),
    ];
    let y = 239;
    for (const f of filas) {
      out.push(el(1, f.oper, 40, y, 24), el(1, f.liq, 78, y, 24), el(1, f.desc, 112, y, f.desc.length * 4.6));
      if (f.cargo) out.push(der(1, f.cargo, R.cargo, y));
      if (f.abono) out.push(der(1, f.abono, R.abono, y));
      if (f.saldoOp != null) out.push(der(1, f.saldoOp, R.saldoOp, y));
      if (f.saldoLiq != null) out.push(der(1, f.saldoLiq, R.saldoLiq, y));
      y -= 11;
      if (f.desc2) {
        out.push(el(1, f.desc2, 118, y, f.desc2.length * 4.6));
        y -= 11;
      }
    }
    out.push(el(1, "Total de Movimientos", 112, y - 20, 100));
    return out;
  }

  const FILAS: Fila[] = [
    { oper: "27/DIC", liq: "27/DIC", desc: "PAGO CUENTA DE TERCERO", desc2: "REFERENCIA 0001234567", abono: 1000, saldoOp: 1486, saldoLiq: 1486 },
    { oper: "28/DIC", liq: "29/DIC", desc: "SPEI ENVIADO PROVEEDOR", cargo: 486 },
    { oper: "29/DIC", liq: "30/DIC", desc: "RETIRO CAJERO AUTOMATICO", cargo: 500, saldoOp: 500, saldoLiq: 986 },
    { oper: "10/ENE", liq: "10/ENE", desc: "SPEI RECIBIDO CLIENTE", abono: 2000 },
    { oper: "20/ENE", liq: "20/ENE", desc: "COMISION MANEJO DE CUENTA", cargo: 250, saldoOp: 2250, saldoLiq: 2250 },
  ];

  it("lee las 5 filas, separa ambas columnas de saldo y cuadra la ecuación", () => {
    const r = leerBbvaDesdeElementos(documento(FILAS));
    expect(r.adaptador).toBe("bbva-mx");
    expect(r.movimientos).toHaveLength(5);
    expect(r.problemas).toEqual([]);
    expect(r.auto).toBe(true);
    expect(Math.round(r.calculado.saldo_inicial! * 100)).toBe(48600);
    expect(Math.round(r.calculado.saldo_final! * 100)).toBe(225000);
    expect(Math.round(r.calculado.diferencia * 100)).toBe(0);
    expect(r.movimientos.filter((m) => m.cargo > 0)).toHaveLength(3);
    // La cadena aritmética usa el saldo de OPERACIÓN; el de liquidación se conserva.
    expect(r.movimientos[2].saldo_operacion).toBe(500);
    expect(r.movimientos[2].saldo_liquidacion).toBe(986);
  });

  it("no marca contradicción por 'PAGO CUENTA DE TERCERO', que BBVA usa en ambos sentidos", () => {
    const r = leerBbvaDesdeElementos(documento(FILAS));
    expect(r.problemas.map((p) => p.codigo)).not.toContain("CONTRADICCION_DESCRIPCION");
    expect(r.movimientos[0].abono).toBe(1000);
  });

  it("no pierde el primer movimiento pegado al bloque de encabezado", () => {
    const r = leerBbvaDesdeElementos(documento(FILAS));
    expect(r.movimientos[0]).toMatchObject({ fecha: "2021-12-27", abono: 1000, cargo: 0 });
    expect(r.movimientos[0].descripcion).toContain("REFERENCIA 0001234567");
  });

  it("deja de leer en 'Total de Movimientos'", () => {
    const elementos = documento(FILAS);
    elementos.push(el(1, "31/ENE", 40, 60, 24), el(1, "AVISO PUBLICITARIO", 112, 60, 90));
    const r = leerBbvaDesdeElementos(elementos);
    expect(r.movimientos).toHaveLength(5);
  });
});
