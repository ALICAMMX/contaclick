import { parseCfdi } from "@/lib/tools/cfdi-parser";

export type Rejection = { archivo: string; motivo: string; detalle?: string };

export type RejectReport = {
  rfc: string;
  aceptados: number;
  rfcAjeno: Rejection[];
  duplicadosLocal: Rejection[];
  duplicadosExpediente: Rejection[];
  sinUuid: Rejection[];
  errores: Rejection[];
};

export type AcceptedXml = {
  filename: string;
  xml: string;
  uuid: string;
  hash: string;
  rfcEmisor: string;
  rfcReceptor: string;
};

export async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function emptyReport(rfc: string): RejectReport {
  return { rfc, aceptados: 0, rfcAjeno: [], duplicadosLocal: [], duplicadosExpediente: [], sinUuid: [], errores: [] };
}

export function reportTotalRejections(rep: RejectReport): number {
  return rep.rfcAjeno.length + rep.duplicadosLocal.length + rep.duplicadosExpediente.length + rep.sinUuid.length + rep.errores.length;
}

/**
 * Clasifica una lista de XMLs contra el RFC activo y las llaves ya existentes
 * (en BD del expediente y en la sesión local). Devuelve los aceptados y el reporte de rechazos.
 */
export async function classifyXmls(args: {
  rfcActivo: string;
  files: Array<{ filename: string; xml: string }>;
  dbUuids: Set<string>;
  dbHashes: Set<string>;
  seenUuids?: Set<string>;
  seenHashes?: Set<string>;
}): Promise<{ accepted: AcceptedXml[]; report: RejectReport }> {
  const rfc = args.rfcActivo.toUpperCase();
  const report = emptyReport(rfc);
  const accepted: AcceptedXml[] = [];
  const localUuids = new Set<string>(args.seenUuids ?? []);
  const localHashes = new Set<string>(args.seenHashes ?? []);

  for (const f of args.files) {
    const name = f.filename;
    try {
      const parsed = parseCfdi(f.xml);
      const emisor = (parsed.emisor.rfc ?? "").toUpperCase();
      const receptor = (parsed.receptor.rfc ?? "").toUpperCase();
      const uuid = (parsed.uuid ?? "").toUpperCase();
      const hash = await sha256Hex(f.xml);

      if (emisor !== rfc && receptor !== rfc) {
        report.rfcAjeno.push({ archivo: name, motivo: "RFC ajeno", detalle: `Emisor ${emisor || "—"} · Receptor ${receptor || "—"}` });
      } else if (!uuid) {
        report.sinUuid.push({ archivo: name, motivo: "Sin UUID (no timbrado)" });
      } else if (localUuids.has(uuid) || localHashes.has(hash)) {
        report.duplicadosLocal.push({ archivo: name, motivo: "Duplicado en esta carga", detalle: `UUID ${uuid}` });
      } else if (args.dbUuids.has(uuid) || args.dbHashes.has(hash)) {
        report.duplicadosExpediente.push({ archivo: name, motivo: "Ya existe en el expediente", detalle: `UUID ${uuid}` });
      } else {
        accepted.push({ filename: name, xml: f.xml, uuid, hash, rfcEmisor: emisor, rfcReceptor: receptor });
        localUuids.add(uuid);
        localHashes.add(hash);
        report.aceptados++;
      }
    } catch (e) {
      report.errores.push({ archivo: name, motivo: "No se pudo leer el archivo", detalle: e instanceof Error ? e.message : "" });
    }
  }

  return { accepted, report };
}
