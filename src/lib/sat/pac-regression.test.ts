// =====================================================================
// Regresión permanente del SALDO PAC (SAT).
//
// 1. Modelo determinista del contrato de las funciones SQL (reserva,
//    consumo, devolución, idempotencia, saldo no negativo, libro inmutable).
//    Corre siempre, en CI, sin base de datos.
// 2. Ejecución opcional de la suite SQL real contra la base
//    (supabase/tests/pac_regression.sql) cuando hay credenciales con
//    permiso de ejecución: PAC_SQL_TESTS=1 y PGHOST definidos.
//    Esa suite corre dentro de BEGIN/ROLLBACK: no altera datos reales.
// =====================================================================
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// ---------------------------------------------------------------------
// 1) Modelo del libro PAC — refleja pac_reservar / pac_confirmar_consumo /
//    pac_recargar tal como quedaron después de corregir la ambigüedad de
//    columna `saldo_solicitudes` (la salida debe ser el saldo POSTERIOR).
// ---------------------------------------------------------------------
type Mov = {
  tipo: "recarga" | "reserva" | "consumo" | "devolucion";
  solicitudes: number;
  key: string;
};

class LibroPac {
  saldo = 0;
  reservado = 0;
  readonly movs: Mov[] = [];
  private frozen = new Set<string>();

  private yaAplicado(key: string) {
    return this.movs.some((m) => m.key === key);
  }

  recargar(solicitudes: number, key: string) {
    if (solicitudes <= 0) throw new Error("La recarga debe ser mayor a cero");
    if (this.yaAplicado(key)) return { saldo_solicitudes: this.saldo, duplicado: true };
    this.saldo += solicitudes;
    this.movs.push({ tipo: "recarga", solicitudes, key });
    return { saldo_solicitudes: this.saldo, duplicado: false };
  }

  reservar(solicitudes: number, key: string) {
    if (this.yaAplicado(key)) return { ok: true, duplicado: true, reservadas: solicitudes };
    if (solicitudes > this.saldo - this.reservado) {
      return { ok: false, duplicado: false, reservadas: 0 };
    }
    this.reservado += solicitudes;
    this.movs.push({ tipo: "reserva", solicitudes, key });
    return { ok: true, duplicado: false, reservadas: solicitudes };
  }

  confirmar(key: string, reales: number) {
    if (this.yaAplicado(`${key}:consumo`)) {
      return { saldo_solicitudes: this.saldo, consumidas: 0, devueltas: 0 };
    }
    const reserva = this.movs.find((m) => m.tipo === "reserva" && m.key === key);
    if (!reserva) throw new Error(`No existe reserva para la llave ${key}`);
    const consumidas = Math.min(Math.max(reales, 0), reserva.solicitudes);
    const devueltas = reserva.solicitudes - consumidas;
    this.saldo = Math.max(0, this.saldo - consumidas);
    this.reservado = Math.max(0, this.reservado - reserva.solicitudes);
    this.movs.push({ tipo: "consumo", solicitudes: consumidas, key: `${key}:consumo` });
    if (devueltas > 0) {
      this.movs.push({ tipo: "devolucion", solicitudes: devueltas, key: `${key}:devolucion` });
    }
    return { saldo_solicitudes: this.saldo, consumidas, devueltas };
  }

  /** Equivalente a los triggers tg_pac_mov_inmutable. */
  mutar(key: string): never {
    void this.frozen.add(key);
    throw new Error("Los movimientos de saldo PAC no pueden modificarse ni eliminarse");
  }

  /** Equivalente a pac_conciliacion(): saldo calculado desde el libro. */
  descuadre() {
    const calc = this.movs.reduce(
      (acc, m) =>
        m.tipo === "recarga" ? acc + m.solicitudes : m.tipo === "consumo" ? acc - m.solicitudes : acc,
      0,
    );
    return calc - this.saldo;
  }
}

describe("saldo PAC — contrato de recarga y confirmación (regresión del choque de nombres)", () => {
  it("la recarga devuelve el saldo POSTERIOR, no el anterior", () => {
    const l = new LibroPac();
    expect(l.recargar(100, "k1")).toEqual({ saldo_solicitudes: 100, duplicado: false });
    expect(l.recargar(50, "k2").saldo_solicitudes).toBe(150);
  });

  it("la recarga es idempotente por llave", () => {
    const l = new LibroPac();
    l.recargar(100, "k1");
    expect(l.recargar(100, "k1")).toEqual({ saldo_solicitudes: 100, duplicado: true });
    expect(l.saldo).toBe(100);
  });

  it("rechaza recargas no positivas", () => {
    expect(() => new LibroPac().recargar(0, "k")).toThrow(/mayor a cero/);
  });

  it("la confirmación devuelve el saldo POSTERIOR y separa consumo de devolución", () => {
    const l = new LibroPac();
    l.recargar(100, "r1");
    l.reservar(30, "run1");
    expect(l.confirmar("run1", 12)).toEqual({
      saldo_solicitudes: 88,
      consumidas: 12,
      devueltas: 18,
    });
    expect(l.reservado).toBe(0);
  });

  it("la confirmación es idempotente", () => {
    const l = new LibroPac();
    l.recargar(100, "r1");
    l.reservar(30, "run1");
    l.confirmar("run1", 12);
    expect(l.confirmar("run1", 12)).toEqual({ saldo_solicitudes: 88, consumidas: 0, devueltas: 0 });
  });

  it("no permite confirmar sin reserva previa", () => {
    expect(() => new LibroPac().confirmar("fantasma", 5)).toThrow(/No existe reserva/);
  });

  it("nunca consume más de lo reservado ni deja saldo negativo", () => {
    const l = new LibroPac();
    l.recargar(10, "r1");
    l.reservar(5, "run1");
    const res = l.confirmar("run1", 999);
    expect(res.consumidas).toBe(5);
    expect(l.saldo).toBe(5);
    expect(l.saldo).toBeGreaterThanOrEqual(0);
  });

  it("rechaza reservas sin saldo disponible (incluye lo ya reservado)", () => {
    const l = new LibroPac();
    l.recargar(10, "r1");
    expect(l.reservar(8, "a").ok).toBe(true);
    expect(l.reservar(5, "b").ok).toBe(false);
  });

  it("el libro de movimientos es inmutable", () => {
    const l = new LibroPac();
    l.recargar(10, "r1");
    expect(() => l.mutar("r1")).toThrow(/no pueden modificarse/);
  });

  it("el libro cuadra contra el saldo tras una secuencia concurrente serializada", () => {
    const l = new LibroPac();
    l.recargar(100, "r1");
    for (let i = 0; i < 10; i++) {
      l.reservar(5, `run${i}`);
      l.confirmar(`run${i}`, i % 2 === 0 ? 5 : 2);
    }
    expect(l.descuadre()).toBe(0);
    expect(l.reservado).toBe(0);
  });
});

// ---------------------------------------------------------------------
// 2) Suite SQL real (opcional, pre-despliegue)
// ---------------------------------------------------------------------
const SQL = "supabase/tests/pac_regression.sql";
const canRunSql = process.env["PAC_SQL_TESTS"] === "1" && !!process.env["PGHOST"] && existsSync(SQL);

describe.skipIf(!canRunSql)("saldo PAC — suite SQL contra la base (BEGIN/ROLLBACK)", () => {
  it("ejecuta supabase/tests/pac_regression.sql sin errores", () => {
    const out = execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-f", SQL], { encoding: "utf8" });
    expect(out).toContain("PAC regression: 8/8 OK");
  });
});
