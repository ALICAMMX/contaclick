-- ===========================================================
-- 1. Estado "no_comprobada" (falla cerrada)
-- ===========================================================
ALTER TABLE public.cierre_etapas DROP CONSTRAINT IF EXISTS cierre_etapas_estado_check;
ALTER TABLE public.cierre_etapas ADD CONSTRAINT cierre_etapas_estado_check
  CHECK (estado = ANY (ARRAY['no_iniciada','en_proceso','bloqueada','lista','aprobada','reabierta','no_aplica','no_comprobada']));

-- ===========================================================
-- 2. Tolerancia bancaria por expediente
-- ===========================================================
CREATE TABLE IF NOT EXISTS public.cierre_config_bancos (
  cliente_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  tolerancia_centavos bigint NOT NULL DEFAULT 100 CHECK (tolerancia_centavos >= 0 AND tolerancia_centavos <= 100000),
  motivo text,
  actualizado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cierre_config_bancos TO authenticated;
GRANT ALL ON public.cierre_config_bancos TO service_role;
ALTER TABLE public.cierre_config_bancos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "config bancos lectura" ON public.cierre_config_bancos;
CREATE POLICY "config bancos lectura" ON public.cierre_config_bancos
  FOR SELECT TO authenticated USING (public.has_cliente_access(cliente_id));

-- ===========================================================
-- 3. Pólizas operativas
-- ===========================================================
ALTER TABLE public.polizas
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS input_hash text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS aprobada_por uuid,
  ADD COLUMN IF NOT EXISTS aprobada_at timestamptz,
  ADD COLUMN IF NOT EXISTS rechazada_por uuid,
  ADD COLUMN IF NOT EXISTS rechazada_at timestamptz,
  ADD COLUMN IF NOT EXISTS rechazo_motivo text;

UPDATE public.polizas SET periodo = to_char(fecha,'YYYY-MM') WHERE periodo IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS polizas_idempotency_unica
  ON public.polizas (cliente_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ===========================================================
-- 4. Resultado fiscal preliminar (motores versionados)
-- ===========================================================
CREATE TABLE IF NOT EXISTS public.cierre_resultado_fiscal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo text NOT NULL CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  regimen text NOT NULL,
  motor_version text NOT NULL,
  normativa jsonb NOT NULL DEFAULT '{}'::jsonb,
  normativa_sha256 text NOT NULL,
  entradas jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_hash text NOT NULL,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  fundamentos jsonb NOT NULL DEFAULT '[]'::jsonb,
  fuentes jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, periodo, input_hash)
);
GRANT SELECT ON public.cierre_resultado_fiscal TO authenticated;
GRANT ALL ON public.cierre_resultado_fiscal TO service_role;
ALTER TABLE public.cierre_resultado_fiscal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "resultado fiscal lectura" ON public.cierre_resultado_fiscal;
CREATE POLICY "resultado fiscal lectura" ON public.cierre_resultado_fiscal
  FOR SELECT TO authenticated USING (public.has_cliente_access(cliente_id));

-- ===========================================================
-- 5. Utilidades
-- ===========================================================
CREATE OR REPLACE FUNCTION public.cierre_regimen_desde_sat(_regimen text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE substring(coalesce(_regimen,'') from '\d{3}')
    WHEN '601' THEN 'PM_GENERAL'
    WHEN '603' THEN 'PM_GENERAL'
    WHEN '626' THEN 'PF_RESICO'
    WHEN '612' THEN 'PF_GENERAL_MENSUAL'
    WHEN '606' THEN 'PF_GENERAL_MENSUAL'
    WHEN '621' THEN NULL
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.cierre_hash_jsonb(_v jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT encode(sha256(convert_to(public.cierre_canonizar(coalesce(_v,'null'::jsonb)),'UTF8')),'hex');
$$;

-- ===========================================================
-- 6. DIAGNÓSTICOS (STABLE, sin escritura)
-- ===========================================================
CREATE OR REPLACE FUNCTION public.cierre_diag_clasificacion(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total bigint; v_sin_dec bigint; v_sin_sat bigint; v_cob numeric;
  v_estado text; v_hash text; v_pend jsonb := '[]'::jsonb; v_cump jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;

  SELECT count(*) FILTER (WHERE c.direccion = 'recibido'),
         count(*) FILTER (WHERE c.direccion = 'recibido' AND NOT EXISTS (
            SELECT 1 FROM public.cfdi_decisiones_fiscales d WHERE d.cfdi_id = c.id)),
         count(*) FILTER (WHERE coalesce(c.estatus_sat,'desconocido') <> 'vigente')
    INTO v_total, v_sin_dec, v_sin_sat
  FROM public.cfdi_xml c WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo;

  v_cob := CASE WHEN v_total = 0 THEN 0 ELSE round((v_total - v_sin_dec) * 100.0 / v_total, 2) END;

  IF v_total = 0 THEN
    v_estado := 'no_iniciada';
    v_pend := v_pend || jsonb_build_object('codigo','sin_recibidos','detalle','No hay comprobantes recibidos que clasificar.');
  ELSE
    IF v_sin_dec > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','decisiones_faltantes','detalle', v_sin_dec||' comprobantes recibidos sin decisión de deducibilidad.');
    ELSE
      v_cump := v_cump || jsonb_build_object('codigo','decisiones_completas','detalle','Los '||v_total||' comprobantes recibidos tienen decisión humana.');
    END IF;
    IF v_sin_sat > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','estatus_sat_incompleto','detalle', v_sin_sat||' comprobantes sin estatus SAT confirmado.');
    END IF;
    v_estado := CASE WHEN jsonb_array_length(v_pend) = 0 THEN 'lista' ELSE 'en_proceso' END;
  END IF;

  v_hash := public.cierre_hash_jsonb(coalesce((
    SELECT jsonb_agg(jsonb_build_object('c',c.id,'s',coalesce(c.estatus_sat,'desconocido'),
      'd',(SELECT d.decision||':'||coalesce(d.porcentaje_deducible,100)::text
             FROM public.cfdi_decisiones_fiscales d WHERE d.cfdi_id = c.id)) ORDER BY c.id)
    FROM public.cfdi_xml c WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo),'[]'::jsonb));

  RETURN jsonb_build_object('etapa','clasificacion','estado',v_estado,'cobertura',v_cob,
    'input_hash',v_hash,'evaluador_version','clasificacion@2',
    'criterios_cumplidos',v_cump,'criterios_pendientes',v_pend,
    'resultado', jsonb_build_object('recibidos',v_total,'sin_decision',v_sin_dec,'sin_estatus_sat',v_sin_sat));
END; $$;

CREATE OR REPLACE FUNCTION public.cierre_diag_bancos(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

  CREATE TEMP TABLE IF NOT EXISTS _noop_bancos(x int) ON COMMIT DROP;

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
  ), g_mov AS ( -- uno a varios: un movimiento con varios CFDI
    SELECT a.movimiento_id AS ancla, count(DISTINCT a.cfdi_id) AS n_cfdi, 1::bigint AS n_mov,
           max(m.importe) AS importe_mov,
           coalesce(sum(DISTINCT cfd.total),0)::bigint AS importe_cfdi,
           bool_and(a.confirmado_por IS NOT NULL) AS confirmado,
           max(length(btrim(coalesce(a.motivo,'')))) AS motivo_len
    FROM asg a JOIN mov m ON m.id = a.movimiento_id LEFT JOIN cfd ON cfd.id = a.cfdi_id
    GROUP BY a.movimiento_id
  ), g_cfdi AS ( -- varios a uno: varios movimientos contra un CFDI
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
    'input_hash',v_hash,'evaluador_version','bancos@2',
    'criterios_cumplidos',v_cump,'criterios_pendientes',v_pend,'resultado',v_res);
END; $$;

CREATE OR REPLACE FUNCTION public.cierre_diag_polizas(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total bigint; v_aprobadas bigint; v_borrador bigint; v_rechazadas bigint;
  v_desbalanceadas bigint; v_sin_renglones bigint; v_cuentas_invalidas bigint; v_sin_hash bigint;
  v_cob numeric; v_estado text; v_hash text;
  v_pend jsonb := '[]'::jsonb; v_cump jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;

  SELECT count(*),
         count(*) FILTER (WHERE p.estado = 'aprobada'),
         count(*) FILTER (WHERE coalesce(p.estado,'borrador') = 'borrador'),
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
    INTO v_total, v_aprobadas, v_borrador, v_rechazadas, v_desbalanceadas, v_sin_renglones, v_cuentas_invalidas, v_sin_hash
  FROM public.polizas p WHERE p.cliente_id = _cliente_id AND p.periodo = _periodo;

  v_cob := CASE WHEN v_total = 0 THEN 0 ELSE round(v_aprobadas * 100.0 / v_total, 2) END;

  IF v_total = 0 THEN
    v_estado := 'no_iniciada';
    v_pend := v_pend || jsonb_build_object('codigo','sin_polizas','detalle','No hay pólizas generadas en el periodo.');
  ELSE
    IF v_sin_renglones > 0 THEN v_pend := v_pend || jsonb_build_object('codigo','polizas_sin_renglones','detalle', v_sin_renglones||' pólizas sin renglones.'); END IF;
    IF v_desbalanceadas > 0 THEN v_pend := v_pend || jsonb_build_object('codigo','partida_doble_rota','detalle', v_desbalanceadas||' pólizas no cuadran al centavo.'); END IF;
    IF v_cuentas_invalidas > 0 THEN v_pend := v_pend || jsonb_build_object('codigo','cuentas_invalidas','detalle', v_cuentas_invalidas||' pólizas con cuentas ausentes del catálogo o por identificar.'); END IF;
    IF v_borrador + v_rechazadas > 0 THEN v_pend := v_pend || jsonb_build_object('codigo','polizas_sin_aprobar','detalle', (v_borrador + v_rechazadas)||' pólizas en borrador o rechazadas.'); END IF;
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
    'input_hash',v_hash,'evaluador_version','polizas@2',
    'criterios_cumplidos',v_cump,'criterios_pendientes',v_pend,
    'resultado', jsonb_build_object('polizas',v_total,'aprobadas',v_aprobadas,'borrador',v_borrador,
      'rechazadas',v_rechazadas,'desbalanceadas',v_desbalanceadas,'sin_renglones',v_sin_renglones,
      'cuentas_invalidas',v_cuentas_invalidas));
END; $$;

-- Entradas fiscales normalizadas (PUE, PPD y complementos de pago)
CREATE OR REPLACE FUNCTION public.cierre_entradas_fiscales(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ini date; v_fin date; v_reg_sat text; v_reg text; v_e jsonb;
  v_ing_pue bigint; v_iva_pue bigint; v_ded_pue bigint; v_iva_acr_pue bigint;
  v_ing_ppd bigint; v_iva_ppd bigint; v_ded_ppd bigint; v_iva_acr_ppd bigint;
  v_isr_ret bigint; v_iva_ret bigint;
  v_sin_sat bigint; v_sin_dec bigint; v_ppd_sin_comp bigint;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;
  v_ini := to_date(_periodo||'-01','YYYY-MM-DD'); v_fin := (v_ini + interval '1 month')::date;

  SELECT regimen_fiscal INTO v_reg_sat FROM public.clientes WHERE id = _cliente_id;
  v_reg := public.cierre_regimen_desde_sat(v_reg_sat);

  -- Flujo de efectivo: PUE del periodo
  SELECT
    coalesce(sum(round(coalesce(c.total,0)*100)) FILTER (WHERE c.direccion='emitido'),0),
    coalesce(sum(round(coalesce(c.iva_trasladado,0)*100)) FILTER (WHERE c.direccion='emitido'),0),
    coalesce(sum(round(coalesce(c.total,0)*100*coalesce(d.porcentaje_deducible,0)/100.0)) FILTER (WHERE c.direccion='recibido'),0),
    coalesce(sum(round(coalesce(c.iva_trasladado,0)*100*coalesce(d.porcentaje_deducible,0)/100.0)) FILTER (WHERE c.direccion='recibido'),0),
    coalesce(sum(round(coalesce(c.isr_retenido,0)*100)) FILTER (WHERE c.direccion='emitido'),0),
    coalesce(sum(round(coalesce(c.iva_retenido,0)*100)) FILTER (WHERE c.direccion='emitido'),0)
  INTO v_ing_pue, v_iva_pue, v_ded_pue, v_iva_acr_pue, v_isr_ret, v_iva_ret
  FROM public.cfdi_xml c
  LEFT JOIN public.cfdi_decisiones_fiscales d ON d.cfdi_id = c.id AND d.decision IN ('deducible','parcial')
  WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo
    AND coalesce(c.clase_documental,'ingreso') <> 'pago'
    AND coalesce(c.metodo_pago,'PUE') = 'PUE'
    AND c.estatus_sat = 'vigente';

  -- Complementos de pago recibidos/emitidos en el periodo (PPD cobrado o pagado)
  SELECT
    coalesce(sum(pd.imp_pagado_centavos) FILTER (WHERE pc.direccion='emitido'),0),
    coalesce(sum(pd.iva_centavos) FILTER (WHERE pc.direccion='emitido'),0),
    coalesce(sum(round(pd.imp_pagado_centavos*coalesce(pd.porcentaje,0)/100.0)) FILTER (WHERE pc.direccion='recibido'),0),
    coalesce(sum(round(pd.iva_centavos*coalesce(pd.porcentaje,0)/100.0)) FILTER (WHERE pc.direccion='recibido'),0)
  INTO v_ing_ppd, v_iva_ppd, v_ded_ppd, v_iva_acr_ppd
  FROM (
    SELECT g.pago_id, g.cfdi_id, g.cfdi_padre_id,
           round(coalesce(g.imp_pagado,0)*100)::bigint AS imp_pagado_centavos,
           coalesce((SELECT round(sum(i.importe)*100) FROM public.cfdi_pago_impuestos i
                      WHERE i.documento_id = g.id AND i.impuesto = '002' AND i.ambito = 'traslado'),0)::bigint AS iva_centavos,
           (SELECT d.porcentaje_deducible FROM public.cfdi_decisiones_fiscales d
             WHERE d.cfdi_id = g.cfdi_padre_id AND d.decision IN ('deducible','parcial')) AS porcentaje
    FROM public.cfdi_pago_documentos g
  ) pd
  JOIN public.cfdi_pagos p ON p.id = pd.pago_id
  JOIN public.cfdi_xml pc ON pc.id = p.cfdi_id
  WHERE pc.cliente_id = _cliente_id AND pc.periodo = _periodo AND pc.estatus_sat = 'vigente';

  SELECT
    count(*) FILTER (WHERE coalesce(c.estatus_sat,'desconocido') <> 'vigente'),
    count(*) FILTER (WHERE c.direccion='recibido' AND coalesce(c.clase_documental,'ingreso') <> 'pago'
                       AND NOT EXISTS (SELECT 1 FROM public.cfdi_decisiones_fiscales d WHERE d.cfdi_id = c.id)),
    count(*) FILTER (WHERE coalesce(c.metodo_pago,'PUE') = 'PPD' AND coalesce(c.clase_documental,'ingreso') <> 'pago'
                       AND NOT EXISTS (SELECT 1 FROM public.cfdi_pago_documentos g WHERE g.cfdi_padre_id = c.id))
  INTO v_sin_sat, v_sin_dec, v_ppd_sin_comp
  FROM public.cfdi_xml c WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo;

  v_e := jsonb_build_object(
    'periodo', _periodo,
    'entradas_version','entradas@1',
    'regimen_sat', v_reg_sat,
    'regimen', v_reg,
    'criterio','flujo_de_efectivo: PUE del periodo + complementos de pago del periodo',
    'ingresos_cobrados_centavos', v_ing_pue + v_ing_ppd,
    'ingresos_pue_centavos', v_ing_pue,
    'ingresos_ppd_centavos', v_ing_ppd,
    'iva_trasladado_cobrado_centavos', v_iva_pue + v_iva_ppd,
    'deducciones_pagadas_centavos', v_ded_pue + v_ded_ppd,
    'deducciones_pue_centavos', v_ded_pue,
    'deducciones_ppd_centavos', v_ded_ppd,
    'iva_acreditable_pagado_centavos', v_iva_acr_pue + v_iva_acr_ppd,
    'isr_retenido_centavos', v_isr_ret,
    'iva_retenido_centavos', v_iva_ret,
    'faltantes', jsonb_build_object(
      'comprobantes_sin_estatus_sat', v_sin_sat,
      'recibidos_sin_decision', v_sin_dec,
      'ppd_sin_complemento', v_ppd_sin_comp),
    'evaluable', (v_reg IS NOT NULL AND v_sin_sat = 0 AND v_sin_dec = 0 AND v_ppd_sin_comp = 0));

  RETURN v_e || jsonb_build_object('input_hash', public.cierre_hash_jsonb(v_e));
END; $$;

CREATE OR REPLACE FUNCTION public.cierre_diag_impuestos(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_e jsonb; v_hash text; v_rf public.cierre_resultado_fiscal;
  v_estado text; v_cob numeric := 0;
  v_pend jsonb := '[]'::jsonb; v_cump jsonb := '[]'::jsonb; v_res jsonb;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  v_e := public.cierre_entradas_fiscales(_cliente_id, _periodo);
  v_hash := v_e->>'input_hash';

  SELECT * INTO v_rf FROM public.cierre_resultado_fiscal
   WHERE cliente_id = _cliente_id AND periodo = _periodo AND input_hash = v_hash
   ORDER BY created_at DESC LIMIT 1;

  IF (v_e->>'regimen') IS NULL THEN
    v_pend := v_pend || jsonb_build_object('codigo','regimen_ausente',
      'detalle','El expediente no tiene un régimen fiscal reconocido: el cálculo no es evaluable.');
  END IF;
  IF (v_e->'faltantes'->>'comprobantes_sin_estatus_sat')::bigint > 0 THEN
    v_pend := v_pend || jsonb_build_object('codigo','estatus_sat_incompleto',
      'detalle',(v_e->'faltantes'->>'comprobantes_sin_estatus_sat')||' comprobantes sin estatus SAT confirmado.');
  END IF;
  IF (v_e->'faltantes'->>'recibidos_sin_decision')::bigint > 0 THEN
    v_pend := v_pend || jsonb_build_object('codigo','deducibilidad_incompleta',
      'detalle',(v_e->'faltantes'->>'recibidos_sin_decision')||' comprobantes recibidos sin decisión de deducibilidad.');
  END IF;
  IF (v_e->'faltantes'->>'ppd_sin_complemento')::bigint > 0 THEN
    v_pend := v_pend || jsonb_build_object('codigo','ppd_sin_complemento',
      'detalle',(v_e->'faltantes'->>'ppd_sin_complemento')||' comprobantes en parcialidades sin complemento de pago.');
  END IF;
  IF v_rf.id IS NULL THEN
    v_pend := v_pend || jsonb_build_object('codigo','calculo_no_registrado',
      'detalle','No hay cálculo fiscal preliminar registrado para la evidencia actual.');
  END IF;

  IF jsonb_array_length(v_pend) = 0 THEN
    v_estado := 'lista'; v_cob := 100;
    v_cump := v_cump || jsonb_build_object('codigo','calculo_vigente',
      'detalle','Cálculo preliminar '||v_rf.motor_version||' vigente para la evidencia actual.');
  ELSE
    v_estado := 'en_proceso'; v_cob := 0;
  END IF;

  v_res := jsonb_build_object(
    'naturaleza','estimacion_interna',
    'advertencia','Cálculo preliminar de apoyo. No es una declaración ni sustituye el cálculo oficial ante el SAT.',
    'evaluable', (v_e->>'evaluable')::boolean AND v_rf.id IS NOT NULL,
    'entradas', v_e,
    'resultado', CASE WHEN v_rf.id IS NULL THEN NULL ELSE v_rf.resultado END,
    'regimen', v_rf.regimen,
    'motor_version', v_rf.motor_version,
    'normativa', CASE WHEN v_rf.id IS NULL THEN NULL ELSE v_rf.normativa END,
    'normativa_sha256', v_rf.normativa_sha256,
    'fundamentos', CASE WHEN v_rf.id IS NULL THEN '[]'::jsonb ELSE v_rf.fundamentos END,
    'fuentes', CASE WHEN v_rf.id IS NULL THEN '[]'::jsonb ELSE v_rf.fuentes END);

  RETURN jsonb_build_object('etapa','impuestos','estado',v_estado,'cobertura',v_cob,
    'input_hash',v_hash,'evaluador_version','impuestos@2',
    'criterios_cumplidos',v_cump,'criterios_pendientes',v_pend,'resultado',v_res);
END; $$;

-- ===========================================================
-- 7. EVALUADORES (VOLATILE, con transición y falla cerrada)
-- ===========================================================
CREATE OR REPLACE FUNCTION public.cierre_marcar_no_comprobada(_cliente_id uuid, _periodo text, _etapa text, _detalle text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pend jsonb;
BEGIN
  v_pend := jsonb_build_array(jsonb_build_object('codigo','diagnostico_fallido','detalle', coalesce(_detalle,'El diagnóstico no pudo ejecutarse.')));
  PERFORM public.cierre_etapa_transicion(_cliente_id, _periodo, _etapa, 'no_comprobada',
    left(coalesce(_detalle,'Diagnóstico fallido'), 500), 0, '[]'::jsonb, v_pend, NULL,
    _etapa||'@fallo', jsonb_build_object('error', _detalle), 'fallo:'||_etapa||':'||md5(coalesce(_detalle,'')||clock_timestamp()::text), 'evaluador');
  RETURN jsonb_build_object('etapa',_etapa,'estado','no_comprobada','cobertura',0,
    'input_hash',NULL,'evaluador_version',_etapa||'@fallo',
    'criterios_cumplidos','[]'::jsonb,'criterios_pendientes',v_pend,
    'resultado', jsonb_build_object('error',_detalle));
END; $$;

CREATE OR REPLACE FUNCTION public.cierre_evaluar_clasificacion(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d jsonb; v_err text;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  BEGIN v_d := public.cierre_diag_clasificacion(_cliente_id, _periodo);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err IS NOT NULL THEN RETURN public.cierre_marcar_no_comprobada(_cliente_id,_periodo,'clasificacion',v_err); END IF;
  PERFORM public.cierre_etapa_transicion(_cliente_id,_periodo,'clasificacion', v_d->>'estado', NULL,
    (v_d->>'cobertura')::numeric, v_d->'criterios_cumplidos', v_d->'criterios_pendientes',
    v_d->>'input_hash', v_d->>'evaluador_version', v_d->'resultado',
    'eval:clasificacion:'||(v_d->>'input_hash'), 'evaluador');
  RETURN v_d;
END; $$;

CREATE OR REPLACE FUNCTION public.cierre_evaluar_bancos(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d jsonb; v_err text;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  BEGIN v_d := public.cierre_diag_bancos(_cliente_id, _periodo);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err IS NOT NULL THEN RETURN public.cierre_marcar_no_comprobada(_cliente_id,_periodo,'bancos',v_err); END IF;
  PERFORM public.cierre_etapa_transicion(_cliente_id,_periodo,'bancos', v_d->>'estado', NULL,
    (v_d->>'cobertura')::numeric, v_d->'criterios_cumplidos', v_d->'criterios_pendientes',
    v_d->>'input_hash', v_d->>'evaluador_version', v_d->'resultado',
    'eval:bancos:'||(v_d->>'input_hash'), 'evaluador');
  RETURN v_d;
END; $$;

CREATE OR REPLACE FUNCTION public.cierre_evaluar_polizas(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d jsonb; v_err text;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  BEGIN v_d := public.cierre_diag_polizas(_cliente_id, _periodo);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err IS NOT NULL THEN RETURN public.cierre_marcar_no_comprobada(_cliente_id,_periodo,'polizas',v_err); END IF;
  PERFORM public.cierre_etapa_transicion(_cliente_id,_periodo,'polizas', v_d->>'estado', NULL,
    (v_d->>'cobertura')::numeric, v_d->'criterios_cumplidos', v_d->'criterios_pendientes',
    v_d->>'input_hash', v_d->>'evaluador_version', v_d->'resultado',
    'eval:polizas:'||(v_d->>'input_hash'), 'evaluador');
  RETURN v_d;
END; $$;

CREATE OR REPLACE FUNCTION public.cierre_evaluar_impuestos(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d jsonb; v_err text;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  BEGIN v_d := public.cierre_diag_impuestos(_cliente_id, _periodo);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err IS NOT NULL THEN RETURN public.cierre_marcar_no_comprobada(_cliente_id,_periodo,'impuestos',v_err); END IF;
  PERFORM public.cierre_etapa_transicion(_cliente_id,_periodo,'impuestos', v_d->>'estado', NULL,
    (v_d->>'cobertura')::numeric, v_d->'criterios_cumplidos', v_d->'criterios_pendientes',
    v_d->>'input_hash', v_d->>'evaluador_version', v_d->'resultado',
    'eval:impuestos:'||(v_d->>'input_hash'), 'evaluador');
  RETURN v_d;
END; $$;

-- ===========================================================
-- 8. Operaciones de negocio: tolerancia, resultado fiscal, pólizas
-- ===========================================================
CREATE OR REPLACE FUNCTION public.cierre_set_tolerancia_bancos(_cliente_id uuid, _tolerancia_centavos bigint, _motivo text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_desp uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.'; END IF;
  v_desp := public.cierre_autorizar_expediente(_cliente_id);
  IF _tolerancia_centavos IS NULL OR _tolerancia_centavos < 0 OR _tolerancia_centavos > 100000 THEN
    RAISE EXCEPTION 'Tolerancia fuera de rango (0 a 100000 centavos).';
  END IF;
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN RAISE EXCEPTION 'La tolerancia exige un motivo de al menos 10 caracteres.'; END IF;
  INSERT INTO public.cierre_config_bancos (cliente_id, despacho_id, tolerancia_centavos, motivo, actualizado_por)
  VALUES (_cliente_id, v_desp, _tolerancia_centavos, btrim(_motivo), auth.uid())
  ON CONFLICT (cliente_id) DO UPDATE SET tolerancia_centavos = excluded.tolerancia_centavos,
    motivo = excluded.motivo, actualizado_por = excluded.actualizado_por, updated_at = now();
  RETURN jsonb_build_object('cliente_id',_cliente_id,'tolerancia_centavos',_tolerancia_centavos);
END; $$;

CREATE OR REPLACE FUNCTION public.cierre_registrar_resultado_fiscal(
  _cliente_id uuid, _periodo text, _regimen text, _motor_version text,
  _normativa jsonb, _normativa_sha256 text, _entradas jsonb, _input_hash text,
  _resultado jsonb, _fundamentos jsonb, _fuentes jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_desp uuid; v_esperado text; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.'; END IF;
  v_desp := public.cierre_autorizar_expediente(_cliente_id);
  IF _regimen IS NULL OR btrim(_regimen) = '' THEN RAISE EXCEPTION 'Sin régimen no puede registrarse un resultado fiscal.'; END IF;
  IF coalesce(_normativa_sha256,'') = '' OR coalesce(_motor_version,'') = '' THEN
    RAISE EXCEPTION 'El resultado fiscal exige versión de motor y huella de normativa.';
  END IF;

  -- La huella de entradas se recalcula del lado del servidor: el cliente no la impone.
  v_esperado := (public.cierre_entradas_fiscales(_cliente_id, _periodo))->>'input_hash';
  IF _input_hash IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'La evidencia cambió durante el cálculo: vuelva a calcular (esperado %).', v_esperado;
  END IF;

  INSERT INTO public.cierre_resultado_fiscal (despacho_id, cliente_id, periodo, regimen, motor_version,
    normativa, normativa_sha256, entradas, input_hash, resultado, fundamentos, fuentes, calculado_por)
  VALUES (v_desp, _cliente_id, _periodo, _regimen, _motor_version,
    coalesce(_normativa,'{}'::jsonb), _normativa_sha256, coalesce(_entradas,'{}'::jsonb), _input_hash,
    coalesce(_resultado,'{}'::jsonb), coalesce(_fundamentos,'[]'::jsonb), coalesce(_fuentes,'[]'::jsonb), auth.uid())
  ON CONFLICT (cliente_id, periodo, input_hash) DO UPDATE SET resultado = excluded.resultado
  RETURNING id INTO v_id;

  RETURN public.cierre_evaluar_impuestos(_cliente_id, _periodo) || jsonb_build_object('resultado_fiscal_id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.poliza_generar_borrador(
  _cliente_id uuid, _periodo text, _idempotency_key text, _tipo text, _fecha date,
  _concepto text, _origen text, _renglones jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_desp uuid; v_hash text; v_p public.polizas; v_id uuid; v_ver integer := 1;
  v_cargos bigint; v_abonos bigint; v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.'; END IF;
  v_desp := public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;
  IF length(btrim(coalesce(_idempotency_key,''))) < 8 THEN RAISE EXCEPTION 'Se requiere una llave de idempotencia estable.'; END IF;
  IF jsonb_typeof(_renglones) <> 'array' OR jsonb_array_length(_renglones) < 2 THEN
    RAISE EXCEPTION 'Una póliza exige al menos dos renglones.';
  END IF;
  IF to_char(_fecha,'YYYY-MM') <> _periodo THEN RAISE EXCEPTION 'La fecha de la póliza no pertenece al periodo %.', _periodo; END IF;

  SELECT coalesce(sum((r->>'cargo_centavos')::bigint),0), coalesce(sum((r->>'abono_centavos')::bigint),0)
    INTO v_cargos, v_abonos FROM jsonb_array_elements(_renglones) r;
  IF v_cargos <> v_abonos THEN
    RAISE EXCEPTION 'Partida doble rota: cargos % ≠ abonos % (centavos).', v_cargos, v_abonos;
  END IF;
  IF v_cargos <= 0 THEN RAISE EXCEPTION 'La póliza no puede tener importe cero.'; END IF;

  v_hash := public.cierre_hash_jsonb(jsonb_build_object('t',_tipo,'f',_fecha,'c',_concepto,'o',_origen,'r',_renglones));

  PERFORM pg_advisory_xact_lock(hashtextextended(_cliente_id::text||':poliza:'||_idempotency_key, 0));

  SELECT * INTO v_p FROM public.polizas WHERE cliente_id = _cliente_id AND idempotency_key = _idempotency_key;

  IF FOUND THEN
    IF v_p.estado = 'aprobada' THEN
      IF v_p.input_hash = v_hash THEN
        RETURN jsonb_build_object('poliza_id', v_p.id, 'version', v_p.version, 'estado', v_p.estado,
          'input_hash', v_p.input_hash, 'accion','sin_cambio');
      END IF;
      RAISE EXCEPTION 'La póliza ya fue aprobada: rechácela antes de regenerarla.';
    END IF;
    IF v_p.input_hash = v_hash THEN
      RETURN jsonb_build_object('poliza_id', v_p.id, 'version', v_p.version, 'estado', v_p.estado,
        'input_hash', v_p.input_hash, 'accion','idempotente');
    END IF;
    v_ver := v_p.version + 1; v_id := v_p.id;
    DELETE FROM public.poliza_renglones WHERE poliza_id = v_id;
    UPDATE public.polizas SET tipo = _tipo, fecha = _fecha, concepto = _concepto, origen = coalesce(_origen,'manual'),
      monto = v_cargos / 100.0, estado = 'borrador', version = v_ver, input_hash = v_hash, periodo = _periodo,
      aprobada_por = NULL, aprobada_at = NULL, rechazada_por = NULL, rechazada_at = NULL, rechazo_motivo = NULL,
      updated_at = now()
      WHERE id = v_id;
  ELSE
    INSERT INTO public.polizas (cliente_id, despacho_id, tipo, fecha, periodo, concepto, monto, origen,
      estado, idempotency_key, input_hash, version, created_by)
    VALUES (_cliente_id, v_desp, _tipo, _fecha, _periodo, _concepto, v_cargos / 100.0, coalesce(_origen,'manual'),
      'borrador', _idempotency_key, v_hash, 1, auth.uid())
    RETURNING id INTO v_id;
  END IF;

  v_n := 0;
  INSERT INTO public.poliza_renglones (poliza_id, despacho_id, cliente_id, numero, cuenta, cuenta_nombre,
    concepto, cargo_centavos, abono_centavos, cfdi_id, movimiento_bancario_id, origen)
  SELECT v_id, v_desp, _cliente_id, row_number() OVER (), r->>'cuenta', r->>'cuenta_nombre',
    r->>'concepto', coalesce((r->>'cargo_centavos')::bigint,0), coalesce((r->>'abono_centavos')::bigint,0),
    nullif(r->>'cfdi_id','')::uuid, nullif(r->>'movimiento_bancario_id','')::uuid, coalesce(_origen,'manual')
  FROM jsonb_array_elements(_renglones) r;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM 1 FROM public.cierre_reabrir_cascada(_cliente_id, _periodo, 'poliza',
    'Póliza generada o regenerada en borrador (v'||v_ver||').', 'poliza', v_id::text,
    'poliza:'||v_id::text||':'||v_hash);

  RETURN jsonb_build_object('poliza_id', v_id, 'version', v_ver, 'estado','borrador',
    'input_hash', v_hash, 'renglones', v_n, 'cargos_centavos', v_cargos, 'abonos_centavos', v_abonos,
    'accion', CASE WHEN v_ver = 1 THEN 'creada' ELSE 'regenerada' END);
END; $$;

CREATE OR REPLACE FUNCTION public.poliza_aprobar(_poliza_id uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p public.polizas; v_cargos bigint; v_abonos bigint; v_malas bigint; v_n bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.'; END IF;
  SELECT * INTO v_p FROM public.polizas WHERE id = _poliza_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Póliza inexistente.'; END IF;
  PERFORM public.cierre_autorizar_expediente(v_p.cliente_id);
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN RAISE EXCEPTION 'La aprobación exige un motivo de al menos 10 caracteres.'; END IF;
  IF v_p.estado = 'aprobada' THEN
    RETURN jsonb_build_object('poliza_id', v_p.id,'estado','aprobada','accion','idempotente');
  END IF;

  SELECT count(*), coalesce(sum(cargo_centavos),0), coalesce(sum(abono_centavos),0)
    INTO v_n, v_cargos, v_abonos FROM public.poliza_renglones WHERE poliza_id = _poliza_id;
  IF v_n < 2 THEN RAISE EXCEPTION 'La póliza no tiene renglones suficientes.'; END IF;
  IF v_cargos <> v_abonos OR v_cargos = 0 THEN
    RAISE EXCEPTION 'Partida doble rota: cargos % ≠ abonos % (centavos).', v_cargos, v_abonos;
  END IF;

  SELECT count(*) INTO v_malas FROM public.poliza_renglones r
   WHERE r.poliza_id = _poliza_id AND (
     btrim(coalesce(r.cuenta,'')) = '' OR r.cuenta ILIKE '%por identificar%'
     OR NOT EXISTS (SELECT 1 FROM public.catalogo_cuentas cc
                    WHERE cc.cliente_id = v_p.cliente_id AND cc.codigo = r.cuenta AND cc.activa));
  IF v_malas > 0 THEN RAISE EXCEPTION '% renglones con cuenta ausente del catálogo o por identificar.', v_malas; END IF;

  UPDATE public.polizas SET estado = 'aprobada', aprobada_por = auth.uid(), aprobada_at = now(),
    rechazada_por = NULL, rechazada_at = NULL, rechazo_motivo = NULL,
    monto = v_cargos / 100.0, updated_at = now() WHERE id = _poliza_id;

  PERFORM 1 FROM public.cierre_reabrir_cascada(v_p.cliente_id, v_p.periodo, 'poliza',
    btrim(_motivo), 'poliza', _poliza_id::text, 'poliza:aprob:'||_poliza_id::text||':'||v_p.version::text);

  RETURN jsonb_build_object('poliza_id', _poliza_id,'estado','aprobada','accion','aprobada',
    'cargos_centavos', v_cargos, 'abonos_centavos', v_abonos);
END; $$;

CREATE OR REPLACE FUNCTION public.poliza_rechazar(_poliza_id uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p public.polizas;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.'; END IF;
  SELECT * INTO v_p FROM public.polizas WHERE id = _poliza_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Póliza inexistente.'; END IF;
  PERFORM public.cierre_autorizar_expediente(v_p.cliente_id);
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN RAISE EXCEPTION 'El rechazo exige un motivo de al menos 10 caracteres.'; END IF;

  UPDATE public.polizas SET estado = 'rechazada', rechazada_por = auth.uid(), rechazada_at = now(),
    rechazo_motivo = btrim(_motivo), aprobada_por = NULL, aprobada_at = NULL, updated_at = now()
   WHERE id = _poliza_id;

  PERFORM 1 FROM public.cierre_reabrir_cascada(v_p.cliente_id, v_p.periodo, 'poliza',
    btrim(_motivo), 'poliza', _poliza_id::text, 'poliza:rech:'||_poliza_id::text||':'||v_p.version::text);

  RETURN jsonb_build_object('poliza_id', _poliza_id,'estado','rechazada','accion','rechazada');
END; $$;

-- ===========================================================
-- 9. Bloqueos: la evidencia manda, el fallo bloquea
-- ===========================================================
CREATE OR REPLACE FUNCTION public.cierre_bloqueos(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_b jsonb := '[]'::jsonb; v_etapa text; v_row record; v_n bigint; v_d jsonb; v_err text;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;

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

  -- Diagnósticos actuales sin escritura: la evidencia manda sobre la fila persistida.
  FOREACH v_etapa IN ARRAY ARRAY['clasificacion','bancos','polizas','impuestos'] LOOP
    v_err := NULL; v_d := NULL;
    BEGIN
      v_d := CASE v_etapa
        WHEN 'clasificacion' THEN public.cierre_diag_clasificacion(_cliente_id,_periodo)
        WHEN 'bancos' THEN public.cierre_diag_bancos(_cliente_id,_periodo)
        WHEN 'polizas' THEN public.cierre_diag_polizas(_cliente_id,_periodo)
        ELSE public.cierre_diag_impuestos(_cliente_id,_periodo) END;
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;

    IF v_err IS NOT NULL THEN
      v_b := v_b || jsonb_build_object('codigo','diagnostico_fallido_'||v_etapa,
        'detalle','El diagnóstico de “'||v_etapa||'” falló: '||v_err||'. La etapa no está comprobada.');
      CONTINUE;
    END IF;

    SELECT * INTO v_row FROM public.cierre_etapas
      WHERE cliente_id = _cliente_id AND periodo = _periodo AND etapa = v_etapa;
    IF FOUND AND v_row.estado = 'no_aplica' THEN CONTINUE; END IF;

    IF (v_d->>'estado') NOT IN ('lista','aprobada') THEN
      v_b := v_b || jsonb_build_object('codigo','diagnostico_'||v_etapa,
        'detalle','El diagnóstico vigente de “'||v_etapa||'” es “'||(v_d->>'estado')||'”.');
    ELSIF FOUND AND coalesce(v_row.input_hash,'') IS DISTINCT FROM coalesce(v_d->>'input_hash','') THEN
      v_b := v_b || jsonb_build_object('codigo','evidencia_cambiada_'||v_etapa,
        'detalle','La evidencia de “'||v_etapa||'” cambió después de declararse lista: debe reevaluarse.');
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM public.cierre_excepciones
    WHERE cliente_id = _cliente_id AND periodo = _periodo
      AND estado NOT IN ('resuelta','cerrada','descartada');
  IF v_n > 0 THEN
    v_b := v_b || jsonb_build_object('codigo','excepciones_pendientes',
      'detalle', v_n||' excepciones documentales sin decisión.');
  END IF;

  SELECT count(*) INTO v_n FROM public.cfdi_xml
    WHERE cliente_id = _cliente_id AND periodo = _periodo;
  IF v_n = 0 THEN
    v_b := v_b || jsonb_build_object('codigo','sin_documentos',
      'detalle','El periodo no tiene comprobantes: no hay nada que sellar.');
  END IF;

  RETURN v_b;
END; $$;

-- ===========================================================
-- 10. Manifiesto ampliado (v3)
-- ===========================================================
CREATE OR REPLACE FUNCTION public.cierre_manifiesto(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ini date; v_fin date; v_m jsonb; v_bancos jsonb; v_fiscal jsonb; v_tol bigint;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;
  v_ini := to_date(_periodo||'-01', 'YYYY-MM-DD');
  v_fin := (v_ini + interval '1 month')::date;

  v_bancos := public.cierre_diag_bancos(_cliente_id, _periodo);
  v_fiscal := public.cierre_diag_impuestos(_cliente_id, _periodo);
  SELECT coalesce(tolerancia_centavos,100) INTO v_tol FROM public.cierre_config_bancos WHERE cliente_id = _cliente_id;

  SELECT jsonb_build_object(
    'cliente_id', _cliente_id,
    'periodo', _periodo,
    'rango', jsonb_build_object('desde', v_ini, 'hasta_exclusivo', v_fin),
    'manifiesto_version', 'manifiesto@3',

    'cfdi', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'uuid', upper(c.uuid), 'direccion', c.direccion,
        'estatus_sat', coalesce(c.estatus_sat,'desconocido'),
        'estatus_sat_fuente', c.estatus_sat_fuente,
        'metodo_pago', c.metodo_pago, 'clase_documental', c.clase_documental,
        'total_centavos', round(coalesce(c.total,0) * 100)::bigint,
        'iva_trasladado_centavos', round(coalesce(c.iva_trasladado,0) * 100)::bigint,
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

    'bancos_diagnostico', jsonb_build_object(
      'estado', v_bancos->>'estado', 'cobertura', v_bancos->'cobertura',
      'evaluador_version', v_bancos->>'evaluador_version', 'input_hash', v_bancos->>'input_hash',
      'resultado', v_bancos->'resultado'),

    'asignaciones', coalesce(v_bancos->'resultado'->'grupos','[]'::jsonb),
    'tolerancias', jsonb_build_object('bancos_centavos', coalesce(v_tol,100)),

    'polizas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'tipo', p.tipo, 'fecha', p.fecha, 'estado', p.estado, 'version', p.version,
        'idempotency_key', p.idempotency_key, 'input_hash', p.input_hash,
        'monto_centavos', round(coalesce(p.monto,0) * 100)::bigint,
        'cuenta', p.cuenta, 'origen', p.origen, 'referencia', p.referencia,
        'cfdi_id', p.cfdi_id, 'movimiento_bancario_id', p.movimiento_bancario_id,
        'aprobada_por', p.aprobada_por, 'aprobada_at', p.aprobada_at,
        'rechazada_por', p.rechazada_por, 'rechazo_motivo', p.rechazo_motivo
      ) ORDER BY p.id)
      FROM public.polizas p
      WHERE p.cliente_id = _cliente_id AND p.periodo = _periodo), '[]'::jsonb),

    'poliza_renglones', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'poliza_id', r.poliza_id, 'numero', r.numero, 'cuenta', r.cuenta,
        'cuenta_nombre', r.cuenta_nombre, 'concepto', r.concepto,
        'cargo_centavos', r.cargo_centavos, 'abono_centavos', r.abono_centavos,
        'cfdi_id', r.cfdi_id, 'movimiento_bancario_id', r.movimiento_bancario_id
      ) ORDER BY r.poliza_id, r.numero)
      FROM public.poliza_renglones r
      JOIN public.polizas p ON p.id = r.poliza_id
      WHERE p.cliente_id = _cliente_id AND p.periodo = _periodo), '[]'::jsonb),

    'fiscal', jsonb_build_object(
      'estado', v_fiscal->>'estado',
      'evaluador_version', v_fiscal->>'evaluador_version',
      'input_hash', v_fiscal->>'input_hash',
      'entradas', v_fiscal->'resultado'->'entradas',
      'regimen', v_fiscal->'resultado'->'regimen',
      'motor_version', v_fiscal->'resultado'->'motor_version',
      'normativa', v_fiscal->'resultado'->'normativa',
      'normativa_sha256', v_fiscal->'resultado'->'normativa_sha256',
      'fundamentos', v_fiscal->'resultado'->'fundamentos',
      'fuentes', v_fiscal->'resultado'->'fuentes',
      'resultado_preliminar', v_fiscal->'resultado'->'resultado'),

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

-- ===========================================================
-- 11. Estado: nuevas secciones comparables
-- ===========================================================
CREATE OR REPLACE FUNCTION public.cierre_estado(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
      FOREACH v_sec IN ARRAY ARRAY['cfdi','decisiones','movimientos','conciliaciones','bancos_diagnostico',
        'asignaciones','tolerancias','polizas','poliza_renglones','fiscal','excepciones','etapas'] LOOP
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
    'evaluador', 'manifiesto@3',
    'etapas', v_man->'etapas',
    'resumen', public.cierre_resumen(v_man),
    'bloqueos', public.cierre_bloqueos(_cliente_id, _periodo),
    'diagnosticos', jsonb_build_object(
      'bancos', v_man->'bancos_diagnostico',
      'fiscal', v_man->'fiscal'),
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

-- ===========================================================
-- 12. Sellado: los cuatro evaluadores corren dentro del candado
-- ===========================================================
CREATE OR REPLACE FUNCTION public.cierre_sellar_manifiesto(_cliente_id uuid, _periodo text, _motivo text, _idempotency_key text DEFAULT NULL::text)
RETURNS public.cierre_snapshots LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
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

  -- Diagnósticos vigentes dentro del candado: no depende de que alguien haya abierto la pantalla.
  PERFORM public.cierre_evaluar_clasificacion(_cliente_id, _periodo);
  PERFORM public.cierre_evaluar_bancos(_cliente_id, _periodo);
  PERFORM public.cierre_evaluar_polizas(_cliente_id, _periodo);
  PERFORM public.cierre_evaluar_impuestos(_cliente_id, _periodo);

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
    v_huella, 'manifiesto@3', auth.uid(), v_man, '[]'::jsonb
  ) RETURNING * INTO v_snap;

  PERFORM public.cierre_etapa_transicion(
    _cliente_id, _periodo, 'cierre', 'aprobada', btrim(_motivo), 100, NULL, NULL,
    v_huella, 'manifiesto@3', jsonb_build_object('snapshot_id', v_snap.id, 'version', v_ver),
    coalesce(_idempotency_key, 'sello:'||v_huella), 'sellado');

  RETURN v_snap;
END; $$;

-- ===========================================================
-- 13. Permisos
-- ===========================================================
REVOKE ALL ON FUNCTION public.cierre_diag_clasificacion(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cierre_diag_bancos(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cierre_diag_polizas(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cierre_diag_impuestos(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cierre_entradas_fiscales(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cierre_marcar_no_comprobada(uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cierre_registrar_resultado_fiscal(uuid,text,text,text,jsonb,text,jsonb,text,jsonb,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cierre_set_tolerancia_bancos(uuid,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.poliza_generar_borrador(uuid,text,text,text,date,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.poliza_aprobar(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.poliza_rechazar(uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.cierre_diag_clasificacion(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cierre_diag_bancos(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cierre_diag_polizas(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cierre_diag_impuestos(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cierre_entradas_fiscales(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cierre_registrar_resultado_fiscal(uuid,text,text,text,jsonb,text,jsonb,text,jsonb,jsonb,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cierre_set_tolerancia_bancos(uuid,bigint,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.poliza_generar_borrador(uuid,text,text,text,date,text,text,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.poliza_aprobar(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.poliza_rechazar(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cierre_regimen_desde_sat(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cierre_hash_jsonb(jsonb) TO authenticated, service_role;
