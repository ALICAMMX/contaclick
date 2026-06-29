import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import JSZip from "jszip";

const xmlEsc = (s: string) =>
  String(s ?? "").replace(/[<>&'"]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[m]!));

type Asiento = { cuenta: string; nombre: string; debe: number; haber: number };

function periodoRange(anio: number, mes: number) {
  const mm = String(mes).padStart(2, "0");
  const last = new Date(anio, mes, 0).getDate();
  return { ini: `${anio}-${mm}-01`, fin: `${anio}-${mm}-${String(last).padStart(2, "0")}`, mm, last };
}

function csvLine(arr: (string | number | null | undefined)[]) {
  return arr
    .map((v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  // btoa exists in Worker runtime
  // eslint-disable-next-line no-undef
  return btoa(bin);
}

export const exportarExpedienteZip = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      anio: z.number().int().min(2018).max(2100),
      mes: z.number().int().min(1).max(12),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { ini, fin, mm } = periodoRange(data.anio, data.mes);

    // ---- Cliente
    const { data: cli, error: eCli } = await supabase
      .from("clientes")
      .select("id, razon_social, rfc, regimen_fiscal, codigo_postal")
      .eq("id", data.cliente_id)
      .maybeSingle();

    if (eCli) throw new Error(eCli.message);
    if (!cli) throw new Error("Cliente no encontrado");

    const zip = new JSZip();

    // ---- README
    const ahora = new Date().toISOString();
    zip.file(
      "README.txt",
      [
        `EXPEDIENTE CONTACLICK`,
        `=====================`,
        `Cliente : ${cli.razon_social}`,
        `RFC     : ${cli.rfc ?? "(sin RFC)"}`,
        `Régimen : ${cli.regimen_fiscal ?? "-"}`,
        `Período : ${data.anio}-${mm}  (${ini} a ${fin})`,
        `Generado: ${ahora}`,
        ``,
        `Contenido:`,
        `  /Anexo24/           XML oficiales SAT 1.3 (Catálogo, Balanza, Pólizas)`,
        `  /Importadores/      TXT para CONTPAQi y Aspel COI`,
        `  /CFDI/              Listado de comprobantes emitidos y recibidos`,
        `  /Polizas/           Detalle de pólizas confirmadas`,
        `  /Reportes/          Resumen ejecutivo del período`,
        ``,
        `Documento generado automáticamente por ContaClick. No sustituye el dictamen profesional del contador responsable.`,
      ].join("\n"),
    );

    // ---- CFDI listado
    const { data: cfdis } = await supabase
      .from("cfdi_xml")
      .select("uuid, fecha, tipo_cfdi, rfc_emisor, nombre_emisor, rfc_receptor, nombre_receptor, subtotal, iva_trasladado, ieps_trasladado, isr_retenido, iva_retenido, total, moneda, metodo_pago, forma_pago, uso_cfdi, estatus_sat")
      .eq("cliente_id", data.cliente_id)
      .gte("fecha", ini)
      .lte("fecha", `${fin}T23:59:59`)
      .order("fecha");

    const cfdiRows = cfdis ?? [];
    const emitidos = cfdiRows.filter((c: any) => c.rfc_emisor === cli.rfc);
    const recibidos = cfdiRows.filter((c: any) => c.rfc_emisor !== cli.rfc);

    const cfdiHeader = ["UUID", "Fecha", "Tipo", "RFC Emisor", "Nombre Emisor", "RFC Receptor", "Nombre Receptor", "Subtotal", "IVA Tras", "IEPS Tras", "ISR Ret", "IVA Ret", "Total", "Moneda", "Método", "Forma", "Uso", "Estatus SAT"];
    const cfdiCsv = (rows: any[]) =>
      [csvLine(cfdiHeader), ...rows.map((c) => csvLine([
        c.uuid, c.fecha, c.tipo_cfdi, c.rfc_emisor, c.nombre_emisor, c.rfc_receptor, c.nombre_receptor,
        c.subtotal, c.iva_trasladado, c.ieps_trasladado, c.isr_retenido, c.iva_retenido, c.total,
        c.moneda, c.metodo_pago, c.forma_pago, c.uso_cfdi, c.estatus_sat,
      ]))].join("\n");

    zip.file("CFDI/emitidos.csv", cfdiCsv(emitidos));
    zip.file("CFDI/recibidos.csv", cfdiCsv(recibidos));
    zip.file("CFDI/todos.csv", cfdiCsv(cfdiRows));

    const totIngresos = emitidos.reduce((s: number, c: any) => s + Number(c.total || 0), 0);
    const totGastos = recibidos.reduce((s: number, c: any) => s + Number(c.total || 0), 0);
    const ivaTrasladado = emitidos.reduce((s: number, c: any) => s + Number(c.iva_trasladado || 0), 0);
    const ivaAcreditable = recibidos.reduce((s: number, c: any) => s + Number(c.iva_trasladado || 0), 0);

    // ---- Pólizas
    const { data: polizas } = await supabase
      .from("polizas")
      .select("id, fecha, tipo, concepto, monto, uuid_cfdi, referencia, metadata, estado")
      .eq("cliente_id", data.cliente_id)
      .eq("estado", "confirmada")
      .gte("fecha", ini)
      .lte("fecha", fin)
      .order("fecha");

    const polRows = polizas ?? [];
    const polHeader = ["PolizaID", "Fecha", "Tipo", "Concepto", "Cuenta", "Nombre Cuenta", "Debe", "Haber", "UUID CFDI", "Referencia"];
    const polLines = [csvLine(polHeader)];
    for (const p of polRows as any[]) {
      const asientos: Asiento[] = (p.metadata?.asientos ?? []) as Asiento[];
      for (const a of asientos) {
        polLines.push(csvLine([p.id.slice(0, 12), p.fecha, p.tipo, p.concepto, a.cuenta, a.nombre, a.debe, a.haber, p.uuid_cfdi, p.referencia]));
      }
    }
    zip.file("Polizas/polizas_detalle.csv", polLines.join("\n"));

    // ---- Anexo 24 Catálogo
    const { data: cuentas } = await supabase
      .from("catalogo_cuentas")
      .select("codigo, nombre, naturaleza, tipo_sat, activa")
      .eq("cliente_id", data.cliente_id)
      .eq("activa", true)
      .order("codigo");

    if (cli.rfc && cuentas && cuentas.length > 0) {
      const lines: string[] = [`<?xml version="1.0" encoding="UTF-8"?>`];
      lines.push(
        `<catalogocuentas:Catalogo xmlns:catalogocuentas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas" ` +
          `Version="1.3" RFC="${xmlEsc(cli.rfc)}" Mes="${mm}" Anio="${data.anio}">`,
      );
      for (const c of cuentas as any[]) {
        const nivel = String(c.codigo).split(/[.\-]/).length;
        const natur = c.naturaleza === "deudora" ? "D" : "A";
        lines.push(`  <catalogocuentas:Ctas CodAgrup="${xmlEsc(c.tipo_sat || c.codigo)}" NumCta="${xmlEsc(c.codigo)}" Desc="${xmlEsc(c.nombre)}" Nivel="${nivel}" Natur="${natur}"/>`);
      }
      lines.push(`</catalogocuentas:Catalogo>`);
      zip.file(`Anexo24/${cli.rfc}${data.anio}${mm}CT.xml`, lines.join("\n"));
    }

    // ---- Anexo 24 Pólizas
    if (cli.rfc && polRows.length > 0) {
      const lines: string[] = [`<?xml version="1.0" encoding="UTF-8"?>`];
      lines.push(
        `<PLZ:Polizas xmlns:PLZ="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo" ` +
          `Version="1.3" RFC="${xmlEsc(cli.rfc)}" Mes="${mm}" Anio="${data.anio}" TipoSolicitud="AF">`,
      );
      for (const p of polRows as any[]) {
        const asientos: Asiento[] = (p.metadata?.asientos ?? []) as Asiento[];
        if (!asientos.length) continue;
        lines.push(`  <PLZ:Poliza NumUnIdenPol="${xmlEsc(p.id.slice(0, 12))}" Fecha="${String(p.fecha).slice(0, 10)}" Concepto="${xmlEsc(p.concepto || "Póliza")}">`);
        for (const a of asientos) {
          lines.push(`    <PLZ:Transaccion NumCta="${xmlEsc(a.cuenta)}" DesCta="${xmlEsc(a.nombre)}" Concepto="${xmlEsc(p.concepto || "")}" Debe="${a.debe.toFixed(2)}" Haber="${a.haber.toFixed(2)}">`);
          if (p.uuid_cfdi) lines.push(`      <PLZ:CompNal UUID_CFDI="${xmlEsc(p.uuid_cfdi)}" MontoTotal="${Number(p.monto ?? 0).toFixed(2)}" RFC="${xmlEsc(cli.rfc)}"/>`);
          lines.push(`    </PLZ:Transaccion>`);
        }
        lines.push(`  </PLZ:Poliza>`);
      }
      lines.push(`</PLZ:Polizas>`);
      zip.file(`Anexo24/${cli.rfc}${data.anio}${mm}PL.xml`, lines.join("\n"));
    }

    // ---- Anexo 24 Balanza
    if (cli.rfc && cuentas && cuentas.length > 0) {
      const cuentasMap = new Map<string, { naturaleza: string; nombre: string }>();
      for (const c of cuentas) cuentasMap.set(c.codigo as string, c as any);

      const { data: prev } = await supabase
        .from("polizas")
        .select("metadata")
        .eq("cliente_id", data.cliente_id)
        .eq("estado", "confirmada")
        .lt("fecha", ini);

      type Acc = { debe: number; haber: number };
      const iniMap = new Map<string, Acc>();
      const perMap = new Map<string, Acc>();
      const add = (m: Map<string, Acc>, k: string, d: number, h: number) => {
        const cur = m.get(k) ?? { debe: 0, haber: 0 };
        cur.debe += d; cur.haber += h; m.set(k, cur);
      };
      for (const p of (prev ?? []) as any[]) for (const a of (p.metadata?.asientos ?? []) as Asiento[]) add(iniMap, a.cuenta, a.debe || 0, a.haber || 0);
      for (const p of polRows as any[]) for (const a of (p.metadata?.asientos ?? []) as Asiento[]) add(perMap, a.cuenta, a.debe || 0, a.haber || 0);

      const codigos = Array.from(new Set([...iniMap.keys(), ...perMap.keys()])).sort();
      const lines: string[] = [`<?xml version="1.0" encoding="UTF-8"?>`];
      lines.push(`<BCE:Balanza xmlns:BCE="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion" Version="1.3" RFC="${xmlEsc(cli.rfc)}" Mes="${mm}" Anio="${data.anio}" TipoEnvio="N">`);
      for (const codigo of codigos) {
        const meta = cuentasMap.get(codigo);
        const naturaleza = meta?.naturaleza ?? "deudora";
        const i = iniMap.get(codigo) ?? { debe: 0, haber: 0 };
        const p = perMap.get(codigo) ?? { debe: 0, haber: 0 };
        const saldoIni = naturaleza === "deudora" ? i.debe - i.haber : i.haber - i.debe;
        const saldoFin = saldoIni + (naturaleza === "deudora" ? p.debe - p.haber : p.haber - p.debe);
        lines.push(`  <BCE:Ctas NumCta="${xmlEsc(codigo)}" SaldoIni="${saldoIni.toFixed(2)}" Debe="${p.debe.toFixed(2)}" Haber="${p.haber.toFixed(2)}" SaldoFin="${saldoFin.toFixed(2)}"/>`);
      }
      lines.push(`</BCE:Balanza>`);
      zip.file(`Anexo24/${cli.rfc}${data.anio}${mm}BN.xml`, lines.join("\n"));
    }

    // ---- Importadores
    const tipoMapCp: Record<string, string> = { ingreso: "1", egreso: "2", diario: "3" };
    const tipoMapAs: Record<string, string> = { ingreso: "Ig", egreso: "Eg", diario: "Dr" };
    const cpLines: string[] = [];
    const asLines: string[] = [];
    let cons = 0;
    for (const p of polRows as any[]) {
      const asientos: Asiento[] = (p.metadata?.asientos ?? []) as Asiento[];
      if (!asientos.length) continue;
      cons++;
      const tCp = tipoMapCp[p.tipo] ?? "3";
      const tAs = tipoMapAs[p.tipo] ?? "Dr";
      for (const a of asientos) {
        cpLines.push([tCp, cons, String(p.fecha).slice(0, 10), (p.concepto || "").replace(/\|/g, " "), a.cuenta, a.debe.toFixed(2), a.haber.toFixed(2), (a.nombre || "").replace(/\|/g, " "), p.uuid_cfdi || p.referencia || ""].join("|"));
        asLines.push([tAs, cons, String(p.fecha).slice(0, 10), (p.concepto || "").replace(/\|/g, " ").slice(0, 60), a.cuenta, a.debe.toFixed(2), a.haber.toFixed(2), p.uuid_cfdi || p.referencia || "", "1"].join("|"));
      }
    }
    if (cpLines.length) zip.file(`Importadores/polizas_${data.anio}${mm}_contpaqi.txt`, cpLines.join("\r\n"));
    if (asLines.length) zip.file(`Importadores/polizas_${data.anio}${mm}_aspel_coi.txt`, asLines.join("\r\n"));

    // ---- Resumen ejecutivo
    const resumen = [
      `RESUMEN EJECUTIVO · ${cli.razon_social} (${cli.rfc ?? "sin RFC"})`,
      `Período: ${data.anio}-${mm}`,
      ``,
      `INGRESOS (CFDI emitidos)`,
      `  Comprobantes : ${emitidos.length}`,
      `  Total        : $${totIngresos.toFixed(2)}`,
      `  IVA trasladado: $${ivaTrasladado.toFixed(2)}`,
      ``,
      `GASTOS (CFDI recibidos)`,
      `  Comprobantes : ${recibidos.length}`,
      `  Total        : $${totGastos.toFixed(2)}`,
      `  IVA acreditable: $${ivaAcreditable.toFixed(2)}`,
      ``,
      `RESULTADO`,
      `  Utilidad bruta estimada : $${(totIngresos - totGastos).toFixed(2)}`,
      `  IVA por pagar estimado  : $${(ivaTrasladado - ivaAcreditable).toFixed(2)}`,
      ``,
      `POLIZAS CONFIRMADAS: ${polRows.length}`,
      ``,
      `--- Sello ContaClick · ${ahora} ---`,
    ].join("\n");
    zip.file("Reportes/resumen_ejecutivo.txt", resumen);

    // ---- Generar ZIP en base64
    const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const filename = `expediente_${(cli.rfc || "cliente").toUpperCase()}_${data.anio}${mm}.zip`;
    return {
      filename,
      contenido_b64: bytesToBase64(buf),
      stats: {
        cfdi_emitidos: emitidos.length,
        cfdi_recibidos: recibidos.length,
        polizas: polRows.length,
        cuentas: cuentas?.length ?? 0,
        tamano_kb: Math.round(buf.length / 1024),
      },
    };
  });
