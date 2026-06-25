import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

const xmlEsc = (s: string) =>
  String(s ?? "").replace(/[<>&'"]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[m]!));

type Asiento = { cuenta: string; nombre: string; debe: number; haber: number };

async function fetchPolizas(supabase: any, cliente_id: string, anio: number, mes: number) {
  const ini = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const finDate = new Date(anio, mes, 0); // último día del mes
  const fin = `${anio}-${String(mes).padStart(2, "0")}-${String(finDate.getDate()).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("polizas")
    .select("id, fecha, tipo, monto, concepto, uuid_cfdi, referencia, metadata")
    .eq("cliente_id", cliente_id)
    .eq("estado", "confirmada")
    .gte("fecha", ini)
    .lte("fecha", fin)
    .order("fecha");
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ===== Anexo 24 — Pólizas (RFC, Anio, Mes, TipoSolicitud=AF por defecto) =====
export const exportarAnexo24Polizas = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      anio: z.number().int().min(2018).max(2100),
      mes: z.number().int().min(1).max(12),
      tipo_solicitud: z.enum(["AF", "FC", "DE", "CO"]).default("AF"),
      num_orden: z.string().optional(),
      num_tramite: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cli } = await supabase.from("clientes").select("rfc").eq("id", data.cliente_id).maybeSingle();
    if (!cli?.rfc) throw new Error("Cliente sin RFC configurado");

    const polizas = await fetchPolizas(supabase, data.cliente_id, data.anio, data.mes);
    if (polizas.length === 0) throw new Error("No hay pólizas confirmadas en el período");

    const lines: string[] = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(
      `<PLZ:Polizas xmlns:PLZ="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo" ` +
        `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
        `xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo/PolizasPeriodo_1_3.xsd" ` +
        `Version="1.3" RFC="${xmlEsc(cli.rfc)}" Mes="${String(data.mes).padStart(2, "0")}" Anio="${data.anio}" ` +
        `TipoSolicitud="${data.tipo_solicitud}"` +
        (data.num_orden ? ` NumOrden="${xmlEsc(data.num_orden)}"` : "") +
        (data.num_tramite ? ` NumTramite="${xmlEsc(data.num_tramite)}"` : "") +
        `>`,
    );

    for (const p of polizas as any[]) {
      const asientos: Asiento[] = (p.metadata?.asientos ?? []) as Asiento[];
      if (!asientos.length) continue;
      lines.push(
        `  <PLZ:Poliza NumUnIdenPol="${xmlEsc(p.id.slice(0, 12))}" Fecha="${String(p.fecha).slice(0, 10)}" Concepto="${xmlEsc(p.concepto || "Póliza")}">`,
      );
      for (const a of asientos) {
        lines.push(
          `    <PLZ:Transaccion NumCta="${xmlEsc(a.cuenta)}" DesCta="${xmlEsc(a.nombre)}" Concepto="${xmlEsc(p.concepto || "")}" Debe="${a.debe.toFixed(2)}" Haber="${a.haber.toFixed(2)}">`,
        );
        if (p.uuid_cfdi) {
          lines.push(
            `      <PLZ:CompNal UUID_CFDI="${xmlEsc(p.uuid_cfdi)}" MontoTotal="${Number(p.monto ?? 0).toFixed(2)}" RFC="${xmlEsc(cli.rfc)}"/>`,
          );
        }
        lines.push(`    </PLZ:Transaccion>`);
      }
      lines.push(`  </PLZ:Poliza>`);
    }
    lines.push(`</PLZ:Polizas>`);

    const xml = lines.join("\n");
    const nombre = `${cli.rfc}${data.anio}${String(data.mes).padStart(2, "0")}PL.xml`;
    return { filename: nombre, contenido: xml, polizas: polizas.length };
  });

// ===== CONTPAQi — TXT importable (un renglón por movimiento) =====
// Formato simple compatible con la importación estándar de pólizas CONTPAQi i Contabilidad
// Campos: TipoPoliza|NumeroPoliza|Fecha|Concepto|NumeroCuenta|Debe|Haber|ConceptoMov|Referencia
export const exportarContpaqi = createServerFn({ method: "POST" })
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
    const polizas = await fetchPolizas(supabase, data.cliente_id, data.anio, data.mes);
    if (polizas.length === 0) throw new Error("No hay pólizas confirmadas en el período");

    const tipoMap: Record<string, string> = { ingreso: "1", egreso: "2", diario: "3" };
    const lines: string[] = [];
    let consecutivo = 0;
    for (const p of polizas as any[]) {
      const asientos: Asiento[] = (p.metadata?.asientos ?? []) as Asiento[];
      if (!asientos.length) continue;
      consecutivo++;
      const tp = tipoMap[p.tipo] ?? "3";
      for (const a of asientos) {
        lines.push(
          [
            tp,
            consecutivo,
            String(p.fecha).slice(0, 10),
            (p.concepto || "").replace(/\|/g, " "),
            a.cuenta,
            a.debe.toFixed(2),
            a.haber.toFixed(2),
            (a.nombre || "").replace(/\|/g, " "),
            p.uuid_cfdi || p.referencia || "",
          ].join("|"),
        );
      }
    }
    const txt = lines.join("\r\n");
    return { filename: `polizas_${data.anio}${String(data.mes).padStart(2, "0")}_contpaqi.txt`, contenido: txt, renglones: lines.length };
  });
