// Ciclo asíncrono completo de la Descarga Masiva SAT con datos sintéticos.
// Cubre exactamente el código que ejecuta producción: el orquestador real
// delega en estas funciones y sólo cambia el cliente que habla con el SAT.

import { describe, expect, it } from "vitest";
import { cosecharCiclo, solicitarCiclo } from "./ciclo-asincrono";
import {
  abrirPaqueteSimulado,
  cfdiSintetico,
  crearClienteSimulado,
} from "./providers/simulado";
import type { SolicitudRegistro } from "./maquina-estados";

const RANGO = { desde: "2026-01-01", hasta: "2026-01-31" };

/** Ingestor sintético con deduplicación por UUID, como el real. */
function crearIngestor() {
  const vistos = new Set<string>();
  const ingestados: string[] = [];
  return {
    vistos,
    ingestados,
    ingestar: async ({ nombre, xml }: { nombre: string; xml: string }) => {
      if (xml.includes("ROTO")) throw new Error("XML ilegible");
      const uuid = /UUID="([^"]+)"/.exec(xml)?.[1] ?? nombre;
      if (vistos.has(uuid)) return { duplicado: true };
      vistos.add(uuid);
      ingestados.push(uuid);
      return { duplicado: false };
    },
  };
}

async function correrHasta(
  cliente: ReturnType<typeof crearClienteSimulado>,
  ingestor: ReturnType<typeof crearIngestor>,
  solicitudes: SolicitudRegistro[],
  vueltas: number,
) {
  let sols = solicitudes;
  let resumen = (await cosecharCiclo({
    cliente,
    solicitudes: sols,
    abrirPaquete: abrirPaqueteSimulado,
    ingestar: ingestor.ingestar,
    // El backoff no debe frenar la prueba: el reloj avanza una hora por vuelta.
    ahora: () => Date.now() + 3_600_000,
  })).resumen;
  for (let i = 0; i < vueltas; i++) {
    const r = await cosecharCiclo({
      cliente,
      solicitudes: sols,
      abrirPaquete: abrirPaqueteSimulado,
      ingestar: ingestor.ingestar,
      ahora: () => Date.now() + (i + 2) * 3_600_000,
    });
    sols = r.solicitudes;
    resumen = r.resumen;
  }
  return { solicitudes: sols, resumen };
}

describe("ciclo asíncrono SAT (datos sintéticos)", () => {
  it("una solicitud aceptada NO se da por descargada", async () => {
    const cliente = crearClienteSimulado({ recibidos: { esperas: 2 } });
    const { solicitudes } = await solicitarCiclo(cliente, {
      ...RANGO,
      direcciones: ["recibidos"],
    });
    expect(solicitudes[0]!.estado).toBe("pendiente");
    expect(solicitudes[0]!.xml_nuevos).toBe(0);
  });

  it("completa el ciclo solicitar → esperar → descargar → ingerir", async () => {
    const cliente = crearClienteSimulado({
      emitidos: {
        esperas: 2,
        paquetes: [
          { id: "pkg-e-1", xml: [cfdiSintetico("uuid-e-1"), cfdiSintetico("uuid-e-2")] },
        ],
      },
      recibidos: {
        esperas: 1,
        paquetes: [{ id: "pkg-r-1", xml: [cfdiSintetico("uuid-r-1")] }],
      },
    });
    const ingestor = crearIngestor();
    const inicial = await solicitarCiclo(cliente, {
      ...RANGO,
      direcciones: ["emitidos", "recibidos"],
    });

    // Vuelta 1: el SAT sigue procesando emitidos.
    let estado = await cosecharCiclo({
      cliente,
      solicitudes: inicial.solicitudes,
      abrirPaquete: abrirPaqueteSimulado,
      ingestar: ingestor.ingestar,
    });
    expect(estado.resumen.estado).toBe("esperando_sat");

    // Vueltas siguientes: se liberan los paquetes.
    let reloj = Date.now();
    for (let i = 0; i < 3; i++) {
      reloj += 3_600_000;
      estado = await cosecharCiclo({
        cliente,
        solicitudes: estado.solicitudes,
        abrirPaquete: abrirPaqueteSimulado,
        ingestar: ingestor.ingestar,
        ahora: () => reloj,
      });
    }

    expect(estado.resumen.estado).toBe("completada");
    expect(estado.resumen.cobertura).toBe("total");
    expect(estado.resumen.xml_nuevos).toBe(3);
    expect(estado.resumen.paquetes_procesados).toBe(2);
    expect(ingestor.ingestados).toHaveLength(3);
  });

  it("volver a cosechar una corrida terminada no duplica nada", async () => {
    const cliente = crearClienteSimulado({ recibidos: { esperas: 0 } });
    const ingestor = crearIngestor();
    const inicial = await solicitarCiclo(cliente, { ...RANGO, direcciones: ["recibidos"] });
    const primera = await cosecharCiclo({
      cliente,
      solicitudes: inicial.solicitudes,
      abrirPaquete: abrirPaqueteSimulado,
      ingestar: ingestor.ingestar,
    });
    expect(primera.resumen.estado).toBe("completada");
    const descargasPrimera = cliente.llamadas.descargar.length;

    const segunda = await cosecharCiclo({
      cliente,
      solicitudes: primera.solicitudes,
      abrirPaquete: abrirPaqueteSimulado,
      ingestar: ingestor.ingestar,
    });
    expect(segunda.resumen.xml_nuevos).toBe(primera.resumen.xml_nuevos);
    expect(cliente.llamadas.descargar.length).toBe(descargasPrimera);
    expect(ingestor.ingestados).toHaveLength(1);
  });

  it("reporta cobertura parcial cuando una dirección falla", async () => {
    const cliente = crearClienteSimulado({
      emitidos: { esperas: 0, desenlace: "error" },
      recibidos: { esperas: 0 },
    });
    const ingestor = crearIngestor();
    const inicial = await solicitarCiclo(cliente, {
      ...RANGO,
      direcciones: ["emitidos", "recibidos"],
    });
    const r = await cosecharCiclo({
      cliente,
      solicitudes: inicial.solicitudes,
      abrirPaquete: abrirPaqueteSimulado,
      ingestar: ingestor.ingestar,
    });
    expect(r.resumen.estado).toBe("parcial");
    expect(r.resumen.cobertura).toBe("parcial");
    expect(r.resumen.advertencia).toMatch(/emitidos/);
  });

  it("un periodo sin comprobantes queda completado con cero, no en error", async () => {
    const cliente = crearClienteSimulado({ recibidos: { esperas: 0, desenlace: "vacio" } });
    const ingestor = crearIngestor();
    const inicial = await solicitarCiclo(cliente, { ...RANGO, direcciones: ["recibidos"] });
    const r = await cosecharCiclo({
      cliente,
      solicitudes: inicial.solicitudes,
      abrirPaquete: abrirPaqueteSimulado,
      ingestar: ingestor.ingestar,
    });
    expect(r.resumen.estado).toBe("completada");
    expect(r.resumen.xml_nuevos).toBe(0);
  });

  it("una solicitud vencida se marca como tal y pide volver a solicitar", async () => {
    const cliente = crearClienteSimulado({ recibidos: { esperas: 0, desenlace: "vencida" } });
    const ingestor = crearIngestor();
    const inicial = await solicitarCiclo(cliente, { ...RANGO, direcciones: ["recibidos"] });
    const r = await cosecharCiclo({
      cliente,
      solicitudes: inicial.solicitudes,
      abrirPaquete: abrirPaqueteSimulado,
      ingestar: ingestor.ingestar,
    });
    expect(r.resumen.estado).toBe("vencida");
    expect(r.resumen.advertencia).toMatch(/vencidas/i);
  });

  it("los XML repetidos entre paquetes se cuentan como duplicados, no como nuevos", async () => {
    const cliente = crearClienteSimulado({
      recibidos: {
        esperas: 0,
        paquetes: [
          { id: "p1", xml: [cfdiSintetico("uuid-dup")] },
          { id: "p2", xml: [cfdiSintetico("uuid-dup"), cfdiSintetico("uuid-otro")] },
        ],
      },
    });
    const ingestor = crearIngestor();
    const inicial = await solicitarCiclo(cliente, { ...RANGO, direcciones: ["recibidos"] });
    const r = await cosecharCiclo({
      cliente,
      solicitudes: inicial.solicitudes,
      abrirPaquete: abrirPaqueteSimulado,
      ingestar: ingestor.ingestar,
    });
    expect(r.resumen.xml_encontrados).toBe(3);
    expect(r.resumen.xml_nuevos).toBe(2);
    expect(r.resumen.duplicados).toBe(1);
  });

  it("un XML ilegible se contabiliza como rechazado y no rompe la corrida", async () => {
    const cliente = crearClienteSimulado({
      recibidos: {
        esperas: 0,
        paquetes: [{ id: "p1", xml: ["<ROTO/>", cfdiSintetico("uuid-ok")] }],
      },
    });
    const ingestor = crearIngestor();
    const inicial = await solicitarCiclo(cliente, { ...RANGO, direcciones: ["recibidos"] });
    const r = await cosecharCiclo({
      cliente,
      solicitudes: inicial.solicitudes,
      abrirPaquete: abrirPaqueteSimulado,
      ingestar: ingestor.ingestar,
    });
    expect(r.resumen.rechazados).toBe(1);
    expect(r.resumen.xml_nuevos).toBe(1);
    expect(r.resumen.estado).toBe("completada");
  });

  it("agota los reintentos si el SAT nunca libera la solicitud", async () => {
    const cliente = crearClienteSimulado({ recibidos: { esperas: 999 } });
    const ingestor = crearIngestor();
    const inicial = await solicitarCiclo(cliente, { ...RANGO, direcciones: ["recibidos"] });
    const r = await correrHasta(cliente, ingestor, inicial.solicitudes, 12);
    expect(["error", "esperando_sat"]).toContain(r.resumen.estado);
  });
});
