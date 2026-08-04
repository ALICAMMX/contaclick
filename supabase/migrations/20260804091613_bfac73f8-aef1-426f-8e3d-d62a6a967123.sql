CREATE OR REPLACE FUNCTION public.pac_recargar(_solicitudes integer, _costo_total_centavos bigint, _motivo text, _key text)
 RETURNS TABLE(saldo_solicitudes integer, duplicado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v public.sat_pac_saldo; v_unit integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Solo super-admin puede recargar saldo PAC';
  END IF;
  IF _solicitudes <= 0 THEN RAISE EXCEPTION 'La recarga debe ser mayor a cero'; END IF;
  IF coalesce(char_length(trim(_motivo)),0) < 5 THEN
    RAISE EXCEPTION 'La recarga requiere un motivo de al menos 5 caracteres';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sat_pac_movimientos m
              WHERE m.proveedor='sw_sapien' AND m.idempotency_key=_key) THEN
    SELECT s.saldo_solicitudes INTO v.saldo_solicitudes FROM public.sat_pac_saldo s WHERE s.proveedor='sw_sapien';
    RETURN QUERY SELECT v.saldo_solicitudes, true;
    RETURN;
  END IF;

  SELECT * INTO v FROM public.sat_pac_saldo s WHERE s.proveedor='sw_sapien' FOR UPDATE;
  v_unit := GREATEST(1, (_costo_total_centavos / _solicitudes)::integer);

  UPDATE public.sat_pac_saldo s
     SET saldo_solicitudes = s.saldo_solicitudes + _solicitudes,
         costo_unitario_centavos = v_unit,
         recargado_total = s.recargado_total + _solicitudes,
         actualizado_at = now(), actualizado_por = auth.uid()
   WHERE s.proveedor='sw_sapien';

  INSERT INTO public.sat_pac_movimientos
    (tipo, solicitudes, costo_centavos, saldo_antes, saldo_despues, reservado_despues,
     idempotency_key, motivo, creado_por)
  VALUES ('recarga', _solicitudes, _costo_total_centavos, v.saldo_solicitudes,
          v.saldo_solicitudes + _solicitudes, v.reservado_solicitudes, _key, _motivo, auth.uid());

  INSERT INTO public.audit_logs (user_id, accion, entidad, entidad_id, payload)
  VALUES (auth.uid(), 'sat_pac.recarga', 'sat_pac_saldo', v.id,
          jsonb_build_object('solicitudes', _solicitudes,
                             'costo_total_centavos', _costo_total_centavos, 'motivo', _motivo));

  UPDATE public.alertas SET estatus='resuelta', resuelta_at=now(), resuelta_por=auth.uid()
   WHERE despacho_id IS NULL AND tipo='sat_saldo' AND estatus='abierta';

  RETURN QUERY SELECT v.saldo_solicitudes + _solicitudes, false;
END; $function$;

CREATE OR REPLACE FUNCTION public.pac_confirmar_consumo(_key text, _solicitudes_reales integer, _run_id uuid DEFAULT NULL::uuid, _despacho uuid DEFAULT NULL::uuid)
 RETURNS TABLE(saldo_solicitudes integer, consumidas integer, devueltas integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v public.sat_pac_saldo; v_res public.sat_pac_movimientos;
        v_real integer; v_dev integer; v_costo bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sat_pac_movimientos m
              WHERE m.proveedor='sw_sapien' AND m.idempotency_key = _key || ':consumo') THEN
    SELECT s.saldo_solicitudes INTO v.saldo_solicitudes FROM public.sat_pac_saldo s WHERE s.proveedor='sw_sapien';
    RETURN QUERY SELECT v.saldo_solicitudes, 0, 0;
    RETURN;
  END IF;

  SELECT * INTO v_res FROM public.sat_pac_movimientos m
   WHERE m.proveedor='sw_sapien' AND m.idempotency_key = _key AND m.tipo='reserva';
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe reserva para la llave %', _key; END IF;

  SELECT * INTO v FROM public.sat_pac_saldo s WHERE s.proveedor='sw_sapien' FOR UPDATE;

  v_real := LEAST(GREATEST(_solicitudes_reales, 0), v_res.solicitudes);
  v_dev  := v_res.solicitudes - v_real;
  v_costo := (v_real)::bigint * v.costo_unitario_centavos;

  UPDATE public.sat_pac_saldo s
     SET saldo_solicitudes     = GREATEST(0, s.saldo_solicitudes - v_real),
         reservado_solicitudes = GREATEST(0, s.reservado_solicitudes - v_res.solicitudes),
         consumido_total       = s.consumido_total + v_real,
         actualizado_at        = now()
   WHERE s.proveedor='sw_sapien';

  INSERT INTO public.sat_pac_movimientos
    (tipo, solicitudes, costo_centavos, saldo_antes, saldo_despues, reservado_despues,
     idempotency_key, run_id, despacho_id, motivo, creado_por)
  VALUES ('consumo', v_real, v_costo, v.saldo_solicitudes,
          GREATEST(0, v.saldo_solicitudes - v_real),
          GREATEST(0, v.reservado_solicitudes - v_res.solicitudes),
          _key || ':consumo', COALESCE(_run_id, v_res.run_id),
          COALESCE(_despacho, v_res.despacho_id), 'Consumo confirmado de corrida SAT', auth.uid());

  IF v_dev > 0 THEN
    INSERT INTO public.sat_pac_movimientos
      (tipo, solicitudes, costo_centavos, saldo_antes, saldo_despues, reservado_despues,
       idempotency_key, run_id, despacho_id, motivo, creado_por)
    VALUES ('devolucion', v_dev, 0, GREATEST(0, v.saldo_solicitudes - v_real),
            GREATEST(0, v.saldo_solicitudes - v_real),
            GREATEST(0, v.reservado_solicitudes - v_res.solicitudes),
            _key || ':devolucion', COALESCE(_run_id, v_res.run_id),
            COALESCE(_despacho, v_res.despacho_id),
            'Devolución de reserva no utilizada', auth.uid());
  END IF;

  RETURN QUERY SELECT GREATEST(0, v.saldo_solicitudes - v_real), v_real, v_dev;
END; $function$;