-- ─────────────────────────────────────────────────────────────────────────────
-- Conciliación — clasificación de movimientos sin factura
--
-- Comisiones, traspasos entre cuentas propias, impuestos, IMSS, nómina,
-- préstamos… no tienen un CFDI que conciliar. El contador los confirma con una
-- categoría (sugerida por el sistema) y el movimiento sale de los pendientes.
-- Lo que confirma puede convertirse en una regla que el despacho reutiliza.
-- Todo es reversible.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS categoria_sin_cfdi text,
  ADD COLUMN IF NOT EXISTS categoria_origen text;

DO $$ BEGIN
  ALTER TABLE public.movimientos_bancarios ADD CONSTRAINT mov_categoria_chk CHECK (
    categoria_sin_cfdi IS NULL OR categoria_sin_cfdi IN (
      'comision_bancaria','iva_comision','traspaso_propio','pago_impuestos','pago_imss_infonavit',
      'nomina','intereses_ganados','isr_retenido_banco','prestamo','aportacion_retiro_socios',
      'retiro_efectivo','otro_sin_cfdi'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.movimientos_bancarios ADD CONSTRAINT mov_categoria_origen_chk CHECK (
    categoria_origen IS NULL OR categoria_origen IN ('humano','regla_aprendida','regla_sistema','traspaso_detectado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.conciliacion_reglas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  -- NULL = aplica a todos los expedientes del despacho.
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  patron text NOT NULL CHECK (length(btrim(patron)) >= 4),
  direccion text CHECK (direccion IS NULL OR direccion IN ('abono','cargo')),
  categoria text NOT NULL CHECK (categoria IN (
      'comision_bancaria','iva_comision','traspaso_propio','pago_impuestos','pago_imss_infonavit',
      'nomina','intereses_ganados','isr_retenido_banco','prestamo','aportacion_retiro_socios',
      'retiro_efectivo','otro_sin_cfdi')),
  activa boolean NOT NULL DEFAULT true,
  creado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conc_reglas_uk
  ON public.conciliacion_reglas (despacho_id, coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), patron, coalesce(direccion,''))
  WHERE activa;

ALTER TABLE public.conciliacion_reglas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "reglas select" ON public.conciliacion_reglas FOR SELECT
    USING (public.is_member_of(despacho_id) AND (cliente_id IS NULL OR public.has_cliente_access(cliente_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Escritura sólo por los procedimientos de abajo.
REVOKE INSERT, UPDATE, DELETE ON public.conciliacion_reglas FROM anon, authenticated;
GRANT SELECT ON public.conciliacion_reglas TO authenticated;

-- Confirma la categoría de un movimiento sin factura (lo saca de pendientes).
CREATE OR REPLACE FUNCTION public.conciliacion_clasificar_movimiento(
  _movimiento_id uuid, _categoria text, _origen text DEFAULT 'humano'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m public.movimientos_bancarios; v_motivo text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión activa.'; END IF;
  IF _origen NOT IN ('humano','regla_aprendida','regla_sistema','traspaso_detectado') THEN
    RAISE EXCEPTION 'Origen de clasificación inválido.';
  END IF;
  SELECT * INTO m FROM public.movimientos_bancarios WHERE id = _movimiento_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Movimiento bancario no encontrado.'; END IF;
  PERFORM public.cierre_autorizar_expediente(m.cliente_id);
  IF EXISTS (SELECT 1 FROM public.conciliaciones WHERE movimiento_id = m.id AND estado_grupo = 'confirmado') THEN
    RAISE EXCEPTION 'El movimiento ya está conciliado con una factura: revierte esa conciliación primero.';
  END IF;
  v_motivo := 'Clasificado sin factura: ' || _categoria || '.';
  -- Reutiliza el procedimiento canónico (bitácora, cierre y grupos propuestos).
  PERFORM public.conciliacion_ignorar_movimiento(m.id, v_motivo, true);
  UPDATE public.movimientos_bancarios
     SET categoria_sin_cfdi = _categoria, categoria_origen = _origen
   WHERE id = m.id;
  RETURN jsonb_build_object('ok', true, 'movimiento_id', m.id, 'categoria', _categoria);
END; $$;

-- Deshace una clasificación o un "no conciliable": el movimiento vuelve a pendientes.
CREATE OR REPLACE FUNCTION public.conciliacion_restaurar_movimiento(_movimiento_id uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m public.movimientos_bancarios; v_uid uuid := auth.uid(); v_periodo text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión activa.'; END IF;
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN RAISE EXCEPTION 'Restaurar exige un motivo de al menos 10 caracteres.'; END IF;
  SELECT * INTO m FROM public.movimientos_bancarios WHERE id = _movimiento_id FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Movimiento bancario no encontrado.'; END IF;
  PERFORM public.cierre_autorizar_expediente(m.cliente_id);
  v_periodo := to_char(m.fecha, 'YYYY-MM');
  UPDATE public.movimientos_bancarios
     SET ignorado_por = NULL, ignorado_at = NULL, ignorado_motivo = NULL, no_fiscal = false,
         categoria_sin_cfdi = NULL, categoria_origen = NULL
   WHERE id = m.id;
  INSERT INTO public.conciliacion_bitacora (despacho_id, cliente_id, periodo, movimiento_id, accion, estado_nuevo, motivo, actor)
  VALUES (m.despacho_id, m.cliente_id, v_periodo, m.id, 'revertir', 'propuesto', btrim(_motivo), v_uid);
  PERFORM public.cierre_reabrir_cascada(m.cliente_id, v_periodo, 'banco',
    'Movimiento bancario devuelto a pendientes.', 'movimiento', m.id::text, 'rest:'||m.id::text||':'||extract(epoch from now())::bigint);
  RETURN jsonb_build_object('ok', true, 'movimiento_id', m.id);
END; $$;

-- Guarda una regla aprendida ("recordar para movimientos parecidos").
CREATE OR REPLACE FUNCTION public.conciliacion_aprender_regla(
  _cliente_id uuid, _patron text, _direccion text, _categoria text, _todo_el_despacho boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_desp uuid; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión activa.'; END IF;
  v_desp := public.cierre_autorizar_expediente(_cliente_id);
  INSERT INTO public.conciliacion_reglas (despacho_id, cliente_id, patron, direccion, categoria, creado_por)
  VALUES (v_desp, CASE WHEN _todo_el_despacho THEN NULL ELSE _cliente_id END, upper(btrim(_patron)), _direccion, _categoria, auth.uid())
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'regla_id', v_id);
END; $$;

-- Desactiva una regla aprendida.
CREATE OR REPLACE FUNCTION public.conciliacion_desactivar_regla(_regla_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.conciliacion_reglas;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión activa.'; END IF;
  SELECT * INTO r FROM public.conciliacion_reglas WHERE id = _regla_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Regla no encontrada.'; END IF;
  IF NOT public.is_member_of(r.despacho_id) THEN RAISE EXCEPTION 'Sin acceso a la regla.'; END IF;
  UPDATE public.conciliacion_reglas SET activa = false WHERE id = r.id;
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE ALL ON FUNCTION public.conciliacion_clasificar_movimiento(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conciliacion_restaurar_movimiento(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conciliacion_aprender_regla(uuid, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conciliacion_desactivar_regla(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conciliacion_clasificar_movimiento(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conciliacion_restaurar_movimiento(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conciliacion_aprender_regla(uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conciliacion_desactivar_regla(uuid) TO authenticated;
