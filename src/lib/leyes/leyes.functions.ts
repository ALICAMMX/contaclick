import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";
import { checkRateLimit, rateLimitMessage } from "@/lib/security/rate-limit";

const EMBED_MODEL = "openai/text-embedding-3-small"; // 1536 dims para simplificar índice
const EMBED_DIMS = 1536;
const CHAT_MODEL = "google/gemini-3-flash-preview";

async function embed(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text, dimensions: EMBED_DIMS }),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data[0].embedding;
}

// El vector column es 3072 en la tabla — para embeddings de 1536, hacemos padding con ceros.
// Esto mantiene un solo índice y permite escalar a modelos de 3072 en el futuro sin migración.
function padTo3072(v: number[]): number[] {
  if (v.length === 3072) return v;
  const out = new Array<number>(3072).fill(0);
  for (let i = 0; i < v.length; i++) out[i] = v[i];
  return out;
}

// ============ Listar leyes ============
export const listLeyes = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await (supabase as any)
      .from("leyes")
      .select("id,clave,nombre,tipo,version,fecha_publicacion_dof,publicado,total_articulos,total_embeddings,updated_at")
      .order("clave", { ascending: true });
    if (error) return { leyes: [], error: error.message };
    return { leyes: (data ?? []) as any[], error: null as string | null };
  });

// ============ Parser: divide texto en artículos ============
const ART_RE = /(?:^|\n)\s*Art[íi]culo\s+([0-9]+(?:[- ][A-Za-z])?(?:\s+Bis|\s+Ter)?|Primero|Segundo|Tercero|Cuarto|Quinto|Sexto|S[ée]ptimo|Octavo|Noveno|D[ée]cimo)[.\-\s]/gi;

function parseArticulos(texto: string): Array<{ numero: string; texto: string; orden: number }> {
  const matches = [...texto.matchAll(ART_RE)];
  if (matches.length === 0) return [{ numero: "1", texto: texto.trim(), orden: 0 }];
  const out: Array<{ numero: string; texto: string; orden: number }> = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? texto.length) : texto.length;
    const body = texto.slice(start, end).trim();
    const numero = (m[1] ?? String(i + 1)).trim();
    if (body.length > 10) out.push({ numero, texto: body, orden: i });
  }
  return out;
}

// ============ Upsert ley (admin) ============
const UpsertLeySchema = z.object({
  id: z.string().uuid().optional(),
  clave: z.string().min(2).max(40).transform((s) => s.toUpperCase().trim()),
  nombre: z.string().min(3).max(200),
  tipo: z.enum(["ley", "reglamento", "rmf", "anexo", "criterio", "jurisprudencia"]).default("ley"),
  version: z.string().max(40).nullable().optional(),
  fecha_publicacion_dof: z.string().nullable().optional(),
  url_fuente: z.string().url().nullable().optional(),
  publicado: z.boolean().default(false),
  notas: z.string().max(2000).nullable().optional(),
});

export const upsertLey = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertLeySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload: any = { ...data };
    let res;
    if (data.id) {
      res = await (supabase as any).from("leyes").update(payload).eq("id", data.id).select("id").maybeSingle();
    } else {
      const { id, ...ins } = payload;
      res = await (supabase as any).from("leyes").insert(ins).select("id").maybeSingle();
    }
    if (res.error) return { ok: false, id: null as string | null, error: res.error.message };
    return { ok: true, id: res.data?.id as string, error: null as string | null };
  });

// ============ Indexar texto de una ley (admin) ============
const IndexSchema = z.object({
  ley_id: z.string().uuid(),
  texto: z.string().min(50),
  reemplazar: z.boolean().default(true),
});

export const indexarLey = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => IndexSchema.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false, error: "IA no configurada", articulos: 0, embeddings: 0 };
    const { supabase } = context;

    // Solo super_admin (RLS de INSERT lo enforza pero validamos temprano)
    const { data: isAdmin } = await (supabase as any).rpc("is_super_admin");
    if (!isAdmin) return { ok: false, error: "Solo super-admin puede indexar leyes.", articulos: 0, embeddings: 0 };

    if (data.reemplazar) {
      await (supabase as any).from("ley_articulos").delete().eq("ley_id", data.ley_id);
    }

    const articulos = parseArticulos(data.texto);
    let embCount = 0;

    // Insertar artículos en lote
    const rows = articulos.map((a) => ({
      ley_id: data.ley_id,
      numero: a.numero,
      texto: a.texto,
      orden: a.orden,
    }));
    const { data: inserted, error: insErr } = await (supabase as any)
      .from("ley_articulos")
      .insert(rows)
      .select("id,numero,texto");
    if (insErr) return { ok: false, error: insErr.message, articulos: 0, embeddings: 0 };

    // Generar embeddings uno a uno (secuencial, para no reventar límites)
    for (const art of inserted as Array<{ id: string; numero: string; texto: string }>) {
      try {
        const chunk = art.texto.slice(0, 6000);
        const vec = padTo3072(await embed(chunk, apiKey));
        const { error: eErr } = await (supabase as any).from("ley_embeddings").insert({
          articulo_id: art.id,
          ley_id: data.ley_id,
          chunk_index: 0,
          chunk_text: chunk,
          embedding: vec as unknown as string, // pgvector acepta array literal
          model: EMBED_MODEL,
        });
        if (!eErr) embCount++;
      } catch (e) {
        console.error("embed failed", art.numero, e);
      }
    }

    await (supabase as any)
      .from("leyes")
      .update({ total_articulos: inserted.length, total_embeddings: embCount })
      .eq("id", data.ley_id);

    return { ok: true, error: null as string | null, articulos: inserted.length, embeddings: embCount };
  });

// ============ Consultar ============
const ConsultaSchema = z.object({
  pregunta: z.string().min(3).max(1000),
  leyes: z.array(z.string()).optional(),
});

export type LeyCita = {
  articulo_id: string;
  ley_clave: string;
  ley_nombre: string;
  numero: string;
  fraccion: string | null;
  titulo: string | null;
  texto: string;
  similarity: number;
};

export const consultarLey = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => ConsultaSchema.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { respuesta: "", citas: [] as LeyCita[], error: "IA no configurada" };

    const { supabase } = context;
    const rl = await checkRateLimit(supabase, "leyes_ia", 30, 300);
    if (!rl.allowed) return { respuesta: "", citas: [] as LeyCita[], error: rateLimitMessage("consulta de leyes", rl.resetAt) };

    let qVec: number[];
    try {
      qVec = padTo3072(await embed(data.pregunta, apiKey));
    } catch (e) {
      return { respuesta: "", citas: [] as LeyCita[], error: "No se pudo procesar la pregunta." };
    }

    const { data: matches, error: mErr } = await (supabase as any).rpc("match_ley_articulos", {
      query_embedding: qVec as unknown as string,
      match_count: 6,
      min_similarity: 0.25,
      filter_ley_claves: data.leyes ?? null,
    });
    if (mErr) return { respuesta: "", citas: [] as LeyCita[], error: mErr.message };

    const citas = (matches ?? []) as LeyCita[];
    if (citas.length === 0) {
      return {
        respuesta: "No encontré fundamento en el corpus indexado para tu pregunta. Verifica si la ley está cargada en el índice.",
        citas: [],
        error: null as string | null,
      };
    }

    const contexto = citas
      .map((c, i) => `[${i + 1}] ${c.ley_clave} art. ${c.numero}${c.fraccion ? ` fracc. ${c.fraccion}` : ""}\n${c.texto.slice(0, 2000)}`)
      .join("\n\n---\n\n");

    const system = `Eres un asesor fiscal mexicano senior. Respondes ÚNICAMENTE con base en los fragmentos legales proporcionados. Reglas:
1. Cita el fundamento con el formato [LEY art. N fracc. X] al final de cada afirmación.
2. Si el fragmento no responde la pregunta, di "El corpus no contiene fundamento suficiente".
3. NUNCA inventes números de artículo, fracción o texto.
4. Usa español fiscal formal, respuesta directa y breve.
5. Al final incluye "Fundamento aplicable:" con la lista de artículos citados.`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: `Pregunta: ${data.pregunta}\n\nFragmentos legales recuperados:\n${contexto}` },
          ],
        }),
      });
      if (res.status === 429) return { respuesta: "", citas, error: "Demasiadas consultas, intenta en un minuto." };
      if (res.status === 402) return { respuesta: "", citas, error: "Se agotaron los créditos de IA." };
      if (!res.ok) return { respuesta: "", citas, error: `IA ${res.status}` };
      const json = (await res.json()) as any;
      const respuesta = json.choices?.[0]?.message?.content ?? "";
      return { respuesta, citas, error: null as string | null };
    } catch (e) {
      return { respuesta: "", citas, error: "Error de red." };
    }
  });
