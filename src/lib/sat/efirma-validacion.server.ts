/**
 * Validación server-side de la e.firma ANTES de guardarla en la bóveda.
 *
 * Falla cerrado: cualquier duda impide guardar la credencial.
 * Nunca se devuelve al navegador la llave privada ni la contraseña, y los
 * mensajes de error no exponen trazas ni detalle criptográfico interno.
 */
import forge from "node-forge";
import { abrirLlaveSat } from "./efirma-key.server";

export type ResultadoValidacion = {
  rfc: string;
  vence_at: string;
  inicia_at: string;
  serial: string;
};

export class EFirmaInvalida extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "EFirmaInvalida";
  }
}

function limpiar(b64: string) {
  return b64.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
}

function leerCertificado(cer_b64: string) {
  try {
    const der = forge.util.decode64(limpiar(cer_b64));
    return forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(der)));
  } catch {
    throw new EFirmaInvalida(
      "cer_invalido",
      "No se pudo leer el certificado (.cer). Verifica que sea el archivo de la e.firma y que no esté dañado.",
    );
  }
}

function rfcDelCertificado(cert: forge.pki.Certificate): string {
  const attr =
    (cert.subject.getField({ type: "2.5.4.45" }) as any)?.value ??
    (cert.subject.getField("UID") as any)?.value ??
    "";
  return String(attr).split("/")[0]?.trim().toUpperCase() ?? "";
}

/** Heurística SAT: la e.firma cifra (keyEncipherment/dataEncipherment); un CSD sólo firma. */
function pareceCsd(cert: forge.pki.Certificate): boolean {
  const ku: any = cert.getExtension("keyUsage");
  if (!ku) return false;
  return !ku.keyEncipherment && !ku.dataEncipherment;
}

/**
 * Valida .cer + .key + contraseña y su correspondencia con el RFC del expediente.
 * No contacta al SAT.
 */
export function validarEFirma(args: {
  cer_b64: string;
  key_b64: string;
  password: string;
  rfcExpediente: string;
  ahora?: Date;
}): ResultadoValidacion {
  const ahora = args.ahora ?? new Date();
  const cert = leerCertificado(args.cer_b64);

  // 1) Vigencia
  if (cert.validity.notAfter.getTime() < ahora.getTime()) {
    throw new EFirmaInvalida(
      "certificado_vencido",
      `El certificado venció el ${cert.validity.notAfter.toLocaleDateString("es-MX")}. Renueva la e.firma ante el SAT y vuelve a cargarla.`,
    );
  }
  if (cert.validity.notBefore.getTime() > ahora.getTime()) {
    throw new EFirmaInvalida(
      "certificado_vencido",
      "El certificado todavía no entra en vigor. Verifica que estés cargando la e.firma vigente.",
    );
  }

  // 2) ¿Es e.firma y no un CSD?
  if (pareceCsd(cert)) {
    throw new EFirmaInvalida(
      "certificado_no_compatible",
      "El archivo corresponde a un Certificado de Sello Digital (CSD), no a la e.firma. El servicio de descarga del SAT sólo acepta e.firma.",
    );
  }

  // 3) RFC del certificado
  const rfcCert = rfcDelCertificado(cert);
  if (!rfcCert) {
    throw new EFirmaInvalida(
      "cer_invalido",
      "No se pudo leer el RFC del certificado. Verifica que sea el archivo .cer de la e.firma.",
    );
  }
  const rfcEsperado = (args.rfcExpediente ?? "").trim().toUpperCase();
  if (rfcCert !== rfcEsperado) {
    throw new EFirmaInvalida(
      "rfc_distinto",
      `La e.firma no corresponde a este expediente: el certificado es de ${rfcCert} y el expediente activo es ${rfcEsperado}. La carga fue rechazada.`,
    );
  }

  // 4) Llave privada legible con la contraseña. Las e.firmas históricas del
  // SAT usan más de una variante de PKCS#8/PBES, por eso el lector es común.
  let keyBytes: Buffer;
  try {
    keyBytes = Buffer.from(limpiar(args.key_b64), "base64");
  } catch {
    throw new EFirmaInvalida(
      "key_invalido",
      "No se pudo leer la llave privada (.key). Verifica que sea el archivo correcto de la e.firma.",
    );
  }
  if (keyBytes.length === 0 || keyBytes[0] !== 0x30) {
    throw new EFirmaInvalida(
      "key_invalido",
      "El archivo .key no tiene un formato de llave privada SAT válido. Vuelve a descargar el archivo original.",
    );
  }
  const privateKey = abrirLlaveSat(args.key_b64, args.password);
  if (!privateKey) {
    throw new EFirmaInvalida(
      "password_incorrecta",
      "No se pudo descifrar la llave privada. Verifica la contraseña respetando mayúsculas, minúsculas y caracteres especiales. Si persiste, confirma que seleccionaste el .key de esta misma e.firma.",
    );
  }

  // 5) Correspondencia criptográfica llave ↔ certificado
  const pub = cert.publicKey as forge.pki.rsa.PublicKey;
  if (pub.n.toString(16) !== privateKey.n.toString(16)) {
    throw new EFirmaInvalida(
      "par_no_corresponde",
      "El archivo .key no corresponde al certificado .cer. Carga el par de archivos de la misma e.firma.",
    );
  }

  const serialHex = cert.serialNumber;
  const serialAscii = Buffer.from(serialHex, "hex").toString("ascii").replace(/\0/g, "");

  return {
    rfc: rfcCert,
    vence_at: cert.validity.notAfter.toISOString(),
    inicia_at: cert.validity.notBefore.toISOString(),
    serial: /^\d+$/.test(serialAscii) ? serialAscii : forge.util.bytesToHex(serialHex),
  };
}
