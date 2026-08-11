CREATE OR REPLACE FUNCTION public.cierre_reabrir_cascada(
  _cliente_id uuid, _periodo text, _disparador text, _motivo text,
  _referencia_tipo text DEFAULT NULL, _referencia_id text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL)
RETURNS TABLE(etapa text, estado_anterior text, version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _despacho uuid;
  _etapas text[];
  _e text;
  _fila public.cierre_etapas;
  _uid uuid := auth.uid();
BEGIN
  SELECT c.despacho_id INTO _despacho FROM public.clientes c WHERE c.id = _cliente_id;
  IF _despacho IS NULL THEN RAISE EXCEPTION 'Expediente inexistente'; END IF;
  IF auth.role() <> 'service_role' THEN
    IF _uid IS NULL OR NOT public.is_member_of(_despacho) OR NOT public.has_cliente_access(_cliente_id) THEN
      RAISE EXCEPTION 'Sin acceso al expediente';
    END IF;
  END IF;

  _etapas := CASE _disparador
    WHEN 'cfdi'          THEN ARRAY['documentos','clasificacion','bancos','polizas','impuestos','cierre']
    WHEN 'clasificacion' THEN ARRAY['clasificacion','polizas','impuestos','cierre']
    WHEN 'banco'         THEN ARRAY['bancos','polizas','impuestos','cierre']
    WHEN 'poliza'        THEN ARRAY['polizas','impuestos','cierre']
    WHEN 'parametro_fiscal' THEN ARRAY['impuestos','cierre']
    ELSE NULL END;
  IF _etapas IS NULL THEN RAISE EXCEPTION 'Disparador desconocido: %', _disparador; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_cliente_id::text || _periodo, 0));

  IF _idempotency_key IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.cierre_eventos ev
      WHERE ev.cliente_id = _cliente_id AND ev.periodo = _periodo
        AND ev.evento = 'reapertura' AND ev.idempotency_key = _idempotency_key) THEN
    RETURN;
  END IF;

  FOREACH _e IN ARRAY _etapas LOOP
    -- Se califican TODAS las columnas: los parámetros de salida (etapa, version,
    -- estado_anterior) tienen el mismo nombre que columnas de la tabla.
    SELECT ce.* INTO _fila FROM public.cierre_etapas ce
      WHERE ce.cliente_id = _cliente_id AND ce.periodo = _periodo AND ce.etapa = _e
      FOR UPDATE;
    IF _fila.id IS NULL THEN CONTINUE; END IF;
    IF _fila.estado NOT IN ('lista','aprobada') THEN CONTINUE; END IF;

    UPDATE public.cierre_etapas ce SET
      estado = 'reabierta', version = _fila.version + 1, lista_at = NULL,
      aprobada_at = NULL, aprobada_por = NULL, motivo = _motivo, updated_at = now()
    WHERE ce.id = _fila.id;

    INSERT INTO public.cierre_eventos (
      despacho_id, cliente_id, periodo, etapa, evento, estado_anterior, estado_nuevo,
      actor_user_id, proceso, motivo, fuente, referencia_tipo, referencia_id, version, idempotency_key
    ) VALUES (
      _despacho, _cliente_id, _periodo, _e, 'reapertura', _fila.estado, 'reabierta',
      _uid, CASE WHEN _uid IS NULL THEN 'sistema' ELSE 'usuario' END, _motivo, _disparador,
      _referencia_tipo, _referencia_id, _fila.version + 1, _idempotency_key
    ) ON CONFLICT DO NOTHING;

    etapa := _e; estado_anterior := _fila.estado; version := _fila.version + 1;
    RETURN NEXT;
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cierre_reabrir_cascada(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_reabrir_cascada(uuid, text, text, text, text, text, text) TO authenticated, service_role;