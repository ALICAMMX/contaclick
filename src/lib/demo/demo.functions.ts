import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEMO_TAG = "__DEMO__";

async function getDespacho(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: m } = await supabase
    .from("user_memberships")
    .select("despacho_id")
    .eq("user_id", userId)
    .eq("estado", "activo")
    .limit(1)
    .maybeSingle();
  if (m?.despacho_id) return m.despacho_id as string;
  const { data: o } = await supabase
    .from("despachos").select("id").eq("owner_user_id", userId).limit(1).maybeSingle();
  if (o?.id) return o.id as string;
  throw new Error("No tienes un despacho activo. Configura tu despacho primero.");
}

function rid() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export const seedDemo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespacho(supabase, userId);

    // Avoid duplicate seeding
    const { data: existing } = await supabase
      .from("clientes").select("id").eq("despacho_id", despacho_id).like("notas", `%${DEMO_TAG}%`).limit(1);
    if (existing && existing.length > 0) {
      return { ok: true, alreadySeeded: true };
    }

    // ---- Clientes ----
    const clientesPayload = [
      {
        user_id: userId, despacho_id,
        rfc: "PME920101AB1",
        razon_social: "Panadería La Mexicana SA de CV",
        regimen_fiscal: "601 - General de Ley Personas Morales",
        email: "contacto@panaderialamexicana.demo",
        telefono: "5551234567",
        notas: `${DEMO_TAG} Cliente de ejemplo (PM, Régimen General).`,
        semaforo: "amarillo",
        estado_mes: "Pendiente declaración mensual",
      },
      {
        user_id: userId, despacho_id,
        rfc: "GORA850515HM4",
        razon_social: "Ana García Rodríguez",
        regimen_fiscal: "626 - RESICO Personas Físicas",
        email: "ana.garcia@correo.demo",
        telefono: "5559876543",
        notas: `${DEMO_TAG} Cliente de ejemplo (PF, RESICO).`,
        semaforo: "verde",
        estado_mes: "Al corriente",
      },
    ];
    const { data: clientes, error: cErr } = await supabase
      .from("clientes").insert(clientesPayload).select("id, rfc, razon_social, regimen_fiscal");
    if (cErr || !clientes) throw new Error(`Clientes: ${cErr?.message}`);

    // ---- RFCs ----
    const rfcsPayload = clientes.map((c) => ({
      despacho_id, cliente_id: c.id, rfc: c.rfc,
      tipo_persona: c.rfc.length === 12 ? "moral" : "fisica",
      regimen_fiscal: c.regimen_fiscal,
    }));
    const { data: rfcs, error: rErr } = await supabase.from("rfcs").insert(rfcsPayload).select("id, cliente_id, rfc");
    if (rErr || !rfcs) throw new Error(`RFCs: ${rErr?.message}`);

    const rfcByCli = Object.fromEntries(rfcs.map((r) => [r.cliente_id, r]));

    // ---- CFDIs (4 emitidos + 2 recibidos por cliente) ----
    const now = new Date();
    const cfdiRows: any[] = [];
    for (const c of clientes) {
      const rfcRow = rfcByCli[c.id];
      // Emitidos (Ingreso)
      for (let i = 0; i < 4; i++) {
        const fecha = new Date(now.getFullYear(), now.getMonth(), 5 + i * 5);
        const sub = 5000 + i * 1500;
        const iva = +(sub * 0.16).toFixed(2);
        cfdiRows.push({
          despacho_id, cliente_id: c.id, rfc_id: rfcRow.id,
          uuid: `${rid()}-${rid()}-${rid()}-${rid()}-${rid()}`,
          tipo_cfdi: "I", version: "4.0",
          rfc_emisor: c.rfc, nombre_emisor: c.razon_social,
          rfc_receptor: "XAXX010101000", nombre_receptor: "PUBLICO EN GENERAL",
          fecha: fecha.toISOString(), fecha_timbrado: fecha.toISOString(),
          metodo_pago: "PUE", forma_pago: "03", uso_cfdi: "G03", moneda: "MXN",
          subtotal: sub, iva_trasladado: iva, total: sub + iva,
          archivo_hash: `demo-${c.rfc}-emi-${i}-${rid()}`,
          estatus_sat: "Vigente",
        });
      }
      // Recibidos (Egreso/gasto)
      for (let i = 0; i < 2; i++) {
        const fecha = new Date(now.getFullYear(), now.getMonth(), 8 + i * 7);
        const sub = 1200 + i * 800;
        const iva = +(sub * 0.16).toFixed(2);
        cfdiRows.push({
          despacho_id, cliente_id: c.id, rfc_id: rfcRow.id,
          uuid: `${rid()}-${rid()}-${rid()}-${rid()}-${rid()}`,
          tipo_cfdi: "I", version: "4.0",
          rfc_emisor: "PROV010203AB1", nombre_emisor: `Proveedor Demo ${i + 1}`,
          rfc_receptor: c.rfc, nombre_receptor: c.razon_social,
          fecha: fecha.toISOString(), fecha_timbrado: fecha.toISOString(),
          metodo_pago: "PUE", forma_pago: "03", uso_cfdi: "G03", moneda: "MXN",
          subtotal: sub, iva_trasladado: iva, total: sub + iva,
          archivo_hash: `demo-${c.rfc}-rec-${i}-${rid()}`,
          estatus_sat: "Vigente",
        });
      }
    }
    const { data: cfdis, error: xErr } = await supabase.from("cfdi_xml").insert(cfdiRows).select("id, cliente_id, total, tipo_cfdi, rfc_emisor, fecha");
    if (xErr || !cfdis) throw new Error(`CFDI: ${xErr?.message}`);

    // ---- Conceptos (1 por CFDI) ----
    const conceptos = cfdis.map((c) => ({
      cfdi_id: c.id, descripcion: "Servicio / Producto demo",
      cantidad: 1, valor_unitario: c.total, importe: c.total, clave_prod_serv: "01010101",
    }));
    await supabase.from("cfdi_conceptos").insert(conceptos);

    // ---- Cuenta bancaria + movimientos por cliente ----
    for (const c of clientes) {
      const { data: cta } = await supabase.from("cuentas_bancarias").insert({
        despacho_id, cliente_id: c.id, banco: "BBVA Demo", alias: "Cuenta operativa",
        numero_cuenta_mask: "**** 0123", moneda: "MXN",
      }).select("id").single();

      const cfClient = cfdis.filter((x) => x.cliente_id === c.id && x.rfc_emisor === c.rfc);
      const movs = cfClient.map((x, i) => ({
        despacho_id, cliente_id: c.id, cuenta_id: cta!.id,
        fecha: new Date(x.fecha as string).toISOString().slice(0, 10),
        descripcion: `SPEI recibido fact #${i + 1}`,
        abono: x.total, cargo: 0,
        hash: `demo-mov-${c.rfc}-${i}-${rid()}`,
      }));
      // Un movimiento sin CFDI (huérfano para conciliar)
      movs.push({
        despacho_id, cliente_id: c.id, cuenta_id: cta!.id,
        fecha: new Date().toISOString().slice(0, 10),
        descripcion: "Depósito sin identificar",
        abono: 3500, cargo: 0,
        hash: `demo-mov-${c.rfc}-orphan-${rid()}`,
      });
      const { data: insMovs } = await supabase.from("movimientos_bancarios").insert(movs).select("id, abono, fecha");

      // ---- Conciliaciones (match exacto los primeros 2) ----
      const concs = (insMovs ?? []).slice(0, 2).map((m, i) => ({
        despacho_id, cliente_id: c.id,
        cfdi_id: cfClient[i]?.id ?? null,
        movimiento_id: m.id,
        tipo_match: "exacto",
        diferencia: 0,
        probabilidad: 0.99,
        estatus: "propuesto",
      }));
      if (concs.length > 0) await supabase.from("conciliaciones").insert(concs);
    }

    // ---- Alertas ----
    await supabase.from("alertas").insert([
      {
        despacho_id, cliente_id: clientes[0].id, rfc_id: rfcByCli[clientes[0].id].id,
        nivel: "alto", tipo: "obligacion_vencida",
        titulo: "Declaración mensual pendiente",
        descripcion: "El RFC tiene declaración de IVA del mes anterior sin presentar.",
        recomendacion: "Presentar declaración antes del día 17.",
        accion_sugerida: "Generar reporte ISR/IVA",
      },
      {
        despacho_id, cliente_id: clientes[1].id, rfc_id: rfcByCli[clientes[1].id].id,
        nivel: "medio", tipo: "cfdi_revision",
        titulo: "CFDI con forma de pago genérica",
        descripcion: "Se detectaron CFDI con forma de pago 03 sin folio bancario.",
        recomendacion: "Solicitar al cliente comprobante de pago.",
      },
    ]);

    // ---- Mensajes ----
    await supabase.from("mensajes").insert([
      {
        despacho_id, cliente_id: clientes[0].id, canal: "whatsapp",
        destinatario: "+525551234567",
        cuerpo: "Hola, te recordamos enviar tu información del mes para preparar tu declaración. ¡Gracias!",
        plantilla_key: "recordatorio_mensual",
        estatus: "enviado",
        enviado_at: new Date().toISOString(),
      },
      {
        despacho_id, cliente_id: clientes[1].id, canal: "email",
        destinatario: "ana.garcia@correo.demo",
        asunto: "Reporte mensual listo",
        cuerpo: "Adjuntamos el resumen de tu actividad fiscal del mes.",
        plantilla_key: "reporte_listo",
        estatus: "pendiente",
      },
    ]);

    // ---- Reporte ----
    await supabase.from("reportes").insert({
      despacho_id, cliente_id: clientes[0].id, tipo: "ingresos_egresos",
      parametros: { periodo: "mes_actual" },
      resultado: { ingresos: 26000, egresos: 4000, utilidad: 22000, demo: true },
      generado_por: userId,
    });

    // ---- Obligaciones ----
    await supabase.from("obligaciones_fiscales").insert([
      {
        despacho_id, rfc_id: rfcByCli[clientes[0].id].id,
        clave: "IVA_MENSUAL", periodicidad: "mensual",
        proximo_vencimiento: new Date(now.getFullYear(), now.getMonth(), 17).toISOString().slice(0, 10),
        estatus: "pendiente",
      },
      {
        despacho_id, rfc_id: rfcByCli[clientes[1].id].id,
        clave: "ISR_RESICO", periodicidad: "mensual",
        proximo_vencimiento: new Date(now.getFullYear(), now.getMonth(), 17).toISOString().slice(0, 10),
        estatus: "pendiente",
      },
    ]);

    return { ok: true, alreadySeeded: false, clientes: clientes.length };
  });

export const clearDemo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespacho(supabase, userId);

    const { data: demoClientes } = await supabase
      .from("clientes").select("id").eq("despacho_id", despacho_id).like("notas", `%${DEMO_TAG}%`);
    const ids = (demoClientes ?? []).map((c) => c.id as string);
    if (ids.length === 0) return { ok: true, removed: 0 };

    // Get cfdi ids for cleaning conceptos (FK-less)
    const { data: cfs } = await supabase.from("cfdi_xml").select("id").in("cliente_id", ids);
    const cfIds = (cfs ?? []).map((x) => x.id as string);
    if (cfIds.length > 0) {
      await supabase.from("cfdi_conceptos").delete().in("cfdi_id", cfIds);
      await supabase.from("cfdi_relaciones").delete().in("cfdi_id", cfIds);
    }

    await supabase.from("conciliaciones").delete().in("cliente_id", ids);
    await supabase.from("movimientos_bancarios").delete().in("cliente_id", ids);
    await supabase.from("cuentas_bancarias").delete().in("cliente_id", ids);
    await supabase.from("cfdi_xml").delete().in("cliente_id", ids);
    await supabase.from("alertas").delete().in("cliente_id", ids);
    await supabase.from("mensajes").delete().in("cliente_id", ids);
    await supabase.from("reportes").delete().in("cliente_id", ids);
    await supabase.from("rfcs").delete().in("cliente_id", ids);
    await supabase.from("clientes").delete().in("id", ids);

    return { ok: true, removed: ids.length };
  });
