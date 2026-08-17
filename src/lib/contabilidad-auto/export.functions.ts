import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { asientosDesdeRenglones, montoDesdeRenglones, SELECT_RENGLONES_LEGADO } from "@/lib/polizas/adaptador";

const xmlEsc = (s: string) =>
  String(s ?? "").replace(/[<>&'"]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[m]!));

type Asiento = { cuenta: string; nombre: string; debe: number; haber: number };

async function fetchPolizas(supabase: any, cliente_id: string, anio: number, mes: number) {
  const ini = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const finDate = new Date(anio, mes, 0); // último día del mes
  const fin = `${anio}-${String(mes).padStart(2, "0")}-${String(finDate.getDate()).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("polizas")
    .select(`id, fecha, tipo, concepto, uuid_cfdi, referencia, ${SELECT_RENGLONES_LEGADO}`)
    .eq("cliente_id", cliente_id)
    .in("estado", ["aprobada", "confirmada"])
    .gte("fecha", ini)
    .lte("fecha", fin)
    .order("fecha");
  if (error) throw new Error(error.message);
  return (data ?? []).map((p: any) => ({ ...p, monto: montoDesdeRenglones(p) }));
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
      const asientos: Asiento[] = asientosDesdeRenglones(p);
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
      const asientos: Asiento[] = asientosDesdeRenglones(p);
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

// ===== Aspel COI — TXT importable (formato POL) =====
// Una línea por movimiento. Campos típicos:
// Tipo|NumPoliza|Fecha|Concepto|Cuenta|Cargo|Abono|Referencia|Diario
export const exportarAspelCoi = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      anio: z.number().int().min(2018).max(2100),
      mes: z.number().int().min(1).max(12),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const polizas = await fetchPolizas(context.supabase, data.cliente_id, data.anio, data.mes);
    if (polizas.length === 0) throw new Error("No hay pólizas confirmadas en el período");
    const tipoMap: Record<string, string> = { ingreso: "Ig", egreso: "Eg", diario: "Dr" };
    const lines: string[] = [];
    let cons = 0;
    for (const p of polizas as any[]) {
      const asientos: Asiento[] = asientosDesdeRenglones(p);
      if (!asientos.length) continue;
      cons++;
      const tp = tipoMap[p.tipo] ?? "Dr";
      for (const a of asientos) {
        lines.push([
          tp,
          cons,
          String(p.fecha).slice(0, 10),
          (p.concepto || "").replace(/\|/g, " ").slice(0, 60),
          a.cuenta,
          a.debe.toFixed(2),
          a.haber.toFixed(2),
          p.uuid_cfdi || p.referencia || "",
          "1",
        ].join("|"));
      }
    }
    return {
      filename: `polizas_${data.anio}${String(data.mes).padStart(2, "0")}_aspel_coi.txt`,
      contenido: lines.join("\r\n"),
      renglones: lines.length,
    };
  });

// ===== Anexo 24 — Catálogo de cuentas (RFC, Anio, Mes) =====
export const exportarAnexo24Catalogo = createServerFn({ method: "POST" })
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
    const { data: cli } = await supabase.from("clientes").select("rfc").eq("id", data.cliente_id).maybeSingle();
    if (!cli?.rfc) throw new Error("Cliente sin RFC configurado");
    const { data: cuentas, error } = await supabase
      .from("catalogo_cuentas")
      .select("codigo, nombre, naturaleza, tipo_sat")
      .eq("cliente_id", data.cliente_id)
      .eq("activa", true)
      .order("codigo");
    if (error) throw new Error(error.message);
    if (!cuentas || cuentas.length === 0) throw new Error("No hay cuentas activas en el catálogo");

    const lines: string[] = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(
      `<catalogocuentas:Catalogo xmlns:catalogocuentas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas" ` +
        `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
        `xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas/CatalogoCuentas_1_3.xsd" ` +
        `Version="1.3" RFC="${xmlEsc(cli.rfc)}" Mes="${String(data.mes).padStart(2, "0")}" Anio="${data.anio}">`,
    );
    for (const c of cuentas as any[]) {
      // Nivel se infiere del número de segmentos del código.
      const nivel = String(c.codigo).split(/[.\-]/).length;
      const natur = (c.naturaleza === "deudora") ? "D" : "A";
      lines.push(
        `  <catalogocuentas:Ctas CodAgrup="${xmlEsc(c.tipo_sat || c.codigo)}" NumCta="${xmlEsc(c.codigo)}" Desc="${xmlEsc(c.nombre)}" Nivel="${nivel}" Natur="${natur}"/>`,
      );
    }
    lines.push(`</catalogocuentas:Catalogo>`);
    return {
      filename: `${cli.rfc}${data.anio}${String(data.mes).padStart(2, "0")}CT.xml`,
      contenido: lines.join("\n"),
      cuentas: cuentas.length,
    };
  });

// ===== Anexo 24 — Balanza de comprobación =====
// Calcula saldos a partir de pólizas confirmadas del período.
export const exportarAnexo24Balanza = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      anio: z.number().int().min(2018).max(2100),
      mes: z.number().int().min(1).max(12),
      tipo_envio: z.enum(["N", "C"]).default("N"), // N = Normal, C = Complementaria
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cli } = await supabase.from("clientes").select("rfc").eq("id", data.cliente_id).maybeSingle();
    if (!cli?.rfc) throw new Error("Cliente sin RFC configurado");

    const { data: cuentas, error: eCat } = await supabase
      .from("catalogo_cuentas")
      .select("codigo, nombre, naturaleza")
      .eq("cliente_id", data.cliente_id)
      .eq("activa", true);
    if (eCat) throw new Error(eCat.message);
    const cuentasMap = new Map<string, { naturaleza: string; nombre: string }>();
    for (const c of cuentas ?? []) cuentasMap.set(c.codigo, c as any);

    // Saldo inicial: suma de movimientos de pólizas anteriores al período
    const iniDate = `${data.anio}-${String(data.mes).padStart(2, "0")}-01`;
    const finDate = new Date(data.anio, data.mes, 0);
    const finStr = `${data.anio}-${String(data.mes).padStart(2, "0")}-${String(finDate.getDate()).padStart(2, "0")}`;

    const { data: prev } = await supabase
      .from("polizas")
      .select(SELECT_RENGLONES_LEGADO)
      .eq("cliente_id", data.cliente_id)
      .in("estado", ["aprobada", "confirmada"])
      .lt("fecha", iniDate);

    const periodo = await fetchPolizas(supabase, data.cliente_id, data.anio, data.mes);

    type Acc = { debe: number; haber: number };
    const ini: Map<string, Acc> = new Map();
    const per: Map<string, Acc> = new Map();
    const sum = (m: Map<string, Acc>, k: string, d: number, h: number) => {
      const cur = m.get(k) ?? { debe: 0, haber: 0 };
      cur.debe += d; cur.haber += h;
      m.set(k, cur);
    };
    for (const p of (prev ?? []) as any[]) {
      const arr: Asiento[] = asientosDesdeRenglones(p);
      for (const a of arr) sum(ini, a.cuenta, a.debe || 0, a.haber || 0);
    }
    for (const p of periodo as any[]) {
      const arr: Asiento[] = asientosDesdeRenglones(p);
      for (const a of arr) sum(per, a.cuenta, a.debe || 0, a.haber || 0);
    }

    const codigos = new Set<string>([...ini.keys(), ...per.keys()]);
    const lines: string[] = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(
      `<BCE:Balanza xmlns:BCE="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion" ` +
        `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
        `xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion/BalanzaComprobacion_1_3.xsd" ` +
        `Version="1.3" RFC="${xmlEsc(cli.rfc)}" Mes="${String(data.mes).padStart(2, "0")}" Anio="${data.anio}" TipoEnvio="${data.tipo_envio}">`,
    );
    const codigosOrdenados = Array.from(codigos).sort();
    for (const codigo of codigosOrdenados) {
      const meta = cuentasMap.get(codigo);
      const naturaleza = meta?.naturaleza ?? "deudora";
      const i = ini.get(codigo) ?? { debe: 0, haber: 0 };
      const p = per.get(codigo) ?? { debe: 0, haber: 0 };
      const saldoIni = naturaleza === "deudora" ? i.debe - i.haber : i.haber - i.debe;
      const saldoFin = saldoIni + (naturaleza === "deudora" ? p.debe - p.haber : p.haber - p.debe);
      lines.push(
        `  <BCE:Ctas NumCta="${xmlEsc(codigo)}" SaldoIni="${saldoIni.toFixed(2)}" Debe="${p.debe.toFixed(2)}" Haber="${p.haber.toFixed(2)}" SaldoFin="${saldoFin.toFixed(2)}"/>`,
      );
    }
    lines.push(`</BCE:Balanza>`);

    return {
      filename: `${cli.rfc}${data.anio}${String(data.mes).padStart(2, "0")}B${data.tipo_envio}.xml`,
      contenido: lines.join("\n"),
      cuentas: codigosOrdenados.length,
    };
  });

// ===== Anexo 24 — Auxiliar de cuentas (XC) =====
// Detalle por cuenta de TODOS los movimientos del período + saldo inicial.
// El SAT lo solicita cuando abre revisión sobre una cuenta específica.
export const exportarAnexo24AuxCuentas = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      anio: z.number().int().min(2018).max(2100),
      mes: z.number().int().min(1).max(12),
      tipo_solicitud: z.enum(["AF", "FC", "DE", "CO"]).default("AF"),
      num_orden: z.string().optional(),
      num_tramite: z.string().optional(),
      cuenta_filtro: z.string().optional(), // limitar a una sola cuenta
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cli } = await supabase.from("clientes").select("rfc").eq("id", data.cliente_id).maybeSingle();
    if (!cli?.rfc) throw new Error("Cliente sin RFC configurado");

    const { data: cuentas } = await supabase
      .from("catalogo_cuentas")
      .select("codigo, nombre, naturaleza")
      .eq("cliente_id", data.cliente_id);
    const cuentasMap = new Map<string, { naturaleza: string; nombre: string }>();
    for (const c of cuentas ?? []) cuentasMap.set((c as any).codigo, c as any);

    const iniDate = `${data.anio}-${String(data.mes).padStart(2, "0")}-01`;

    // Saldos iniciales (movimientos previos al período)
    const { data: prev } = await supabase
      .from("polizas")
      .select(SELECT_RENGLONES_LEGADO)
      .eq("cliente_id", data.cliente_id)
      .in("estado", ["aprobada", "confirmada"])
      .lt("fecha", iniDate);

    type Acc = { debe: number; haber: number };
    const saldosIni = new Map<string, Acc>();
    for (const p of (prev ?? []) as any[]) {
      const arr: Asiento[] = asientosDesdeRenglones(p);
      for (const a of arr) {
        const cur = saldosIni.get(a.cuenta) ?? { debe: 0, haber: 0 };
        cur.debe += a.debe || 0; cur.haber += a.haber || 0;
        saldosIni.set(a.cuenta, cur);
      }
    }

    // Movimientos del período agrupados por cuenta
    const polizas = await fetchPolizas(supabase, data.cliente_id, data.anio, data.mes);
    type Mov = { fecha: string; numUnIdenPol: string; concepto: string; debe: number; haber: number };
    const movsPorCuenta = new Map<string, Mov[]>();
    for (const p of polizas as any[]) {
      const arr: Asiento[] = asientosDesdeRenglones(p);
      for (const a of arr) {
        if (data.cuenta_filtro && a.cuenta !== data.cuenta_filtro) continue;
        const list = movsPorCuenta.get(a.cuenta) ?? [];
        list.push({
          fecha: String(p.fecha).slice(0, 10),
          numUnIdenPol: String(p.id).slice(0, 12),
          concepto: p.concepto || "",
          debe: a.debe || 0,
          haber: a.haber || 0,
        });
        movsPorCuenta.set(a.cuenta, list);
      }
    }

    if (movsPorCuenta.size === 0) throw new Error("No hay movimientos en el período" + (data.cuenta_filtro ? ` para la cuenta ${data.cuenta_filtro}` : ""));

    const lines: string[] = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(
      `<AuxiliarCtas:AuxiliarCtas xmlns:AuxiliarCtas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarCtas" ` +
        `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
        `xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarCtas http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarCtas/AuxiliarCtas_1_3.xsd" ` +
        `Version="1.3" RFC="${xmlEsc(cli.rfc)}" Mes="${String(data.mes).padStart(2, "0")}" Anio="${data.anio}" ` +
        `TipoSolicitud="${data.tipo_solicitud}"` +
        (data.num_orden ? ` NumOrden="${xmlEsc(data.num_orden)}"` : "") +
        (data.num_tramite ? ` NumTramite="${xmlEsc(data.num_tramite)}"` : "") +
        `>`,
    );

    const codigosOrdenados = Array.from(movsPorCuenta.keys()).sort();
    let totalMovs = 0;
    for (const codigo of codigosOrdenados) {
      const meta = cuentasMap.get(codigo);
      const naturaleza = meta?.naturaleza ?? "deudora";
      const i = saldosIni.get(codigo) ?? { debe: 0, haber: 0 };
      const saldoIni = naturaleza === "deudora" ? i.debe - i.haber : i.haber - i.debe;
      lines.push(
        `  <AuxiliarCtas:Cuenta NumCta="${xmlEsc(codigo)}" DesCta="${xmlEsc(meta?.nombre || codigo)}" SaldoIni="${saldoIni.toFixed(2)}">`,
      );
      for (const m of movsPorCuenta.get(codigo)!) {
        totalMovs++;
        lines.push(
          `    <AuxiliarCtas:DetalleAux Fecha="${m.fecha}" NumUnIdenPol="${xmlEsc(m.numUnIdenPol)}" Concepto="${xmlEsc(m.concepto)}" Debe="${m.debe.toFixed(2)}" Haber="${m.haber.toFixed(2)}"/>`,
        );
      }
      lines.push(`  </AuxiliarCtas:Cuenta>`);
    }
    lines.push(`</AuxiliarCtas:AuxiliarCtas>`);

    return {
      filename: `${cli.rfc}${data.anio}${String(data.mes).padStart(2, "0")}XC.xml`,
      contenido: lines.join("\n"),
      cuentas: codigosOrdenados.length,
      movimientos: totalMovs,
    };
  });

// ===== Anexo 24 — Auxiliar de folios fiscales (XF) =====
// Relación de pólizas con sus UUID de CFDI. Solicitado en revisiones electrónicas
// para cruzar una factura específica contra su asiento contable.
export const exportarAnexo24AuxFolios = createServerFn({ method: "POST" })
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
    const conFolio = (polizas as any[]).filter((p) => p.uuid_cfdi);
    if (conFolio.length === 0) throw new Error("No hay pólizas con UUID de CFDI en el período");

    const lines: string[] = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(
      `<AuxiliarFolios:AuxiliarFolios xmlns:AuxiliarFolios="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarFolios" ` +
        `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
        `xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarFolios http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarFolios/AuxiliarFolios_1_3.xsd" ` +
        `Version="1.3" RFC="${xmlEsc(cli.rfc)}" Mes="${String(data.mes).padStart(2, "0")}" Anio="${data.anio}" ` +
        `TipoSolicitud="${data.tipo_solicitud}"` +
        (data.num_orden ? ` NumOrden="${xmlEsc(data.num_orden)}"` : "") +
        (data.num_tramite ? ` NumTramite="${xmlEsc(data.num_tramite)}"` : "") +
        `>`,
    );

    for (const p of conFolio) {
      lines.push(
        `  <AuxiliarFolios:DetAuxFol NumUnIdenPol="${xmlEsc(String(p.id).slice(0, 12))}" Fecha="${String(p.fecha).slice(0, 10)}">`,
      );
      lines.push(
        `    <AuxiliarFolios:ComprNal UUID_CFDI="${xmlEsc(p.uuid_cfdi)}" RFC="${xmlEsc(cli.rfc)}" MontoTotal="${Number(p.monto ?? 0).toFixed(2)}"/>`,
      );
      lines.push(`  </AuxiliarFolios:DetAuxFol>`);
    }
    lines.push(`</AuxiliarFolios:AuxiliarFolios>`);

    return {
      filename: `${cli.rfc}${data.anio}${String(data.mes).padStart(2, "0")}XF.xml`,
      contenido: lines.join("\n"),
      folios: conFolio.length,
    };
  });


