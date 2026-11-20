// ─────────────────────────────────────────────────────────────────────────────
// Lectura con IA de estados de cuenta en PDF de cualquier banco.
//
// La IA sólo transcribe renglones. Quién decide si un importe entra o sale es
// la aritmética de saldos (verificarLecturaIA). Si no cierra, no se importa y
// se le dice al contador por qué. Si cierra, los movimientos pasan por la misma
// vista previa y validación humana que cualquier otra importación.
// ─────────────────────────────────────────────────────────────────────────────
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";
import { assertWithinLimit, recordIaUsage, UsageLimitError } from "@/lib/usage/limits";
import { checkRateLimit, rateLimitMessage } from "@/lib/security/rate-limit";
import { aiFetch, aiApiKey } from "@/lib/ai/gateway";
import { unirLecturas, verificarLecturaIA, type LecturaIA } from "@/lib/conciliacion/bancos/verificacion-ia";

const Entrada = z.object({
  cliente_id: z.string().uuid(),
  archivo_nombre: z.string().max(200),
  /** Texto de cada página con las columnas alineadas por posición. */
  paginas: z.array(z.string().max(20000)).min(1).max(40),
});

const PAGINAS_POR_LLAMADA = 3;

const INSTRUCCIONES = `Eres un capturista contable mexicano. Recibes el texto de páginas de un estado de cuenta bancario; las columnas están alineadas con espacios.
Transcribe EXACTAMENTE lo impreso, sin inventar ni completar datos. Devuelve sólo JSON con esta forma:
{
  "banco": string|null,
  "periodo_inicio": "AAAA-MM-DD"|null,
  "periodo_fin": "AAAA-MM-DD"|null,
  "saldo_inicial": number|null,      // saldo anterior / saldo inicial del periodo, si aparece en ESTAS páginas
  "saldo_final": number|null,        // saldo final / saldo al corte, si aparece en ESTAS páginas
  "total_cargos": number|null,       // total de retiros/cargos del resumen, si aparece
  "total_abonos": number|null,       // total de depósitos/abonos del resumen, si aparece
  "movimientos": [
    { "fecha": "AAAA-MM-DD", "descripcion": string, "referencia": string|null, "cargo": number|null, "abono": number|null, "saldo": number|null }
  ]
}
Reglas:
- Un renglón de movimiento por cada operación, en el orden en que aparece. Une en "descripcion" las líneas de concepto que pertenecen a la misma operación.
- "cargo" es un retiro/cargo/débito; "abono" es un depósito/abono/crédito. Pon el importe en la columna en la que aparece impreso. Nunca en ambas.
- "saldo" es el saldo impreso en ese renglón; si el renglón no trae saldo, null.
- Importes como número sin signo de pesos ni comas (1234.56).
- Si la fecha no trae año, tómalo del periodo del estado de cuenta.
- No incluyas renglones de resumen, totales, encabezados ni saldos iniciales como movimientos.`;

async function leerBloque(texto: string, apiKey: string): Promise<{ lectura: LecturaIA; tokens_in: number; tokens_out: number; modelo: string }> {
  const modelo = "google/gemini-2.5-pro";
  const res = await aiFetch("chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: INSTRUCCIONES },
        { role: "user", content: texto },
      ],
    }),
  });
  if (res.status === 429) throw new Error("El servicio de IA está saturado. Intenta de nuevo en un minuto.");
  if (!res.ok) throw new Error(`La lectura con IA falló (${res.status}).`);
  const json: any = await res.json();
  const contenido = String(json?.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "");
  let datos: any;
  try {
    datos = JSON.parse(contenido);
  } catch {
    throw new Error("La IA no devolvió una lectura válida del estado de cuenta.");
  }
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(String(v).replace(/[^0-9.\-]/g, "")));
  const lectura: LecturaIA = {
    banco: datos?.banco ?? null,
    periodo_inicio: datos?.periodo_inicio ?? null,
    periodo_fin: datos?.periodo_fin ?? null,
    saldo_inicial: num(datos?.saldo_inicial),
    saldo_final: num(datos?.saldo_final),
    total_cargos: num(datos?.total_cargos),
    total_abonos: num(datos?.total_abonos),
    movimientos: Array.isArray(datos?.movimientos)
      ? datos.movimientos.map((m: any) => ({
          fecha: String(m?.fecha ?? ""),
          descripcion: String(m?.descripcion ?? ""),
          referencia: m?.referencia ? String(m.referencia) : null,
          cargo: num(m?.cargo),
          abono: num(m?.abono),
          saldo: num(m?.saldo),
        }))
      : [],
  };
  return {
    lectura,
    tokens_in: Number(json?.usage?.prompt_tokens ?? 0),
    tokens_out: Number(json?.usage?.completion_tokens ?? 0),
    modelo: String(json?.model ?? modelo),
  };
}

export const leerEstadoCuentaIA = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => Entrada.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClienteScope(supabase as any, userId, data.cliente_id);
    const apiKey = aiApiKey();
    if (!apiKey) return { ok: false as const, error: "La lectura con IA no está configurada en este entorno." };

    const rl = await checkRateLimit(supabase, "lectura_banco_ia", 10, 600);
    if (!rl.allowed) return { ok: false as const, error: rateLimitMessage("lectura de estados de cuenta", rl.resetAt) };

    let despachoId: string | null = null;
    try {
      despachoId = await resolveActiveDespachoId(supabase, userId);
      await assertWithinLimit(supabase, despachoId, "ia_requests");
    } catch (e) {
      if (e instanceof UsageLimitError) return { ok: false as const, error: e.message };
    }

    const partes: LecturaIA[] = [];
    let tokensIn = 0;
    let tokensOut = 0;
    let modelo = "";
    try {
      for (let i = 0; i < data.paginas.length; i += PAGINAS_POR_LLAMADA) {
        const bloque = data.paginas
          .slice(i, i + PAGINAS_POR_LLAMADA)
          .map((t, k) => `=== Página ${i + k + 1} de ${data.paginas.length} ===\n${t}`)
          .join("\n\n");
        const r = await leerBloque(bloque, apiKey);
        partes.push(r.lectura);
        tokensIn += r.tokens_in;
        tokensOut += r.tokens_out;
        modelo = r.modelo;
      }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }

    if (despachoId) {
      await recordIaUsage(supabase as any, despachoId, userId, {
        tool: "lectura_estado_cuenta",
        model: modelo,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
      }).catch(() => undefined);
    }

    const lectura = unirLecturas(partes);
    const v = verificarLecturaIA(lectura);
    return {
      ok: true as const,
      verificado: v.ok,
      banco: lectura.banco,
      periodo_inicio: lectura.periodo_inicio,
      periodo_fin: lectura.periodo_fin,
      movimientos: v.movimientos,
      problemas: v.problemas,
      correcciones: v.correcciones,
      resumen: v.resumen,
    };
  });
