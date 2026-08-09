// =====================================================================
// PRUEBA DE CADENA COMPLETA DE EVIDENCIA SAT.
//
// Recorre: constructor de solicitud (EstadoComprobante="Vigente") →
// respuesta y paquete sintéticos del SAT → ciclo de cosecha → ingesta real
// (`ingestOneInternal`) → fila persistida en cfdi_xml.
//
// La prueba NUNCA inserta manualmente estatus_sat="vigente": el valor debe
// aparecer porque la cadena lo derivó de la solicitud y el paquete.
// =====================================================================

import { describe, expect, it } from "vitest";
import { construirSolicitudDescarga } from "./solicitud-xml";
import { cosecharSolicitudCiclo, solicitarCiclo, type ClienteCiclo } from "./ciclo-asincrono";
import { evidenciaEstatusSat, FUENTE_DESCARGA_MASIVA, ORIGEN_DESCARGA_MASIVA } from "./evidencia";
import { ingestOneInternal } from "@/lib/cfdi/cfdi.functions";
import { facturaXml, RFC_EXPEDIENTE, RFC_TERCERO } from "@/lib/cierre/fixtures";

const DESPACHO = "11111111-1111-4111-8111-111111111111";
const CLIENTE = "22222222-2222-4222-8222-222222222222";

/** Cliente Supabase falso: registra los INSERT y responde lecturas vacías. */
function fakeSupabase() {
  const insertados: Record<string, any[]> = {};
  const api = (tabla: string) => {
    const q: any = {
      _insert: null as any,
      select: () => q,
      eq: () => q,
      is: () => q,
      in: () => q,
      or: () => q,
      gte: () => q,
      lt: () => q,
      order: () => q,
      limit: () => q,
      update: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => {
        if (q._insert) return { data: { id: `${tabla}-1` }, error: null };
        return { data: null, error: null };
      },
      insert: (filas: any) => {
        q._insert = filas;
        const arr = Array.isArray(filas) ? filas : [filas];
        insertados[tabla] = [...(insertados[tabla] ?? []), ...arr];
        return q;
      },
      then: (res: any) => res({ data: null, error: null }),
    };
    return q;
  };
  return {
    insertados,
    client: {
      from: (t: string) => api(t),
      rpc: async () => ({ data: { documentos_relacionados: 0, periodo_reabierto: false }, error: null }),
    } as any,
  };
}

const XML = facturaXml({
  uuid: "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE",
  emisor: RFC_TERCERO,
  receptor: RFC_EXPEDIENTE,
  fecha: "2026-03-10T10:00:00",
});

/** SAT sintético: acepta la solicitud y libera un paquete con un XML. */
function clienteSintetico(): ClienteCiclo {
  return {
    async solicitar() {
      return { idSolicitud: "SOL-0001", codigo: "5000", mensaje: "Solicitud Aceptada" };
    },
    async verificar() {
      return { estado: 3, codigo: "5000", mensaje: "Solicitud Aceptada", numeroCfdis: 1, paquetes: ["PKG-0001"] };
    },
    async descargar() {
      return "paquete-sintetico";
    },
  };
}

describe("cadena solicitud vigente → paquete → ingesta → cfdi_xml", () => {
  it("la solicitud enviada al SAT declara EstadoComprobante=Vigente", () => {
    const s = construirSolicitudDescarga({
      rfc: RFC_EXPEDIENTE,
      rfcSolicitante: RFC_EXPEDIENTE,
      desde: "2026-03-01",
      hasta: "2026-03-31",
      direccion: "recibidos",
      tipo: "CFDI",
      estado: "Vigente",
    });
    expect(s.campos["EstadoComprobante"]).toBe("Vigente");
  });

  it("el XML entregado por el paquete queda con estatus vigente y su evidencia", async () => {
    const cliente = clienteSintetico();
    const { solicitudes } = await solicitarCiclo(cliente, {
      desde: "2026-03-01",
      hasta: "2026-03-31",
      direcciones: ["recibidos"],
      estadoComprobante: "Vigente",
    });
    expect(solicitudes[0]!.estado_comprobante).toBe("Vigente");

    const fake = fakeSupabase();
    let filaLinaje: any = null;

    await cosecharSolicitudCiclo({
      cliente,
      solicitud: solicitudes[0]!,
      abrirPaquete: async () => [{ nombre: "cfdi.xml", xml: XML }],
      ingestar: async (archivo, ctx) => {
        // Linaje construido SERVER-SIDE desde la solicitud y el paquete.
        filaLinaje = {
          origen: ORIGEN_DESCARGA_MASIVA,
          proveedor: "sat_directo",
          run_id: null,
          solicitud_id: ctx.idSolicitud,
          paquete_id: ctx.idPaquete,
          estado_comprobante: ctx.estadoComprobante,
        };
        const r = await ingestOneInternal(
          fake.client,
          DESPACHO,
          CLIENTE,
          archivo.nombre,
          archivo.xml,
          filaLinaje,
        );
        return { duplicado: r.duplicado };
      },
    });

    const fila = (fake.insertados["cfdi_xml"] ?? [])[0];
    expect(fila).toBeTruthy();
    expect(fila.estatus_sat).toBe("vigente");
    expect(fila.estatus_sat_fuente).toBe(FUENTE_DESCARGA_MASIVA);
    expect(typeof fila.estatus_sat_evidencia_at).toBe("string");
    expect(fila.sat_solicitud_id).toBe("SOL-0001");
    expect(fila.sat_paquete_id).toBe("PKG-0001");
    expect(fila.origen).toBe(ORIGEN_DESCARGA_MASIVA);
  });

  it("una carga manual jamás produce evidencia: queda desconocido", async () => {
    const fake = fakeSupabase();
    await ingestOneInternal(fake.client, DESPACHO, CLIENTE, "manual.xml", XML);
    const fila = (fake.insertados["cfdi_xml"] ?? [])[0];
    expect(fila.estatus_sat).toBe("desconocido");
    expect(fila.estatus_sat_fuente).toBeNull();
    expect(fila.estatus_sat_evidencia_at).toBeNull();
    expect(fila.origen).toBe("carga_manual");
  });
});

describe("la evidencia no puede fabricarse", () => {
  it("sin paquete, sin solicitud o con otro estado no hay evidencia", () => {
    expect(
      evidenciaEstatusSat({ origen: ORIGEN_DESCARGA_MASIVA, solicitud_id: "S", estado_comprobante: "Vigente" })
        .estatus_sat,
    ).toBe("desconocido");
    expect(
      evidenciaEstatusSat({
        origen: ORIGEN_DESCARGA_MASIVA,
        solicitud_id: "S",
        paquete_id: "P",
        estado_comprobante: "Todos",
      }).estatus_sat,
    ).toBe("desconocido");
    expect(
      evidenciaEstatusSat({ origen: "carga_manual", solicitud_id: "S", paquete_id: "P", estado_comprobante: "Vigente" })
        .estatus_sat,
    ).toBe("desconocido");
  });
});
