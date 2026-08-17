CREATE OR REPLACE FUNCTION public.conciliacion_ejecutar_corrida(_cliente_id uuid, _periodo text, _actor uuid, _idempotency_key text, _input_hash text, _algoritmo_version text, _parametros jsonb, _grupos jsonb, _dias_ventana integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_despacho uuid; v_corrida uuid; v_existente public.conciliacion_corridas;
  g jsonb; v_grupo uuid;
  v_mov public.movimientos_bancarios; v_cfdi public.cfdi_xml;
  v_ini date; v_fin date;
  v_mov_cent bigint; v_cfdi_cent bigint; v_dir text; v_bp int; v_nivel text;
  v_creados int := 0; v_omitidos int := 0; v_alta int := 0; v_rev int := 0;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IN ('authenticated','anon')
     OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Escritor interno: sólo puede invocarse desde el servidor de ContaClick.';
  END IF;
  IF _actor IS NULL THEN RAISE EXCEPTION 'Se requiere el actor autenticado.'; END IF;
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'El periodo debe indicarse como AAAA-MM.'; END IF;

  SELECT despacho_id INTO v_despacho FROM public.clientes WHERE id = _cliente_id;
  IF v_despacho IS NULL THEN RAISE EXCEPTION 'Expediente no encontrado.'; END IF;

  v_ini := to_date(_periodo||'-01','YYYY-MM-DD');
  v_fin := (v_ini + interval '1 month')::date;

  PERFORM pg_advisory_xact_lock(hashtext('conc:'||_cliente_id::text||':'||_periodo));

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
    _idempotency_key, 'corriendo', coalesce(_parametros,'{}'::jsonb), _actor
  ) RETURNING id INTO v_corrida;

  FOR g IN SELECT * FROM jsonb_array_elements(coalesce(_grupos,'[]'::jsonb))
  LOOP
    IF coalesce(g->>'tipo','uno_a_uno') <> 'uno_a_uno' THEN
      RAISE EXCEPTION 'El Bloque 1 sólo admite grupos uno_a_uno.';
    END IF;
    IF coalesce(g->>'estado','propuesto') <> 'propuesto' THEN
      RAISE EXCEPTION 'El motor sólo puede proponer: estado recibido %.', g->>'estado';
    END IF;
    v_nivel := coalesce(g->>'nivel_propuesta','revision_requerida');
    IF v_nivel NOT IN ('automatica_alta_confianza','revision_requerida') THEN
      RAISE EXCEPTION 'Nivel de propuesta inválido: %.', v_nivel;
    END IF;
    v_bp := (g->>'probabilidad_bp')::int;
    IF v_bp IS NULL OR v_bp < 0 OR v_bp > 10000 THEN
      RAISE EXCEPTION 'Probabilidad fuera de rango: %.', g->>'probabilidad_bp';
    END IF;
    IF coalesce(g->'evidencia'->>'version','') = '' OR coalesce(g->'evidencia'->>'regla','') = '' THEN
      RAISE EXCEPTION 'La evidencia debe incluir versión y regla.';
    END IF;

    SELECT * INTO v_mov FROM public.movimientos_bancarios WHERE id = (g->>'movimiento_id')::uuid;
    IF v_mov.id IS NULL THEN RAISE EXCEPTION 'Movimiento inexistente.'; END IF;
    SELECT * INTO v_cfdi FROM public.cfdi_xml WHERE id = (g->>'cfdi_id')::uuid;
    IF v_cfdi.id IS NULL THEN RAISE EXCEPTION 'Comprobante inexistente.'; END IF;

    IF v_mov.cliente_id <> _cliente_id OR v_mov.despacho_id <> v_despacho
       OR v_cfdi.cliente_id <> _cliente_id OR v_cfdi.despacho_id <> v_despacho THEN
      RAISE EXCEPTION 'Referencia cruzada a otro expediente o despacho: operación rechazada.';
    END IF;
    IF v_mov.fecha < v_ini OR v_mov.fecha >= v_fin THEN
      RAISE EXCEPTION 'El movimiento no pertenece al periodo %.', _periodo;
    END IF;
    IF v_cfdi.fecha::date < (v_ini - make_interval(days => greatest(_dias_ventana,0)))
       OR v_cfdi.fecha::date >= (v_fin + make_interval(days => greatest(_dias_ventana,0))) THEN
      RAISE EXCEPTION 'El comprobante queda fuera del alcance temporal del motor.';
    END IF;
    IF v_mov.ignorado_at IS NOT NULL OR v_mov.no_fiscal THEN
      RAISE EXCEPTION 'El movimiento está ignorado o marcado como no fiscal.';
    END IF;
    IF upper(coalesce(v_mov.moneda,'MXN')) <> upper(coalesce(v_cfdi.moneda,'MXN')) THEN
      RAISE EXCEPTION 'Moneda incompatible entre movimiento y comprobante.';
    END IF;

    v_dir := CASE WHEN coalesce(v_mov.abono,0) > 0 THEN 'emitido' ELSE 'recibido' END;
    IF coalesce(v_cfdi.direccion,'') <> v_dir THEN
      RAISE EXCEPTION 'Dirección incompatible: el movimiento exige un comprobante %.', v_dir;
    END IF;

    v_mov_cent := v_mov.importe_centavos;
    v_cfdi_cent := round(coalesce(v_cfdi.total,0) * 100)::bigint;
    IF v_mov_cent <> (g->>'importe_banco_centavos')::bigint
       OR v_cfdi_cent <> (g->>'importe_cfdi_centavos')::bigint THEN
      RAISE EXCEPTION 'Importes del mensaje no coinciden con las filas reales.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.conciliacion_grupos
                WHERE cliente_id = _cliente_id AND idempotency_key = g->>'idempotency_key')
       OR EXISTS (SELECT 1 FROM public.conciliaciones
                   WHERE cliente_id = _cliente_id
                     AND estado_grupo IN ('propuesto','confirmado')
                     AND (movimiento_id = v_mov.id OR cfdi_id = v_cfdi.id))
    THEN
      v_omitidos := v_omitidos + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.conciliacion_grupos (
      despacho_id, cliente_id, periodo, corrida_id, tipo, origen, estado, nivel_propuesta,
      probabilidad_bp, importe_banco_centavos, importe_cfdi_centavos, diferencia_centavos,
      evidencia, motivo, regla, version, idempotency_key
    ) VALUES (
      v_despacho, _cliente_id, _periodo, v_corrida, 'uno_a_uno', 'motor', 'propuesto', v_nivel,
      v_bp, v_mov_cent, v_cfdi_cent, v_mov_cent - v_cfdi_cent,
      coalesce(g->'evidencia','{}'::jsonb), g->>'motivo',
      g->'evidencia'->>'regla', _algoritmo_version, g->>'idempotency_key'
    ) RETURNING id INTO v_grupo;

    INSERT INTO public.conciliaciones (
      despacho_id, cliente_id, movimiento_id, cfdi_id, grupo_id, corrida_id,
      periodo, asignado_centavos, tipo_match, probabilidad, diferencia, motivo
    ) VALUES (
      v_despacho, _cliente_id, v_mov.id, v_cfdi.id, v_grupo, v_corrida,
      _periodo, v_cfdi_cent, 'uno_a_uno', (v_bp::numeric / 10000), 0, g->>'motivo'
    );

    -- Bitácora canónica: la creación automática es una 'propuesta'.
    -- El carácter automático vive en conciliacion_grupos.origen='motor' y en el detalle.
    INSERT INTO public.conciliacion_bitacora (
      despacho_id, cliente_id, periodo, grupo_id, movimiento_id, accion,
      estado_nuevo, motivo, actor, detalle
    ) VALUES (
      v_despacho, _cliente_id, _periodo, v_grupo, v_mov.id, 'propuesta',
      'propuesto', g->>'motivo', _actor,
      jsonb_build_object(
        'origen', 'motor',
        'algoritmo_version', _algoritmo_version,
        'corrida_id', v_corrida,
        'nivel_propuesta', v_nivel,
        'probabilidad_bp', v_bp,
        'evidencia', coalesce(g->'evidencia','{}'::jsonb))
    );

    v_creados := v_creados + 1;
    IF v_nivel = 'automatica_alta_confianza' THEN v_alta := v_alta + 1; ELSE v_rev := v_rev + 1; END IF;
  END LOOP;

  UPDATE public.conciliacion_corridas
     SET estado = 'exito', fin_at = now(),
         metricas = jsonb_build_object(
           'grupos_creados', v_creados, 'grupos_omitidos', v_omitidos,
           'propuestas_alta_confianza', v_alta, 'propuestas_revision', v_rev)
   WHERE id = v_corrida;

  RETURN jsonb_build_object('ok', true, 'reutilizada', false, 'corrida_id', v_corrida,
    'metricas', jsonb_build_object('grupos_creados', v_creados, 'grupos_omitidos', v_omitidos,
      'propuestas_alta_confianza', v_alta, 'propuestas_revision', v_rev));
END; $function$;