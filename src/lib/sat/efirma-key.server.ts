import { createPrivateKey } from "node:crypto";
import forge from "node-forge";

function limpiarBase64(valor: string): string {
  return valor.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
}

function desdePkcs8Descifrado(der: Buffer): forge.pki.rsa.PrivateKey {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der.toString("binary")));
  return forge.pki.privateKeyFromAsn1(asn1) as forge.pki.rsa.PrivateKey;
}

/** Abre una llave SAT PKCS#8 cifrada en DER, incluyendo variantes históricas de PBES. */
export function abrirLlaveSat(keyB64: string, password: string): forge.pki.rsa.PrivateKey | null {
  let der: Buffer;
  try {
    der = Buffer.from(limpiarBase64(keyB64), "base64");
    if (der.length === 0) return null;
  } catch {
    return null;
  }

  const passphrases: Array<string | Buffer> = [password];
  if (/[^\u0000-\u007f]/.test(password)) {
    const latin1 = Buffer.from(password, "latin1");
    if (!latin1.equals(Buffer.from(password, "utf8"))) passphrases.push(latin1);
  }

  for (const passphrase of passphrases) {
    try {
      const keyObject = createPrivateKey({ key: der, format: "der", type: "pkcs8", passphrase });
      const pkcs8 = keyObject.export({ format: "der", type: "pkcs8" });
      return desdePkcs8Descifrado(Buffer.from(pkcs8));
    } catch {
      // Continúa con otra codificación de contraseña o con forge.
    }
  }

  try {
    const encryptedInfo = forge.asn1.fromDer(forge.util.createBuffer(der.toString("binary")));
    const privateInfo = forge.pki.decryptPrivateKeyInfo(encryptedInfo, password);
    return privateInfo
      ? (forge.pki.privateKeyFromAsn1(privateInfo) as forge.pki.rsa.PrivateKey)
      : null;
  } catch {
    return null;
  }
}