import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

const ORIGENES = ["SAT", "IMSS", "INFONAVIT", "Estatal", "Otro"] as const;

async function getDespachoDelCliente(supabase: any, cliente_id: string | null | undefined): Promise<string> {
  if (!cliente_id) {
    // Sin cliente: tomamos el primer despacho del usuario
    const { data } = await supabase.from("user_memberships").select("despacho_id").eq("estado", "activo").limit(1);
    if (!data || data.length === 0) throw new Error("Sin despacho asignado");
    return data[0].despacho_id;
  }
  const { data, error } = await supabase.from("clientes").select("despacho_id").eq("id", cliente_id).maybeSingle();
  if (error || !data) throw new Error("Cliente no encontrado");
  return data.despacho_id;
}

export const listarBuzon = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid().optional(),
      estado: z.enum(["pendiente", "en_proceso", "respondida", "vencida", "todas"]).default("todas"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("buzon_notificaciones")
      .select("id, origen, asunto, folio, fecha_recibida, plazo_dias, vence_at, resumen, estado, ia_analisis, cliente_id, created_at")
      .order("fecha_recibida", { ascending: false })
      .limit(200);
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    if (data.estado !== "todas") q = q.eq("estado", data.estado);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const RegistrarSchema = z.object({
  cliente_id: z.string().uuid().nullable().optional(),
  origen: z.enum(ORIGENES).default("SAT"),
  asunto: z.string().min(2).max(300),
  folio: z.string().max(80).optional().nullable(),
  fecha_recibida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pdf_base64: z.string().optional(),   // data:application/pdf;base64,...
  pdf_filename: z.string().optional(),
  analizar_ia: z.boolean().default(true),
});

type IAAnalisis = {
  tipo_notificacion?: string;
  plazo_dias?: number;
  fundamento_legal?: string;
  riesgo?: "alto" | "medio" | "bajo";
  resumen?: string;
  acciones_recomendadas?: string[];
  borrador_respuesta?: string;
  error?: string;
};

async function analizarPDFConIA(pdfDataUrl: string, asunto: string, origen: string): Promise<IAAnalisis> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { error: "IA no disponible (LOVABLE_API_KEY ausente)" };

  const systemPrompt = `Eres un litigante fiscal mexicano senior. Analizas notificaciones de ${origen} (SAT, IMSS, INFONAVIT, autoridades estatales). Devuelves SIEMPRE un JSON válido con esta estructura exacta:
{
  "tipo_notificacion": "string corto (ej: 'Invitación a regularizar', 'Requerimiento de obligaciones omitidas', 'Acta parcial de inicio', 'Resolución determinante')",
  "plazo_dias": número entero (días naturales o hábiles que tiene el contribuyente para responder; 0 si no aplica),
  "fundamento_legal": "artículos exactos del CFF/LISR/LIVA/LSS aplicables",
  "riesgo": "alto" | "medio" | "bajo",
  "resumen": "2-3 frases neutrales describiendo qué pide la autoridad",
  "acciones_recomendadas": ["acción 1", "acción 2", "acción 3"],
  "borrador_respuesta": "Texto breve (máx 400 palabras) en formato de escrito formal con encabezado, hechos y peticiones. Si no aplica respuesta, devuelve cadena vacía."
}
NO incluyas texto fuera del JSON. NO uses markdown. NO inventes folios ni datos no presentes.`;

  const userMessage = [
    { type: "text", text: `Asunto del expediente: "${asunto}". Origen: ${origen}. Analiza el PDF adjunto.` },
    { type: "file", file: { filename: "notificacion.pdf", file_data: pdfDataUrl } },
  ];

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { error: `IA error ${res.status}: ${txt.slice(0, 200)}` };
    }
    const j = await res.json() as any;
    const content = j.choices?.[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(content);
      return parsed as IAAnalisis;
    } catch {
      return { error: "IA devolvió formato inválido", resumen: content.slice(0, 500) };
    }
  } catch (e: any) {
    return { error: e?.message ?? "IA falló" };
  }
}

export const registrarNotificacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => RegistrarSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespachoDelCliente(supabase, data.cliente_id ?? undefined);
    const fechaRecibida = data.fecha_recibida ?? new Date().toISOString().slice(0, 10);

    // 1. Analizar IA si hay PDF
    let analisis: IAAnalisis = {};
    if (data.analizar_ia && data.pdf_base64) {
      const pdfDataUrl = data.pdf_base64.startsWith("data:")
        ? data.pdf_base64
        : `data:application/pdf;base64,${data.pdf_base64}`;
      analisis = await analizarPDFConIA(pdfDataUrl, data.asunto, data.origen);
    }

    // 2. Calcular vencimiento (días naturales por defecto)
    const plazo = analisis.plazo_dias && analisis.plazo_dias > 0 ? analisis.plazo_dias : null;
    let vence_at: string | null = null;
    if (plazo) {
      const d = new Date(fechaRecibida + "T00:00:00");
      d.setDate(d.getDate() + plazo);
      vence_at = d.toISOString().slice(0, 10);
    }

    const id = crypto.randomUUID();
    const { error } = await supabase.from("buzon_notificaciones").insert({
      id,
      despacho_id,
      cliente_id: data.cliente_id ?? null,
      origen: data.origen,
      asunto: data.asunto,
      folio: data.folio ?? null,
      fecha_recibida: fechaRecibida,
      plazo_dias: plazo,
      vence_at,
      pdf_base64: data.pdf_base64 ?? null,
      pdf_filename: data.pdf_filename ?? null,
      resumen: analisis.resumen ?? null,
      ia_analisis: analisis as any,
      estado: "pendiente",
      created_by: userId,
    });
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      user_id: userId,
      despacho_id,
      accion: "buzon.registrar",
      entidad: "buzon_notificacion",
      entidad_id: id,
      payload: { origen: data.origen, asunto: data.asunto, con_ia: !!data.pdf_base64 },
    });

    return { id, vence_at, ia_ok: !analisis.error, ia_error: analisis.error };
  });

export const reanalizarNotificacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: n, error } = await context.supabase
      .from("buzon_notificaciones")
      .select("id, asunto, origen, fecha_recibida, pdf_base64, despacho_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !n) throw new Error("Notificación no encontrada");
    if (!n.pdf_base64) throw new Error("No hay PDF para analizar");
    const dataUrl = n.pdf_base64.startsWith("data:") ? n.pdf_base64 : `data:application/pdf;base64,${n.pdf_base64}`;
    const analisis = await analizarPDFConIA(dataUrl, n.asunto, n.origen);
    const plazo = analisis.plazo_dias && analisis.plazo_dias > 0 ? analisis.plazo_dias : null;
    let vence_at: string | null = null;
    if (plazo) {
      const d = new Date(n.fecha_recibida + "T00:00:00");
      d.setDate(d.getDate() + plazo);
      vence_at = d.toISOString().slice(0, 10);
    }
    await context.supabase.from("buzon_notificaciones").update({
      ia_analisis: analisis as any,
      resumen: analisis.resumen ?? null,
      plazo_dias: plazo,
      vence_at,
    }).eq("id", data.id);
    return { ok: !analisis.error, error: analisis.error };
  });

export const cambiarEstadoNotificacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      estado: z.enum(["pendiente", "en_proceso", "respondida", "vencida"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("buzon_notificaciones")
      .update({ estado: data.estado })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const eliminarNotificacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("buzon_notificaciones").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
