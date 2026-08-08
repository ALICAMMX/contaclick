ALTER TABLE public.sat_procesamiento_eventos
  ADD COLUMN IF NOT EXISTS execution_id uuid;

CREATE INDEX IF NOT EXISTS sat_procesamiento_eventos_execution_idx
  ON public.sat_procesamiento_eventos (execution_id, run_id);

COMMENT ON COLUMN public.sat_procesamiento_eventos.execution_id IS
  'Identificador no sensible que correlaciona todos los recibos creados por una invocación de procesamiento posterior.';