/**
 * Cliente directo del Servicio de Descarga Masiva del SAT (sin PAC).
 *
 * Usa la e.firma (.cer + .key + contraseña) del contribuyente para firmar los
 * sobres SOAP con XML-DSig (RSA-SHA1 + exc-c14n), tal como lo hace cualquier PAC.
 * Costo por solicitud: $0.00 — el SAT no cobra por este servicio.
 *
 * Flujo oficial (asíncrono):
 *   1. Autentica            -> token WRAP (vigencia 5 min)
 *   2. SolicitaDescarga     -> IdSolicitud
 *   3. VerificaSolicitud    -> EstadoSolicitud + IdsPaquetes (puede tardar minutos/horas)
 *   4. Descargar            -> ZIP en base64 con los XML
 */
import forge from "node-forge";
import { abrirLlaveSat } from "../efirma-key.server";

const NS_DES = "http://DescargaMasivaTerceros.sat.gob.mx";
const NS_DSIG = "http://www.w3.org/2000/09/xmldsig#";
const NS_WSU =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
const NS_WSSE =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";

export const SAT_ENDPOINTS = {
  autentica:
    "https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/Autenticacion/Autenticacion.svc",
  solicita:
    "https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/SolicitaDescargaService.svc",
  verifica:
    "https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/VerificaSolicitudDescargaService.svc",
  descarga: "https://cfdidescargamasiva.clouda.sat.gob.mx/DescargaMasivaService.svc",
};

export type EFirma = {
  cer_b64: string;
  key_b64: string;
  password: string;
};

type Credenciales = {
  rfc: string;
  certB64: string;
  serial: string;
  issuerName: string;
  privateKey: forge.pki.rsa.PrivateKey;
};

function clean(b64: string) {
  return b64.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
}

function esc(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Abre la e.firma: descifra el .key (PKCS#8 cifrado, DER) y lee el .cer. */
export function abrirEFirma(ef: EFirma): Credenciales {
  const certDer = forge.util.decode64(clean(ef.cer_b64));
  const cert = forge.pki.certificateFromAsn1(
    forge.asn1.fromDer(forge.util.createBuffer(certDer)),
  );

  const privateKey = abrirLlaveSat(ef.key_b64, ef.password);
  if (!privateKey) {
    throw new Error(
      "No se pudo abrir la llave privada (.key). Verifica la contraseña de la e.firma y que el archivo sea el correcto.",
    );
  }

  // Verificar que la llave corresponde al certificado
  const pubFromCert = cert.publicKey as forge.pki.rsa.PublicKey;
  if (pubFromCert.n.toString(16) !== privateKey.n.toString(16)) {
    throw new Error("El archivo .key no corresponde al certificado .cer de la e.firma.");
  }

  const rfcAttr =
    cert.subject.getField({ type: "2.5.4.45" })?.value ??
    cert.subject.getField("UID")?.value ??
    "";
  const rfc = String(rfcAttr).split("/")[0]?.trim().toUpperCase() ?? "";

  const serialHex = cert.serialNumber;
  const serial = Buffer.from(serialHex, "hex").toString("ascii").replace(/\0/g, "");

  const issuerName = cert.issuer.attributes
    .slice()
    .reverse()
    .map((a) => `${a.shortName ?? a.type}=${a.value}`)
    .join(",");

  return {
    rfc,
    certB64: clean(ef.cer_b64),
    serial: /^\d+$/.test(serial) ? serial : forge.util.bytesToHex(serialHex),
    issuerName,
    privateKey,
  };
}

function sha1B64(text: string) {
  const md = forge.md.sha1.create();
  md.update(text, "utf8");
  return forge.util.encode64(md.digest().bytes());
}

function signB64(key: forge.pki.rsa.PrivateKey, text: string) {
  const md = forge.md.sha1.create();
  md.update(text, "utf8");
  return forge.util.encode64(key.sign(md));
}

function keyInfo(c: Credenciales) {
  return (
    `<KeyInfo>` +
    `<X509Data>` +
    `<X509IssuerSerial>` +
    `<X509IssuerName>${esc(c.issuerName)}</X509IssuerName>` +
    `<X509SerialNumber>${esc(c.serial)}</X509SerialNumber>` +
    `</X509IssuerSerial>` +
    `<X509Certificate>${c.certB64}</X509Certificate>` +
    `</X509Data>` +
    `</KeyInfo>`
  );
}

function signedInfo(digest: string, uri: string, enveloped: boolean) {
  const transforms = enveloped
    ? `<Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform></Transforms>`
    : `<Transforms><Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></Transform></Transforms>`;
  return (
    `<SignedInfo xmlns="${NS_DSIG}">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${NS_DSIG}rsa-sha1"></SignatureMethod>` +
    `<Reference URI="${uri}">` +
    transforms +
    `<DigestMethod Algorithm="${NS_DSIG}sha1"></DigestMethod>` +
    `<DigestValue>${digest}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`
  );
}

/** Tiempo máximo por llamada al SAT (el servicio suele responder < 30 s). */
export const SAT_TIMEOUT_MS = 45_000;

export class SatHttpError extends Error {
  status: number;
  reintentable: boolean;
  constructor(status: number, mensaje: string, reintentable: boolean) {
    super(mensaje);
    this.status = status;
    this.reintentable = reintentable;
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Llamada SOAP con timeout y reintentos acotados.
 * `reintentos` debe ser 0 en operaciones NO idempotentes (SolicitaDescarga):
 * reintentarlas crearía solicitudes duplicadas en el SAT.
 */
async function soap(
  url: string,
  action: string,
  body: string,
  token?: string,
  reintentos = 0,
) {
  let ultimo: unknown;
  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml;charset=UTF-8",
          SOAPAction: action,
          ...(token ? { Authorization: `WRAP access_token="${token}"` } : {}),
        },
        body,
        signal: AbortSignal.timeout(SAT_TIMEOUT_MS),
      });
      const text = await res.text();
      if (!res.ok) {
        const fault = /<(?:s:)?(?:faultstring|Text)[^>]*>([^<]*)</i.exec(text)?.[1];
        throw new SatHttpError(
          res.status,
          `SAT ${res.status}: ${(fault ?? text).slice(0, 300)}`,
          res.status >= 500 || res.status === 429,
        );
      }
      return text;
    } catch (e) {
      ultimo = e;
      const reintentable =
        e instanceof SatHttpError
          ? e.reintentable
          : // Timeout o falla de red: sí se puede reintentar.
            true;
      if (!reintentable || intento === reintentos) break;
      await dormir(Math.min(8000, 1000 * 2 ** intento));
    }
  }
  if (ultimo instanceof Error) throw ultimo;
  throw new Error("El servicio del SAT no respondió.");
}

/** Paso 1 — Autenticación. Devuelve el token WRAP (vigente ~5 minutos). */
export async function satAutenticar(c: Credenciales): Promise<string> {
  const created = new Date();
  const expires = new Date(created.getTime() + 5 * 60_000);
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, ".000Z");
  const bstId = `uuid-${crypto.randomUUID()}-1`;

  const timestamp =
    `<u:Timestamp xmlns:u="${NS_WSU}" u:Id="_0">` +
    `<u:Created>${iso(created)}</u:Created>` +
    `<u:Expires>${iso(expires)}</u:Expires>` +
    `</u:Timestamp>`;

  const si = signedInfo(sha1B64(timestamp), "#_0", false);
  // El servicio de Autenticación exige KeyInfo con SecurityTokenReference
  // apuntando al BinarySecurityToken (no X509Data).
  const keyInfoStr =
    `<KeyInfo>` +
    `<o:SecurityTokenReference xmlns:o="${NS_WSSE}">` +
    `<o:Reference ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" URI="#${bstId}"></o:Reference>` +
    `</o:SecurityTokenReference>` +
    `</KeyInfo>`;
  const signature =
    `<Signature xmlns="${NS_DSIG}">` +
    si.replace(` xmlns="${NS_DSIG}"`, "") +
    `<SignatureValue>${signB64(c.privateKey, si)}</SignatureValue>` +
    keyInfoStr +
    `</Signature>`;

  const envelope =
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:u="${NS_WSU}">` +
    `<s:Header>` +
    `<o:Security xmlns:o="${NS_WSSE}" s:mustUnderstand="1">` +
    timestamp +
    `<o:BinarySecurityToken u:Id="${bstId}" ` +
    `ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" ` +
    `EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">` +
    `${c.certB64}</o:BinarySecurityToken>` +
    signature +
    `</o:Security>` +
    `</s:Header>` +
    // Ojo: el cuerpo de Autentica usa el namespace "gob.mx" (sin "sat").
    `<s:Body><Autentica xmlns="http://DescargaMasivaTerceros.gob.mx"></Autentica></s:Body>` +
    `</s:Envelope>`;

  const xml = await soap(
    SAT_ENDPOINTS.autentica,
    "http://DescargaMasivaTerceros.gob.mx/IAutenticacion/Autentica",
    envelope,
    undefined,
    2,
  );
  const token = /<AutenticaResult>([^<]+)<\/AutenticaResult>/.exec(xml)?.[1];
  if (!token) throw new Error("El SAT no devolvió token de autenticación");
  return token.trim();
}


export type TipoDescarga = "emitidos" | "recibidos";

/** Paso 2 — Solicitud de descarga. Devuelve el IdSolicitud. */
export async function satSolicitar(
  c: Credenciales,
  token: string,
  args: {
    rfc: string;
    desde: string; // YYYY-MM-DD
    hasta: string;
    tipo: TipoDescarga;
    tipoSolicitud?: "CFDI" | "Metadata";
  },
) {
  const op = args.tipo === "emitidos" ? "SolicitaDescargaEmitidos" : "SolicitaDescargaRecibidos";
  const rfcAttr = args.tipo === "emitidos" ? "RfcEmisor" : "RfcReceptor";
  const fi = `${args.desde}T00:00:00`;
  const ff = `${args.hasta}T23:59:59`;
  const tipoSol = args.tipoSolicitud ?? "CFDI";

  // Atributos en orden alfabético (requisito de la canonicalización)
  const attrs =
    `FechaFinal="${ff}" FechaInicial="${fi}" ` +
    `${rfcAttr}="${args.rfc}" RfcSolicitante="${c.rfc}" TipoSolicitud="${tipoSol}"`;

  const canonical = `<des:solicitud xmlns:des="${NS_DES}" xmlns:xd="${NS_DSIG}" ${attrs}></des:solicitud>`;
  const si = signedInfo(sha1B64(canonical), "", true);
  const signature =
    `<Signature xmlns="${NS_DSIG}">` +
    si.replace(` xmlns="${NS_DSIG}"`, "") +
    `<SignatureValue>${signB64(c.privateKey, si)}</SignatureValue>` +
    keyInfo(c) +
    `</Signature>`;

  const envelope =
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:des="${NS_DES}" xmlns:xd="${NS_DSIG}">` +
    `<s:Header/><s:Body><des:${op}>` +
    `<des:solicitud ${attrs}>${signature}</des:solicitud>` +
    `</des:${op}></s:Body></s:Envelope>`;

  const xml = await soap(
    SAT_ENDPOINTS.solicita,
    `http://DescargaMasivaTerceros.sat.gob.mx/ISolicitaDescargaService/${op}`,
    envelope,
    token,
  );
  const codigo = /CodEstatus="([^"]*)"/.exec(xml)?.[1] ?? "";
  const mensaje = /Mensaje="([^"]*)"/.exec(xml)?.[1] ?? "";
  const idSolicitud = /IdSolicitud="([^"]*)"/.exec(xml)?.[1] ?? "";
  if (!idSolicitud) throw new Error(`SAT rechazó la solicitud: ${codigo} ${mensaje}`.trim());
  return { idSolicitud, codigo, mensaje };
}

/** Paso 3 — Verificación del estado de la solicitud. */
export async function satVerificar(c: Credenciales, token: string, idSolicitud: string) {
  const attrs = `IdSolicitud="${idSolicitud}" RfcSolicitante="${c.rfc}"`;
  const canonical = `<des:solicitud xmlns:des="${NS_DES}" xmlns:xd="${NS_DSIG}" ${attrs}></des:solicitud>`;
  const si = signedInfo(sha1B64(canonical), "", true);
  const signature =
    `<Signature xmlns="${NS_DSIG}">` +
    si.replace(` xmlns="${NS_DSIG}"`, "") +
    `<SignatureValue>${signB64(c.privateKey, si)}</SignatureValue>` +
    keyInfo(c) +
    `</Signature>`;

  const envelope =
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:des="${NS_DES}" xmlns:xd="${NS_DSIG}">` +
    `<s:Header/><s:Body><des:VerificaSolicitudDescarga>` +
    `<des:solicitud ${attrs}>${signature}</des:solicitud>` +
    `</des:VerificaSolicitudDescarga></s:Body></s:Envelope>`;

  const xml = await soap(
    SAT_ENDPOINTS.verifica,
    "http://DescargaMasivaTerceros.sat.gob.mx/IVerificaSolicitudDescargaService/VerificaSolicitudDescarga",
    envelope,
    token,
    2,
  );
  const estado = Number(/EstadoSolicitud="([^"]*)"/.exec(xml)?.[1] ?? "0");
  const paquetes = Array.from(xml.matchAll(/<IdsPaquetes>([^<]+)<\/IdsPaquetes>/g)).map(
    (m) => m[1]!,
  );
  return {
    estado, // 1 aceptada · 2 en proceso · 3 terminada · 4 error · 5 rechazada · 6 vencida
    codigo: /CodEstatus="([^"]*)"/.exec(xml)?.[1] ?? "",
    mensaje: /Mensaje="([^"]*)"/.exec(xml)?.[1] ?? "",
    numeroCfdis: Number(/NumeroCFDIs="([^"]*)"/.exec(xml)?.[1] ?? "0"),
    paquetes,
  };
}

/** Paso 4 — Descarga de un paquete. Devuelve el ZIP en base64. */
export async function satDescargarPaquete(
  c: Credenciales,
  token: string,
  idPaquete: string,
): Promise<string> {
  const attrs = `IdPaquete="${idPaquete}" RfcSolicitante="${c.rfc}"`;
  const canonical = `<des:peticionDescarga xmlns:des="${NS_DES}" xmlns:xd="${NS_DSIG}" ${attrs}></des:peticionDescarga>`;
  const si = signedInfo(sha1B64(canonical), "", true);
  const signature =
    `<Signature xmlns="${NS_DSIG}">` +
    si.replace(` xmlns="${NS_DSIG}"`, "") +
    `<SignatureValue>${signB64(c.privateKey, si)}</SignatureValue>` +
    keyInfo(c) +
    `</Signature>`;

  const envelope =
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:des="${NS_DES}" xmlns:xd="${NS_DSIG}">` +
    `<s:Header/><s:Body><des:PeticionDescargaMasivaTercerosEntrada>` +
    `<des:peticionDescarga ${attrs}>${signature}</des:peticionDescarga>` +
    `</des:PeticionDescargaMasivaTercerosEntrada></s:Body></s:Envelope>`;

  const xml = await soap(
    SAT_ENDPOINTS.descarga,
    "http://DescargaMasivaTerceros.sat.gob.mx/IDescargaMasivaTercerosService/Descargar",
    envelope,
    token,
    2,
  );
  const paquete = /<Paquete>([\s\S]*?)<\/Paquete>/.exec(xml)?.[1]?.trim();
  if (!paquete) {
    const msg = /Mensaje="([^"]*)"/.exec(xml)?.[1] ?? "sin contenido";
    throw new Error(`El SAT no entregó el paquete: ${msg}`);
  }
  return paquete;
}
