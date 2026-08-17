-- Regresión enfocada: contrato de estados de conciliacion_importaciones.
-- Debe admitir exactamente procesando, completada y fallida; cualquier otro valor se rechaza.
-- Ejecutar en el editor SQL administrador. Termina en ROLLBACK.
BEGIN;

CREATE TEMP TABLE _res(caso text, ok boolean, detalle text) ON COMMIT DROP;

DO $$
DECLARE
  v_despacho uuid;
  v_cliente  uuid;
  v_cuenta   uuid;
  v_user     uuid;
  v_imp      uuid;
BEGIN
  SELECT id, user_id INTO v_despacho, v_user FROM public.despachos ORDER BY created_at LIMIT 1;

  INSERT INTO public.clientes (despacho_id, nombre, rfc, created_by)
  VALUES (v_despacho, 'QA IMPORT ESTADO', 'QAIE010101AAA', v_user)
  RETURNING id INTO v_cliente;

  INSERT INTO public.cuentas_bancarias (cliente_id, banco, alias, moneda, created_by)
  VALUES (v_cliente, 'BANCO QA', 'QA', 'MXN', v_user)
  RETURNING id INTO v_cuenta;

  -- 1) inicio -> procesando
  BEGIN
    INSERT INTO public.conciliacion_importaciones
      (cliente_id, cuenta_id, periodo, archivo_nombre, archivo_hash, formato, estado, created_by)
    VALUES (v_cliente, v_cuenta, '2026-07', 'qa.csv', repeat('a', 64), 'csv', 'procesando', v_user)
    RETURNING id INTO v_imp;
    INSERT INTO _res VALUES ('inicio => procesando aceptado', true, 'insert ok');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _res VALUES ('inicio => procesando aceptado', false, SQLERRM);
  END;

  -- 2) éxito -> completada
  BEGIN
    UPDATE public.conciliacion_importaciones SET estado = 'completada' WHERE id = v_imp;
    INSERT INTO _res VALUES ('éxito => completada aceptado', true, 'update ok');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _res VALUES ('éxito => completada aceptado', false, SQLERRM);
  END;

  -- 3) error -> fallida
  BEGIN
    UPDATE public.conciliacion_importaciones SET estado = 'fallida' WHERE id = v_imp;
    INSERT INTO _res VALUES ('error => fallida aceptado', true, 'update ok');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _res VALUES ('error => fallida aceptado', false, SQLERRM);
  END;

  -- 4) cualquier otro valor debe ser rechazado por la base
  BEGIN
    UPDATE public.conciliacion_importaciones SET estado = 'pendiente' WHERE id = v_imp;
    INSERT INTO _res VALUES ('valor no canónico rechazado', false, 'la base aceptó estado=pendiente');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _res VALUES ('valor no canónico rechazado', true, 'check_violation esperado');
  END;
END $$;

SELECT * FROM _res ORDER BY caso;
SELECT count(*) FILTER (WHERE NOT ok) AS fallidas, count(*) AS total FROM _res;

ROLLBACK;
