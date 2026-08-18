DELETE FROM public.sat_programaciones p
 WHERE p.ultima_corrida_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.sat_sync_runs r WHERE r.id = p.ultima_corrida_id)
   AND false;

UPDATE public.sat_programaciones p
   SET ultima_corrida_id = NULL
 WHERE p.ultima_corrida_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.sat_sync_runs r WHERE r.id = p.ultima_corrida_id);

ALTER TABLE public.sat_programaciones
  ADD CONSTRAINT sat_programaciones_ultima_corrida_id_fkey
  FOREIGN KEY (ultima_corrida_id) REFERENCES public.sat_sync_runs(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.sat_programacion_resolver_ocurrencia(
  _programacion uuid,
  _ocurrencia text,
  _programada timestamptz,
  _bloqueo timestamptz,
  _accion text,
  _resultado text DEFAULT NULL,
  _run uuid DEFAULT NULL,
  _retraso integer DEFAULT 0,
  _detalle jsonb DEFAULT '{}'::jsonb,
  _proxima timestamptz DEFAULT NULL,
  _activa boolean DEFAULT NULL,
  _avanzar boolean DEFAULT true,
  _ultimo_detalle text DEFAULT NULL,
  _marcar_ejecucion boolean DEFAULT false,
  _corrida uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_p public.sat_programaciones%ROWTYPE;
  v_bit uuid;
  v_rows integer;
  v_rol text := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
BEGIN
  IF v_rol IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Operación interna del despachador.';
  END IF;

  SELECT * INTO v_p FROM public.sat_programaciones
   WHERE id = _programacion
   FOR UPDATE;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'La programación no existe.';
  END IF;

  -- Idempotencia: ocurrencia ya resuelta. Sólo se libera el bloqueo si es
  -- el de este worker; nunca se emite un segundo recibo.
  IF v_p.ultima_ocurrencia_key IS NOT NULL AND v_p.ultima_ocurrencia_key = _ocurrencia THEN
    UPDATE public.sat_programaciones
       SET bloqueo_at = NULL
     WHERE id = v_p.id AND bloqueo_at IS NOT DISTINCT FROM _bloqueo;
    RETURN jsonb_build_object(
      'ok', true, 'estado', 'idempotente', 'bitacora_id', NULL,
      'programacion_id', v_p.id,
      'proxima_ejecucion_at', v_p.proxima_ejecucion_at,
      'ultima_ocurrencia_key', v_p.ultima_ocurrencia_key
    );
  END IF;

  -- El bloqueo debe pertenecer a esta ocurrencia/worker.
  IF v_p.bloqueo_at IS DISTINCT FROM _bloqueo THEN
    RETURN jsonb_build_object(
      'ok', false, 'estado', 'bloqueo_ajeno', 'bitacora_id', NULL,
      'programacion_id', v_p.id
    );
  END IF;

  -- Llave antigua o distinta a la ocurrencia vigente: se rechaza.
  IF v_p.proxima_ejecucion_at IS DISTINCT FROM _programada THEN
    RETURN jsonb_build_object(
      'ok', false, 'estado', 'ocurrencia_rechazada', 'bitacora_id', NULL,
      'programacion_id', v_p.id
    );
  END IF;

  INSERT INTO public.sat_programacion_bitacora (
    programacion_id, despacho_id, cliente_id, accion,
    programada_at, retraso_ms, run_id, resultado, detalle
  ) VALUES (
    v_p.id, v_p.despacho_id, v_p.cliente_id, _accion,
    _programada, COALESCE(_retraso, 0), _run, _resultado,
    COALESCE(_detalle, '{}'::jsonb) || jsonb_build_object('ocurrencia', _ocurrencia)
  ) RETURNING id INTO v_bit;

  IF v_bit IS NULL THEN
    RAISE EXCEPTION 'No se pudo registrar la bitácora de la ocurrencia.';
  END IF;

  IF _avanzar THEN
    UPDATE public.sat_programaciones SET
      bloqueo_at = NULL,
      ultima_ocurrencia_key = _ocurrencia,
      ultima_programada_at = _programada,
      proxima_ejecucion_at = _proxima,
      activa = COALESCE(_activa, activa),
      ultimo_resultado = COALESCE(_resultado, ultimo_resultado),
      ultimo_detalle = COALESCE(_ultimo_detalle, ultimo_detalle),
      ultimo_retraso_ms = COALESCE(_retraso, ultimo_retraso_ms),
      ultima_ejecucion_at = CASE WHEN _marcar_ejecucion THEN now() ELSE ultima_ejecucion_at END,
      ultima_corrida_id = CASE WHEN _marcar_ejecucion THEN _corrida ELSE ultima_corrida_id END
    WHERE id = v_p.id AND bloqueo_at IS NOT DISTINCT FROM _bloqueo;
  ELSE
    -- Encolada: no consume la ocurrencia ni avanza el calendario.
    UPDATE public.sat_programaciones SET
      bloqueo_at = NULL,
      ultimo_resultado = COALESCE(_resultado, ultimo_resultado),
      ultimo_detalle = COALESCE(_ultimo_detalle, ultimo_detalle),
      ultimo_retraso_ms = COALESCE(_retraso, ultimo_retraso_ms)
    WHERE id = v_p.id AND bloqueo_at IS NOT DISTINCT FROM _bloqueo;
  END IF;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'No se pudo actualizar la programación; la bitácora se revierte.';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'estado', CASE WHEN _avanzar THEN 'resuelta' ELSE 'encolada' END,
    'bitacora_id', v_bit,
    'programacion_id', v_p.id,
    'ultima_ocurrencia_key', CASE WHEN _avanzar THEN _ocurrencia ELSE v_p.ultima_ocurrencia_key END,
    'proxima_ejecucion_at', CASE WHEN _avanzar THEN _proxima ELSE v_p.proxima_ejecucion_at END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.sat_programacion_resolver_ocurrencia(uuid, text, timestamptz, timestamptz, text, text, uuid, integer, jsonb, timestamptz, boolean, boolean, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sat_programacion_resolver_ocurrencia(uuid, text, timestamptz, timestamptz, text, text, uuid, integer, jsonb, timestamptz, boolean, boolean, text, boolean, uuid) TO service_role;