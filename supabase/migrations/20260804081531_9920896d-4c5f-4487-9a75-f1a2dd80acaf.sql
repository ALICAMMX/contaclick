-- =====================================================================
-- 1) MARCA DEMO / SANDBOX (reversible, no destructiva)
-- =====================================================================
ALTER TABLE public.clientes  ADD COLUMN IF NOT EXISTS es_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.despachos ADD COLUMN IF NOT EXISTS es_sandbox boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clientes.es_demo IS
  'Expediente generado por el showroom/demo. Reversible: backfill derivado de notas LIKE ''%__DEMO__%''. No consume cuota ni aparece en reportes reales.';
COMMENT ON COLUMN public.despachos.es_sandbox IS
  'Despacho sandbox de demostración. No consume saldo PAC ni dispara alertas comerciales.';

-- Backfill reversible: la etiqueta original en notas se conserva intacta.
UPDATE public.clientes SET es_demo = true
 WHERE es_demo = false AND notas LIKE '%__DEMO__%';

CREATE INDEX IF NOT EXISTS idx_clientes_despacho_real
  ON public.clientes (despacho_id, tipo_relacion) WHERE es_demo = false;

-- =====================================================================
-- 2) EXCEPCIONES COMERCIALES EXPLÍCITAS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.entitlement_excepciones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id  uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  tipo         text NOT NULL CHECK (tipo IN (
                 'trial_extension','limite_rfcs','limite_ia_msgs','limite_ia_tokens',
                 'limite_sat_solicitudes','frecuencia_sat','acceso_cortesia')),
  valor_num    bigint,
  valor_texto  text,
  motivo       text NOT NULL CHECK (char_length(motivo) >= 5),
  creado_por   uuid NOT NULL REFERENCES auth.users(id),
  expira_at    timestamptz NOT NULL,
  revocada_at  timestamptz,
  revocada_por uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.entitlement_excepciones TO authenticated;
GRANT ALL    ON public.entitlement_excepciones TO service_role;
ALTER TABLE public.entitlement_excepciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins del despacho ven sus excepciones"
  ON public.entitlement_excepciones FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.is_despacho_admin(despacho_id));

CREATE POLICY "Solo super-admin crea excepciones"
  ON public.entitlement_excepciones FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() AND creado_por = auth.uid());

CREATE POLICY "Solo super-admin revoca excepciones"
  ON public.entitlement_excepciones FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TRIGGER trg_ent_exc_updated BEFORE UPDATE ON public.entitlement_excepciones
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ent_exc_vigentes
  ON public.entitlement_excepciones (despacho_id, tipo, expira_at)
  WHERE revocada_at IS NULL;

-- Excepción vigente (mayor valor) para un despacho/tipo
CREATE OR REPLACE FUNCTION public.excepcion_vigente(_despacho uuid, _tipo text)
RETURNS TABLE(valor_num bigint, valor_texto text, motivo text, expira_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.valor_num, e.valor_texto, e.motivo, e.expira_at
  FROM public.entitlement_excepciones e
  WHERE e.despacho_id = _despacho AND e.tipo = _tipo
    AND e.revocada_at IS NULL AND e.expira_at > now()
  ORDER BY COALESCE(e.valor_num, 0) DESC, e.expira_at DESC
  LIMIT 1;
$$;

-- =====================================================================
-- 3) ALERTAS GLOBALES (saldo PAC) — despacho_id pasa a ser opcional
-- =====================================================================
ALTER TABLE public.alertas ALTER COLUMN despacho_id DROP NOT NULL;

CREATE POLICY "Super-admin ve alertas globales"
  ON public.alertas FOR SELECT TO authenticated
  USING (despacho_id IS NULL AND public.is_super_admin());

CREATE UNIQUE INDEX IF NOT EXISTS idx_alertas_pac_unique
  ON public.alertas (tipo, (evidencia->>'umbral'), (evidencia->>'periodo'))
  WHERE despacho_id IS NULL AND tipo = 'sat_saldo';

-- =====================================================================
-- 4) SALDO PAC: campos de control + libro mayor inmutable
-- =====================================================================
ALTER TABLE public.sat_pac_saldo
  ADD COLUMN IF NOT EXISTS reservado_solicitudes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS umbral_critico integer NOT NULL DEFAULT 200;

CREATE TABLE IF NOT EXISTS public.sat_pac_movimientos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor         text NOT NULL DEFAULT 'sw_sapien',
  tipo              text NOT NULL CHECK (tipo IN ('recarga','reserva','consumo','devolucion','ajuste')),
  solicitudes       integer NOT NULL,
  costo_centavos    bigint NOT NULL DEFAULT 0,
  saldo_antes       integer NOT NULL,
  saldo_despues     integer NOT NULL,
  reservado_despues integer NOT NULL DEFAULT 0,
  idempotency_key   text NOT NULL,
  run_id            uuid,
  despacho_id       uuid REFERENCES public.despachos(id) ON DELETE SET NULL,
  motivo            text,
  creado_por        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pac_mov_idem
  ON public.sat_pac_movimientos (proveedor, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_pac_mov_run  ON public.sat_pac_movimientos (run_id);
CREATE INDEX IF NOT EXISTS idx_pac_mov_time ON public.sat_pac_movimientos (created_at DESC);

GRANT SELECT ON public.sat_pac_movimientos TO authenticated;
GRANT ALL    ON public.sat_pac_movimientos TO service_role;
ALTER TABLE public.sat_pac_movimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super-admin lee el libro PAC"
  ON public.sat_pac_movimientos FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Inmutabilidad: nadie edita ni borra movimientos
CREATE OR REPLACE FUNCTION public.tg_pac_mov_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos del PAC son inmutables (%).', TG_OP;
END; $$;

CREATE TRIGGER trg_pac_mov_no_update BEFORE UPDATE ON public.sat_pac_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.tg_pac_mov_inmutable();
CREATE TRIGGER trg_pac_mov_no_delete BEFORE DELETE ON public.sat_pac_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.tg_pac_mov_inmutable();

-- ---------- Reserva transaccional e idempotente ----------
CREATE OR REPLACE FUNCTION public.pac_reservar(
  _key text, _solicitudes integer, _run_id uuid DEFAULT NULL,
  _despacho uuid DEFAULT NULL, _motivo text DEFAULT NULL)
RETURNS TABLE(ok boolean, reservadas integer, saldo_disponible integer, duplicado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.sat_pac_saldo; v_prev public.sat_pac_movimientos; v_disp integer; v_costo bigint;
BEGIN
  IF _solicitudes <= 0 THEN
    RAISE EXCEPTION 'El número de solicitudes a reservar debe ser mayor a cero';
  END IF;

  SELECT * INTO v_prev FROM public.sat_pac_movimientos
   WHERE proveedor = 'sw_sapien' AND idempotency_key = _key AND tipo = 'reserva';
  IF FOUND THEN
    SELECT * INTO v FROM public.sat_pac_saldo WHERE proveedor = 'sw_sapien';
    RETURN QUERY SELECT true, v_prev.solicitudes,
                        v.saldo_solicitudes - v.reservado_solicitudes, true;
    RETURN;
  END IF;

  SELECT * INTO v FROM public.sat_pac_saldo WHERE proveedor = 'sw_sapien' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe la cuenta del proveedor SAT'; END IF;

  v_disp := v.saldo_solicitudes - v.reservado_solicitudes;
  IF v_disp < _solicitudes THEN
    RETURN QUERY SELECT false, 0, v_disp, false;
    RETURN;
  END IF;

  v_costo := (_solicitudes)::bigint * v.costo_unitario_centavos;

  UPDATE public.sat_pac_saldo
     SET reservado_solicitudes = reservado_solicitudes + _solicitudes, actualizado_at = now()
   WHERE proveedor = 'sw_sapien';

  INSERT INTO public.sat_pac_movimientos
    (tipo, solicitudes, costo_centavos, saldo_antes, saldo_despues, reservado_despues,
     idempotency_key, run_id, despacho_id, motivo, creado_por)
  VALUES ('reserva', _solicitudes, v_costo, v.saldo_solicitudes, v.saldo_solicitudes,
          v.reservado_solicitudes + _solicitudes, _key, _run_id, _despacho,
          COALESCE(_motivo, 'Reserva previa a corrida SAT'), auth.uid());

  RETURN QUERY SELECT true, _solicitudes, v_disp - _solicitudes, false;
END; $$;

-- ---------- Confirmación de consumo real ----------
CREATE OR REPLACE FUNCTION public.pac_confirmar_consumo(
  _key text, _solicitudes_reales integer, _run_id uuid DEFAULT NULL, _despacho uuid DEFAULT NULL)
RETURNS TABLE(saldo_solicitudes integer, consumidas integer, devueltas integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.sat_pac_saldo; v_res public.sat_pac_movimientos;
        v_real integer; v_dev integer; v_costo bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sat_pac_movimientos
              WHERE proveedor='sw_sapien' AND idempotency_key = _key || ':consumo') THEN
    SELECT s.saldo_solicitudes INTO v.saldo_solicitudes FROM public.sat_pac_saldo s WHERE s.proveedor='sw_sapien';
    RETURN QUERY SELECT v.saldo_solicitudes, 0, 0;
    RETURN;
  END IF;

  SELECT * INTO v_res FROM public.sat_pac_movimientos
   WHERE proveedor='sw_sapien' AND idempotency_key = _key AND tipo='reserva';
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe reserva para la llave %', _key; END IF;

  SELECT * INTO v FROM public.sat_pac_saldo WHERE proveedor='sw_sapien' FOR UPDATE;

  v_real := LEAST(GREATEST(_solicitudes_reales, 0), v_res.solicitudes);
  v_dev  := v_res.solicitudes - v_real;
  v_costo := (v_real)::bigint * v.costo_unitario_centavos;

  UPDATE public.sat_pac_saldo
     SET saldo_solicitudes     = GREATEST(0, saldo_solicitudes - v_real),
         reservado_solicitudes = GREATEST(0, reservado_solicitudes - v_res.solicitudes),
         consumido_total       = consumido_total + v_real,
         actualizado_at        = now()
   WHERE proveedor='sw_sapien';

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
END; $$;

-- ---------- Devolución total (falla del PAC tras reservar) ----------
CREATE OR REPLACE FUNCTION public.pac_devolver_reserva(_key text, _motivo text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.sat_pac_saldo; v_res public.sat_pac_movimientos;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sat_pac_movimientos
              WHERE proveedor='sw_sapien'
                AND idempotency_key IN (_key || ':consumo', _key || ':devolucion-total')) THEN
    RETURN true; -- ya liquidada
  END IF;

  SELECT * INTO v_res FROM public.sat_pac_movimientos
   WHERE proveedor='sw_sapien' AND idempotency_key = _key AND tipo='reserva';
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO v FROM public.sat_pac_saldo WHERE proveedor='sw_sapien' FOR UPDATE;

  UPDATE public.sat_pac_saldo
     SET reservado_solicitudes = GREATEST(0, reservado_solicitudes - v_res.solicitudes),
         actualizado_at = now()
   WHERE proveedor='sw_sapien';

  INSERT INTO public.sat_pac_movimientos
    (tipo, solicitudes, costo_centavos, saldo_antes, saldo_despues, reservado_despues,
     idempotency_key, run_id, despacho_id, motivo, creado_por)
  VALUES ('devolucion', v_res.solicitudes, 0, v.saldo_solicitudes, v.saldo_solicitudes,
          GREATEST(0, v.reservado_solicitudes - v_res.solicitudes),
          _key || ':devolucion-total', v_res.run_id, v_res.despacho_id,
          COALESCE(_motivo, 'Corrida SAT fallida: reserva liberada'), auth.uid());
  RETURN true;
END; $$;

-- ---------- Recarga manual con trazabilidad ----------
CREATE OR REPLACE FUNCTION public.pac_recargar(
  _solicitudes integer, _costo_total_centavos bigint, _motivo text, _key text)
RETURNS TABLE(saldo_solicitudes integer, duplicado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.sat_pac_saldo; v_unit integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Solo super-admin puede recargar saldo PAC';
  END IF;
  IF _solicitudes <= 0 THEN RAISE EXCEPTION 'La recarga debe ser mayor a cero'; END IF;
  IF coalesce(char_length(trim(_motivo)),0) < 5 THEN
    RAISE EXCEPTION 'La recarga requiere un motivo de al menos 5 caracteres';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sat_pac_movimientos
              WHERE proveedor='sw_sapien' AND idempotency_key=_key) THEN
    SELECT s.saldo_solicitudes INTO v.saldo_solicitudes FROM public.sat_pac_saldo s WHERE s.proveedor='sw_sapien';
    RETURN QUERY SELECT v.saldo_solicitudes, true;
    RETURN;
  END IF;

  SELECT * INTO v FROM public.sat_pac_saldo WHERE proveedor='sw_sapien' FOR UPDATE;
  v_unit := GREATEST(1, (_costo_total_centavos / _solicitudes)::integer);

  UPDATE public.sat_pac_saldo
     SET saldo_solicitudes = saldo_solicitudes + _solicitudes,
         costo_unitario_centavos = v_unit,
         recargado_total = recargado_total + _solicitudes,
         actualizado_at = now(), actualizado_por = auth.uid()
   WHERE proveedor='sw_sapien';

  INSERT INTO public.sat_pac_movimientos
    (tipo, solicitudes, costo_centavos, saldo_antes, saldo_despues, reservado_despues,
     idempotency_key, motivo, creado_por)
  VALUES ('recarga', _solicitudes, _costo_total_centavos, v.saldo_solicitudes,
          v.saldo_solicitudes + _solicitudes, v.reservado_solicitudes, _key, _motivo, auth.uid());

  INSERT INTO public.audit_logs (user_id, accion, entidad, entidad_id, payload)
  VALUES (auth.uid(), 'sat_pac.recarga', 'sat_pac_saldo', v.id,
          jsonb_build_object('solicitudes', _solicitudes,
                             'costo_total_centavos', _costo_total_centavos, 'motivo', _motivo));

  -- Al recargar se limpian los avisos de saldo abiertos
  UPDATE public.alertas SET estatus='resuelta', resuelta_at=now(), resuelta_por=auth.uid()
   WHERE despacho_id IS NULL AND tipo='sat_saldo' AND estatus='abierta';

  RETURN QUERY SELECT v.saldo_solicitudes + _solicitudes, false;
END; $$;

-- ---------- Ajuste manual (positivo o negativo) ----------
CREATE OR REPLACE FUNCTION public.pac_ajustar(_delta integer, _motivo text, _key text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.sat_pac_saldo; v_nuevo integer;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Solo super-admin puede ajustar el saldo PAC'; END IF;
  IF _delta = 0 THEN RAISE EXCEPTION 'El ajuste no puede ser cero'; END IF;
  IF coalesce(char_length(trim(_motivo)),0) < 5 THEN
    RAISE EXCEPTION 'El ajuste requiere un motivo de al menos 5 caracteres';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sat_pac_movimientos
              WHERE proveedor='sw_sapien' AND idempotency_key=_key) THEN
    SELECT s.saldo_solicitudes INTO v_nuevo FROM public.sat_pac_saldo s WHERE s.proveedor='sw_sapien';
    RETURN v_nuevo;
  END IF;

  SELECT * INTO v FROM public.sat_pac_saldo WHERE proveedor='sw_sapien' FOR UPDATE;
  v_nuevo := GREATEST(0, v.saldo_solicitudes + _delta);

  UPDATE public.sat_pac_saldo
     SET saldo_solicitudes = v_nuevo, actualizado_at = now(), actualizado_por = auth.uid()
   WHERE proveedor='sw_sapien';

  INSERT INTO public.sat_pac_movimientos
    (tipo, solicitudes, costo_centavos, saldo_antes, saldo_despues, reservado_despues,
     idempotency_key, motivo, creado_por)
  VALUES ('ajuste', _delta, 0, v.saldo_solicitudes, v_nuevo, v.reservado_solicitudes,
          _key, _motivo, auth.uid());

  INSERT INTO public.audit_logs (user_id, accion, entidad, entidad_id, payload)
  VALUES (auth.uid(), 'sat_pac.ajuste', 'sat_pac_saldo', v.id,
          jsonb_build_object('delta', _delta, 'motivo', _motivo));
  RETURN v_nuevo;
END; $$;

-- ---------- Conciliación PAC ----------
CREATE OR REPLACE FUNCTION public.pac_conciliacion(_desde timestamptz DEFAULT now() - interval '90 days')
RETURNS TABLE(saldo_actual integer, reservado integer, recargas bigint, consumos bigint,
              devoluciones bigint, ajustes bigint, saldo_calculado bigint,
              corridas_sat bigint, solicitudes_uso_periodo bigint, descuadre bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH m AS (
    SELECT
      COALESCE(SUM(solicitudes) FILTER (WHERE tipo='recarga'),0)     AS rec,
      COALESCE(SUM(solicitudes) FILTER (WHERE tipo='consumo'),0)     AS con,
      COALESCE(SUM(solicitudes) FILTER (WHERE tipo='devolucion'),0)  AS dev,
      COALESCE(SUM(solicitudes) FILTER (WHERE tipo='ajuste'),0)      AS aju
    FROM public.sat_pac_movimientos WHERE created_at >= _desde
  ), s AS (SELECT saldo_solicitudes, reservado_solicitudes FROM public.sat_pac_saldo WHERE proveedor='sw_sapien'),
     r AS (SELECT COUNT(*) c FROM public.sat_sync_runs WHERE iniciado_at >= _desde),
     u AS (SELECT COALESCE(SUM(sat_solicitudes),0) t FROM public.uso_periodo)
  SELECT s.saldo_solicitudes, s.reservado_solicitudes, m.rec, m.con, m.dev, m.aju,
         (m.rec - m.con + m.aju)::bigint, r.c, u.t,
         (s.saldo_solicitudes - (m.rec - m.con + m.aju))::bigint
  FROM m, s, r, u;
$$;

-- =====================================================================
-- 5) TRIALS: normalización y proceso idempotente de vencimiento
-- =====================================================================
CREATE OR REPLACE FUNCTION public.expirar_trials()
RETURNS TABLE(normalizadas integer, vencidas integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_norm integer := 0; v_venc integer := 0;
BEGIN
  -- (a) Estado contradictorio: cuenta con plan de pago no debe conservar fecha de trial.
  WITH upd AS (
    UPDATE public.despachos
       SET trial_ends_at = NULL, estado = 'activa', updated_at = now()
     WHERE plan_id IS NOT NULL AND (trial_ends_at IS NOT NULL OR estado = 'trial')
     RETURNING id
  ) SELECT count(*) INTO v_norm FROM upd;

  -- (b) Trial vencido sin plan y sin cortesía vigente -> vencida (idempotente).
  WITH upd AS (
    UPDATE public.despachos d
       SET estado = 'vencida', updated_at = now()
     WHERE d.plan_id IS NULL
       AND d.estado = 'trial'
       AND d.trial_ends_at IS NOT NULL
       AND d.trial_ends_at <= now()
       AND d.es_sandbox = false
       AND NOT EXISTS (
         SELECT 1 FROM public.entitlement_excepciones e
          WHERE e.despacho_id = d.id
            AND e.tipo IN ('trial_extension','acceso_cortesia')
            AND e.revocada_at IS NULL AND e.expira_at > now())
     RETURNING d.id
  ) SELECT count(*) INTO v_venc FROM upd;

  IF v_norm > 0 OR v_venc > 0 THEN
    INSERT INTO public.audit_logs (user_id, accion, entidad, payload)
    VALUES (NULL, 'entitlements.expirar_trials', 'despachos',
            jsonb_build_object('normalizadas', v_norm, 'vencidas', v_venc, 'at', now()));
  END IF;

  RETURN QUERY SELECT v_norm, v_venc;
END; $$;

REVOKE ALL ON FUNCTION public.expirar_trials() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expirar_trials() TO service_role;

-- Corrección inmediata del estado contradictorio detectado en producción.
SELECT public.expirar_trials();

-- =====================================================================
-- 6) CORTESÍAS DOCUMENTADAS PARA CUENTAS QUE YA EXCEDEN SU LÍMITE
--    (no se borra ni bloquea nada existente; sólo se impide crecer más)
-- =====================================================================
INSERT INTO public.entitlement_excepciones
  (despacho_id, tipo, valor_num, motivo, creado_por, expira_at)
SELECT d.id, 'limite_rfcs', c.n,
       'Cortesía de regularización: la cuenta ya operaba con ' || c.n ||
       ' expedientes antes de aplicar el candado de cuota. Conserva acceso a los existentes; ' ||
       'no puede crear nuevos hasta contratar un plan mayor.',
       d.owner_user_id, now() + interval '90 days'
FROM public.despachos d
JOIN LATERAL (
  SELECT count(*)::bigint AS n FROM public.clientes cl
   WHERE cl.despacho_id = d.id AND cl.tipo_relacion='cliente'
     AND cl.cliente_padre_id IS NULL AND cl.es_demo = false
) c ON true
LEFT JOIN public.planes p ON p.id = d.plan_id
WHERE COALESCE((p.limites->>'rfcs')::int, 25) > 0
  AND c.n > COALESCE((p.limites->>'rfcs')::int, 25)
  AND NOT EXISTS (
    SELECT 1 FROM public.entitlement_excepciones e
     WHERE e.despacho_id = d.id AND e.tipo='limite_rfcs' AND e.revocada_at IS NULL);