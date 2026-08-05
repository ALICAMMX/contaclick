import { describe, it, expect } from "vitest";
import {
  construirPayloadConti,
  depurarHistorial,
  filtraExpediente,
  mismaConversacion,
  textoExpediente,
  type ExpedienteContexto,
} from "./contexto";
import { ejecutarHerramientaConti } from "./motores";
import { validarRespuestaConti } from "./validador";

const EXP: ExpedienteContexto = {
  clienteId: "11111111-1111-1111-1111-111111111111",
  rfc: "MELR900101AB1",
  razonSocial: "Distribuidora del Bajío SA de CV",
  regimenFiscal: "601",
  tipoPersona: "moral",
};

describe("Conti — aislamiento de contexto por modo", () => {
  it("el payload de Guía no contiene expediente", () => {
    const p = construirPayloadConti("guia", EXP);
    expect(p.expediente).toBeNull();
    expect(textoExpediente(p)).toBeNull();
    expect(JSON.stringify(p)).not.toContain(EXP.rfc);
    expect(JSON.stringify(p)).not.toContain(EXP.razonSocial!);
    expect(JSON.stringify(p)).not.toContain(EXP.clienteId);
    expect(JSON.stringify(p)).not.toContain("601");
  });

  it("el payload de Consulta no contiene expediente ni guías de cliente", () => {
    const p = construirPayloadConti("consulta", EXP);
    expect(p.expediente).toBeNull();
    expect(JSON.stringify(p)).not.toContain(EXP.rfc);
    expect(p.normativa).toBe(true);
  });

  it("el payload de Expediente sí lo recibe (ya validado por scope)", () => {
    const p = construirPayloadConti("expediente", EXP);
    expect(p.expediente?.rfc).toBe(EXP.rfc);
    expect(textoExpediente(p)).toContain(EXP.rfc);
  });

  it("el modo expediente sin scope válido no inventa expediente", () => {
    const p = construirPayloadConti("expediente", null);
    expect(p.expediente).toBeNull();
    expect(textoExpediente(p)).toBeNull();
  });

  it("el historial se depura en Guía y Consulta", () => {
    const hist = [
      { role: "assistant" as const, content: `Expediente activo: ${EXP.razonSocial} (${EXP.rfc}).` },
      { role: "user" as const, content: "¿Y ahora qué sigue?" },
    ];
    for (const modo of ["guia", "consulta"] as const) {
      const out = depurarHistorial(hist, modo, EXP);
      const txt = JSON.stringify(out);
      expect(txt).not.toContain(EXP.rfc);
      expect(txt).not.toContain(EXP.razonSocial!);
      expect(txt.toLowerCase()).not.toContain("expediente activo");
    }
  });

  it("cambiar de modo no conserva la conversación", () => {
    expect(mismaConversacion("guia", "guia")).toBe(true);
    expect(mismaConversacion("guia", "expediente")).toBe(false);
    expect(mismaConversacion(null, "consulta")).toBe(false);
  });

  it("detecta fuga por RFC aunque el expediente no se conozca", () => {
    expect(filtraExpediente("El RFC MELR900101AB1 requiere revisión.", null)).toBe(true);
    expect(filtraExpediente("Abre Salud Fiscal y revisa la cobertura.", null)).toBe(false);
  });
});

describe("Conti — motores deterministas conectados", () => {
  it("RESICO $10,000 con retención 1.25% devuelve 100 / 125 / 0 y diferencia 25", () => {
    const r = ejecutarHerramientaConti("conti_calcular_resico", {
      periodo: "2026-08",
      ingresosCobrados: 10000,
      acumuladoAnualPrevio: 0,
      retencionPersonaMoral: true,
      retencionesEfectuadas: null,
    });
    expect(r.ok).toBe(true);
    expect(r.resultado?.isrCausado).toBe(100);
    expect(r.resultado?.retencion).toBe(125);
    expect(r.resultado?.isrACargo).toBe(0);
    expect(r.resultado?.diferenciaRetencionVsCausado).toBe(25);
  });

  it("RESICO cita 113-E / 113-F / 113-J y nunca el Anexo 8", () => {
    const r = ejecutarHerramientaConti("conti_calcular_resico", {
      periodo: "2026-08",
      ingresosCobrados: 10000,
      acumuladoAnualPrevio: 0,
      retencionPersonaMoral: true,
      retencionesEfectuadas: null,
    });
    const fund = r.fundamentos.join(" | ");
    expect(fund).toContain("113-E");
    expect(fund).toContain("113-F");
    expect(fund).toContain("113-J");
    expect(fund).not.toMatch(/Anexo\s*8/i);
    expect(r.normativa?.fuente).not.toMatch(/Anexo\s*8/i);
    expect(r.normativa?.fuente).toMatch(/113-E/);
  });

  it("no concluye acreditamiento futuro: sólo informa la diferencia", () => {
    const r = ejecutarHerramientaConti("conti_calcular_resico", {
      periodo: "2026-08",
      ingresosCobrados: 10000,
      acumuladoAnualPrevio: 0,
      retencionPersonaMoral: true,
      retencionesEfectuadas: null,
    });
    const txt = [...r.advertencias, ...r.limitaciones].join(" ");
    expect(txt).toMatch(/diferencia aritm[eé]tica/i);
    expect(txt).toMatch(/no (determina|concluye)/i);
  });

  it("cada salida trae sello: conjunto, versión, hash, vigencia y fuente", () => {
    const r = ejecutarHerramientaConti("conti_calcular_iva", {
      periodo: "2026-08",
      ivaTrasladado: 1600,
      ivaAcreditable: 600,
      ivaRetenido: null,
      saldoAFavorAnterior: null,
    });
    expect(r.normativa?.conjuntoId).toBeTruthy();
    expect(r.normativa?.hash).toBeTruthy();
    expect(r.normativa?.version).toBeTruthy();
    expect(r.normativa?.vigencia).toBeTruthy();
    expect(r.normativa?.fuente).toBeTruthy();
  });

  it("un periodo sin tabla cargada bloquea el cálculo en lugar de estimar", () => {
    const r = ejecutarHerramientaConti("conti_calcular_isr_pf", {
      periodo: "1998-03",
      ingresos: 50000,
      deducciones: null,
      retenciones: null,
      pagosProvisionalesAnteriores: null,
    });
    expect(r.ok).toBe(false);
    expect(r.resultado).toBeNull();
  });

  it("una herramienta desconocida no ejecuta nada", () => {
    const r = ejecutarHerramientaConti("conti_borrar_todo", {});
    expect(r.ok).toBe(false);
  });
});

describe("Conti — validador de respuestas", () => {
  const base = { modo: "guia" as const, expediente: EXP, motoresEjecutados: [] as string[] };

  it("rechaza la respuesta de Guía que menciona el expediente activo", () => {
    const v = validarRespuestaConti(
      `Trabajaré sobre el expediente activo ${EXP.razonSocial}.`,
      base,
    );
    expect(v.requiereRegeneracion).toBe(true);
  });

  it("rechaza la respuesta de Consulta que menciona el expediente", () => {
    const v = validarRespuestaConti(`El RFC ${EXP.rfc} está en RESICO.`, {
      ...base,
      modo: "consulta",
    });
    expect(v.requiereRegeneracion).toBe(true);
  });

  it("elimina el umbral inventado de Salud Fiscal mayor a 80", () => {
    const v = validarRespuestaConti(
      "Terminaste cuando tu Salud Fiscal sea mayor a 80 puntos. Después exporta las pólizas.",
      base,
    );
    expect(v.content).not.toMatch(/80/);
    expect(v.violaciones.map((x) => x.regla)).toContain("umbral_salud_no_registrado");
  });

  it("elimina metas de conciliación e incidencias críticas en cero", () => {
    const v = validarRespuestaConti(
      "Busca una conciliación mayor al 95%. Además, incidencias críticas igual a cero para cerrar.",
      base,
    );
    expect(v.content).not.toMatch(/95\s*%/);
    const reglas = v.violaciones.map((x) => x.regla);
    expect(reglas).toContain("umbral_conciliacion_no_registrado");
    expect(reglas).toContain("incidencias_cero_no_registrado");
  });

  it("matiza EFOS definitivo en lugar de invalidar la deducción", () => {
    const v = validarRespuestaConti(
      "Si el proveedor es EFOS definitivo la deducción queda invalidada.",
      base,
    );
    expect(v.content).toMatch(/materialidad/i);
    expect(v.violaciones.map((x) => x.regla)).toContain("efos_deduccion_automatica");
  });

  it("no permite el límite de efectivo de $2,000 como regla general", () => {
    const v = validarRespuestaConti("Todo pago en efectivo mayor a $2,000 es no deducible.", base);
    expect(v.content).toMatch(/depende del supuesto/i);
  });

  it("elimina la mención a pre-SUA porque no existe en el registro", () => {
    const v = validarRespuestaConti("Nómina genera el archivo pre-SUA para el IMSS.", base);
    expect(v.content.toLowerCase()).not.toContain("sua");
    expect(v.violaciones.map((x) => x.regla)).toContain("capacidad_inexistente_presua");
  });

  it("elimina la atribución de RESICO al Anexo 8", () => {
    const v = validarRespuestaConti(
      "La tabla de RESICO se publica en el Anexo 8 de la RMF vigente.",
      { ...base, modo: "consulta", expediente: null },
    );
    expect(v.content).not.toMatch(/Anexo\s*8/i);
  });

  it("sustituye importes por 'No calculado' cuando no se ejecutó motor", () => {
    const v = validarRespuestaConti("ISR causado: $100.00 y pago mensual: $0.00.", {
      ...base,
      modo: "consulta",
      expediente: null,
    });
    expect(v.content).toMatch(/No calculado/);
    expect(v.violaciones.map((x) => x.regla)).toContain("cifra_sin_motor");
  });

  it("respeta los importes cuando el motor sí se ejecutó", () => {
    const v = validarRespuestaConti("ISR causado: $100.00.", {
      ...base,
      modo: "consulta",
      expediente: null,
      motoresEjecutados: ["conti_calcular_resico"],
    });
    expect(v.content).toContain("$100.00");
  });

  it("no publica nombres internos ni tokens", () => {
    const v = validarRespuestaConti("Revisa el pac_token del despacho para continuar.", base);
    expect(v.content).not.toContain("pac_token");
  });

  it("retira rutas internas que no existen en el registro", () => {
    const v = validarRespuestaConti(
      "Ve a [Declaraciones Mensuales](/app/impuestos/mensuales) y presenta el pago.",
      base,
    );
    expect(v.content).not.toContain("/app/impuestos/mensuales");
    expect(v.violaciones.map((x) => x.regla)).toContain("ruta_inexistente");
  });

  it("conserva las rutas registradas", () => {
    const v = validarRespuestaConti("Abre [Riesgo SAT](/app/riesgo).", base);
    expect(v.content).toContain("(/app/riesgo)");
  });

  it("también atrapa el límite de efectivo escrito como $2k", () => {
    const v = validarRespuestaConti("No deducibles: pagos en efectivo >$2k.", base);
    expect(v.content).toMatch(/depende del supuesto/i);
  });

  it("una respuesta correcta de Guía pasa sin correcciones", () => {
    const v = validarRespuestaConti(
      "Abre [Conciliación bancaria](/app/conciliacion) y carga el estado de cuenta del periodo.",
      base,
    );
    expect(v.requiereRegeneracion).toBe(false);
    expect(v.violaciones).toHaveLength(0);
  });
});
