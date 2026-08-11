ALTER TABLE public.cierre_snapshots ADD COLUMN IF NOT EXISTS manifiesto jsonb;
ALTER TABLE public.cierre_snapshots ADD COLUMN IF NOT EXISTS bloqueos jsonb;

-- ═══════════════════════════════════════════════════════════════════════════
-- Manifiesto canónico del periodo, construido SIEMPRE desde las fuentes.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cierre_manifiesto(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ini date; v_fin date; v_m jsonb;
BEGIN
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;
  -- Intervalo semiabierto: [primer día, primer día del mes siguiente).
  v_ini := to_date(_periodo||'-01', 'YYYY-MM-DD');
  v_fin := (v_ini + interval '1 month')::date;

  SELECT jsonb_build_object(
    'cliente_id', _cliente_id,
    'periodo', _periodo,
    'rango', jsonb_build_object('desde', v_ini, 'hasta_exclusivo', v_fin),
    'manifiesto_version', 'manifiesto@1',

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
REVOKE ALL ON FUNCTION public.cierre_manifiesto(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_manifiesto(uuid,text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Bloqueos recomprobados en la base (nunca se confía en la evaluación de la UI)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cierre_bloqueos(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_b jsonb := '[]'::jsonb; v_etapa text; v_row record; v_n bigint;
  v_ini date := to_date(_periodo||'-01','YYYY-MM-DD'); v_fin date;
BEGIN
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
REVOKE ALL ON FUNCTION public.cierre_bloqueos(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_bloqueos(uuid,text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Sellado: sólo cliente, periodo, motivo e idempotency_key.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cierre_sellar_manifiesto(
  _cliente_id uuid, _periodo text, _motivo text, _idempotency_key text DEFAULT NULL
) RETURNS public.cierre_snapshots
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_despacho uuid; v_ver integer; v_snap public.cierre_snapshots;
  v_man jsonb; v_bloqueos jsonb; v_huella text; v_resumen jsonb;
BEGIN
  IF auth.uid() IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada.';
  END IF;
  SELECT despacho_id INTO v_despacho FROM public.clientes WHERE id = _cliente_id;
  IF v_despacho IS NULL THEN RAISE EXCEPTION 'Expediente inexistente.'; END IF;
  IF NOT (public.is_member_of(v_despacho) AND public.has_cliente_access(_cliente_id)) THEN
    RAISE EXCEPTION 'Sin acceso al expediente.';
  END IF;
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN
    RAISE EXCEPTION 'El sellado exige un motivo de al menos 10 caracteres.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_cliente_id::text||':'||_periodo, 0));

  -- Bloqueos recomprobados DENTRO del candado.
  v_bloqueos := public.cierre_bloqueos(_cliente_id, _periodo);
  IF jsonb_array_length(v_bloqueos) > 0 THEN
    RAISE EXCEPTION 'El periodo no puede sellarse: %',
      (SELECT string_agg(b->>'detalle', ' ') FROM jsonb_array_elements(v_bloqueos) b);
  END IF;

  v_man := public.cierre_manifiesto(_cliente_id, _periodo);
  v_huella := encode(sha256(convert_to(jsonb_pretty(v_man), 'UTF8')), 'hex');

  SELECT * INTO v_snap FROM public.cierre_snapshots
   WHERE cliente_id = _cliente_id AND periodo = _periodo AND huella = v_huella
   ORDER BY version DESC LIMIT 1;
  IF FOUND THEN RETURN v_snap; END IF;

  v_resumen := jsonb_build_object(
    'cfdi_total', jsonb_array_length(v_man->'cfdi'),
    'cfdi_emitidos', (SELECT count(*) FROM jsonb_array_elements(v_man->'cfdi') c WHERE c->>'direccion' = 'emitido'),
    'cfdi_recibidos', (SELECT count(*) FROM jsonb_array_elements(v_man->'cfdi') c WHERE c->>'direccion' = 'recibido'),
    'ingresos_centavos', (SELECT coalesce(sum((c->>'total_centavos')::bigint),0) FROM jsonb_array_elements(v_man->'cfdi') c WHERE c->>'direccion' = 'emitido'),
    'egresos_centavos', (SELECT coalesce(sum((c->>'total_centavos')::bigint),0) FROM jsonb_array_elements(v_man->'cfdi') c WHERE c->>'direccion' = 'recibido'),
    'iva_trasladado_centavos', (SELECT coalesce(sum((c->>'iva_trasladado_centavos')::bigint),0) FROM jsonb_array_elements(v_man->'cfdi') c WHERE c->>'direccion' = 'emitido'),
    'iva_acreditable_centavos', (SELECT coalesce(sum((c->>'iva_trasladado_centavos')::bigint),0) FROM jsonb_array_elements(v_man->'cfdi') c WHERE c->>'direccion' = 'recibido'),
    'movimientos', jsonb_array_length(v_man->'movimientos'),
    'conciliaciones', jsonb_array_length(v_man->'conciliaciones'),
    'polizas', jsonb_array_length(v_man->'polizas'),
    'decisiones', jsonb_array_length(v_man->'decisiones'));

  SELECT coalesce(max(version),0) + 1 INTO v_ver
    FROM public.cierre_snapshots WHERE cliente_id = _cliente_id AND periodo = _periodo;

  INSERT INTO public.cierre_snapshots (
    despacho_id, cliente_id, periodo, version, motivo, resumen, etapas, huella,
    evaluador_version, sellado_por, manifiesto, bloqueos
  ) VALUES (
    v_despacho, _cliente_id, _periodo, v_ver, btrim(_motivo), v_resumen, v_man->'etapas',
    v_huella, 'manifiesto@1', auth.uid(), v_man, '[]'::jsonb
  ) RETURNING * INTO v_snap;

  PERFORM public.cierre_etapa_transicion(
    _cliente_id, _periodo, 'cierre', 'aprobada', btrim(_motivo), 100, NULL, NULL,
    v_huella, 'manifiesto@1', jsonb_build_object('snapshot_id', v_snap.id, 'version', v_ver),
    coalesce(_idempotency_key, 'sello:'||v_huella), 'sellado');

  RETURN v_snap;
END; $$;
REVOKE ALL ON FUNCTION public.cierre_sellar_manifiesto(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_sellar_manifiesto(uuid,text,text,text) TO authenticated, service_role;

-- El sellado antiguo, que confiaba en datos del llamador, se retira.
DROP FUNCTION IF EXISTS public.cierre_sellar(uuid,text,text,jsonb,jsonb,text,text);