import { describe, it, expect } from "vitest";
import {
  entradaZipSegura,
  validarBytesXml,
  rutaOriginal,
  sha256Bytes,
  decidirOriginal,
  originalVerificado,
  MAX_BYTES_XML,
} from "./original";
import { conservarOriginal, leerOriginalVerificado, type AlmacenOriginales } from "./original.server";

const XML = `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante Version="4.0"><cfdi:Complemento><tfd:TimbreFiscalDigital UUID="aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"/></cfdi:Complemento></cfdi:Comprobante>`;
const bytes = (s: string) => new TextEncoder().encode(s);

/** Almacén en memoria que permite simular caídas y objetos preexistentes. */
function almacenFalso(opts: { fallaSubida?: boolean; fallaLectura?: boolean; previos?: Record<string, Uint8Array> } = {}) {
  const objetos = new Map<string, Uint8Array>(Object.entries(opts.previos ?? {}));
  const almacen: AlmacenOriginales & { objetos: Map<string, Uint8Array> } = {
    objetos,
    async subir(path, b) {
      if (opts.fallaSubida) return { ok: false, error: "red caída" };
      if (objetos.has(path)) return { ok: true, existia: true };
      objetos.set(path, new Uint8Array(b));
      return { ok: true };
    },
    async leer(path) {
      if (opts.fallaLectura) return null;
      return objetos.get(path) ?? null;
    },
    async eliminar(path) {
      objetos.delete(path);
    },
  };
  return almacen;
}

const base = {
  despachoId: "11111111-1111-4111-8111-111111111111",
  clienteId: "22222222-2222-4222-8222-222222222222",
  uuid: "AAAAAAAA-1111-4111-8111-AAAAAAAAAAAA",
  fecha: "2026-07-15T10:00:00-06:00",
};

describe("ruta interna del archivero", () => {
  it("usa sólo identificadores internos: sin RFC, razón social ni correo", () => {
    const ruta = rutaOriginal(base);
    expect(ruta).toBe(`${base.despachoId}/${base.clienteId}/2026/07/${base.uuid}.xml`);
    expect(ruta).not.toMatch(/[A-Z]{3,4}\d{6}[A-Z0-9]{3}/);
    expect(ruta).not.toContain("@");
  });
  it("normaliza el UUID a mayúsculas para no duplicar rutas", () => {
    expect(rutaOriginal({ ...base, uuid: base.uuid.toLowerCase() })).toBe(rutaOriginal(base));
  });
});

describe("validación antes de guardar", () => {
  it("acepta un CFDI legítimo", () => {
    expect(validarBytesXml(bytes(XML)).ok).toBe(true);
  });
  it("rechaza archivo vacío", () => {
    expect(validarBytesXml(new Uint8Array())).toMatchObject({ ok: false });
  });
  it("rechaza contenido que no es XML", () => {
    expect(validarBytesXml(bytes("PK\u0003\u0004binario"))).toMatchObject({ ok: false });
  });
  it("rechaza tamaños abusivos", () => {
    const grande = new Uint8Array(MAX_BYTES_XML + 1).fill(60);
    expect(validarBytesXml(grande)).toMatchObject({ ok: false });
  });
  it("rechaza XXE por DOCTYPE y por declaración de entidades", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>`;
    expect(validarBytesXml(bytes(xxe))).toMatchObject({ ok: false });
  });
});

describe("entradas peligrosas del ZIP", () => {
  it("acepta un nombre normal", () => {
    expect(entradaZipSegura("AAAA-1111.xml").ok).toBe(true);
  });
  it.each([
    ["../../etc/passwd.xml", "escape de directorio"],
    ["/absoluta/x.xml", "ruta absoluta"],
    ["C:\\temp\\x.xml", "unidad de disco"],
    ["archivo.pdf", "no es XML"],
  ])("rechaza %s", (nombre) => {
    expect(entradaZipSegura(nombre).ok).toBe(false);
  });
});

describe("conservación y verificación", () => {
  it("almacena, relee y sólo entonces declara verificado", async () => {
    const almacen = almacenFalso();
    const r = await conservarOriginal(almacen, { ...base, bytes: bytes(XML) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado).toBe("verificado");
    expect(r.sha256).toBe(await sha256Bytes(bytes(XML)));
    expect(originalVerificado(r.estado)).toBe(true);
    // Bytes idénticos a los entregados: no se reformatea el original.
    expect(almacen.objetos.get(r.path)).toEqual(bytes(XML));
  });

  it("si Storage falla, NO se declara verificado (no hay registro con original aparente)", async () => {
    const r = await conservarOriginal(almacenFalso({ fallaSubida: true }), { ...base, bytes: bytes(XML) });
    expect(r).toMatchObject({ ok: false, estado: "fallido" });
  });

  it("si el objeto no puede releerse, el original no cuenta como verificado", async () => {
    const r = await conservarOriginal(almacenFalso({ fallaLectura: true }), { ...base, bytes: bytes(XML) });
    expect(r).toMatchObject({ ok: false, estado: "fallido" });
  });

  it("reintentar con los mismos bytes es idempotente: misma ruta y misma huella", async () => {
    const almacen = almacenFalso();
    const a = await conservarOriginal(almacen, { ...base, bytes: bytes(XML) });
    const b = await conservarOriginal(almacen, { ...base, bytes: bytes(XML) });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.path).toBe(a.path);
    expect(b.sha256).toBe(a.sha256);
    expect(almacen.objetos.size).toBe(1);
  });

  it("mismo UUID con contenido distinto: no sobrescribe y marca conflicto", async () => {
    const almacen = almacenFalso();
    const a = await conservarOriginal(almacen, { ...base, bytes: bytes(XML) });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const otro = XML.replace("4.0", "3.3");
    const b = await conservarOriginal(almacen, {
      ...base,
      bytes: bytes(otro),
      existente: { id: "x", original_path: a.path, original_sha256: a.sha256, original_estado: "verificado" },
    });
    expect(b).toMatchObject({ ok: false, estado: "conflicto_integridad" });
    expect(almacen.objetos.get(a.path)).toEqual(bytes(XML));
  });

  it("una fila histórica sin original se enriquece en la misma fila", () => {
    const d = decidirOriginal({ id: "x", original_path: null, original_estado: "historico_no_disponible" }, "a".repeat(64));
    expect(d.accion).toBe("enriquecer");
  });
});

describe("lectura posterior desde el archivero", () => {
  it("devuelve el XML cuando la huella coincide", async () => {
    const almacen = almacenFalso();
    const r = await conservarOriginal(almacen, { ...base, bytes: bytes(XML) });
    if (!r.ok) throw new Error("no se almacenó");
    const leido = await leerOriginalVerificado(almacen, { original_path: r.path, original_sha256: r.sha256 });
    expect(leido).toEqual({ ok: true, xml: XML });
  });
  it("falla honestamente cuando la huella registrada no coincide", async () => {
    const almacen = almacenFalso();
    const r = await conservarOriginal(almacen, { ...base, bytes: bytes(XML) });
    if (!r.ok) throw new Error("no se almacenó");
    const leido = await leerOriginalVerificado(almacen, { original_path: r.path, original_sha256: "b".repeat(64) });
    expect(leido.ok).toBe(false);
  });
  it("falla cuando el objeto no existe", async () => {
    const leido = await leerOriginalVerificado(almacenFalso(), { original_path: "no/existe.xml", original_sha256: null });
    expect(leido.ok).toBe(false);
  });
});
