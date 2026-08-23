-- ─────────────────────────────────────────────────────────────────────────────
-- IMPORTACIÓN BANCARIA SEGURA: dos etapas, estados canónicos y candados
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.conciliacion_importaciones DROP CONSTRAINT IF EXISTS conc_imp_estado_chk;
UPDATE public.conciliacion_importaciones SET estado = 'validada' WHERE estado = 'completada';

ALTER TABLE public.conciliacion_importaciones
  ALTER COLUMN estado SET DEFAULT 'procesando',
  ADD COLUMN IF NOT EXISTS parser_version text NOT NULL DEFAULT 'desconocida',
  ADD COLUMN IF NOT EXISTS periodo_declarado text,
  ADD COLUMN IF NOT EXISTS filas_hash text,
  ADD COLUMN IF NOT EXISTS resumen jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS incidencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bloqueada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validada_por uuid,
  ADD COLUMN IF NOT EXISTS validada_at timestamptz,
  ADD COLUMN IF NOT EXISTS rechazada_por uuid,
  ADD COLUMN IF NOT EXISTS rechazada_at timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_rechazo text;

ALTER TABLE public.conciliacion_importaciones
  ADD CONSTRAINT conc_imp_estado_chk
  CHECK (estado = ANY (ARRAY['procesando','pendiente_validacion','validada','rechazada','fallida']));

ALTER TABLE public.conciliacion_importaciones
  DROP CONSTRAINT IF EXISTS conc_imp_periodo_decl_chk;
ALTER TABLE public.conciliacion_importaciones
  ADD CONSTRAINT conc_imp_periodo_decl_chk
  CHECK (periodo_declarado IS NULL OR periodo_declarado ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- Un mismo archivo sólo puede tener una importación viva por cuenta.
DROP INDEX IF EXISTS public.conc_imp_archivo_uk;
CREATE UNIQUE INDEX conc_imp_archivo_uk
  ON public.conciliacion_importaciones (cuenta_id, archivo_sha256)
  WHERE estado = ANY (ARRAY['procesando','pendiente_validacion','validada']);

-- ── Sello de validación en cada movimiento ───────────────────────────────────
ALTER TABLE public.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS validado_at timestamptz,
  ADD COLUMN IF NOT EXISTS validado_por uuid;

-- Los movimientos ya existentes se respetan tal cual (no había flujo de
-- validación cuando se cargaron). Sólo las cargas nuevas nacen sin sello.
UPDATE public.movimientos_bancarios SET validado_at = created_at WHERE validado_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mov_validado ON public.movimientos_bancarios (cliente_id, validado_at);

-- ── Candados de servidor ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.movimiento_operable(_mov uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.movimientos_bancarios m
    WHERE m.id = _mov AND m.validado_at IS NOT NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.guard_movimiento_operable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov uuid;
BEGIN
  IF TG_TABLE_NAME = 'conciliaciones' THEN
    v_mov := NEW.movimiento_id;
  ELSE
    v_mov := NEW.movimiento_bancario_id;
  END IF;

  IF v_mov IS NOT NULL AND NOT public.movimiento_operable(v_mov) THEN
    RAISE EXCEPTION 'El movimiento bancario proviene de una importación que aún no ha sido validada por una persona. Valida la importación antes de conciliar o contabilizar.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conciliaciones_mov_operable ON public.conciliaciones;
CREATE TRIGGER trg_conciliaciones_mov_operable
  BEFORE INSERT OR UPDATE OF movimiento_id ON public.conciliaciones
  FOR EACH ROW EXECUTE FUNCTION public.guard_movimiento_operable();

DROP TRIGGER IF EXISTS trg_poliza_renglones_mov_operable ON public.poliza_renglones;
CREATE TRIGGER trg_poliza_renglones_mov_operable
  BEFORE INSERT OR UPDATE OF movimiento_bancario_id ON public.poliza_renglones
  FOR EACH ROW EXECUTE FUNCTION public.guard_movimiento_operable();

-- ── Bitácora inmutable de transiciones de importación ────────────────────────
CREATE TABLE IF NOT EXISTS public.conciliacion_importacion_bitacora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  importacion_id uuid NOT NULL,
  estado_anterior text,
  estado_nuevo text NOT NULL,
  motivo text,
  actor uuid,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.conciliacion_importacion_bitacora TO authenticated;
GRANT ALL ON public.conciliacion_importacion_bitacora TO service_role;
ALTER TABLE public.conciliacion_importacion_bitacora ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conc_imp_bit_select ON public.conciliacion_importacion_bitacora;
CREATE POLICY conc_imp_bit_select ON public.conciliacion_importacion_bitacora
  FOR SELECT TO authenticated USING (public.has_cliente_access(cliente_id));

CREATE INDEX IF NOT EXISTS idx_conc_imp_bit ON public.conciliacion_importacion_bitacora (importacion_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.conciliacion_importacion_bitacora_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (public.purga_expediente_en_curso() OR public.es_despacho_sandbox(OLD.despacho_id)) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'La bitácora de importaciones bancarias es inmutable.';
END;
$$;

DROP TRIGGER IF EXISTS trg_conc_imp_bit_inmutable ON public.conciliacion_importacion_bitacora;
CREATE TRIGGER trg_conc_imp_bit_inmutable
  BEFORE UPDATE OR DELETE ON public.conciliacion_importacion_bitacora
  FOR EACH ROW EXECUTE FUNCTION public.conciliacion_importacion_bitacora_inmutable();

-- ── Transiciones atómicas ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.conciliacion_importacion_validar(
  _importacion_id uuid,
  _actor uuid,
  _archivo_sha256 text,
  _parser_version text,
  _filas_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  imp public.conciliacion_importaciones%ROWTYPE;
  v_sellados integer;
BEGIN
  SELECT * INTO imp FROM public.conciliacion_importaciones WHERE id = _importacion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La importación no existe.';
  END IF;
  IF imp.estado = 'validada' THEN
    RETURN jsonb_build_object('importacion_id', imp.id, 'estado', 'validada', 'reutilizada', true,
                              'movimientos_sellados', 0);
  END IF;
  IF imp.estado <> 'pendiente_validacion' THEN
    RAISE EXCEPTION 'Sólo una importación pendiente de validación puede confirmarse (estado actual: %).', imp.estado;
  END IF;
  IF imp.bloqueada THEN
    RAISE EXCEPTION 'La importación tiene incidencias que impiden confirmarla. Corrige el archivo y vuelve a cargarlo.';
  END IF;
  IF imp.archivo_sha256 IS DISTINCT FROM _archivo_sha256
     OR imp.parser_version IS DISTINCT FROM _parser_version
     OR imp.filas_hash IS DISTINCT FROM _filas_hash THEN
    RAISE EXCEPTION 'La vista previa ya no corresponde al archivo interpretado. Vuelve a cargar el estado de cuenta.';
  END IF;

  UPDATE public.movimientos_bancarios
     SET validado_at = now(), validado_por = _actor
   WHERE importacion_id = imp.id AND validado_at IS NULL;
  GET DIAGNOSTICS v_sellados = ROW_COUNT;

  UPDATE public.conciliacion_importaciones
     SET estado = 'validada', validada_por = _actor, validada_at = now()
   WHERE id = imp.id;

  INSERT INTO public.conciliacion_importacion_bitacora
    (despacho_id, cliente_id, importacion_id, estado_anterior, estado_nuevo, actor, detalle)
  VALUES (imp.despacho_id, imp.cliente_id, imp.id, imp.estado, 'validada', _actor,
          jsonb_build_object('movimientos_sellados', v_sellados, 'filas_hash', _filas_hash));

  RETURN jsonb_build_object('importacion_id', imp.id, 'estado', 'validada', 'reutilizada', false,
                            'movimientos_sellados', v_sellados);
END;
$$;

CREATE OR REPLACE FUNCTION public.conciliacion_importacion_rechazar(
  _importacion_id uuid,
  _actor uuid,
  _motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  imp public.conciliacion_importaciones%ROWTYPE;
  v_borrados integer;
BEGIN
  IF length(btrim(coalesce(_motivo, ''))) < 10 THEN
    RAISE EXCEPTION 'Explica el motivo del rechazo con al menos 10 caracteres.';
  END IF;

  SELECT * INTO imp FROM public.conciliacion_importaciones WHERE id = _importacion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La importación no existe.';
  END IF;
  IF imp.estado = 'validada' THEN
    RAISE EXCEPTION 'Una importación ya validada no puede rechazarse: sus movimientos pueden estar conciliados o contabilizados.';
  END IF;
  IF imp.estado = 'rechazada' THEN
    RETURN jsonb_build_object('importacion_id', imp.id, 'estado', 'rechazada', 'movimientos_eliminados', 0);
  END IF;

  DELETE FROM public.movimientos_bancarios
   WHERE importacion_id = imp.id AND validado_at IS NULL;
  GET DIAGNOSTICS v_borrados = ROW_COUNT;

  UPDATE public.conciliacion_importaciones
     SET estado = 'rechazada', rechazada_por = _actor, rechazada_at = now(),
         motivo_rechazo = btrim(_motivo), filas_insertadas = 0
   WHERE id = imp.id;

  INSERT INTO public.conciliacion_importacion_bitacora
    (despacho_id, cliente_id, importacion_id, estado_anterior, estado_nuevo, motivo, actor, detalle)
  VALUES (imp.despacho_id, imp.cliente_id, imp.id, imp.estado, 'rechazada', btrim(_motivo), _actor,
          jsonb_build_object('movimientos_eliminados', v_borrados));

  RETURN jsonb_build_object('importacion_id', imp.id, 'estado', 'rechazada', 'movimientos_eliminados', v_borrados);
END;
$$;

REVOKE ALL ON FUNCTION public.conciliacion_importacion_validar(uuid, uuid, text, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.conciliacion_importacion_rechazar(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conciliacion_importacion_validar(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.conciliacion_importacion_rechazar(uuid, uuid, text) TO service_role;