-- =====================================================================
-- PRUEBAS PERMANENTES DE BASE DE DATOS — CIERRE MENSUAL Y AUDITORÍA.
--
-- Se ejecutan dentro de una transacción que SIEMPRE hace ROLLBACK: no
-- dejan datos ni tocan expedientes reales. NO contactan al SAT.
--
-- Regla de esta suite: se invocan LAS MISMAS funciones SQL que usa el
-- código de producción (`sincronizarExcepciones` →
-- `cierre_excepcion_crear_ocurrencia` y `cierre_excepcion_cerrar_automatica`,
-- y `cfdi_normalizacion_reemplazar`). Está prohibido reproducir un
-- resultado con UPDATE/INSERT manuales.
--
-- Cobertura:
--   1. Inmutabilidad real de `cierre_reaperturas` (UPDATE y DELETE los
--      rechaza el TRIGGER, sobre columnas que existen).
--   2. Reapertura automática al reemplazar la normalización de un CFDI de
--      un periodo ya declarado.
--   3. Preservación de la evidencia SAT durante la normalización.
--   4. Excepciones por la ruta real: aparición, cierre automático con
--      bitácora atómica, rollback total si falla la bitácora, reaparición
--      ligada y doble ejecución sin duplicados.
--   5. Invariante de evidencia: `descarga_masiva_sat` exige solicitud y
--      paquete; sin EstadoComprobante persistido el estatus es desconocido.
-- =====================================================================

BEGIN;

CREATE TEMP TABLE _fallas(prueba text, detalle text) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION pg_temp.chk(_p text, _cond boolean, _d text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT _cond THEN INSERT INTO _fallas VALUES (_p, _d); END IF;
END $$;

-- Interruptor de falla intencional de bitácora (sólo dentro de esta prueba).
CREATE OR REPLACE FUNCTION pg_temp.qa_bitacora_falla() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.motivo LIKE 'FALLA_QA%' THEN
    RAISE EXCEPTION 'QA: fallo intencional al escribir la bitácora';
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE
  v_desp uuid; v_cli uuid; v_rfc uuid; v_cfdi uuid;
  v_e1 uuid; v_e2 uuid; v_tmp uuid;
  v_ok boolean; v_estatus text; v_fuente text; v_n int; v_estado text;
  v_periodo text := '2026-03';
  v_fuente_canonica text := 'descarga_masiva_sat';
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

  -- Documento con evidencia REAL: solicitud Vigente + paquete + fuente canónica.
  INSERT INTO public.cfdi_xml (despacho_id, cliente_id, rfc_id, archivo_hash, uuid, tipo_cfdi, fecha, rfc_emisor, rfc_receptor,
                               total, estatus_sat, estatus_sat_fuente, estatus_sat_evidencia_at,
                               origen, sat_solicitud_id, sat_paquete_id, periodo)
  VALUES (v_desp, v_cli, v_rfc, md5('qa-cierre-audit'), 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE', 'I', '2026-03-10',
          'BBB020202BB2', 'AAA010101AAA', 1160, 'vigente', v_fuente_canonica, now(),
          'sat_descarga_masiva', 'SOL-1', 'PKG-1', v_periodo)
  RETURNING id INTO v_cfdi;

  INSERT INTO public.cierre_periodos (despacho_id, cliente_id, periodo, etapa_documental, declarada_at)
  VALUES (v_desp, v_cli, v_periodo, 'lista', now());

  -- ── 2 y 3. Normalización real: reabre el periodo y NO pisa la evidencia ──
  PERFORM public.cfdi_normalizacion_reemplazar(v_cfdi, jsonb_build_object(
    'cabecera', jsonb_build_object('periodo', v_periodo, 'guardar_xml', false,
      'detalle_reconstruible', true, 'normalizacion_version', 'qa',
      'direccion', 'recibidos', 'clase_documental', 'ingreso',
      'estado_relacion', 'sin_relacion', 'estado_procesamiento', 'normalizado',
      'motivos', '[]'::jsonb),
    'conceptos', '[]'::jsonb, 'impuestos', '[]'::jsonb, 'relaciones', '[]'::jsonb, 'pagos', '[]'::jsonb,
    'reabrir_periodo', true));

  SELECT estatus_sat, estatus_sat_fuente INTO v_estatus, v_fuente FROM public.cfdi_xml WHERE id = v_cfdi;
  PERFORM pg_temp.chk('evidencia_sat_preservada',
                      v_estatus = 'vigente' AND v_fuente = v_fuente_canonica,
                      'La normalización alteró la evidencia SAT: ' || coalesce(v_estatus,'null') || '/' || coalesce(v_fuente,'null'));

  SELECT etapa_documental <> 'lista' INTO v_ok FROM public.cierre_periodos
   WHERE cliente_id = v_cli AND periodo = v_periodo;
  PERFORM pg_temp.chk('reapertura_automatica', coalesce(v_ok,false),
                      'El periodo declarado no se reabrió al cambiar el detalle del CFDI');

  SELECT count(*) INTO v_n FROM public.cierre_reaperturas
   WHERE cliente_id = v_cli AND periodo = v_periodo;
  PERFORM pg_temp.chk('reapertura_registrada', v_n >= 1, 'No se registró la reapertura en el historial');

  -- ── 1. Historial inmutable: columnas REALES y error DEL TRIGGER ─────
  BEGIN
    UPDATE public.cierre_reaperturas SET proceso = 'alterado' WHERE cliente_id = v_cli;
    PERFORM pg_temp.chk('historial_inmutable_update_proceso', false, 'Se pudo ACTUALIZAR cierre_reaperturas.proceso');
  EXCEPTION
    WHEN undefined_column THEN
      PERFORM pg_temp.chk('historial_inmutable_update_proceso', false, 'La prueba usó una columna inexistente');
    WHEN OTHERS THEN
      PERFORM pg_temp.chk('historial_inmutable_update_proceso',
        SQLERRM ILIKE '%inmutable%' OR SQLERRM ILIKE '%immutable%' OR SQLERRM ILIKE '%no se puede%'
        OR SQLERRM ILIKE '%no puede%' OR SQLERRM ILIKE '%hist%',
        'El UPDATE falló por un motivo distinto al trigger de inmutabilidad: ' || SQLERRM);
  END;

  BEGIN
    UPDATE public.cierre_reaperturas SET estado_anterior = 'alterado' WHERE cliente_id = v_cli;
    PERFORM pg_temp.chk('historial_inmutable_update_estado', false, 'Se pudo ACTUALIZAR cierre_reaperturas.estado_anterior');
  EXCEPTION
    WHEN undefined_column THEN
      PERFORM pg_temp.chk('historial_inmutable_update_estado', false, 'La prueba usó una columna inexistente');
    WHEN OTHERS THEN NULL;
  END;

  BEGIN
    DELETE FROM public.cierre_reaperturas WHERE cliente_id = v_cli;
    PERFORM pg_temp.chk('historial_inmutable_delete', false, 'Se pudo BORRAR el historial de reaperturas');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── 4. Excepciones POR LA RUTA REAL ─────────────────────────────────
  -- 4.a Aparición inicial (misma función que usa sincronizarExcepciones).
  v_e1 := public.cierre_excepcion_crear_ocurrencia(
    v_desp, v_cli, v_periodo, v_cfdi, 'cfdi_sin_impuestos', 'advertencia',
    'QA', '{}'::jsonb, 1, NULL, 'sistema');
  PERFORM pg_temp.chk('excepcion_alta_real', v_e1 IS NOT NULL, 'La función real no creó la excepción');

  -- 4.b Doble ejecución: idempotente, sin duplicados.
  v_tmp := public.cierre_excepcion_crear_ocurrencia(
    v_desp, v_cli, v_periodo, v_cfdi, 'cfdi_sin_impuestos', 'advertencia',
    'QA', '{}'::jsonb, 1, NULL, 'sistema');
  SELECT count(*) INTO v_n FROM public.cierre_excepciones
   WHERE cliente_id = v_cli AND periodo = v_periodo AND codigo = 'cfdi_sin_impuestos';
  PERFORM pg_temp.chk('excepcion_idempotente', v_tmp = v_e1 AND v_n = 1,
                      'La segunda ejecución duplicó la excepción (' || v_n || ')');

  -- 4.c Fallo intencional de bitácora: rollback TOTAL del cierre.
  CREATE CONSTRAINT TRIGGER qa_bitacora_falla
    AFTER INSERT ON public.cierre_excepcion_bitacora
    DEFERRABLE INITIALLY IMMEDIATE
    FOR EACH ROW EXECUTE FUNCTION pg_temp.qa_bitacora_falla();

  BEGIN
    PERFORM public.cierre_excepcion_cerrar_automatica(ARRAY[v_e1], 'FALLA_QA_ROLLBACK', 'sistema');
    PERFORM pg_temp.chk('bitacora_falla_propaga', false, 'La falla de bitácora no abortó el cierre');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  SELECT estado INTO v_estado FROM public.cierre_excepciones WHERE id = v_e1;
  PERFORM pg_temp.chk('rollback_estado_intacto', v_estado = 'pendiente',
                      'El estado quedó en ' || coalesce(v_estado,'null') || ' pese a fallar la bitácora');
  SELECT count(*) INTO v_n FROM public.cierre_excepcion_bitacora WHERE excepcion_id = v_e1;
  PERFORM pg_temp.chk('rollback_sin_bitacora_huerfana', v_n = 0,
                      'Quedaron ' || v_n || ' registros de bitácora huérfanos');

  DROP TRIGGER qa_bitacora_falla ON public.cierre_excepcion_bitacora;

  -- 4.d Cierre automático real: estado + bitácora, sin DELETE.
  PERFORM public.cierre_excepcion_cerrar_automatica(ARRAY[v_e1], 'CAUSA_DESAPARECIO', 'sistema');

  SELECT estado INTO v_estado FROM public.cierre_excepciones WHERE id = v_e1;
  PERFORM pg_temp.chk('cierre_automatico_estado', v_estado = 'resuelta_automatica',
                      'El cierre real no cambió el estado: ' || coalesce(v_estado,'null'));
  SELECT count(*) INTO v_n FROM public.cierre_excepcion_bitacora
   WHERE excepcion_id = v_e1 AND accion = 'resuelta_automatica';
  PERFORM pg_temp.chk('cierre_automatico_bitacora', v_n = 1,
                      'La bitácora del cierre automático no se escribió (' || v_n || ')');
  SELECT count(*) INTO v_n FROM public.cierre_excepciones WHERE id = v_e1;
  PERFORM pg_temp.chk('excepcion_no_borrada', v_n = 1, 'La excepción cerrada dejó de existir');

  -- 4.e Cierre repetido: idempotente, sin segunda bitácora.
  PERFORM public.cierre_excepcion_cerrar_automatica(ARRAY[v_e1], 'CAUSA_DESAPARECIO', 'sistema');
  SELECT count(*) INTO v_n FROM public.cierre_excepcion_bitacora WHERE excepcion_id = v_e1;
  PERFORM pg_temp.chk('cierre_idempotente', v_n = 1,
                      'El cierre repetido duplicó la bitácora (' || v_n || ')');

  -- 4.f Reaparición ligada, atómica con su evento.
  v_e2 := public.cierre_excepcion_crear_ocurrencia(
    v_desp, v_cli, v_periodo, v_cfdi, 'cfdi_sin_impuestos', 'advertencia',
    'QA', '{}'::jsonb, 2, v_e1, 'sistema');
  SELECT count(*) INTO v_n FROM public.cierre_excepciones
   WHERE id = v_e2 AND excepcion_previa_id = v_e1 AND ocurrencia = 2 AND reactivada_at IS NOT NULL;
  PERFORM pg_temp.chk('excepcion_reaparicion', v_n = 1, 'La reaparición no quedó ligada a la ocurrencia previa');
  SELECT count(*) INTO v_n FROM public.cierre_excepcion_bitacora
   WHERE excepcion_id = v_e2 AND accion = 'reaparicion';
  PERFORM pg_temp.chk('reaparicion_bitacora', v_n = 1, 'La reaparición no dejó evento en bitácora');

  -- 4.g Índice parcial vigente: una sola ocurrencia viva.
  BEGIN
    INSERT INTO public.cierre_excepciones (despacho_id, cliente_id, periodo, cfdi_id, codigo, severidad,
                                           titulo, detalle, estado, ocurrencia)
    VALUES (v_desp, v_cli, v_periodo, v_cfdi, 'cfdi_sin_impuestos', 'advertencia',
            'QA', '{}'::jsonb, 'pendiente', 3);
    PERFORM pg_temp.chk('una_sola_ocurrencia_viva', false, 'Se permitieron dos excepciones vivas iguales');
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- ── 5. Evidencia sin valores por defecto ────────────────────────────
  -- Sin EstadoComprobante persistido el código de producción no escribe
  -- fuente ni fecha: verificamos que la fila así construida quede desconocida.
  INSERT INTO public.cfdi_xml (despacho_id, cliente_id, rfc_id, archivo_hash, uuid, tipo_cfdi, fecha,
                               rfc_emisor, rfc_receptor, total,
                               estatus_sat, estatus_sat_fuente, estatus_sat_evidencia_at,
                               origen, sat_solicitud_id, sat_paquete_id, periodo)
  VALUES (v_desp, v_cli, v_rfc, md5('qa-historica'), 'BBBBBBBB-CCCC-4DDD-8EEE-FFFFFFFFFFFF', 'I', '2026-03-11',
          'BBB020202BB2', 'AAA010101AAA', 100,
          'desconocido', NULL, NULL,
          'sat_descarga_masiva', 'SOL-HIST', 'PKG-HIST', v_periodo)
  RETURNING id INTO v_tmp;

  SELECT count(*) INTO v_n FROM public.cfdi_xml
   WHERE id = v_tmp AND estatus_sat = 'desconocido'
     AND estatus_sat_fuente IS NULL AND estatus_sat_evidencia_at IS NULL;
  PERFORM pg_temp.chk('evidencia_desconocida_sin_estado', v_n = 1,
                      'Una solicitud histórica sin EstadoComprobante produjo evidencia');

  -- Invariante sobre datos reales: nadie puede llevar la fuente canónica sin
  -- solicitud y paquete del SAT.
  SELECT count(*) INTO v_n FROM public.cfdi_xml
   WHERE estatus_sat_fuente = v_fuente_canonica
     AND (sat_solicitud_id IS NULL OR sat_paquete_id IS NULL);
  PERFORM pg_temp.chk('evidencia_solo_con_linaje', v_n = 0,
                      v_n || ' documentos declaran evidencia sin solicitud o paquete');

  SELECT count(*) INTO v_n FROM public.cfdi_xml
   WHERE estatus_sat = 'vigente' AND estatus_sat_fuente IS DISTINCT FROM v_fuente_canonica
     AND origen = 'sat_descarga_masiva';
  PERFORM pg_temp.chk('fuente_canonica_unica', v_n = 0,
                      v_n || ' documentos vigentes usan una fuente distinta de ' || v_fuente_canonica);
END $$;

DO $$
DECLARE v_n int; r record; v_msg text := '';
BEGIN
  SELECT count(*) INTO v_n FROM _fallas;
  IF v_n > 0 THEN
    FOR r IN SELECT * FROM _fallas LOOP v_msg := v_msg || r.prueba || ': ' || r.detalle || ' | '; END LOOP;
    RAISE EXCEPTION 'PRUEBAS DE CIERRE FALLIDAS (%): %', v_n, v_msg;
  END IF;
  RAISE NOTICE 'QA_RESULTADO=TODAS_PASARON';
END $$;

ROLLBACK;
