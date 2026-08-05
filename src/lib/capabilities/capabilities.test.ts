import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CAPABILITIES, AGENTES, catalogo, contadores, contadoresAgentes,
  getCapability, getCapabilityByRoute, esUsable,
} from "./registry";
import { resolverAcceso, controlesPermitidos, controlesSonCoherentes } from "./access";
import { TOOLS as TOOLS_SUELTAS } from "@/lib/tools/registry";

const ROUTES_DIR = path.join(process.cwd(), "src/routes");

/** /app/admin/buzon → app.admin.buzon.tsx | /app/clientes → app.clientes.index.tsx */
function existeRuta(ruta: string): boolean {
  const base = ruta.replace(/^\//, "").split("/").join(".");
  const candidatos = [`${base}.tsx`, `${base}.index.tsx`, `${base}.ts`];
  return candidatos.some((f) => fs.existsSync(path.join(ROUTES_DIR, f)));
}

describe("Registro central de capacidades", () => {
  it("no tiene identificadores ni rutas duplicadas", () => {
    const ids = CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const rutas = CAPABILITIES.map((c) => c.ruta);
    expect(new Set(rutas).size).toBe(rutas.length);
  });

  it("toda capacidad visible apunta a una ruta que existe", () => {
    const rotas = CAPABILITIES.filter((c) => c.visibleEnMenu && !existeRuta(c.ruta));
    expect(rotas.map((c) => c.ruta)).toEqual([]);
  });

  it("toda capacidad declara metadatos completos", () => {
    for (const c of CAPABILITIES) {
      expect(c.nombre.length).toBeGreaterThan(2);
      expect(c.descripcion.length).toBeGreaterThan(10);
      expect(c.dependencias.length).toBeGreaterThan(0);
      expect(c.ultimaValidacion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("lo que no está implementado nunca se anuncia en el menú", () => {
    for (const c of CAPABILITIES) {
      if (c.madurez === "proximamente" || c.madurez === "obsoleta") {
        expect(c.visibleEnMenu).toBe(false);
      }
    }
  });

  it("lo que no está implementado o es demo explica por qué", () => {
    for (const c of CAPABILITIES) {
      if (c.madurez === "proximamente" || c.madurez === "demostracion") {
        expect(c.mensajeNoDisponible).toBeTruthy();
      }
    }
  });

  it("una herramienta demo nunca declara datos reales", () => {
    for (const c of CAPABILITIES) {
      if (c.madurez === "demostracion") {
        expect(c.datosSinteticos).toBe(true);
        expect(c.datosReales).toBe(false);
      }
      if (c.datosReales) expect(c.datosSinteticos).toBe(false);
    }
  });
});

describe("Coherencia entre registro, catálogos y contadores", () => {
  it("los contadores se calculan desde el registro y suman el total", () => {
    for (const m of ["contable", "administrativo", "legal"] as const) {
      const c = contadores(m);
      expect(c.operativas + c.beta + c.demo + c.proximamente).toBe(c.total);
      expect(c.total).toBe(catalogo(m).length);
    }
  });

  it("el catálogo nunca incluye obsoletas ni ocultas", () => {
    for (const m of ["contable", "administrativo", "legal", "plataforma"] as const) {
      for (const c of catalogo(m)) {
        expect(c.visibleEnMenu).toBe(true);
        expect(c.madurez).not.toBe("obsoleta");
      }
    }
  });

  it("las herramientas sueltas derivan del registro y no inventan estados", () => {
    for (const t of TOOLS_SUELTAS) {
      expect(esUsable(t.madurez) || t.madurez === "demostracion").toBe(true);
      expect(t.status).toBe("available");
    }
    // Inventarios y Precios de transferencia no pueden aparecer como herramienta suelta.
    expect(TOOLS_SUELTAS.find((t) => t.key === "inventarios")).toBeUndefined();
  });

  it("herramientas reclasificadas quedan fuera del menú", () => {
    expect(getCapability("inventarios")!.madurez).toBe("proximamente");
    expect(getCapability("inventarios")!.visibleEnMenu).toBe(false);
    expect(getCapability("sat-risk")!.madurez).toBe("obsoleta");
    expect(getCapability("legal-marketplace")!.madurez).toBe("demostracion");
  });

  it("resuelve por ruta igual que por identificador", () => {
    expect(getCapabilityByRoute("/app/riesgo")?.id).toBe("riesgo");
  });
});

describe("Acceso por plan, permiso y madurez (falla cerrado)", () => {
  it("permite una herramienta operativa sin restricción de plan", () => {
    const r = resolverAcceso({ id: "cfdi-validator", plan: "starter", permiso: "miembro" });
    expect(r).toMatchObject({ permitido: true, motivo: "ok" });
  });

  it("el plan NUNCA bloquea una herramienta: todos los planes incluyen todo", () => {
    for (const id of ["legal-redactor", "sat-sync", "conciliacion-integral"]) {
      const starter = resolverAcceso({ id, plan: "starter", permiso: "miembro" });
      const despacho = resolverAcceso({ id, plan: "despacho", permiso: "miembro" });
      expect(starter.motivo).not.toBe("plan_insuficiente");
      expect(starter.permitido).toBe(despacho.permitido);
      expect(starter.navegable).toBe(despacho.navegable);
    }
  });

  it("sin plan (trial) el acceso es idéntico al de un plan de pago", () => {
    const sinPlan = resolverAcceso({ id: "legal-redactor", plan: null, permiso: "miembro" });
    const conPlan = resolverAcceso({ id: "legal-redactor", plan: "pro", permiso: "miembro" });
    expect(sinPlan.permitido).toBe(conPlan.permitido);
  });

  it("bloquea por permiso insuficiente", () => {
    const r = resolverAcceso({ id: "admin-panel", plan: "despacho", permiso: "admin_despacho" });
    expect(r.motivo).toBe("permiso_insuficiente");
    expect(resolverAcceso({ id: "admin-panel", plan: "despacho", permiso: "super_admin" }).permitido).toBe(true);
  });

  it("una URL directa a algo sin implementación no se puede abrir", () => {
    const r = resolverAcceso({ id: "precios-transferencia", plan: "despacho", permiso: "super_admin" });
    expect(r.permitido).toBe(false);
    expect(r.navegable).toBe(false);
    expect(r.motivo).toBe("sin_implementacion");
  });

  it("una demo se puede ver pero nunca se considera operación real", () => {
    const r = resolverAcceso({ id: "legal-marketplace", plan: "pro", permiso: "miembro" });
    expect(r.navegable).toBe(true);
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe("solo_demostracion");
  });

  it("una capacidad inexistente falla cerrado", () => {
    expect(resolverAcceso({ id: "no-existe", plan: "despacho", permiso: "super_admin" }).permitido).toBe(false);
  });
});

describe("Agentes", () => {
  it("el contador anunciado coincide con los agentes registrados", () => {
    const c = contadoresAgentes();
    expect(c.total).toBe(AGENTES.length);
    expect(c.operativos + c.proximamente).toBe(c.total);
    expect(c.operativos).toBe(4);
  });

  it("un agente operativo tiene ruta, bitácora y comportamiento ante fallo", () => {
    for (const a of AGENTES.filter((x) => x.estado === "operativo")) {
      expect(a.ruta).toBeTruthy();
      expect(a.tieneBitacora).toBe(true);
      expect(a.ante_fallo.length).toBeGreaterThan(10);
      expect(existeRuta(a.ruta!)).toBe(true);
    }
  });

  it("un agente no implementado no ofrece ejecución y sí explica el motivo", () => {
    for (const a of AGENTES.filter((x) => x.estado === "proximamente")) {
      expect(a.ruta).toBeNull();
      expect(a.mensajeNoDisponible).toBeTruthy();
      expect(controlesPermitidos(a.estado, false)).not.toContain("ejecutar");
    }
  });

  it("nunca coexisten controles incompatibles", () => {
    expect(controlesSonCoherentes(controlesPermitidos("operativo", false))).toBe(true);
    expect(controlesSonCoherentes(controlesPermitidos("operativo", true))).toBe(true);
    expect(controlesSonCoherentes(controlesPermitidos("proximamente", false))).toBe(true);
    expect(controlesSonCoherentes(["ejecutar", "avisar"])).toBe(false);
    expect(controlesSonCoherentes(["ejecutar", "pausar"])).toBe(false);
  });

  it("toda herramienta citada por un agente existe en el registro", () => {
    for (const a of AGENTES) {
      for (const h of a.herramientas) expect(getCapability(h), `${a.id} → ${h}`).toBeTruthy();
    }
  });

  it("ningún agente ejecuta acciones externas sin aprobación humana", () => {
    for (const a of AGENTES) {
      if (a.accionesExternas.length) expect(a.requiereAprobacionHumana).toBe(true);
    }
  });
});

describe("Separación de datos demo y reales en la interfaz", () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

  it("Inventarios ya no muestra KPI ni kardex simulados", () => {
    const src = read("src/routes/app.admin.inventarios.tsx");
    expect(src).not.toContain("KpiTile");
    expect(src).not.toContain("MAT-0021");
    expect(src).toContain('estado="proximamente"');
  });

  it("el Marketplace declara ser demostración y no permite solicitar nada", () => {
    const src = read("src/routes/app.legal.marketplace.tsx");
    expect(src).toContain("SyntheticDataBanner");
    expect(src).toContain('estado="demostracion"');
    expect(src).toContain("disabled");
  });

  it("los catálogos leen del registro y no mantienen listas propias", () => {
    for (const f of ["src/routes/app.contable.index.tsx", "src/routes/app.admin.index.tsx", "src/routes/app.legal.index.tsx"]) {
      const src = read(f);
      expect(src).toContain("@/lib/capabilities/registry");
      expect(src).not.toContain('status: "live"');
    }
  });
});
