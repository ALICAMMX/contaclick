DROP FUNCTION IF EXISTS public.cierre_registrar_decision_fiscal(uuid, uuid, text, numeric, text, text, jsonb, text, text, text);

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
  _regla_version text DEFAULT NULL,
  _porcentaje_iva numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_cfdi record;
  v_despacho uuid;
  v_periodo text;
  v_pct numeric;
  v_pct_iva numeric;
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

  SELECT c.id, c.uuid, c.periodo, c.cliente_id, c.despacho_id, c.estatus_sat, c.direccion
    INTO v_cfdi
  FROM public.cfdi_xml c WHERE c.id = _cfdi_id AND c.cliente_id = _cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El comprobante no pertenece al expediente.'; END IF;
  IF v_cfdi.periodo IS NULL THEN RAISE EXCEPTION 'El comprobante no tiene periodo normalizado.'; END IF;
  v_despacho := v_cfdi.despacho_id;
  v_periodo := v_cfdi.periodo;

  PERFORM pg_advisory_xact_lock(hashtextextended(_cliente_id::text||':'||v_periodo, 0));

  v_pct := coalesce(_porcentaje, CASE WHEN _decision = 'deducible' THEN 100 ELSE 0 END);
  IF _decision = 'deducible' THEN
    v_pct := 100;
    IF v_fund IS NULL THEN RAISE EXCEPTION 'Una deducción exige fundamento.'; END IF;
    v_pct_iva := coalesce(_porcentaje_iva, 100);
  ELSIF _decision = 'parcial' THEN
    IF NOT (v_pct > 0 AND v_pct < 100) THEN RAISE EXCEPTION 'El porcentaje parcial debe estar entre 1 y 99.'; END IF;
    IF length(coalesce(v_motivo,'')) < 10 THEN RAISE EXCEPTION 'La deducción parcial exige un motivo de al menos 10 caracteres.'; END IF;
    -- El porcentaje de ISR NO se aplica automáticamente al IVA: exige regla propia.
    IF _porcentaje_iva IS NULL THEN
      RAISE EXCEPTION 'Una deducción parcial exige el porcentaje propio de acreditamiento de IVA.';
    END IF;
    IF NOT (_porcentaje_iva >= 0 AND _porcentaje_iva <= 100) THEN
      RAISE EXCEPTION 'El porcentaje de acreditamiento de IVA debe estar entre 0 y 100.';
    END IF;
    v_pct_iva := _porcentaje_iva;
  ELSIF _decision = 'no_deducible' THEN
    v_pct := 0;
    IF length(coalesce(v_motivo,'')) < 10 THEN RAISE EXCEPTION 'Rechazar la deducción exige un motivo de al menos 10 caracteres.'; END IF;
    v_pct_iva := coalesce(_porcentaje_iva, 0);
  ELSIF _decision = 'por_revisar' THEN
    v_pct := 0;
    v_pct_iva := _porcentaje_iva;
  ELSE
    RAISE EXCEPTION 'Decisión no reconocida: %', _decision;
  END IF;

  v_hash := encode(sha256(convert_to(
    _cfdi_id::text||'|'||_decision||'|'||v_pct::text||'|'||coalesce(v_pct_iva::text,'')||'|'||
    coalesce(v_motivo,'')||'|'||coalesce(v_fund,'')||'|'||_origen||'|'||coalesce(_regla_version,''), 'UTF8')), 'hex');

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
    (despacho_id, cliente_id, cfdi_id, periodo, decision, porcentaje_deducible, porcentaje_acreditable_iva,
     motivo, fundamento, sugerencia_ia, origen, decidida_por, decidida_at, version, historial_id, input_hash)
  VALUES (v_despacho, _cliente_id, _cfdi_id, v_periodo, _decision, v_pct, v_pct_iva, v_motivo,
     v_fund, _sugerencia_ia, _origen, v_uid, now(), v_ver, v_hist.id, v_hash)
  ON CONFLICT (cfdi_id) DO UPDATE SET
    decision = EXCLUDED.decision, porcentaje_deducible = EXCLUDED.porcentaje_deducible,
    porcentaje_acreditable_iva = EXCLUDED.porcentaje_acreditable_iva,
    motivo = EXCLUDED.motivo, fundamento = EXCLUDED.fundamento,
    sugerencia_ia = EXCLUDED.sugerencia_ia, origen = EXCLUDED.origen,
    decidida_por = EXCLUDED.decidida_por, decidida_at = EXCLUDED.decidida_at,
    version = EXCLUDED.version, historial_id = EXCLUDED.historial_id,
    input_hash = EXCLUDED.input_hash, updated_at = now()
  RETURNING * INTO v_vigente;

  RETURN jsonb_build_object(
    'ok', true, 'idempotente', false,
    'decision', to_jsonb(v_vigente), 'historial', to_jsonb(v_hist),
    'reabiertas', coalesce((
      SELECT jsonb_agg(to_jsonb(r)) FROM public.cierre_reabrir_cascada(
        _cliente_id, v_periodo, 'clasificacion',
        'Decisión fiscal v'||v_ver||' registrada en el comprobante '||v_cfdi.uuid,
        'cfdi', v_cfdi.uuid, 'decision:'||_cfdi_id::text||':'||v_ver::text) r), '[]'::jsonb));
END;
$fn$;

REVOKE ALL ON FUNCTION public.cierre_registrar_decision_fiscal(uuid, uuid, text, numeric, text, text, jsonb, text, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_registrar_decision_fiscal(uuid, uuid, text, numeric, text, text, jsonb, text, text, text, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cierre_diag_clasificacion(_cliente_id uuid, _periodo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_total bigint; v_sin_dec bigint; v_sin_sat bigint; v_cob numeric;
  v_estado text; v_hash text; v_pend jsonb := '[]'::jsonb; v_cump jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;

  SELECT count(*) FILTER (WHERE c.direccion = 'recibido'),
         count(*) FILTER (WHERE c.direccion = 'recibido' AND NOT EXISTS (
            SELECT 1 FROM public.cfdi_decisiones_fiscales d WHERE d.cfdi_id = c.id)),
         -- Un comprobante CANCELADO sí tiene estatus confirmado ante el SAT:
         -- sólo se cuentan los que realmente se desconocen.
         count(*) FILTER (WHERE lower(coalesce(c.estatus_sat,'desconocido')) NOT IN ('vigente','cancelado'))
    INTO v_total, v_sin_dec, v_sin_sat
  FROM public.cfdi_xml c WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo;

  v_cob := CASE WHEN v_total = 0 THEN 0 ELSE round((v_total - v_sin_dec) * 100.0 / v_total, 2) END;

  IF v_total = 0 THEN
    v_estado := 'no_iniciada';
    v_pend := v_pend || jsonb_build_object('codigo','sin_recibidos','detalle','No hay comprobantes recibidos que clasificar.');
  ELSE
    IF v_sin_dec > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','decisiones_faltantes','detalle', v_sin_dec||' comprobantes recibidos sin decisión de deducibilidad.');
    ELSE
      v_cump := v_cump || jsonb_build_object('codigo','decisiones_completas','detalle','Los '||v_total||' comprobantes recibidos tienen decisión humana.');
    END IF;
    IF v_sin_sat > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','estatus_sat_incompleto','detalle', v_sin_sat||' comprobantes sin estatus SAT confirmado.');
    END IF;
    v_estado := CASE WHEN jsonb_array_length(v_pend) = 0 THEN 'lista' ELSE 'en_proceso' END;
  END IF;

  v_hash := public.cierre_hash_jsonb(coalesce((
    SELECT jsonb_agg(jsonb_build_object('c',c.id,'s',coalesce(c.estatus_sat,'desconocido'),
      'd',(SELECT d.decision||':'||coalesce(d.porcentaje_deducible,100)::text
             FROM public.cfdi_decisiones_fiscales d WHERE d.cfdi_id = c.id)) ORDER BY c.id)
    FROM public.cfdi_xml c WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo),'[]'::jsonb));

  RETURN jsonb_build_object('etapa','clasificacion','estado',v_estado,'cobertura',v_cob,
    'input_hash',v_hash,'evaluador_version','clasificacion@2',
    'criterios_cumplidos',v_cump,'criterios_pendientes',v_pend,
    'resultado', jsonb_build_object('recibidos',v_total,'sin_decision',v_sin_dec,'sin_estatus_sat',v_sin_sat));
END;
$fn$;