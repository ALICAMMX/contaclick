CREATE OR REPLACE FUNCTION public.pac_selftest_try_lock(_ms integer DEFAULT 1500)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v integer;
BEGIN
  PERFORM set_config('lock_timeout', _ms::text, true);
  SELECT saldo_solicitudes INTO v FROM public.sat_pac_saldo
   WHERE proveedor='sw_sapien' FOR UPDATE;
  RETURN 'obtuvo el lock (saldo=' || v || ')';
EXCEPTION WHEN lock_not_available THEN
  RETURN 'BLOQUEADO: otra transaccion tiene el saldo (serializado correctamente)';
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.pac_selftest_try_lock(integer) TO PUBLIC;