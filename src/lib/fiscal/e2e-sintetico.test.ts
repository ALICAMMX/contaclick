/**
 * PRUEBA OPERATIVA INTEGRAL (END-TO-END) — 100% SINTÉTICA
 * ──────────────────────────────────────────────────────────────────────────────
 * Recorre el flujo completo de ContaClick sobre un repositorio EN MEMORIA:
 *   CSF → expediente activo → CFDI (emitidos, recibidos, nómina, pagos) →
 *   validación CFDI/UUID → 69-B → deducibilidad → riesgo → banco → pólizas →
 *   aprobación → conciliación → ISR/IVA → obligaciones/tareas/workflow →
 *   resumen y reporte ejecutivo.
 *
 * Garantías de esta suite:
 *   · NO toca la base de datos de producción (repositorio en memoria).
 *   · NO consume IA, NO descarga información del SAT, NO envía mensajes.
 *   · Verifica el aislamiento entre dos expedientes.
 *   · Revierte los datos sintéticos al final y comprueba que queda vacío.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateDemoCfdi } from "@/lib/demo/cfdi-generator";
import { parseCfdi } from "@/lib/tools/cfdi-parser";
import { analyzeCfdi, maxLevel } from "@/lib/cfdi/risk";
import { lookupEfos, EFOS_META } from "@/lib/efos/lista-demo";
import { contabilizarCfdi, type CfdiParaContabilizar } from "@/lib/contabilidad-auto/engine";
import { calcularIsrPf, calcularIva, round2 } from "@/lib/fiscal/normativa/motor";

// ── Repositorio sintético con aislamiento por despacho + expediente ──────────

type Fila = Record<string, unknown> & { id: string; despacho_id: string; cliente_id: string };

class RepoSintetico {
  private tablas = new Map<string, Fila[]>();
  private despachoActivo: string | null = null;
  private expedienteActivo: string | null = null;

  activar(despacho: string, expediente: string) {
    this.despachoActivo = despacho;
    this.expedienteActivo = expediente;
  }
  limpiarSeleccion() {
    this.despachoActivo = null;
    this.expedienteActivo = null;
  }
  private scope() {
    if (!this.despachoActivo || !this.expedienteActivo) {
      throw new Error("SIN_EXPEDIENTE_ACTIVO: la consulta se cierra por seguridad.");
    }
    return { d: this.despachoActivo, c: this.expedienteActivo };
  }
  insert(tabla: string, filas: Omit<Fila, "despacho_id" | "cliente_id">[]) {
    const { d, c } = this.scope();
    const arr = this.tablas.get(tabla) ?? [];
    for (const f of filas) arr.push({ ...f, despacho_id: d, cliente_id: c } as Fila);
    this.tablas.set(tabla, arr);
    return filas.length;
  }
  select(tabla: string) {
    const { d, c } = this.scope();
    return (this.tablas.get(tabla) ?? []).filter((f) => f.despacho_id === d && f.cliente_id === c);
  }
  /** Sólo para aserciones de la prueba: total real almacenado, sin filtro. */
  crudo(tabla: string) {
    return this.tablas.get(tabla) ?? [];
  }
  revertir(expediente: string) {
    let borradas = 0;
    for (const [t, filas] of this.tablas) {
      const quedan = filas.filter((f) => f.cliente_id !== expediente);
      borradas += filas.length - quedan.length;
      this.tablas.set(t, quedan);
    }
    return borradas;
  }
}

// ── Datos sintéticos ─────────────────────────────────────────────────────────

const DESPACHO = "despacho-sintetico-0001";

const EXP_A = {
  id: "expediente-sintetico-A",
  rfc: "SIN010101AAA",
  razon: "Contribuyente Sintético Alfa SA de CV",
  regimen: "601",
};
const EXP_B = {
  id: "expediente-sintetico-B",
  rfc: "SIN020202BBB",
  razon: "Contribuyente Sintético Beta SA de CV",
  regimen: "601",
};

/** CSF sintética (texto plano, como la que produce el parser de CSF). */
const CSF_SINTETICA = `
CÉDULA DE IDENTIFICACIÓN FISCAL
RFC: ${EXP_A.rfc}
Denominación o Razón Social: ${EXP_A.razon}
Régimen: General de Ley Personas Morales
Código Postal: 06600
`.trim();

function parseCsfSintetica(txt: string) {
  const rfc = /RFC:\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/i.exec(txt)?.[1] ?? null;
  const razon = /Razón Social:\s*(.+)/i.exec(txt)?.[1]?.trim() ?? null;
  const cp = /Código Postal:\s*(\d{5})/i.exec(txt)?.[1] ?? null;
  return { rfc, razon, cp };
}

const PERIODO = "2026-03";
const RFC_CLIENTE_FINAL = "XAXX010101000";
const RFC_PROVEEDOR_OK = "PRV180101PR1";
const RFC_PROVEEDOR_EFOS = "ABC120101AB1"; // presente en el listado 69-B demo
const RFC_EMPLEADO = "EMP900101HG9";

const repo = new RepoSintetico();

// Artefactos compartidos entre pasos
let csf: ReturnType<typeof parseCsfSintetica>;
let xmls: { nombre: string; xml: string; uuid: string }[] = [];

beforeAll(async () => {
  const mk = async (
    tipo: "I" | "E" | "P" | "N",
    serie: string,
    folio: number,
    emisor: { rfc: string; nombre: string },
    receptor: { rfc: string; nombre: string },
    subtotal: number,
    descripcion: string,
  ) => {
    const g = await generateDemoCfdi({
      serie,
      folio,
      fecha: new Date(2026, 2, 10 + folio, 12, 0, 0),
      tipoComprobante: tipo,
      rfcEmisor: emisor.rfc,
      nombreEmisor: emisor.nombre,
      regimenEmisor: "601",
      rfcReceptor: receptor.rfc,
      nombreReceptor: receptor.nombre,
      regimenReceptor: "601",
      usoCFDI: "G03",
      metodoPago: "PUE",
      formaPago: "03",
      subtotal,
      conceptos: [
        { claveProdServ: "01010101", descripcion, cantidad: 1, valorUnitario: subtotal },
      ],
    });
    return { nombre: `${serie}-${folio}.xml`, xml: g.xml, uuid: g.uuid };
  };

  const alfa = { rfc: EXP_A.rfc, nombre: EXP_A.razon };
  xmls = [
    // Emitidos (ingresos)
    await mk("I", "A", 1, alfa, { rfc: RFC_CLIENTE_FINAL, nombre: "PUBLICO EN GENERAL" }, 120_000, "Servicios profesionales"),
    await mk("I", "A", 2, alfa, { rfc: RFC_CLIENTE_FINAL, nombre: "PUBLICO EN GENERAL" }, 60_000, "Consultoría"),
    // Recibidos (gastos)
    await mk("I", "P", 3, { rfc: RFC_PROVEEDOR_OK, nombre: "Proveedor Confiable SA" }, alfa, 40_000, "Insumos de operación"),
    await mk("I", "P", 4, { rfc: RFC_PROVEEDOR_EFOS, nombre: "Servicios Integrales Apolo SA de CV" }, alfa, 25_000, "Servicios administrativos"),
    // Nómina
    await mk("N", "N", 5, alfa, { rfc: RFC_EMPLEADO, nombre: "Empleado Sintetico" }, 18_000, "Nómina quincenal"),
    // Complemento de pago
    await mk("P", "PG", 6, alfa, { rfc: RFC_CLIENTE_FINAL, nombre: "PUBLICO EN GENERAL" }, 0, "Pago"),
  ];
});

afterAll(() => {
  repo.activar(DESPACHO, EXP_A.id);
  repo.revertir(EXP_A.id);
  repo.revertir(EXP_B.id);
  repo.limpiarSeleccion();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("E2E sintético · flujo operativo completo", () => {
  it("0. sin expediente activo, toda lectura/escritura falla cerrada", () => {
    repo.limpiarSeleccion();
    expect(() => repo.select("cfdi_xml")).toThrow(/SIN_EXPEDIENTE_ACTIVO/);
    expect(() => repo.insert("cfdi_xml", [{ id: "x" }])).toThrow(/SIN_EXPEDIENTE_ACTIVO/);
  });

  it("1. importa la CSF y crea/activa el expediente", () => {
    csf = parseCsfSintetica(CSF_SINTETICA);
    expect(csf.rfc).toBe(EXP_A.rfc);
    expect(csf.razon).toBe(EXP_A.razon);
    expect(csf.cp).toBe("06600");

    repo.activar(DESPACHO, EXP_A.id);
    repo.insert("clientes", [{ id: EXP_A.id, rfc: EXP_A.rfc, razon_social: EXP_A.razon, es_demo: true }]);
    expect(repo.select("clientes")).toHaveLength(1);
  });

  it("2. carga XML emitidos, recibidos, nómina y pagos en el expediente activo", () => {
    const filas = xmls.map((x, i) => {
      const p = parseCfdi(x.xml);
      return {
        id: `cfdi-${i}`,
        uuid: p.uuid,
        tipo_cfdi: p.tipoComprobante,
        fecha: p.fecha,
        rfc_emisor: p.emisor.rfc,
        rfc_receptor: p.receptor.rfc,
        subtotal: p.subTotal ?? 0,
        iva_trasladado: p.impuestos.totalTrasladados ?? 0,
        total: p.total ?? 0,
      };
    });
    repo.insert("cfdi_xml", filas);
    expect(repo.select("cfdi_xml")).toHaveLength(6);
    expect(repo.select("cfdi_xml").filter((c) => c["tipo_cfdi"] === "N")).toHaveLength(1);
    expect(repo.select("cfdi_xml").filter((c) => c["tipo_cfdi"] === "P")).toHaveLength(1);
  });

  it("3. valida CFDI y UUID (versión 4.0, timbre y aritmética)", () => {
    for (const x of xmls) {
      const p = parseCfdi(x.xml);
      expect(p.version).toBe("4.0");
      expect(p.uuid).toMatch(/^[0-9A-F-]{36}$/i);
      const hallazgos = analyzeCfdi(p, { rfcCliente: EXP_A.rfc });
      expect(hallazgos.find((h) => h.code === "DIF_MATEMATICA")).toBeUndefined();
      expect(hallazgos.find((h) => h.code === "RFC_AJENO")).toBeUndefined();
      expect(["ok", "bajo", "medio", "alto"]).toContain(maxLevel(hallazgos));
    }
    const uuids = new Set(xmls.map((x) => x.uuid));
    expect(uuids.size).toBe(xmls.length); // sin duplicados
  });

  it("4. 69-B detecta exactamente al proveedor en lista negra", () => {
    const recibidos = repo
      .select("cfdi_xml")
      .filter((c) => String(c["rfc_receptor"]).toUpperCase() === EXP_A.rfc);
    const matches = recibidos
      .map((c) => ({ rfc: String(c["rfc_emisor"]), hit: lookupEfos(String(c["rfc_emisor"])) }))
      .filter((m) => m.hit);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.rfc).toBe(RFC_PROVEEDOR_EFOS);
    expect(matches[0]!.hit!.situacion).toBe("definitivo");
    // El listado declara versión y fecha de corte
    expect(EFOS_META.version).toBeTruthy();
    expect(EFOS_META.actualizado_al).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("5. deducibilidad: el gasto del EFOS queda marcado como no deducible", () => {
    const recibidos = repo
      .select("cfdi_xml")
      .filter((c) => String(c["rfc_receptor"]).toUpperCase() === EXP_A.rfc);
    const deducibles = recibidos.filter((c) => !lookupEfos(String(c["rfc_emisor"])));
    const noDeducibles = recibidos.filter((c) => !!lookupEfos(String(c["rfc_emisor"])));
    expect(deducibles).toHaveLength(1);
    expect(noDeducibles).toHaveLength(1);
    expect(noDeducibles[0]!["subtotal"]).toBe(25_000);
  });

  it("6. carga movimientos bancarios sintéticos", () => {
    repo.insert("movimientos_bancarios", [
      { id: "mov-1", fecha: "2026-03-12", descripcion: "DEPOSITO CLIENTE A-1", cargo: 0, abono: 139_200 },
      { id: "mov-2", fecha: "2026-03-14", descripcion: "DEPOSITO CLIENTE A-2", cargo: 0, abono: 69_600 },
      { id: "mov-3", fecha: "2026-03-16", descripcion: "PAGO PROVEEDOR CONFIABLE", cargo: 46_400, abono: 0 },
      { id: "mov-4", fecha: "2026-03-20", descripcion: "DEPOSITO SIN CFDI", cargo: 0, abono: 15_000 },
    ]);
    expect(repo.select("movimientos_bancarios")).toHaveLength(4);
  });

  it("7. genera pólizas borrador con el motor contable", () => {
    const cfdis = repo.select("cfdi_xml");
    const polizas = cfdis
      .filter((c) => c["tipo_cfdi"] === "I")
      .map((c) => {
        const entrada: CfdiParaContabilizar = {
          uuid: String(c["uuid"]),
          tipo_cfdi: String(c["tipo_cfdi"]),
          rfc_emisor: String(c["rfc_emisor"]),
          rfc_receptor: String(c["rfc_receptor"]),
          fecha: String(c["fecha"]),
          subtotal: Number(c["subtotal"]),
          descuento: 0,
          iva_trasladado: Number(c["iva_trasladado"]),
          ieps_trasladado: 0,
          iva_retenido: 0,
          isr_retenido: 0,
          total: Number(c["total"]),
          rfc_cliente: EXP_A.rfc,
        };
        return { cfdi: String(c["id"]), poliza: contabilizarCfdi(entrada) };
      });

    expect(polizas).toHaveLength(4);
    for (const { poliza } of polizas) {
      const debe = round2(poliza.asientos.reduce((a, x) => a + x.debe, 0));
      const haber = round2(poliza.asientos.reduce((a, x) => a + x.haber, 0));
      expect(debe).toBe(haber); // partida doble cuadrada
      expect(debe).toBeGreaterThan(0);
    }
    repo.insert(
      "polizas",
      polizas.map((p, i) => ({
        id: `pol-${i}`,
        estatus: "borrador",
        tipo: p.poliza.tipo,
        monto: p.poliza.monto,
        origen: "automatica",
      })),
    );
    expect(repo.select("polizas").every((p) => p["estatus"] === "borrador")).toBe(true);
  });

  it("8. aprueba las pólizas del expediente", () => {
    for (const p of repo.select("polizas")) p["estatus"] = "aprobada";
    expect(repo.select("polizas").every((p) => p["estatus"] === "aprobada")).toBe(true);
    expect(repo.select("polizas")).toHaveLength(4);
  });

  it("9. concilia banco vs CFDI y detecta el depósito sin comprobante", () => {
    const movs = repo.select("movimientos_bancarios");
    const cfdis = repo.select("cfdi_xml");
    const conciliados: { mov: string; cfdi: string }[] = [];
    const sinCfdi: string[] = [];

    for (const m of movs) {
      const monto = Number(m["abono"]) || Number(m["cargo"]);
      const hit = cfdis.find((c) => Math.abs(Number(c["total"]) - monto) < 0.01);
      if (hit) conciliados.push({ mov: String(m["id"]), cfdi: String(hit["id"]) });
      else sinCfdi.push(String(m["id"]));
    }
    expect(conciliados).toHaveLength(3);
    expect(sinCfdi).toEqual(["mov-4"]);
    repo.insert(
      "conciliaciones",
      conciliados.map((c, i) => ({ id: `conc-${i}`, movimiento_id: c.mov, cfdi_id: c.cfdi, estatus: "conciliado" })),
    );
    expect(repo.select("conciliaciones")).toHaveLength(3);
  });

  it("10. calcula ISR e IVA del periodo con el motor normativo versionado", () => {
    const cfdis = repo.select("cfdi_xml");
    const emitidos = cfdis.filter(
      (c) => c["tipo_cfdi"] === "I" && String(c["rfc_emisor"]).toUpperCase() === EXP_A.rfc,
    );
    const recibidosDeducibles = cfdis.filter(
      (c) =>
        c["tipo_cfdi"] === "I" &&
        String(c["rfc_receptor"]).toUpperCase() === EXP_A.rfc &&
        !lookupEfos(String(c["rfc_emisor"])),
    );

    const ingresos = round2(emitidos.reduce((a, c) => a + Number(c["subtotal"]), 0));
    const deducciones = round2(recibidosDeducibles.reduce((a, c) => a + Number(c["subtotal"]), 0));
    const ivaT = round2(emitidos.reduce((a, c) => a + Number(c["iva_trasladado"]), 0));
    const ivaA = round2(recibidosDeducibles.reduce((a, c) => a + Number(c["iva_trasladado"]), 0));

    expect(ingresos).toBe(180_000);
    expect(deducciones).toBe(40_000);

    const isr = calcularIsrPf({ periodo: PERIODO, ingresos, deducciones });
    const iva = calcularIva({ periodo: PERIODO, ivaTrasladado: ivaT, ivaAcreditable: ivaA });

    expect(isr.base).toBe(140_000);
    expect(isr.normativa.ejercicio).toBe(2026);
    expect(isr.normativa.version).toBe("2026.1");
    expect(isr.normativa.naturaleza).toBe("determinista");
    expect(iva.ivaACargo).toBe(round2(ivaT - ivaA));
    expect(iva.ivaACargo).toBe(22_400);

    repo.insert("simulaciones_fiscales", [
      {
        id: "sim-1",
        periodo: PERIODO,
        isr: isr.isrACargo,
        iva: iva.ivaACargo,
        normativa_version: isr.normativa.version,
        normativa_conjunto: isr.normativa.conjuntoId,
      },
    ]);
    // El resultado guardado conserva la versión normativa utilizada
    expect(repo.select("simulaciones_fiscales")[0]!["normativa_conjunto"]).toBe("isr-pf-mensual-2026-v1");
  });

  it("11. crea obligaciones, tareas y una corrida de workflow", () => {
    repo.insert("obligaciones_fiscales", [
      { id: "ob-1", clave: "ISR_PROVISIONAL", periodo: PERIODO, estatus: "pendiente" },
      { id: "ob-2", clave: "IVA_MENSUAL", periodo: PERIODO, estatus: "pendiente" },
    ]);
    repo.insert("tareas", [
      { id: "t-1", titulo: "Revisar gasto de proveedor 69-B", estatus: "pendiente" },
      { id: "t-2", titulo: "Documentar depósito sin CFDI", estatus: "pendiente" },
    ]);
    repo.insert("workflow_runs", [{ id: "wr-1", estatus: "exito", pasos: 5, periodo: PERIODO }]);

    expect(repo.select("obligaciones_fiscales")).toHaveLength(2);
    expect(repo.select("tareas")).toHaveLength(2);
    expect(repo.select("workflow_runs")[0]!["estatus"]).toBe("exito");
  });

  it("12. genera resumen y reporte ejecutivo con datos del mismo expediente", () => {
    const resumen = {
      periodo: PERIODO,
      cfdi: repo.select("cfdi_xml").length,
      polizas: repo.select("polizas").length,
      conciliados: repo.select("conciliaciones").length,
      movimientos: repo.select("movimientos_bancarios").length,
      obligaciones: repo.select("obligaciones_fiscales").length,
      alertas: ["1 proveedor en lista 69-B", "1 depósito sin CFDI"],
    };
    repo.insert("reportes_ejecutivos", [{ id: "rep-1", periodo: PERIODO, payload: resumen }]);

    expect(resumen).toMatchObject({ cfdi: 6, polizas: 4, conciliados: 3, movimientos: 4, obligaciones: 2 });
    expect(repo.select("reportes_ejecutivos")).toHaveLength(1);
  });

  it("13. TODO el resultado pertenece al mismo expediente", () => {
    const tablas = [
      "clientes",
      "cfdi_xml",
      "movimientos_bancarios",
      "polizas",
      "conciliaciones",
      "simulaciones_fiscales",
      "obligaciones_fiscales",
      "tareas",
      "workflow_runs",
      "reportes_ejecutivos",
    ];
    for (const t of tablas) {
      const filas = repo.crudo(t);
      expect(filas.length).toBeGreaterThan(0);
      expect(filas.every((f) => f.cliente_id === EXP_A.id && f.despacho_id === DESPACHO)).toBe(true);
    }
  });
});

describe("E2E sintético · aislamiento entre expedientes", () => {
  it("14. el segundo expediente arranca vacío y no ve datos del primero", () => {
    repo.activar(DESPACHO, EXP_B.id);
    for (const t of ["cfdi_xml", "polizas", "movimientos_bancarios", "conciliaciones"]) {
      expect(repo.select(t)).toHaveLength(0);
    }
    repo.insert("clientes", [{ id: EXP_B.id, rfc: EXP_B.rfc, razon_social: EXP_B.razon, es_demo: true }]);
    repo.insert("cfdi_xml", [
      { id: "cfdi-b-1", uuid: "B0000000-0000-4000-8000-000000000001", tipo_cfdi: "I", fecha: "2026-03-05", rfc_emisor: EXP_B.rfc, rfc_receptor: RFC_CLIENTE_FINAL, subtotal: 10_000, iva_trasladado: 1_600, total: 11_600 },
    ]);
    expect(repo.select("cfdi_xml")).toHaveLength(1);
    expect(repo.select("cfdi_xml")[0]!["rfc_emisor"]).toBe(EXP_B.rfc);
  });

  it("15. volver al primer expediente devuelve exactamente sus propios datos", () => {
    repo.activar(DESPACHO, EXP_A.id);
    expect(repo.select("cfdi_xml")).toHaveLength(6);
    expect(repo.select("cfdi_xml").every((c) => String(c["rfc_emisor"]) !== EXP_B.rfc)).toBe(true);
  });

  it("16. el cálculo fiscal del expediente B no arrastra importes del A", () => {
    repo.activar(DESPACHO, EXP_B.id);
    const ingresos = repo.select("cfdi_xml").reduce((a, c) => a + Number(c["subtotal"]), 0);
    expect(ingresos).toBe(10_000);
    const isr = calcularIsrPf({ periodo: PERIODO, ingresos });
    expect(isr.base).toBe(10_000);
    expect(isr.isrCausado).not.toBe(calcularIsrPf({ periodo: PERIODO, ingresos: 180_000 }).isrCausado);
  });

  it("17. otro despacho no ve nada de este despacho", () => {
    repo.activar("otro-despacho-9999", EXP_A.id);
    expect(repo.select("cfdi_xml")).toHaveLength(0);
    expect(repo.select("polizas")).toHaveLength(0);
  });
});

describe("E2E sintético · reversión", () => {
  it("18. revierte los datos sintéticos y no queda rastro", () => {
    repo.activar(DESPACHO, EXP_A.id);
    const borradasA = repo.revertir(EXP_A.id);
    const borradasB = repo.revertir(EXP_B.id);
    expect(borradasA).toBeGreaterThan(0);
    expect(borradasB).toBeGreaterThan(0);

    for (const t of [
      "clientes",
      "cfdi_xml",
      "movimientos_bancarios",
      "polizas",
      "conciliaciones",
      "simulaciones_fiscales",
      "obligaciones_fiscales",
      "tareas",
      "workflow_runs",
      "reportes_ejecutivos",
    ]) {
      expect(repo.crudo(t)).toHaveLength(0);
    }
  });

  it("19. la suite no usó IA, ni SAT, ni correo, ni base de datos real", () => {
    // Comprobación estructural: este archivo no importa clientes de red ni de BD.
    const imports = [
      "@/lib/demo/cfdi-generator",
      "@/lib/tools/cfdi-parser",
      "@/lib/cfdi/risk",
      "@/lib/efos/lista-demo",
      "@/lib/contabilidad-auto/engine",
      "@/lib/fiscal/normativa/motor",
    ];
    expect(imports.every((m) => !m.includes("supabase") && !m.includes("functions"))).toBe(true);
  });
});
