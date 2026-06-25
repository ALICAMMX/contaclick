DO $$
DECLARE
  v_url text;
  v_anon text;
BEGIN
  -- Lee la URL base de la app desde una tabla de config si existe; si no, deja un placeholder.
  -- En producción, ajusta v_url al dominio real (p. ej. https://abogaclick.com.mx).
  v_url := COALESCE(current_setting('app.public_base_url', true), 'https://abogaclick.com.mx');
  v_anon := COALESCE(current_setting('app.supabase_anon_key', true), '');

  -- Limpia el job previo si existe
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sat-sync-hourly';

  -- Programa cada hora
  PERFORM cron.schedule(
    'sat-sync-hourly',
    '5 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','apikey', %L),
        body := '{}'::jsonb
      );
    $f$, v_url || '/api/public/hooks/sat-sync', v_anon)
  );
END $$;