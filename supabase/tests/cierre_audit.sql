-- =====================================================================
-- PRUEBAS PERMANENTES DE BASE DE DATOS — CIERRE MENSUAL Y AUDITORÍA.
--
-- Se ejecutan dentro de una transacción que SIEMPRE hace ROLLBACK: no
-- dejan datos ni tocan expedientes reales. Cubren:
--   1. Inmutabilidad de `cierre_reaperturas` (UPDATE y DELETE fallan).
--   2. Reapertura automática al reemplazar la normalización de un CFDI de
--      un periodo ya declarado, con registro del estado anterior.
--   3. Preservación de la evidencia SAT (estatus_sat y su fuente) durante
--      la normalización: la evidencia jamás se pisa.
--   4. Excepciones: cierre automático sin DELETE y ocurrencia nueva ligada.
-- =====================================================================

BEGIN;

CREATE TEMP TABLE _fallas(prueba text, detalle text) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION pg_temp.chk(_p text, _cond boolean, _d text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT _cond THEN INSERT INTO _fallas VALUES (_p, _d); END IF;
END $$;

DO $$
DECLARE
  v_desp uuid; v_cli uuid; v_rfc uuid; v_cfdi uuid; v_exc uuid; v_exc2 uuid;
  v_ok boolean; v_estatus text; v_fuente text; v_n int;
  v_periodo text := '2026-03';
BEGIN
  -- ── Expediente sintético ────────────────────────────────────────────
  INSERT INTO public.despachos (nombre, estado, owner_user_id)
  SELECT 'QA Cierre', 'trial', id FROM auth.users ORDER BY created_at LIMIT 1
  RETURNING id INTO v_desp;

  INSERT INTO public.clientes (despacho_id, user_id, razon_social, rfc)
  SELECT v_desp, d.owner_user_id, 'QA Cliente', 'AAA010101AAA'
    FROM public.despachos d WHERE d.id = v_desp
  RETURNING id INTO v_cli;

  INSERT INTO public.rfcs (despacho_id, cliente_id, rfc, tipo_persona)
  VALUES (v_desp, v_cli, 'AAA010101AAA', 'fisica') RETURNING id INTO v_rfc;

  INSERT INTO public.cfdi_xml (despacho_id, cliente_id, rfc_id, archivo_hash, uuid, tipo_cfdi, fecha, rfc_emisor, rfc_receptor,
                               total, estatus_sat, estatus_sat_fuente, estatus_sat_evidencia_at,
                               origen, sat_solicitud_id, sat_paquete_id, periodo)
  VALUES (v_desp, v_cli, v_rfc, md5('qa-cierre-audit'), 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE', 'I', '2026-03-10',
          'BBB020202BB2', 'AAA010101AAA', 1160, 'vigente', 'sat_descarga_masiva', now(),
          'sat_descarga_masiva', 'SOL-1', 'PKG-1', v_periodo)
  RETURNING id INTO v_cfdi;

  INSERT INTO public.cierre_periodos (despacho_id, cliente_id, periodo, etapa_documental, declarada_at)
  VALUES (v_desp, v_cli, v_periodo, 'lista', now());

  -- ── 2 y 3. Normalización: reabre el periodo y NO pisa la evidencia ──
  PERFORM public.cfdi_normalizacion_reemplazar(v_cfdi, jsonb_build_object(
    'cabecera', jsonb_build_object('periodo', v_periodo, 'guardar_xml', false,
      'detalle_reconstruible', true, 'normalizacion_version', 'qa',
      'direccion', 'recibidos', 'clase_documental', 'ingreso',
      'estado_relacion', 'sin_relacion', 'estado_procesamiento', 'normalizado',
      'motivos', '[]'::jsonb),
    'conceptos', '[]'::jsonb, 'impuestos', '[]'::jsonb, 'relaciones', '[]'::jsonb, 'pagos', '[]'::jsonb,
    'reabrir_periodo', true));

  SELECT estatus_sat, estatus_sat_fuente INTO v_estatus, v_fuente FROM public.cfdi_xml WHERE id = v_cfdi;
  PERFORM pg_temp.chk('evidencia_sat_preservada', v_estatus = 'vigente' AND v_fuente = 'sat_descarga_masiva',
                      'La normalización alteró la evidencia SAT: ' || coalesce(v_estatus,'null'));

  SELECT etapa_documental <> 'lista' INTO v_ok FROM public.cierre_periodos
   WHERE cliente_id = v_cli AND periodo = v_periodo;
  PERFORM pg_temp.chk('reapertura_automatica', coalesce(v_ok,false),
                      'El periodo declarado no se reabrió al cambiar el detalle del CFDI');

  SELECT count(*) INTO v_n FROM public.cierre_reaperturas
   WHERE cliente_id = v_cli AND periodo = v_periodo;
  PERFORM pg_temp.chk('reapertura_registrada', v_n >= 1, 'No se registró la reapertura en el historial');

  -- ── 1. Historial inmutable ──────────────────────────────────────────
  BEGIN
    UPDATE public.cierre_reaperturas SET motivo = 'alterado' WHERE cliente_id = v_cli;
    PERFORM pg_temp.chk('historial_inmutable_update', false, 'Se pudo ACTUALIZAR el historial de reaperturas');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    DELETE FROM public.cierre_reaperturas WHERE cliente_id = v_cli;
    PERFORM pg_temp.chk('historial_inmutable_delete', false, 'Se pudo BORRAR el historial de reaperturas');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── 4. Excepciones: cierre sin DELETE y reaparición ligada ──────────
  INSERT INTO public.cierre_excepciones (despacho_id, cliente_id, periodo, cfdi_id, codigo, severidad,
                                         titulo, detalle, estado, ocurrencia)
  VALUES (v_desp, v_cli, v_periodo, v_cfdi, 'cfdi_sin_impuestos', 'advertencia',
          'QA', '{}'::jsonb, 'pendiente', 1) RETURNING id INTO v_exc;

  -- Una SEGUNDA ocurrencia viva debe seguir prohibida por el índice parcial.
  BEGIN
    INSERT INTO public.cierre_excepciones (despacho_id, cliente_id, periodo, cfdi_id, codigo, severidad,
                                           titulo, detalle, estado, ocurrencia)
    VALUES (v_desp, v_cli, v_periodo, v_cfdi, 'cfdi_sin_impuestos', 'advertencia',
            'QA', '{}'::jsonb, 'pendiente', 2);
    PERFORM pg_temp.chk('una_sola_ocurrencia_viva', false, 'Se permitieron dos excepciones vivas iguales');
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  UPDATE public.cierre_excepciones
     SET estado = 'resuelta_automatica', cerrada_motivo = 'CAUSA_DESAPARECIO', resuelta_at = now()
   WHERE id = v_exc;

  SELECT count(*) INTO v_n FROM public.cierre_excepciones WHERE id = v_exc;
  PERFORM pg_temp.chk('excepcion_no_borrada', v_n = 1, 'La excepción cerrada dejó de existir');

  INSERT INTO public.cierre_excepciones (despacho_id, cliente_id, periodo, cfdi_id, codigo, severidad,
                                         titulo, detalle, estado, ocurrencia, excepcion_previa_id, reactivada_at)
  VALUES (v_desp, v_cli, v_periodo, v_cfdi, 'cfdi_sin_impuestos', 'advertencia',
          'QA', '{}'::jsonb, 'pendiente', 2, v_exc, now()) RETURNING id INTO v_exc2;

  SELECT count(*) INTO v_n FROM public.cierre_excepciones
   WHERE id = v_exc2 AND excepcion_previa_id = v_exc AND ocurrencia = 2;
  PERFORM pg_temp.chk('excepcion_reaparicion', v_n = 1, 'La reaparición no quedó ligada a la ocurrencia previa');
END $$;

DO $$
DECLARE v_n int; r record; v_msg text := '';
BEGIN
  SELECT count(*) INTO v_n FROM _fallas;
  IF v_n > 0 THEN
    FOR r IN SELECT * FROM _fallas LOOP v_msg := v_msg || r.prueba || ': ' || r.detalle || ' | '; END LOOP;
    RAISE EXCEPTION 'PRUEBAS DE CIERRE FALLIDAS (%): %', v_n, v_msg;
  END IF;
  RAISE NOTICE 'PRUEBAS DE CIERRE: TODAS PASARON';
END $$;

ROLLBACK;
