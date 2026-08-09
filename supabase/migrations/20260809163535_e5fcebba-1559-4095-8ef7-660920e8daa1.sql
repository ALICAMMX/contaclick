-- =====================================================================
-- 1) BITÁCORA INMUTABLE DE EVIDENCIA SAT
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.cfdi_sat_evidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  cfdi_id uuid NOT NULL REFERENCES public.cfdi_xml(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.sat_sync_runs(id) ON DELETE CASCADE,
  solicitud_id text NOT NULL,
  paquete_id text NOT NULL,
  estado_comprobante text NOT NULL,
  estatus_derivado text NOT NULL,
  fuente text NOT NULL DEFAULT 'descarga_masiva_sat',
  proveedor text,
  observada_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cfdi_sat_evidencias_fuente_chk CHECK (fuente = 'descarga_masiva_sat'),
  CONSTRAINT cfdi_sat_evidencias_estado_chk CHECK (estado_comprobante = 'Vigente'),
  CONSTRAINT cfdi_sat_evidencias_estatus_chk CHECK (estatus_derivado = 'vigente')
);

CREATE UNIQUE INDEX IF NOT EXISTS cfdi_sat_evidencias_idem_uidx
  ON public.cfdi_sat_evidencias (idempotency_key);
CREATE INDEX IF NOT EXISTS cfdi_sat_evidencias_cfdi_idx
  ON public.cfdi_sat_evidencias (cfdi_id);

-- Permisos: lectura por expediente; escritura únicamente por el proceso interno.
REVOKE ALL ON public.cfdi_sat_evidencias FROM PUBLIC;
REVOKE ALL ON public.cfdi_sat_evidencias FROM anon;
REVOKE ALL ON public.cfdi_sat_evidencias FROM authenticated;
GRANT SELECT ON public.cfdi_sat_evidencias TO authenticated;
GRANT ALL ON public.cfdi_sat_evidencias TO service_role;

ALTER TABLE public.cfdi_sat_evidencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cfdi_sat_evidencias lectura por expediente" ON public.cfdi_sat_evidencias;
CREATE POLICY "cfdi_sat_evidencias lectura por expediente"
  ON public.cfdi_sat_evidencias FOR SELECT TO authenticated
  USING (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id));

-- Inmutabilidad dura: ni UPDATE ni DELETE, para nadie (incluye service_role).
CREATE OR REPLACE FUNCTION public.cfdi_sat_evidencias_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora de evidencia SAT es inmutable: no admite %', TG_OP;
END; $$;

DROP TRIGGER IF EXISTS cfdi_sat_evidencias_no_update ON public.cfdi_sat_evidencias;
CREATE TRIGGER cfdi_sat_evidencias_no_update
  BEFORE UPDATE ON public.cfdi_sat_evidencias
  FOR EACH ROW EXECUTE FUNCTION public.cfdi_sat_evidencias_inmutable();

DROP TRIGGER IF EXISTS cfdi_sat_evidencias_no_delete ON public.cfdi_sat_evidencias;
CREATE TRIGGER cfdi_sat_evidencias_no_delete
  BEFORE DELETE ON public.cfdi_sat_evidencias
  FOR EACH ROW EXECUTE FUNCTION public.cfdi_sat_evidencias_inmutable();

-- =====================================================================
-- 2) RPC ÚNICO DE ESCRITURA: valida contra datos persistidos.
--    No recibe estatus ni fuente: nada de lo que envía el cliente se cree.
-- =====================================================================
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
  v_rol  text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF _cfdi_id IS NULL OR _run_id IS NULL
     OR coalesce(btrim(_solicitud_id),'') = '' OR coalesce(btrim(_paquete_id),'') = '' THEN
    RETURN jsonb_build_object('creada', false, 'motivo', 'PARAMETROS_INCOMPLETOS');
  END IF;

  SELECT * INTO v_cfdi FROM public.cfdi_xml WHERE id = _cfdi_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('creada', false, 'motivo', 'CFDI_INEXISTENTE');
  END IF;

  -- Autorización explícita: sin auth.uid() sólo el proceso interno (service_role).
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
    RETURN jsonb_build_object('creada', false, 'motivo', 'CORRIDA_FUERA_DE_ALCANCE');
  END IF;

  -- La solicitud debe existir DENTRO de esa corrida.
  SELECT s INTO v_sol
    FROM jsonb_array_elements(coalesce(v_run.solicitudes, '[]'::jsonb)) s
   WHERE upper(btrim(coalesce(s->>'id_solicitud',''))) = upper(btrim(_solicitud_id))
   LIMIT 1;
  IF v_sol IS NULL THEN
    RETURN jsonb_build_object('creada', false, 'motivo', 'SOLICITUD_NO_PERTENECE_A_CORRIDA');
  END IF;

  -- Y debe declarar EXACTAMENTE Vigente. Sin valores por defecto.
  IF coalesce(v_sol->>'estado_comprobante','') <> 'Vigente' THEN
    RETURN jsonb_build_object('creada', false, 'motivo', 'ESTADO_COMPROBANTE_NO_VIGENTE');
  END IF;

  -- El paquete debe pertenecer a esa solicitud y estar PROCESADO.
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(coalesce(v_sol->'paquetes_procesados','[]'::jsonb)) p
     WHERE upper(btrim(p)) = upper(btrim(_paquete_id))
  ) THEN
    RETURN jsonb_build_object('creada', false, 'motivo', 'PAQUETE_NO_PROCESADO');
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

  IF v_id IS NULL THEN
    SELECT e.id INTO v_id FROM public.cfdi_sat_evidencias e WHERE e.idempotency_key = v_key;
    RETURN jsonb_build_object('creada', false, 'duplicada', true,
                              'evidencia_id', v_id, 'estatus', 'vigente');
  END IF;

  -- Proyección en la MISMA transacción. Nunca degrada un cancelado.
  UPDATE public.cfdi_xml
     SET estatus_sat = 'vigente',
         estatus_sat_fuente = 'descarga_masiva_sat',
         estatus_sat_evidencia_at = now(),
         sat_run_id = coalesce(sat_run_id, _run_id),
         sat_solicitud_id = coalesce(sat_solicitud_id, upper(btrim(_solicitud_id))),
         sat_paquete_id = coalesce(sat_paquete_id, upper(btrim(_paquete_id)))
   WHERE id = _cfdi_id AND coalesce(estatus_sat,'desconocido') <> 'cancelado';

  RETURN jsonb_build_object('creada', true, 'evidencia_id', v_id, 'estatus', 'vigente');
END; $$;

REVOKE ALL ON FUNCTION public.cfdi_registrar_evidencia_sat(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cfdi_registrar_evidencia_sat(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cfdi_registrar_evidencia_sat(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cfdi_registrar_evidencia_sat(uuid, uuid, text, text) TO service_role;

-- =====================================================================
-- 3) CONCURRENCIA REAL EN LA CREACIÓN DE OCURRENCIAS DE EXCEPCIÓN
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cierre_excepcion_crear_ocurrencia(
  _despacho_id uuid, _cliente_id uuid, _periodo text, _cfdi_id uuid,
  _codigo text, _severidad text, _titulo text, _detalle jsonb,
  _ocurrencia integer, _excepcion_previa_id uuid DEFAULT NULL::uuid,
  _actor text DEFAULT 'sistema'::text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_ocu integer := greatest(coalesce(_ocurrencia, 1), 1);
BEGIN
  -- Camino feliz: si ya hay una ocurrencia VIVA, se devuelve sin tocar nada.
  SELECT e.id INTO v_id
    FROM public.cierre_excepciones e
   WHERE e.cliente_id = _cliente_id
     AND e.periodo = _periodo
     AND e.codigo = _codigo
     AND coalesce(e.cfdi_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(_cfdi_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND e.estado IN ('pendiente', 'aceptada', 'resuelta')
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Carrera real: dos trabajadores llegan aquí a la vez. El índice parcial
  -- `cierre_excepciones_una_viva` (y el único por ocurrencia) decide; el
  -- perdedor NO propaga unique_violation: relee y devuelve la viva.
  BEGIN
    INSERT INTO public.cierre_excepciones (
      despacho_id, cliente_id, periodo, cfdi_id, codigo, severidad, titulo, detalle,
      estado, ocurrencia, excepcion_previa_id, reactivada_at
    ) VALUES (
      _despacho_id, _cliente_id, _periodo, _cfdi_id, _codigo, _severidad, _titulo,
      coalesce(_detalle, '{}'::jsonb), 'pendiente', v_ocu, _excepcion_previa_id,
      CASE WHEN _excepcion_previa_id IS NOT NULL THEN now() ELSE NULL END
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT e.id INTO v_id
      FROM public.cierre_excepciones e
     WHERE e.cliente_id = _cliente_id
       AND e.periodo = _periodo
       AND e.codigo = _codigo
       AND coalesce(e.cfdi_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(_cfdi_id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND e.estado IN ('pendiente', 'aceptada', 'resuelta')
     LIMIT 1;
    IF v_id IS NULL THEN
      SELECT e.id INTO v_id
        FROM public.cierre_excepciones e
       WHERE e.cliente_id = _cliente_id AND e.periodo = _periodo AND e.codigo = _codigo
         AND coalesce(e.cfdi_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = coalesce(_cfdi_id, '00000000-0000-0000-0000-000000000000'::uuid)
         AND coalesce(e.ocurrencia,1) = v_ocu
       LIMIT 1;
    END IF;
    -- El ganador ya escribió la bitácora de reaparición: no se duplica.
    RETURN v_id;
  END;

  IF _excepcion_previa_id IS NOT NULL THEN
    INSERT INTO public.cierre_excepcion_bitacora (excepcion_id, user_id, accion, motivo)
    VALUES (v_id, NULL, 'reaparicion',
            'Ocurrencia ' || v_ocu
            || '. La causa reapareció tras un cierre automático (actor: ' || _actor || ').');
  END IF;

  RETURN v_id;
END; $$;