-- ═══════════════════════════════════════════════════════════════════════════
-- 1) CONTRATO ÚNICO DE AUTORIZACIÓN PARA FUNCIONES SECURITY DEFINER
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cierre_autorizar_expediente(_cliente_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_desp uuid;
  v_rol  text := coalesce(auth.role(), current_user);
BEGIN
  IF _cliente_id IS NULL THEN RAISE EXCEPTION 'Expediente inexistente.'; END IF;
  SELECT despacho_id INTO v_desp FROM public.clientes WHERE id = _cliente_id;
  IF v_desp IS NULL THEN RAISE EXCEPTION 'Expediente inexistente.'; END IF;

  -- Proceso interno de confianza.
  IF auth.uid() IS NULL THEN
    IF v_rol IN ('service_role','supabase_admin','postgres') THEN
      RETURN v_desp;
    END IF;
    RAISE EXCEPTION 'Sin acceso al expediente.';
  END IF;

  IF v_rol = 'anon' THEN RAISE EXCEPTION 'Sin acceso al expediente.'; END IF;

  IF NOT (public.is_member_of(v_desp) AND public.has_cliente_access(_cliente_id)) THEN
    RAISE EXCEPTION 'Sin acceso al expediente.';
  END IF;
  RETURN v_desp;
END; $$;

REVOKE ALL ON FUNCTION public.cierre_autorizar_expediente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_autorizar_expediente(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) CANONICALIZACIÓN VERIFICABLE (claves ordenadas, sin espacios)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cierre_canonizar(_v jsonb)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE jsonb_typeof(_v)
    WHEN 'object' THEN '{' || coalesce((
        SELECT string_agg(to_json(k.key)::text || ':' || public.cierre_canonizar(_v -> k.key), ',' ORDER BY k.key)
        FROM jsonb_object_keys(_v) AS k(key)), '') || '}'
    WHEN 'array' THEN '[' || coalesce((
        SELECT string_agg(public.cierre_canonizar(e.value), ',' ORDER BY e.ord)
        FROM jsonb_array_elements(_v) WITH ORDINALITY AS e(value, ord)), '') || ']'
    WHEN 'null' THEN 'null'
    ELSE _v::text
  END;
$$;

REVOKE ALL ON FUNCTION public.cierre_canonizar(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_canonizar(jsonb) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) MANIFIESTO Y BLOQUEOS CON GUARDIA DE AISLAMIENTO
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cierre_manifiesto(_cliente_id uuid, _periodo text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ini date; v_fin date; v_m jsonb;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;
  v_ini := to_date(_periodo||'-01', 'YYYY-MM-DD');
  v_fin := (v_ini + interval '1 month')::date;

  SELECT jsonb_build_object(
    'cliente_id', _cliente_id,
    'periodo', _periodo,
    'rango', jsonb_build_object('desde', v_ini, 'hasta_exclusivo', v_fin),
    'manifiesto_version', 'manifiesto@2',

    'cfdi', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'uuid', upper(c.uuid), 'direccion', c.direccion,
        'estatus_sat', coalesce(c.estatus_sat,'desconocido'),
        'estatus_sat_fuente', c.estatus_sat_fuente,
        'total_centavos', round(coalesce(c.total,0) * 100)::bigint,
        'iva_trasladado_centavos', round(coalesce(c.iva_trasladado,0) * 100)::bigint,
        'clase_documental', c.clase_documental,
        'hash_xml', encode(sha256(convert_to(coalesce(c.xml_raw, c.uuid), 'UTF8')), 'hex')
      ) ORDER BY upper(c.uuid))
      FROM public.cfdi_xml c
      WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo), '[]'::jsonb),

    'decisiones', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'historial_id', d.historial_id, 'cfdi_id', d.cfdi_id, 'version', d.version,
        'decision', d.decision, 'porcentaje', d.porcentaje_deducible,
        'origen', d.origen, 'actor', d.decidida_por, 'input_hash', d.input_hash
      ) ORDER BY d.cfdi_id)
      FROM public.cfdi_decisiones_fiscales d
      WHERE d.cliente_id = _cliente_id AND d.periodo = _periodo), '[]'::jsonb),

    'movimientos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'cuenta_id', m.cuenta_id, 'fecha', m.fecha,
        'cargo_centavos', round(coalesce(m.cargo,0) * 100)::bigint,
        'abono_centavos', round(coalesce(m.abono,0) * 100)::bigint,
        'hash', m.hash
      ) ORDER BY m.id)
      FROM public.movimientos_bancarios m
      WHERE m.cliente_id = _cliente_id AND m.fecha >= v_ini AND m.fecha < v_fin), '[]'::jsonb),

    'conciliaciones', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', k.id, 'movimiento_id', k.movimiento_id, 'cfdi_id', k.cfdi_id,
        'tipo_match', k.tipo_match, 'estatus', k.estatus,
        'diferencia_centavos', round(coalesce(k.diferencia,0) * 100)::bigint,
        'motivo', k.motivo, 'confirmado_por', k.confirmado_por, 'confirmado_at', k.confirmado_at
      ) ORDER BY k.id)
      FROM public.conciliaciones k
      JOIN public.movimientos_bancarios m ON m.id = k.movimiento_id
      WHERE k.cliente_id = _cliente_id AND m.fecha >= v_ini AND m.fecha < v_fin), '[]'::jsonb),

    'polizas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'tipo', p.tipo, 'fecha', p.fecha, 'estado', p.estado,
        'monto_centavos', round(coalesce(p.monto,0) * 100)::bigint,
        'cuenta', p.cuenta, 'origen', p.origen, 'referencia', p.referencia,
        'cfdi_id', p.cfdi_id, 'movimiento_bancario_id', p.movimiento_bancario_id
      ) ORDER BY p.id)
      FROM public.polizas p
      WHERE p.cliente_id = _cliente_id AND p.fecha >= v_ini AND p.fecha < v_fin), '[]'::jsonb),

    'excepciones', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'codigo', x.codigo, 'severidad', x.severidad, 'estado', x.estado,
        'motivo', x.motivo, 'resuelta_por', x.resuelta_por, 'resuelta_at', x.resuelta_at
      ) ORDER BY x.id)
      FROM public.cierre_excepciones x
      WHERE x.cliente_id = _cliente_id AND x.periodo = _periodo), '[]'::jsonb),

    'etapas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'etapa', e.etapa, 'estado', e.estado, 'cobertura', e.cobertura,
        'version', e.version, 'motivo', e.motivo,
        'evaluador_version', e.evaluador_version, 'input_hash', e.input_hash,
        'aprobada_por', e.aprobada_por, 'aprobada_at', e.aprobada_at
      ) ORDER BY e.etapa)
      FROM public.cierre_etapas e
      WHERE e.cliente_id = _cliente_id AND e.periodo = _periodo), '[]'::jsonb)
  ) INTO v_m;

  RETURN v_m;
END; $$;

CREATE OR REPLACE FUNCTION public.cierre_bloqueos(_cliente_id uuid, _periodo text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_b jsonb := '[]'::jsonb; v_etapa text; v_row record; v_n bigint;
  v_ini date; v_fin date;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;
  v_ini := to_date(_periodo||'-01','YYYY-MM-DD');
  v_fin := (v_ini + interval '1 month')::date;

  FOREACH v_etapa IN ARRAY ARRAY['documentos','clasificacion','bancos','polizas','impuestos'] LOOP
    SELECT * INTO v_row FROM public.cierre_etapas
      WHERE cliente_id = _cliente_id AND periodo = _periodo AND etapa = v_etapa;
    IF NOT FOUND OR v_row.estado NOT IN ('lista','aprobada','no_aplica') THEN
      v_b := v_b || jsonb_build_object('codigo','etapa_'||v_etapa,
        'detalle','La etapa “'||v_etapa||'” está en estado “'||coalesce(v_row.estado,'no_iniciada')||'”.');
    ELSIF v_row.estado = 'no_aplica' AND length(btrim(coalesce(v_row.motivo,''))) < 10 THEN
      v_b := v_b || jsonb_build_object('codigo','motivo_'||v_etapa,
        'detalle','La etapa “'||v_etapa||'” se marcó “no aplica” sin motivo suficiente.');
    END IF;
  END LOOP;

  -- La evidencia manda sobre la fila: si la clasificación cambió, la etapa
  -- marcada lista deja de valer aunque siga escrita como lista.
  SELECT * INTO v_row FROM public.cierre_etapas
    WHERE cliente_id = _cliente_id AND periodo = _periodo AND etapa = 'clasificacion';
  IF FOUND AND v_row.estado IN ('lista','aprobada') THEN
    DECLARE v_eval jsonb;
    BEGIN
      v_eval := public.cierre_evaluar_clasificacion(_cliente_id, _periodo);
      IF coalesce(v_eval->>'input_hash','') IS DISTINCT FROM coalesce(v_row.input_hash,'') THEN
        v_b := v_b || jsonb_build_object('codigo','evidencia_cambiada_clasificacion',
          'detalle','La clasificación fiscal cambió después de declararse lista: debe reevaluarse.');
      END IF;
    END;
  END IF;

  SELECT count(*) INTO v_n FROM public.cierre_excepciones
    WHERE cliente_id = _cliente_id AND periodo = _periodo
      AND estado NOT IN ('resuelta','cerrada','descartada');
  IF v_n > 0 THEN
    v_b := v_b || jsonb_build_object('codigo','excepciones_pendientes',
      'detalle', v_n||' excepciones documentales sin decisión.');
  END IF;

  SELECT count(*) INTO v_n FROM public.polizas
    WHERE cliente_id = _cliente_id AND fecha >= v_ini AND fecha < v_fin
      AND (coalesce(estado,'borrador') <> 'aprobada'
           OR cuenta IS NULL OR btrim(cuenta) = '' OR cuenta ILIKE '%por identificar%');
  IF v_n > 0 THEN
    v_b := v_b || jsonb_build_object('codigo','polizas_bloqueadas',
      'detalle', v_n||' pólizas en borrador, rechazadas o con cuenta por identificar.');
  END IF;

  SELECT count(*) INTO v_n FROM public.cfdi_xml
    WHERE cliente_id = _cliente_id AND periodo = _periodo;
  IF v_n = 0 THEN
    v_b := v_b || jsonb_build_object('codigo','sin_documentos',
      'detalle','El periodo no tiene comprobantes: no hay nada que sellar.');
  END IF;

  RETURN v_b;
END; $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) HUELLA, RESUMEN Y ESTADO CANÓNICOS
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cierre_huella(_man jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT encode(sha256(convert_to(public.cierre_canonizar(_man), 'UTF8')), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.cierre_resumen(_man jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'cfdi_total', jsonb_array_length(_man->'cfdi'),
    'cfdi_emitidos', (SELECT count(*) FROM jsonb_array_elements(_man->'cfdi') c WHERE c->>'direccion' = 'emitido'),
    'cfdi_recibidos', (SELECT count(*) FROM jsonb_array_elements(_man->'cfdi') c WHERE c->>'direccion' = 'recibido'),
    'ingresos_centavos', (SELECT coalesce(sum((c->>'total_centavos')::bigint),0) FROM jsonb_array_elements(_man->'cfdi') c WHERE c->>'direccion' = 'emitido'),
    'egresos_centavos', (SELECT coalesce(sum((c->>'total_centavos')::bigint),0) FROM jsonb_array_elements(_man->'cfdi') c WHERE c->>'direccion' = 'recibido'),
    'iva_trasladado_centavos', (SELECT coalesce(sum((c->>'iva_trasladado_centavos')::bigint),0) FROM jsonb_array_elements(_man->'cfdi') c WHERE c->>'direccion' = 'emitido'),
    'iva_acreditable_centavos', (SELECT coalesce(sum((c->>'iva_trasladado_centavos')::bigint),0) FROM jsonb_array_elements(_man->'cfdi') c WHERE c->>'direccion' = 'recibido'),
    'movimientos', jsonb_array_length(_man->'movimientos'),
    'conciliaciones', jsonb_array_length(_man->'conciliaciones'),
    'polizas', jsonb_array_length(_man->'polizas'),
    'polizas_bloqueadas', (SELECT count(*) FROM jsonb_array_elements(_man->'polizas') p
      WHERE coalesce(p->>'estado','borrador') <> 'aprobada'
         OR coalesce(btrim(p->>'cuenta'),'') = '' OR (p->>'cuenta') ILIKE '%por identificar%'),
    'decisiones', jsonb_array_length(_man->'decisiones'),
    'excepciones_pendientes', (SELECT count(*) FROM jsonb_array_elements(_man->'excepciones') x
      WHERE x->>'estado' NOT IN ('resuelta','cerrada','descartada')));
$$;

REVOKE ALL ON FUNCTION public.cierre_huella(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cierre_resumen(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_huella(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cierre_resumen(jsonb) TO authenticated, service_role;

-- Estado completo: única lectura que usa la UI. Nunca "último sello" a secas.
CREATE OR REPLACE FUNCTION public.cierre_estado(_cliente_id uuid, _periodo text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_man jsonb; v_huella text; v_ultimo public.cierre_snapshots;
  v_vigente jsonb := NULL; v_obsoleto jsonb := NULL; v_difs jsonb := '[]'::jsonb;
  v_sec text;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  v_man := public.cierre_manifiesto(_cliente_id, _periodo);
  v_huella := public.cierre_huella(v_man);

  SELECT * INTO v_ultimo FROM public.cierre_snapshots
   WHERE cliente_id = _cliente_id AND periodo = _periodo
   ORDER BY version DESC LIMIT 1;

  IF FOUND THEN
    IF v_ultimo.huella = v_huella THEN
      v_vigente := to_jsonb(v_ultimo);
    ELSE
      FOREACH v_sec IN ARRAY ARRAY['cfdi','decisiones','movimientos','conciliaciones','polizas','excepciones','etapas'] LOOP
        IF public.cierre_canonizar(coalesce(v_ultimo.manifiesto->v_sec,'null'::jsonb))
           IS DISTINCT FROM public.cierre_canonizar(coalesce(v_man->v_sec,'null'::jsonb)) THEN
          v_difs := v_difs || to_jsonb(v_sec);
        END IF;
      END LOOP;
      v_obsoleto := to_jsonb(v_ultimo) || jsonb_build_object(
        'causa','La evidencia del periodo cambió después del sellado.',
        'diferencias', v_difs);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'periodo', _periodo,
    'evaluador', 'manifiesto@2',
    'etapas', v_man->'etapas',
    'resumen', public.cierre_resumen(v_man),
    'bloqueos', public.cierre_bloqueos(_cliente_id, _periodo),
    'huella_actual', v_huella,
    'sello_vigente', v_vigente,
    'sello_obsoleto', v_obsoleto,
    'sellos', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'version', s.version, 'motivo', s.motivo, 'huella', s.huella,
        'resumen', s.resumen, 'created_at', s.created_at, 'sellado_por', s.sellado_por,
        'vigente', s.huella = v_huella) ORDER BY s.version DESC)
      FROM public.cierre_snapshots s
      WHERE s.cliente_id = _cliente_id AND s.periodo = _periodo), '[]'::jsonb));
END; $$;

REVOKE ALL ON FUNCTION public.cierre_estado(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_estado(uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cierre_manifiesto(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_manifiesto(uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cierre_bloqueos(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_bloqueos(uuid,text) TO authenticated, service_role;

-- Sellado: usa la misma canonicalización que la lectura.
CREATE OR REPLACE FUNCTION public.cierre_sellar_manifiesto(_cliente_id uuid, _periodo text, _motivo text, _idempotency_key text DEFAULT NULL::text)
RETURNS public.cierre_snapshots
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_despacho uuid; v_ver integer; v_snap public.cierre_snapshots;
  v_man jsonb; v_bloqueos jsonb; v_huella text; v_resumen jsonb;
BEGIN
  IF auth.uid() IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada.';
  END IF;
  v_despacho := public.cierre_autorizar_expediente(_cliente_id);
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN
    RAISE EXCEPTION 'El sellado exige un motivo de al menos 10 caracteres.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_cliente_id::text||':'||_periodo, 0));

  v_bloqueos := public.cierre_bloqueos(_cliente_id, _periodo);
  IF jsonb_array_length(v_bloqueos) > 0 THEN
    RAISE EXCEPTION 'El periodo no puede sellarse: %',
      (SELECT string_agg(b->>'detalle', ' ') FROM jsonb_array_elements(v_bloqueos) b);
  END IF;

  v_man := public.cierre_manifiesto(_cliente_id, _periodo);
  v_huella := public.cierre_huella(v_man);

  SELECT * INTO v_snap FROM public.cierre_snapshots
   WHERE cliente_id = _cliente_id AND periodo = _periodo AND huella = v_huella
   ORDER BY version DESC LIMIT 1;
  IF FOUND THEN RETURN v_snap; END IF;

  v_resumen := public.cierre_resumen(v_man);

  SELECT coalesce(max(version),0) + 1 INTO v_ver
    FROM public.cierre_snapshots WHERE cliente_id = _cliente_id AND periodo = _periodo;

  INSERT INTO public.cierre_snapshots (
    despacho_id, cliente_id, periodo, version, motivo, resumen, etapas, huella,
    evaluador_version, sellado_por, manifiesto, bloqueos
  ) VALUES (
    v_despacho, _cliente_id, _periodo, v_ver, btrim(_motivo), v_resumen, v_man->'etapas',
    v_huella, 'manifiesto@2', auth.uid(), v_man, '[]'::jsonb
  ) RETURNING * INTO v_snap;

  PERFORM public.cierre_etapa_transicion(
    _cliente_id, _periodo, 'cierre', 'aprobada', btrim(_motivo), 100, NULL, NULL,
    v_huella, 'manifiesto@2', jsonb_build_object('snapshot_id', v_snap.id, 'version', v_ver),
    coalesce(_idempotency_key, 'sello:'||v_huella), 'sellado');

  RETURN v_snap;
END; $$;