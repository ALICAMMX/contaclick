CREATE OR REPLACE FUNCTION public.poliza_marcar_evidencia(_poliza_id uuid, _nivel text, _detalle jsonb DEFAULT '{}'::jsonb)
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

  PERFORM public.cierre_autorizar_expediente(v_cliente);

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