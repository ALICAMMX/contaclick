CREATE OR REPLACE FUNCTION public.cfdi_normalizacion_reemplazar(_cfdi_id uuid, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cli uuid; v_desp uuid;
  v_pago jsonb; v_pago_id uuid; v_doc jsonb; v_docid uuid; v_padre uuid;
  v_ids uuid[]; v_imp jsonb; v_idx int;
  v_periodo text := NULLIF(_payload->'cabecera'->>'periodo', '');
  v_reabierto boolean := false;
  v_docs int := 0;
BEGIN
  SELECT cliente_id, despacho_id INTO v_cli, v_desp FROM public.cfdi_xml WHERE id = _cfdi_id;
  IF v_cli IS NULL THEN
    RAISE EXCEPTION 'El comprobante % no existe o no es accesible.', _cfdi_id;
  END IF;

  DELETE FROM public.cfdi_impuestos WHERE cfdi_id = _cfdi_id;
  DELETE FROM public.cfdi_pagos     WHERE cfdi_id = _cfdi_id;
  DELETE FROM public.cfdi_conceptos WHERE cfdi_id = _cfdi_id;
  DELETE FROM public.cfdi_relaciones WHERE cfdi_id = _cfdi_id;

  INSERT INTO public.cfdi_conceptos (cfdi_id, numero, clave_prod_serv, descripcion, cantidad, valor_unitario, importe)
  SELECT _cfdi_id, (c->>'numero')::int, c->>'clave_prod_serv', c->>'descripcion',
         (c->>'cantidad')::numeric, (c->>'valor_unitario')::numeric, (c->>'importe')::numeric
  FROM jsonb_array_elements(COALESCE(_payload->'conceptos', '[]'::jsonb)) c;

  INSERT INTO public.cfdi_impuestos (cfdi_id, nivel, concepto_numero, tipo, impuesto, impuesto_nombre, base, tipo_factor, tasa_cuota, importe)
  SELECT _cfdi_id, i->>'nivel', (i->>'concepto_numero')::int, i->>'tipo', i->>'impuesto', i->>'impuesto_nombre',
         (i->>'base')::numeric, i->>'tipo_factor', (i->>'tasa_cuota')::numeric, (i->>'importe')::numeric
  FROM jsonb_array_elements(COALESCE(_payload->'impuestos', '[]'::jsonb)) i;

  INSERT INTO public.cfdi_relaciones (cfdi_id, uuid_relacionado, tipo_relacion)
  SELECT _cfdi_id, r->>'uuid_relacionado', r->>'tipo_relacion'
  FROM jsonb_array_elements(COALESCE(_payload->'relaciones', '[]'::jsonb)) r;

  FOR v_pago IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'pagos', '[]'::jsonb)) LOOP
    INSERT INTO public.cfdi_pagos (cfdi_id, despacho_id, cliente_id, numero_pago, fecha_pago, forma_pago_p, moneda_p, tipo_cambio_p, monto, num_operacion)
    VALUES (_cfdi_id, v_desp, v_cli, (v_pago->>'numero_pago')::int,
            NULLIF(v_pago->>'fecha_pago','')::timestamptz, v_pago->>'forma_pago_p', v_pago->>'moneda_p',
            (v_pago->>'tipo_cambio_p')::numeric, (v_pago->>'monto')::numeric, v_pago->>'num_operacion')
    RETURNING id INTO v_pago_id;

    v_ids := ARRAY[]::uuid[];
    FOR v_doc IN SELECT * FROM jsonb_array_elements(COALESCE(v_pago->'documentos', '[]'::jsonb)) LOOP
      SELECT x.id INTO v_padre FROM public.cfdi_xml x
       WHERE x.cliente_id = v_cli AND upper(btrim(x.uuid)) = upper(btrim(v_doc->>'id_documento'))
       LIMIT 1;
      INSERT INTO public.cfdi_pago_documentos
        (pago_id, cfdi_id, id_documento, serie, folio, moneda_dr, equivalencia_dr, num_parcialidad,
         imp_saldo_ant, imp_pagado, imp_saldo_insoluto, objeto_imp_dr, cfdi_padre_id)
      VALUES (v_pago_id, _cfdi_id, v_doc->>'id_documento', v_doc->>'serie', v_doc->>'folio', v_doc->>'moneda_dr',
              (v_doc->>'equivalencia_dr')::numeric, (v_doc->>'num_parcialidad')::int,
              (v_doc->>'imp_saldo_ant')::numeric, (v_doc->>'imp_pagado')::numeric,
              (v_doc->>'imp_saldo_insoluto')::numeric, v_doc->>'objeto_imp_dr', v_padre)
      RETURNING id INTO v_docid;
      v_ids := array_append(v_ids, v_docid);
      v_docs := v_docs + 1;
      v_padre := NULL;
    END LOOP;

    FOR v_imp IN SELECT * FROM jsonb_array_elements(COALESCE(v_pago->'impuestos', '[]'::jsonb)) LOOP
      v_idx := NULLIF(v_imp->>'documento_indice','')::int;
      INSERT INTO public.cfdi_pago_impuestos (pago_id, documento_id, ambito, tipo, impuesto, base, tipo_factor, tasa_cuota, importe)
      VALUES (v_pago_id,
              CASE WHEN v_idx IS NOT NULL AND v_idx >= 0 AND v_idx < array_length(v_ids,1) THEN v_ids[v_idx + 1] ELSE NULL END,
              v_imp->>'ambito', v_imp->>'tipo', v_imp->>'impuesto', (v_imp->>'base')::numeric,
              v_imp->>'tipo_factor', (v_imp->>'tasa_cuota')::numeric, (v_imp->>'importe')::numeric);
    END LOOP;
  END LOOP;

  -- Cabecera. NO se toca estatus_sat ni estatus_sat_check_at: la evidencia del SAT se conserva.
  UPDATE public.cfdi_xml SET
    xml_raw = CASE WHEN (_payload->'cabecera'->>'guardar_xml')::boolean THEN _payload->'cabecera'->>'xml_raw' ELSE NULL END,
    detalle_reconstruible = COALESCE((_payload->'cabecera'->>'detalle_reconstruible')::boolean, false),
    normalizado_at = now(),
    normalizacion_version = _payload->'cabecera'->>'normalizacion_version',
    periodo = v_periodo,
    direccion = _payload->'cabecera'->>'direccion',
    clase_documental = _payload->'cabecera'->>'clase_documental',
    estado_relacion = _payload->'cabecera'->>'estado_relacion',
    estado_procesamiento = _payload->'cabecera'->>'estado_procesamiento',
    motivos = COALESCE(_payload->'cabecera'->'motivos', '[]'::jsonb)
  WHERE id = _cfdi_id;

  IF COALESCE((_payload->>'reabrir_periodo')::boolean, false) AND v_periodo IS NOT NULL THEN
    UPDATE public.cierre_periodos
       SET etapa_documental = 'en_proceso', declarada_at = NULL, declarada_por = NULL,
           notas = COALESCE(notas, '') ,
           ultima_revision_at = now()
     WHERE cliente_id = v_cli AND periodo = v_periodo AND etapa_documental = 'lista';
    IF FOUND THEN v_reabierto := true; END IF;
  END IF;

  RETURN jsonb_build_object(
    'cfdi_id', _cfdi_id,
    'periodo', v_periodo,
    'documentos_relacionados', v_docs,
    'periodo_reabierto', v_reabierto
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cfdi_normalizacion_reemplazar(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cfdi_normalizacion_reemplazar(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cfdi_normalizacion_reemplazar(uuid, jsonb) TO service_role;