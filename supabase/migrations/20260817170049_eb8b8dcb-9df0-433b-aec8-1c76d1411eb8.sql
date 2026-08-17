ALTER TABLE public.polizas
  ADD COLUMN IF NOT EXISTS nivel_evidencia text NOT NULL DEFAULT 'sin_evidencia',
  ADD COLUMN IF NOT EXISTS evidencia_detalle jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'polizas_nivel_evidencia_chk'
  ) THEN
    ALTER TABLE public.polizas
      ADD CONSTRAINT polizas_nivel_evidencia_chk
      CHECK (nivel_evidencia IN ('documental_pue','complemento_pago','banco_confirmado','manual_justificado','sin_evidencia'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS polizas_nivel_evidencia_idx
  ON public.polizas (cliente_id, periodo, nivel_evidencia);

CREATE OR REPLACE FUNCTION public.poliza_marcar_evidencia(
  _poliza_id uuid,
  _nivel text,
  _detalle jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente uuid;
  v_estado text;
BEGIN
  IF _nivel NOT IN ('documental_pue','complemento_pago','banco_confirmado','manual_justificado','sin_evidencia') THEN
    RAISE EXCEPTION 'Nivel de evidencia no reconocido: %', _nivel;
  END IF;

  SELECT cliente_id, estado INTO v_cliente, v_estado
  FROM public.polizas WHERE id = _poliza_id;

  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'La póliza no existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = v_cliente
      AND (
        public.has_role(auth.uid(), 'super_admin')
        OR c.despacho_id IN (
          SELECT m.despacho_id FROM public.user_memberships m
          WHERE m.user_id = auth.uid() AND m.activo = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'Sin acceso a este expediente.';
  END IF;

  IF v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'Sólo puede marcarse la evidencia de una póliza en borrador.';
  END IF;

  UPDATE public.polizas
  SET nivel_evidencia = _nivel,
      evidencia_detalle = coalesce(_detalle, '{}'::jsonb)
        || jsonb_build_object('marcada_por', auth.uid(), 'marcada_at', now())
  WHERE id = _poliza_id;

  RETURN jsonb_build_object('ok', true, 'poliza_id', _poliza_id, 'nivel_evidencia', _nivel);
END;
$$;

REVOKE ALL ON FUNCTION public.poliza_marcar_evidencia(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poliza_marcar_evidencia(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.poliza_marcar_evidencia(uuid, text, jsonb) TO service_role;