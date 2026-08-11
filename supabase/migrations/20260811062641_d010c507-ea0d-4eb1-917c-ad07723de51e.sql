-- ═══════════════════════════════════════════════════════════════════════════
-- A. CERRAR BYPASS DE ESCRITURA
-- ═══════════════════════════════════════════════════════════════════════════
REVOKE ALL ON public.cierre_etapas, public.cierre_eventos, public.cierre_snapshots,
  public.cierre_reaperturas, public.cfdi_decisiones_fiscales FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.cierre_etapas, public.cierre_eventos, public.cierre_snapshots,
     public.cierre_reaperturas, public.cfdi_decisiones_fiscales FROM authenticated;
GRANT SELECT ON public.cierre_etapas, public.cierre_eventos, public.cierre_snapshots,
  public.cierre_reaperturas, public.cfdi_decisiones_fiscales TO authenticated;

DROP POLICY IF EXISTS etapas_insert_miembros ON public.cierre_etapas;
DROP POLICY IF EXISTS etapas_update_miembros ON public.cierre_etapas;
DROP POLICY IF EXISTS eventos_insert_miembros ON public.cierre_eventos;
DROP POLICY IF EXISTS snapshots_insert_miembros ON public.cierre_snapshots;
DROP POLICY IF EXISTS "reaperturas se registran en el expediente" ON public.cierre_reaperturas;
DROP POLICY IF EXISTS decisiones_insert_miembros ON public.cfdi_decisiones_fiscales;
DROP POLICY IF EXISTS decisiones_update_miembros ON public.cfdi_decisiones_fiscales;

-- El RPC genérico deja de estar expuesto: pasa a ser interno.
REVOKE ALL ON FUNCTION public.cierre_etapa_transicion(uuid,text,text,text,text,numeric,jsonb,jsonb,text,text,jsonb,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cierre_reabrir_cascada(uuid,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cierre_sellar(uuid,text,text,jsonb,jsonb,text,text) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- B. HISTORIAL INMUTABLE Y VERSIONADO DE DECISIONES FISCALES
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cfdi_decisiones_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  cfdi_id uuid NOT NULL,
  periodo text NOT NULL,
  version integer NOT NULL,
  decision text NOT NULL CHECK (decision IN ('deducible','no_deducible','parcial','por_revisar')),
  porcentaje_deducible numeric NOT NULL DEFAULT 0 CHECK (porcentaje_deducible >= 0 AND porcentaje_deducible <= 100),
  motivo text,
  fundamento text,
  sugerencia_ia jsonb,
  origen text NOT NULL DEFAULT 'humano' CHECK (origen IN ('humano','regla')),
  regla_id text,
  regla_version text,
  input_hash text NOT NULL,
  decidida_por uuid,
  decidida_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cfdi_id, version)
);
CREATE INDEX IF NOT EXISTS idx_dec_hist_periodo ON public.cfdi_decisiones_historial (cliente_id, periodo);

GRANT SELECT ON public.cfdi_decisiones_historial TO authenticated;
GRANT ALL ON public.cfdi_decisiones_historial TO service_role;
ALTER TABLE public.cfdi_decisiones_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY dec_hist_select ON public.cfdi_decisiones_historial
  FOR SELECT TO authenticated USING (public.has_cliente_access(cliente_id));

CREATE OR REPLACE FUNCTION public.cfdi_decisiones_historial_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'El historial de decisiones fiscales es inmutable (% rechazado).', TG_OP;
END; $$;
DROP TRIGGER IF EXISTS trg_dec_hist_inmutable ON public.cfdi_decisiones_historial;
CREATE TRIGGER trg_dec_hist_inmutable BEFORE UPDATE OR DELETE ON public.cfdi_decisiones_historial
  FOR EACH ROW EXECUTE FUNCTION public.cfdi_decisiones_historial_inmutable();

-- Migración de las decisiones existentes como versión histórica inicial.
INSERT INTO public.cfdi_decisiones_historial
  (despacho_id, cliente_id, cfdi_id, periodo, version, decision, porcentaje_deducible,
   motivo, fundamento, sugerencia_ia, origen, input_hash, decidida_por, decidida_at, created_at)
SELECT d.despacho_id, d.cliente_id, d.cfdi_id, d.periodo, 1, d.decision, d.porcentaje_deducible,
       d.motivo, d.fundamento, d.sugerencia_ia,
       CASE WHEN d.origen IN ('humano','regla') THEN d.origen ELSE 'humano' END,
       encode(sha256(convert_to(
         d.cfdi_id::text||'|'||d.decision||'|'||d.porcentaje_deducible::text||'|migracion','UTF8')),'hex'),
       d.decidida_por, d.decidida_at, d.created_at
FROM public.cfdi_decisiones_fiscales d
ON CONFLICT (cfdi_id, version) DO NOTHING;

ALTER TABLE public.cfdi_decisiones_fiscales ADD COLUMN IF NOT EXISTS historial_id uuid;
ALTER TABLE public.cfdi_decisiones_fiscales ADD COLUMN IF NOT EXISTS input_hash text;
UPDATE public.cfdi_decisiones_fiscales d
SET historial_id = h.id, input_hash = h.input_hash
FROM public.cfdi_decisiones_historial h
WHERE h.cfdi_id = d.cfdi_id AND h.version = 1 AND d.historial_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC de negocio: registrar decisión fiscal (atómico e idempotente)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cierre_registrar_decision_fiscal(
  _cliente_id uuid,
  _cfdi_id uuid,
  _decision text,
  _porcentaje numeric DEFAULT NULL,
  _motivo text DEFAULT NULL,
  _fundamento text DEFAULT NULL,
  _sugerencia_ia jsonb DEFAULT NULL,
  _origen text DEFAULT 'humano',
  _regla_id text DEFAULT NULL,
  _regla_version text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cfdi record;
  v_despacho uuid;
  v_periodo text;
  v_pct numeric;
  v_motivo text := nullif(btrim(coalesce(_motivo,'')),'');
  v_fund text := nullif(btrim(coalesce(_fundamento,'')),'');
  v_ver integer;
  v_hash text;
  v_hist public.cfdi_decisiones_historial;
  v_vigente public.cfdi_decisiones_fiscales;
BEGIN
  IF v_uid IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada.';
  END IF;
  IF NOT public.has_cliente_access(_cliente_id) THEN
    RAISE EXCEPTION 'Sin acceso al expediente.';
  END IF;
  IF _origen NOT IN ('humano','regla') THEN
    RAISE EXCEPTION 'La IA nunca es decisor: origen debe ser humano o regla determinista.';
  END IF;
  IF _origen = 'regla' AND (_regla_id IS NULL OR _regla_version IS NULL) THEN
    RAISE EXCEPTION 'Una decisión por regla exige regla identificada y versionada.';
  END IF;

  -- Expediente y periodo se resuelven desde la base, nunca desde el payload.
  SELECT c.id, c.uuid, c.periodo, c.cliente_id, c.despacho_id, c.estatus_sat, c.direccion
    INTO v_cfdi
  FROM public.cfdi_xml c WHERE c.id = _cfdi_id AND c.cliente_id = _cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El comprobante no pertenece al expediente.'; END IF;
  IF v_cfdi.periodo IS NULL THEN RAISE EXCEPTION 'El comprobante no tiene periodo normalizado.'; END IF;
  v_despacho := v_cfdi.despacho_id;
  v_periodo := v_cfdi.periodo;

  PERFORM pg_advisory_xact_lock(hashtextextended(_cliente_id::text||':'||v_periodo, 0));

  -- Validación de la decisión (misma regla que el cliente, aplicada en la base).
  v_pct := coalesce(_porcentaje, CASE WHEN _decision = 'deducible' THEN 100 ELSE 0 END);
  IF _decision = 'deducible' THEN
    v_pct := 100;
    IF v_fund IS NULL THEN RAISE EXCEPTION 'Una deducción exige fundamento.'; END IF;
  ELSIF _decision = 'parcial' THEN
    IF NOT (v_pct > 0 AND v_pct < 100) THEN RAISE EXCEPTION 'El porcentaje parcial debe estar entre 1 y 99.'; END IF;
    IF length(coalesce(v_motivo,'')) < 10 THEN RAISE EXCEPTION 'La deducción parcial exige un motivo de al menos 10 caracteres.'; END IF;
  ELSIF _decision = 'no_deducible' THEN
    v_pct := 0;
    IF length(coalesce(v_motivo,'')) < 10 THEN RAISE EXCEPTION 'Rechazar la deducción exige un motivo de al menos 10 caracteres.'; END IF;
  ELSIF _decision = 'por_revisar' THEN
    v_pct := 0;
  ELSE
    RAISE EXCEPTION 'Decisión no reconocida: %', _decision;
  END IF;

  IF coalesce(v_cfdi.estatus_sat,'desconocido') <> 'vigente'
     AND _decision NOT IN ('por_revisar','no_deducible') THEN
    RAISE EXCEPTION 'Sin evidencia SAT vigente sólo procede “por revisar” o “no deducible”.';
  END IF;

  v_hash := encode(sha256(convert_to(
    _cfdi_id::text||'|'||_decision||'|'||v_pct::text||'|'||coalesce(v_motivo,'')||'|'||
    coalesce(v_fund,'')||'|'||_origen||'|'||coalesce(_regla_version,''), 'UTF8')), 'hex');

  -- Idempotencia: la misma decisión sobre el mismo CFDI no genera versión nueva.
  SELECT * INTO v_vigente FROM public.cfdi_decisiones_fiscales WHERE cfdi_id = _cfdi_id;
  IF FOUND AND v_vigente.input_hash = v_hash THEN
    SELECT * INTO v_hist FROM public.cfdi_decisiones_historial WHERE id = v_vigente.historial_id;
    RETURN jsonb_build_object('ok', true, 'idempotente', true,
      'decision', to_jsonb(v_vigente), 'historial', to_jsonb(v_hist), 'reabiertas', '[]'::jsonb);
  END IF;

  SELECT coalesce(max(version),0) + 1 INTO v_ver
  FROM public.cfdi_decisiones_historial WHERE cfdi_id = _cfdi_id;

  INSERT INTO public.cfdi_decisiones_historial
    (despacho_id, cliente_id, cfdi_id, periodo, version, decision, porcentaje_deducible,
     motivo, fundamento, sugerencia_ia, origen, regla_id, regla_version, input_hash, decidida_por)
  VALUES (v_despacho, _cliente_id, _cfdi_id, v_periodo, v_ver, _decision, v_pct,
     v_motivo, v_fund, _sugerencia_ia, _origen, _regla_id, _regla_version, v_hash, v_uid)
  RETURNING * INTO v_hist;

  INSERT INTO public.cfdi_decisiones_fiscales
    (despacho_id, cliente_id, cfdi_id, periodo, decision, porcentaje_deducible, motivo,
     fundamento, sugerencia_ia, origen, decidida_por, decidida_at, version, historial_id, input_hash)
  VALUES (v_despacho, _cliente_id, _cfdi_id, v_periodo, _decision, v_pct, v_motivo,
     v_fund, _sugerencia_ia, _origen, v_uid, now(), v_ver, v_hist.id, v_hash)
  ON CONFLICT (cfdi_id) DO UPDATE SET
    decision = EXCLUDED.decision, porcentaje_deducible = EXCLUDED.porcentaje_deducible,
    motivo = EXCLUDED.motivo, fundamento = EXCLUDED.fundamento,
    sugerencia_ia = EXCLUDED.sugerencia_ia, origen = EXCLUDED.origen,
    decidida_por = EXCLUDED.decidida_por, decidida_at = EXCLUDED.decidida_at,
    version = EXCLUDED.version, historial_id = EXCLUDED.historial_id,
    input_hash = EXCLUDED.input_hash, updated_at = now()
  RETURNING * INTO v_vigente;

  -- Reapertura en cascada dentro de la MISMA transacción: si falla, revierte todo.
  RETURN jsonb_build_object(
    'ok', true, 'idempotente', false,
    'decision', to_jsonb(v_vigente), 'historial', to_jsonb(v_hist),
    'reabiertas', coalesce((
      SELECT jsonb_agg(to_jsonb(r)) FROM public.cierre_reabrir_cascada(
        _cliente_id, v_periodo, 'clasificacion',
        'Decisión fiscal v'||v_ver||' registrada en el comprobante '||v_cfdi.uuid,
        'cfdi', v_cfdi.uuid, 'decision:'||_cfdi_id::text||':'||v_ver::text) r), '[]'::jsonb));
END; $$;

REVOKE ALL ON FUNCTION public.cierre_registrar_decision_fiscal(uuid,uuid,text,numeric,text,text,jsonb,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_registrar_decision_fiscal(uuid,uuid,text,numeric,text,text,jsonb,text,text,text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Evaluador de CLASIFICACIÓN dentro de la base: "lista" no puede fabricarse.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cierre_evaluar_clasificacion(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total int; v_decididos int; v_por_revisar int; v_sin int; v_inconsistentes int;
  v_monto numeric; v_cobertura numeric; v_listo boolean; v_estado text;
  v_cumplidos jsonb := '[]'::jsonb; v_pendientes jsonb := '[]'::jsonb;
  v_hash text; v_etapa public.cierre_etapas;
BEGIN
  IF auth.uid() IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada.';
  END IF;
  IF NOT public.has_cliente_access(_cliente_id) THEN RAISE EXCEPTION 'Sin acceso al expediente.'; END IF;
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_cliente_id::text||':'||_periodo, 0));

  SELECT
    count(*)::int,
    count(*) FILTER (WHERE d.cfdi_id IS NULL)::int,
    count(*) FILTER (WHERE d.decision = 'por_revisar')::int,
    count(*) FILTER (WHERE d.decision IS NOT NULL AND d.decision <> 'por_revisar'
      AND coalesce(c.estatus_sat,'desconocido') <> 'vigente' AND d.decision <> 'no_deducible')::int,
    count(*) FILTER (WHERE d.decision IS NOT NULL AND d.decision <> 'por_revisar'
      AND NOT (coalesce(c.estatus_sat,'desconocido') <> 'vigente' AND d.decision <> 'no_deducible'))::int,
    coalesce(sum(coalesce(c.total,0) * coalesce(d.porcentaje_deducible,0) / 100)
      FILTER (WHERE d.decision IS NOT NULL AND d.decision <> 'por_revisar'
        AND NOT (coalesce(c.estatus_sat,'desconocido') <> 'vigente' AND d.decision <> 'no_deducible')), 0)
  INTO v_total, v_sin, v_por_revisar, v_inconsistentes, v_decididos, v_monto
  FROM public.cfdi_xml c
  LEFT JOIN public.cfdi_decisiones_fiscales d ON d.cfdi_id = c.id
  WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo AND c.direccion = 'recibido';

  v_cobertura := CASE WHEN v_total = 0 THEN 0 ELSE round((v_decididos::numeric / v_total) * 100, 2) END;
  v_listo := v_total > 0 AND v_decididos = v_total AND v_inconsistentes = 0;
  v_estado := CASE WHEN v_listo THEN 'lista' WHEN v_decididos > 0 OR v_por_revisar > 0 THEN 'en_proceso' ELSE 'no_iniciada' END;

  IF v_total = 0 THEN
    v_pendientes := v_pendientes || to_jsonb('No hay comprobantes recibidos cargados en el periodo'::text);
  ELSIF v_sin = 0 THEN
    v_cumplidos := v_cumplidos || to_jsonb(('Decisión fiscal registrada en '||v_total||' de '||v_total||' comprobantes')::text);
  ELSE
    v_pendientes := v_pendientes || to_jsonb((v_sin||' comprobantes sin decisión fiscal de '||v_total)::text);
  END IF;
  IF v_por_revisar = 0 THEN
    v_cumplidos := v_cumplidos || to_jsonb('Sin comprobantes en “por revisar”'::text);
  ELSE
    v_pendientes := v_pendientes || to_jsonb((v_por_revisar||' comprobantes siguen “por revisar”')::text);
  END IF;
  IF v_inconsistentes = 0 THEN
    v_cumplidos := v_cumplidos || to_jsonb('Ninguna decisión contradice la evidencia SAT'::text);
  ELSE
    v_pendientes := v_pendientes || to_jsonb((v_inconsistentes||' decisiones sobre comprobantes sin evidencia SAT vigente')::text);
  END IF;

  v_hash := encode(sha256(convert_to(coalesce((
    SELECT string_agg(c.id::text||':'||coalesce(d.input_hash,'-'), ',' ORDER BY c.id)
    FROM public.cfdi_xml c LEFT JOIN public.cfdi_decisiones_fiscales d ON d.cfdi_id = c.id
    WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo AND c.direccion = 'recibido'), ''), 'UTF8')), 'hex');

  v_etapa := public.cierre_etapa_transicion(
    _cliente_id, _periodo, 'clasificacion', v_estado, NULL, v_cobertura,
    v_cumplidos, v_pendientes, v_hash, 'evaluador-clasificacion@2',
    jsonb_build_object('total', v_total, 'decididos', v_decididos, 'por_revisar', v_por_revisar,
      'sin_decision', v_sin, 'inconsistentes', v_inconsistentes,
      'monto_deducible', round(v_monto, 2)),
    'eval:clasificacion:'||v_hash, 'evaluador');

  RETURN jsonb_build_object('estado', v_estado, 'cobertura', v_cobertura, 'listo', v_listo,
    'total', v_total, 'decididos', v_decididos, 'por_revisar', v_por_revisar,
    'sin_decision', v_sin, 'inconsistentes', v_inconsistentes,
    'monto_deducible', round(v_monto, 2), 'input_hash', v_hash,
    'criterios_cumplidos', v_cumplidos, 'criterios_pendientes', v_pendientes,
    'etapa', to_jsonb(v_etapa));
END; $$;

REVOKE ALL ON FUNCTION public.cierre_evaluar_clasificacion(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_evaluar_clasificacion(uuid,text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC de negocio: "no aplica" (sólo etapas autorizadas, con motivo y actor)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cierre_marcar_no_aplica(
  _cliente_id uuid, _periodo text, _etapa text, _motivo text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_etapa public.cierre_etapas;
BEGIN
  IF auth.uid() IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada.';
  END IF;
  IF NOT public.has_cliente_access(_cliente_id) THEN RAISE EXCEPTION 'Sin acceso al expediente.'; END IF;
  IF _etapa NOT IN ('bancos','polizas') THEN
    RAISE EXCEPTION 'La etapa “%” no admite “no aplica”.', _etapa;
  END IF;
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN
    RAISE EXCEPTION 'Marcar “no aplica” exige un motivo de al menos 10 caracteres.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_cliente_id::text||':'||_periodo, 0));
  v_etapa := public.cierre_etapa_transicion(
    _cliente_id, _periodo, _etapa, 'no_aplica', btrim(_motivo), NULL, NULL, NULL, NULL,
    'no-aplica@1', jsonb_build_object('actor', auth.uid()),
    'no_aplica:'||_etapa||':'||_periodo, 'ui');
  RETURN to_jsonb(v_etapa);
END; $$;
REVOKE ALL ON FUNCTION public.cierre_marcar_no_aplica(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_marcar_no_aplica(uuid,text,text,text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC de negocio: reapertura por mutación real
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cierre_reabrir(
  _cliente_id uuid, _periodo text, _disparador text, _motivo text,
  _referencia_tipo text DEFAULT NULL, _referencia_id text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada.';
  END IF;
  IF NOT public.has_cliente_access(_cliente_id) THEN RAISE EXCEPTION 'Sin acceso al expediente.'; END IF;
  IF _disparador NOT IN ('cfdi','clasificacion','banco','poliza','parametro_fiscal') THEN
    RAISE EXCEPTION 'Disparador no reconocido: %', _disparador;
  END IF;
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN
    RAISE EXCEPTION 'La reapertura exige un motivo de al menos 10 caracteres.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_cliente_id::text||':'||_periodo, 0));
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.cierre_reabrir_cascada(
    _cliente_id, _periodo, _disparador, btrim(_motivo),
    _referencia_tipo, _referencia_id, _idempotency_key) r), '[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.cierre_reabrir(uuid,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_reabrir(uuid,text,text,text,text,text,text) TO authenticated, service_role;