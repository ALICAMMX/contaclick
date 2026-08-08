// Regresiones de honestidad del detalle de corrida SAT.
//
// Fallan si vuelve a ser posible mostrar simultáneamente "1 paquete entregado"
// y "sin paquetes", o "no hubo comprobantes nuevos" con nuevos = 1.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  complementosDe,
  esEvidenciaTerminal,
  etiquetaTipoComprobante,
  evaluarProcesamiento,
  llaveModulo,
  resumirPaquetes,
  type EventoModulo,
} from "./procesamiento";
import { clasificarCfdi } from "./linaje";

const MODULOS = ["salud_fiscal", "riesgo_sat", "auditor_cfdi", "efos"];
const ev = (module_id: string, estado: any, motivo?: string): EventoModulo => ({
  module_id,
  estado,
  iniciado_at: "2026-08-08T20:00:00Z",
  finalizado_at: estado === "iniciado" ? null : "2026-08-08T20:01:00Z",
  motivo: motivo ?? null,
});
const todos = (estado: any = "completado") => MODULOS.map((m) => ev(m, estado));

describe("Paquetes · fuente única", () => {
  it("un paquete reportado por el SAT aparece en la lista", () => {
    const r = resumirPaquetes({
      solicitudes: [{ paquetes_procesados: ["58F4A014-B845-4430-92ED-02DD96D3C746_01"] }],
      documentos: [],
      paquetes_reportados: 1,
    });
    expect(r.lista).toHaveLength(1);
    expect(r.reportados).toBe(1);
    expect(r.sin_referencia).toBe(false);
  });

  it("recupera la referencia desde el linaje del XML aunque la solicitud no la traiga", () => {
    const r = resumirPaquetes({
      solicitudes: [{}],
      documentos: [{ sat_paquete_id: "AAAA1111-BBBB-2222-CCCC-333344445555_01" }],
      paquetes_reportados: 1,
    });
    expect(r.lista).toHaveLength(1);
    expect(r.sin_referencia).toBe(false);
  });

  it("paquete histórico sin referencia se explica, no se inventa", () => {
    const r = resumirPaquetes({ solicitudes: [], documentos: [], paquetes_reportados: 1 });
    expect(r.lista).toHaveLength(0);
    expect(r.sin_referencia).toBe(true);
    expect(r.mensaje).toContain("no fue conservada");
  });

  it("sin paquetes reportados no hay contradicción", () => {
    const r = resumirPaquetes({ solicitudes: [], documentos: [], paquetes_reportados: 0 });
    expect(r.reportados).toBe(0);
    expect(r.mensaje).toContain("no entregó paquetes");
  });

  it("el contador nunca queda por debajo de la lista real", () => {
    const r = resumirPaquetes({
      solicitudes: [{ paquetes_encontrados: ["P1", "P2"] }],
      documentos: [],
      paquetes_reportados: 0,
    });
    expect(r.reportados).toBe(2);
  });
});

describe("Clasificación factual del comprobante", () => {
  const rfc = "GORJ850101AAA";

  it("tipo P con total cero se clasifica como Pago", () => {
    expect(clasificarCfdi({ tipo_cfdi: "P", rfc_emisor: "AAA010101AAA", rfc_receptor: rfc, rfc_expediente: rfc })).toBe("pago");
    expect(complementosDe("P")).toContain("Complemento de recepción de pagos");
  });

  it("tipo I recibido se clasifica como Gasto", () => {
    expect(clasificarCfdi({ tipo_cfdi: "I", rfc_emisor: "BBA123456AAA", rfc_receptor: rfc, rfc_expediente: rfc })).toBe("gasto");
  });

  it("tipo I emitido se clasifica como Ingreso", () => {
    expect(clasificarCfdi({ tipo_cfdi: "I", rfc_emisor: rfc, rfc_receptor: "BBA123456AAA", rfc_expediente: rfc })).toBe("ingreso");
  });

  it("N y E se clasifican por el XML, no por un botón de la interfaz", () => {
    expect(clasificarCfdi({ tipo_cfdi: "N", rfc_emisor: rfc, rfc_receptor: "X", rfc_expediente: rfc })).toBe("nomina");
    expect(clasificarCfdi({ tipo_cfdi: "E", rfc_emisor: "X", rfc_receptor: rfc, rfc_expediente: rfc })).toBe("egreso");
    expect(complementosDe("N")).toContain("Complemento de nómina");
    expect(complementosDe("I")).toHaveLength(0);
  });

  it("la clasificación es pura: no depende de ningún estado de la UI", () => {
    const args = { tipo_cfdi: "P", rfc_emisor: "X", rfc_receptor: rfc, rfc_expediente: rfc };
    expect(clasificarCfdi(args)).toBe(clasificarCfdi(args));
    expect(etiquetaTipoComprobante("P")).toContain("Pago");
    expect(etiquetaTipoComprobante("")).toBe("No clasificado");
  });
});

describe("Procesamiento posterior obligatorio", () => {
  it("un XML nuevo sin eventos obliga a procesamiento pendiente", () => {
    const p = evaluarProcesamiento({ cobertura: "total", nuevos: 1, eventos: [] });
    expect(p.requerido).toBe(true);
    expect(p.completo).toBe(false);
    expect(p.estado_honesto).toBe("procesamiento_pendiente");
    expect(p.cobertura_honesta).toBe("pendiente de procesamiento");
    expect(p.puede_recuperar).toBe(true);
    expect(p.accion_label).toBe("Completar procesamiento posterior");
  });

  it("nuevos = 1 nunca produce el mensaje 'no hubo nuevos'", () => {
    const p = evaluarProcesamiento({ nuevos: 1, eventos: [] });
    expect(p.mensaje).not.toMatch(/no incorporó comprobantes nuevos/i);
    expect(p.mensaje).toContain("1 comprobante");
  });

  it("recálculos completos cierran como completada y ocultan el botón", () => {
    const p = evaluarProcesamiento({ cobertura: "total", nuevos: 1, eventos: todos() });
    expect(p.completo).toBe(true);
    expect(p.estado_honesto).toBe("completada");
    expect(p.terminal).toBe(true);
    expect(p.puede_recuperar).toBe(false);
    expect(p.accion_label).toBeNull();
  });

  it("un módulo omitido CON motivo cuenta como evidencia", () => {
    const eventos = [ev("salud_fiscal", "omitido", "Sin evidencia suficiente"), ...todos().slice(1)];
    const p = evaluarProcesamiento({ nuevos: 1, eventos });
    expect(p.completo).toBe(true);
    expect(p.hubo_fallos).toBe(false);
  });

  it("un módulo omitido SIN motivo no cuenta como evidencia", () => {
    const eventos = [ev("salud_fiscal", "omitido"), ...todos().slice(1)];
    const p = evaluarProcesamiento({ nuevos: 1, eventos });
    expect(esEvidenciaTerminal(ev("salud_fiscal", "omitido"))).toBe(false);
    expect(p.completo).toBe(false);
    expect(p.faltantes).toContain("salud_fiscal");
  });

  it("un módulo fallido deja la corrida parcial y permite reanudar", () => {
    const eventos = [...todos().slice(0, 3), ev("efos", "fallido", "timeout")];
    const p = evaluarProcesamiento({ cobertura: "total", nuevos: 1, eventos });
    expect(p.hubo_fallos).toBe(true);
    expect(p.estado_honesto).toBe("parcial");
    expect(p.cobertura_honesta).toBe("parcial");
    expect(p.accion_label).toBe("Reanudar procesamiento");
  });

  it("todos los módulos fallidos declaran error, nunca completada", () => {
    const p = evaluarProcesamiento({ nuevos: 1, eventos: todos("fallido") });
    expect(p.estado_honesto).toBe("error");
  });

  it("un intento parcial previo cambia la etiqueta del botón a Reanudar", () => {
    const p = evaluarProcesamiento({ nuevos: 1, eventos: todos().slice(0, 2) });
    expect(p.estado_honesto).toBe("procesamiento_pendiente");
    expect(p.accion_label).toBe("Reanudar procesamiento");
  });

  it("un módulo en curso bloquea la acción y declara recalculando", () => {
    const p = evaluarProcesamiento({ nuevos: 1, eventos: [ev("salud_fiscal", "iniciado")] });
    expect(p.estado_honesto).toBe("recalculando");
    expect(p.en_curso).toEqual(["salud_fiscal"]);
    expect(p.terminal).toBe(false);
    expect(p.accion_label).toBeNull();
  });

  it("un evento iniciado nunca cuenta como evidencia terminal", () => {
    const p = evaluarProcesamiento({ nuevos: 1, eventos: todos("iniciado") });
    expect(p.completo).toBe(false);
    expect(esEvidenciaTerminal(ev("efos", "iniciado"))).toBe(false);
  });

  it("un módulo completado no se degrada por un fallo previo", () => {
    const eventos = [ev("efos", "fallido", "x"), ev("efos", "completado"), ...todos().slice(0, 3)];
    const p = evaluarProcesamiento({ nuevos: 1, eventos });
    expect(p.completo).toBe(true);
    expect(p.hubo_fallos).toBe(false);
  });

  it("cobertura total sólo con evidencia suficiente", () => {
    const parcial = evaluarProcesamiento({ cobertura: "total", nuevos: 1, eventos: todos().slice(0, 2) });
    expect(parcial.cobertura_honesta).not.toBe("total");
    const completo = evaluarProcesamiento({ cobertura: "total", nuevos: 1, eventos: todos() });
    expect(completo.cobertura_honesta).toBe("total");
  });

  it("sin comprobantes nuevos no se exige procesamiento ni se ofrece recuperación", () => {
    const p = evaluarProcesamiento({ cobertura: "total", nuevos: 0, eventos: [] });
    expect(p.requerido).toBe(false);
    expect(p.accion_label).toBeNull();
    expect(p.mensaje).toMatch(/no incorporó comprobantes nuevos/i);
  });

  it("no se ofrece recuperación si hay otro procesamiento activo", () => {
    const p = evaluarProcesamiento({ nuevos: 1, eventos: [], ocupado: true });
    expect(p.puede_recuperar).toBe(false);
    expect(p.accion_label).toBeNull();
  });

  it("la evaluación es idempotente: repetirla no cambia el resultado", () => {
    const args = { cobertura: "total", nuevos: 1, eventos: todos() };
    expect(evaluarProcesamiento(args)).toEqual(evaluarProcesamiento(args));
  });

  it("la llave de idempotencia es estable por corrida, módulo y versión", () => {
    expect(llaveModulo("run-1", "efos")).toBe(llaveModulo("run-1", "efos"));
    expect(llaveModulo("run-1", "efos")).not.toBe(llaveModulo("run-2", "efos"));
    expect(llaveModulo("run-1", "efos")).not.toBe(llaveModulo("run-1", "riesgo_sat"));
  });
});

describe("Ejecutor · contrato de persistencia", () => {
  const srv = readFileSync(resolve(process.cwd(), "src/lib/sat/procesamiento.server.ts"), "utf8");

  it("cada módulo abre su evento antes de ejecutarse", () => {
    expect(srv).toContain('estado: "iniciado"');
    expect(srv).toContain("idempotency_key");
  });

  it("si la evidencia no puede guardarse, se revierte y falla en vez de declarar éxito", () => {
    expect(srv).toContain("if (errFin)");
    expect(srv).toContain("No se declara ningún procesamiento como completado");
    expect(srv).toContain('.delete().eq("id", eventoId)');
  });

  it("el estado final se relee de la bitácora, nunca de memoria", () => {
    const cola = srv.slice(srv.lastIndexOf("// 3) Releer"));
    expect(cola).toContain("await leerEventos(supabase, runId)");
    expect(cola).toContain("evaluarProcesamiento");
  });

  it("cero eventos después de ejecutar es un error explícito", () => {
    expect(srv).toContain("La lectura de verificación devolvió cero recibos");
  });

  it("no contacta al SAT ni consume cuota o PAC", () => {
    expect(srv).not.toMatch(/satAutenticar|solicitarDescargas|descargarPaquete|pac_reservar|incrementar_uso_sat/);
  });
});

describe("Acción de recuperación · contrato del servidor", () => {
  const fuente = readFileSync(
    resolve(process.cwd(), "src/lib/sat/sat-sync.functions.ts"),
    "utf8",
  );
  const inicio = fuente.indexOf("export const completarProcesamiento");
  const resto = fuente.indexOf("\nexport const ", inicio + 10);
  const fn = fuente.slice(inicio, resto === -1 ? undefined : resto);

  it("existe y sólo ejecuta los módulos faltantes (idempotente)", () => {
    expect(inicio).toBeGreaterThan(0);
    expect(fn).toContain("ejecutarProcesamientoPosterior");
    expect(fn).toContain("despues.terminal");
  });

  it("no contacta al SAT ni vuelve a descargar ni ingerir", () => {
    expect(fn).not.toMatch(/satAutenticar|cosechar|solicitarDescargas|descargarPaquete|ingestOne/);
  });


  it("no consume cuota ni saldo PAC", () => {
    expect(fn).not.toMatch(/incrementar_uso_sat|registrarConsumoSat|pac_reservar|pac_recargar/);
  });

  it("registra antes y después en la bitácora", () => {
    expect(fn).toContain("audit_logs");
    expect(fn).toContain("antes:");
    expect(fn).toContain("despues:");
  });

  it("devuelve el contrato estructurado y no permite éxito con fallos", () => {
    expect(fn).toContain("execution_id: executionId");
    expect(fn).toContain("eventos_persistidos: eventos.length");
    expect(fn).toContain("completados");
    expect(fn).toContain("omitidos");
    expect(fn).toContain("fallidos");
    expect(fn).toContain("pendientes: despues.faltantes");
    expect(fn).toContain("estado_derivado");
    expect(fn).toContain("cobertura_derivada");
  });
});

describe("Detalle · interfaz honesta", () => {
  const ui = readFileSync(resolve(process.cwd(), "src/components/sat/CorridaDetalle.tsx"), "utf8");

  it("el mensaje de paquetes proviene del servidor, no de un texto fijo", () => {
    expect(ui).toContain("d.paquetes_mensaje");
    expect(ui).not.toContain("Sin paquetes entregados");
  });

  it("no existe el texto 'esta corrida no trajo comprobantes nuevos'", () => {
    expect(ui.toLowerCase()).not.toContain("no trajo comprobantes nuevos");
    expect(ui).toContain("d.procesamiento.mensaje");
  });

  it("muestra tipo, complementos, total, moneda, RFC y enlace al comprobante", () => {
    expect(ui).toContain("Tipo de comprobante:");
    expect(ui).toContain("Complementos:");
    expect(ui).toContain("RFC emisor:");
    expect(ui).toContain("RFC receptor:");
    expect(ui).toContain('data-testid="ver-comprobante"');
  });

  it("muestra la tabla de módulos con inicio, fin y resultado", () => {
    expect(ui).toContain("Módulo");
    expect(ui).toContain("Inicio");
    expect(ui).toContain("Fin");
    expect(ui).toContain("Resultado");
    expect(ui).toContain("r.estado_label");
  });

  it("ofrece la acción de recuperación sólo cuando el servidor la habilita", () => {
    expect(ui).toContain("d.procesamiento.accion_label");
    expect(ui).toContain('data-testid="completar-procesamiento"');
  });

  it("mantiene la acción bloqueada hasta validar el despliegue", () => {
    expect(ui).toContain("disabled");
    expect(ui).toContain("permanece bloqueada");
  });

  it("no muestra éxito cuando el contrato responde ok=false", () => {
    expect(ui).toContain("if (!r.ok) throw new Error");
  });
});
