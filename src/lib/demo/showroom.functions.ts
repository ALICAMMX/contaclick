import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PERFILES_DEMO, DEMO_TAG, EFOS_DEMO_RFCS, type PerfilDemo } from "./perfiles";
import { generateDemoCfdi } from "./cfdi-generator";

const DESPACHO_RFC = "DEMODESP010101AA0";

async function getDespacho(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: m } = await supabase
    .from("user_memberships").select("despacho_id").eq("user_id", userId).eq("estado", "activo").limit(1).maybeSingle();
  if (m?.despacho_id) return m.despacho_id as string;
  const { data: o } = await supabase.from("despachos").select("id").eq("owner_user_id", userId).limit(1).maybeSingle();
  if (o?.id) return o.id as string;
  throw new Error("No tienes un despacho activo.");
}

// PRNG determinista por RFC para que la demo sea reproducible
function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5; let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATALOGO_BASE = [
  { codigo: "1000", nombre: "Caja", naturaleza: "deudora", tipo_sat: "101.01" },
  { codigo: "1010", nombre: "Bancos", naturaleza: "deudora", tipo_sat: "102.01" },
  { codigo: "1050", nombre: "Clientes", naturaleza: "deudora", tipo_sat: "105.01" },
  { codigo: "1180", nombre: "IVA acreditable", naturaleza: "deudora", tipo_sat: "118.01" },
  { codigo: "2010", nombre: "Proveedores", naturaleza: "acreedora", tipo_sat: "201.01" },
  { codigo: "2080", nombre: "IVA trasladado", naturaleza: "acreedora", tipo_sat: "208.01" },
  { codigo: "4000", nombre: "Ingresos por servicios", naturaleza: "acreedora", tipo_sat: "401.01" },
  { codigo: "5000", nombre: "Gastos de operación", naturaleza: "deudora", tipo_sat: "601.01" },
  { codigo: "5100", nombre: "Sueldos y salarios", naturaleza: "deudora", tipo_sat: "601.84" },
];

async function seedOneCliente(supabase: SupabaseClient, despacho_id: string, userId: string, perfil: PerfilDemo) {
  const rng = seededRandom(perfil.rfc);
  const now = new Date();

  // 1) Cliente
  const { data: clienteRow, error: cErr } = await supabase.from("clientes").insert({
    user_id: userId, despacho_id,
    rfc: perfil.rfc, razon_social: perfil.razon,
    regimen_fiscal: `${perfil.regimen} - ${perfil.tipo_persona === "moral" ? "Personas Morales" : "Personas Físicas"}`,
    email: perfil.email, telefono: perfil.telefono,
    notas: `${DEMO_TAG} perfil:${perfil.idx} — ${perfil.perfil_label}`,
    semaforo: perfil.semaforo, estado_mes: perfil.estado_mes,
    tipo_persona: perfil.tipo_persona, codigo_postal: "64000",
    domicilio_fiscal: "Av. Demo 100, Monterrey, NL",
    csf_ultima_emision: new Date(now.getFullYear(), now.getMonth() - 1, 5).toISOString().slice(0, 10),
  }).select("id").single();
  if (cErr || !clienteRow) throw new Error(`Cliente ${perfil.rfc}: ${cErr?.message}`);
  const cliente_id = clienteRow.id as string;

  // 2) RFC
  const { data: rfcRow, error: rErr } = await supabase.from("rfcs").insert({
    despacho_id, cliente_id, rfc: perfil.rfc,
    tipo_persona: perfil.tipo_persona, regimen_fiscal: perfil.regimen, cp_fiscal: "64000",
    vigente: true,
  }).select("id").single();
  if (rErr || !rfcRow) throw new Error(`RFC: ${rErr?.message}`);
  const rfc_id = rfcRow.id as string;

  // 3) Catálogo de cuentas
  await supabase.from("catalogo_cuentas").insert(
    CATALOGO_BASE.map((c) => ({ ...c, cliente_id, despacho_id, created_by: userId }))
  );

  // 4) Cuenta bancaria
  const { data: ctaRow } = await supabase.from("cuentas_bancarias").insert({
    despacho_id, cliente_id, banco: "BBVA Demo", alias: "Cuenta operativa",
    numero_cuenta_mask: `**** ${String(Math.floor(rng() * 9000) + 1000)}`, moneda: "MXN",
  }).select("id").single();
  const cuenta_id = ctaRow!.id as string;

  // 5) CFDIs emitidos
  const cfdisRows: any[] = [];
  const conceptosRows: any[] = [];
  const polizasRows: any[] = [];
  const cfdiByIndex: Array<{ id?: string; uuid: string; total: number; tipo: "I" | "E"; fecha: Date; emisor: string }> = [];

  for (let i = 0; i < perfil.cfdi_emitidos; i++) {
    const fecha = new Date(now.getFullYear(), now.getMonth() - Math.floor(i / 8), 1 + (i % 28));
    const subtotal = +(2000 + rng() * 18000).toFixed(2);
    const g = await generateDemoCfdi({
      serie: "A", folio: 100 + i, fecha, tipoComprobante: "I",
      rfcEmisor: perfil.rfc, nombreEmisor: perfil.razon, regimenEmisor: perfil.regimen,
      rfcReceptor: "XAXX010101000", nombreReceptor: "PUBLICO EN GENERAL", regimenReceptor: "616",
      usoCFDI: "G03", metodoPago: rng() > 0.7 ? "PPD" : "PUE", formaPago: "03",
      subtotal,
      conceptos: [{ claveProdServ: "01010101", descripcion: "Servicio demo", cantidad: 1, valorUnitario: subtotal }],
    });
    cfdisRows.push({
      despacho_id, cliente_id, rfc_id, uuid: g.uuid, tipo_cfdi: "I", version: "4.0",
      rfc_emisor: perfil.rfc, nombre_emisor: perfil.razon,
      rfc_receptor: "XAXX010101000", nombre_receptor: "PUBLICO EN GENERAL",
      fecha: fecha.toISOString(), fecha_timbrado: fecha.toISOString(),
      metodo_pago: rng() > 0.7 ? "PPD" : "PUE", forma_pago: "03", uso_cfdi: "G03", moneda: "MXN",
      subtotal: g.subtotal, iva_trasladado: g.iva, total: g.total,
      archivo_hash: g.hash,
      estatus_sat: perfil.idx === 5 && rng() < 0.23 ? "Cancelado" : "Vigente",
    });
    cfdiByIndex.push({ uuid: g.uuid, total: g.total, tipo: "I", fecha, emisor: perfil.rfc });
  }

  // 6) CFDIs recibidos
  for (let i = 0; i < perfil.cfdi_recibidos; i++) {
    const fecha = new Date(now.getFullYear(), now.getMonth() - Math.floor(i / 6), 2 + (i % 27));
    const subtotal = +(800 + rng() * 8000).toFixed(2);
    // En perfil 4: 3 CFDI EFOS presunto; perfil 5: 7 CFDI EFOS definitivo
    let rfcProv = `DEMPRV${String(i).padStart(3, "0")}AA1`;
    let nomProv = `Proveedor Demo ${i + 1}`;
    if (perfil.idx === 4 && i < 3) { rfcProv = EFOS_DEMO_RFCS.presunto; nomProv = "Proveedor Presunto EFOS Demo"; }
    if (perfil.idx === 5 && i < 7) { rfcProv = EFOS_DEMO_RFCS.definitivo; nomProv = "Proveedor EFOS DEFINITIVO Demo"; }
    const g = await generateDemoCfdi({
      serie: "B", folio: 500 + i, fecha, tipoComprobante: "I",
      rfcEmisor: rfcProv, nombreEmisor: nomProv, regimenEmisor: "601",
      rfcReceptor: perfil.rfc, nombreReceptor: perfil.razon, regimenReceptor: perfil.regimen,
      usoCFDI: "G03", metodoPago: "PUE", formaPago: rng() > 0.5 ? "03" : "01",
      subtotal,
      conceptos: [{ claveProdServ: "01010101", descripcion: "Compra demo", cantidad: 1, valorUnitario: subtotal }],
    });
    cfdisRows.push({
      despacho_id, cliente_id, rfc_id, uuid: g.uuid, tipo_cfdi: "I", version: "4.0",
      rfc_emisor: rfcProv, nombre_emisor: nomProv,
      rfc_receptor: perfil.rfc, nombre_receptor: perfil.razon,
      fecha: fecha.toISOString(), fecha_timbrado: fecha.toISOString(),
      metodo_pago: "PUE", forma_pago: rng() > 0.5 ? "03" : "01", uso_cfdi: "G03", moneda: "MXN",
      subtotal: g.subtotal, iva_trasladado: g.iva, total: g.total,
      archivo_hash: g.hash,
      estatus_sat: "Vigente",
    });
    cfdiByIndex.push({ uuid: g.uuid, total: g.total, tipo: "I", fecha, emisor: rfcProv });
  }

  const { data: cfdisInserted, error: xErr } = await supabase.from("cfdi_xml").insert(cfdisRows).select("id, uuid, total, rfc_emisor, fecha");
  if (xErr || !cfdisInserted) throw new Error(`CFDI ${perfil.rfc}: ${xErr?.message}`);

  // 7) Conceptos (1 por CFDI)
  await supabase.from("cfdi_conceptos").insert(
    cfdisInserted.map((c) => ({
      cfdi_id: c.id, descripcion: "Servicio / Producto demo",
      cantidad: 1, valor_unitario: c.total, importe: c.total, clave_prod_serv: "01010101",
    }))
  );

  // 8) Pólizas (1 por CFDI emitido + 1 por recibido)
  for (const c of cfdisInserted) {
    const esEmisor = c.rfc_emisor === perfil.rfc;
    polizasRows.push({
      despacho_id, cliente_id, cfdi_id: c.id, uuid_cfdi: c.uuid,
      tipo: esEmisor ? "ingreso" : "egreso",
      fecha: new Date(c.fecha as string).toISOString().slice(0, 10),
      concepto: esEmisor ? "Venta a público" : "Compra a proveedor",
      monto: Number(c.total),
      cuenta: esEmisor ? "4000" : "5000", origen: "auto_sat", estado: "confirmada",
      created_by: userId, metadata: { demo: true },
    });
  }
  await supabase.from("polizas").insert(polizasRows);

  // 9) Movimientos bancarios
  const movsRows: any[] = [];
  const matchCount = Math.floor(cfdisInserted.length * perfil.conciliacion_pct);
  for (let i = 0; i < cfdisInserted.length; i++) {
    const c = cfdisInserted[i];
    const esEmisor = c.rfc_emisor === perfil.rfc;
    movsRows.push({
      despacho_id, cliente_id, cuenta_id,
      fecha: new Date(c.fecha as string).toISOString().slice(0, 10),
      descripcion: esEmisor ? `SPEI recibido ref ${1000 + i}` : `Pago a proveedor ${c.rfc_emisor}`,
      abono: esEmisor ? Number(c.total) : 0, cargo: esEmisor ? 0 : Number(c.total),
      hash: `demo-mov-${perfil.rfc}-${i}-${c.uuid.slice(0, 8)}`,
    });
  }
  // Huérfanos extra para perfiles 3, 4, 5
  const orphans = perfil.idx === 1 ? 0 : perfil.idx === 2 ? 2 : perfil.idx === 3 ? 8 : perfil.idx === 4 ? 15 : 25;
  for (let i = 0; i < orphans; i++) {
    movsRows.push({
      despacho_id, cliente_id, cuenta_id,
      fecha: new Date(now.getFullYear(), now.getMonth(), 1 + (i % 28)).toISOString().slice(0, 10),
      descripcion: `Depósito sin identificar ${i + 1}`,
      abono: +(1000 + rng() * 9000).toFixed(2), cargo: 0,
      hash: `demo-mov-${perfil.rfc}-orphan-${i}`,
    });
  }
  const { data: movsInserted } = await supabase.from("movimientos_bancarios").insert(movsRows).select("id, abono, fecha");

  // 10) Conciliaciones (matchCount primeros)
  const concs: any[] = [];
  for (let i = 0; i < matchCount && i < (movsInserted?.length ?? 0); i++) {
    const c = cfdisInserted[i];
    concs.push({
      despacho_id, cliente_id, cfdi_id: c.id, movimiento_id: movsInserted![i].id,
      tipo_match: "exacto", diferencia: 0, probabilidad: 0.99, estatus: "confirmado",
    });
  }
  if (concs.length > 0) await supabase.from("conciliaciones").insert(concs);

  // 11) Alertas
  if (perfil.alertas.length > 0) {
    await supabase.from("alertas").insert(perfil.alertas.map((a) => ({
      despacho_id, cliente_id, rfc_id,
      nivel: a.nivel, tipo: a.tipo, titulo: a.titulo, descripcion: a.descripcion,
      recomendacion: "Revisar y atender según prioridad.", estatus: "abierta",
    })));
  }

  // 12) Tareas
  if (perfil.tareas.length > 0) {
    await supabase.from("tareas").insert(perfil.tareas.map((t) => ({
      despacho_id, cliente_id, titulo: t.titulo,
      estatus: t.estatus, kanban_estado: t.estatus, prioridad: t.prioridad,
      origen: "demo", created_by: userId,
    })));
  }

  // 13) Salud fiscal snapshot
  const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  await supabase.from("salud_fiscal_snapshots").insert({
    despacho_id, cliente_id, periodo,
    score: perfil.score_salud, semaforo: perfil.semaforo,
    subscores: {
      cfdi: Math.min(100, perfil.score_salud + 5),
      conciliacion: Math.round(perfil.conciliacion_pct * 100),
      obligaciones: perfil.score_salud,
      riesgo: perfil.idx >= 4 ? 30 : 90,
    },
    alertas: perfil.alertas,
    hallazgos: perfil.hallazgos,
    recomendaciones: perfil.alertas.map((a) => ({ titulo: a.titulo, accion: "Atender de inmediato" })),
    comparativo: { periodo_anterior_score: perfil.score_salud - 5 },
    ai_resumen: perfil.resumen_ejecutivo.slice(0, 500),
    computed_by: userId,
  });

  // 14) Semáforo fiscal
  await supabase.from("semaforo_fiscal").insert({
    despacho_id, rfc_id, periodo: now.toISOString().slice(0, 10),
    color: perfil.semaforo, motivos: perfil.hallazgos.map((h) => h.titulo),
  });

  // 15) Reporte ejecutivo precargado
  await supabase.from("reportes_ejecutivos").insert({
    despacho_id, cliente_id, periodo, tipo: "mensual", estado: "publicado",
    resumen_financiero: { ingresos: cfdisInserted.filter((c) => c.rfc_emisor === perfil.rfc).reduce((s, c) => s + Number(c.total), 0) },
    resumen_fiscal: { score: perfil.score_salud },
    salud: { score: perfil.score_salud, semaforo: perfil.semaforo },
    conciliacion: { pct_match: perfil.conciliacion_pct },
    obligaciones: {},
    riesgos: { nivel: perfil.idx <= 2 ? "bajo" : perfil.idx === 3 ? "medio" : "alto" },
    hallazgos: perfil.hallazgos,
    oportunidades: [],
    resumen_ejecutivo: perfil.resumen_ejecutivo,
    ahorro_estimado_centavos: perfil.idx <= 2 ? 0 : 50000 * perfil.idx,
    created_by: userId,
  });

  // 16) Recomendaciones IA
  if (perfil.hallazgos.length > 0) {
    await supabase.from("recomendaciones_ia").insert(perfil.hallazgos.slice(0, 4).map((h) => ({
      despacho_id, cliente_id, categoria: "fiscal", titulo: h.titulo,
      descripcion: `Hallazgo de gravedad ${h.gravedad} detectado durante el análisis demo.`,
      accion_sugerida: "Revisar evidencia y aplicar plan de acción.",
      prioridad: h.gravedad === "alta" ? "alta" : h.gravedad === "media" ? "media" : "baja",
      estado: "pendiente",
    })));
  }

  // 17) Mensajes
  await supabase.from("mensajes").insert([
    {
      despacho_id, cliente_id, canal: "whatsapp", destinatario: perfil.telefono,
      cuerpo: perfil.idx <= 2
        ? `Hola, tu reporte mensual está listo y todo está en orden. ¡Excelente trabajo!`
        : `Hola, detectamos ${perfil.alertas.length} situaciones que requieren tu atención. Te enviamos el detalle por correo.`,
      plantilla_key: "reporte_listo", estatus: "enviado", enviado_at: new Date().toISOString(),
    },
    {
      despacho_id, cliente_id, canal: "email", destinatario: perfil.email,
      asunto: `Reporte fiscal ${periodo} — ${perfil.razon}`,
      cuerpo: perfil.resumen_ejecutivo.slice(0, 400),
      plantilla_key: "reporte_mensual", estatus: "enviado", enviado_at: new Date().toISOString(),
    },
  ]);

  // 18) Obligaciones
  const venc = new Date(now.getFullYear(), now.getMonth(), 17).toISOString().slice(0, 10);
  await supabase.from("obligaciones_fiscales").insert([
    {
      despacho_id, rfc_id, clave: "IVA_MENSUAL", periodicidad: "mensual",
      proximo_vencimiento: venc,
      estatus: perfil.idx >= 3 ? "pendiente" : "cumplida", nombre: "IVA Mensual",
    },
    {
      despacho_id, rfc_id, clave: perfil.regimen === "626" ? "ISR_RESICO" : "ISR_MENSUAL", periodicidad: "mensual",
      proximo_vencimiento: venc,
      estatus: perfil.idx >= 4 ? "omisa" : perfil.idx >= 3 ? "pendiente" : "cumplida", nombre: "ISR Mensual",
    },
    {
      despacho_id, rfc_id, clave: "DIOT", periodicidad: "mensual",
      proximo_vencimiento: venc,
      estatus: perfil.idx >= 4 ? "omisa" : "cumplida", nombre: "DIOT",
    },
  ]);

  // 19) CxC / CxP
  const cxcRows = [], cxpRows = [];
  for (let i = 0; i < 3 + perfil.idx; i++) {
    cxcRows.push({
      despacho_id, cliente_id,
      contraparte: `Cliente Demo ${i + 1}`, concepto: "Servicios pendientes de cobro",
      monto: +(5000 + rng() * 25000).toFixed(2),
      fecha_emision: new Date(now.getFullYear(), now.getMonth() - 1, 1 + i).toISOString().slice(0, 10),
      fecha_vencimiento: new Date(now.getFullYear(), now.getMonth(), 15 + i).toISOString().slice(0, 10),
      estado: "pendiente",
      created_by: userId,
    });
    cxpRows.push({
      despacho_id, cliente_id,
      contraparte: `Proveedor Demo ${i + 1}`, concepto: "Pendiente de pago",
      monto: +(2000 + rng() * 15000).toFixed(2),
      fecha_emision: new Date(now.getFullYear(), now.getMonth() - 1, 5 + i).toISOString().slice(0, 10),
      fecha_vencimiento: new Date(now.getFullYear(), now.getMonth(), 20 + i).toISOString().slice(0, 10),
      estado: "pendiente", created_by: userId,
    });
  }
  await supabase.from("cxc").insert(cxcRows);
  await supabase.from("cxp").insert(cxpRows);

  // 20) Defensas
  if (perfil.defensas.length > 0) {
    await supabase.from("defensas").insert(perfil.defensas.map((d) => ({
      user_id: userId, despacho_id, cliente_id,
      nombre: d.nombre, conflicto: d.conflicto, potencial: d.potencial,
      estrategia: "Plan de defensa preventiva con sustento documental y materialidad.",
      exito: perfil.idx === 4 ? 65 : 45, estatus: "activa",
    })));
  }

  // 21) Trámites
  if (perfil.tramites.length > 0) {
    await supabase.from("tramites").insert(perfil.tramites.map((t, i) => ({
      despacho_id, cliente_id, titulo: t.titulo, autoridad: t.autoridad,
      estado: t.estado, orden: i, created_by: userId,
    })));
  }

  // 22) SAT Sync runs (histórico simulado)
  for (let i = 0; i < 3; i++) {
    const iniciado = new Date(now.getFullYear(), now.getMonth() - i, 5, 8, 0, 0);
    const finalizado = new Date(iniciado.getTime() + 45000);
    await supabase.from("sat_sync_runs").insert({
      despacho_id, cliente_id,
      iniciado_at: iniciado.toISOString(), finalizado_at: finalizado.toISOString(),
      duracion_ms: 45000, origen: "cron", tipo: "ambos",
      estatus: i === 0 && perfil.idx >= 4 ? "error" : "exitoso",
      descargados: perfil.cfdi_emitidos + perfil.cfdi_recibidos,
      nuevos: i === 0 ? perfil.cfdi_emitidos + perfil.cfdi_recibidos : 0,
      cancelados: 0, duplicados: 0,
      detalle: "Descarga demo simulada",
    });
  }

  // 23) Conciliación integral run + score histórico
  const { data: ciRun } = await supabase.from("conciliacion_integral_runs").insert({
    cliente_id, despacho_id,
    desde: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10),
    hasta: now.toISOString().slice(0, 10),
    score_consistencia: Math.round(perfil.conciliacion_pct * 100),
    kpis: { cfdi_total: cfdisInserted.length, mov_total: movsInserted?.length ?? 0, match_pct: perfil.conciliacion_pct },
    total_incidencias: perfil.hallazgos.length,
    criticas: perfil.hallazgos.filter((h) => h.gravedad === "alta").length,
    medias: perfil.hallazgos.filter((h) => h.gravedad === "media").length,
    bajas: perfil.hallazgos.filter((h) => h.gravedad === "baja").length,
    monto_observado: perfil.idx === 5 ? 2600000 : perfil.idx === 4 ? 180000 : 0,
  }).select("id").single();

  for (let i = 0; i < 3; i++) {
    await supabase.from("conciliacion_score_historico").insert({
      cliente_id, despacho_id, run_id: ciRun?.id ?? null,
      score: Math.max(10, Math.round(perfil.conciliacion_pct * 100) - i * 5),
      criticas: perfil.hallazgos.filter((h) => h.gravedad === "alta").length,
      medias: perfil.hallazgos.filter((h) => h.gravedad === "media").length,
      bajas: perfil.hallazgos.filter((h) => h.gravedad === "baja").length,
      monto_observado: perfil.idx >= 4 ? 100000 * (3 - i) : 0,
    });
  }
}

export const seedDemoShowroom = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespacho(supabase, userId);

    const { data: existing } = await supabase
      .from("clientes").select("id").eq("despacho_id", despacho_id).like("notas", `%${DEMO_TAG}%`).limit(1);
    if (existing && existing.length > 0) {
      return { ok: true, alreadySeeded: true, clientes: 0 };
    }

    for (const perfil of PERFILES_DEMO) {
      await seedOneCliente(supabase as SupabaseClient, despacho_id, userId, perfil);
    }
    return { ok: true, alreadySeeded: false, clientes: PERFILES_DEMO.length };
  });

export const clearDemoShowroom = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespacho(supabase, userId);

    const { data: demoClientes } = await supabase
      .from("clientes").select("id").eq("despacho_id", despacho_id).like("notas", `%${DEMO_TAG}%`);
    const ids = (demoClientes ?? []).map((c) => c.id as string);
    if (ids.length === 0) return { ok: true, removed: 0 };

    const { data: cfs } = await supabase.from("cfdi_xml").select("id").in("cliente_id", ids);
    const cfIds = (cfs ?? []).map((x) => x.id as string);
    if (cfIds.length > 0) {
      await supabase.from("cfdi_conceptos").delete().in("cfdi_id", cfIds);
      await supabase.from("cfdi_relaciones").delete().in("cfdi_id", cfIds);
    }
    const { data: rfcsData } = await supabase.from("rfcs").select("id").in("cliente_id", ids);
    const rfcIds = (rfcsData ?? []).map((r) => r.id as string);

    // Borrar en orden inverso de dependencias
    await supabase.from("conciliacion_incidencias").delete().in("cliente_id", ids);
    await supabase.from("conciliacion_score_historico").delete().in("cliente_id", ids);
    await supabase.from("conciliacion_integral_runs").delete().in("cliente_id", ids);
    await supabase.from("conciliaciones").delete().in("cliente_id", ids);
    await supabase.from("polizas").delete().in("cliente_id", ids);
    await supabase.from("movimientos_bancarios").delete().in("cliente_id", ids);
    await supabase.from("cuentas_bancarias").delete().in("cliente_id", ids);
    await supabase.from("catalogo_cuentas").delete().in("cliente_id", ids);
    await supabase.from("cfdi_xml").delete().in("cliente_id", ids);
    await supabase.from("alertas").delete().in("cliente_id", ids);
    await supabase.from("mensajes").delete().in("cliente_id", ids);
    await supabase.from("reportes").delete().in("cliente_id", ids);
    await supabase.from("reportes_ejecutivos").delete().in("cliente_id", ids);
    await supabase.from("recomendaciones_ia").delete().in("cliente_id", ids);
    await supabase.from("salud_fiscal_snapshots").delete().in("cliente_id", ids);
    await supabase.from("tareas").delete().in("cliente_id", ids);
    await supabase.from("defensas").delete().in("cliente_id", ids);
    await supabase.from("tramites").delete().in("cliente_id", ids);
    await supabase.from("cxc").delete().in("cliente_id", ids);
    await supabase.from("cxp").delete().in("cliente_id", ids);
    await supabase.from("sat_sync_eventos").delete().in("cliente_id", ids);
    await supabase.from("sat_sync_runs").delete().in("cliente_id", ids);
    if (rfcIds.length > 0) {
      await supabase.from("semaforo_fiscal").delete().in("rfc_id", rfcIds);
      await supabase.from("obligaciones_fiscales").delete().in("rfc_id", rfcIds);
    }
    await supabase.from("rfcs").delete().in("cliente_id", ids);
    await supabase.from("clientes").delete().in("id", ids);

    return { ok: true, removed: ids.length };
  });
