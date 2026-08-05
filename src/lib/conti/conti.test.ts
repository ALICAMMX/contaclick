import { describe, it, expect } from "vitest";
import { limpiarConfianza, contieneConfianzaNumerica, bloqueEvidencia } from "./evidencia";
import { aplicarContrato } from "./contrato";
import { normalizarModo, etiquetaModo, MODO_INFO } from "./modos";
import { detectarCalculo } from "./normativa";
import { hechosCapacidades, validarRecomendacion, advertenciaPorMadurez } from "./capacidades";
import { CAPABILITIES } from "@/lib/capabilities/registry";

describe("Conti — prohibición de confianza numérica", () => {
  const casos = [
    "Respuesta.\n\n🟢 **Nivel de confianza: Alto (95–100%)** — Basado en legislación vigente.",
    "Respuesta.\n> Nivel de certeza: Medio (70-94%)",
    "Esto es correcto con una confianza del 92%.",
    "Cálculo 100% seguro según la ley.",
    "Precisión: 99 %",
  ];

  for (const c of casos) {
    it(`elimina el porcentaje inventado: ${c.slice(0, 40)}…`, () => {
      const limpio = limpiarConfianza(c);
      expect(contieneConfianzaNumerica(limpio)).toBe(false);
      expect(limpio).not.toMatch(/\d{1,3}\s*%/);
    });
  }

  it("no toca porcentajes fiscales legítimos", () => {
    const t = "La tasa general de IVA es 16% y la retención de ISR por servicios es 10%.";
    expect(limpiarConfianza(t)).toBe(t);
  });

  it("el contrato marca la respuesta como saneada cuando venía con porcentaje", () => {
    const { content, meta } = aplicarContrato(
      "Texto.\n\n🟡 **Nivel de confianza: Medio (70–94%)** — depende de criterios.",
      { modo: "consulta", evidencia: "general" },
    );
    expect(meta.saneada).toBe(true);
    expect(content).not.toMatch(/Nivel de confianza/i);
    expect(content).toMatch(/\*\*Base de la respuesta:\*\*/);
  });

  it("toda respuesta cierra declarando su base de evidencia", () => {
    const { content } = aplicarContrato("Una respuesta cualquiera.", {
      modo: "guia",
      evidencia: "plataforma",
    });
    expect(content).toContain(bloqueEvidencia("plataforma", "Modo guía de contaclick"));
  });

  it("no duplica el bloque cuando el modelo ya lo incluyó", () => {
    const previo = "Texto.\n\n**Base de la respuesta:** Motor determinista de ContaClick";
    const { content } = aplicarContrato(previo, { modo: "consulta", evidencia: "motor" });
    expect(content.match(/Base de la respuesta/g)).toHaveLength(1);
  });
});

describe("Conti — modos explícitos", () => {
  it("el modo expediente cae a consulta cuando no hay expediente activo", () => {
    expect(normalizarModo("expediente", false)).toBe("consulta");
    expect(normalizarModo("expediente", true)).toBe("expediente");
  });

  it("solo el modo expediente exige expediente", () => {
    expect(MODO_INFO.guia.requiereExpediente).toBe(false);
    expect(MODO_INFO.consulta.requiereExpediente).toBe(false);
    expect(MODO_INFO.expediente.requiereExpediente).toBe(true);
  });

  it("la etiqueta visible nunca miente sobre el expediente", () => {
    expect(etiquetaModo("expediente", null)).toBe("Sin expediente");
    expect(etiquetaModo("expediente", "ACME SA")).toBe("Expediente: ACME SA");
    expect(etiquetaModo("consulta", "ACME SA")).toBe("Consulta general");
  });
});

describe("Conti — reglas fiscales de seguridad", () => {
  it("deriva al motor determinista cuando piden una cifra", () => {
    const d = detectarCalculo("Calcula el ISR de un ingreso de 125,000 en RESICO");
    expect(d.requiere).toBe(true);
    expect(d.ruta).toBe("/app/tools/resico-calculator");
  });

  it("una pregunta conceptual no dispara derivación", () => {
    expect(detectarCalculo("¿Qué es el RESICO?").requiere).toBe(false);
    expect(detectarCalculo("Explícame qué obligaciones tiene una persona moral").requiere).toBe(false);
  });

  it("las rutas de derivación existen en el registro de capacidades", () => {
    for (const texto of [
      "Calcula el ISR de 100,000 en RESICO",
      "Cuánto ISR paga una persona moral con utilidad de 500,000",
      "Calcula el IVA por pagar de 80,000",
    ]) {
      const d = detectarCalculo(texto);
      expect(d.requiere).toBe(true);
      expect(CAPABILITIES.some((c) => c.ruta === d.ruta)).toBe(true);
    }
  });
});

describe("Conti — capacidades como única fuente de verdad", () => {
  it("nunca expone herramientas obsoletas", () => {
    expect(hechosCapacidades().some((h) => h.madurez === "obsoleta")).toBe(false);
  });

  it("toda capacidad no operativa lleva advertencia obligatoria", () => {
    for (const h of hechosCapacidades()) {
      if (h.madurez !== "operativa") expect(h.advertencia).toBeTruthy();
      else expect(h.advertencia).toBeNull();
    }
  });

  it("bloquea recomendar lo que no existe o no está implementado", () => {
    expect(validarRecomendacion("/app/ruta-inventada").existe).toBe(false);
    expect(validarRecomendacion("/app/ruta-inventada").bloqueada).toBe(true);
    for (const c of CAPABILITIES.filter((x) => x.madurez === "proximamente")) {
      expect(validarRecomendacion(c.ruta).bloqueada).toBe(true);
    }
  });

  it("la advertencia de demostración avisa que no es entregable", () => {
    const demo = CAPABILITIES.find((c) => c.madurez === "demostracion");
    if (demo) expect(advertenciaPorMadurez(demo)).toMatch(/sint[eé]tic/i);
  });
});
