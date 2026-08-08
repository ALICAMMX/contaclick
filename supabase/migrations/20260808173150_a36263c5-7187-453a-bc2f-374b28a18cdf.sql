CREATE TABLE public.sat_cron_heartbeat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inicio_at timestamptz NOT NULL DEFAULT now(),
  fin_at timestamptz,
  duracion_ms integer,
  http_status integer,
  version text NOT NULL DEFAULT 'desconocida',
  runs_revisados integer NOT NULL DEFAULT 0,
  runs_saneados integer NOT NULL DEFAULT 0,
  runs_reencauzados integer NOT NULL DEFAULT 0,
  solicitudes_consultadas integer NOT NULL DEFAULT 0,
  paquetes_descargados integer NOT NULL DEFAULT 0,
  corridas_iniciadas integer NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sat_cron_heartbeat_inicio ON public.sat_cron_heartbeat (inicio_at DESC);

GRANT SELECT ON public.sat_cron_heartbeat TO authenticated;
GRANT ALL ON public.sat_cron_heartbeat TO service_role;

ALTER TABLE public.sat_cron_heartbeat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin lee el heartbeat"
ON public.sat_cron_heartbeat
FOR SELECT
TO authenticated
USING (public.is_super_admin());