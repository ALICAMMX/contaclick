-- Ninguna escritura directa: los estados sólo cambian por procedimiento controlado.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.conciliacion_grupos FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.conciliaciones FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.conciliacion_bitacora FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.conciliacion_corridas FROM authenticated;
REVOKE ALL ON public.conciliacion_grupos FROM anon;
REVOKE ALL ON public.conciliaciones FROM anon;
REVOKE ALL ON public.conciliacion_bitacora FROM anon;
REVOKE ALL ON public.conciliacion_corridas FROM anon;
REVOKE ALL ON public.conciliacion_importaciones FROM anon;
GRANT SELECT ON public.conciliacion_grupos TO authenticated;
GRANT SELECT ON public.conciliaciones TO authenticated;
GRANT SELECT ON public.conciliacion_bitacora TO authenticated;
GRANT SELECT ON public.conciliacion_corridas TO authenticated;
GRANT ALL ON public.conciliacion_grupos TO service_role;
GRANT ALL ON public.conciliaciones TO service_role;
GRANT ALL ON public.conciliacion_bitacora TO service_role;
GRANT ALL ON public.conciliacion_corridas TO service_role;

CREATE OR REPLACE FUNCTION public.conciliacion_ejecutar_corrida(
  _cliente_id uuid,
  _periodo text,
  _idempotency_key text,
  _input_hash text,
  _algoritmo_version text,
  _parametros jsonb,
  _grupos jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_despacho uuid;
  v_corrida uuid;
  v_existente public.conciliacion_corridas;
  g jsonb;
  v_grupo uuid;
  v_creados int := 0;
  v_omitidos int := 0;
  v_auto int := 0;
  v_prop int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión activa.'; END IF;
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'El periodo debe indicarse como AAAA-MM.';
  END IF;
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  SELECT despacho_id INTO v_despacho FROM public.clientes WHERE id = _cliente_id;
  IF v_despacho IS NULL THEN RAISE EXCEPTION 'Expediente no encontrado.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('conc:'||_cliente_id::text||':'||_periodo));

  -- Idempotencia fuerte: la misma llave devuelve exactamente el mismo resultado.
  SELECT * INTO v_existente FROM public.conciliacion_corridas
   WHERE cliente_id = _cliente_id AND idempotency_key = _idempotency_key;
  IF v_existente.id IS NOT NULL AND v_existente.estado = 'exito' THEN
    RETURN jsonb_build_object('ok', true, 'reutilizada', true,
      'corrida_id', v_existente.id, 'metricas', v_existente.metricas);
  END IF;

  INSERT INTO public.conciliacion_corridas (
    despacho_id, cliente_id, periodo, algoritmo_version, input_hash,
    idempotency_key, estado, parametros, actor
  ) VALUES (
    v_despacho, _cliente_id, _periodo, _algoritmo_version, _input_hash,
    _idempotency_key, 'corriendo', coalesce(_parametros, '{}'::jsonb), v_uid
  ) RETURNING id INTO v_corrida;

  FOR g IN SELECT * FROM jsonb_array_elements(coalesce(_grupos, '[]'::jsonb))
  LOOP
    -- Nunca duplicar: llave del grupo, ni miembros ya reservados por otro grupo activo.
    IF EXISTS (SELECT 1 FROM public.conciliacion_grupos
                WHERE cliente_id = _cliente_id AND idempotency_key = g->>'idempotency_key')
       OR EXISTS (SELECT 1 FROM public.conciliaciones
                   WHERE cliente_id = _cliente_id
                     AND estado_grupo IN ('propuesto','confirmado')
                     AND (movimiento_id = (g->>'movimiento_id')::uuid
                       OR cfdi_id = (g->>'cfdi_id')::uuid))
    THEN
      v_omitidos := v_omitidos + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.conciliacion_grupos (
      despacho_id, cliente_id, periodo, corrida_id, tipo, origen, estado,
      probabilidad_bp, importe_banco_centavos, importe_cfdi_centavos, diferencia_centavos,
      evidencia, motivo, regla, version, confirmado_at, idempotency_key
    ) VALUES (
      v_despacho, _cliente_id, _periodo, v_corrida, 'uno_a_uno', 'motor',
      g->>'estado',
      (g->>'probabilidad_bp')::int,
      (g->>'importe_banco_centavos')::bigint,
      (g->>'importe_cfdi_centavos')::bigint,
      (g->>'diferencia_centavos')::bigint,
      coalesce(g->'evidencia', '{}'::jsonb),
      g->>'motivo',
      coalesce(g->'evidencia'->>'regla', 'motor'),
      _algoritmo_version,
      CASE WHEN g->>'estado' = 'confirmado' THEN now() END,
      g->>'idempotency_key'
    ) RETURNING id INTO v_grupo;

    INSERT INTO public.conciliaciones (
      despacho_id, cliente_id, movimiento_id, cfdi_id, grupo_id, corrida_id,
      periodo, asignado_centavos, tipo_match, probabilidad, diferencia, motivo
    ) VALUES (
      v_despacho, _cliente_id, (g->>'movimiento_id')::uuid, (g->>'cfdi_id')::uuid,
      v_grupo, v_corrida, _periodo, (g->>'importe_cfdi_centavos')::bigint,
      'uno_a_uno', ((g->>'probabilidad_bp')::numeric / 10000), 0, g->>'motivo'
    );

    INSERT INTO public.conciliacion_bitacora (
      despacho_id, cliente_id, periodo, grupo_id, movimiento_id, accion,
      estado_nuevo, motivo, actor, detalle
    ) VALUES (
      v_despacho, _cliente_id, _periodo, v_grupo, (g->>'movimiento_id')::uuid,
      'motor', g->>'estado', g->>'motivo', v_uid,
      jsonb_build_object('corrida_id', v_corrida, 'evidencia', g->'evidencia')
    );

    v_creados := v_creados + 1;
    IF g->>'estado' = 'confirmado' THEN v_auto := v_auto + 1; ELSE v_prop := v_prop + 1; END IF;
  END LOOP;

  UPDATE public.conciliacion_corridas
     SET estado = 'exito', fin_at = now(),
         metricas = jsonb_build_object(
           'grupos_creados', v_creados, 'omitidos', v_omitidos,
           'automaticos', v_auto, 'propuestos', v_prop)
   WHERE id = v_corrida;

  IF v_auto > 0 OR v_creados > 0 THEN
    PERFORM public.cierre_reabrir_cascada(_cliente_id, _periodo, 'conciliacion_corrida',
      'Nueva corrida del motor de conciliación bancaria.', 'conciliacion_corrida',
      v_corrida::text, 'corrida:'||v_corrida::text);
  END IF;

  RETURN jsonb_build_object('ok', true, 'reutilizada', false, 'corrida_id', v_corrida,
    'metricas', jsonb_build_object('grupos_creados', v_creados, 'omitidos', v_omitidos,
      'automaticos', v_auto, 'propuestos', v_prop));
END; $$;

REVOKE ALL ON FUNCTION public.conciliacion_ejecutar_corrida(uuid, text, text, text, text, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.conciliacion_ejecutar_corrida(uuid, text, text, text, text, jsonb, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.conciliacion_confirmar_grupo(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.conciliacion_rechazar_grupo(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.conciliacion_revertir_grupo(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.conciliacion_ignorar_movimiento(uuid, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.conciliacion_confirmar_grupo(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conciliacion_rechazar_grupo(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conciliacion_revertir_grupo(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conciliacion_ignorar_movimiento(uuid, text, boolean) TO authenticated, service_role;