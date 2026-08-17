-- ─────────────────────────────────────────────────────────────────────────────
-- PRUEBAS SQL DEL BLOQUE 1 DE CONCILIACIÓN BANCARIA
--
-- Todo se ejecuta dentro de una transacción que TERMINA EN ROLLBACK: no deja
-- residuo. Invoca las funciones REALES de producción; no existen copias
-- simplificadas de los RPC.
--
-- Ejecución: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/conciliacion_bloque1.sql
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE resultados(prueba text, esperado text, obtenido text, ok boolean);

DO $$
DECLARE
  v_desp_a uuid := gen_random_uuid();
  v_desp_b uuid := gen_random_uuid();
  v_cli_a uuid := gen_random_uuid();
  v_cli_b uuid := gen_random_uuid();
  v_user uuid; -- persona autenticada real (sólo lectura de auth.users); todo se revierte
  v_cta_a uuid; v_cta_b uuid;
  v_mov_a uuid; v_mov_b uuid; v_mov_a2 uuid;
  v_cfdi_a uuid; v_cfdi_b uuid; v_cfdi_a2 uuid;
  v_grupo uuid;
  v_res jsonb; v_msg text; v_n int;
  PERIODO constant text := '2026-07';
  EVID constant jsonb := jsonb_build_object('regla','unico_exacto_dos_senales','version','conciliacion-1a1@2');

BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'No hay usuarios autenticados para la prueba'; END IF;

  -- Sandbox de dos despachos distintos
  INSERT INTO public.despachos(id, nombre, owner_user_id) VALUES
    (v_desp_a, 'Sandbox A', v_user), (v_desp_b, 'Sandbox B', v_user);
  INSERT INTO public.clientes(id, despacho_id, rfc, razon_social) VALUES
    (v_cli_a, v_desp_a, 'SAND010101AAA', 'Sandbox A'),
    (v_cli_b, v_desp_b, 'SAND020202BBB', 'Sandbox B');
  INSERT INTO public.cuentas_bancarias(despacho_id, cliente_id, banco, alias, moneda)
    VALUES (v_desp_a, v_cli_a, 'BANCO SANDBOX', 'Principal', 'MXN') RETURNING id INTO v_cta_a;
  INSERT INTO public.cuentas_bancarias(despacho_id, cliente_id, banco, alias, moneda)
    VALUES (v_desp_b, v_cli_b, 'BANCO SANDBOX', 'Principal', 'MXN') RETURNING id INTO v_cta_b;

  INSERT INTO public.movimientos_bancarios(despacho_id, cliente_id, cuenta_id, fila_origen, fecha, descripcion, referencia, abono, cargo, moneda)
    VALUES (v_desp_a, v_cli_a, v_cta_a, 1, '2026-07-10', 'SPEI ACME', 'R1', 1000.00, 0, 'MXN') RETURNING id INTO v_mov_a;
  INSERT INTO public.movimientos_bancarios(despacho_id, cliente_id, cuenta_id, fila_origen, fecha, descripcion, referencia, abono, cargo, moneda)
    VALUES (v_desp_a, v_cli_a, v_cta_a, 2, '2026-07-10', 'SPEI ACME', 'R1', 1000.00, 0, 'MXN') RETURNING id INTO v_mov_a2;
  INSERT INTO public.movimientos_bancarios(despacho_id, cliente_id, cuenta_id, fila_origen, fecha, descripcion, referencia, abono, cargo, moneda)
    VALUES (v_desp_b, v_cli_b, v_cta_b, 1, '2026-07-10', 'SPEI OTRO', 'R9', 1000.00, 0, 'MXN') RETURNING id INTO v_mov_b;

  INSERT INTO public.cfdi_xml(despacho_id, cliente_id, uuid, fecha, total, direccion, tipo_cfdi, metodo_pago, moneda, periodo, estatus_sat)
    VALUES (v_desp_a, v_cli_a, gen_random_uuid()::text, '2026-07-10', 1000.00, 'emitido', 'I', 'PUE', 'MXN', PERIODO, 'sintetico_no_verificado') RETURNING id INTO v_cfdi_a;
  INSERT INTO public.cfdi_xml(despacho_id, cliente_id, uuid, fecha, total, direccion, tipo_cfdi, metodo_pago, moneda, periodo, estatus_sat)
    VALUES (v_desp_a, v_cli_a, gen_random_uuid()::text, '2026-07-10', 1000.00, 'emitido', 'I', 'PUE', 'MXN', PERIODO, 'sintetico_no_verificado') RETURNING id INTO v_cfdi_a2;
  INSERT INTO public.cfdi_xml(despacho_id, cliente_id, uuid, fecha, total, direccion, tipo_cfdi, metodo_pago, moneda, periodo, estatus_sat)
    VALUES (v_desp_b, v_cli_b, gen_random_uuid()::text, '2026-07-10', 1000.00, 'emitido', 'I', 'PUE', 'MXN', PERIODO, 'sintetico_no_verificado') RETURNING id INTO v_cfdi_b;

  -- 1. Ataque: movimiento propio con comprobante de OTRO expediente
  BEGIN
    PERFORM public.conciliacion_ejecutar_corrida(v_cli_a, PERIODO, v_user, 'k-cruce-1','h','conciliacion-1a1@2','{}'::jsonb,
      jsonb_build_array(jsonb_build_object('tipo','uno_a_uno','movimiento_id',v_mov_a,'cfdi_id',v_cfdi_b,'estado','propuesto',
        'nivel_propuesta','automatica_alta_confianza','probabilidad_bp',9000,'importe_banco_centavos',100000,
        'importe_cfdi_centavos',100000,'diferencia_centavos',0,'evidencia',EVID,'motivo','x','idempotency_key','g1')));
    INSERT INTO resultados VALUES ('ataque_cfdi_de_otro_tenant','rechazo','aceptado',false);
  EXCEPTION WHEN others THEN
    INSERT INTO resultados VALUES ('ataque_cfdi_de_otro_tenant','rechazo',SQLERRM,true);
  END;

  -- 2. Ataque: movimiento de OTRO expediente con comprobante propio
  BEGIN
    PERFORM public.conciliacion_ejecutar_corrida(v_cli_a, PERIODO, v_user, 'k-cruce-2','h','conciliacion-1a1@2','{}'::jsonb,
      jsonb_build_array(jsonb_build_object('tipo','uno_a_uno','movimiento_id',v_mov_b,'cfdi_id',v_cfdi_a,'estado','propuesto',
        'nivel_propuesta','revision_requerida','probabilidad_bp',9000,'importe_banco_centavos',100000,
        'importe_cfdi_centavos',100000,'diferencia_centavos',0,'evidencia',EVID,'motivo','x','idempotency_key','g2')));
    INSERT INTO resultados VALUES ('ataque_movimiento_de_otro_tenant','rechazo','aceptado',false);
  EXCEPTION WHEN others THEN
    INSERT INTO resultados VALUES ('ataque_movimiento_de_otro_tenant','rechazo',SQLERRM,true);
  END;

  -- 3. Ataque: importe falsificado en el mensaje
  BEGIN
    PERFORM public.conciliacion_ejecutar_corrida(v_cli_a, PERIODO, v_user, 'k-importe','h','conciliacion-1a1@2','{}'::jsonb,
      jsonb_build_array(jsonb_build_object('tipo','uno_a_uno','movimiento_id',v_mov_a,'cfdi_id',v_cfdi_a,'estado','propuesto',
        'nivel_propuesta','revision_requerida','probabilidad_bp',9000,'importe_banco_centavos',1,
        'importe_cfdi_centavos',1,'diferencia_centavos',0,'evidencia',EVID,'motivo','x','idempotency_key','g3')));
    INSERT INTO resultados VALUES ('ataque_importe_falsificado','rechazo','aceptado',false);
  EXCEPTION WHEN others THEN
    INSERT INTO resultados VALUES ('ataque_importe_falsificado','rechazo',SQLERRM,true);
  END;

  -- 4. Ataque: periodo falsificado (movimiento fuera del periodo declarado)
  BEGIN
    PERFORM public.conciliacion_ejecutar_corrida(v_cli_a, '2026-05', v_user, 'k-periodo','h','conciliacion-1a1@2','{}'::jsonb,
      jsonb_build_array(jsonb_build_object('tipo','uno_a_uno','movimiento_id',v_mov_a,'cfdi_id',v_cfdi_a,'estado','propuesto',
        'nivel_propuesta','revision_requerida','probabilidad_bp',9000,'importe_banco_centavos',100000,
        'importe_cfdi_centavos',100000,'diferencia_centavos',0,'evidencia',EVID,'motivo','x','idempotency_key','g4')));
    INSERT INTO resultados VALUES ('ataque_periodo_falsificado','rechazo','aceptado',false);
  EXCEPTION WHEN others THEN
    INSERT INTO resultados VALUES ('ataque_periodo_falsificado','rechazo',SQLERRM,true);
  END;

  -- 5. Ataque: estado confirmado falsificado desde el motor
  BEGIN
    PERFORM public.conciliacion_ejecutar_corrida(v_cli_a, PERIODO, v_user, 'k-estado','h','conciliacion-1a1@2','{}'::jsonb,
      jsonb_build_array(jsonb_build_object('tipo','uno_a_uno','movimiento_id',v_mov_a,'cfdi_id',v_cfdi_a,'estado','confirmado',
        'nivel_propuesta','automatica_alta_confianza','probabilidad_bp',9999,'importe_banco_centavos',100000,
        'importe_cfdi_centavos',100000,'diferencia_centavos',0,'evidencia',EVID,'motivo','x','idempotency_key','g5')));
    INSERT INTO resultados VALUES ('ataque_estado_confirmado','rechazo','aceptado',false);
  EXCEPTION WHEN others THEN
    INSERT INTO resultados VALUES ('ataque_estado_confirmado','rechazo',SQLERRM,true);
  END;

  -- 6. Ataque: probabilidad fuera de rango
  BEGIN
    PERFORM public.conciliacion_ejecutar_corrida(v_cli_a, PERIODO, v_user, 'k-prob','h','conciliacion-1a1@2','{}'::jsonb,
      jsonb_build_array(jsonb_build_object('tipo','uno_a_uno','movimiento_id',v_mov_a,'cfdi_id',v_cfdi_a,'estado','propuesto',
        'nivel_propuesta','revision_requerida','probabilidad_bp',99999,'importe_banco_centavos',100000,
        'importe_cfdi_centavos',100000,'diferencia_centavos',0,'evidencia',EVID,'motivo','x','idempotency_key','g6')));
    INSERT INTO resultados VALUES ('ataque_probabilidad_fuera_rango','rechazo','aceptado',false);
  EXCEPTION WHEN others THEN
    INSERT INTO resultados VALUES ('ataque_probabilidad_fuera_rango','rechazo',SQLERRM,true);
  END;

  -- 7. Corrida legítima: dos operaciones idénticas conservadas como dos grupos
  v_res := public.conciliacion_ejecutar_corrida(v_cli_a, PERIODO, v_user, 'k-ok','h','conciliacion-1a1@2','{}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('tipo','uno_a_uno','movimiento_id',v_mov_a,'cfdi_id',v_cfdi_a,'estado','propuesto',
        'nivel_propuesta','automatica_alta_confianza','probabilidad_bp',9800,'importe_banco_centavos',100000,
        'importe_cfdi_centavos',100000,'diferencia_centavos',0,'evidencia',EVID,'motivo','alta confianza','idempotency_key','ok1'),
      jsonb_build_object('tipo','uno_a_uno','movimiento_id',v_mov_a2,'cfdi_id',v_cfdi_a2,'estado','propuesto',
        'nivel_propuesta','automatica_alta_confianza','probabilidad_bp',9800,'importe_banco_centavos',100000,
        'importe_cfdi_centavos',100000,'diferencia_centavos',0,'evidencia',EVID,'motivo','alta confianza','idempotency_key','ok2')));
  SELECT count(*) INTO v_n FROM public.conciliacion_grupos WHERE cliente_id = v_cli_a AND estado='propuesto';
  INSERT INTO resultados VALUES ('dos_identicas_conservadas','2', v_n::text, v_n = 2);

  -- 8. El motor nunca deja estado confirmado
  SELECT count(*) INTO v_n FROM public.conciliacion_grupos WHERE cliente_id = v_cli_a AND estado='confirmado';
  INSERT INTO resultados VALUES ('motor_no_confirma','0', v_n::text, v_n = 0);

  -- 9. Idempotencia: la misma llave no duplica
  v_res := public.conciliacion_ejecutar_corrida(v_cli_a, PERIODO, v_user, 'k-ok','h','conciliacion-1a1@2','{}'::jsonb,'[]'::jsonb);
  SELECT count(*) INTO v_n FROM public.conciliacion_grupos WHERE cliente_id = v_cli_a;
  INSERT INTO resultados VALUES ('idempotencia_misma_llave','2', v_n::text, v_n = 2);
  INSERT INTO resultados VALUES ('idempotencia_reutilizada','true', coalesce(v_res->>'reutilizada','?'), v_res->>'reutilizada' = 'true');

  -- 10. Confirmado exige persona (restricción de tabla)
  SELECT id INTO v_grupo FROM public.conciliacion_grupos WHERE cliente_id = v_cli_a LIMIT 1;
  BEGIN
    UPDATE public.conciliacion_grupos SET estado='confirmado', confirmado_at=now() WHERE id = v_grupo;
    INSERT INTO resultados VALUES ('confirmado_exige_persona','rechazo','aceptado',false);
  EXCEPTION WHEN others THEN
    INSERT INTO resultados VALUES ('confirmado_exige_persona','rechazo',SQLERRM,true);
  END;

  -- 11. Bitácora inmutable
  BEGIN
    UPDATE public.conciliacion_bitacora SET motivo='alterado' WHERE cliente_id = v_cli_a;
    INSERT INTO resultados VALUES ('bitacora_inmutable_update','rechazo','aceptado',false);
  EXCEPTION WHEN others THEN
    INSERT INTO resultados VALUES ('bitacora_inmutable_update','rechazo',SQLERRM,true);
  END;
  BEGIN
    DELETE FROM public.conciliacion_bitacora WHERE cliente_id = v_cli_a;
    INSERT INTO resultados VALUES ('bitacora_inmutable_delete','rechazo','aceptado',false);
  EXCEPTION WHEN others THEN
    INSERT INTO resultados VALUES ('bitacora_inmutable_delete','rechazo',SQLERRM,true);
  END;

  -- 12. Miembros del mismo expediente que el grupo
  SELECT count(*) INTO v_n FROM public.conciliacion_grupos g
    JOIN public.conciliaciones k ON k.grupo_id=g.id
   WHERE g.cliente_id = v_cli_a AND (k.cliente_id <> g.cliente_id OR k.despacho_id <> g.despacho_id);
  INSERT INTO resultados VALUES ('miembros_mismo_tenant','0', v_n::text, v_n = 0);

  -- 13. Diagnóstico bancario: nunca "lista" con propuestas pendientes
  v_res := public.cierre_diag_bancos(v_cli_a, PERIODO);
  INSERT INTO resultados VALUES ('bancos_no_lista_con_propuestas','en_proceso', v_res->>'estado', v_res->>'estado' <> 'lista');
  INSERT INTO resultados VALUES ('bancos_version','bancos@5', v_res->>'evaluador_version', v_res->>'evaluador_version' = 'bancos@5');
  INSERT INTO resultados VALUES ('bancos_cobertura_sin_confirmaciones','0', v_res->>'cobertura', (v_res->>'cobertura')::numeric = 0);
  INSERT INTO resultados VALUES ('bancos_alta_confianza_separada','2',
    v_res->'resultado'->>'propuestas_alta_confianza', (v_res->'resultado'->>'propuestas_alta_confianza')::int = 2);

  -- 14. Permisos del escritor interno
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='conciliacion_ejecutar_corrida'
     AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'));
  INSERT INTO resultados VALUES ('escritor_revocado_navegador','0', v_n::text, v_n = 0);
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='conciliacion_ejecutar_corrida'
     AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  INSERT INTO resultados VALUES ('escritor_ejecutable_service_role','1', v_n::text, v_n = 1);

  -- 15. Sin SUM(DISTINCT) en el diagnóstico bancario
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='cierre_diag_bancos'
     AND pg_get_functiondef(p.oid) ILIKE '%sum(distinct%';
  INSERT INTO resultados VALUES ('bancos_sin_sum_distinct','0', v_n::text, v_n = 0);
END $$;

SELECT prueba, esperado, left(obtenido, 90) AS obtenido, ok FROM resultados ORDER BY prueba;
SELECT count(*) FILTER (WHERE NOT ok) AS fallidas, count(*) AS total FROM resultados;

ROLLBACK;
