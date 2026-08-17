-- ─────────────────────────────────────────────────────────────────────────────
-- REGRESIÓN: la corrida legítima del motor escribe bitácora canónica
--
-- Comprueba que conciliacion_ejecutar_corrida:
--   1. crea el grupo en estado 'propuesto';
--   2. registra la bitácora con accion='propuesta' y estado_nuevo='propuesto';
--   3. conserva origen='motor' en el grupo y el detalle del algoritmo;
--   4. nunca confirma automáticamente;
--   5. es idempotente ante una segunda ejecución con la misma llave.
--
-- Todo corre dentro de una transacción que TERMINA EN ROLLBACK.
-- Ejecución: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/conciliacion_bitacora_regresion.sql
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE resultados(prueba text, esperado text, obtenido text, ok boolean);

DO $$
DECLARE
  v_desp uuid := gen_random_uuid();
  v_cli uuid := gen_random_uuid();
  v_user uuid;
  v_cta uuid; v_rfc uuid; v_mov uuid; v_cfdi uuid;
  v_res jsonb; v_bit public.conciliacion_bitacora; v_grp public.conciliacion_grupos;
  v_n int;
  PERIODO constant text := '2026-07';
  EVID constant jsonb := jsonb_build_object('regla','unico_exacto_dos_senales','version','conciliacion-1a1@2');
BEGIN
  SELECT owner_user_id INTO v_user FROM public.despachos WHERE owner_user_id IS NOT NULL ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'No hay usuarios autenticados para la prueba'; END IF;

  INSERT INTO public.despachos(id, nombre, owner_user_id) VALUES (v_desp, 'Sandbox Bitácora', v_user);
  INSERT INTO public.clientes(id, despacho_id, user_id, rfc, razon_social)
    VALUES (v_cli, v_desp, v_user, 'SAND030303CCC', 'Sandbox Bitácora');
  INSERT INTO public.rfcs(despacho_id, cliente_id, rfc, tipo_persona)
    VALUES (v_desp, v_cli, 'SAND030303CCC', 'moral') RETURNING id INTO v_rfc;
  INSERT INTO public.cuentas_bancarias(despacho_id, cliente_id, banco, alias, moneda)
    VALUES (v_desp, v_cli, 'BANCO SANDBOX', 'Principal', 'MXN') RETURNING id INTO v_cta;

  INSERT INTO public.movimientos_bancarios(despacho_id, cliente_id, cuenta_id, fila_origen, fecha, descripcion, referencia, abono, cargo, moneda, hash)
    VALUES (v_desp, v_cli, v_cta, 1, '2026-07-10', 'SPEI ACME', 'R1', 1000.00, 0, 'MXN', md5('bitacora-mov-1'))
    RETURNING id INTO v_mov;
  INSERT INTO public.cfdi_xml(despacho_id, cliente_id, rfc_id, uuid, fecha, total, direccion, tipo_cfdi, metodo_pago, moneda, periodo, estatus_sat, rfc_emisor, rfc_receptor, archivo_hash)
    VALUES (v_desp, v_cli, v_rfc, gen_random_uuid()::text, '2026-07-10', 1000.00, 'emitido', 'I', 'PUE', 'MXN', PERIODO, 'sintetico_no_verificado', 'SAND030303CCC', 'AIN920115AB1', md5('bitacora-cfdi-1'))
    RETURNING id INTO v_cfdi;

  -- Corrida legítima
  v_res := public.conciliacion_ejecutar_corrida(v_cli, PERIODO, v_user, 'k-bitacora','h','conciliacion-1a1@2','{}'::jsonb,
    jsonb_build_array(jsonb_build_object('tipo','uno_a_uno','movimiento_id',v_mov,'cfdi_id',v_cfdi,'estado','propuesto',
      'nivel_propuesta','automatica_alta_confianza','probabilidad_bp',9800,'importe_banco_centavos',100000,
      'importe_cfdi_centavos',100000,'diferencia_centavos',0,'evidencia',EVID,'motivo','alta confianza','idempotency_key','bit1')));

  INSERT INTO resultados VALUES ('corrida_ok','true', coalesce(v_res->>'ok','?'), v_res->>'ok' = 'true');

  SELECT * INTO v_grp FROM public.conciliacion_grupos WHERE cliente_id = v_cli LIMIT 1;
  INSERT INTO resultados VALUES ('grupo_propuesto','propuesto', coalesce(v_grp.estado,'∅'), v_grp.estado = 'propuesto');
  INSERT INTO resultados VALUES ('grupo_origen_motor','motor', coalesce(v_grp.origen,'∅'), v_grp.origen = 'motor');

  SELECT * INTO v_bit FROM public.conciliacion_bitacora WHERE cliente_id = v_cli AND grupo_id = v_grp.id LIMIT 1;
  INSERT INTO resultados VALUES ('bitacora_accion','propuesta', coalesce(v_bit.accion,'∅'), v_bit.accion = 'propuesta');
  INSERT INTO resultados VALUES ('bitacora_estado_nuevo','propuesto', coalesce(v_bit.estado_nuevo,'∅'), v_bit.estado_nuevo = 'propuesto');
  INSERT INTO resultados VALUES ('bitacora_actor', v_user::text, coalesce(v_bit.actor::text,'∅'), v_bit.actor = v_user);
  INSERT INTO resultados VALUES ('detalle_origen_motor','motor', coalesce(v_bit.detalle->>'origen','∅'), v_bit.detalle->>'origen' = 'motor');
  INSERT INTO resultados VALUES ('detalle_algoritmo','conciliacion-1a1@2', coalesce(v_bit.detalle->>'algoritmo_version','∅'), v_bit.detalle->>'algoritmo_version' = 'conciliacion-1a1@2');
  INSERT INTO resultados VALUES ('detalle_nivel','automatica_alta_confianza', coalesce(v_bit.detalle->>'nivel_propuesta','∅'), v_bit.detalle->>'nivel_propuesta' = 'automatica_alta_confianza');
  INSERT INTO resultados VALUES ('detalle_corrida', coalesce(v_res->>'corrida_id','?'), coalesce(v_bit.detalle->>'corrida_id','∅'), v_bit.detalle->>'corrida_id' = v_res->>'corrida_id');
  INSERT INTO resultados VALUES ('detalle_evidencia','unico_exacto_dos_senales', coalesce(v_bit.detalle->'evidencia'->>'regla','∅'), v_bit.detalle->'evidencia'->>'regla' = 'unico_exacto_dos_senales');

  -- Cero confirmaciones automáticas
  SELECT count(*) INTO v_n FROM public.conciliacion_grupos WHERE cliente_id = v_cli AND estado = 'confirmado';
  INSERT INTO resultados VALUES ('sin_confirmaciones_automaticas','0', v_n::text, v_n = 0);
  SELECT count(*) INTO v_n FROM public.conciliacion_bitacora WHERE cliente_id = v_cli AND accion = 'confirmar';
  INSERT INTO resultados VALUES ('bitacora_sin_confirmar','0', v_n::text, v_n = 0);

  -- Segunda ejecución con la misma llave: idempotente
  v_res := public.conciliacion_ejecutar_corrida(v_cli, PERIODO, v_user, 'k-bitacora','h','conciliacion-1a1@2','{}'::jsonb,
    jsonb_build_array(jsonb_build_object('tipo','uno_a_uno','movimiento_id',v_mov,'cfdi_id',v_cfdi,'estado','propuesto',
      'nivel_propuesta','automatica_alta_confianza','probabilidad_bp',9800,'importe_banco_centavos',100000,
      'importe_cfdi_centavos',100000,'diferencia_centavos',0,'evidencia',EVID,'motivo','alta confianza','idempotency_key','bit1')));
  INSERT INTO resultados VALUES ('idempotencia_reutilizada','true', coalesce(v_res->>'reutilizada','?'), v_res->>'reutilizada' = 'true');
  SELECT count(*) INTO v_n FROM public.conciliacion_grupos WHERE cliente_id = v_cli;
  INSERT INTO resultados VALUES ('idempotencia_un_grupo','1', v_n::text, v_n = 1);
  SELECT count(*) INTO v_n FROM public.conciliacion_bitacora WHERE cliente_id = v_cli;
  INSERT INTO resultados VALUES ('idempotencia_una_bitacora','1', v_n::text, v_n = 1);

  -- Ningún registro fuera del catálogo canónico
  SELECT count(*) INTO v_n FROM public.conciliacion_bitacora
   WHERE cliente_id = v_cli AND accion NOT IN ('confirmar','rechazar','ignorar','revertir','propuesta','importacion');
  INSERT INTO resultados VALUES ('acciones_canonicas','0', v_n::text, v_n = 0);
END $$;

SELECT prueba, esperado, obtenido, CASE WHEN ok THEN 'PASA' ELSE 'FALLA' END AS resultado FROM resultados ORDER BY prueba;

DO $$
DECLARE v_fallas int;
BEGIN
  SELECT count(*) INTO v_fallas FROM resultados WHERE NOT ok;
  IF v_fallas > 0 THEN RAISE EXCEPTION 'Regresión de bitácora: % prueba(s) fallida(s)', v_fallas; END IF;
  RAISE NOTICE 'Regresión de bitácora: todas las pruebas pasan.';
END $$;

ROLLBACK;
