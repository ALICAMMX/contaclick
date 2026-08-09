-- =====================================================================
-- PRUEBA PERMANENTE: evidencia SAT inmutable, su RPC y el aislamiento RLS.
--
-- Todo el archivo corre dentro de BEGIN…ROLLBACK: no deja residuos y no
-- toca datos fiscales reales. NO precarga estatus_sat='vigente' ni fuente:
-- la evidencia sólo puede aparecer si la FUNCIÓN REAL la crea.
--
-- Uso:  psql -v ON_ERROR_STOP=1 -f supabase/tests/evidencia_sat.sql
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE qa(nombre text, ok boolean, detalle text) ON COMMIT DROP;

-- Usuarios sintéticos: identidades reales de profiles, expedientes nuevos.
\set USER_A '2099b50e-2711-49f7-8a60-a861275fb13a'
\set USER_B 'b3022665-78ae-415e-a1f5-967ea8635afc'

DO $qa$
DECLARE
  v_ua uuid := '2099b50e-2711-49f7-8a60-a861275fb13a';
  v_ub uuid := 'b3022665-78ae-415e-a1f5-967ea8635afc';
  v_da uuid; v_db uuid;
  v_ca uuid; v_cb uuid;
  v_rfca uuid; v_rfcb uuid;
  v_cfdi_a uuid; v_cfdi_b uuid;
  v_run_a uuid; v_run_b uuid;
  v_res jsonb;
  v_row public.cfdi_xml%ROWTYPE;
  v_n int;
BEGIN
  -- ---------- Expedientes sintéticos (dos despachos distintos) ----------
  INSERT INTO public.despachos (nombre, owner_user_id) VALUES ('QA-EVID-A', v_ua) RETURNING id INTO v_da;
  INSERT INTO public.despachos (nombre, owner_user_id) VALUES ('QA-EVID-B', v_ub) RETURNING id INTO v_db;
  INSERT INTO public.user_memberships (user_id, despacho_id, estado) VALUES (v_ua, v_da, 'activo'), (v_ub, v_db, 'activo');
  INSERT INTO public.user_roles (user_id, despacho_id, role) VALUES (v_ua, v_da, 'despacho'), (v_ub, v_db, 'despacho');

  INSERT INTO public.clientes (user_id, despacho_id, rfc, razon_social)
  VALUES (v_ua, v_da, 'QAA010101AAA', 'QA EVID A') RETURNING id INTO v_ca;
  INSERT INTO public.clientes (user_id, despacho_id, rfc, razon_social)
  VALUES (v_ub, v_db, 'QAB020202BB2', 'QA EVID B') RETURNING id INTO v_cb;

  INSERT INTO public.rfcs (despacho_id, cliente_id, rfc, tipo_persona)
  VALUES (v_da, v_ca, 'QAA010101AAA', 'moral') RETURNING id INTO v_rfca;
  INSERT INTO public.rfcs (despacho_id, cliente_id, rfc, tipo_persona)
  VALUES (v_db, v_cb, 'QAB020202BB2', 'moral') RETURNING id INTO v_rfcb;

  -- ---------- CFDI cargado MANUALMENTE: desconocido y sin evidencia ----------
  INSERT INTO public.cfdi_xml (despacho_id, cliente_id, rfc_id, uuid, tipo_cfdi,
    rfc_emisor, rfc_receptor, fecha, archivo_hash, origen, estatus_sat)
  VALUES (v_da, v_ca, v_rfca, 'QA000001-0000-4000-8000-000000000001', 'I',
    'QAA010101AAA', 'QAB020202BB2', now(), 'qa-hash-1', 'carga_manual', 'desconocido')
  RETURNING id INTO v_cfdi_a;

  INSERT INTO public.cfdi_xml (despacho_id, cliente_id, rfc_id, uuid, tipo_cfdi,
    rfc_emisor, rfc_receptor, fecha, archivo_hash, origen, estatus_sat)
  VALUES (v_db, v_cb, v_rfcb, 'QA000002-0000-4000-8000-000000000002', 'I',
    'QAB020202BB2', 'QAA010101AAA', now(), 'qa-hash-2', 'carga_manual', 'desconocido')
  RETURNING id INTO v_cfdi_b;

  -- ---------- Corridas persistidas ----------
  INSERT INTO public.sat_sync_runs (despacho_id, cliente_id, proveedor, estado, solicitudes)
  VALUES (v_da, v_ca, 'sat_directo', 'completado', jsonb_build_array(
    jsonb_build_object('id_solicitud','SOL-A','estado_comprobante','Vigente',
                       'paquetes_procesados', jsonb_build_array('PKG-A1')),
    jsonb_build_object('id_solicitud','SOL-SIN-ESTADO',
                       'paquetes_procesados', jsonb_build_array('PKG-S1')),
    jsonb_build_object('id_solicitud','SOL-TODOS','estado_comprobante','Todos',
                       'paquetes_procesados', jsonb_build_array('PKG-T1')),
    jsonb_build_object('id_solicitud','SOL-SIN-PAQUETE','estado_comprobante','Vigente',
                       'paquetes_encontrados', jsonb_build_array('PKG-X1'),
                       'paquetes_procesados', '[]'::jsonb)
  )) RETURNING id INTO v_run_a;

  INSERT INTO public.sat_sync_runs (despacho_id, cliente_id, proveedor, estado, solicitudes)
  VALUES (v_db, v_cb, 'sat_directo', 'completado', jsonb_build_array(
    jsonb_build_object('id_solicitud','SOL-B','estado_comprobante','Vigente',
                       'paquetes_procesados', jsonb_build_array('PKG-B1'))
  )) RETURNING id INTO v_run_b;

  -- =================== CASOS NEGATIVOS (antes del positivo) ===================
  v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_a, v_run_a, 'SOL-SIN-ESTADO', 'PKG-S1');
  INSERT INTO qa VALUES ('negativo: solicitud sin EstadoComprobante',
    v_res->>'motivo' = 'ESTADO_COMPROBANTE_NO_VIGENTE', v_res::text);

  v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_a, v_run_a, 'SOL-TODOS', 'PKG-T1');
  INSERT INTO qa VALUES ('negativo: EstadoComprobante=Todos',
    v_res->>'motivo' = 'ESTADO_COMPROBANTE_NO_VIGENTE', v_res::text);

  v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_a, v_run_a, 'SOL-A', 'PKG-T1');
  INSERT INTO qa VALUES ('negativo: paquete de otra solicitud',
    v_res->>'motivo' = 'PAQUETE_NO_PROCESADO', v_res::text);

  v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_a, v_run_a, 'SOL-SIN-PAQUETE', 'PKG-X1');
  INSERT INTO qa VALUES ('negativo: paquete encontrado pero NO procesado',
    v_res->>'motivo' = 'PAQUETE_NO_PROCESADO', v_res::text);

  v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_a, v_run_b, 'SOL-B', 'PKG-B1');
  INSERT INTO qa VALUES ('negativo: corrida de otro expediente/despacho',
    v_res->>'motivo' = 'CORRIDA_FUERA_DE_ALCANCE', v_res::text);

  v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_b, v_run_a, 'SOL-A', 'PKG-A1');
  INSERT INTO qa VALUES ('negativo: CFDI de otro despacho',
    v_res->>'motivo' = 'CORRIDA_FUERA_DE_ALCANCE', v_res::text);

  v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_a, v_run_a, 'SOL-INEXISTENTE', 'PKG-A1');
  INSERT INTO qa VALUES ('negativo: solicitud fuera de la corrida',
    v_res->>'motivo' = 'SOLICITUD_NO_PERTENECE_A_CORRIDA', v_res::text);

  SELECT count(*) INTO v_n FROM public.cfdi_sat_evidencias WHERE cfdi_id IN (v_cfdi_a, v_cfdi_b);
  INSERT INTO qa VALUES ('ningún negativo creó evidencia', v_n = 0, v_n::text);

  SELECT * INTO v_row FROM public.cfdi_xml WHERE id = v_cfdi_a;
  INSERT INTO qa VALUES ('el CFDI sigue desconocido tras los negativos',
    v_row.estatus_sat = 'desconocido' AND v_row.estatus_sat_fuente IS NULL, v_row.estatus_sat);

  -- =================== CASO POSITIVO (función real) ===================
  v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_a, v_run_a, 'SOL-A', 'PKG-A1');
  INSERT INTO qa VALUES ('positivo: evidencia creada por la función real',
    (v_res->>'creada')::boolean IS TRUE, v_res::text);

  SELECT count(*) INTO v_n FROM public.cfdi_sat_evidencias
   WHERE cfdi_id = v_cfdi_a AND fuente = 'descarga_masiva_sat'
     AND estado_comprobante = 'Vigente' AND estatus_derivado = 'vigente'
     AND run_id = v_run_a AND solicitud_id = 'SOL-A' AND paquete_id = 'PKG-A1';
  INSERT INTO qa VALUES ('evidencia con linaje completo y fuente canónica', v_n = 1, v_n::text);

  SELECT * INTO v_row FROM public.cfdi_xml WHERE id = v_cfdi_a;
  INSERT INTO qa VALUES ('misma fila de CFDI actualizada a vigente',
    v_row.estatus_sat = 'vigente'
    AND v_row.estatus_sat_fuente = 'descarga_masiva_sat'
    AND v_row.estatus_sat_evidencia_at IS NOT NULL
    AND v_row.origen = 'carga_manual', -- no se falsifica el origen histórico
    v_row.estatus_sat || '/' || coalesce(v_row.origen,'-'));

  -- Segunda llamada: idempotente, sin segunda evidencia.
  v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_a, v_run_a, 'SOL-A', 'PKG-A1');
  SELECT count(*) INTO v_n FROM public.cfdi_sat_evidencias WHERE cfdi_id = v_cfdi_a;
  INSERT INTO qa VALUES ('segunda llamada idempotente (1 sola evidencia)',
    v_n = 1 AND (v_res->>'duplicada')::boolean IS TRUE, v_n::text || ' ' || v_res::text);

  -- ---------- Inmutabilidad ----------
  BEGIN
    UPDATE public.cfdi_sat_evidencias SET proveedor = 'falsificado' WHERE cfdi_id = v_cfdi_a;
    INSERT INTO qa VALUES ('UPDATE bloqueado por trigger', false, 'no lanzó excepción');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO qa VALUES ('UPDATE bloqueado por trigger', SQLERRM LIKE '%inmutable%', SQLERRM);
  END;
  BEGIN
    DELETE FROM public.cfdi_sat_evidencias WHERE cfdi_id = v_cfdi_a;
    INSERT INTO qa VALUES ('DELETE bloqueado por trigger', false, 'no lanzó excepción');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO qa VALUES ('DELETE bloqueado por trigger', SQLERRM LIKE '%inmutable%', SQLERRM);
  END;

  -- ---------- SAT → manual: recarga manual posterior no degrada ----------
  -- La ingesta manual no llama al RPC (probado en vitest); aquí se comprueba
  -- que la evidencia y la proyección siguen intactas tras nuevas llamadas.
  v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_a, v_run_a, 'SOL-SIN-ESTADO', 'PKG-S1');
  SELECT * INTO v_row FROM public.cfdi_xml WHERE id = v_cfdi_a;
  SELECT count(*) INTO v_n FROM public.cfdi_sat_evidencias WHERE cfdi_id = v_cfdi_a;
  INSERT INTO qa VALUES ('evidencia no se degrada ni se duplica después',
    v_n = 1 AND v_row.estatus_sat = 'vigente' AND v_row.estatus_sat_fuente = 'descarga_masiva_sat',
    v_n::text || '/' || v_row.estatus_sat);

  -- ---------- Permisos de tabla ----------
  INSERT INTO qa VALUES ('authenticated NO puede INSERT/UPDATE/DELETE evidencias',
    NOT has_table_privilege('authenticated','public.cfdi_sat_evidencias','INSERT')
    AND NOT has_table_privilege('authenticated','public.cfdi_sat_evidencias','UPDATE')
    AND NOT has_table_privilege('authenticated','public.cfdi_sat_evidencias','DELETE'), '');
  INSERT INTO qa VALUES ('anon sin ningún privilegio sobre evidencias',
    NOT has_table_privilege('anon','public.cfdi_sat_evidencias','SELECT')
    AND NOT has_table_privilege('anon','public.cfdi_sat_evidencias','INSERT'), '');
  INSERT INTO qa VALUES ('anon no puede ejecutar el RPC de evidencia',
    NOT has_function_privilege('anon','public.cfdi_registrar_evidencia_sat(uuid,uuid,text,text)','EXECUTE'), '');

  -- Identificadores para la fase RLS.
  CREATE TEMP TABLE qa_ids(k text, v text) ON COMMIT DROP;
  INSERT INTO qa_ids VALUES ('cfdi_a', v_cfdi_a::text), ('cfdi_b', v_cfdi_b::text),
                            ('run_a', v_run_a::text), ('run_b', v_run_b::text);
END $qa$;

-- =====================================================================
-- RLS con dos usuarios reales (rol authenticated + claims JWT)
-- =====================================================================
SELECT v AS cfdi_a FROM qa_ids WHERE k='cfdi_a' \gset
SELECT v AS run_a  FROM qa_ids WHERE k='run_a'  \gset

SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"2099b50e-2711-49f7-8a60-a861275fb13a","role":"authenticated"}';
INSERT INTO qa
SELECT 'RLS: usuario A lee su evidencia',
       count(*) = 1, count(*)::text
  FROM public.cfdi_sat_evidencias WHERE cfdi_id = :'cfdi_a';

SET LOCAL "request.jwt.claims" = '{"sub":"b3022665-78ae-415e-a1f5-967ea8635afc","role":"authenticated"}';
INSERT INTO qa
SELECT 'RLS: usuario B no ve la evidencia de A',
       count(*) = 0, count(*)::text
  FROM public.cfdi_sat_evidencias WHERE cfdi_id = :'cfdi_a';

DO $rls$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    PERFORM public.cfdi_registrar_evidencia_sat(
      (SELECT v FROM qa_ids WHERE k='cfdi_a')::uuid,
      (SELECT v FROM qa_ids WHERE k='run_a')::uuid, 'SOL-A', 'PKG-A1');
    v_msg := 'no lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE '%No autorizado%'; v_msg := SQLERRM;
  END;
  INSERT INTO qa VALUES ('RLS: usuario B no puede registrar evidencia en el expediente A', v_ok, v_msg);
END $rls$;

DO $anon$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    PERFORM set_config('role','anon',true);
    PERFORM count(*) FROM public.cfdi_sat_evidencias;
    v_msg := 'anon pudo leer';
  EXCEPTION WHEN OTHERS THEN
    v_ok := true; v_msg := SQLERRM;
  END;
  PERFORM set_config('role','authenticated',true);
  INSERT INTO qa VALUES ('anon sin acceso de lectura', v_ok, v_msg);
END $anon$;

RESET role;

-- =====================================================================
SELECT nombre, CASE WHEN ok THEN 'PASA' ELSE 'FALLA' END AS resultado, detalle FROM qa ORDER BY ctid;
SELECT CASE WHEN bool_and(ok) THEN 'QA_RESULTADO=TODAS_PASARON' ELSE 'QA_RESULTADO=HAY_FALLAS' END AS veredicto FROM qa;

ROLLBACK;

-- Cero residuos tras el rollback.
SELECT 'residuo_despachos' AS k, count(*) FROM public.despachos WHERE nombre LIKE 'QA-EVID-%'
UNION ALL SELECT 'residuo_clientes', count(*) FROM public.clientes WHERE rfc IN ('QAA010101AAA','QAB020202BB2')
UNION ALL SELECT 'residuo_cfdi', count(*) FROM public.cfdi_xml WHERE archivo_hash LIKE 'qa-hash-%'
UNION ALL SELECT 'residuo_evidencias', count(*) FROM public.cfdi_sat_evidencias WHERE solicitud_id LIKE 'SOL-%' AND paquete_id LIKE 'PKG-%';
