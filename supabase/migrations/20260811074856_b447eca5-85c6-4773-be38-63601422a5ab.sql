-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Bitácora del resultado fiscal + regla propia de IVA
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.cierre_resultado_fiscal
  ADD COLUMN IF NOT EXISTS solicitado_por uuid,
  ADD COLUMN IF NOT EXISTS solicitado_en timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS escritor text NOT NULL DEFAULT 'servidor_confiable';

ALTER TABLE public.cfdi_decisiones_fiscales
  ADD COLUMN IF NOT EXISTS porcentaje_acreditable_iva numeric;

COMMENT ON COLUMN public.cfdi_decisiones_fiscales.porcentaje_acreditable_iva IS
  'Regla propia de acreditamiento de IVA. NULL en decisión parcial ⇒ periodo no evaluable: el porcentaje de deducibilidad de ISR no se aplica automáticamente al IVA.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Entradas fiscales normalizadas por régimen
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cierre_entradas_fiscales(_cliente_id uuid, _periodo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ini date; v_fin date; v_anio_ini date;
  v_reg_sat text; v_reg text; v_e jsonb;
  v_ing_pue bigint; v_iva_pue bigint; v_ded_pue bigint; v_iva_acr_pue bigint;
  v_isr_ret bigint; v_iva_ret bigint;
  v_ing_ppd bigint; v_iva_ppd bigint; v_ded_ppd bigint; v_iva_acr_ppd bigint;
  v_nominales bigint;
  v_sin_sat bigint; v_cancelados bigint; v_sin_dec bigint; v_sin_regla_iva bigint;
  v_ppd_sin_comp bigint; v_ppd_pagado_sin_comp bigint; v_sin_tc bigint; v_comp_dup bigint;
  v_criterio text;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;
  v_ini := to_date(_periodo||'-01','YYYY-MM-DD');
  v_fin := (v_ini + interval '1 month')::date;
  v_anio_ini := date_trunc('year', v_ini)::date;

  SELECT regimen_fiscal INTO v_reg_sat FROM public.clientes WHERE id = _cliente_id;
  v_reg := public.cierre_regimen_desde_sat(v_reg_sat);

  -- ── Flujo de efectivo: PUE del periodo. Base de ISR SIN IVA (subtotal - descuento).
  -- Los egresos (notas de crédito) restan de la base de su misma dirección.
  WITH base AS (
    SELECT
      c.direccion,
      lower(coalesce(c.clase_documental,'ingreso')) AS clase,
      CASE WHEN lower(coalesce(c.clase_documental,'ingreso')) = 'egreso' THEN -1 ELSE 1 END AS signo,
      CASE WHEN upper(coalesce(c.moneda,'MXN')) IN ('MXN','XXX','') THEN 1 ELSE c.tipo_cambio END AS tc,
      coalesce(c.subtotal,0) - coalesce(c.descuento,0) AS base_isr,
      coalesce(c.iva_trasladado,0) AS iva,
      coalesce(c.isr_retenido,0) AS isr_ret,
      coalesce(c.iva_retenido,0) AS iva_ret,
      d.porcentaje_deducible AS pct_isr,
      coalesce(
        d.porcentaje_acreditable_iva,
        CASE d.decision WHEN 'deducible' THEN 100 WHEN 'no_deducible' THEN 0 ELSE NULL END
      ) AS pct_iva
    FROM public.cfdi_xml c
    LEFT JOIN public.cfdi_decisiones_fiscales d ON d.cfdi_id = c.id
    WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo
      AND lower(coalesce(c.clase_documental,'ingreso')) <> 'pago'
      AND upper(coalesce(c.metodo_pago,'PUE')) = 'PUE'
      AND lower(coalesce(c.estatus_sat,'desconocido')) = 'vigente'
  )
  SELECT
    coalesce(sum(round(signo * base_isr * coalesce(tc,0) * 100)) FILTER (WHERE direccion='emitido'),0),
    coalesce(sum(round(signo * iva      * coalesce(tc,0) * 100)) FILTER (WHERE direccion='emitido'),0),
    coalesce(sum(round(signo * base_isr * coalesce(tc,0) * 100 * coalesce(pct_isr,0)/100.0)) FILTER (WHERE direccion='recibido'),0),
    coalesce(sum(round(signo * iva      * coalesce(tc,0) * 100 * coalesce(pct_iva,0)/100.0)) FILTER (WHERE direccion='recibido'),0),
    coalesce(sum(round(signo * isr_ret  * coalesce(tc,0) * 100)) FILTER (WHERE direccion='emitido'),0),
    coalesce(sum(round(signo * iva_ret  * coalesce(tc,0) * 100)) FILTER (WHERE direccion='emitido'),0)
  INTO v_ing_pue, v_iva_pue, v_ded_pue, v_iva_acr_pue, v_isr_ret, v_iva_ret
  FROM base;

  -- ── Complementos de pago del periodo (PPD efectivamente cobrado/pagado).
  -- Base e IVA se separan: la base es el importe pagado menos su IVA trasladado.
  WITH doc AS (
    SELECT DISTINCT ON (g.pago_id, g.cfdi_padre_id, g.num_parcialidad, g.id_documento)
      g.id, g.pago_id, g.cfdi_padre_id,
      round(coalesce(g.imp_pagado,0) * coalesce(NULLIF(p.tipo_cambio_p,0),1) * 100)::bigint AS pagado_centavos,
      pc.direccion,
      (SELECT d.porcentaje_deducible FROM public.cfdi_decisiones_fiscales d WHERE d.cfdi_id = g.cfdi_padre_id) AS pct_isr,
      (SELECT coalesce(d.porcentaje_acreditable_iva,
                CASE d.decision WHEN 'deducible' THEN 100 WHEN 'no_deducible' THEN 0 ELSE NULL END)
         FROM public.cfdi_decisiones_fiscales d WHERE d.cfdi_id = g.cfdi_padre_id) AS pct_iva
    FROM public.cfdi_pago_documentos g
    JOIN public.cfdi_pagos p ON p.id = g.pago_id
    JOIN public.cfdi_xml pc ON pc.id = p.cfdi_id
    WHERE pc.cliente_id = _cliente_id AND pc.periodo = _periodo
      AND lower(coalesce(pc.estatus_sat,'desconocido')) = 'vigente'
    ORDER BY g.pago_id, g.cfdi_padre_id, g.num_parcialidad, g.id_documento, g.created_at
  ), det AS (
    SELECT doc.*,
      coalesce((SELECT round(sum(i.importe)*100) FROM public.cfdi_pago_impuestos i
                 WHERE i.documento_id = doc.id AND i.impuesto = '002' AND i.ambito = 'traslado'),0)::bigint AS iva_centavos
    FROM doc
  )
  SELECT
    coalesce(sum(pagado_centavos - iva_centavos) FILTER (WHERE direccion='emitido'),0),
    coalesce(sum(iva_centavos) FILTER (WHERE direccion='emitido'),0),
    coalesce(sum(round((pagado_centavos - iva_centavos) * coalesce(pct_isr,0)/100.0)) FILTER (WHERE direccion='recibido'),0),
    coalesce(sum(round(iva_centavos * coalesce(pct_iva,0)/100.0)) FILTER (WHERE direccion='recibido'),0)
  INTO v_ing_ppd, v_iva_ppd, v_ded_ppd, v_iva_acr_ppd
  FROM det;

  -- ── Ingresos NOMINALES acumulados del ejercicio (art. 14 LISR, personas morales).
  SELECT coalesce(sum(
           CASE WHEN lower(coalesce(c.clase_documental,'ingreso'))='egreso' THEN -1 ELSE 1 END
           * round((coalesce(c.subtotal,0)-coalesce(c.descuento,0))
                   * CASE WHEN upper(coalesce(c.moneda,'MXN')) IN ('MXN','XXX','') THEN 1 ELSE coalesce(c.tipo_cambio,0) END
                   * 100)), 0)
    INTO v_nominales
  FROM public.cfdi_xml c
  WHERE c.cliente_id = _cliente_id
    AND c.direccion = 'emitido'
    AND lower(coalesce(c.clase_documental,'ingreso')) NOT IN ('pago')
    AND lower(coalesce(c.estatus_sat,'desconocido')) = 'vigente'
    AND c.fecha >= v_anio_ini AND c.fecha < v_fin;

  -- ── Faltantes y bloqueos verificables.
  SELECT
    count(*) FILTER (WHERE lower(coalesce(c.estatus_sat,'desconocido')) NOT IN ('vigente','cancelado')),
    count(*) FILTER (WHERE lower(coalesce(c.estatus_sat,'desconocido')) = 'cancelado'),
    count(*) FILTER (WHERE c.direccion='recibido'
                       AND lower(coalesce(c.clase_documental,'ingreso')) <> 'pago'
                       AND lower(coalesce(c.estatus_sat,'desconocido')) = 'vigente'
                       AND NOT EXISTS (SELECT 1 FROM public.cfdi_decisiones_fiscales d WHERE d.cfdi_id = c.id)),
    count(*) FILTER (WHERE c.direccion='recibido'
                       AND lower(coalesce(c.clase_documental,'ingreso')) <> 'pago'
                       AND lower(coalesce(c.estatus_sat,'desconocido')) = 'vigente'
                       AND EXISTS (SELECT 1 FROM public.cfdi_decisiones_fiscales d
                                    WHERE d.cfdi_id = c.id
                                      AND d.porcentaje_acreditable_iva IS NULL
                                      AND d.decision NOT IN ('deducible','no_deducible'))),
    count(*) FILTER (WHERE upper(coalesce(c.metodo_pago,'PUE'))='PPD'
                       AND lower(coalesce(c.clase_documental,'ingreso')) <> 'pago'
                       AND lower(coalesce(c.estatus_sat,'desconocido')) = 'vigente'
                       AND NOT EXISTS (SELECT 1 FROM public.cfdi_pago_documentos g WHERE g.cfdi_padre_id = c.id)),
    count(*) FILTER (WHERE upper(coalesce(c.metodo_pago,'PUE'))='PPD'
                       AND lower(coalesce(c.clase_documental,'ingreso')) <> 'pago'
                       AND lower(coalesce(c.estatus_sat,'desconocido')) = 'vigente'
                       AND NOT EXISTS (SELECT 1 FROM public.cfdi_pago_documentos g WHERE g.cfdi_padre_id = c.id)
                       AND EXISTS (SELECT 1 FROM public.conciliaciones k
                                    WHERE k.cfdi_id = c.id AND k.estatus = 'confirmado')),
    count(*) FILTER (WHERE upper(coalesce(c.moneda,'MXN')) NOT IN ('MXN','XXX','')
                       AND coalesce(c.tipo_cambio,0) <= 0
                       AND lower(coalesce(c.estatus_sat,'desconocido')) = 'vigente')
  INTO v_sin_sat, v_cancelados, v_sin_dec, v_sin_regla_iva, v_ppd_sin_comp, v_ppd_pagado_sin_comp, v_sin_tc
  FROM public.cfdi_xml c
  WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo;

  -- Complementos repetidos: mismo documento pagado dos veces en la misma parcialidad.
  SELECT coalesce(count(*),0) INTO v_comp_dup FROM (
    SELECT 1
    FROM public.cfdi_pago_documentos g
    JOIN public.cfdi_pagos p ON p.id = g.pago_id
    JOIN public.cfdi_xml pc ON pc.id = p.cfdi_id
    WHERE pc.cliente_id = _cliente_id AND pc.periodo = _periodo
    GROUP BY g.cfdi_padre_id, g.num_parcialidad, g.id_documento
    HAVING count(*) > 1
  ) q;

  v_criterio := CASE
    WHEN v_reg = 'PM_GENERAL' THEN 'ingresos_nominales_acumulados (art. 14 LISR) + IVA por flujo de efectivo'
    ELSE 'flujo_de_efectivo: PUE del periodo + complementos de pago del periodo'
  END;

  v_e := jsonb_build_object(
    'periodo', _periodo,
    'entradas_version','entradas@2',
    'regimen_sat', v_reg_sat,
    'regimen', v_reg,
    'criterio', v_criterio,
    'ingresos_cobrados_centavos', v_ing_pue + v_ing_ppd,
    'ingresos_pue_centavos', v_ing_pue,
    'ingresos_ppd_centavos', v_ing_ppd,
    'ingresos_nominales_acumulados_centavos', v_nominales,
    'iva_trasladado_cobrado_centavos', v_iva_pue + v_iva_ppd,
    'deducciones_pagadas_centavos', v_ded_pue + v_ded_ppd,
    'deducciones_pue_centavos', v_ded_pue,
    'deducciones_ppd_centavos', v_ded_ppd,
    'iva_acreditable_pagado_centavos', v_iva_acr_pue + v_iva_acr_ppd,
    'isr_retenido_centavos', v_isr_ret,
    'iva_retenido_centavos', v_iva_ret,
    'faltantes', jsonb_build_object(
      'comprobantes_sin_estatus_sat', v_sin_sat,
      'cancelados', v_cancelados,
      'recibidos_sin_decision', v_sin_dec,
      'recibidos_sin_regla_iva', v_sin_regla_iva,
      'ppd_sin_complemento', v_ppd_sin_comp,
      'ppd_pagado_sin_complemento', v_ppd_pagado_sin_comp,
      'sin_tipo_cambio', v_sin_tc,
      'complementos_duplicados', v_comp_dup),
    'evaluable', (v_reg IS NOT NULL AND v_sin_sat = 0 AND v_sin_dec = 0
                  AND v_sin_regla_iva = 0 AND v_ppd_pagado_sin_comp = 0
                  AND v_sin_tc = 0 AND v_comp_dup = 0));

  RETURN v_e || jsonb_build_object('input_hash', public.cierre_hash_jsonb(v_e));
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Escritor fiscal privilegiado (único camino de escritura)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.cierre_registrar_resultado_fiscal(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.cierre_registrar_resultado_fiscal_srv(
  _cliente_id uuid, _periodo text, _solicitado_por uuid, _regimen text, _motor_version text,
  _normativa jsonb, _normativa_sha256 text, _entradas jsonb, _input_hash text,
  _resultado jsonb, _fundamentos jsonb, _fuentes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_desp uuid; v_esperado text; v_id uuid; v_rol text := coalesce(auth.role(), current_user);
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. La tabla de resultados deja de ser escribible desde la sesión del usuario
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cierre_resultado_fiscal FROM anon, authenticated;
GRANT SELECT ON public.cierre_resultado_fiscal TO authenticated;
GRANT ALL ON public.cierre_resultado_fiscal TO service_role;