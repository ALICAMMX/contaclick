// =====================================================================
// CFDI NUEVO: el RPC es el ÚNICO escritor de evidencia.
//
// La fila nace SIEMPRE con estatus_sat="desconocido". Si el linaje era
// candidato y el RPC rechaza o falla, el documento NO queda en silencio:
// se marca con el motivo operativo EVIDENCIA_SAT_PENDIENTE.
// =====================================================================
import { describe, expect, it } from "vitest";
import { ingestOneInternal } from "@/lib/cfdi/cfdi.functions";
import {
  CODIGO_EVIDENCIA_PENDIENTE,
  evidenciaPendiente,
  reconciliarEvidenciaSat,
} from "./evidencia-reconciliacion";
import { ORIGEN_DESCARGA_MASIVA } from "./evidencia";
import { facturaXml, RFC_EXPEDIENTE, RFC_TERCERO } from "@/lib/cierre/fixtures";

const DESPACHO = "11111111-1111-4111-8111-111111111111";
const CLIENTE = "22222222-2222-4222-8222-222222222222";
const RUN = "44444444-4444-4444-8444-444444444444";

const XML = facturaXml({
  uuid: "BBBBBBBB-CCCC-4DDD-8EEE-FFFFFFFFFFFF",
  emisor: RFC_TERCERO,
  receptor: RFC_EXPEDIENTE,
  fecha: "2026-03-11T10:00:00",
});

const linajeSat = {
  origen: ORIGEN_DESCARGA_MASIVA,
  proveedor: "sat_directo",
  run_id: RUN,
  solicitud_id: "SOL-0001",
  paquete_id: "PKG-0001",
  estado_comprobante: "Vigente" as const,
};

/** Fake sin duplicados: registra INSERT, UPDATE y llamadas RPC. */
function fake(respuestaEvidencia: { data?: any; error?: any }) {
  const insertados: Record<string, any[]> = {};
  const updates: Record<string, any[]> = {};
  const rpcs: Array<{ fn: string; args: any }> = [];
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
      update: (filas: any) => {
        updates[tabla] = [...(updates[tabla] ?? []), filas];
        return q;
      },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => (q._insert ? { data: { id: `${tabla}-1` }, error: null } : { data: null, error: null }),
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
    updates,
    rpcs,
    client: {
      from: (t: string) => api(t),
      rpc: async (fn: string, args: any) => {
        rpcs.push({ fn, args });
        if (fn === "cfdi_registrar_evidencia_sat") {
          return { data: respuestaEvidencia.data ?? null, error: respuestaEvidencia.error ?? null };
        }
        return { data: { documentos_relacionados: 0, periodo_reabierto: false }, error: null };
      },
    } as any,
  };
}

const motivoPendiente = (updates: Record<string, any[]>) =>
  (updates["cfdi_xml"] ?? [])
    .flatMap((u) => (Array.isArray(u.motivos) ? u.motivos : []))
    .find((m: any) => m?.codigo === CODIGO_EVIDENCIA_PENDIENTE);

describe("CFDI nuevo: sin RPC no hay vigente", () => {
  it("linaje válido: la fila nace desconocida y el RPC la promueve", async () => {
    const f = fake({ data: { creada: true, duplicada: false, rechazada: false, estatus: "vigente" } });
    await ingestOneInternal(f.client, DESPACHO, CLIENTE, "n.xml", XML, linajeSat);
    const fila = (f.insertados["cfdi_xml"] ?? [])[0];
    expect(fila.estatus_sat).toBe("desconocido");
    expect(fila.estatus_sat_fuente).toBeNull();
    expect(fila.estatus_sat_evidencia_at).toBeNull();
    expect(f.rpcs.some((r) => r.fn === "cfdi_registrar_evidencia_sat")).toBe(true);
    // Sin fallo no hay motivo pendiente.
    expect(motivoPendiente(f.updates)).toBeUndefined();
  });

  it("linaje inválido (RPC rechaza): queda desconocido y con EVIDENCIA_SAT_PENDIENTE", async () => {
    const f = fake({ data: { creada: false, duplicada: false, rechazada: true, motivo: "PAQUETE_NO_PROCESADO" } });
    await ingestOneInternal(f.client, DESPACHO, CLIENTE, "n.xml", XML, linajeSat);
    expect((f.insertados["cfdi_xml"] ?? [])[0].estatus_sat).toBe("desconocido");
    const m = motivoPendiente(f.updates);
    expect(m).toBeTruthy();
    expect(m.motivo_rpc).toBe("PAQUETE_NO_PROCESADO");
    expect(m.run_id).toBe(RUN);
    expect(m.solicitud_id).toBe("SOL-0001");
    expect(m.paquete_id).toBe("PKG-0001");
  });

  it("falla la escritura de la bitácora: se registra pendiente, no se pierde el XML", async () => {
    const f = fake({ error: { message: "permission denied for table cfdi_sat_evidencias" } });
    const r = await ingestOneInternal(f.client, DESPACHO, CLIENTE, "n.xml", XML, linajeSat);
    expect(r.duplicado).toBe(false);
    expect((f.insertados["cfdi_xml"] ?? [])[0].estatus_sat).toBe("desconocido");
    const m = motivoPendiente(f.updates);
    expect(m.motivo_rpc).toContain("permission denied");
  });

  it("carga manual: sin candidato no hay RPC ni motivo pendiente", async () => {
    const f = fake({ data: null });
    await ingestOneInternal(f.client, DESPACHO, CLIENTE, "manual.xml", XML);
    expect(f.rpcs.some((r) => r.fn === "cfdi_registrar_evidencia_sat")).toBe(false);
    expect(motivoPendiente(f.updates)).toBeUndefined();
  });
});

describe("resultado explícito de la reconciliación", () => {
  const cli = (resp: any) => ({ rpc: async () => resp }) as any;

  it("distingue creada, existente, rechazada, error y sin candidato", async () => {
    expect((await reconciliarEvidenciaSat(cli({ data: { creada: true } }), "c1", linajeSat)).resultado).toBe("creada");
    expect((await reconciliarEvidenciaSat(cli({ data: { duplicada: true } }), "c1", linajeSat)).resultado).toBe(
      "existente",
    );
    expect(
      (await reconciliarEvidenciaSat(cli({ data: { rechazada: true, motivo: "X" } }), "c1", linajeSat)).resultado,
    ).toBe("rechazada");
    expect((await reconciliarEvidenciaSat(cli({ error: { message: "boom" } }), "c1", linajeSat)).resultado).toBe(
      "error",
    );
    expect((await reconciliarEvidenciaSat(cli({ data: {} }), "c1", null)).resultado).toBe("sin_candidato");
  });

  it("sólo rechazada y error exigen seguimiento", async () => {
    const r = (x: any) => evidenciaPendiente(x);
    expect(r({ resultado: "creada" })).toBe(false);
    expect(r({ resultado: "existente" })).toBe(false);
    expect(r({ resultado: "sin_candidato" })).toBe(false);
    expect(r({ resultado: "rechazada" })).toBe(true);
    expect(r({ resultado: "error" })).toBe(true);
  });
});
