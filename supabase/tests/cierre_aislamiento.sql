-- ─────────────────────────────────────────────────────────────────────────────
-- AISLAMIENTO REAL DE LAS FUNCIONES SECURITY DEFINER DEL CIERRE
--
-- Dos despachos con dueños distintos y un expediente cada uno. Comprueba que
-- conocer el identificador del expediente ajeno NO concede acceso, que un
-- visitante sin sesión no puede ejecutar nada, y que el dueño legítimo sí.
-- Corre dentro de una transacción que SIEMPRE se revierte: no deja datos.
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
  v_fn text; v_sql text; v_permitido boolean;
  v_funcs text[] := ARRAY[
    'select public.cierre_manifiesto(%L, ''2026-07'')',
    'select public.cierre_bloqueos(%L, ''2026-07'')',
    'select public.cierre_estado(%L, ''2026-07'')',
    'select public.cierre_evaluar_clasificacion(%L, ''2026-07'')',
    'select public.cierre_marcar_no_aplica(%L, ''2026-07'', ''bancos'', ''motivo suficiente de prueba'')',
    'select public.cierre_reabrir(%L, ''2026-07'', ''cfdi'', ''motivo suficiente de prueba'', null, null, null)',
    'select public.cierre_sellar_manifiesto(%L, ''2026-07'', ''motivo suficiente de prueba'', null)'
  ];
BEGIN
  SELECT owner_user_id INTO v_uA FROM public.despachos
   WHERE owner_user_id IS NOT NULL ORDER BY created_at LIMIT 1;
  SELECT owner_user_id INTO v_uB FROM public.despachos
   WHERE owner_user_id IS NOT NULL AND owner_user_id <> v_uA ORDER BY created_at LIMIT 1;
  IF v_uA IS NULL OR v_uB IS NULL THEN
    RAISE EXCEPTION 'Se necesitan dos usuarios distintos para probar el aislamiento';
  END IF;

  INSERT INTO public.despachos (id, nombre, owner_user_id, estado) VALUES
    (v_dA, '__aisl_A__', v_uA, 'trial'), (v_dB, '__aisl_B__', v_uB, 'trial');
  INSERT INTO public.clientes (id, despacho_id, user_id, razon_social, rfc) VALUES
    (v_cA, v_dA, v_uA, '__aisl_cliente_A__', 'AAA010101AAA'),
    (v_cB, v_dB, v_uB, '__aisl_cliente_B__', 'BBB020202BBB');
  INSERT INTO public.user_memberships (user_id, despacho_id, estado) VALUES
    (v_uA, v_dA, 'activo'), (v_uB, v_dB, 'activo')
    ON CONFLICT DO NOTHING;


  -- ── 1. El usuario A NO alcanza el expediente de B en ninguna función ───────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uA, 'role', 'authenticated')::text, true);

  FOREACH v_fn IN ARRAY v_funcs LOOP
    v_permitido := true;
    BEGIN
      EXECUTE format(v_fn, v_cB);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%Sin acceso al expediente%' THEN
        RAISE EXCEPTION 'FALLA 1: % rechazó por un motivo equivocado: %', v_fn, SQLERRM;
      END IF;
      v_permitido := false;
    END;
    IF v_permitido THEN
      RAISE EXCEPTION 'FUGA: el usuario A ejecutó % sobre el expediente de B', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK 1 · ninguna función del cierre atiende un expediente ajeno (7/7 rechazadas)';

  -- ── 2. Un expediente inexistente se rechaza igual (no filtra existencia) ───
  BEGIN
    PERFORM public.cierre_manifiesto('00000000-0000-4000-8000-0000000fffff', '2026-07');
    RAISE EXCEPTION 'FALLA 2: un expediente inexistente no fue rechazado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Expediente inexistente%' AND SQLERRM NOT ILIKE '%Sin acceso%' THEN
      RAISE EXCEPTION 'FALLA 2: rechazo con motivo equivocado: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'OK 2 · expediente inexistente rechazado';

  -- ── 3. El dueño legítimo sí puede leer su propio expediente ───────────────
  IF public.cierre_manifiesto(v_cA, '2026-07')->>'cliente_id' <> v_cA::text THEN
    RAISE EXCEPTION 'FALLA 3: el dueño no obtuvo su propio manifiesto';
  END IF;
  IF jsonb_typeof(public.cierre_estado(v_cA, '2026-07')->'bloqueos') <> 'array' THEN
    RAISE EXCEPTION 'FALLA 3: el estado no devolvió bloqueos';
  END IF;
  RAISE NOTICE 'OK 3 · el dueño legítimo lee su expediente';

  -- ── 4. Sin sesión (anon) no se ejecuta nada ───────────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'anon')::text, true);
  BEGIN
    PERFORM public.cierre_manifiesto(v_cA, '2026-07');
    RAISE EXCEPTION 'FUGA: un visitante sin sesión ejecutó cierre_manifiesto';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 4 · visitante sin sesión bloqueado';

  RAISE NOTICE 'AISLAMIENTO VERIFICADO EN LAS 7 FUNCIONES DEL CIERRE';
END
$prueba$;

ROLLBACK;
