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
import {
  construirPayloadConti,
  depurarHistorial,
  mismaConversacion,
  type ExpedienteContexto,
} from "@/lib/conti/contexto";
import {
  HERRAMIENTAS_CONTI,
  ejecutarHerramientaConti,
  serializarResultado,
} from "@/lib/conti/motores";
import { validarRespuestaConti } from "@/lib/conti/validador";
import { aiFetch, aiApiKey } from "@/lib/ai/gateway";

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
  if (modo === "expediente") return "expediente";
  if (modo === "guia") return "plataforma";
  return "general";
}

export const sendBotAyuda = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => SendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = aiApiKey();
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
    // Sólo el modo expediente puede resolver un expediente, y sólo después de
    // validar membresía y alcance. En Guía y Consulta ni siquiera se consulta.
    let expediente: ExpedienteContexto | null = null;
    if (modoPedido === "expediente" && data.clienteId) {
      try {
        const scope = await assertClienteScope(supabase, userId, data.clienteId);
        const { data: cli } = await supabase
          .from("clientes")
          .select("regimen_fiscal, tipo_persona")
          .eq("id", scope.cliente_id)
          .maybeSingle();
        expediente = {
          clienteId: scope.cliente_id,
          rfc: scope.rfc,
          razonSocial: scope.razon_social ?? null,
          regimenFiscal: (cli?.regimen_fiscal as string | null) ?? null,
          tipoPersona: (cli?.tipo_persona as string | null) ?? null,
        };
      } catch (e: any) {
        return {
          error: e?.message ?? SIN_EXPEDIENTE_MSG,
          content: "",
          threadId: data.threadId ?? null,
          modo: modoPedido,
        };
      }
    }

    const hayExpediente = Boolean(expediente);
    const modo = normalizarModo(modoPedido, hayExpediente);
    const payload = construirPayloadConti(modo, expediente);

    // El modo forma parte de la llave de la conversación: si el hilo abierto se
    // creó en otro modo, se abre uno nuevo y no se arrastra el contexto.
    let threadId = data.threadId ?? null;
    if (threadId) {
      const { data: th } = await supabase
        .from("bot_ayuda_threads")
        .select("id, modo")
        .eq("id", threadId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!th || !mismaConversacion((th as any)?.modo ?? null, modo)) threadId = null;
    }
    const firstUser = [...data.messages].reverse().find((m) => m.role === "user");
    const hiloNuevo = !threadId;
    if (!threadId) {
      const title = deriveTitle(firstUser?.content ?? "Nueva conversación");
      const { data: t, error } = await supabase
        .from("bot_ayuda_threads")
        .insert({ user_id: userId, title, modo })
        .select("id")
        .single();
      if (error || !t) {
        console.error("create thread failed", error);
        return { error: "No se pudo crear la conversación.", content: "", threadId: null, modo };
      }
      threadId = t.id as string;
    }

    // Historial depurado: en Guía y Consulta ningún turno previo puede
    // transportar RFC, razón social ni menciones al expediente.
    const historial = depurarHistorial(
      hiloNuevo && firstUser ? [{ role: "user" as const, content: firstUser.content }] : data.messages,
      modo,
      expediente,
    );

    const model = "google/gemini-3-flash-preview";
    const ultimo = historial[historial.length - 1];
    const derivacion = detectarCalculo(ultimo?.role === "user" ? ultimo.content : "");
    const motoresEjecutados: string[] = [];

    try {
      const { buildContiPrompt } = await import("./conti/prompt.server");
      const sistema = buildContiPrompt({ modo, expediente: payload.expediente });
      const sysMessages: Array<{ role: "system"; content: string }> = [{ role: "system", content: sistema }];
      if (derivacion.requiere) {
        sysMessages.push({
          role: "system",
          content:
            "AVISO DEL SISTEMA: la última pregunta pide una cifra fiscal. NO la calcules tú: llama a la herramienta determinista correspondiente y explica su salida. Si ninguna aplica, di que el cálculo está bloqueado.",
        });
      }

      const llamar = async (mensajes: any[]) => {
        const res = await aiFetch("chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: mensajes, tools: HERRAMIENTAS_CONTI, tool_choice: "auto" }),
        });
        return res;
      };

      let conversacion: any[] = [...sysMessages, ...historial];
      let res = await llamar(conversacion);

      const errHttp = (r: Response) => {
        if (r.status === 429) return "Demasiadas solicitudes. Intenta de nuevo en un momento.";
        if (r.status === 402) return "Se agotaron los créditos de IA en tu workspace.";
        return null;
      };

      let e1 = errHttp(res);
      if (e1) return { error: e1, content: "", threadId, modo };
      if (!res.ok) {
        console.error("AI gateway error", res.status, await res.text());
        return { error: "Error del servicio de IA.", content: "", threadId, modo };
      }

      let json = (await res.json()) as any;
      let usageIn = json.usage?.prompt_tokens ?? 0;
      let usageOut = json.usage?.completion_tokens ?? 0;
      let msg = json.choices?.[0]?.message ?? {};

      // ── Bucle de herramientas deterministas ─────────────────────────────
      let vueltas = 0;
      while (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0 && vueltas < 3) {
        vueltas++;
        conversacion = [...conversacion, msg];
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function?.arguments ?? "{}");
          } catch {
            args = {};
          }
          const salida = ejecutarHerramientaConti(tc.function?.name ?? "", args);
          if (salida.ok) motoresEjecutados.push(salida.herramienta);
          conversacion.push({
            role: "tool",
            tool_call_id: tc.id,
            content: serializarResultado(salida),
          });
        }
        res = await llamar(conversacion);
        e1 = errHttp(res);
        if (e1) return { error: e1, content: "", threadId, modo };
        if (!res.ok) {
          console.error("AI gateway error", res.status, await res.text());
          return { error: "Error del servicio de IA.", content: "", threadId, modo };
        }
        json = (await res.json()) as any;
        usageIn += json.usage?.prompt_tokens ?? 0;
        usageOut += json.usage?.completion_tokens ?? 0;
        msg = json.choices?.[0]?.message ?? {};
      }

      let bruto: string = msg.content ?? "";

      // ── Validación estructural ──────────────────────────────────────────
      let val = validarRespuestaConti(bruto, { modo, expediente, motoresEjecutados });
      if (val.requiereRegeneracion) {
        // Se regenera SIN el contexto contaminado y con la prohibición explícita.
        const limpio = [
          ...sysMessages,
          {
            role: "system",
            content:
              "AVISO DEL SISTEMA: tu respuesta anterior fue rechazada por incluir datos de expediente en un modo que no los admite. Reescríbela sin mencionar expediente activo, contribuyente, razón social, RFC ni régimen, y sin suponer ninguno.",
          },
          ...(firstUser ? [{ role: "user" as const, content: firstUser.content }] : []),
        ];
        const res2 = await llamar(limpio);
        if (res2.ok) {
          const j2 = (await res2.json()) as any;
          usageIn += j2.usage?.prompt_tokens ?? 0;
          usageOut += j2.usage?.completion_tokens ?? 0;
          bruto = j2.choices?.[0]?.message?.content ?? "";
          val = validarRespuestaConti(bruto, { modo, expediente, motoresEjecutados });
        }
      }

      // Contrato de respuesta: sin porcentajes de confianza, con base declarada.
      const evidencia: NivelEvidencia = motoresEjecutados.length > 0 ? "motor" : evidenciaBase(modo);
      const { content, meta } = aplicarContrato(val.content, {
        modo,
        evidencia,
        detalleEvidencia:
          modo === "expediente" && expediente
            ? `Expediente activo: ${expediente.razonSocial ?? expediente.rfc}`
            : motoresEjecutados.length > 0
              ? `Motores ejecutados: ${[...new Set(motoresEjecutados)].join(", ")}`
              : modo === "guia"
                ? "Registro de capacidades de ContaClick"
                : "Catálogo normativo de ContaClick",
      });

      // Persist last user msg + assistant reply
      const lastUser = historial[historial.length - 1];
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
        saneada: meta.saneada || val.violaciones.length > 0,
        derivo_calculo: derivacion.requiere,
        modelo: model,
        tokens_in: usageIn,
        tokens_out: usageOut,
        latencia_ms: Date.now() - t0,
      });
      if (telErr) console.error("conti telemetria insert failed", telErr);

      if (despachoId) {
        try {
          await recordIaUsage(supabase, despachoId, userId, {
            tool: "bot_ayuda",
            model,
            tokens_in: usageIn,
            tokens_out: usageOut,
          });
        } catch (e) {
          console.error("recordIaUsage failed", e);
        }
      }
      return {
        error: null as string | null,
        content,
        threadId,
        modo,
        motores: [...new Set(motoresEjecutados)],
        violaciones: val.violaciones.map((v) => v.regla),
      };
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
