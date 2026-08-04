CREATE OR REPLACE FUNCTION public.pac_selftest()
RETURNS TABLE(test text, ok boolean, detalle text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid;
  v_saldo integer; v_res integer; v_dup boolean; v_okb boolean; v_disp integer;
  v_con integer; v_dev integer; v_desc bigint; v_n integer;
BEGIN
  SELECT user_id INTO v_uid FROM public.user_roles LIMIT 1;
  INSERT INTO public.user_roles(user_id, role) VALUES (v_uid,'super_admin') ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role','authenticated')::text, true);

  UPDATE public.sat_pac_saldo
     SET saldo_solicitudes = 0, reservado_solicitudes = 0, consumido_total = 0,
         recargado_total = 0, costo_unitario_centavos = 50
   WHERE proveedor = 'sw_sapien';
  DELETE FROM public.sat_pac_movimientos WHERE idempotency_key LIKE 'selftest:%';

  SELECT p.saldo_solicitudes, p.duplicado INTO v_saldo, v_dup
    FROM public.pac_recargar(100, 5000, 'Recarga sintetica selftest', 'selftest:rec1') p;
  RETURN QUERY SELECT 'recarga suma 100', v_saldo = 100 AND v_dup = false, 'saldo=' || v_saldo;

  SELECT p.saldo_solicitudes, p.duplicado INTO v_saldo, v_dup
    FROM public.pac_recargar(100, 5000, 'Recarga sintetica selftest', 'selftest:rec1') p;
  RETURN QUERY SELECT 'misma llave no cobra dos veces', v_saldo = 100 AND v_dup, 'saldo=' || v_saldo;

  SELECT r.ok, r.reservadas, r.saldo_disponible, r.duplicado INTO v_okb, v_res, v_disp, v_dup
    FROM public.pac_reservar('selftest:a', 40, NULL, NULL, 'selftest') r;
  RETURN QUERY SELECT 'reserva 40 aceptada', v_okb AND v_res = 40 AND v_disp = 60 AND NOT v_dup,
                      'disponible=' || v_disp;

  SELECT r.duplicado, r.reservadas INTO v_dup, v_res
    FROM public.pac_reservar('selftest:a', 40, NULL, NULL, 'selftest') r;
  SELECT reservado_solicitudes INTO v_n FROM public.sat_pac_saldo WHERE proveedor='sw_sapien';
  RETURN QUERY SELECT 'reserva repetida no duplica', v_dup AND v_n = 40, 'reservado=' || v_n;

  SELECT r.ok, r.saldo_disponible INTO v_okb, v_disp
    FROM public.pac_reservar('selftest:b', 100, NULL, NULL, 'selftest') r;
  RETURN QUERY SELECT 'sobre-reserva rechazada', NOT v_okb AND v_disp = 60, 'disponible=' || v_disp;

  SELECT c.consumidas, c.devueltas INTO v_con, v_dev
    FROM public.pac_confirmar_consumo('selftest:a', 25) c;
  SELECT saldo_solicitudes, reservado_solicitudes INTO v_saldo, v_n
    FROM public.sat_pac_saldo WHERE proveedor='sw_sapien';
  RETURN QUERY SELECT 'confirmar 25 de 40 libera 15',
                      v_con = 25 AND v_dev = 15 AND v_saldo = 75 AND v_n = 0,
                      'saldo=' || v_saldo || ' reservado=' || v_n;

  SELECT c.consumidas, c.devueltas INTO v_con, v_dev
    FROM public.pac_confirmar_consumo('selftest:a', 25) c;
  SELECT saldo_solicitudes INTO v_saldo FROM public.sat_pac_saldo WHERE proveedor='sw_sapien';
  RETURN QUERY SELECT 'doble confirmación no duplica consumo',
                      v_con = 0 AND v_dev = 0 AND v_saldo = 75, 'saldo=' || v_saldo;

  PERFORM public.pac_reservar('selftest:fail', 30, NULL, NULL, 'selftest');
  PERFORM public.pac_devolver_reserva('selftest:fail', 'corrida fallida');
  PERFORM public.pac_devolver_reserva('selftest:fail', 'corrida fallida');
  SELECT count(*) INTO v_n FROM public.sat_pac_movimientos
   WHERE idempotency_key = 'selftest:fail:devolucion-total';
  SELECT saldo_solicitudes INTO v_saldo FROM public.sat_pac_saldo WHERE proveedor='sw_sapien';
  RETURN QUERY SELECT 'devolución doble no duplica saldo', v_n = 1 AND v_saldo = 75,
                      'devoluciones=' || v_n || ' saldo=' || v_saldo;

  BEGIN
    PERFORM public.pac_confirmar_consumo('selftest:nope', 5);
    RETURN QUERY SELECT 'confirmar sin reserva falla', false, 'no lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'confirmar sin reserva falla', true, SQLERRM;
  END;
  RETURN QUERY SELECT 'devolver sin reserva devuelve false',
                      public.pac_devolver_reserva('selftest:nope','x') = false, '';

  BEGIN
    UPDATE public.sat_pac_movimientos SET solicitudes = 999 WHERE idempotency_key='selftest:rec1';
    RETURN QUERY SELECT 'libro mayor no editable', false, 'permitió UPDATE';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'libro mayor no editable', true, SQLERRM;
  END;
  BEGIN
    DELETE FROM public.sat_pac_movimientos WHERE idempotency_key='selftest:rec1';
    RETURN QUERY SELECT 'libro mayor no borrable', false, 'permitió DELETE';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'libro mayor no borrable', true, SQLERRM;
  END;

  SELECT c.descuadre INTO v_desc FROM public.pac_conciliacion(now() - interval '1 day') c;
  RETURN QUERY SELECT 'saldo = libro mayor (descuadre 0)', v_desc = 0, 'descuadre=' || v_desc;

  PERFORM public.pac_reservar('selftest:zombie', 10, NULL, NULL, 'selftest');
  SELECT count(*) INTO v_n FROM public.pac_reservas_abandonadas(60);
  RETURN QUERY SELECT 'reserva reciente no se marca abandonada', v_n = 0, 'abandonadas=' || v_n;
  SELECT count(*) INTO v_n FROM public.pac_reservas_abandonadas(-1);
  RETURN QUERY SELECT 'detector encuentra reserva colgada', v_n = 1, 'abandonadas=' || v_n;
  v_n := public.pac_liberar_abandonadas(-1);
  SELECT reservado_solicitudes INTO v_res FROM public.sat_pac_saldo WHERE proveedor='sw_sapien';
  RETURN QUERY SELECT 'liberar abandonadas devuelve la reserva', v_n = 1 AND v_res = 0,
                      'liberadas=' || v_n || ' reservado=' || v_res;

  BEGIN
    PERFORM public.pac_ajustar(5, 'abc', 'selftest:aj-bad');
    RETURN QUERY SELECT 'ajuste exige motivo', false, 'aceptó motivo corto';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'ajuste exige motivo', true, SQLERRM;
  END;
  v_saldo := public.pac_ajustar(-5, 'Ajuste sintetico selftest', 'selftest:aj1');
  v_n := public.pac_ajustar(-5, 'Ajuste sintetico selftest', 'selftest:aj1');
  RETURN QUERY SELECT 'ajuste idempotente', v_saldo = 70 AND v_n = 70, 'saldo=' || v_saldo;
  SELECT c.descuadre INTO v_desc FROM public.pac_conciliacion(now() - interval '1 day') c;
  RETURN QUERY SELECT 'descuadre sigue en 0 tras ajuste', v_desc = 0, 'descuadre=' || v_desc;

  DELETE FROM public.user_roles WHERE user_id = v_uid AND role = 'super_admin';
  BEGIN
    PERFORM public.pac_recargar(10, 500, 'Intento no autorizado', 'selftest:rec-x');
    RETURN QUERY SELECT 'recarga requiere admin', false, 'permitió recarga';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'recarga requiere admin', true, SQLERRM;
  END;
  BEGIN
    PERFORM public.pac_ajustar(10, 'Intento no autorizado largo', 'selftest:aj-x');
    RETURN QUERY SELECT 'ajuste requiere admin', false, 'permitió ajuste';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'ajuste requiere admin', true, SQLERRM;
  END;
  BEGIN
    PERFORM * FROM public.pac_conciliacion();
    RETURN QUERY SELECT 'conciliación requiere admin', false, 'permitió consulta';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'conciliación requiere admin', true, SQLERRM;
  END;

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name IN ('sat_pac_saldo','sat_pac_movimientos')
     AND data_type IN ('real','double precision','numeric');
  RETURN QUERY SELECT 'montos en unidades enteras (sin flotantes)', v_n = 0, 'columnas_flotantes=' || v_n;
END;
$fn$;