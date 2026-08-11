-- ─────────────────────────────────────────────────────────────
-- Decisiones fiscales estructuradas (etapa "clasificacion")
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cfdi_decisiones_fiscales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  cfdi_id uuid NOT NULL REFERENCES public.cfdi_xml(id) ON DELETE CASCADE,
  periodo text NOT NULL CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  decision text NOT NULL CHECK (decision IN ('deducible','no_deducible','parcial','por_revisar')),
  porcentaje_deducible numeric(5,2) NOT NULL DEFAULT 100
    CHECK (porcentaje_deducible >= 0 AND porcentaje_deducible <= 100),
  fundamento text,
  motivo text,
  sugerencia_ia jsonb,
  origen text NOT NULL DEFAULT 'humano' CHECK (origen IN ('humano','regla')),
  decidida_por uuid,
  decidida_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cfdi_decision_unica UNIQUE (cfdi_id),
  CONSTRAINT cfdi_decision_parcial_motivo CHECK (
    decision <> 'parcial' OR (porcentaje_deducible > 0 AND porcentaje_deducible < 100)
  ),
  CONSTRAINT cfdi_decision_no_deducible_motivo CHECK (
    decision <> 'no_deducible' OR (motivo IS NOT NULL AND length(btrim(motivo)) >= 10)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cfdi_decisiones_fiscales TO authenticated;
GRANT ALL ON public.cfdi_decisiones_fiscales TO service_role;
ALTER TABLE public.cfdi_decisiones_fiscales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decisiones_select_miembros" ON public.cfdi_decisiones_fiscales
  FOR SELECT TO authenticated
  USING (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id));
CREATE POLICY "decisiones_insert_miembros" ON public.cfdi_decisiones_fiscales
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id));
CREATE POLICY "decisiones_update_miembros" ON public.cfdi_decisiones_fiscales
  FOR UPDATE TO authenticated
  USING (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id))
  WITH CHECK (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id));

CREATE INDEX IF NOT EXISTS cfdi_decisiones_periodo_idx
  ON public.cfdi_decisiones_fiscales (cliente_id, periodo);

CREATE TRIGGER cfdi_decisiones_updated_at
  BEFORE UPDATE ON public.cfdi_decisiones_fiscales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- Snapshot inmutable de cierre
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cierre_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo text NOT NULL CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  version integer NOT NULL DEFAULT 1,
  motivo text NOT NULL,
  resumen jsonb NOT NULL DEFAULT '{}'::jsonb,
  etapas jsonb NOT NULL DEFAULT '[]'::jsonb,
  huella text NOT NULL,
  evaluador_version text,
  sellado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cierre_snapshot_unico UNIQUE (cliente_id, periodo, version)
);

GRANT SELECT, INSERT ON public.cierre_snapshots TO authenticated;
GRANT ALL ON public.cierre_snapshots TO service_role;
ALTER TABLE public.cierre_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_select_miembros" ON public.cierre_snapshots
  FOR SELECT TO authenticated
  USING (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id));
CREATE POLICY "snapshots_insert_miembros" ON public.cierre_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id));

CREATE OR REPLACE FUNCTION public.cierre_snapshots_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'cierre_snapshots es inmutable: no admite % ', TG_OP;
END;
$$;

CREATE TRIGGER cierre_snapshots_no_update
  BEFORE UPDATE OR DELETE ON public.cierre_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.cierre_snapshots_inmutable();

-- ─────────────────────────────────────────────────────────────
-- Sellado transaccional: snapshot + aprobación de la etapa cierre
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cierre_sellar(
  _cliente_id uuid,
  _periodo text,
  _motivo text,
  _resumen jsonb,
  _etapas jsonb,
  _huella text,
  _evaluador_version text
) RETURNS public.cierre_snapshots
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _despacho uuid;
  _ver integer;
  _snap public.cierre_snapshots;
BEGIN
  SELECT despacho_id INTO _despacho FROM public.clientes WHERE id = _cliente_id;
  IF _despacho IS NULL THEN
    RAISE EXCEPTION 'Expediente inexistente';
  END IF;
  IF NOT (public.is_member_of(_despacho) AND public.has_cliente_access(_cliente_id)) THEN
    RAISE EXCEPTION 'Sin acceso al expediente';
  END IF;
  IF _motivo IS NULL OR length(btrim(_motivo)) < 10 THEN
    RAISE EXCEPTION 'El sellado exige un motivo de al menos 10 caracteres';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(_cliente_id::text || ':' || _periodo));

  -- Idempotencia por huella: mismo contenido ⇒ mismo sello
  SELECT * INTO _snap FROM public.cierre_snapshots
   WHERE cliente_id = _cliente_id AND periodo = _periodo AND huella = _huella
   ORDER BY version DESC LIMIT 1;
  IF FOUND THEN
    RETURN _snap;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO _ver
    FROM public.cierre_snapshots WHERE cliente_id = _cliente_id AND periodo = _periodo;

  INSERT INTO public.cierre_snapshots (
    despacho_id, cliente_id, periodo, version, motivo, resumen, etapas, huella,
    evaluador_version, sellado_por
  ) VALUES (
    _despacho, _cliente_id, _periodo, _ver, _motivo,
    COALESCE(_resumen, '{}'::jsonb), COALESCE(_etapas, '[]'::jsonb), _huella,
    _evaluador_version, auth.uid()
  ) RETURNING * INTO _snap;

  PERFORM public.cierre_etapa_transicion(
    _cliente_id, _periodo, 'cierre', 'aprobada', _motivo, NULL, NULL, NULL,
    _huella, _evaluador_version, jsonb_build_object('snapshot_id', _snap.id, 'version', _ver),
    'sello:' || _huella, 'sellado'
  );

  RETURN _snap;
END;
$$;

REVOKE ALL ON FUNCTION public.cierre_sellar(uuid, text, text, jsonb, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_sellar(uuid, text, text, jsonb, jsonb, text, text) TO authenticated, service_role;