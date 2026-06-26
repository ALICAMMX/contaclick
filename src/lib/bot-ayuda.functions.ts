import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";
import { assertWithinLimit, recordIaUsage, UsageLimitError } from "@/lib/usage/limits";
import { checkRateLimit, rateLimitMessage } from "@/lib/security/rate-limit";

const MsgSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const SendSchema = z.object({
  threadId: z.string().uuid().nullable().optional(),
  messages: z.array(MsgSchema).min(1).max(40),
});

function deriveTitle(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return (t.length > 60 ? t.slice(0, 57) + "…" : t) || "Nueva conversación";
}

export const sendBotAyuda = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => SendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { error: "El asistente no está configurado.", content: "", threadId: data.threadId ?? null };

    const { supabase, userId } = context;

    const rl = await checkRateLimit(supabase, "bot_ayuda", 40, 300);
    if (!rl.allowed) return { error: rateLimitMessage("bot de ayuda", rl.resetAt), content: "", threadId: data.threadId ?? null };

    let despachoId: string | null = null;
    try {
      despachoId = await resolveActiveDespachoId(supabase, userId);
      await assertWithinLimit(supabase, despachoId, "ia_requests");
    } catch (e) {
      if (e instanceof UsageLimitError) return { error: e.message, content: "", threadId: data.threadId ?? null };
    }

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
        return { error: "No se pudo crear la conversación.", content: "", threadId: null };
      }
      threadId = t.id as string;
    }

    const model = "google/gemini-3-flash-preview";

    try {
      const { BOT_AYUDA_SYSTEM_PROMPT } = await import("./bot-ayuda.prompts.server");
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: BOT_AYUDA_SYSTEM_PROMPT }, ...data.messages],
        }),
      });

      if (res.status === 429) return { error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", content: "", threadId };
      if (res.status === 402) return { error: "Se agotaron los créditos de IA en tu workspace.", content: "", threadId };
      if (!res.ok) {
        const txt = await res.text();
        console.error("AI gateway error", res.status, txt);
        return { error: "Error del servicio de IA.", content: "", threadId };
      }

      const json = (await res.json()) as any;
      const content: string = json.choices?.[0]?.message?.content ?? "";
      const usage = json.usage ?? {};

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
      return { error: null as string | null, content, threadId };
    } catch (e) {
      console.error("sendBotAyuda failed", e);
      return { error: "Error de red al consultar la IA.", content: "", threadId };
    }
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
