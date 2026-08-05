import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";
import { assertWithinLimit, recordIaUsage, UsageLimitError } from "@/lib/usage/limits";
import { checkRateLimit, rateLimitMessage } from "@/lib/security/rate-limit";
import { assertClienteScope } from "@/lib/despacho/scope";
import { normalizarModo, SIN_EXPEDIENTE_MSG, type ContiModo } from "@/lib/conti/modos";
import { aplicarContrato } from "@/lib/conti/contrato";
import { detectarCalculo } from "@/lib/conti/normativa";
import type { NivelEvidencia } from "@/lib/conti/evidencia";

const MsgSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const SendSchema = z.object({
  threadId: z.string().uuid().nullable().optional(),
  messages: z.array(MsgSchema).min(1).max(40),
  modo: z.enum(["guia", "consulta", "expediente"]).default("guia"),
  /** El contexto del expediente NO viaja desde el cliente: sólo su id. */
  clienteId: z.string().uuid().nullable().optional(),
});

function deriveTitle(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return (t.length > 60 ? t.slice(0, 57) + "…" : t) || "Nueva conversación";
}

/** Evidencia declarada por defecto según el modo activo. */
function evidenciaBase(modo: ContiModo): NivelEvidencia {
  if (modo === "expediente") return "plataforma";
  if (modo === "guia") return "plataforma";
  return "general";
}

export const sendBotAyuda = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => SendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    const modoPedido = data.modo as ContiModo;
    if (!apiKey)
      return {
        error: "El asistente no está configurado.",
        content: "",
        threadId: data.threadId ?? null,
        modo: modoPedido,
      };

    const { supabase, userId } = context;
    const t0 = Date.now();

    const rl = await checkRateLimit(supabase, "bot_ayuda", 40, 300);
    if (!rl.allowed)
      return {
        error: rateLimitMessage("bot de ayuda", rl.resetAt),
        content: "",
        threadId: data.threadId ?? null,
        modo: modoPedido,
      };

    let despachoId: string | null = null;
    try {
      despachoId = await resolveActiveDespachoId(supabase, userId);
      await assertWithinLimit(supabase, despachoId, "ia_requests");
    } catch (e) {
      if (e instanceof UsageLimitError)
        return { error: e.message, content: "", threadId: data.threadId ?? null, modo: modoPedido };
    }

    // ── Alcance del expediente: cerrado por defecto ──────────────────────────
    // El texto del expediente se arma en el servidor a partir del alcance
    // validado. Nada que el cliente envíe puede ampliar lo que Conti ve.
    let expedienteTexto: string | null = null;
    let expedienteNombre: string | null = null;
    if (modoPedido === "expediente" && data.clienteId) {
      try {
        const scope = await assertClienteScope(supabase, userId, data.clienteId);
        const { data: cli } = await supabase
          .from("clientes")
          .select("rfc, razon_social, regimen_fiscal, tipo_persona, semaforo")
          .eq("id", scope.cliente_id)
          .maybeSingle();
        expedienteNombre = scope.razon_social ?? scope.rfc;
        expedienteTexto = [
          `Razón social: ${scope.razon_social ?? "—"}`,
          `RFC: ${scope.rfc}`,
          cli?.regimen_fiscal ? `Régimen fiscal: ${cli.regimen_fiscal}` : null,
          cli?.tipo_persona ? `Tipo de persona: ${cli.tipo_persona}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      } catch (e: any) {
        return {
          error: e?.message ?? SIN_EXPEDIENTE_MSG,
          content: "",
          threadId: data.threadId ?? null,
          modo: modoPedido,
        };
      }
    }

    const hayExpediente = Boolean(expedienteTexto);
    const modo = normalizarModo(modoPedido, hayExpediente);

    // Ensure thread exists
    let threadId = data.threadId ?? null;
    const firstUser = [...data.messages].reverse().find((m) => m.role === "user");
    if (!threadId) {
      const title = deriveTitle(firstUser?.content ?? "Nueva conversación");
      const { data: t, error } = await supabase
        .from("bot_ayuda_threads")
        .insert({ user_id: userId, title })
        .select("id")
        .single();
      if (error || !t) {
        console.error("create thread failed", error);
        return { error: "No se pudo crear la conversación.", content: "", threadId: null, modo };
      }
      threadId = t.id as string;
    }

    const model = "google/gemini-3-flash-preview";
    const ultimo = data.messages[data.messages.length - 1];
    const derivacion = detectarCalculo(ultimo?.role === "user" ? ultimo.content : "");

    try {
      const { buildContiPrompt } = await import("./conti/prompt.server");
      const sysMessages: Array<{ role: "system"; content: string }> = [
        {
          role: "system",
          content: buildContiPrompt({ modo, expediente: expedienteTexto, hayExpediente }),
        },
      ];
      if (derivacion.requiere) {
        sysMessages.push({
          role: "system",
          content: derivacion.ruta
            ? `AVISO DEL SISTEMA: la última pregunta pide una cifra fiscal. NO la calcules tú. Explica el procedimiento y deriva a [${derivacion.herramienta}](${derivacion.ruta}), que aplica la tabla vigente y sella el resultado.`
            : `AVISO DEL SISTEMA: la última pregunta pide una cifra fiscal y no hay motor determinista para ese caso. Explica el procedimiento sin producir el número y advierte que debe validarse con un cálculo formal.`,
        });
      }

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [...sysMessages, ...data.messages],
        }),
      });

      if (res.status === 429)
        return { error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", content: "", threadId, modo };
      if (res.status === 402)
        return { error: "Se agotaron los créditos de IA en tu workspace.", content: "", threadId, modo };
      if (!res.ok) {
        const txt = await res.text();
        console.error("AI gateway error", res.status, txt);
        return { error: "Error del servicio de IA.", content: "", threadId, modo };
      }

      const json = (await res.json()) as any;
      const bruto: string = json.choices?.[0]?.message?.content ?? "";
      const usage = json.usage ?? {};

      // Contrato de respuesta: sin porcentajes de confianza, con base declarada.
      const { content, meta } = aplicarContrato(bruto, {
        modo,
        evidencia: derivacion.requiere ? "motor" : evidenciaBase(modo),
        detalleEvidencia: hayExpediente ? `Expediente activo: ${expedienteNombre}` : null,
      });

      // Persist last user msg + assistant reply
      const lastUser = data.messages[data.messages.length - 1];
      const rows: any[] = [];
      if (lastUser?.role === "user") {
        rows.push({ thread_id: threadId, user_id: userId, role: "user", content: lastUser.content });
      }
      if (content) {
        rows.push({ thread_id: threadId, user_id: userId, role: "assistant", content });
      }
      if (rows.length) {
        const { error: insErr } = await supabase.from("bot_ayuda_messages").insert(rows);
        if (insErr) console.error("insert messages failed", insErr);
      }
      await supabase.from("bot_ayuda_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);

      // Telemetría: modo, evidencia y correcciones aplicadas. Sin contenido.
      const { error: telErr } = await supabase.from("conti_telemetria").insert({
        user_id: userId,
        despacho_id: despachoId,
        thread_id: threadId,
        modo,
        con_expediente: hayExpediente,
        evidencia: meta.evidencia,
        saneada: meta.saneada,
        derivo_calculo: derivacion.requiere,
        modelo: model,
        tokens_in: usage.prompt_tokens ?? 0,
        tokens_out: usage.completion_tokens ?? 0,
        latencia_ms: Date.now() - t0,
      });
      if (telErr) console.error("conti telemetria insert failed", telErr);

      if (despachoId) {
        try {
          await recordIaUsage(supabase, despachoId, userId, {
            tool: "bot_ayuda",
            model,
            tokens_in: usage.prompt_tokens ?? 0,
            tokens_out: usage.completion_tokens ?? 0,
          });
        } catch (e) {
          console.error("recordIaUsage failed", e);
        }
      }
      return { error: null as string | null, content, threadId, modo };
    } catch (e) {
      console.error("sendBotAyuda failed", e);
      return { error: "Error de red al consultar la IA.", content: "", threadId, modo };
    }
  });

const FeedbackSchema = z.object({
  threadId: z.string().uuid().nullable().optional(),
  modo: z.enum(["guia", "consulta", "expediente"]),
  util: z.boolean(),
  motivo: z.string().max(120).nullable().optional(),
  comentario: z.string().max(1000).nullable().optional(),
  respuesta: z.string().max(4000).nullable().optional(),
});

/** Retroalimentación por respuesta: es el insumo para corregir a Conti. */
export const registrarFeedbackConti = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => FeedbackSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("conti_feedback").insert({
      user_id: userId,
      thread_id: data.threadId ?? null,
      modo: data.modo,
      util: data.util,
      motivo: data.motivo ?? null,
      comentario: data.comentario ?? null,
      respuesta: data.respuesta ? data.respuesta.slice(0, 4000) : null,
    });
    if (error) {
      console.error("conti feedback insert failed", error);
      return { ok: false, error: "No se pudo registrar tu comentario." };
    }
    return { ok: true, error: null as string | null };
  });


export const listBotAyudaThreads = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("bot_ayuda_threads")
      .select("id,title,updated_at,created_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("list threads failed", error);
      return { threads: [] as Array<{ id: string; title: string; updated_at: string }> };
    }
    return { threads: data ?? [] };
  });

export const loadBotAyudaThread = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ threadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: msgs, error } = await supabase
      .from("bot_ayuda_messages")
      .select("role,content,created_at")
      .eq("thread_id", data.threadId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("load thread failed", error);
      return { messages: [] as Array<{ role: "user" | "assistant"; content: string }> };
    }
    return {
      messages: (msgs ?? []).map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content as string })),
    };
  });

export const deleteBotAyudaThread = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ threadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("bot_ayuda_threads")
      .delete()
      .eq("id", data.threadId)
      .eq("user_id", userId);
    if (error) {
      console.error("delete thread failed", error);
      return { ok: false, error: "No se pudo eliminar la conversación." };
    }
    return { ok: true, error: null as string | null };
  });
