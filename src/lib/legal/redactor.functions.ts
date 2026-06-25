import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";

export const TIPOS_ESCRITO = [
  { key: "recurso_revocacion", nombre: "Recurso de Revocación", fundamento: "Arts. 116, 117, 121 CFF", autoridad: "Administración Desconcentrada Jurídica del SAT" },
  { key: "juicio_contencioso", nombre: "Juicio Contencioso Administrativo", fundamento: "Arts. 1, 2, 13 LFPCA", autoridad: "Tribunal Federal de Justicia Administrativa" },
  { key: "amparo_indirecto", nombre: "Amparo Indirecto", fundamento: "Arts. 107 CPEUM, 107 fracc. I y 108 LA", autoridad: "Juez de Distrito en Materia Administrativa" },
  { key: "amparo_directo", nombre: "Amparo Directo", fundamento: "Arts. 170 y 175 LA", autoridad: "Tribunal Colegiado de Circuito" },
  { key: "solicitud_devolucion", nombre: "Solicitud de Devolución de Saldo a Favor", fundamento: "Art. 22 CFF", autoridad: "Administración Desconcentrada de Auditoría Fiscal" },
  { key: "respuesta_invitacion", nombre: "Respuesta a Carta Invitación", fundamento: "Art. 33 fracc. I inciso a) CFF", autoridad: "Administración Desconcentrada de Servicios al Contribuyente" },
  { key: "aclaracion_69b", nombre: "Aclaración Art. 69-B CFF (EFOS/EDOS)", fundamento: "Art. 69-B CFF y RMF 2026", autoridad: "Administración Central de Fiscalización Estratégica" },
  { key: "queja_prodecon", nombre: "Queja ante PRODECON", fundamento: "Arts. 5 y 16 LOPRODECON", autoridad: "Procuraduría de la Defensa del Contribuyente" },
  { key: "consulta_real_concreta", nombre: "Consulta Real y Concreta (Art. 34 CFF)", fundamento: "Art. 34 CFF", autoridad: "Administración Central Jurídica" },
  { key: "promocion_condonacion", nombre: "Solicitud de Condonación / Reducción de Multas", fundamento: "Arts. 70-A, 74 CFF", autoridad: "Administración Desconcentrada de Recaudación" },
] as const;

const Schema = z.object({
  tipo: z.string().min(1).max(80),
  cliente_razon_social: z.string().min(1).max(300),
  cliente_rfc: z.string().min(1).max(20),
  cliente_domicilio: z.string().max(500).optional().default(""),
  representante: z.string().max(300).optional().default(""),
  oficio_referencia: z.string().max(200).optional().default(""),
  monto: z.string().max(60).optional().default(""),
  hechos: z.string().min(20).max(8000),
  agravios: z.string().max(8000).optional().default(""),
  pretensiones: z.string().max(2000).optional().default(""),
  pruebas: z.string().max(3000).optional().default(""),
  nivel: z.enum(["estandar", "robusto", "premium"]).default("robusto"),
});

// Prompt vive en src/lib/legal/redactor.prompts.server.ts (excluido del bundle del cliente).

function buildUserPrompt(d: z.infer<typeof Schema>, meta: { nombre: string; fundamento: string; autoridad: string }) {
  return `Redacta un **${meta.nombre}** completo y listo para revisar, firmar y presentar.

## Datos del expediente
- **Tipo de escrito:** ${meta.nombre}
- **Fundamento general:** ${meta.fundamento}
- **Autoridad destinataria:** ${meta.autoridad}
- **Promovente:** ${d.cliente_razon_social}
- **RFC:** ${d.cliente_rfc}
- **Domicilio fiscal:** ${d.cliente_domicilio || "[PENDIENTE]"}
- **Representante legal:** ${d.representante || "[PENDIENTE: nombre y poder notarial]"}
- **Acto/Oficio impugnado o referenciado:** ${d.oficio_referencia || "[PENDIENTE]"}
- **Monto en controversia:** ${d.monto || "No determinado"}

## Hechos narrados por el cliente
${d.hechos}

## Agravios / argumentos preliminares del despacho
${d.agravios || "Desarrolla los agravios pertinentes con base en los hechos."}

## Pretensiones específicas
${d.pretensiones || "Plantea las pretensiones lógicas para este tipo de escrito."}

## Pruebas disponibles
${d.pruebas || "Ofrece las pruebas documentales típicas (CFDI, estados de cuenta, contratos, etc.) y solicita las que deba aportar la autoridad."}

## Nivel de profundidad solicitado: ${d.nivel.toUpperCase()}

Genera el escrito completo siguiendo la estructura obligatoria del sistema. Numera hechos en romanos. Cada agravio debe llevar: (a) precepto violado, (b) desarrollo técnico, (c) criterio jurisprudencial aplicable, (d) conclusión. Cierra con puntos petitorios y la fórmula "PROTESTO LO NECESARIO".`;
}

export type EscritoResult = {
  content: string;
  error: string | null;
  tipo: string;
};

export const generarEscrito = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data }): Promise<EscritoResult> => {
    const meta = TIPOS_ESCRITO.find((t) => t.key === data.tipo);
    if (!meta) return { content: "", error: "Tipo de escrito no válido.", tipo: data.tipo };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { content: "", error: "El servicio de IA no está configurado.", tipo: data.tipo };

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: data.nivel === "premium" ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: buildUserPrompt(data, meta) },
          ],
        }),
      });

      if (res.status === 429) return { content: "", error: "Demasiadas solicitudes. Intenta en un momento.", tipo: data.tipo };
      if (res.status === 402) return { content: "", error: "Se agotaron los créditos de IA del workspace.", tipo: data.tipo };
      if (!res.ok) {
        const txt = await res.text();
        console.error("redactor gateway error", res.status, txt);
        return { content: "", error: "Error del servicio de IA.", tipo: data.tipo };
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content ?? "";
      return { content, error: null, tipo: data.tipo };
    } catch (e) {
      console.error("generarEscrito failed", e);
      return { content: "", error: "Error de red al consultar la IA.", tipo: data.tipo };
    }
  });
