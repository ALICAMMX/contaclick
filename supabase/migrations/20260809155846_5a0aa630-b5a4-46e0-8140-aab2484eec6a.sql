-- 1) Evidencia de estatus SAT en el comprobante ------------------------------
ALTER TABLE public.cfdi_xml
  ADD COLUMN IF NOT EXISTS estatus_sat_fuente text,
  ADD COLUMN IF NOT EXISTS estatus_sat_evidencia_at timestamptz;

COMMENT ON COLUMN public.cfdi_xml.estatus_sat_fuente IS
  'Origen de la evidencia del estatus. descarga_masiva_sat = el CFDI fue entregado por el SAT dentro de una solicitud EstadoComprobante=Vigente. NO es una consulta de estatus posterior.';

-- 2) Bitácora inmutable de reaperturas de periodo -----------------------------
CREATE TABLE IF NOT EXISTS public.cierre_reaperturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo text NOT NULL,
  cfdi_id uuid,
  cfdi_uuid text,
  estado_anterior text,
  declarada_at_anterior timestamptz,
  declarada_por_anterior uuid,
  reabierta_at timestamptz NOT NULL DEFAULT now(),
  origen_ingesta text,
  proveedor text,
  sat_run_id uuid,
  sat_solicitud_id text,
  sat_paquete_id text,
  responsable uuid,
  proceso text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cierre_reaperturas_idem_key
  ON public.cierre_reaperturas (idempotency_key);
CREATE INDEX IF NOT EXISTS cierre_reaperturas_cliente_periodo
  ON public.cierre_reaperturas (cliente_id, periodo, reabierta_at DESC);

GRANT SELECT, INSERT ON public.cierre_reaperturas TO authenticated;
GRANT ALL ON public.cierre_reaperturas TO service_role;

ALTER TABLE public.cierre_reaperturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reaperturas visibles del expediente" ON public.cierre_reaperturas;
CREATE POLICY "reaperturas visibles del expediente"
  ON public.cierre_reaperturas FOR SELECT TO authenticated
  USING (public.has_cliente_access(cliente_id));

DROP POLICY IF EXISTS "reaperturas se registran en el expediente" ON public.cierre_reaperturas;
CREATE POLICY "reaperturas se registran en el expediente"
  ON public.cierre_reaperturas FOR INSERT TO authenticated
  WITH CHECK (public.has_cliente_access(cliente_id));

-- Inmutable incluso para roles privilegiados.
CREATE OR REPLACE FUNCTION public.cierre_reaperturas_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora de reaperturas es inmutable: no admite % ', TG_OP;
END; $$;

DROP TRIGGER IF EXISTS cierre_reaperturas_no_update ON public.cierre_reaperturas;
CREATE TRIGGER cierre_reaperturas_no_update
  BEFORE UPDATE OR DELETE ON public.cierre_reaperturas
  FOR EACH ROW EXECUTE FUNCTION public.cierre_reaperturas_inmutable();

-- 3) Excepciones: cierre automático sin DELETE --------------------------------
ALTER TABLE public.cierre_excepciones
  DROP CONSTRAINT IF EXISTS cierre_excepciones_estado_check;
ALTER TABLE public.cierre_excepciones
  ADD CONSTRAINT cierre_excepciones_estado_check
  CHECK (estado = ANY (ARRAY['pendiente','resuelta','aceptada','resuelta_automatica']));

ALTER TABLE public.cierre_excepciones
  ADD COLUMN IF NOT EXISTS ocurrencia integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS excepcion_previa_id uuid REFERENCES public.cierre_excepciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reactivada_at timestamptz,
  ADD COLUMN IF NOT EXISTS cerrada_motivo text;

-- 4) Normalización: reapertura atómica con historial inmutable ----------------
CREATE OR REPLACE FUNCTION public.cfdi_normalizacion_reemplazar(_cfdi_id uuid, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cli uuid; v_desp uuid;
  v_pago jsonb; v_pago_id uuid; v_doc jsonb; v_docid uuid; v_padre uuid;
  v_ids uuid[]; v_imp jsonb; v_idx int;
  v_periodo text := NULLIF(_payload->'cabecera'->>'periodo', '');
  v_reabierto boolean := false;
  v_docs int := 0;
  v_cfdi public.cfdi_xml%ROWTYPE;
  v_corte public.cierre_periodos%ROWTYPE;
BEGIN
  SELECT * INTO v_cfdi FROM public.cfdi_xml WHERE id = _cfdi_id;
  IF v_cfdi.id IS NULL THEN
    RAISE EXCEPTION 'El comprobante % no existe o no es accesible.', _cfdi_id;
  END IF;
  v_cli := v_cfdi.cliente_id; v_desp := v_cfdi.despacho_id;

  DELETE FROM public.cfdi_impuestos WHERE cfdi_id = _cfdi_id;
  DELETE FROM public.cfdi_pagos     WHERE cfdi_id = _cfdi_id;
  DELETE FROM public.cfdi_conceptos WHERE cfdi_id = _cfdi_id;
  DELETE FROM public.cfdi_relaciones WHERE cfdi_id = _cfdi_id;

  INSERT INTO public.cfdi_conceptos (cfdi_id, numero, clave_prod_serv, descripcion, cantidad, valor_unitario, importe)
  SELECT _cfdi_id, (c->>'numero')::int, c->>'clave_prod_serv', c->>'descripcion',
         (c->>'cantidad')::numeric, (c->>'valor_unitario')::numeric, (c->>'importe')::numeric
  FROM jsonb_array_elements(COALESCE(_payload->'conceptos', '[]'::jsonb)) c;

  INSERT INTO public.cfdi_impuestos (cfdi_id, nivel, concepto_numero, tipo, impuesto, impuesto_nombre, base, tipo_factor, tasa_cuota, importe)
  SELECT _cfdi_id, i->>'nivel', (i->>'concepto_numero')::int, i->>'tipo', i->>'impuesto', i->>'impuesto_nombre',
         (i->>'base')::numeric, i->>'tipo_factor', (i->>'tasa_cuota')::numeric, (i->>'importe')::numeric
  FROM jsonb_array_elements(COALESCE(_payload->'impuestos', '[]'::jsonb)) i;

  INSERT INTO public.cfdi_relaciones (cfdi_id, uuid_relacionado, tipo_relacion)
  SELECT _cfdi_id, r->>'uuid_relacionado', r->>'tipo_relacion'
  FROM jsonb_array_elements(COALESCE(_payload->'relaciones', '[]'::jsonb)) r;

  FOR v_pago IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'pagos', '[]'::jsonb)) LOOP
    INSERT INTO public.cfdi_pagos (cfdi_id, despacho_id, cliente_id, numero_pago, fecha_pago, forma_pago_p, moneda_p, tipo_cambio_p, monto, num_operacion)
    VALUES (_cfdi_id, v_desp, v_cli, (v_pago->>'numero_pago')::int,
            NULLIF(v_pago->>'fecha_pago','')::timestamptz, v_pago->>'forma_pago_p', v_pago->>'moneda_p',
            (v_pago->>'tipo_cambio_p')::numeric, (v_pago->>'monto')::numeric, v_pago->>'num_operacion')
    RETURNING id INTO v_pago_id;

    v_ids := ARRAY[]::uuid[];
    FOR v_doc IN SELECT * FROM jsonb_array_elements(COALESCE(v_pago->'documentos', '[]'::jsonb)) LOOP
      SELECT x.id INTO v_padre FROM public.cfdi_xml x
       WHERE x.cliente_id = v_cli AND upper(btrim(x.uuid)) = upper(btrim(v_doc->>'id_documento'))
       LIMIT 1;
      INSERT INTO public.cfdi_pago_documentos
        (pago_id, cfdi_id, id_documento, serie, folio, moneda_dr, equivalencia_dr, num_parcialidad,
         imp_saldo_ant, imp_pagado, imp_saldo_insoluto, objeto_imp_dr, cfdi_padre_id)
      VALUES (v_pago_id, _cfdi_id, v_doc->>'id_documento', v_doc->>'serie', v_doc->>'folio', v_doc->>'moneda_dr',
              (v_doc->>'equivalencia_dr')::numeric, (v_doc->>'num_parcialidad')::int,
              (v_doc->>'imp_saldo_ant')::numeric, (v_doc->>'imp_pagado')::numeric,
              (v_doc->>'imp_saldo_insoluto')::numeric, v_doc->>'objeto_imp_dr', v_padre)
      RETURNING id INTO v_docid;
      v_ids := array_append(v_ids, v_docid);
      v_docs := v_docs + 1;
      v_padre := NULL;
    END LOOP;

    FOR v_imp IN SELECT * FROM jsonb_array_elements(COALESCE(v_pago->'impuestos', '[]'::jsonb)) LOOP
      v_idx := NULLIF(v_imp->>'documento_indice','')::int;
      INSERT INTO public.cfdi_pago_impuestos (pago_id, documento_id, ambito, tipo, impuesto, base, tipo_factor, tasa_cuota, importe)
      VALUES (v_pago_id,
              CASE WHEN v_idx IS NOT NULL AND v_idx >= 0 AND v_idx < array_length(v_ids,1) THEN v_ids[v_idx + 1] ELSE NULL END,
              v_imp->>'ambito', v_imp->>'tipo', v_imp->>'impuesto', (v_imp->>'base')::numeric,
              v_imp->>'tipo_factor', (v_imp->>'tasa_cuota')::numeric, (v_imp->>'importe')::numeric);
    END LOOP;
  END LOOP;

  -- Cabecera. NO se toca estatus_sat, su fuente, su fecha de evidencia ni el
  -- linaje SAT: la evidencia de la descarga se conserva íntegra.
  UPDATE public.cfdi_xml SET
    xml_raw = CASE WHEN (_payload->'cabecera'->>'guardar_xml')::boolean THEN _payload->'cabecera'->>'xml_raw' ELSE NULL END,
    detalle_reconstruible = COALESCE((_payload->'cabecera'->>'detalle_reconstruible')::boolean, false),
    normalizado_at = now(),
    normalizacion_version = _payload->'cabecera'->>'normalizacion_version',
    periodo = v_periodo,
    direccion = _payload->'cabecera'->>'direccion',
    clase_documental = _payload->'cabecera'->>'clase_documental',
    estado_relacion = _payload->'cabecera'->>'estado_relacion',
    estado_procesamiento = _payload->'cabecera'->>'estado_procesamiento',
    motivos = COALESCE(_payload->'cabecera'->'motivos', '[]'::jsonb)
  WHERE id = _cfdi_id;

  -- Reapertura del periodo con historial inmutable, en la MISMA transacción.
  IF COALESCE((_payload->>'reabrir_periodo')::boolean, false) AND v_periodo IS NOT NULL THEN
    SELECT * INTO v_corte FROM public.cierre_periodos
      WHERE cliente_id = v_cli AND periodo = v_periodo
      FOR UPDATE;

    IF v_corte.id IS NOT NULL AND v_corte.etapa_documental = 'lista' THEN
      INSERT INTO public.cierre_reaperturas
        (despacho_id, cliente_id, periodo, cfdi_id, cfdi_uuid, estado_anterior,
         declarada_at_anterior, declarada_por_anterior, origen_ingesta, proveedor,
         sat_run_id, sat_solicitud_id, sat_paquete_id, responsable, proceso, idempotency_key)
      VALUES
        (v_desp, v_cli, v_periodo, _cfdi_id, v_cfdi.uuid, v_corte.etapa_documental,
         v_corte.declarada_at, v_corte.declarada_por, v_cfdi.origen, v_cfdi.proveedor,
         v_cfdi.sat_run_id, v_cfdi.sat_solicitud_id, v_cfdi.sat_paquete_id,
         auth.uid(), COALESCE(_payload->>'proceso', 'normalizacion_ingesta'),
         'reapertura:' || v_cli::text || ':' || v_periodo || ':' || _cfdi_id::text)
      ON CONFLICT (idempotency_key) DO NOTHING;

      UPDATE public.cierre_periodos
         SET etapa_documental = 'en_proceso', declarada_at = NULL, declarada_por = NULL,
             ultima_revision_at = now()
       WHERE id = v_corte.id;
      v_reabierto := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'cfdi_id', _cfdi_id,
    'periodo', v_periodo,
    'documentos_relacionados', v_docs,
    'periodo_reabierto', v_reabierto
  );
END;
$function$;