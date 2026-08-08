// Marca de versión del proceso automático (cron) de Descarga Masiva SAT.
//
// Sirve para distinguir, desde la base de datos y desde el panel admin, qué
// versión del endpoint está realmente desplegada. Si el heartbeat reporta una
// versión anterior a la esperada, el despliegue está atrasado aunque el código
// fuente ya esté corregido.
export const CRON_SAT_VERSION = "sat-cron-2026.08.08-saneamiento-heartbeat";

/** Minutos sin ejecución exitosa a partir de los cuales el cron se considera degradado. */
export const MINUTOS_ALERTA_CRON = 20;
