import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Schema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(8000),
  })).min(1).max(40),
});

const SYSTEM = `Eres ContaClick IA, asistente fiscal experto en México (SAT, CFDI 4.0, ISR, IVA, RESICO, IMSS, contabilidad electrónica, DIOT, retenciones).

REGLAS ESTRICTAS:
- Responde SIEMPRE en español neutro mexicano, claro y profesional.
- NUNCA inventes leyes, artículos, tasas o cálculos. Si no estás seguro, dilo.
- Cuando cites legislación, menciona el ordenamiento (LISR, LIVA, CFF, RMF) sin inventar números de artículo.
- Para cálculos, muestra el procedimiento paso a paso.
- Si te piden redactar correos o WhatsApps al cliente, usa tono profesional y empático.
- Sé conciso. Usa listas y negritas con markdown cuando ayude.`;

export const sendChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { error: "El asistente no está configurado.", content: "" };
    }

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "system", content: SYSTEM }, ...data.messages],
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
      return { error: null as string | null, content };
    } catch (e) {
      console.error("sendChat failed", e);
      return { error: "Error de red al consultar la IA.", content: "" };
    }
  });
