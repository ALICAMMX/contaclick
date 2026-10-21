import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { aiFetch, aiApiKey } from "@/lib/ai/gateway";

export const PLANTILLAS_CORRESPONDENCIA = [
  { key: "minuta_reunion", titulo: "Minuta de reunión con cliente", desc: "Captura puntos tratados, acuerdos y responsables." },
  { key: "respuesta_sat", titulo: "Respuesta a oficio / invitación SAT", desc: "Formato formal con fundamento legal." },
  { key: "carta_aceptacion", titulo: "Carta de aceptación de servicio", desc: "Despacho ↔ cliente, alcance y honorarios." },
  { key: "recordatorio_pago", titulo: "Recordatorio de pago", desc: "Tono cordial con desglose de saldo." },
  { key: "acta_entrega", titulo: "Acta de entrega de información", desc: "Para auditorías y traspasos de expediente." },
  { key: "aviso_normativo", titulo: "Aviso de cambio normativo", desc: "Comunica reformas relevantes al cliente." },
  { key: "carta_poder", titulo: "Carta poder simple (administrativa)", desc: "No sustituye poder notarial. Uso administrativo interno." },
  { key: "oficio_libre", titulo: "Oficio libre", desc: "Cualquier comunicación formal según tu instrucción." },
] as const;

type PlantillaKey = (typeof PLANTILLAS_CORRESPONDENCIA)[number]["key"];

const Schema = z.object({
  plantilla: z.string().min(1),
  destinatario: z.string().min(1).max(300),
  asunto: z.string().min(1).max(300),
  contexto: z.string().min(1).max(4000),
  tono: z.enum(["formal", "cordial", "directo"]).default("formal"),
  remitente: z.string().max(300).optional(),
});

const SYSTEM_PROMPT = `Eres redactor profesional de un despacho contable y fiscal en México. Generas correspondencia formal en español neutro mexicano.

Reglas:
- Estructura clásica: lugar y fecha (deja "[Ciudad], [Fecha]" como marcador), destinatario, asunto, saludo, cuerpo en párrafos, despedida formal, firma con marcador "[Nombre y cargo]".
- Cita fundamento legal solo cuando el usuario lo proporciona o cuando la plantilla lo exige (respuesta SAT). Nunca inventes números de oficio, expedientes ni jurisprudencia.
- Tono profesional y conciso. Evita florituras y promesas absolutas.
- Devuelve únicamente el documento en texto plano con saltos de línea naturales. Sin Markdown, sin encabezados con #, sin bullets a menos que la plantilla los requiera (minutas y actas).`;

function buildUserPrompt(d: z.infer<typeof Schema>): string {
  const meta = PLANTILLAS_CORRESPONDENCIA.find((p) => p.key === (d.plantilla as PlantillaKey));
  const tipo = meta?.titulo ?? "Oficio libre";
  return `Tipo de documento: ${tipo}
Destinatario: ${d.destinatario}
Asunto: ${d.asunto}
Tono: ${d.tono}
Remitente (firma): ${d.remitente || "[Nombre y cargo del firmante]"}

Contexto / puntos a incluir:
${d.contexto}

Genera el documento completo.`;
}

export type CorrespondenciaResult = { content: string; error: string | null };

export const generarCorrespondencia = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data }): Promise<CorrespondenciaResult> => {
    const apiKey = aiApiKey();
    if (!apiKey) return { content: "", error: "El servicio de IA no está configurado." };

    try {
      const res = await aiFetch("chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(data) },
          ],
        }),
      });
      if (res.status === 429) return { content: "", error: "Demasiadas solicitudes. Intenta en un momento." };
      if (res.status === 402) return { content: "", error: "Se agotaron los créditos de IA del workspace." };
      if (!res.ok) {
        const txt = await res.text();
        console.error("correspondencia gateway error", res.status, txt);
        return { content: "", error: "Error del servicio de IA." };
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { content: json.choices?.[0]?.message?.content ?? "", error: null };
    } catch (e) {
      console.error("generarCorrespondencia failed", e);
      return { content: "", error: "Error de red al consultar la IA." };
    }
  });
