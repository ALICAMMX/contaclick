import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";
import { assertWithinLimit, recordIaUsage, UsageLimitError } from "@/lib/usage/limits";
import { checkRateLimit, rateLimitMessage } from "@/lib/security/rate-limit";

const Schema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(8000),
  })).min(1).max(40),
});

export const sendBotAyuda = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { error: "El asistente no está configurado.", content: "" };

    const { supabase, userId } = context;

    const rl = await checkRateLimit(supabase, "bot_ayuda", 40, 300);
    if (!rl.allowed) return { error: rateLimitMessage("bot de ayuda", rl.resetAt), content: "" };

    let despachoId: string | null = null;
    try {
      despachoId = await resolveActiveDespachoId(supabase, userId);
      await assertWithinLimit(supabase, despachoId, "ia_requests");
    } catch (e) {
      if (e instanceof UsageLimitError) return { error: e.message, content: "" };
    }

    const model = "google/gemini-3-flash-preview";

    try {
      const { BOT_AYUDA_SYSTEM_PROMPT } = await import("./bot-ayuda.prompts.server");
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: BOT_AYUDA_SYSTEM_PROMPT }, ...data.messages],
        }),
      });

      if (res.status === 429) return { error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", content: "" };
      if (res.status === 402) return { error: "Se agotaron los créditos de IA en tu workspace.", content: "" };
      if (!res.ok) {
        const txt = await res.text();
        console.error("AI gateway error", res.status, txt);
        return { error: "Error del servicio de IA.", content: "" };
      }

      const json = await res.json() as any;
      const content = json.choices?.[0]?.message?.content ?? "";
      const usage = json.usage ?? {};
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
      return { error: null as string | null, content };
    } catch (e) {
      console.error("sendBotAyuda failed", e);
      return { error: "Error de red al consultar la IA.", content: "" };
    }
  });
