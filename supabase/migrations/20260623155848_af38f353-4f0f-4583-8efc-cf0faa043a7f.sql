
-- 1) uso_periodo: contadores mensuales por despacho
CREATE TABLE public.uso_periodo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  periodo text NOT NULL, -- YYYY-MM
  ia_requests integer NOT NULL DEFAULT 0,
  ia_tokens bigint NOT NULL DEFAULT 0,
  rfc_activos integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (despacho_id, periodo)
);
CREATE INDEX idx_uso_periodo_despacho ON public.uso_periodo(despacho_id, periodo);

GRANT SELECT, INSERT, UPDATE ON public.uso_periodo TO authenticated;
GRANT ALL ON public.uso_periodo TO service_role;
ALTER TABLE public.uso_periodo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uso_periodo select" ON public.uso_periodo FOR SELECT USING (is_member_of(despacho_id));
CREATE POLICY "uso_periodo insert" ON public.uso_periodo FOR INSERT WITH CHECK (is_member_of(despacho_id));
CREATE POLICY "uso_periodo update" ON public.uso_periodo FOR UPDATE USING (is_member_of(despacho_id));

-- 2) uso_eventos: bitácora append-only
CREATE TABLE public.uso_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo text NOT NULL, -- 'ia_request' | 'rfc_add' | 'tool_run'
  tool text,
  model text,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_uso_eventos_despacho ON public.uso_eventos(despacho_id, created_at DESC);

GRANT SELECT, INSERT ON public.uso_eventos TO authenticated;
GRANT ALL ON public.uso_eventos TO service_role;
ALTER TABLE public.uso_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uso_eventos select" ON public.uso_eventos FOR SELECT USING (is_member_of(despacho_id));
CREATE POLICY "uso_eventos insert" ON public.uso_eventos FOR INSERT WITH CHECK (is_member_of(despacho_id));

-- 3) Índice único parcial en alertas para idempotencia de avisos de uso
-- evidencia debe incluir { recurso, periodo, umbral } cuando tipo='uso_limite'
CREATE UNIQUE INDEX IF NOT EXISTS idx_alertas_uso_unique
  ON public.alertas (
    despacho_id,
    tipo,
    (evidencia->>'recurso'),
    (evidencia->>'periodo'),
    (evidencia->>'umbral')
  )
  WHERE tipo = 'uso_limite';

-- 4) RPC para incremento atómico (evita races)
CREATE OR REPLACE FUNCTION public.incrementar_uso_ia(
  _despacho uuid,
  _periodo text,
  _requests int,
  _tokens bigint
) RETURNS public.uso_periodo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.uso_periodo;
BEGIN
  IF NOT public.is_member_of(_despacho) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  INSERT INTO public.uso_periodo (despacho_id, periodo, ia_requests, ia_tokens)
  VALUES (_despacho, _periodo, _requests, _tokens)
  ON CONFLICT (despacho_id, periodo)
  DO UPDATE SET
    ia_requests = uso_periodo.ia_requests + EXCLUDED.ia_requests,
    ia_tokens = uso_periodo.ia_tokens + EXCLUDED.ia_tokens,
    updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.incrementar_uso_ia(uuid, text, int, bigint) TO authenticated;
