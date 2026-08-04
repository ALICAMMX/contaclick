-- =====================================================================
-- 1. CANDADO DE PLANES / SANDBOX EN despachos
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_despachos_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Contexto privilegiado (service_role / webhooks / cron): sin sesión de usuario.
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.es_sandbox IS DISTINCT FROM OLD.es_sandbox THEN
    RAISE EXCEPTION 'Solo un administrador puede marcar una cuenta como sandbox';
  END IF;
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
    RAISE EXCEPTION 'El plan solo puede cambiarse desde el proceso de pago';
  END IF;
  IF NEW.limites_override IS DISTINCT FROM OLD.limites_override THEN
    RAISE EXCEPTION 'Los límites especiales solo puede ajustarlos un administrador';
  END IF;
  -- Reactivar sin plan de pago está prohibido (el servicio de entitlements
  -- solo necesita poder marcar 'vencida' o normalizar cuentas con plan).
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND NEW.estado IN ('activa','trial')
     AND NEW.plan_id IS NULL THEN
    RAISE EXCEPTION 'No es posible reactivar la cuenta sin un plan contratado';
  END IF;
  -- El trial no puede extenderse desde el frontend.
  IF NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     AND NEW.trial_ends_at IS NOT NULL
     AND (OLD.trial_ends_at IS NULL OR NEW.trial_ends_at > OLD.trial_ends_at) THEN
    RAISE EXCEPTION 'La vigencia de la prueba gratuita no puede modificarse';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_despachos_guard ON public.despachos;
CREATE TRIGGER trg_despachos_guard
BEFORE UPDATE ON public.despachos
FOR EACH ROW EXECUTE FUNCTION public.tg_despachos_guard();

-- =====================================================================
-- 2. CANDADO DE EXPEDIENTES DEMO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_clientes_demo_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_demo integer;
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(NEW.es_demo,false) IS DISTINCT FROM COALESCE(OLD.es_demo,false) THEN
    RAISE EXCEPTION 'Un expediente existente no puede convertirse en expediente demo';
  END IF;

  IF TG_OP = 'INSERT' AND COALESCE(NEW.es_demo,false) = true THEN
    SELECT count(*) INTO v_demo FROM public.clientes
     WHERE despacho_id = NEW.despacho_id AND es_demo = true;
    IF v_demo >= 25 THEN
      RAISE EXCEPTION 'Se alcanzó el máximo de expedientes demo para esta cuenta';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_demo_guard ON public.clientes;
CREATE TRIGGER trg_clientes_demo_guard
BEFORE INSERT OR UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.tg_clientes_demo_guard();

-- =====================================================================
-- 3. EXCEPCIONES: sin permanentes accidentales + auditoría
-- =====================================================================
ALTER TABLE public.entitlement_excepciones
  DROP CONSTRAINT IF EXISTS entitlement_excepciones_motivo_min;
ALTER TABLE public.entitlement_excepciones
  ADD CONSTRAINT entitlement_excepciones_motivo_min
  CHECK (char_length(btrim(motivo)) >= 10);

CREATE OR REPLACE FUNCTION public.tg_excepcion_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.expira_at <= now() THEN
      RAISE EXCEPTION 'La excepción debe tener una fecha de expiración futura';
    END IF;
    IF NEW.expira_at > now() + interval '365 days' THEN
      RAISE EXCEPTION 'Una excepción no puede durar más de 365 días';
    END IF;
    INSERT INTO public.audit_logs (user_id, accion, entidad, entidad_id, payload)
    VALUES (auth.uid(), 'entitlements.excepcion.creada', 'entitlement_excepciones', NEW.id,
            jsonb_build_object('despacho_id', NEW.despacho_id, 'tipo', NEW.tipo,
                               'valor_num', NEW.valor_num, 'valor_texto', NEW.valor_texto,
                               'motivo', NEW.motivo, 'expira_at', NEW.expira_at));
    RETURN NEW;
  END IF;

  IF NEW.expira_at > OLD.expira_at AND NEW.expira_at > now() + interval '365 days' THEN
    RAISE EXCEPTION 'Una excepción no puede durar más de 365 días';
  END IF;
  IF NEW.revocada_at IS NOT NULL AND OLD.revocada_at IS NULL THEN
    NEW.revocada_por := COALESCE(NEW.revocada_por, auth.uid());
  END IF;
  INSERT INTO public.audit_logs (user_id, accion, entidad, entidad_id, payload)
  VALUES (auth.uid(),
          CASE WHEN NEW.revocada_at IS NOT NULL AND OLD.revocada_at IS NULL
               THEN 'entitlements.excepcion.revocada'
               ELSE 'entitlements.excepcion.modificada' END,
          'entitlement_excepciones', NEW.id,
          jsonb_build_object('despacho_id', NEW.despacho_id, 'tipo', NEW.tipo,
                             'antes', jsonb_build_object('valor_num', OLD.valor_num,
                                                         'expira_at', OLD.expira_at,
                                                         'revocada_at', OLD.revocada_at),
                             'despues', jsonb_build_object('valor_num', NEW.valor_num,
                                                           'expira_at', NEW.expira_at,
                                                           'revocada_at', NEW.revocada_at)));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_excepcion_guard ON public.entitlement_excepciones;
CREATE TRIGGER trg_excepcion_guard
BEFORE INSERT OR UPDATE ON public.entitlement_excepciones
FOR EACH ROW EXECUTE FUNCTION public.tg_excepcion_guard();

-- =====================================================================
-- 4. PAC: reservas abandonadas + conciliación restringida
-- =====================================================================
CREATE OR REPLACE FUNCTION public.pac_reservas_abandonadas(_minutos integer DEFAULT 60)
RETURNS TABLE(idempotency_key text, solicitudes integer, run_id uuid,
              despacho_id uuid, created_at timestamptz, minutos_abierta numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.idempotency_key, r.solicitudes, r.run_id, r.despacho_id, r.created_at,
         round(extract(epoch FROM (now() - r.created_at))/60.0, 1)
  FROM public.sat_pac_movimientos r
  WHERE r.tipo = 'reserva'
    AND r.created_at < now() - make_interval(mins => _minutos)
    AND NOT EXISTS (
      SELECT 1 FROM public.sat_pac_movimientos m
       WHERE m.proveedor = r.proveedor
         AND m.idempotency_key IN (r.idempotency_key || ':consumo',
                                   r.idempotency_key || ':devolucion-total'))
  ORDER BY r.created_at;
$$;

CREATE OR REPLACE FUNCTION public.pac_liberar_abandonadas(_minutos integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; v_n integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede liberar reservas abandonadas';
  END IF;
  FOR r IN SELECT * FROM public.pac_reservas_abandonadas(_minutos) LOOP
    PERFORM public.pac_devolver_reserva(r.idempotency_key,
      'Reserva abandonada liberada automáticamente (' || r.minutos_abierta || ' min)');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.pac_conciliacion(_desde timestamptz DEFAULT (now() - '90 days'::interval))
RETURNS TABLE(saldo_actual integer, reservado integer, recargas bigint, consumos bigint,
              devoluciones bigint, ajustes bigint, saldo_calculado bigint, corridas_sat bigint,
              solicitudes_uso_periodo bigint, descuadre bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede consultar la conciliación del saldo SAT';
  END IF;
  RETURN QUERY
  WITH m AS (
    SELECT
      COALESCE(SUM(mm.solicitudes) FILTER (WHERE mm.tipo='recarga'),0)    AS rec,
      COALESCE(SUM(mm.solicitudes) FILTER (WHERE mm.tipo='consumo'),0)    AS con,
      COALESCE(SUM(mm.solicitudes) FILTER (WHERE mm.tipo='devolucion'),0) AS dev,
      COALESCE(SUM(mm.solicitudes) FILTER (WHERE mm.tipo='ajuste'),0)     AS aju
    FROM public.sat_pac_movimientos mm WHERE mm.created_at >= _desde
  ), s AS (SELECT ss.saldo_solicitudes, ss.reservado_solicitudes
             FROM public.sat_pac_saldo ss WHERE ss.proveedor='sw_sapien'),
     r AS (SELECT COUNT(*) c FROM public.sat_sync_runs sr WHERE sr.iniciado_at >= _desde),
     u AS (SELECT COALESCE(SUM(up.sat_solicitudes),0) t FROM public.uso_periodo up)
  SELECT s.saldo_solicitudes, s.reservado_solicitudes, m.rec, m.con, m.dev, m.aju,
         (m.rec - m.con + m.aju)::bigint, r.c, u.t,
         (s.saldo_solicitudes - (m.rec - m.con + m.aju))::bigint
  FROM m, s, r, u;
END;
$$;

REVOKE ALL ON FUNCTION public.pac_conciliacion(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pac_conciliacion(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pac_reservas_abandonadas(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pac_liberar_abandonadas(integer) TO authenticated, service_role;

-- =====================================================================
-- 5. AVISOS ANTICIPADOS (trial / excepción por vencer) sin duplicados
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_alertas_vencimiento_unique
  ON public.alertas (despacho_id, tipo, ((evidencia->>'ref')), ((evidencia->>'umbral')))
  WHERE tipo IN ('trial_por_vencer','excepcion_por_vencer');

CREATE OR REPLACE FUNCTION public.emitir_avisos_vencimiento()
RETURNS TABLE(trials integer, excepciones integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_t integer := 0; v_e integer := 0; r record; v_dias integer;
BEGIN
  FOR r IN
    SELECT d.id, d.nombre, d.trial_ends_at
      FROM public.despachos d
     WHERE d.plan_id IS NULL AND d.estado = 'trial' AND d.es_sandbox = false
       AND d.trial_ends_at BETWEEN now() AND now() + interval '7 days'
  LOOP
    v_dias := GREATEST(0, ceil(extract(epoch FROM (r.trial_ends_at - now()))/86400.0)::int);
    INSERT INTO public.alertas (despacho_id, tipo, nivel, titulo, descripcion, recomendacion,
                                accion_sugerida, evidencia)
    VALUES (r.id, 'trial_por_vencer', CASE WHEN v_dias <= 3 THEN 'alto' ELSE 'medio' END,
            'Tu prueba gratuita termina pronto',
            'Quedan ' || v_dias || ' día(s) de prueba. Al vencer, la cuenta deja de operar hasta contratar un plan.',
            'Elige un plan para no interrumpir la operación.', 'Ver planes',
            jsonb_build_object('ref', to_char(r.trial_ends_at,'YYYY-MM-DD'),
                               'umbral', CASE WHEN v_dias <= 3 THEN '3d' ELSE '7d' END,
                               'dias_restantes', v_dias))
    ON CONFLICT DO NOTHING;
    v_t := v_t + 1;
  END LOOP;

  FOR r IN
    SELECT e.id, e.despacho_id, e.tipo, e.expira_at, e.valor_num, e.motivo
      FROM public.entitlement_excepciones e
     WHERE e.revocada_at IS NULL
       AND e.expira_at BETWEEN now() AND now() + interval '15 days'
  LOOP
    v_dias := GREATEST(0, ceil(extract(epoch FROM (r.expira_at - now()))/86400.0)::int);
    INSERT INTO public.alertas (despacho_id, tipo, nivel, titulo, descripcion, recomendacion,
                                accion_sugerida, evidencia)
    VALUES (r.despacho_id, 'excepcion_por_vencer', CASE WHEN v_dias <= 7 THEN 'alto' ELSE 'medio' END,
            'Tu ampliación temporal está por vencer',
            'La ampliación (' || r.tipo || ') vence en ' || v_dias || ' día(s). Después regresa el límite de tu plan.',
            'Contrata un plan mayor o solicita la renovación antes de la fecha de vencimiento.',
            'Ver planes',
            jsonb_build_object('ref', r.id::text,
                               'umbral', CASE WHEN v_dias <= 7 THEN '7d' ELSE '15d' END,
                               'expira_at', r.expira_at, 'valor_num', r.valor_num))
    ON CONFLICT DO NOTHING;
    v_e := v_e + 1;
  END LOOP;

  RETURN QUERY SELECT v_t, v_e;
END;
$$;

GRANT EXECUTE ON FUNCTION public.emitir_avisos_vencimiento() TO authenticated, service_role;