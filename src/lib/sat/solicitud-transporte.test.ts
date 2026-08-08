// Ejecución del paso "SolicitaDescarga" con TRANSPORTE SIMULADO.
// No se usa e.firma real: la llave y el certificado se generan en memoria.
// No hay salida a la red: `fetch` está intervenido y se afirma que el
// rechazo local nunca llega a hacer una petición.

import forge from "node-forge";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { satSolicitar, SatRechazoTerminalError } from "./providers/sat-directo.server";
import { semanticaCodigo } from "./maquina-estados";
import { solicitarCiclo } from "./ciclo-asincrono";

const RFC = "AAA010101AAA";
let credenciales: any;

/** Respuestas SOAP sintéticas del SAT (no provienen del servicio real). */
function respuestaSat(codigo: string, mensaje: string, idSolicitud = "") {
  return (
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>` +
    `<SolicitaDescargaResponse><SolicitaDescargaResult ` +
    `IdSolicitud="${idSolicitud}" CodEstatus="${codigo}" Mensaje="${mensaje}"/>` +
    `</SolicitaDescargaResponse></s:Body></s:Envelope>`
  );
}

function interceptar(cuerpo: string) {
  const llamadas: string[] = [];
  vi.stubGlobal("fetch", async (url: any, init: any) => {
    llamadas.push(String(init?.body ?? ""));
    return new Response(cuerpo, { status: 200, headers: { "content-type": "text/xml" } });
  });
  return llamadas;
}

beforeAll(() => {
  const { privateKey, publicKey } = forge.pki.rsa.generateKeyPair({ bits: 1024 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  const attrs = [{ name: "commonName", value: RFC }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(privateKey);
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  credenciales = {
    rfc: RFC,
    certB64: forge.util.encode64(der),
    serial: "01",
    issuerName: `CN=${RFC}`,
    privateKey,
  };
});

afterEach(() => vi.unstubAllGlobals());

describe("transporte simulado", () => {
  it("XML recibidos vigentes → 5000 con folio (la corrida queda esperando_sat)", async () => {
    const enviados = interceptar(respuestaSat("5000", "Solicitud Aceptada", "FOLIO-SINTETICO-1"));

    const r = await satSolicitar(credenciales, "token-sintetico", {
      rfc: RFC,
      desde: "2026-08-01",
      hasta: "2026-08-03",
      tipo: "recibidos",
      tipoSolicitud: "CFDI",
      estado: "Vigente",
    });

    expect(r.idSolicitud).toBe("FOLIO-SINTETICO-1");
    expect(r.codigo).toBe("5000");
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toContain('EstadoComprobante="Vigente"');
    expect(enviados[0]).toContain('TipoSolicitud="CFDI"');
    expect(enviados[0]).toContain('RfcReceptor="AAA010101AAA"');
    expect(enviados[0]).not.toMatch(/Cancelado|Metadata|EstadoComprobante="Todos"/);
    expect(r.saneado).not.toMatch(/SignatureValue|X509Certificate|token/i);

    // La semántica del código no es terminal: la solicitud queda pendiente.
    const sem = semanticaCodigo(r.codigo);
    expect(sem.terminal).toBeFalsy();

    const ciclo = await solicitarCiclo(
      {
        solicitar: async () => ({ idSolicitud: r.idSolicitud, codigo: "5000", mensaje: "ok" }),
        verificar: async () => ({ estado: 1, codigo: "5000", mensaje: "", paquetes: [], numeroCfdis: 0 }),
        descargar: async () => "",
      } as any,
      { desde: "2026-08-01", hasta: "2026-08-03", direcciones: ["recibidos"] },
    );
    expect(ciclo.solicitudes[0]!.estado).toBe("pendiente");
    expect(ciclo.solicitudes[0]!.id_solicitud).toBe("FOLIO-SINTETICO-1");
  });

  it("XML recibidos cancelados → rechazo local, sin firma ni red", async () => {
    const enviados = interceptar(respuestaSat("5000", "no debería usarse", "X"));

    await expect(
      satSolicitar(credenciales, "token-sintetico", {
        rfc: RFC,
        desde: "2026-08-01",
        hasta: "2026-08-03",
        tipo: "recibidos",
        tipoSolicitud: "CFDI",
        estado: "Cancelado",
      }),
    ).rejects.toThrow(/cancelados/i);

    expect(enviados).toHaveLength(0);
  });

  it("Código 301 → error terminal, sin reintento", async () => {
    interceptar(
      respuestaSat(
        "301",
        "XML Mal Formado:La solicitud de descarga no es válida. No se permite la descarga de xml que se encuentren cancelados.",
      ),
    );

    const err = await satSolicitar(credenciales, "token-sintetico", {
      rfc: RFC,
      desde: "2026-08-01",
      hasta: "2026-08-03",
      tipo: "recibidos",
      tipoSolicitud: "CFDI",
      estado: "Vigente",
    }).catch((e) => e);

    expect(err).toBeInstanceOf(SatRechazoTerminalError);
    expect(err.codigo).toBe("301");
    const sem = semanticaCodigo("301");
    expect(sem.terminal).toBe(true);
    expect(sem.reintentable).toBe(false);

    const ciclo = await solicitarCiclo(
      {
        solicitar: async () => {
          throw err;
        },
        verificar: async () => ({ estado: 0, codigo: "", mensaje: "", paquetes: [], numeroCfdis: 0 }),
        descargar: async () => "",
      } as any,
      { desde: "2026-08-01", hasta: "2026-08-03", direcciones: ["recibidos"] },
    );
    const s = ciclo.solicitudes[0]!;
    expect(s.estado).toBe("error");
    expect(s.id_solicitud).toBe("");
    expect(s.intentos).toBe(0);
    expect(s.siguiente_intento_at).toBeNull();
  });
});
