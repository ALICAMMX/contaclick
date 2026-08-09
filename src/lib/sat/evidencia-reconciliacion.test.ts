// =====================================================================
// MANUAL → SAT y SAT → MANUAL sobre un CFDI que YA existe.
//
// Verifica que el retorno anticipado por duplicado ocurre DESPUÉS de
// reconciliar la evidencia, y que la reconciliación es cerrada: sin linaje
// completo y con EstadoComprobante="Vigente" no se llama al RPC.
// =====================================================================
import { describe, expect, it } from "vitest";
import { ingestOneInternal } from "@/lib/cfdi/cfdi.functions";
import { candidatoEvidencia } from "./evidencia-reconciliacion";
import { ORIGEN_DESCARGA_MASIVA } from "./evidencia";
import { facturaXml, RFC_EXPEDIENTE, RFC_TERCERO } from "@/lib/cierre/fixtures";

const DESPACHO = "11111111-1111-4111-8111-111111111111";
const CLIENTE = "22222222-2222-4222-8222-222222222222";
const CFDI_EXISTENTE = "33333333-3333-4333-8333-333333333333";
const RUN = "44444444-4444-4444-8444-444444444444";

const XML = facturaXml({
  uuid: "AAAA1111-2222-4333-8444-555555555555",
  emisor: RFC_EXPEDIENTE,
  receptor: RFC_TERCERO,
  fecha: "2026-03-10T10:00:00",
  subtotal: 1000,
  iva: 160,
});

/** Fake que YA contiene el CFDI (carga manual previa) y registra los RPC. */
function fakeConDuplicado() {
  const rpcs: Array<{ fn: string; args: any }> = [];
  const escrituras: Record<string, any[]> = {};
  const api = (tabla: string) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      is: () => q,
      or: () => q,
      limit: () => q,
      insert: (filas: any) => {
        escrituras[tabla] = [...(escrituras[tabla] ?? []), filas];
        return q;
      },
      update: (filas: any) => {
        escrituras[`${tabla}:update`] = [...(escrituras[`${tabla}:update`] ?? []), filas];
        return q;
      },
      maybeSingle: async () =>
        tabla === "cfdi_xml"
          ? { data: { id: CFDI_EXISTENTE, uuid: "AAAA1111-2222-4333-8444-555555555555" }, error: null }
          : { data: null, error: null },
      single: async () => ({ data: null, error: null }),
      then: (res: any) => res({ data: null, error: null }),
    };
    return q;
  };
  return {
    rpcs,
    escrituras,
    client: {
      from: (t: string) => api(t),
      rpc: async (fn: string, args: any) => {
        rpcs.push({ fn, args });
        return { data: { creada: true, evidencia_id: "ev-1", estatus: "vigente" }, error: null };
      },
    } as any,
  };
}

const linajeSat = {
  origen: ORIGEN_DESCARGA_MASIVA,
  proveedor: "sat_directo",
  run_id: RUN,
  solicitud_id: "SOL-0001",
  paquete_id: "PKG-0001",
  estado_comprobante: "Vigente" as const,
};

describe("CFDI existente que después llega desde el SAT", () => {
  it("manual → SAT: no duplica fila, devuelve duplicado y registra evidencia", async () => {
    const fake = fakeConDuplicado();
    const r = await ingestOneInternal(fake.client, DESPACHO, CLIENTE, "f.xml", XML, linajeSat);

    expect(r.duplicado).toBe(true);
    expect(r.id).toBe(CFDI_EXISTENTE);
    // No se creó otra fila de CFDI ni se renormalizó.
    expect(fake.escrituras["cfdi_xml"]).toBeUndefined();
    // La evidencia la registra el RPC validado contra la base.
    expect(fake.rpcs).toHaveLength(1);
    expect(fake.rpcs[0]!.fn).toBe("cfdi_registrar_evidencia_sat");
    expect(fake.rpcs[0]!.args).toMatchObject({
      _cfdi_id: CFDI_EXISTENTE,
      _run_id: RUN,
      _solicitud_id: "SOL-0001",
      _paquete_id: "PKG-0001",
    });
    // El RPC no recibe estatus ni fuente: no se pueden fabricar desde el código.
    expect(Object.keys(fake.rpcs[0]!.args)).toEqual(["_cfdi_id", "_run_id", "_solicitud_id", "_paquete_id"]);
  });

  it("SAT → manual: la carga manual posterior no intenta evidencia alguna", async () => {
    const fake = fakeConDuplicado();
    const r = await ingestOneInternal(fake.client, DESPACHO, CLIENTE, "f.xml", XML);
    expect(r.duplicado).toBe(true);
    expect(fake.rpcs).toHaveLength(0);
    expect(fake.escrituras["cfdi_xml"]).toBeUndefined();
    expect(fake.escrituras["cfdi_xml:update"]).toBeUndefined();
  });

  it("repetir el mismo paquete no dispara una segunda evidencia distinta", async () => {
    const fake = fakeConDuplicado();
    await ingestOneInternal(fake.client, DESPACHO, CLIENTE, "f.xml", XML, linajeSat);
    await ingestOneInternal(fake.client, DESPACHO, CLIENTE, "f.xml", XML, linajeSat);
    // Misma llave lógica en ambas llamadas: el índice único de la bitácora
    // resuelve la idempotencia en la base.
    expect(fake.rpcs.map((r) => r.args)).toEqual([fake.rpcs[0]!.args, fake.rpcs[0]!.args]);
  });
});

describe("candidatoEvidencia falla cerrado", () => {
  it("exige origen, folio, paquete, corrida y Vigente", () => {
    expect(candidatoEvidencia(CFDI_EXISTENTE, linajeSat)).toMatchObject({ run_id: RUN });
    expect(candidatoEvidencia(CFDI_EXISTENTE, null)).toBeNull();
    expect(candidatoEvidencia(CFDI_EXISTENTE, { ...linajeSat, origen: "carga_manual" })).toBeNull();
    expect(candidatoEvidencia(CFDI_EXISTENTE, { ...linajeSat, estado_comprobante: null })).toBeNull();
    expect(candidatoEvidencia(CFDI_EXISTENTE, { ...linajeSat, estado_comprobante: "Todos" })).toBeNull();
    expect(candidatoEvidencia(CFDI_EXISTENTE, { ...linajeSat, paquete_id: null })).toBeNull();
    expect(candidatoEvidencia(CFDI_EXISTENTE, { ...linajeSat, run_id: null })).toBeNull();
    expect(candidatoEvidencia("", linajeSat)).toBeNull();
  });
});
