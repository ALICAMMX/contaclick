ALTER TABLE public.sat_credenciales
  ADD COLUMN IF NOT EXISTS efirma_cer text,
  ADD COLUMN IF NOT EXISTS efirma_key_enc text,
  ADD COLUMN IF NOT EXISTS efirma_pass_enc text,
  ADD COLUMN IF NOT EXISTS efirma_rfc text,
  ADD COLUMN IF NOT EXISTS efirma_vence_at timestamptz;

ALTER TABLE public.sat_sync_runs
  ADD COLUMN IF NOT EXISTS proveedor text NOT NULL DEFAULT 'sat_directo',
  ADD COLUMN IF NOT EXISTS solicitudes jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS sat_sync_runs_pendientes_idx
  ON public.sat_sync_runs (estatus, iniciado_at DESC);