-- Cierre automático atómico: estado + bitácora en la MISMA transacción.
-- Idempotente: sólo actúa sobre excepciones todavía 'pendiente'.
CREATE OR REPLACE FUNCTION public.cierre_excepcion_cerrar_automatica(
  _ids uuid[],
  _motivo text DEFAULT 'CAUSA_DESAPARECIO',
  _actor text DEFAULT 'sistema'
) RETURNS TABLE(excepcion_id uuid)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ahora timestamptz := now();
BEGIN
  RETURN QUERY
  WITH cerradas AS (
    UPDATE public.cierre_excepciones e
       SET estado = 'resuelta_automatica',
           cerrada_motivo = _motivo,
           motivo = _motivo,
           resuelta_at = v_ahora,
           resuelta_por = NULL,
           updated_at = v_ahora
     WHERE e.id = ANY(_ids)
       AND e.estado = 'pendiente'
    RETURNING e.id
  ), bitacora AS (
    INSERT INTO public.cierre_excepcion_bitacora (excepcion_id, user_id, accion, motivo)
    SELECT c.id, NULL, 'resuelta_automatica',
           _motivo || ' · actor: ' || _actor || ' · ' || v_ahora::text
      FROM cerradas c
    RETURNING excepcion_id
  )
  SELECT b.excepcion_id FROM bitacora b;
END $$;

-- Nueva ocurrencia atómica: alta + evento de reaparición en la MISMA transacción.
-- Idempotente: si ya existe una ocurrencia viva idéntica devuelve la existente.
CREATE OR REPLACE FUNCTION public.cierre_excepcion_crear_ocurrencia(
  _despacho_id uuid,
  _cliente_id uuid,
  _periodo text,
  _cfdi_id uuid,
  _codigo text,
  _severidad text,
  _titulo text,
  _detalle jsonb,
  _ocurrencia integer,
  _excepcion_previa_id uuid DEFAULT NULL,
  _actor text DEFAULT 'sistema'
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT e.id INTO v_id
    FROM public.cierre_excepciones e
   WHERE e.cliente_id = _cliente_id
     AND e.periodo = _periodo
     AND e.codigo = _codigo
     AND coalesce(e.cfdi_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(_cfdi_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND e.estado IN ('pendiente', 'aceptada', 'resuelta')
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.cierre_excepciones (
    despacho_id, cliente_id, periodo, cfdi_id, codigo, severidad, titulo, detalle,
    estado, ocurrencia, excepcion_previa_id, reactivada_at
  ) VALUES (
    _despacho_id, _cliente_id, _periodo, _cfdi_id, _codigo, _severidad, _titulo,
    coalesce(_detalle, '{}'::jsonb), 'pendiente', greatest(coalesce(_ocurrencia, 1), 1),
    _excepcion_previa_id,
    CASE WHEN _excepcion_previa_id IS NOT NULL THEN now() ELSE NULL END
  )
  RETURNING id INTO v_id;

  IF _excepcion_previa_id IS NOT NULL THEN
    INSERT INTO public.cierre_excepcion_bitacora (excepcion_id, user_id, accion, motivo)
    VALUES (v_id, NULL, 'reaparicion',
            'Ocurrencia ' || greatest(coalesce(_ocurrencia, 1), 1)
            || '. La causa reapareció tras un cierre automático (actor: ' || _actor || ').');
  END IF;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.cierre_excepcion_cerrar_automatica(uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cierre_excepcion_cerrar_automatica(uuid[], text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cierre_excepcion_crear_ocurrencia(uuid, uuid, text, uuid, text, text, text, jsonb, integer, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cierre_excepcion_crear_ocurrencia(uuid, uuid, text, uuid, text, text, text, jsonb, integer, uuid, text) TO service_role;