import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { aiFetch, aiApiKey } from "@/lib/ai/gateway";

export type PlantillaKey =
  | "recordatorio_impuestos"
  | "aviso_diferencias"
  | "solicitud_documentos"
  | "resumen_ejecutivo"
  | "saludo_general";

const PLANTILLAS: Record<PlantillaKey, { titulo: string; cuerpo: (v: Record<string, string>) => string }> = {
  recordatorio_impuestos: {
    titulo: "Recordatorio: declaración mensual",
    cuerpo: (v) =>
      `Hola ${v.cliente ?? ""} 👋\n\nTe recuerdo que el próximo *${v.fecha ?? "17 del mes"}* vence tu declaración mensual de ISR e IVA.\n\nPara avanzar necesito:\n• Estados de cuenta del periodo\n• XML emitidos y recibidos\n\n¿Te puedo ayudar a recopilarlos hoy?\n\n— ContaClick IA`,
  },
  aviso_diferencias: {
    titulo: "Diferencias detectadas",
    cuerpo: (v) =>
      `Hola ${v.cliente ?? ""} 👋\n\nDetecté *${v.cantidad ?? "algunas"}* diferencias entre tus estados de cuenta y CFDIs del periodo *${v.periodo ?? ""}*.\n\nMonto involucrado: *${v.monto ?? ""}*.\n\nMe gustaría revisarlas contigo esta semana para evitar contingencias con el SAT. ¿Cuándo te queda?`,
  },
  solicitud_documentos: {
    titulo: "Documentos pendientes",
    cuerpo: (v) =>
      `Hola ${v.cliente ?? ""} 👋\n\nPara cerrar el mes me falta lo siguiente:\n${v.documentos ?? "• Estados de cuenta\n• XMLs faltantes\n• Constancias de retención"}\n\n¿Me los puedes enviar antes del *${v.fecha ?? "viernes"}*? Gracias!`,
  },
  resumen_ejecutivo: {
    titulo: "Resumen del mes",
    cuerpo: (v) =>
      `Hola ${v.cliente ?? ""} 👋\n\nEste fue el resumen de tu operación en *${v.periodo ?? ""}*:\n\n• Ingresos: ${v.ingresos ?? "—"}\n• Egresos: ${v.egresos ?? "—"}\n• Utilidad: ${v.utilidad ?? "—"}\n\n${v.nota ?? "Te envío el reporte completo en PDF."}`,
  },
  saludo_general: {
    titulo: "Saludo",
    cuerpo: (v) => `Hola ${v.cliente ?? ""} 👋\n\n${v.mensaje ?? ""}`,
  },
};

export const renderPlantilla = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      plantilla_key: z.string(),
      variables: z.record(z.string(), z.string()).default({}),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const tpl = PLANTILLAS[data.plantilla_key as PlantillaKey];
    if (!tpl) return { titulo: "Mensaje", cuerpo: data.variables.mensaje ?? "" };
    return { titulo: tpl.titulo, cuerpo: tpl.cuerpo(data.variables) };
  });

// ---- AI redaction ----
export const redactarMensajeAI = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      contexto: z.string().min(1).max(2000),
      tono: z.enum(["formal", "cercano", "directo"]).default("cercano"),
      canal: z.enum(["whatsapp", "email"]).default("whatsapp"),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = aiApiKey();
    if (!apiKey) return { error: "IA no configurada", content: "" };

    const guia = data.canal === "whatsapp"
      ? "Mensaje de WhatsApp profesional, máximo 6 líneas, usa *negritas* con asteriscos para WhatsApp, evita formalismos largos. Termina con una pregunta o llamado a acción claro."
      : "Correo profesional con saludo, cuerpo en 2-3 párrafos cortos y despedida. Sin markdown.";

    const prompt = `Redacta un mensaje en tono ${data.tono} para enviar a un cliente.\n\n${guia}\n\nContexto:\n${data.contexto}\n\nResponde solo con el mensaje listo para enviar, en español de México.`;

    try {
      const res = await aiFetch("chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Eres ContaClick IA, asistente de comunicación para despachos contables mexicanos. Escribes mensajes claros, profesionales y breves." },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (res.status === 429) return { error: "Demasiadas solicitudes.", content: "" };
      if (res.status === 402) return { error: "Sin créditos de IA.", content: "" };
      if (!res.ok) return { error: "Error del servicio de IA.", content: "" };
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { error: null as string | null, content: json.choices?.[0]?.message?.content ?? "" };
    } catch (e) {
      console.error("redactarMensajeAI", e);
      return { error: "Error de red.", content: "" };
    }
  });

// ---- Save message and mark as sent (via WhatsApp link) ----
export const saveMensaje = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid().optional(),
      canal: z.enum(["whatsapp", "email", "sms"]).default("whatsapp"),
      destinatario: z.string().max(120).optional(),
      asunto: z.string().max(200).optional(),
      cuerpo: z.string().min(1).max(6000),
      plantilla_key: z.string().optional(),
      variables: z.record(z.string(), z.string()).optional(),
      estatus: z.enum(["pendiente", "enviado", "fallido"]).default("enviado"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let despachoId: string | null = null;
    if (data.cliente_id) {
      const { data: cli } = await supabase.from("clientes").select("despacho_id").eq("id", data.cliente_id).single();
      despachoId = (cli?.despacho_id ?? null) as string | null;
    }
    if (!despachoId) {
      const { data: m } = await supabase.from("user_memberships").select("despacho_id").eq("user_id", userId).limit(1).maybeSingle();
      despachoId = (m?.despacho_id ?? null) as string | null;
    }
    if (!despachoId) throw new Error("No se encontró despacho del usuario.");

    const { data: row, error } = await supabase
      .from("mensajes")
      .insert({
        despacho_id: despachoId,
        cliente_id: data.cliente_id ?? null,
        canal: data.canal,
        destinatario: data.destinatario ?? null,
        asunto: data.asunto ?? null,
        cuerpo: data.cuerpo,
        plantilla_key: data.plantilla_key ?? null,
        variables: (data.variables ?? null) as Record<string, string> | null,
        estatus: data.estatus,
        enviado_at: data.estatus === "enviado" ? new Date().toISOString() : null,
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, created_at: row.created_at as string };
  });

export const listMensajes = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid().optional(), limit: z.number().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("mensajes")
      .select("id, canal, destinatario, asunto, cuerpo, plantilla_key, estatus, enviado_at, created_at, cliente_id")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return {
      mensajes: (rows ?? []).map((r) => ({
        id: r.id as string,
        canal: r.canal as string,
        destinatario: (r.destinatario ?? "") as string,
        asunto: (r.asunto ?? "") as string,
        cuerpo: r.cuerpo as string,
        plantilla_key: (r.plantilla_key ?? "") as string,
        estatus: r.estatus as string,
        enviado_at: (r.enviado_at ?? null) as string | null,
        created_at: r.created_at as string,
        cliente_id: (r.cliente_id ?? null) as string | null,
      })),
    };
  });
