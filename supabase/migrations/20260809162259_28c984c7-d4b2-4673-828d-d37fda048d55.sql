DROP FUNCTION IF EXISTS public.cierre_excepcion_cerrar_automatica(uuid[], text, text);

CREATE OR REPLACE FUNCTION public.cierre_excepcion_cerrar_automatica(
  _ids uuid[],
  _motivo text DEFAULT 'CAUSA_DESAPARECIO',
  _actor text DEFAULT 'sistema'
) RETURNS TABLE(cerrada_id uuid)
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
    RETURNING cierre_excepcion_bitacora.excepcion_id AS bid
  )
  SELECT b.bid FROM bitacora b;
END $$;

GRANT EXECUTE ON FUNCTION public.cierre_excepcion_cerrar_automatica(uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cierre_excepcion_cerrar_automatica(uuid[], text, text) TO service_role;