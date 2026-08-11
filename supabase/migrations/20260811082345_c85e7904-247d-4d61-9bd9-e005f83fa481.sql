ALTER TABLE public.polizas DROP CONSTRAINT IF EXISTS polizas_estado_check;
ALTER TABLE public.polizas ADD CONSTRAINT polizas_estado_check
  CHECK (estado = ANY (ARRAY['borrador','confirmada','aprobada','rechazada']));

CREATE OR REPLACE FUNCTION public.cierre_diag_polizas(_cliente_id uuid, _periodo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_total bigint; v_aprobadas bigint; v_sin_aprobar bigint; v_rechazadas bigint;
  v_desbalanceadas bigint; v_sin_renglones bigint; v_cuentas_invalidas bigint; v_sin_hash bigint;
  v_cob numeric; v_estado text; v_hash text;
  v_pend jsonb := '[]'::jsonb; v_cump jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;

  SELECT count(*),
         count(*) FILTER (WHERE p.estado = 'aprobada' AND p.aprobada_por IS NOT NULL),
         -- Cualquier póliza sin aprobación humana explícita cuenta como pendiente,
         -- incluidas las antiguas marcadas sólo como 'confirmada'.
         count(*) FILTER (WHERE p.estado <> 'aprobada' OR p.aprobada_por IS NULL),
         count(*) FILTER (WHERE p.estado = 'rechazada'),
         count(*) FILTER (WHERE coalesce((SELECT sum(r.cargo_centavos) FROM public.poliza_renglones r WHERE r.poliza_id = p.id),0)
                            <> coalesce((SELECT sum(r.abono_centavos) FROM public.poliza_renglones r WHERE r.poliza_id = p.id),0)),
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.poliza_renglones r WHERE r.poliza_id = p.id)),
         count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM public.poliza_renglones r WHERE r.poliza_id = p.id AND (
              btrim(coalesce(r.cuenta,'')) = '' OR r.cuenta ILIKE '%por identificar%'
              OR NOT EXISTS (SELECT 1 FROM public.catalogo_cuentas cc
                             WHERE cc.cliente_id = _cliente_id AND cc.codigo = r.cuenta AND cc.activa)))),
         count(*) FILTER (WHERE p.input_hash IS NULL)
    INTO v_total, v_aprobadas, v_sin_aprobar, v_rechazadas, v_desbalanceadas, v_sin_renglones, v_cuentas_invalidas, v_sin_hash
  FROM public.polizas p WHERE p.cliente_id = _cliente_id AND p.periodo = _periodo;

  v_cob := CASE WHEN v_total = 0 THEN 0 ELSE round(v_aprobadas * 100.0 / v_total, 2) END;

  IF v_total = 0 THEN
    v_estado := 'no_iniciada';
    v_pend := v_pend || jsonb_build_object('codigo','sin_polizas','detalle','No hay pólizas generadas en el periodo.');
  ELSE
    IF v_sin_renglones > 0 THEN v_pend := v_pend || jsonb_build_object('codigo','polizas_sin_renglones','detalle', v_sin_renglones||' pólizas sin renglones.'); END IF;
    IF v_desbalanceadas > 0 THEN v_pend := v_pend || jsonb_build_object('codigo','partida_doble_rota','detalle', v_desbalanceadas||' pólizas no cuadran al centavo.'); END IF;
    IF v_cuentas_invalidas > 0 THEN v_pend := v_pend || jsonb_build_object('codigo','cuentas_invalidas','detalle', v_cuentas_invalidas||' pólizas con cuentas ausentes del catálogo o por identificar.'); END IF;
    IF v_sin_aprobar > 0 THEN v_pend := v_pend || jsonb_build_object('codigo','polizas_sin_aprobar','detalle', v_sin_aprobar||' pólizas sin aprobación humana.'); END IF;
    IF v_sin_hash > 0 THEN v_pend := v_pend || jsonb_build_object('codigo','polizas_sin_trazabilidad','detalle', v_sin_hash||' pólizas sin huella de entrada.'); END IF;
    IF jsonb_array_length(v_pend) = 0 THEN
      v_cump := v_cump || jsonb_build_object('codigo','polizas_aprobadas','detalle','Las '||v_total||' pólizas cuadran al centavo y están aprobadas.');
    END IF;
    v_estado := CASE WHEN jsonb_array_length(v_pend) = 0 THEN 'lista' ELSE 'en_proceso' END;
  END IF;

  v_hash := public.cierre_hash_jsonb(coalesce((
    SELECT jsonb_agg(jsonb_build_object('p',p.id,'v',p.version,'e',p.estado,'h',p.input_hash,
      'a',p.aprobada_por,'r',(SELECT count(*) FROM public.poliza_renglones r WHERE r.poliza_id = p.id)) ORDER BY p.id)
    FROM public.polizas p WHERE p.cliente_id = _cliente_id AND p.periodo = _periodo),'[]'::jsonb));

  RETURN jsonb_build_object('etapa','polizas','estado',v_estado,'cobertura',v_cob,
    'input_hash',v_hash,'evaluador_version','polizas@3',
    'criterios_cumplidos',v_cump,'criterios_pendientes',v_pend,
    'resultado', jsonb_build_object('polizas',v_total,'aprobadas',v_aprobadas,'sin_aprobar',v_sin_aprobar,
      'rechazadas',v_rechazadas,'desbalanceadas',v_desbalanceadas,'sin_renglones',v_sin_renglones,
      'cuentas_invalidas',v_cuentas_invalidas));
END;
$fn$;