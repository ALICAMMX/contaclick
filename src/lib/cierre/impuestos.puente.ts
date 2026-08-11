// ─────────────────────────────────────────────────────────────────────────────
// PUENTE FISCAL — única ruta por la que un resultado preliminar llega a la base.
//
// Reglas duras del puente:
//  1. LEE la evidencia con el cliente del USUARIO (RLS aplica: nadie ve otro
//     expediente), y ESCRIBE con el proceso interno de confianza, que es el
//     único con permiso sobre `cierre_registrar_resultado_fiscal_srv`.
//  2. Ejecuta los motores versionados en el servidor. Nada de régimen,
//     resultado, normativa, fundamentos ni huellas viene del navegador.
//  3. Falla CERRADA: cualquier error de lectura de parámetros o de entradas
//     termina el cálculo como no comprobado. Nunca se sustituye por {} ni 0.
//  4. Revalida el `input_hash` DESPUÉS de calcular: si la evidencia cambió
//     entre lectura y persistencia, no se registra nada.
// ─────────────────────────────────────────────────────────────────────────────

import { calcularPreliminar, type EntradasFiscales, type ParametrosFiscales } from "./impuestos";

export class FiscalNoComprobadoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FiscalNoComprobadoError";
  }
}

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
  if (error) throw new FiscalNoComprobadoError(error.message);
  if (!data) {
    throw new FiscalNoComprobadoError(
      "No se pudieron leer las entradas fiscales del periodo: el cálculo queda no comprobado.",
    );
  }
  return data as EntradasFiscales;
}

/**
 * Últimos parámetros humanos capturados (coeficiente, saldos, pagos previos).
 * FALLA CERRADA: si la consulta falla, no se devuelve `{}` — se interrumpe.
 */
export async function leerParametrosPrevios(
  supabase: any,
  clienteId: string,
  periodo: string,
): Promise<ParametrosFiscales> {
  const { data, error } = await supabase
    .from("cierre_resultado_fiscal")
    .select("entradas")
    .eq("cliente_id", clienteId)
    .eq("periodo", periodo)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    throw new FiscalNoComprobadoError(
      `No se pudieron leer los parámetros fiscales previos (${error.message}): el cálculo queda no comprobado y el sellado bloqueado.`,
    );
  }
  const previos = (data?.[0]?.entradas as any)?.parametros_humanos;
  return (previos ?? {}) as ParametrosFiscales;
}

/**
 * Calcula con los motores reales y registra mediante el escritor privilegiado.
 * No inventa ceros: si la evidencia no permite calcular, devuelve
 * `registrado: false` con el motivo y no toca la base.
 */
export async function calcularYRegistrar(
  supabaseLectura: any,
  escritor: any,
  clienteId: string,
  periodo: string,
  parametros: ParametrosFiscales,
  solicitadoPor: string,
): Promise<ResultadoPuente> {
  const entradas = await leerEntradasFiscales(supabaseLectura, clienteId, periodo);
  const preliminar = calcularPreliminar(entradas, parametros);

  if (!preliminar.evaluable || !preliminar.resultado || !preliminar.regimen) {
    return {
      registrado: false,
      motivo: preliminar.motivos.map((m) => m.detalle).join(" · ") || "Cálculo no evaluable.",
      entradas,
      preliminar,
    };
  }

  // Revalidación: la evidencia no pudo cambiar entre lectura y persistencia.
  const verificacion = await leerEntradasFiscales(supabaseLectura, clienteId, periodo);
  if (verificacion.input_hash !== entradas.input_hash) {
    return {
      registrado: false,
      motivo:
        "La evidencia del periodo cambió durante el cálculo: vuelva a calcular antes de registrar o sellar.",
      entradas,
      preliminar,
    };
  }

  const argumentos = {
    _cliente_id: clienteId,
    _periodo: periodo,
    _solicitado_por: solicitadoPor,
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

  const { error } = await escritor.rpc("cierre_registrar_resultado_fiscal_srv", argumentos);
  if (error) throw new FiscalNoComprobadoError(error.message);
  return { registrado: true, entradas, preliminar };
}
