-- =====================================================================
-- REGRESIÓN PERMANENTE DEL LIBRO DE SALDO PAC (SAT)
-- ---------------------------------------------------------------------
-- Origen: incidente en producción donde pac_recargar() y
-- pac_confirmar_consumo() fallaban por choque de nombres entre la columna
-- sat_pac_saldo.saldo_solicitudes y la columna de salida homónima
-- (RETURNS TABLE(saldo_solicitudes ...)) -> "column reference ... is ambiguous".
--
-- Ejecutar ANTES DE CADA DESPLIEGUE que toque funciones PAC, con un rol
-- capaz de ejecutar funciones (service_role / owner):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pac_regression.sql
--
-- Todo corre dentro de una transacción que termina en ROLLBACK: NO deja
-- huella en datos reales.
-- =====================================================================
BEGIN;

DO $$
DECLARE
  v_saldo_ini integer;
  v_r record;
  v_key text := 'regresion:' || gen_random_uuid()::text;
BEGIN
  SELECT saldo_solicitudes INTO v_saldo_ini FROM public.sat_pac_saldo WHERE proveedor='sw_sapien';

  -- 1) Recarga: no debe fallar por ambigüedad y debe sumar al saldo.
  SELECT * INTO v_r FROM public.pac_recargar(100, 10000, 'Regresión automatizada PAC', v_key||':r');
  ASSERT v_r.duplicado = false, 'la primera recarga no debe marcarse duplicada';
  ASSERT v_r.saldo_solicitudes = v_saldo_ini + 100, 'la recarga debe sumar exactamente 100';

  -- 2) Idempotencia de la recarga (misma llave => sin doble abono).
  SELECT * INTO v_r FROM public.pac_recargar(100, 10000, 'Regresión automatizada PAC', v_key||':r');
  ASSERT v_r.duplicado = true, 'la recarga repetida debe detectarse como duplicada';
  ASSERT v_r.saldo_solicitudes = v_saldo_ini + 100, 'la recarga duplicada no debe volver a abonar';

  -- 3) Reserva.
  SELECT * INTO v_r FROM public.pac_reservar(v_key, 30, NULL, NULL, 'Regresión');
  ASSERT v_r.ok, 'la reserva debe autorizarse con saldo suficiente';

  -- 4) Confirmación parcial: consume lo real y devuelve el resto.
  SELECT * INTO v_r FROM public.pac_confirmar_consumo(v_key, 12, NULL, NULL);
  ASSERT v_r.consumidas = 12, 'debe consumir exactamente lo realmente usado';
  ASSERT v_r.devueltas = 18, 'debe devolver la reserva no utilizada';
  ASSERT v_r.saldo_solicitudes = v_saldo_ini + 100 - 12, 'el saldo debe descontar sólo lo consumido';

  -- 5) Idempotencia de la confirmación.
  SELECT * INTO v_r FROM public.pac_confirmar_consumo(v_key, 12, NULL, NULL);
  ASSERT v_r.consumidas = 0, 'la confirmación repetida no debe volver a consumir';

  -- 6) El saldo nunca queda negativo.
  ASSERT (SELECT saldo_solicitudes >= 0 FROM public.sat_pac_saldo WHERE proveedor='sw_sapien'),
         'el saldo PAC no puede ser negativo';

  -- 7) El libro de movimientos es inmutable.
  BEGIN
    UPDATE public.sat_pac_movimientos SET solicitudes = 1
     WHERE proveedor='sw_sapien' AND idempotency_key = v_key||':consumo';
    RAISE EXCEPTION 'FALLO: se permitió modificar un movimiento PAC';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO:%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM public.sat_pac_movimientos
     WHERE proveedor='sw_sapien' AND idempotency_key = v_key||':consumo';
    RAISE EXCEPTION 'FALLO: se permitió borrar un movimiento PAC';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO:%' THEN RAISE; END IF;
  END;

  -- 8) Conciliación: saldo calculado desde el libro == saldo almacenado.
  PERFORM 1 FROM public.pac_conciliacion(now() - interval '1 day') c WHERE c.descuadre <> 0;
  ASSERT NOT FOUND, 'el libro de movimientos debe cuadrar contra el saldo';

  RAISE NOTICE 'PAC regression: 8/8 OK';
END $$;

ROLLBACK;
