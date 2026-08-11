-- ─────────────────────────────────────────────────────────────
-- FLUJO CONTABLE MENSUAL — etapas + bitácora inmutable
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cierre_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo text NOT NULL CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  etapa text NOT NULL CHECK (etapa IN ('documentos','clasificacion','bancos','polizas','impuestos','cierre')),
  estado text NOT NULL DEFAULT 'no_iniciada'
    CHECK (estado IN ('no_iniciada','en_proceso','bloqueada','lista','aprobada','reabierta','no_aplica')),
  cobertura numeric(5,2),
  criterios_cumplidos jsonb NOT NULL DEFAULT '[]'::jsonb,
  criterios_pendientes jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_hash text,
  evaluador_version text,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo text,
  version integer NOT NULL DEFAULT 1,
  idempotency_key text,
  iniciada_at timestamptz,
  lista_at timestamptz,
  aprobada_at timestamptz,
  aprobada_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cierre_etapas_unica UNIQUE (cliente_id, periodo, etapa)
);

GRANT SELECT, INSERT, UPDATE ON public.cierre_etapas TO authenticated;
GRANT ALL ON public.cierre_etapas TO service_role;
ALTER TABLE public.cierre_etapas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "etapas_select_miembros" ON public.cierre_etapas
  FOR SELECT TO authenticated
  USING (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id));
CREATE POLICY "etapas_insert_miembros" ON public.cierre_etapas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id));
CREATE POLICY "etapas_update_miembros" ON public.cierre_etapas
  FOR UPDATE TO authenticated
  USING (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id))
  WITH CHECK (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id));

CREATE INDEX IF NOT EXISTS cierre_etapas_periodo_idx ON public.cierre_etapas (cliente_id, periodo);
CREATE UNIQUE INDEX IF NOT EXISTS cierre_etapas_idem_idx
  ON public.cierre_etapas (cliente_id, periodo, etapa, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Bitácora inmutable -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cierre_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo text NOT NULL,
  etapa text NOT NULL,
  evento text NOT NULL,
  estado_anterior text,
  estado_nuevo text,
  actor_user_id uuid,
  proceso text,
  motivo text,
  fuente text,
  referencia_tipo text,
  referencia_id text,
  input_hash text,
  version integer,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.cierre_eventos TO authenticated;
GRANT SELECT, INSERT ON public.cierre_eventos TO service_role;
ALTER TABLE public.cierre_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eventos_select_miembros" ON public.cierre_eventos
  FOR SELECT TO authenticated
  USING (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id));
CREATE POLICY "eventos_insert_miembros" ON public.cierre_eventos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id));

CREATE INDEX IF NOT EXISTS cierre_eventos_periodo_idx ON public.cierre_eventos (cliente_id, periodo, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS cierre_eventos_idem_idx
  ON public.cierre_eventos (cliente_id, periodo, etapa, evento, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cierre_eventos_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'cierre_eventos es una bitácora inmutable: % no permitido', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS cierre_eventos_no_update ON public.cierre_eventos;
CREATE TRIGGER cierre_eventos_no_update BEFORE UPDATE OR DELETE ON public.cierre_eventos
  FOR EACH ROW EXECUTE FUNCTION public.cierre_eventos_inmutable();

-- Transición atómica: etapa + evento ------------------------------------
CREATE OR REPLACE FUNCTION public.cierre_etapa_transicion(
  _cliente_id uuid,
  _periodo text,
  _etapa text,
  _estado text,
  _motivo text DEFAULT NULL,
  _cobertura numeric DEFAULT NULL,
  _criterios_cumplidos jsonb DEFAULT '[]'::jsonb,
  _criterios_pendientes jsonb DEFAULT '[]'::jsonb,
  _input_hash text DEFAULT NULL,
  _evaluador_version text DEFAULT NULL,
  _resultado jsonb DEFAULT '{}'::jsonb,
  _idempotency_key text DEFAULT NULL,
  _fuente text DEFAULT 'ui'
) RETURNS public.cierre_etapas
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _despacho uuid;
  _fila public.cierre_etapas;
  _anterior text;
  _uid uuid := auth.uid();
BEGIN
  SELECT despacho_id INTO _despacho FROM public.clientes WHERE id = _cliente_id;
  IF _despacho IS NULL THEN RAISE EXCEPTION 'Expediente inexistente'; END IF;
  IF auth.role() <> 'service_role' THEN
    IF _uid IS NULL OR NOT public.is_member_of(_despacho) OR NOT public.has_cliente_access(_cliente_id) THEN
      RAISE EXCEPTION 'Sin acceso al expediente';
    END IF;
  END IF;
  IF _estado = 'no_aplica' AND coalesce(length(trim(_motivo)), 0) < 10 THEN
    RAISE EXCEPTION 'Declarar "no aplica" exige un motivo';
  END IF;

  INSERT INTO public.cierre_etapas (despacho_id, cliente_id, periodo, etapa, estado, iniciada_at)
  VALUES (_despacho, _cliente_id, _periodo, _etapa, 'no_iniciada', now())
  ON CONFLICT (cliente_id, periodo, etapa) DO NOTHING;

  SELECT * INTO _fila FROM public.cierre_etapas
    WHERE cliente_id = _cliente_id AND periodo = _periodo AND etapa = _etapa FOR UPDATE;
  _anterior := _fila.estado;

  -- Idempotencia: misma llave y mismo estado => no repite efectos
  IF _idempotency_key IS NOT NULL AND _fila.idempotency_key IS NOT DISTINCT FROM _idempotency_key
     AND _fila.estado = _estado THEN
    RETURN _fila;
  END IF;

  UPDATE public.cierre_etapas SET
    estado = _estado,
    cobertura = coalesce(_cobertura, cobertura),
    criterios_cumplidos = coalesce(_criterios_cumplidos, criterios_cumplidos),
    criterios_pendientes = coalesce(_criterios_pendientes, criterios_pendientes),
    input_hash = coalesce(_input_hash, input_hash),
    evaluador_version = coalesce(_evaluador_version, evaluador_version),
    resultado = coalesce(_resultado, resultado),
    motivo = _motivo,
    idempotency_key = coalesce(_idempotency_key, idempotency_key),
    iniciada_at = coalesce(iniciada_at, now()),
    lista_at = CASE WHEN _estado = 'lista' THEN now() WHEN _estado IN ('reabierta','no_iniciada') THEN NULL ELSE lista_at END,
    aprobada_at = CASE WHEN _estado = 'aprobada' THEN now() WHEN _estado IN ('reabierta','no_iniciada') THEN NULL ELSE aprobada_at END,
    aprobada_por = CASE WHEN _estado = 'aprobada' THEN _uid WHEN _estado IN ('reabierta','no_iniciada') THEN NULL ELSE aprobada_por END,
    version = CASE WHEN _estado = 'reabierta' THEN version + 1 ELSE version END,
    updated_at = now()
  WHERE id = _fila.id
  RETURNING * INTO _fila;

  INSERT INTO public.cierre_eventos (
    despacho_id, cliente_id, periodo, etapa, evento, estado_anterior, estado_nuevo,
    actor_user_id, proceso, motivo, fuente, input_hash, version, idempotency_key
  ) VALUES (
    _despacho, _cliente_id, _periodo, _etapa, 'transicion', _anterior, _estado,
    _uid, CASE WHEN _uid IS NULL THEN 'sistema' ELSE 'usuario' END, _motivo, _fuente,
    _fila.input_hash, _fila.version, _idempotency_key
  ) ON CONFLICT DO NOTHING;

  RETURN _fila;
END;
$$;

REVOKE ALL ON FUNCTION public.cierre_etapa_transicion(uuid,text,text,text,text,numeric,jsonb,jsonb,text,text,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_etapa_transicion(uuid,text,text,text,text,numeric,jsonb,jsonb,text,text,jsonb,text,text) TO authenticated, service_role;

-- Reapertura en cascada --------------------------------------------------
CREATE OR REPLACE FUNCTION public.cierre_reabrir_cascada(
  _cliente_id uuid,
  _periodo text,
  _disparador text,
  _motivo text,
  _referencia_tipo text DEFAULT NULL,
  _referencia_id text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS TABLE(etapa text, estado_anterior text, version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _despacho uuid;
  _etapas text[];
  _e text;
  _fila public.cierre_etapas;
  _uid uuid := auth.uid();
BEGIN
  SELECT despacho_id INTO _despacho FROM public.clientes WHERE id = _cliente_id;
  IF _despacho IS NULL THEN RAISE EXCEPTION 'Expediente inexistente'; END IF;
  IF auth.role() <> 'service_role' THEN
    IF _uid IS NULL OR NOT public.is_member_of(_despacho) OR NOT public.has_cliente_access(_cliente_id) THEN
      RAISE EXCEPTION 'Sin acceso al expediente';
    END IF;
  END IF;

  _etapas := CASE _disparador
    WHEN 'cfdi'          THEN ARRAY['documentos','clasificacion','bancos','polizas','impuestos','cierre']
    WHEN 'clasificacion' THEN ARRAY['clasificacion','polizas','impuestos','cierre']
    WHEN 'banco'         THEN ARRAY['bancos','polizas','impuestos','cierre']
    WHEN 'poliza'        THEN ARRAY['polizas','impuestos','cierre']
    WHEN 'parametro_fiscal' THEN ARRAY['impuestos','cierre']
    ELSE NULL END;
  IF _etapas IS NULL THEN RAISE EXCEPTION 'Disparador desconocido: %', _disparador; END IF;

  -- Candado por periodo para que dos procesos no generen dos reaperturas
  PERFORM pg_advisory_xact_lock(hashtextextended(_cliente_id::text || _periodo, 0));

  IF _idempotency_key IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.cierre_eventos ev
      WHERE ev.cliente_id = _cliente_id AND ev.periodo = _periodo
        AND ev.evento = 'reapertura' AND ev.idempotency_key = _idempotency_key) THEN
    RETURN;
  END IF;

  FOREACH _e IN ARRAY _etapas LOOP
    SELECT * INTO _fila FROM public.cierre_etapas
      WHERE cliente_id = _cliente_id AND periodo = _periodo AND etapa = _e FOR UPDATE;
    IF _fila.id IS NULL THEN CONTINUE; END IF;
    IF _fila.estado NOT IN ('lista','aprobada') THEN CONTINUE; END IF;

    UPDATE public.cierre_etapas SET
      estado = 'reabierta', version = _fila.version + 1, lista_at = NULL,
      aprobada_at = NULL, aprobada_por = NULL, motivo = _motivo, updated_at = now()
    WHERE id = _fila.id;

    INSERT INTO public.cierre_eventos (
      despacho_id, cliente_id, periodo, etapa, evento, estado_anterior, estado_nuevo,
      actor_user_id, proceso, motivo, fuente, referencia_tipo, referencia_id, version, idempotency_key
    ) VALUES (
      _despacho, _cliente_id, _periodo, _e, 'reapertura', _fila.estado, 'reabierta',
      _uid, CASE WHEN _uid IS NULL THEN 'sistema' ELSE 'usuario' END, _motivo, _disparador,
      _referencia_tipo, _referencia_id, _fila.version + 1, _idempotency_key
    ) ON CONFLICT DO NOTHING;

    etapa := _e; estado_anterior := _fila.estado; version := _fila.version + 1;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.cierre_reabrir_cascada(uuid,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_reabrir_cascada(uuid,text,text,text,text,text,text) TO authenticated, service_role;