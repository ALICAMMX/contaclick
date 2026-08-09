CREATE OR REPLACE FUNCTION public.cfdi_registrar_evidencia_sat(
  _cfdi_id uuid,
  _run_id uuid,
  _solicitud_id text,
  _paquete_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfdi public.cfdi_xml%ROWTYPE;
  v_run  public.sat_sync_runs%ROWTYPE;
  v_sol  jsonb;
  v_key  text;
  v_id   uuid;
  v_rol  text := coalesce(auth.role(), current_user);
BEGIN
  IF _cfdi_id IS NULL OR _run_id IS NULL
     OR coalesce(btrim(_solicitud_id),'') = '' OR coalesce(btrim(_paquete_id),'') = '' THEN
    RETURN jsonb_build_object('creada', false, 'duplicada', false, 'rechazada', true, 'motivo', 'PARAMETROS_INCOMPLETOS');
  END IF;

  SELECT * INTO v_cfdi FROM public.cfdi_xml WHERE id = _cfdi_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('creada', false, 'duplicada', false, 'rechazada', true, 'motivo', 'CFDI_INEXISTENTE');
  END IF;

  -- Autorización: sin identidad de usuario sólo el proceso interno puede escribir.
  IF auth.uid() IS NULL THEN
    IF coalesce(v_rol, '') NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
      RAISE EXCEPTION 'No autorizado';
    END IF;
  ELSIF NOT (public.is_member_of(v_cfdi.despacho_id) AND public.has_cliente_access(v_cfdi.cliente_id)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- La corrida debe pertenecer al MISMO despacho y expediente que el CFDI.
  SELECT * INTO v_run FROM public.sat_sync_runs WHERE id = _run_id;
  IF NOT FOUND
     OR v_run.despacho_id IS DISTINCT FROM v_cfdi.despacho_id
     OR v_run.cliente_id  IS DISTINCT FROM v_cfdi.cliente_id THEN
    RETURN jsonb_build_object('creada', false, 'duplicada', false, 'rechazada', true, 'motivo', 'CORRIDA_FUERA_DE_ALCANCE');
  END IF;

  SELECT s INTO v_sol
    FROM jsonb_array_elements(coalesce(v_run.solicitudes, '[]'::jsonb)) s
   WHERE upper(btrim(coalesce(s->>'id_solicitud',''))) = upper(btrim(_solicitud_id))
   LIMIT 1;
  IF v_sol IS NULL THEN
    RETURN jsonb_build_object('creada', false, 'duplicada', false, 'rechazada', true, 'motivo', 'SOLICITUD_NO_PERTENECE_A_CORRIDA');
  END IF;

  IF coalesce(v_sol->>'estado_comprobante','') <> 'Vigente' THEN
    RETURN jsonb_build_object('creada', false, 'duplicada', false, 'rechazada', true, 'motivo', 'ESTADO_COMPROBANTE_NO_VIGENTE');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(coalesce(v_sol->'paquetes_procesados','[]'::jsonb)) p
     WHERE upper(btrim(p)) = upper(btrim(_paquete_id))
  ) THEN
    RETURN jsonb_build_object('creada', false, 'duplicada', false, 'rechazada', true, 'motivo', 'PAQUETE_NO_PROCESADO');
  END IF;

  v_key := _cfdi_id::text || ':' || _run_id::text || ':'
           || upper(btrim(_solicitud_id)) || ':' || upper(btrim(_paquete_id));

  INSERT INTO public.cfdi_sat_evidencias (
    despacho_id, cliente_id, cfdi_id, run_id, solicitud_id, paquete_id,
    estado_comprobante, estatus_derivado, fuente, proveedor, idempotency_key
  ) VALUES (
    v_cfdi.despacho_id, v_cfdi.cliente_id, _cfdi_id, _run_id,
    upper(btrim(_solicitud_id)), upper(btrim(_paquete_id)),
    'Vigente', 'vigente', 'descarga_masiva_sat', v_run.proveedor, v_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  -- Proyección en la MISMA transacción, tanto al crear como al reencontrar la
  -- evidencia (idempotencia reparadora). Nunca degrada un cancelado posterior.
  UPDATE public.cfdi_xml
     SET estatus_sat = 'vigente',
         estatus_sat_fuente = 'descarga_masiva_sat',
         estatus_sat_evidencia_at = coalesce(estatus_sat_evidencia_at, now()),
         sat_run_id = coalesce(sat_run_id, _run_id),
         sat_solicitud_id = coalesce(sat_solicitud_id, upper(btrim(_solicitud_id))),
         sat_paquete_id = coalesce(sat_paquete_id, upper(btrim(_paquete_id)))
   WHERE id = _cfdi_id AND coalesce(estatus_sat,'desconocido') <> 'cancelado';

  IF v_id IS NULL THEN
    SELECT e.id INTO v_id FROM public.cfdi_sat_evidencias e WHERE e.idempotency_key = v_key;
    RETURN jsonb_build_object('creada', false, 'duplicada', true, 'rechazada', false,
                              'evidencia_id', v_id, 'estatus', 'vigente');
  END IF;

  RETURN jsonb_build_object('creada', true, 'duplicada', false, 'rechazada', false,
                            'evidencia_id', v_id, 'estatus', 'vigente');
END; $$;

REVOKE ALL ON FUNCTION public.cfdi_registrar_evidencia_sat(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cfdi_registrar_evidencia_sat(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cfdi_registrar_evidencia_sat(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cfdi_registrar_evidencia_sat(uuid, uuid, text, text) TO service_role;