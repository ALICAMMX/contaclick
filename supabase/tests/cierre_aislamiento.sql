-- ─────────────────────────────────────────────────────────────────────────────
-- AISLAMIENTO REAL DE LAS FUNCIONES SECURITY DEFINER DEL CIERRE
--
-- Dos despachos, dos usuarios. Verifica que conocer el UUID de otro expediente
-- no concede acceso, que anon no puede ejecutar y que cada usuario sólo ve lo
-- suyo. Corre dentro de una transacción que SIEMPRE se revierte.
--
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/cierre_aislamiento.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $prueba$
DECLARE
  v_dA uuid := '00000000-0000-4000-8000-00000000a100';
  v_dB uuid := '00000000-0000-4000-8000-00000000b100';
  v_cA uuid := '00000000-0000-4000-8000-00000000a101';
  v_cB uuid := '00000000-0000-4000-8000-00000000b101';
  v_uA uuid; v_uB uuid;
  v_res jsonb; v_ok boolean; v_msj text;
  v_fallos int := 0;

  -- ejecuta como usuario autenticado y devuelve si la llamada fue permitida
  FUNCTION_PLACEHOLDER boolean;
BEGIN
  RAISE EXCEPTION 'placeholder';
END;
$prueba$;

ROLLBACK;
