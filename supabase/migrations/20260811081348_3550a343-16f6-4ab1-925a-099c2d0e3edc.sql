CREATE OR REPLACE FUNCTION public.cierre_normativa_canonica(_n jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT string_agg(linea, E'\n' ORDER BY ord, linea)
  FROM (
    SELECT 0::bigint AS ord, 'sello-normativo@1'::text AS linea
    UNION ALL
    SELECT row_number() OVER (
             ORDER BY ((c->>'proposito') || '|' || (c->>'conjuntoId')) COLLATE "C"
           )::bigint AS ord,
           (SELECT string_agg(t.k || '=' || t.v, ';' ORDER BY t.k COLLATE "C")
              FROM jsonb_each_text(c) AS t(k, v)) AS linea
    FROM jsonb_array_elements(coalesce(_n->'conjuntos', '[]'::jsonb)) c
  ) q;
$$;

REVOKE ALL ON FUNCTION public.cierre_normativa_canonica(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_normativa_canonica(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cierre_registrar_resultado_fiscal_srv(
  _cliente_id uuid,
  _periodo text,
  _solicitado_por uuid,
  _regimen text,
  _motor_version text,
  _normativa jsonb,
  _normativa_sha256 text,
  _entradas jsonb,
  _input_hash text,
  _resultado jsonb,
  _fundamentos jsonb,
  _fuentes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_desp uuid; v_esperado text; v_id uuid; v_rol text := coalesce(auth.role(), current_user);
        v_canonico text; v_sha text;
BEGIN
  -- Sólo un proceso interno de confianza escribe resultados fiscales.
  IF auth.uid() IS NOT NULL OR v_rol NOT IN ('service_role','supabase_admin','postgres') THEN
    RAISE EXCEPTION 'El resultado fiscal sólo puede escribirlo el proceso interno de cálculo.';
  END IF;
  IF _solicitado_por IS NULL THEN RAISE EXCEPTION 'Falta el usuario solicitante del cálculo.'; END IF;

  SELECT despacho_id INTO v_desp FROM public.clientes WHERE id = _cliente_id;
  IF v_desp IS NULL THEN RAISE EXCEPTION 'Expediente inexistente.'; END IF;
  IF _regimen IS NULL OR btrim(_regimen) = '' THEN RAISE EXCEPTION 'Sin régimen no puede registrarse un resultado fiscal.'; END IF;
  IF coalesce(_normativa_sha256,'') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'La huella normativa no es un SHA-256 válido.';
  END IF;
  IF coalesce(_motor_version,'') = '' THEN RAISE EXCEPTION 'Falta la versión del motor fiscal.'; END IF;

  -- La huella normativa se RECALCULA sobre la representación canónica del
  -- contenido recibido: no basta que sean 64 hexadecimales bien formados.
  IF _normativa IS NULL OR jsonb_typeof(coalesce(_normativa->'conjuntos','null'::jsonb)) <> 'array'
     OR jsonb_array_length(_normativa->'conjuntos') = 0 THEN
    RAISE EXCEPTION 'El contenido normativo aplicado está vacío: no puede sellarse un resultado sin normativa.';
  END IF;
  v_canonico := public.cierre_normativa_canonica(_normativa);
  v_sha := encode(sha256(convert_to(v_canonico, 'UTF8')), 'hex');
  IF v_sha IS DISTINCT FROM _normativa_sha256 THEN
    RAISE EXCEPTION 'La huella normativa no corresponde al contenido normativo enviado.';
  END IF;
  IF coalesce(_normativa->>'sha256','') IS DISTINCT FROM _normativa_sha256 THEN
    RAISE EXCEPTION 'El contenido normativo declara una huella distinta a la recibida.';
  END IF;

  -- La huella de entradas se recalcula aquí: el llamador no puede imponerla.
  v_esperado := (public.cierre_entradas_fiscales(_cliente_id, _periodo))->>'input_hash';
  IF _input_hash IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'La evidencia cambió durante el cálculo: vuelva a calcular.';
  END IF;

  INSERT INTO public.cierre_resultado_fiscal (despacho_id, cliente_id, periodo, regimen, motor_version,
    normativa, normativa_sha256, entradas, input_hash, resultado, fundamentos, fuentes,
    calculado_por, solicitado_por, solicitado_en, escritor)
  VALUES (v_desp, _cliente_id, _periodo, _regimen, _motor_version,
    coalesce(_normativa,'{}'::jsonb), _normativa_sha256, coalesce(_entradas,'{}'::jsonb), _input_hash,
    coalesce(_resultado,'{}'::jsonb), coalesce(_fundamentos,'[]'::jsonb), coalesce(_fuentes,'[]'::jsonb),
    _solicitado_por, _solicitado_por, now(), 'servidor_confiable')
  ON CONFLICT (cliente_id, periodo, input_hash) DO UPDATE
     SET resultado = excluded.resultado,
         solicitado_por = excluded.solicitado_por,
         solicitado_en = now()
  RETURNING id INTO v_id;

  INSERT INTO public.cierre_eventos (despacho_id, cliente_id, periodo, etapa, evento, actor_user_id,
    proceso, motivo, fuente, referencia_tipo, referencia_id, input_hash)
  VALUES (v_desp, _cliente_id, _periodo, 'impuestos', 'resultado_fiscal_registrado', _solicitado_por,
    'motor_fiscal_servidor',
    format('Régimen %s · motor %s · normativa %s', _regimen, _motor_version, left(_normativa_sha256,12)),
    'servidor_confiable', 'cierre_resultado_fiscal', v_id::text, _input_hash);

  RETURN public.cierre_evaluar_impuestos(_cliente_id, _periodo) || jsonb_build_object('resultado_fiscal_id', v_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.cierre_registrar_resultado_fiscal_srv(uuid, text, uuid, text, text, jsonb, text, jsonb, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cierre_registrar_resultado_fiscal_srv(uuid, text, uuid, text, text, jsonb, text, jsonb, text, jsonb, jsonb, jsonb) TO service_role;