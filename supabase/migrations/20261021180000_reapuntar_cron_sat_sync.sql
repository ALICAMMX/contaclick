-- ─────────────────────────────────────────────────────────────────────────────
-- Re-apunta el cron horario de Descarga Masiva SAT a ContaClick.
--
-- El job 'sat-sync-hourly' (migración 20260625071214) se creó con la URL de
-- respaldo 'https://abogaclick.com.mx' cuando la variable app.public_base_url
-- no existe. Ese job es el que COSECHA los paquetes asíncronos del SAT y lanza
-- las descargas diarias de sat_sync_config; si apunta a otro dominio, ningún
-- expediente vuelve a descargar solo.
--
-- Se usa el mismo dominio que ya usa 'sat-programaciones-cada-minuto' y la
-- llave publicable (anon) que el endpoint compara contra
-- SUPABASE_PUBLISHABLE_KEY. La llave anon es pública por diseño.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT cron.unschedule('sat-sync-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sat-sync-hourly');

SELECT cron.schedule(
  'sat-sync-hourly',
  '5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://project--0afe7814-273e-44c3-835b-c1945ea1340d.lovable.app/api/public/hooks/sat-sync',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtvb3RzdWh4YnR6cWZtbm9ranN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNDQwNzAsImV4cCI6MjA5MzkyMDA3MH0.LtnhiwFnb8XmEaUceJM1GQa1Li0pUha7NWEMsUGiRFA'),
    body := '{}'::jsonb
  ) as request_id;
  $cron$
);
