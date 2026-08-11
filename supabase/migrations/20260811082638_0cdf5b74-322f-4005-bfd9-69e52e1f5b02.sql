CREATE OR REPLACE FUNCTION public.cierre_diag_bancos(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_ini date; v_fin date; v_tol bigint;
  v_total bigint; v_sin_asignar bigint; v_sin_confirmar bigint;
  v_1n bigint; v_n1 bigint; v_fuera bigint; v_asig bigint; v_confirmados bigint;
  v_grupos jsonb; v_cob numeric; v_estado text; v_hash text;
  v_pend jsonb := '[]'::jsonb; v_cump jsonb := '[]'::jsonb; v_res jsonb;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;
  v_ini := to_date(_periodo||'-01','YYYY-MM-DD'); v_fin := (v_ini + interval '1 month')::date;

  SELECT coalesce(tolerancia_centavos, 100) INTO v_tol FROM public.cierre_config_bancos WHERE cliente_id = _cliente_id;
  v_tol := coalesce(v_tol, 100);

  WITH mov AS (
    SELECT m.id, m.hash, (round(coalesce(m.cargo,0)*100) + round(coalesce(m.abono,0)*100))::bigint AS importe
    FROM public.movimientos_bancarios m
    WHERE m.cliente_id = _cliente_id AND m.fecha >= v_ini AND m.fecha < v_fin
  ), asg AS (
    SELECT k.id, k.movimiento_id, k.cfdi_id, k.estatus, k.motivo, k.confirmado_por,
           round(coalesce(k.diferencia,0)*100)::bigint AS diferencia_centavos
    FROM public.conciliaciones k JOIN mov ON mov.id = k.movimiento_id
    WHERE k.cliente_id = _cliente_id AND k.cfdi_id IS NOT NULL
  ), cfd AS (
    SELECT c.id, round(coalesce(c.total,0)*100)::bigint AS total FROM public.cfdi_xml c
    WHERE c.cliente_id = _cliente_id
  ), g_mov AS (
    SELECT a.movimiento_id AS ancla, count(DISTINCT a.cfdi_id) AS n_cfdi, 1::bigint AS n_mov,
           max(m.importe) AS importe_mov,
           coalesce(sum(DISTINCT cfd.total),0)::bigint AS importe_cfdi,
           bool_and(a.confirmado_por IS NOT NULL) AS confirmado,
           max(length(btrim(coalesce(a.motivo,'')))) AS motivo_len
    FROM asg a JOIN mov m ON m.id = a.movimiento_id LEFT JOIN cfd ON cfd.id = a.cfdi_id
    GROUP BY a.movimiento_id
  ), g_cfdi AS (
    SELECT a.cfdi_id AS ancla, 1::bigint AS n_cfdi, count(DISTINCT a.movimiento_id) AS n_mov,
           coalesce(sum(DISTINCT m.importe),0)::bigint AS importe_mov,
           max(cfd.total) AS importe_cfdi,
           bool_and(a.confirmado_por IS NOT NULL) AS confirmado,
           max(length(btrim(coalesce(a.motivo,'')))) AS motivo_len
    FROM asg a JOIN mov m ON m.id = a.movimiento_id LEFT JOIN cfd ON cfd.id = a.cfdi_id
    GROUP BY a.cfdi_id
  ), grupos AS (
    SELECT 'uno_a_varios' AS tipo, * FROM g_mov WHERE n_cfdi > 1
    UNION ALL
    SELECT 'varios_a_uno' AS tipo, * FROM g_cfdi WHERE n_mov > 1
    UNION ALL
    SELECT 'uno_a_uno' AS tipo, * FROM g_mov WHERE n_cfdi = 1
  )
  SELECT
    (SELECT count(*) FROM mov),
    (SELECT count(*) FROM mov WHERE id NOT IN (SELECT movimiento_id FROM asg)),
    (SELECT count(*) FROM asg WHERE confirmado_por IS NULL),
    (SELECT count(*) FROM asg),
    (SELECT count(DISTINCT movimiento_id) FROM asg WHERE confirmado_por IS NOT NULL),
    (SELECT count(*) FROM grupos WHERE tipo = 'uno_a_varios'),
    (SELECT count(*) FROM grupos WHERE tipo = 'varios_a_uno'),
    (SELECT count(*) FROM grupos WHERE abs(importe_mov - importe_cfdi) > v_tol AND (NOT confirmado OR motivo_len < 10)),
    coalesce((SELECT jsonb_agg(jsonb_build_object(
        'tipo', tipo, 'ancla', ancla, 'movimientos', n_mov, 'cfdi', n_cfdi,
        'importe_movimientos_centavos', importe_mov, 'importe_cfdi_centavos', importe_cfdi,
        'diferencia_centavos', importe_mov - importe_cfdi,
        'dentro_tolerancia', abs(importe_mov - importe_cfdi) <= v_tol,
        'confirmado', confirmado, 'motivo_suficiente', motivo_len >= 10) ORDER BY tipo, ancla) FROM grupos),'[]'::jsonb)
  INTO v_total, v_sin_asignar, v_sin_confirmar, v_asig, v_confirmados, v_1n, v_n1, v_fuera, v_grupos;

  v_cob := CASE WHEN v_total = 0 THEN 0 ELSE round(v_confirmados * 100.0 / v_total, 2) END;

  IF v_total = 0 THEN
    v_estado := 'no_iniciada';
    v_pend := v_pend || jsonb_build_object('codigo','sin_movimientos','detalle','No hay movimientos bancarios en el periodo: la etapa no es evaluable.');
  ELSE
    IF v_sin_asignar > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','movimientos_sin_asignar','detalle', v_sin_asignar||' movimientos sin comprobante asignado.');
    END IF;
    IF v_sin_confirmar > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','asignaciones_sin_confirmar','detalle', v_sin_confirmar||' asignaciones sin confirmación humana.');
    END IF;
    IF v_fuera > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','diferencias_fuera_tolerancia','detalle', v_fuera||' grupos con diferencia mayor a la tolerancia de '||v_tol||' centavos sin confirmación y motivo.');
    END IF;
    IF jsonb_array_length(v_pend) = 0 THEN
      v_cump := v_cump || jsonb_build_object('codigo','conciliacion_completa','detalle','Los '||v_total||' movimientos están asignados, confirmados y dentro de tolerancia.');
    END IF;
    v_estado := CASE WHEN jsonb_array_length(v_pend) = 0 THEN 'lista' ELSE 'en_proceso' END;
  END IF;

  v_res := jsonb_build_object('movimientos',v_total,'asignaciones',v_asig,
    'movimientos_confirmados',v_confirmados,'movimientos_sin_asignar',v_sin_asignar,
    'asignaciones_sin_confirmar',v_sin_confirmar,'grupos_uno_a_varios',v_1n,
    'grupos_varios_a_uno',v_n1,'grupos_fuera_tolerancia',v_fuera,
    'tolerancia_centavos',v_tol,'grupos',v_grupos);

  v_hash := public.cierre_hash_jsonb(jsonb_build_object('tol',v_tol,'g',v_grupos,'sa',v_sin_asignar,'sc',v_sin_confirmar));

  RETURN jsonb_build_object('etapa','bancos','estado',v_estado,'cobertura',v_cob,
    'input_hash',v_hash,'evaluador_version','bancos@3',
    'criterios_cumplidos',v_cump,'criterios_pendientes',v_pend,'resultado',v_res);
END;
$fn$;