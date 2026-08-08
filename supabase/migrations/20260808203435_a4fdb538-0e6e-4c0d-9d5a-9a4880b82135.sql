CREATE TABLE public.sat_procesamiento_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.sat_sync_runs(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  module_id text NOT NULL,
  estado text NOT NULL CHECK (estado IN ('iniciado','completado','omitido','fallido')),
  iniciado_at timestamptz NOT NULL DEFAULT now(),
  finalizado_at timestamptz,
  version text NOT NULL DEFAULT 'v1',
  idempotency_key text NOT NULL,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo text,
  derivados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sat_procesamiento_eventos_key_unica UNIQUE (idempotency_key)
);

CREATE INDEX sat_procesamiento_eventos_run_idx ON public.sat_procesamiento_eventos (run_id, module_id);

GRANT SELECT, INSERT, UPDATE ON public.sat_procesamiento_eventos TO authenticated;
GRANT ALL ON public.sat_procesamiento_eventos TO service_role;

ALTER TABLE public.sat_procesamiento_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spe select" ON public.sat_procesamiento_eventos
  FOR SELECT TO authenticated
  USING (public.is_member_of(despacho_id));

CREATE POLICY "spe insert" ON public.sat_procesamiento_eventos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(despacho_id));

-- Sólo puede cerrarse un intento propio que siga en curso: la bitácora terminal es inmutable.
CREATE POLICY "spe update en curso" ON public.sat_procesamiento_eventos
  FOR UPDATE TO authenticated
  USING (public.is_member_of(despacho_id) AND estado = 'iniciado')
  WITH CHECK (public.is_member_of(despacho_id));

CREATE TRIGGER sat_procesamiento_eventos_updated_at
  BEFORE UPDATE ON public.sat_procesamiento_eventos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();