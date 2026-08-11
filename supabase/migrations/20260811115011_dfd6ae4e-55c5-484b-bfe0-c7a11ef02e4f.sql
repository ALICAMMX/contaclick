CREATE OR REPLACE FUNCTION public.cierre_decision_evidencia_suficiente(_cfdi_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(c.estatus_sat,'desconocido') = 'vigente'
     AND coalesce(c.detalle_reconstruible,false) = true
     AND coalesce(c.normalizacion_version,'') <> 'recuperado_desde_encabezado@1'
  FROM public.cfdi_xml c WHERE c.id = _cfdi_id;
$$;

GRANT EXECUTE ON FUNCTION public.cierre_decision_evidencia_suficiente(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cierre_registrar_decision_fiscal(_cliente_id uuid, _cfdi_id uuid, _decision text, _porcentaje numeric DEFAULT NULL::numeric, _motivo text DEFAULT NULL::text, _fundamento text DEFAULT NULL::text, _sugerencia_ia jsonb DEFAULT NULL::jsonb, _origen text DEFAULT 'humano'::text, _regla_id text DEFAULT NULL::text, _regla_version text DEFAULT NULL::text, _porcentaje_iva numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_evidencia boolean;
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

  SELECT c.id, c.uuid, c.periodo, c.cliente_id, c.despacho_id, c.estatus_sat, c.direccion,
         c.detalle_reconstruible, c.normalizacion_version
    INTO v_cfdi
  FROM public.cfdi_xml c WHERE c.id = _cfdi_id AND c.cliente_id = _cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El comprobante no pertenece al expediente.'; END IF;
  IF v_cfdi.periodo IS NULL THEN RAISE EXCEPTION 'El comprobante no tiene periodo normalizado.'; END IF;
  v_despacho := v_cfdi.despacho_id;
  v_periodo := v_cfdi.periodo;

  -- Frontera real: deshabilitar el botón en la interfaz no es un control.
  v_evidencia := coalesce(v_cfdi.estatus_sat,'desconocido') = 'vigente'
             AND coalesce(v_cfdi.detalle_reconstruible,false) = true
             AND coalesce(v_cfdi.normalizacion_version,'') <> 'recuperado_desde_encabezado@1';

  IF _decision IN ('deducible','parcial') AND NOT v_evidencia THEN
    RAISE EXCEPTION 'Evidencia insuficiente: sin estatus SAT vigente y XML original el comprobante sólo puede quedar "por revisar" o marcarse no deducible.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_cliente_id::text||':'||v_periodo, 0));

  v_pct := coalesce(_porcentaje, CASE WHEN _decision = 'deducible' THEN 100 ELSE 0 END);
  IF _decision = 'deducible' THEN
    v_pct := 100;
    IF v_fund IS NULL THEN RAISE EXCEPTION 'Una deducción exige fundamento.'; END IF;
    v_pct_iva := coalesce(_porcentaje_iva, 100);
  ELSIF _decision = 'parcial' THEN
    IF NOT (v_pct > 0 AND v_pct < 100) THEN RAISE EXCEPTION 'El porcentaje parcial debe estar entre 1 y 99.'; END IF;
    IF length(coalesce(v_motivo,'')) < 10 THEN RAISE EXCEPTION 'La deducción parcial exige un motivo de al menos 10 caracteres.'; END IF;
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
     motivo, fundamento, sugerencia_ia, origen, regla_id, regla_version, input_hash,
     version, historial_id, decidida_por, decidida_at)
  VALUES (v_despacho, _cliente_id, _cfdi_id, v_periodo, _decision, v_pct, v_pct_iva,
     v_motivo, v_fund, _sugerencia_ia, _origen, _regla_id, _regla_version, v_hash,
     v_ver, v_hist.id, v_uid, now())
  ON CONFLICT (cfdi_id) DO UPDATE SET
     decision = excluded.decision,
     porcentaje_deducible = excluded.porcentaje_deducible,
     porcentaje_acreditable_iva = excluded.porcentaje_acreditable_iva,
     motivo = excluded.motivo,
     fundamento = excluded.fundamento,
     sugerencia_ia = excluded.sugerencia_ia,
     origen = excluded.origen,
     regla_id = excluded.regla_id,
     regla_version = excluded.regla_version,
     input_hash = excluded.input_hash,
     version = excluded.version,
     historial_id = excluded.historial_id,
     decidida_por = excluded.decidida_por,
     decidida_at = excluded.decidida_at
  RETURNING * INTO v_vigente;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotente', false,
    'decision', to_jsonb(v_vigente),
    'historial', to_jsonb(v_hist),
    'reabiertas', coalesce((
      SELECT jsonb_agg(jsonb_build_object('etapa', r.etapa, 'estado_anterior', r.estado_anterior, 'version', r.version))
      FROM public.cierre_reabrir_cascada(_cliente_id, v_periodo, 'decision_fiscal',
        'Decisión fiscal registrada o corregida', 'cfdi', _cfdi_id::text,
        'decision:'||_cfdi_id::text||':'||v_ver::text) r
    ), '[]'::jsonb)
  );
END;
$function$;