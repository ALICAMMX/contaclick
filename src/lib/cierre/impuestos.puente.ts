// ─────────────────────────────────────────────────────────────────────────────
// PUENTE FISCAL — única ruta por la que un resultado preliminar llega a la base.
//
// Toma las entradas normalizadas del periodo, EJECUTA los motores versionados
// (ISR PF / ISR PM / RESICO / IVA) y registra el resultado. Se usa tanto desde
// la pantalla de impuestos como desde el sellado, para que sellar nunca ocurra
// con un cálculo más viejo que la evidencia.
// ─────────────────────────────────────────────────────────────────────────────

import { calcularPreliminar, type EntradasFiscales, type ParametrosFiscales } from "./impuestos";

export type ResultadoPuente = {
  registrado: boolean;
  motivo?: string;
  entradas: EntradasFiscales;
  preliminar: ReturnType<typeof calcularPreliminar>;
};

export async function leerEntradasFiscales(
  supabase: any,
  clienteId: string,
  periodo: string,
): Promise<EntradasFiscales> {
  const { data, error } = await supabase.rpc("cierre_entradas_fiscales", {
    _cliente_id: clienteId,
    _periodo: periodo,
  });
  if (error) throw new Error(error.message);
  return data as EntradasFiscales;
}

/** Últimos parámetros humanos capturados para el periodo (coeficiente, saldos). */
export async function leerParametrosPrevios(
  supabase: any,
  clienteId: string,
  periodo: string,
): Promise<ParametrosFiscales> {
  const { data } = await supabase
    .from("cierre_resultado_fiscal")
    .select("entradas")
    .eq("cliente_id", clienteId)
    .eq("periodo", periodo)
    .order("created_at", { ascending: false })
    .limit(1);
  const previos = (data?.[0]?.entradas as any)?.parametros_humanos;
  return (previos ?? {}) as ParametrosFiscales;
}

/**
 * Calcula con los motores reales y registra. No inventa ceros: si la evidencia
 * no permite calcular, devuelve `registrado: false` con el motivo.
 */
export async function calcularYRegistrar(
  supabase: any,
  clienteId: string,
  periodo: string,
  parametros: ParametrosFiscales,
): Promise<ResultadoPuente> {
  const entradas = await leerEntradasFiscales(supabase, clienteId, periodo);
  const preliminar = calcularPreliminar(entradas, parametros);

  if (!preliminar.evaluable || !preliminar.resultado || !preliminar.regimen) {
    return {
      registrado: false,
      motivo: preliminar.motivos.map((m) => m.detalle).join(" · ") || "Cálculo no evaluable.",
      entradas,
      preliminar,
    };
  }

  const argumentos = {
    _cliente_id: clienteId,
    _periodo: periodo,
    _regimen: preliminar.regimen,
    _motor_version: preliminar.motor_version,
    _normativa: preliminar.normativa,
    _normativa_sha256: preliminar.normativa_sha256,
    _entradas: { ...entradas, parametros_humanos: parametros },
    _input_hash: entradas.input_hash,
    _resultado: preliminar.resultado,
    _fundamentos: preliminar.fundamentos,
    _fuentes: preliminar.fuentes,
  } as never;

  const { error } = await supabase.rpc("cierre_registrar_resultado_fiscal", argumentos);
  if (error) throw new Error(error.message);
  return { registrado: true, entradas, preliminar };
}
