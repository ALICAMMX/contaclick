-- Extender obligaciones_fiscales con metadatos de calendario fiscal
ALTER TABLE public.obligaciones_fiscales
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS responsable_user_id uuid,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS adjunto_path text,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS completada_at timestamptz,
  ADD COLUMN IF NOT EXISTS completada_by uuid,
  ADD COLUMN IF NOT EXISTS alert_days_before integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS alert_channels text[] NOT NULL DEFAULT ARRAY['interna']::text[];

CREATE INDEX IF NOT EXISTS idx_oblig_despacho_venc
  ON public.obligaciones_fiscales (despacho_id, proximo_vencimiento);

-- Config de alertas por cliente
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS alert_days_default integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS alert_channels_default text[] NOT NULL DEFAULT ARRAY['interna']::text[];

-- trigger updated_at ya existe en la tabla (definida en migración inicial)
