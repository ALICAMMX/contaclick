-- Re-apunta las tareas programadas del SAT al dominio de PRUEBAS.
-- Sustituye <ANON_KEY> por la llave publicable del proyecto de pruebas.
SELECT cron.unschedule('sat-sync-hourly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sat-sync-hourly');
SELECT cron.schedule('sat-sync-hourly','5 * * * *', $c$
  select net.http_post(url:='https://pruebas.contaclick.cloud/api/public/hooks/sat-sync',
    headers:=jsonb_build_object('Content-Type','application/json','apikey','<ANON_KEY>'), body:='{}'::jsonb);
$c$);
SELECT cron.unschedule('sat-programaciones-cada-minuto') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sat-programaciones-cada-minuto');
SELECT cron.schedule('sat-programaciones-cada-minuto','* * * * *', $c$
  select net.http_post(url:='https://pruebas.contaclick.cloud/api/public/hooks/sat-programaciones',
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret', coalesce(public.cron_secreto('SAT_PROGRAMACIONES_CRON_SECRET'),'')),
    body:='{}'::jsonb);
$c$);
SELECT cron.unschedule('sat-cron-secreto-sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sat-cron-secreto-sync');
SELECT cron.schedule('sat-cron-secreto-sync','*/15 * * * *', $c$
  select net.http_get(url:='https://pruebas.contaclick.cloud/api/public/hooks/sat-programaciones');
$c$);
