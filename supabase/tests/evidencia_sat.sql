-- =====================================================================
-- PRUEBA PERMANENTE: evidencia SAT inmutable, su RPC y el aislamiento RLS.
--
-- Todo corre dentro de una transacción que SIEMPRE se revierte (el bloque
-- termina lanzando el reporte como excepción): cero residuos, sin tocar
-- datos fiscales reales y sin contactar al SAT.
--
-- NO precarga estatus_sat='vigente' ni fuente de evidencia: la evidencia
-- sólo puede aparecer si la FUNCIÓN REAL de producción la crea.
--
-- Requiere un rol con EXECUTE sobre el RPC (proceso interno/owner). El rol
-- `anon` no puede ejecutarlo y `authenticated` sólo puede crear evidencia
-- para sus propios expedientes; ambas cosas se comprueban aquí.
--
-- Uso:  psql -v ON_ERROR_STOP=0 -f supabase/tests/evidencia_sat.sql
-- =====================================================================
DO $qa$
DECLARE
  v_ua uuid := '2099b50e-2711-49f7-8a60-a861275fb13a';  -- usuario A (real, sin datos propios tocados)
  v_ub uuid := 'b3022665-78ae-415e-a1f5-967ea8635afc';  -- usuario B
  v_da uuid; v_db uuid; v_ca uuid; v_cb uuid; v_rfca uuid; v_rfcb uuid;
  v_cfdi_a uuid; v_cfdi_b uuid; v_run_a uuid; v_run_b uuid;
  v_res jsonb; v_row public.cfdi_xml%ROWTYPE; v_n int;
  v_ok boolean; v_msg text; v_reporte text := ''; v_rol_ok boolean := true;
BEGIN
  -- Cambiar de rol requiere un ejecutor interno. Si el rol no está disponible
  -- para quien corre la prueba, los casos que dependen de él se marcan
  -- OMITIDO: jamás se dan por PASADOS sin haberse ejecutado.
  CREATE OR REPLACE FUNCTION pg_temp.qa_rol(_r text) RETURNS boolean
  LANGUAGE plpgsql AS $f$
  BEGIN
    PERFORM set_config('role', _r, true);
    RETURN true;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END; $f$;
  CREATE TEMP TABLE IF NOT EXISTS qa(nombre text, ok boolean, detalle text) ON COMMIT DROP;
  DELETE FROM qa;
  GRANT ALL ON qa TO authenticated;  -- sólo para poder anotar resultados al simular al usuario

  -- ---------- Expedientes sintéticos (dos despachos distintos) ----------
  INSERT INTO public.despachos (nombre, owner_user_id) VALUES ('QA-EVID-A', v_ua) RETURNING id INTO v_da;
  INSERT INTO public.despachos (nombre, owner_user_id) VALUES ('QA-EVID-B', v_ub) RETURNING id INTO v_db;
  INSERT INTO public.user_memberships (user_id, despacho_id, estado)
    VALUES (v_ua, v_da, 'activo'), (v_ub, v_db, 'activo');
  INSERT INTO public.user_roles (user_id, despacho_id, role)
    VALUES (v_ua, v_da, 'despacho'), (v_ub, v_db, 'despacho');

  INSERT INTO public.clientes (user_id, despacho_id, rfc, razon_social)
    VALUES (v_ua, v_da, 'QAA010101AAA', 'QA EVID A') RETURNING id INTO v_ca;
  INSERT INTO public.clientes (user_id, despacho_id, rfc, razon_social)
    VALUES (v_ub, v_db, 'QAB020202BB2', 'QA EVID B') RETURNING id INTO v_cb;

  INSERT INTO public.rfcs (despacho_id, cliente_id, rfc, tipo_persona)
    VALUES (v_da, v_ca, 'QAA010101AAA', 'moral') RETURNING id INTO v_rfca;
  INSERT INTO public.rfcs (despacho_id, cliente_id, rfc, tipo_persona)
    VALUES (v_db, v_cb, 'QAB020202BB2', 'moral') RETURNING id INTO v_rfcb;

  -- ---------- CFDI cargados MANUALMENTE: desconocidos y sin evidencia ----------
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
  VALUES (v_da, v_ca, 'sat_directo', 'completada', jsonb_build_array(
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
  VALUES (v_db, v_cb, 'sat_directo', 'completada', jsonb_build_array(
    jsonb_build_object('id_solicitud','SOL-B','estado_comprobante','Vigente',
                       'paquetes_procesados', jsonb_build_array('PKG-B1'))
  )) RETURNING id INTO v_run_b;

  -- Toda llamada al RPC ocurre con la identidad real del usuario A.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_ua, 'role','authenticated')::text, true);

  -- =================== CASOS NEGATIVOS ===================
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

  -- El CFDI pertenece a OTRO despacho: la autorización corta antes de cualquier lectura.
  v_ok := false;
  BEGIN
    PERFORM public.cfdi_registrar_evidencia_sat(v_cfdi_b, v_run_a, 'SOL-A', 'PKG-A1');
    v_msg := 'no lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE '%No autorizado%'; v_msg := SQLERRM;
  END;
  INSERT INTO qa VALUES ('negativo: CFDI de otro despacho rechazado por autorización', v_ok, v_msg);

  v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_a, v_run_a, 'SOL-INEXISTENTE', 'PKG-A1');
  INSERT INTO qa VALUES ('negativo: solicitud fuera de la corrida',
    v_res->>'motivo' = 'SOLICITUD_NO_PERTENECE_A_CORRIDA', v_res::text);

  SELECT count(*) INTO v_n FROM public.cfdi_sat_evidencias WHERE cfdi_id IN (v_cfdi_a, v_cfdi_b);
  INSERT INTO qa VALUES ('ningún negativo creó evidencia', v_n = 0, v_n::text);

  SELECT * INTO v_row FROM public.cfdi_xml WHERE id = v_cfdi_a;
  INSERT INTO qa VALUES ('el CFDI sigue desconocido tras los negativos',
    v_row.estatus_sat = 'desconocido' AND v_row.estatus_sat_fuente IS NULL, v_row.estatus_sat);

  -- =================== POSITIVO: manual → SAT ===================
  v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_a, v_run_a, 'SOL-A', 'PKG-A1');
  INSERT INTO qa VALUES ('manual→SAT: evidencia creada por la función real',
    (v_res->>'creada')::boolean IS TRUE, v_res::text);

  SELECT count(*) INTO v_n FROM public.cfdi_sat_evidencias
   WHERE cfdi_id = v_cfdi_a AND fuente = 'descarga_masiva_sat'
     AND estado_comprobante = 'Vigente' AND estatus_derivado = 'vigente'
     AND run_id = v_run_a AND solicitud_id = 'SOL-A' AND paquete_id = 'PKG-A1';
  INSERT INTO qa VALUES ('evidencia con linaje completo y fuente canónica', v_n = 1, v_n::text);

  SELECT count(*) INTO v_n FROM public.cfdi_xml WHERE cliente_id = v_ca;
  INSERT INTO qa VALUES ('no se creó otro CFDI', v_n = 1, v_n::text);

  SELECT * INTO v_row FROM public.cfdi_xml WHERE id = v_cfdi_a;
  INSERT INTO qa VALUES ('misma fila actualizada a vigente conservando su origen',
    v_row.estatus_sat = 'vigente' AND v_row.estatus_sat_fuente = 'descarga_masiva_sat'
    AND v_row.estatus_sat_evidencia_at IS NOT NULL AND v_row.origen = 'carga_manual',
    v_row.estatus_sat || '/' || coalesce(v_row.origen,'-'));

  v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_a, v_run_a, 'SOL-A', 'PKG-A1');
  SELECT count(*) INTO v_n FROM public.cfdi_sat_evidencias WHERE cfdi_id = v_cfdi_a;
  INSERT INTO qa VALUES ('repetir el mismo paquete es idempotente (1 evidencia)',
    v_n = 1 AND (v_res->>'duplicada')::boolean IS TRUE, v_n::text || ' ' || v_res::text);

  -- =================== Inmutabilidad ===================
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

  -- =================== SAT → manual (no degrada) ===================
  v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_a, v_run_a, 'SOL-SIN-ESTADO', 'PKG-S1');
  SELECT * INTO v_row FROM public.cfdi_xml WHERE id = v_cfdi_a;
  SELECT count(*) INTO v_n FROM public.cfdi_sat_evidencias WHERE cfdi_id = v_cfdi_a;
  INSERT INTO qa VALUES ('SAT→manual: evidencia intacta y sin duplicar',
    v_n = 1 AND v_row.estatus_sat = 'vigente' AND v_row.estatus_sat_fuente = 'descarga_masiva_sat',
    v_n::text || '/' || v_row.estatus_sat);

  -- =================== CFDI NUEVO: sólo el RPC proyecta ===================
  -- Documento recién ingestado desde un paquete: nace SIEMPRE 'desconocido'.
  DECLARE
    v_cfdi_n uuid; v_cfdi_r uuid; v_cfdi_c uuid;
  BEGIN
    v_rol_ok := pg_temp.qa_rol('postgres');
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_ua, 'role','authenticated')::text, true);
    INSERT INTO public.cfdi_xml (despacho_id, cliente_id, rfc_id, uuid, tipo_cfdi,
      rfc_emisor, rfc_receptor, fecha, archivo_hash, origen, proveedor,
      sat_run_id, sat_solicitud_id, sat_paquete_id, estatus_sat)
    VALUES (v_da, v_ca, v_rfca, 'QA000003-0000-4000-8000-000000000003', 'I',
      'QAA010101AAA','QAB020202BB2', now(), 'qa-hash-3', 'sat_descarga_masiva',
      'sat_directo', v_run_a, 'SOL-A', 'PKG-A1', 'desconocido')
    RETURNING id INTO v_cfdi_n;

    SELECT * INTO v_row FROM public.cfdi_xml WHERE id = v_cfdi_n;
    INSERT INTO qa VALUES ('CFDI nuevo nace desconocido y sin fuente de evidencia',
      v_row.estatus_sat = 'desconocido' AND v_row.estatus_sat_fuente IS NULL
      AND v_row.estatus_sat_evidencia_at IS NULL, v_row.estatus_sat);

    -- Linaje INVÁLIDO: el paquete no fue procesado ⇒ rechazo sin proyección.
    v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_n, v_run_a, 'SOL-SIN-PAQUETE', 'PKG-X1');
    SELECT * INTO v_row FROM public.cfdi_xml WHERE id = v_cfdi_n;
    INSERT INTO qa VALUES ('CFDI nuevo con linaje inválido: rechazado y sigue desconocido',
      coalesce((v_res->>'creada')::boolean,false) = false
      AND coalesce((v_res->>'rechazada')::boolean,false) = true
      AND v_row.estatus_sat = 'desconocido' AND v_row.estatus_sat_fuente IS NULL,
      v_res::text || ' / ' || v_row.estatus_sat);
    SELECT count(*) INTO v_n FROM public.cfdi_sat_evidencias WHERE cfdi_id = v_cfdi_n;
    INSERT INTO qa VALUES ('linaje inválido no deja bitácora', v_n = 0, v_n::text);

    -- Linaje VÁLIDO: se crea bitácora y se proyecta vigente.
    v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_n, v_run_a, 'SOL-A', 'PKG-A1');
    SELECT * INTO v_row FROM public.cfdi_xml WHERE id = v_cfdi_n;
    INSERT INTO qa VALUES ('CFDI nuevo con linaje válido: bitácora y proyección vigente',
      coalesce((v_res->>'creada')::boolean,false)
      AND v_row.estatus_sat = 'vigente' AND v_row.estatus_sat_fuente = 'descarga_masiva_sat'
      AND v_row.estatus_sat_evidencia_at IS NOT NULL, v_res::text);

    -- IDEMPOTENCIA REPARADORA: la bitácora ya existe (por ejemplo, la
    -- proyección se perdió tras un fallo parcial). Repetir el RPC NO crea una
    -- segunda evidencia y SÍ vuelve a dejar el CFDI proyectado como vigente.
    INSERT INTO public.cfdi_xml (despacho_id, cliente_id, rfc_id, uuid, tipo_cfdi,
      rfc_emisor, rfc_receptor, fecha, archivo_hash, origen, estatus_sat)
    VALUES (v_da, v_ca, v_rfca, 'QA000004-0000-4000-8000-000000000004', 'I',
      'QAA010101AAA','QAB020202BB2', now(), 'qa-hash-4', 'sat_descarga_masiva', 'desconocido')
    RETURNING id INTO v_cfdi_r;
    INSERT INTO public.cfdi_sat_evidencias (despacho_id, cliente_id, cfdi_id, run_id,
      solicitud_id, paquete_id, estado_comprobante, estatus_derivado, fuente, idempotency_key)
    VALUES (v_da, v_ca, v_cfdi_r, v_run_a, 'SOL-A','PKG-A1','Vigente','vigente',
            'descarga_masiva_sat',
            v_cfdi_r::text||':'||v_run_a::text||':SOL-A:PKG-A1');

    v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_r, v_run_a, 'SOL-A', 'PKG-A1');
    SELECT * INTO v_row FROM public.cfdi_xml WHERE id = v_cfdi_r;
    SELECT count(*) INTO v_n FROM public.cfdi_sat_evidencias WHERE cfdi_id = v_cfdi_r;
    INSERT INTO qa VALUES ('idempotencia reparadora: repara proyección sin duplicar bitácora',
      coalesce((v_res->>'duplicada')::boolean,false) AND v_n = 1
      AND v_row.estatus_sat = 'vigente' AND v_row.estatus_sat_fuente = 'descarga_masiva_sat'
      AND v_row.estatus_sat_evidencia_at IS NOT NULL,
      v_res::text || ' / evidencias=' || v_n::text || ' / ' || v_row.estatus_sat);

    -- Un CANCELADO jamás se convierte en vigente por registrar evidencia.
    INSERT INTO public.cfdi_xml (despacho_id, cliente_id, rfc_id, uuid, tipo_cfdi,
      rfc_emisor, rfc_receptor, fecha, archivo_hash, origen, estatus_sat)
    VALUES (v_da, v_ca, v_rfca, 'QA000005-0000-4000-8000-000000000005', 'I',
      'QAA010101AAA','QAB020202BB2', now(), 'qa-hash-5', 'sat_descarga_masiva', 'cancelado')
    RETURNING id INTO v_cfdi_c;
    PERFORM public.cfdi_registrar_evidencia_sat(v_cfdi_c, v_run_a, 'SOL-A', 'PKG-A1');
    SELECT * INTO v_row FROM public.cfdi_xml WHERE id = v_cfdi_c;
    INSERT INTO qa VALUES ('la proyección nunca revive un cancelado',
      v_row.estatus_sat = 'cancelado', v_row.estatus_sat);

    -- SERVICE ROLE: proceso interno sin usuario puede registrar evidencia.
    v_rol_ok := pg_temp.qa_rol('service_role');
    PERFORM set_config('request.jwt.claims',
      json_build_object('role','service_role')::text, true);
    v_res := public.cfdi_registrar_evidencia_sat(v_cfdi_b, v_run_b, 'SOL-B', 'PKG-B1');
    INSERT INTO qa VALUES ('service_role (sin usuario) sí puede registrar evidencia',
      CASE WHEN v_rol_ok THEN coalesce((v_res->>'creada')::boolean,false) END, v_res::text);

    -- ANON: sin usuario y sin rol interno ⇒ rechazo duro.
    v_rol_ok := pg_temp.qa_rol('anon');
    PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
    v_ok := false;
    BEGIN
      PERFORM public.cfdi_registrar_evidencia_sat(v_cfdi_n, v_run_a, 'SOL-A', 'PKG-A1');
      v_msg := 'no lanzó excepción';
    EXCEPTION WHEN OTHERS THEN
      v_ok := SQLERRM LIKE '%No autorizado%' OR SQLERRM LIKE '%permission denied%';
      v_msg := SQLERRM;
    END;
    INSERT INTO qa VALUES ('anon no puede registrar evidencia',
      CASE WHEN v_rol_ok THEN v_ok END, v_msg);

    v_rol_ok := pg_temp.qa_rol('postgres');
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_ua, 'role','authenticated')::text, true);
  END;

  -- =================== Permisos declarados ===================
  INSERT INTO qa VALUES ('authenticated NO puede INSERT/UPDATE/DELETE evidencias',
    NOT has_table_privilege('authenticated','public.cfdi_sat_evidencias','INSERT')
    AND NOT has_table_privilege('authenticated','public.cfdi_sat_evidencias','UPDATE')
    AND NOT has_table_privilege('authenticated','public.cfdi_sat_evidencias','DELETE'), '');
  INSERT INTO qa VALUES ('anon sin privilegios sobre evidencias',
    NOT has_table_privilege('anon','public.cfdi_sat_evidencias','SELECT')
    AND NOT has_table_privilege('anon','public.cfdi_sat_evidencias','INSERT'), '');
  INSERT INTO qa VALUES ('anon no puede ejecutar el RPC',
    NOT has_function_privilege('anon','public.cfdi_registrar_evidencia_sat(uuid,uuid,text,text)','EXECUTE'), '');

  -- =================== RLS con dos usuarios ===================
  v_rol_ok := pg_temp.qa_rol('authenticated');
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_ua, 'role','authenticated')::text, true);
  SELECT count(*) INTO v_n FROM public.cfdi_sat_evidencias WHERE cfdi_id = v_cfdi_a;
  INSERT INTO qa VALUES ('RLS: usuario A lee la evidencia de su expediente',
    CASE WHEN v_rol_ok THEN v_n = 1 END, v_n::text);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_ub, 'role','authenticated')::text, true);
  SELECT count(*) INTO v_n FROM public.cfdi_sat_evidencias WHERE cfdi_id = v_cfdi_a;
  INSERT INTO qa VALUES ('RLS: usuario B no ve la evidencia de A',
    CASE WHEN v_rol_ok THEN v_n = 0 END, v_n::text);

  v_ok := false;
  BEGIN
    PERFORM public.cfdi_registrar_evidencia_sat(v_cfdi_a, v_run_a, 'SOL-A', 'PKG-A1');
    v_msg := 'no lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE '%No autorizado%'; v_msg := SQLERRM;
  END;
  INSERT INTO qa VALUES ('RLS: usuario B no puede registrar evidencia en el expediente A',
    CASE WHEN v_rol_ok THEN v_ok END, v_msg);

  -- El frontend no puede fabricar evidencia: INSERT directo como authenticated.
  v_ok := false;
  BEGIN
    INSERT INTO public.cfdi_sat_evidencias (despacho_id, cliente_id, cfdi_id, run_id,
      solicitud_id, paquete_id, estado_comprobante, estatus_derivado, fuente, idempotency_key)
    VALUES (v_da, v_ca, v_cfdi_a, v_run_a, 'INVENTADA','INVENTADO','Vigente','vigente',
            'descarga_masiva_sat','falsa');
    v_msg := 'INSERT directo permitido';
  EXCEPTION WHEN OTHERS THEN
    v_ok := true; v_msg := SQLERRM;
  END;
  INSERT INTO qa VALUES ('frontend/authenticated no puede insertar evidencia directamente',
    CASE WHEN v_rol_ok THEN v_ok END, v_msg);

  v_rol_ok := pg_temp.qa_rol('postgres');
  PERFORM set_config('request.jwt.claims', '', true);

  -- =================== Reporte y ROLLBACK forzado ===================
  SELECT string_agg(format('%s · %s%s',
                           CASE WHEN ok IS NULL THEN 'OMITIDO (rol no disponible)'
                                WHEN ok THEN 'PASA' ELSE 'FALLA' END,
                           nombre, CASE WHEN ok THEN '' ELSE ' → '||coalesce(detalle,'') END),
                    E'\n' ORDER BY ctid)
    INTO v_reporte FROM qa;
  SELECT bool_and(ok) INTO v_ok FROM qa;

  RAISE EXCEPTION E'\n%\n%\n(rollback intencional: la prueba no deja residuos)',
    v_reporte,
    CASE WHEN coalesce(v_ok, true)
         THEN 'QA_RESULTADO=TODAS_PASARON'||
              coalesce((SELECT ' (omitidos: '||count(*)||')' FROM qa WHERE ok IS NULL AND count(*)>0), '')
         ELSE 'QA_RESULTADO=HAY_FALLAS' END;
END $qa$;
