-- ═══════════════════════════════════════════════════════════════════════════
-- CONCILIACIÓN BANCARIA · BLOQUE 1 · BASE CANÓNICA
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. IMPORTACIONES BANCARIAS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conciliacion_importaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  cuenta_id uuid NOT NULL REFERENCES public.cuentas_bancarias(id) ON DELETE CASCADE,
  archivo_sha256 text NOT NULL,
  archivo_nombre text NOT NULL,
  archivo_bytes bigint NOT NULL DEFAULT 0,
  formato text NOT NULL DEFAULT 'desconocido',
  periodo_detectado text,
  filas_totales integer NOT NULL DEFAULT 0,
  filas_insertadas integer NOT NULL DEFAULT 0,
  filas_reimportadas integer NOT NULL DEFAULT 0,
  candidatos_duplicado integer NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'completada',
  error text,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conc_imp_estado_chk CHECK (estado IN ('completada','fallida')),
  CONSTRAINT conc_imp_periodo_chk CHECK (periodo_detectado IS NULL OR periodo_detectado ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
CREATE UNIQUE INDEX IF NOT EXISTS conc_imp_archivo_uk
  ON public.conciliacion_importaciones (cuenta_id, archivo_sha256) WHERE estado = 'completada';

GRANT SELECT, INSERT, UPDATE ON public.conciliacion_importaciones TO authenticated;
GRANT ALL ON public.conciliacion_importaciones TO service_role;
ALTER TABLE public.conciliacion_importaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY conc_imp_select ON public.conciliacion_importaciones FOR SELECT TO authenticated USING (public.has_cliente_access(cliente_id));
CREATE POLICY conc_imp_insert ON public.conciliacion_importaciones FOR INSERT TO authenticated WITH CHECK (public.has_cliente_access(cliente_id));
CREATE POLICY conc_imp_update ON public.conciliacion_importaciones FOR UPDATE TO authenticated USING (public.has_cliente_access(cliente_id)) WITH CHECK (public.has_cliente_access(cliente_id));

-- ── 2. MOVIMIENTOS: identidad por fila, centavos, ignorados ────────────────
ALTER TABLE public.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS importacion_id uuid REFERENCES public.conciliacion_importaciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fila_origen integer,
  ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS no_fiscal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ignorado_por uuid,
  ADD COLUMN IF NOT EXISTS ignorado_at timestamptz,
  ADD COLUMN IF NOT EXISTS ignorado_motivo text,
  ADD COLUMN IF NOT EXISTS duplicado_candidato_de uuid;

ALTER TABLE public.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS importe_centavos bigint
  GENERATED ALWAYS AS ((round(coalesce(cargo,0)*100) + round(coalesce(abono,0)*100))::bigint) STORED;

DO $$ BEGIN
  ALTER TABLE public.movimientos_bancarios
    ADD CONSTRAINT mov_ignorado_chk CHECK (
      (ignorado_at IS NULL AND ignorado_por IS NULL AND ignorado_motivo IS NULL)
      OR (ignorado_at IS NOT NULL AND ignorado_por IS NOT NULL AND length(btrim(ignorado_motivo)) >= 10)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Dos filas legítimas idénticas del mismo archivo deben sobrevivir:
-- la unicidad deja de ser (cuenta, hash) y pasa a ser (importación, fila).
ALTER TABLE public.movimientos_bancarios DROP CONSTRAINT IF EXISTS movimientos_bancarios_cuenta_id_hash_key;
DROP INDEX IF EXISTS public.movimientos_bancarios_cuenta_id_hash_key;
CREATE UNIQUE INDEX IF NOT EXISTS mov_importacion_fila_uk
  ON public.movimientos_bancarios (importacion_id, fila_origen) WHERE importacion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mov_hash ON public.movimientos_bancarios (cuenta_id, hash);
CREATE INDEX IF NOT EXISTS idx_mov_cliente_fecha ON public.movimientos_bancarios (cliente_id, fecha);

-- ── 3. CORRIDAS DEL MOTOR ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conciliacion_corridas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo text NOT NULL,
  algoritmo_version text NOT NULL,
  input_hash text NOT NULL,
  idempotency_key text NOT NULL,
  estado text NOT NULL DEFAULT 'corriendo',
  metricas jsonb NOT NULL DEFAULT '{}'::jsonb,
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  inicio_at timestamptz NOT NULL DEFAULT now(),
  fin_at timestamptz,
  error text,
  actor uuid,
  CONSTRAINT conc_corrida_periodo_chk CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT conc_corrida_estado_chk CHECK (estado IN ('corriendo','exito','fallida'))
);
CREATE UNIQUE INDEX IF NOT EXISTS conc_corrida_idem_uk
  ON public.conciliacion_corridas (cliente_id, idempotency_key);

GRANT SELECT ON public.conciliacion_corridas TO authenticated;
GRANT ALL ON public.conciliacion_corridas TO service_role;
ALTER TABLE public.conciliacion_corridas ENABLE ROW LEVEL SECURITY;
CREATE POLICY conc_corrida_select ON public.conciliacion_corridas FOR SELECT TO authenticated USING (public.has_cliente_access(cliente_id));

-- ── 4. GRUPOS CANÓNICOS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conciliacion_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo text NOT NULL,
  corrida_id uuid REFERENCES public.conciliacion_corridas(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'uno_a_uno',
  origen text NOT NULL,
  estado text NOT NULL DEFAULT 'propuesto',
  probabilidad_bp integer NOT NULL DEFAULT 0,
  importe_banco_centavos bigint NOT NULL DEFAULT 0,
  importe_cfdi_centavos bigint NOT NULL DEFAULT 0,
  diferencia_centavos bigint NOT NULL DEFAULT 0,
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo text,
  regla text,
  version text NOT NULL DEFAULT 'motor@1',
  confirmado_por uuid,
  confirmado_at timestamptz,
  rechazado_por uuid,
  rechazado_at timestamptz,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conc_g_periodo_chk CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT conc_g_tipo_chk CHECK (tipo IN ('uno_a_uno','uno_a_varios','varios_a_uno')),
  CONSTRAINT conc_g_origen_chk CHECK (origen IN ('motor','humano')),
  CONSTRAINT conc_g_estado_chk CHECK (estado IN ('propuesto','confirmado','rechazado','ignorado')),
  CONSTRAINT conc_g_bp_chk CHECK (probabilidad_bp BETWEEN 0 AND 10000),
  -- propuesto jamás simula confirmación
  CONSTRAINT conc_g_propuesto_chk CHECK (
    estado <> 'propuesto' OR (confirmado_por IS NULL AND confirmado_at IS NULL AND rechazado_por IS NULL AND rechazado_at IS NULL)
  ),
  -- confirmación humana exige actor y fecha; confirmación del motor no falsifica actor
  CONSTRAINT conc_g_confirmado_chk CHECK (
    estado <> 'confirmado' OR (
      confirmado_at IS NOT NULL
      AND ((origen = 'humano' AND confirmado_por IS NOT NULL) OR (origen = 'motor' AND confirmado_por IS NULL))
    )
  ),
  CONSTRAINT conc_g_rechazado_chk CHECK (
    estado <> 'rechazado' OR (rechazado_at IS NOT NULL AND length(btrim(coalesce(motivo,''))) >= 10
      AND (rechazado_por IS NOT NULL OR origen = 'motor'))
  ),
  CONSTRAINT conc_g_ignorado_chk CHECK (
    estado <> 'ignorado' OR (rechazado_at IS NOT NULL AND length(btrim(coalesce(motivo,''))) >= 10
      AND (rechazado_por IS NOT NULL OR origen = 'motor'))
  )
);
CREATE INDEX IF NOT EXISTS idx_conc_g_periodo ON public.conciliacion_grupos (cliente_id, periodo, estado);
CREATE UNIQUE INDEX IF NOT EXISTS conc_g_idem_uk
  ON public.conciliacion_grupos (cliente_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

GRANT SELECT ON public.conciliacion_grupos TO authenticated;
GRANT ALL ON public.conciliacion_grupos TO service_role;
ALTER TABLE public.conciliacion_grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY conc_g_select ON public.conciliacion_grupos FOR SELECT TO authenticated USING (public.has_cliente_access(cliente_id));

-- ── 5. CONCILIACIONES COMO MIEMBROS DEL GRUPO ──────────────────────────────
ALTER TABLE public.conciliaciones
  ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.conciliacion_grupos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS corrida_id uuid REFERENCES public.conciliacion_corridas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS asignado_centavos bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS estado_grupo text,
  ADD COLUMN IF NOT EXISTS rechazado_por uuid,
  ADD COLUMN IF NOT EXISTS rechazado_at timestamptz;

-- El estado del vínculo lo dicta SIEMPRE el grupo (fuente única de verdad).
CREATE OR REPLACE FUNCTION public.conciliacion_sync_estado_miembro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.grupo_id IS NOT NULL THEN
    SELECT g.estado, g.periodo INTO NEW.estado_grupo, NEW.periodo
    FROM public.conciliacion_grupos g WHERE g.id = NEW.grupo_id;
    NEW.estatus := NEW.estado_grupo;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_conc_sync_miembro ON public.conciliaciones;
CREATE TRIGGER trg_conc_sync_miembro BEFORE INSERT OR UPDATE ON public.conciliaciones
  FOR EACH ROW EXECUTE FUNCTION public.conciliacion_sync_estado_miembro();

CREATE OR REPLACE FUNCTION public.conciliacion_propagar_estado_grupo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conciliaciones
     SET estado_grupo = NEW.estado, estatus = NEW.estado,
         confirmado_por = NEW.confirmado_por, confirmado_at = NEW.confirmado_at,
         rechazado_por = NEW.rechazado_por, rechazado_at = NEW.rechazado_at
   WHERE grupo_id = NEW.id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_conc_propagar ON public.conciliacion_grupos;
CREATE TRIGGER trg_conc_propagar AFTER UPDATE OF estado, confirmado_por, confirmado_at, rechazado_por, rechazado_at
  ON public.conciliacion_grupos FOR EACH ROW EXECUTE FUNCTION public.conciliacion_propagar_estado_grupo();

-- Un movimiento o CFDI no puede estar en dos grupos ACTIVOS a la vez.
-- Rechazados e ignorados liberan a sus miembros por construcción.
CREATE UNIQUE INDEX IF NOT EXISTS conc_mov_activo_uk
  ON public.conciliaciones (cliente_id, movimiento_id)
  WHERE movimiento_id IS NOT NULL AND estado_grupo IN ('propuesto','confirmado');
CREATE UNIQUE INDEX IF NOT EXISTS conc_cfdi_activo_uk
  ON public.conciliaciones (cliente_id, cfdi_id)
  WHERE cfdi_id IS NOT NULL AND estado_grupo IN ('propuesto','confirmado');
CREATE UNIQUE INDEX IF NOT EXISTS conc_miembro_uk
  ON public.conciliaciones (grupo_id, movimiento_id, cfdi_id) WHERE grupo_id IS NOT NULL;

-- ── 6. BITÁCORA INMUTABLE ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conciliacion_bitacora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  periodo text NOT NULL,
  grupo_id uuid,
  movimiento_id uuid,
  accion text NOT NULL,
  estado_anterior text,
  estado_nuevo text,
  motivo text,
  actor uuid,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conc_bit_accion_chk CHECK (accion IN ('confirmar','rechazar','ignorar','revertir','propuesta','importacion'))
);
CREATE INDEX IF NOT EXISTS idx_conc_bit ON public.conciliacion_bitacora (cliente_id, periodo, created_at DESC);
GRANT SELECT ON public.conciliacion_bitacora TO authenticated;
GRANT ALL ON public.conciliacion_bitacora TO service_role;
ALTER TABLE public.conciliacion_bitacora ENABLE ROW LEVEL SECURITY;
CREATE POLICY conc_bit_select ON public.conciliacion_bitacora FOR SELECT TO authenticated USING (public.has_cliente_access(cliente_id));

CREATE OR REPLACE FUNCTION public.conciliacion_bitacora_inmutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'La bitácora de conciliación es inmutable.'; END; $$;
DROP TRIGGER IF EXISTS trg_conc_bit_inmutable ON public.conciliacion_bitacora;
CREATE TRIGGER trg_conc_bit_inmutable BEFORE UPDATE OR DELETE ON public.conciliacion_bitacora
  FOR EACH ROW EXECUTE FUNCTION public.conciliacion_bitacora_inmutable();

-- ── 7. BACKFILL REVERSIBLE DEL HISTORIAL ───────────────────────────────────
DO $$
DECLARE r record; v_grupo uuid; v_periodo text; v_estado text; v_dup boolean;
  v_mov uuid[] := '{}'; v_cfdi uuid[] := '{}';
BEGIN
  FOR r IN
    SELECT k.*, m.fecha AS mov_fecha, m.importe_centavos AS mov_cent,
           round(coalesce(c.total,0)*100)::bigint AS cfdi_cent
      FROM public.conciliaciones k
      LEFT JOIN public.movimientos_bancarios m ON m.id = k.movimiento_id
      LEFT JOIN public.cfdi_xml c ON c.id = k.cfdi_id
     WHERE k.grupo_id IS NULL
     ORDER BY k.cliente_id, k.confirmado_por NULLS LAST, k.created_at, k.id
  LOOP
    v_periodo := to_char(coalesce(r.mov_fecha, r.created_at::date), 'YYYY-MM');
    -- Defecto histórico reproducido: un mismo CFDI o movimiento aparece en
    -- varias asignaciones. Se conserva la primera y las demás se sanean.
    v_dup := (r.movimiento_id IS NOT NULL AND r.movimiento_id = ANY(v_mov))
          OR (r.cfdi_id IS NOT NULL AND r.cfdi_id = ANY(v_cfdi));
    -- Estados históricos desconocidos NO se ascienden a confirmado.
    v_estado := CASE
      WHEN v_dup THEN 'rechazado'
      WHEN r.estatus IN ('rechazado','rechazada') THEN 'propuesto'  -- sin motivo válido no puede ser rechazo canónico
      WHEN r.estatus IN ('ignorado','ignorada') THEN 'propuesto'
      WHEN r.confirmado_por IS NOT NULL THEN 'confirmado'
      ELSE 'propuesto' END;
    IF NOT v_dup THEN
      IF r.movimiento_id IS NOT NULL THEN v_mov := v_mov || r.movimiento_id; END IF;
      IF r.cfdi_id IS NOT NULL THEN v_cfdi := v_cfdi || r.cfdi_id; END IF;
    END IF;

    INSERT INTO public.conciliacion_grupos (
      despacho_id, cliente_id, periodo, tipo, origen, estado, probabilidad_bp,
      importe_banco_centavos, importe_cfdi_centavos, diferencia_centavos,
      evidencia, motivo, regla, version,
      confirmado_por, confirmado_at, rechazado_at, created_at
    ) VALUES (
      r.despacho_id, r.cliente_id, v_periodo, 'uno_a_uno',
      CASE WHEN r.confirmado_por IS NOT NULL AND NOT v_dup THEN 'humano' ELSE 'motor' END,
      v_estado,
      least(10000, greatest(0, round(coalesce(r.probabilidad,0)*10000)::int)),
      coalesce(r.mov_cent,0), coalesce(r.cfdi_cent,0),
      coalesce(r.mov_cent,0) - coalesce(r.cfdi_cent,0),
      jsonb_build_object('backfill', true, 'estatus_previo', r.estatus,
                         'tipo_match_previo', r.tipo_match, 'duplicado_historico', v_dup),
      CASE WHEN v_dup THEN 'Duplicado histórico: el movimiento o el comprobante ya estaba asignado a otro grupo. Saneado durante la migración; no representa una decisión humana.'
           ELSE r.motivo END,
      'backfill', 'backfill@1',
      CASE WHEN v_estado = 'confirmado' THEN r.confirmado_por END,
      CASE WHEN v_estado = 'confirmado' THEN coalesce(r.confirmado_at, r.created_at) END,
      CASE WHEN v_dup THEN r.created_at END,
      r.created_at
    ) RETURNING id INTO v_grupo;

    UPDATE public.conciliaciones
       SET grupo_id = v_grupo, periodo = v_periodo,
           asignado_centavos = coalesce(r.cfdi_cent, r.mov_cent, 0)
     WHERE id = r.id;
  END LOOP;
END $$;

-- ── 8. RPCs ATÓMICAS DE DECISIÓN HUMANA ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.conciliacion_confirmar_grupo(_grupo_id uuid, _motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.conciliacion_grupos; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión activa para confirmar.'; END IF;
  SELECT * INTO g FROM public.conciliacion_grupos WHERE id = _grupo_id FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'Grupo de conciliación no encontrado.'; END IF;
  PERFORM public.cierre_autorizar_expediente(g.cliente_id);
  IF g.estado = 'confirmado' AND g.confirmado_por IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'sin_cambios', true, 'grupo_id', g.id);
  END IF;
  UPDATE public.conciliacion_grupos
     SET estado='confirmado', origen='humano', confirmado_por=v_uid, confirmado_at=now(),
         rechazado_por=NULL, rechazado_at=NULL,
         motivo = coalesce(nullif(btrim(_motivo),''), motivo), updated_at=now()
   WHERE id = _grupo_id;
  INSERT INTO public.conciliacion_bitacora (despacho_id, cliente_id, periodo, grupo_id, accion, estado_anterior, estado_nuevo, motivo, actor)
  VALUES (g.despacho_id, g.cliente_id, g.periodo, g.id, 'confirmar', g.estado, 'confirmado', _motivo, v_uid);
  PERFORM public.cierre_reabrir_cascada(g.cliente_id, g.periodo, 'conciliacion_confirmada',
    'Confirmación humana de conciliación bancaria.', 'conciliacion_grupo', g.id::text, 'conf:'||g.id::text);
  RETURN jsonb_build_object('ok', true, 'grupo_id', g.id, 'estado', 'confirmado');
END; $$;

CREATE OR REPLACE FUNCTION public.conciliacion_rechazar_grupo(_grupo_id uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.conciliacion_grupos; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión activa para rechazar.'; END IF;
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN RAISE EXCEPTION 'El rechazo exige un motivo de al menos 10 caracteres.'; END IF;
  SELECT * INTO g FROM public.conciliacion_grupos WHERE id = _grupo_id FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'Grupo de conciliación no encontrado.'; END IF;
  PERFORM public.cierre_autorizar_expediente(g.cliente_id);
  UPDATE public.conciliacion_grupos
     SET estado='rechazado', confirmado_por=NULL, confirmado_at=NULL,
         rechazado_por=v_uid, rechazado_at=now(), motivo=btrim(_motivo), updated_at=now()
   WHERE id = _grupo_id;
  INSERT INTO public.conciliacion_bitacora (despacho_id, cliente_id, periodo, grupo_id, accion, estado_anterior, estado_nuevo, motivo, actor)
  VALUES (g.despacho_id, g.cliente_id, g.periodo, g.id, 'rechazar', g.estado, 'rechazado', btrim(_motivo), v_uid);
  IF g.estado = 'confirmado' THEN
    PERFORM public.cierre_reabrir_cascada(g.cliente_id, g.periodo, 'conciliacion_rechazada',
      'Rechazo de una conciliación previamente confirmada.', 'conciliacion_grupo', g.id::text, 'rech:'||g.id::text);
  END IF;
  RETURN jsonb_build_object('ok', true, 'grupo_id', g.id, 'estado', 'rechazado');
END; $$;

CREATE OR REPLACE FUNCTION public.conciliacion_revertir_grupo(_grupo_id uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.conciliacion_grupos; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión activa para revertir.'; END IF;
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN RAISE EXCEPTION 'Revertir exige un motivo de al menos 10 caracteres.'; END IF;
  SELECT * INTO g FROM public.conciliacion_grupos WHERE id = _grupo_id FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'Grupo de conciliación no encontrado.'; END IF;
  PERFORM public.cierre_autorizar_expediente(g.cliente_id);
  UPDATE public.conciliacion_grupos
     SET estado='propuesto', confirmado_por=NULL, confirmado_at=NULL,
         rechazado_por=NULL, rechazado_at=NULL, motivo=btrim(_motivo), updated_at=now()
   WHERE id = _grupo_id;
  INSERT INTO public.conciliacion_bitacora (despacho_id, cliente_id, periodo, grupo_id, accion, estado_anterior, estado_nuevo, motivo, actor)
  VALUES (g.despacho_id, g.cliente_id, g.periodo, g.id, 'revertir', g.estado, 'propuesto', btrim(_motivo), v_uid);
  PERFORM public.cierre_reabrir_cascada(g.cliente_id, g.periodo, 'conciliacion_revertida',
    'Reversión de una confirmación de conciliación.', 'conciliacion_grupo', g.id::text, 'rev:'||g.id::text||':'||extract(epoch from now())::bigint);
  RETURN jsonb_build_object('ok', true, 'grupo_id', g.id, 'estado', 'propuesto');
END; $$;

CREATE OR REPLACE FUNCTION public.conciliacion_ignorar_movimiento(_movimiento_id uuid, _motivo text, _no_fiscal boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.movimientos_bancarios; v_uid uuid := auth.uid(); v_periodo text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión activa.'; END IF;
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN RAISE EXCEPTION 'Ignorar un movimiento exige un motivo de al menos 10 caracteres.'; END IF;
  SELECT * INTO m FROM public.movimientos_bancarios WHERE id = _movimiento_id FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Movimiento bancario no encontrado.'; END IF;
  PERFORM public.cierre_autorizar_expediente(m.cliente_id);
  v_periodo := to_char(m.fecha, 'YYYY-MM');
  UPDATE public.movimientos_bancarios
     SET ignorado_por=v_uid, ignorado_at=now(), ignorado_motivo=btrim(_motivo), no_fiscal=coalesce(_no_fiscal,true)
   WHERE id = _movimiento_id;
  UPDATE public.conciliacion_grupos g
     SET estado='ignorado', confirmado_por=NULL, confirmado_at=NULL,
         rechazado_por=v_uid, rechazado_at=now(), motivo=btrim(_motivo), updated_at=now()
   WHERE g.estado IN ('propuesto','confirmado')
     AND EXISTS (SELECT 1 FROM public.conciliaciones k WHERE k.grupo_id = g.id AND k.movimiento_id = _movimiento_id);
  INSERT INTO public.conciliacion_bitacora (despacho_id, cliente_id, periodo, movimiento_id, accion, estado_nuevo, motivo, actor)
  VALUES (m.despacho_id, m.cliente_id, v_periodo, m.id, 'ignorar', 'ignorado', btrim(_motivo), v_uid);
  PERFORM public.cierre_reabrir_cascada(m.cliente_id, v_periodo, 'movimiento_ignorado',
    'Movimiento bancario marcado como no conciliable.', 'movimiento', m.id::text, 'ign:'||m.id::text);
  RETURN jsonb_build_object('ok', true, 'movimiento_id', m.id);
END; $$;

REVOKE ALL ON FUNCTION public.conciliacion_confirmar_grupo(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conciliacion_rechazar_grupo(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conciliacion_revertir_grupo(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conciliacion_ignorar_movimiento(uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conciliacion_confirmar_grupo(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conciliacion_rechazar_grupo(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conciliacion_revertir_grupo(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conciliacion_ignorar_movimiento(uuid,text,boolean) TO authenticated, service_role;

-- ── 9. DIAGNÓSTICO DE BANCOS SOBRE LA FUENTE CANÓNICA ──────────────────────
CREATE OR REPLACE FUNCTION public.cierre_diag_bancos(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ini date; v_fin date; v_tol bigint;
  v_total bigint; v_evaluables bigint; v_ignorados bigint; v_no_fiscales bigint;
  v_sin_candidato bigint; v_propuestos bigint; v_rechazados bigint;
  v_conf_hum bigint; v_conf_motor bigint; v_fuera bigint;
  v_1n bigint; v_n1 bigint; v_grupos jsonb; v_cob numeric; v_estado text; v_hash text;
  v_pend jsonb := '[]'::jsonb; v_cump jsonb := '[]'::jsonb; v_res jsonb;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;
  v_ini := to_date(_periodo||'-01','YYYY-MM-DD'); v_fin := (v_ini + interval '1 month')::date;

  SELECT coalesce(tolerancia_centavos, 100) INTO v_tol FROM public.cierre_config_bancos WHERE cliente_id = _cliente_id;
  v_tol := coalesce(v_tol, 100);

  WITH mov AS (
    SELECT m.id, m.importe_centavos, m.ignorado_at, m.no_fiscal
      FROM public.movimientos_bancarios m
     WHERE m.cliente_id = _cliente_id AND m.fecha >= v_ini AND m.fecha < v_fin
  ), g AS (
    SELECT gr.* FROM public.conciliacion_grupos gr
     WHERE gr.cliente_id = _cliente_id AND gr.periodo = _periodo
  ), miembros AS (
    -- suma por identificador de miembro: dos importes iguales NO se pierden
    SELECT k.grupo_id,
           count(DISTINCT k.movimiento_id) FILTER (WHERE k.movimiento_id IS NOT NULL) AS n_mov,
           count(DISTINCT k.cfdi_id) FILTER (WHERE k.cfdi_id IS NOT NULL) AS n_cfdi
      FROM public.conciliaciones k WHERE k.grupo_id IN (SELECT id FROM g) GROUP BY k.grupo_id
  ), mov_conf AS (
    SELECT DISTINCT k.movimiento_id FROM public.conciliaciones k
      JOIN g ON g.id = k.grupo_id
     WHERE g.estado = 'confirmado' AND g.confirmado_por IS NOT NULL AND k.movimiento_id IS NOT NULL
  ), mov_activo AS (
    SELECT DISTINCT k.movimiento_id FROM public.conciliaciones k
      JOIN g ON g.id = k.grupo_id
     WHERE g.estado IN ('propuesto','confirmado') AND k.movimiento_id IS NOT NULL
  )
  SELECT
    (SELECT count(*) FROM mov),
    (SELECT count(*) FROM mov WHERE ignorado_at IS NULL AND NOT no_fiscal),
    (SELECT count(*) FROM mov WHERE ignorado_at IS NOT NULL),
    (SELECT count(*) FROM mov WHERE no_fiscal),
    (SELECT count(*) FROM mov WHERE ignorado_at IS NULL AND NOT no_fiscal
       AND id NOT IN (SELECT movimiento_id FROM mov_activo)),
    (SELECT count(*) FROM g WHERE estado = 'propuesto'),
    (SELECT count(*) FROM g WHERE estado = 'rechazado'),
    (SELECT count(*) FROM mov_conf mc JOIN mov ON mov.id = mc.movimiento_id),
    (SELECT count(*) FROM g WHERE estado = 'confirmado' AND confirmado_por IS NULL),
    (SELECT count(*) FROM g WHERE estado IN ('propuesto','confirmado')
       AND abs(diferencia_centavos) > v_tol AND length(btrim(coalesce(motivo,''))) < 10),
    (SELECT count(*) FROM g JOIN miembros mm ON mm.grupo_id = g.id WHERE g.estado IN ('propuesto','confirmado') AND mm.n_cfdi > 1),
    (SELECT count(*) FROM g JOIN miembros mm ON mm.grupo_id = g.id WHERE g.estado IN ('propuesto','confirmado') AND mm.n_mov > 1),
    coalesce((SELECT jsonb_agg(jsonb_build_object(
        'grupo_id', g.id, 'tipo', g.tipo, 'estado', g.estado, 'origen', g.origen,
        'movimientos', coalesce(mm.n_mov,0), 'cfdi', coalesce(mm.n_cfdi,0),
        'importe_movimientos_centavos', g.importe_banco_centavos,
        'importe_cfdi_centavos', g.importe_cfdi_centavos,
        'diferencia_centavos', g.diferencia_centavos,
        'dentro_tolerancia', abs(g.diferencia_centavos) <= v_tol,
        'confirmacion_humana', g.confirmado_por IS NOT NULL,
        'motivo_suficiente', length(btrim(coalesce(g.motivo,''))) >= 10)
      ORDER BY g.estado, g.id) FROM g LEFT JOIN miembros mm ON mm.grupo_id = g.id),'[]'::jsonb)
  INTO v_total, v_evaluables, v_ignorados, v_no_fiscales, v_sin_candidato, v_propuestos,
       v_rechazados, v_conf_hum, v_conf_motor, v_fuera, v_1n, v_n1, v_grupos;

  v_cob := CASE WHEN v_evaluables = 0 THEN 0 ELSE round(v_conf_hum * 100.0 / v_evaluables, 2) END;

  IF v_total = 0 THEN
    v_estado := 'no_iniciada';
    v_pend := v_pend || jsonb_build_object('codigo','sin_movimientos','detalle','No hay movimientos bancarios en el periodo: la etapa no es evaluable.');
  ELSIF v_evaluables = 0 THEN
    v_estado := 'no_iniciada';
    v_pend := v_pend || jsonb_build_object('codigo','sin_movimientos_evaluables','detalle','Todos los movimientos del periodo están ignorados o marcados como no fiscales.');
  ELSE
    IF v_sin_candidato > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','movimientos_sin_candidato','detalle', v_sin_candidato||' movimientos evaluables sin comprobante asignado.');
    END IF;
    IF v_propuestos > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','propuestas_sin_revisar','detalle', v_propuestos||' propuestas pendientes de revisión humana.');
    END IF;
    IF v_conf_motor > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','confirmaciones_automaticas','detalle', v_conf_motor||' coincidencias confirmadas por el motor requieren ratificación humana.');
    END IF;
    IF v_fuera > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','diferencias_fuera_tolerancia','detalle', v_fuera||' grupos con diferencia mayor a '||v_tol||' centavos sin motivo documentado.');
    END IF;
    IF jsonb_array_length(v_pend) = 0 THEN
      v_cump := v_cump || jsonb_build_object('codigo','conciliacion_completa','detalle','Los '||v_evaluables||' movimientos evaluables están confirmados por una persona y dentro de tolerancia.');
    END IF;
    v_estado := CASE WHEN jsonb_array_length(v_pend) = 0 THEN 'lista' ELSE 'en_proceso' END;
  END IF;

  v_res := jsonb_build_object(
    'movimientos', v_total, 'movimientos_evaluables', v_evaluables,
    'movimientos_ignorados', v_ignorados, 'movimientos_no_fiscales', v_no_fiscales,
    'movimientos_sin_candidato', v_sin_candidato,
    'movimientos_confirmados', v_conf_hum,
    'grupos_propuestos', v_propuestos, 'grupos_rechazados', v_rechazados,
    'grupos_confirmados_motor', v_conf_motor,
    'grupos_uno_a_varios', v_1n, 'grupos_varios_a_uno', v_n1,
    'grupos_fuera_tolerancia', v_fuera,
    'tolerancia_centavos', v_tol, 'grupos', v_grupos);

  v_hash := public.cierre_hash_jsonb(jsonb_build_object('tol',v_tol,'g',v_grupos,'sc',v_sin_candidato,'ev',v_evaluables));

  RETURN jsonb_build_object('etapa','bancos','estado',v_estado,'cobertura',v_cob,
    'input_hash',v_hash,'evaluador_version','bancos@4',
    'criterios_cumplidos',v_cump,'criterios_pendientes',v_pend,'resultado',v_res);
END; $$;

-- ── 10. CIERRE DE PERMISOS PARA anon ───────────────────────────────────────
REVOKE ALL ON public.conciliacion_grupos FROM anon;
REVOKE ALL ON public.conciliacion_corridas FROM anon;
REVOKE ALL ON public.conciliacion_importaciones FROM anon;
REVOKE ALL ON public.conciliacion_bitacora FROM anon;
REVOKE ALL ON public.conciliaciones FROM anon;
REVOKE ALL ON public.movimientos_bancarios FROM anon;