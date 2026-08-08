// Evaluación de salud del cron SAT — módulo PURO (sin red ni base de datos).
import { MINUTOS_ALERTA_CRON } from "./cron-version";

export const FRECUENCIA_CRON_MIN = 10;

export type SaludCron = {
  estado: "saludable" | "degradado" | "sin_datos";
  minutos_desde_exito: number | null;
  proxima_estimada: string | null;
  mensaje: string;
};

export function evaluarSaludCron(
  ultimoExitoIso: string | null | undefined,
  ahora = Date.now(),
  umbral = MINUTOS_ALERTA_CRON,
): SaludCron {
  if (!ultimoExitoIso) {
    return {
      estado: "sin_datos",
      minutos_desde_exito: null,
      proxima_estimada: null,
      mensaje: "Todavía no se registra ninguna ejecución del proceso automático.",
    };
  }
  const t = new Date(ultimoExitoIso).getTime();
  if (isNaN(t)) {
    return {
      estado: "sin_datos",
      minutos_desde_exito: null,
      proxima_estimada: null,
      mensaje: "La última ejecución registrada no tiene una fecha válida.",
    };
  }
  const minutos = Math.floor((ahora - t) / 60_000);
  const proxima = new Date(t + FRECUENCIA_CRON_MIN * 60_000).toISOString();
  if (minutos > umbral) {
    return {
      estado: "degradado",
      minutos_desde_exito: minutos,
      proxima_estimada: proxima,
      mensaje: `Sin ejecución exitosa desde hace ${minutos} minutos (límite ${umbral}). El saneamiento automático puede estar detenido.`,
    };
  }
  return {
    estado: "saludable",
    minutos_desde_exito: minutos,
    proxima_estimada: proxima,
    mensaje: `Última ejecución exitosa hace ${minutos} minutos.`,
  };
}
