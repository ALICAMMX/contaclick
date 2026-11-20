-- ─────────────────────────────────────────────────────────────────────────────
-- Conciliación bancaria — Bloque 2: grupos con varios miembros
--
-- Un depósito puede liquidar varias facturas (uno_a_varios), una factura puede
-- cobrarse con varios movimientos (varios_a_uno) y un complemento de pago se
-- empata por los pagos que declara. Cada miembro sigue siendo una fila
-- (movimiento_id, cfdi_id, asignado_centavos) en public.conciliaciones.
--
-- Antes, dos índices únicos impedían que un movimiento o un CFDI apareciera en
-- más de una fila activa. Ahora la regla es: un documento activo sólo puede
-- pertenecer a UN grupo activo, aunque aparezca en varias filas de ese grupo.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.conc_mov_activo_uk;
DROP INDEX IF EXISTS public.conc_cfdi_activo_uk;

CREATE INDEX IF NOT EXISTS conc_mov_activo_idx
  ON public.conciliaciones (cliente_id, movimiento_id)
  WHERE movimiento_id IS NOT NULL AND estado_grupo IN ('propuesto','confirmado');
CREATE INDEX IF NOT EXISTS conc_cfdi_activo_idx
  ON public.conciliaciones (cliente_id, cfdi_id)
  WHERE cfdi_id IS NOT NULL AND estado_grupo IN ('propuesto','confirmado');

CREATE OR REPLACE FUNCTION public.conciliacion_guard_miembro_unico()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.estado_grupo IN ('propuesto','confirmado') THEN
    -- Serializa por documento para que dos transacciones no lo reserven a la vez.
    IF NEW.movimiento_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('conc-mov:'||NEW.movimiento_id::text));
      IF EXISTS (
        SELECT 1 FROM public.conciliaciones c
         WHERE c.cliente_id = NEW.cliente_id
           AND c.movimiento_id = NEW.movimiento_id
           AND c.id <> NEW.id
           AND c.estado_grupo IN ('propuesto','confirmado')
           AND c.grupo_id IS DISTINCT FROM NEW.grupo_id
      ) THEN
        RAISE EXCEPTION 'El movimiento bancario ya forma parte de otra conciliación activa.'
          USING ERRCODE = 'unique_violation';
      END IF;
    END IF;
    IF NEW.cfdi_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('conc-cfdi:'||NEW.cfdi_id::text));
      IF EXISTS (
        SELECT 1 FROM public.conciliaciones c
         WHERE c.cliente_id = NEW.cliente_id
           AND c.cfdi_id = NEW.cfdi_id
           AND c.id <> NEW.id
           AND c.estado_grupo IN ('propuesto','confirmado')
           AND c.grupo_id IS DISTINCT FROM NEW.grupo_id
      ) THEN
        RAISE EXCEPTION 'El comprobante ya forma parte de otra conciliación activa.'
          USING ERRCODE = 'unique_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- El nombre empieza con "trg_conc_zz" para correr DESPUÉS de trg_conc_sync_miembro
-- (los BEFORE triggers corren en orden alfabético) y ver el estado ya sincronizado.
DROP TRIGGER IF EXISTS trg_conc_zz_miembro_unico ON public.conciliaciones;
CREATE TRIGGER trg_conc_zz_miembro_unico
  BEFORE INSERT OR UPDATE ON public.conciliaciones
  FOR EACH ROW EXECUTE FUNCTION public.conciliacion_guard_miembro_unico();

-- ─────────────────────────────────────────────────────────────────────────────
-- Escritor de corridas v2: acepta grupos con miembros.
--   _grupos: [{ tipo, regla, nivel_propuesta, probabilidad_bp, evidencia, motivo,
--               idempotency_key, miembros: [{movimiento_id, cfdi_id, asignado_centavos}] }]
-- Valida cada miembro contra las filas reales y que las sumas cuadren.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.conciliacion_ejecutar_corrida_v2(
  _cliente_id uuid, _periodo text, _actor uuid, _idempotency_key text, _input_hash text,
  _algoritmo_version text, _parametros jsonb, _grupos jsonb, _dias_atras integer DEFAULT 70
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_despacho uuid; v_corrida uuid; v_existente public.conciliacion_corridas;
  g jsonb; mbr jsonb; v_grupo uuid; v_tipo text; v_nivel text; v_bp int;
  v_mov public.movimientos_bancarios; v_cfdi public.cfdi_xml;
  v_ini date; v_fin date; v_dir text;
  v_movs uuid[]; v_cfdis uuid[]; v_asig bigint;
  v_banco bigint; v_docs bigint; v_suma_mov bigint; v_suma_cfdi bigint; v_pagos bigint;
  v_conflicto boolean;
  v_creados int := 0; v_omitidos int := 0; v_alta int := 0; v_rev int := 0;
  r record;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IN ('authenticated','anon')
     OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Escritor interno: sólo puede invocarse desde el servidor de ContaClick.';
  END IF;
  IF _actor IS NULL THEN RAISE EXCEPTION 'Se requiere el actor autenticado.'; END IF;
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'El periodo debe indicarse como AAAA-MM.'; END IF;

  SELECT despacho_id INTO v_despacho FROM public.clientes WHERE id = _cliente_id;
  IF v_despacho IS NULL THEN RAISE EXCEPTION 'Expediente no encontrado.'; END IF;

  v_ini := to_date(_periodo||'-01','YYYY-MM-DD');
  v_fin := (v_ini + interval '1 month')::date;

  PERFORM pg_advisory_xact_lock(hashtext('conc:'||_cliente_id::text||':'||_periodo));

  SELECT * INTO v_existente FROM public.conciliacion_corridas
   WHERE cliente_id = _cliente_id AND idempotency_key = _idempotency_key;
  IF v_existente.id IS NOT NULL AND v_existente.estado = 'exito' THEN
    RETURN jsonb_build_object('ok', true, 'reutilizada', true,
      'corrida_id', v_existente.id, 'metricas', v_existente.metricas);
  END IF;

  INSERT INTO public.conciliacion_corridas (
    despacho_id, cliente_id, periodo, algoritmo_version, input_hash,
    idempotency_key, estado, parametros, actor
  ) VALUES (
    v_despacho, _cliente_id, _periodo, _algoritmo_version, _input_hash,
    _idempotency_key, 'corriendo', coalesce(_parametros,'{}'::jsonb), _actor
  ) RETURNING id INTO v_corrida;

  FOR g IN SELECT * FROM jsonb_array_elements(coalesce(_grupos,'[]'::jsonb))
  LOOP
    v_tipo := coalesce(g->>'tipo','uno_a_uno');
    IF v_tipo NOT IN ('uno_a_uno','uno_a_varios','varios_a_uno') THEN
      RAISE EXCEPTION 'Tipo de grupo inválido: %.', v_tipo;
    END IF;
    IF coalesce(g->>'estado','propuesto') <> 'propuesto' THEN
      RAISE EXCEPTION 'El motor sólo puede proponer: estado recibido %.', g->>'estado';
    END IF;
    v_nivel := coalesce(g->>'nivel_propuesta','revision_requerida');
    IF v_nivel NOT IN ('automatica_alta_confianza','revision_requerida') THEN
      RAISE EXCEPTION 'Nivel de propuesta inválido: %.', v_nivel;
    END IF;
    v_bp := (g->>'probabilidad_bp')::int;
    IF v_bp IS NULL OR v_bp < 0 OR v_bp > 10000 THEN
      RAISE EXCEPTION 'Probabilidad fuera de rango: %.', g->>'probabilidad_bp';
    END IF;
    IF coalesce(g->'evidencia'->>'version','') = '' OR coalesce(g->'evidencia'->>'regla','') = '' THEN
      RAISE EXCEPTION 'La evidencia debe incluir versión y regla.';
    END IF;
    IF jsonb_array_length(coalesce(g->'miembros','[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'El grupo no trae miembros.';
    END IF;

    v_movs := ARRAY[]::uuid[]; v_cfdis := ARRAY[]::uuid[];
    v_conflicto := false;

    -- Valida cada miembro contra las filas reales.
    FOR mbr IN SELECT * FROM jsonb_array_elements(g->'miembros')
    LOOP
      SELECT * INTO v_mov FROM public.movimientos_bancarios WHERE id = (mbr->>'movimiento_id')::uuid;
      IF v_mov.id IS NULL THEN RAISE EXCEPTION 'Movimiento inexistente.'; END IF;
      SELECT * INTO v_cfdi FROM public.cfdi_xml WHERE id = (mbr->>'cfdi_id')::uuid;
      IF v_cfdi.id IS NULL THEN RAISE EXCEPTION 'Comprobante inexistente.'; END IF;
      v_asig := (mbr->>'asignado_centavos')::bigint;
      IF v_asig IS NULL OR v_asig <= 0 THEN RAISE EXCEPTION 'Importe asignado inválido.'; END IF;

      IF v_mov.cliente_id <> _cliente_id OR v_mov.despacho_id <> v_despacho
         OR v_cfdi.cliente_id <> _cliente_id OR v_cfdi.despacho_id <> v_despacho THEN
        RAISE EXCEPTION 'Referencia cruzada a otro expediente o despacho: operación rechazada.';
      END IF;
      IF v_mov.fecha < v_ini OR v_mov.fecha >= v_fin THEN
        RAISE EXCEPTION 'El movimiento no pertenece al periodo %.', _periodo;
      END IF;
      IF v_cfdi.fecha::date < (v_ini - make_interval(days => greatest(_dias_atras,0)))
         OR v_cfdi.fecha::date >= (v_fin + make_interval(days => greatest(_dias_atras,0))) THEN
        RAISE EXCEPTION 'El comprobante queda fuera del alcance temporal del motor.';
      END IF;
      IF v_mov.ignorado_at IS NOT NULL OR v_mov.no_fiscal THEN
        RAISE EXCEPTION 'El movimiento está ignorado o marcado como no fiscal.';
      END IF;
      IF lower(coalesce(v_cfdi.estatus_sat,'')) = 'cancelado' THEN
        RAISE EXCEPTION 'Un comprobante cancelado no puede conciliarse.';
      END IF;
      IF upper(coalesce(v_mov.moneda,'MXN')) <> upper(coalesce(v_cfdi.moneda,'MXN')) THEN
        RAISE EXCEPTION 'Moneda incompatible entre movimiento y comprobante.';
      END IF;
      v_dir := CASE WHEN coalesce(v_mov.abono,0) > 0 THEN 'emitido' ELSE 'recibido' END;
      IF coalesce(v_cfdi.direccion,'') <> v_dir THEN
        RAISE EXCEPTION 'Dirección incompatible: el movimiento exige un comprobante %.', v_dir;
      END IF;

      IF NOT (v_mov.id = ANY(v_movs)) THEN v_movs := v_movs || v_mov.id; END IF;
      IF NOT (v_cfdi.id = ANY(v_cfdis)) THEN v_cfdis := v_cfdis || v_cfdi.id; END IF;

      IF EXISTS (SELECT 1 FROM public.conciliaciones
                  WHERE cliente_id = _cliente_id
                    AND estado_grupo IN ('propuesto','confirmado')
                    AND (movimiento_id = v_mov.id OR cfdi_id = v_cfdi.id)) THEN
        v_conflicto := true;
      END IF;
    END LOOP;

    -- Forma del grupo coherente con su tipo.
    IF v_tipo = 'uno_a_uno' AND (array_length(v_movs,1) <> 1 OR array_length(v_cfdis,1) <> 1) THEN
      RAISE EXCEPTION 'Un grupo uno_a_uno debe tener un movimiento y un comprobante.';
    ELSIF v_tipo = 'uno_a_varios' AND (array_length(v_movs,1) <> 1 OR array_length(v_cfdis,1) < 2) THEN
      RAISE EXCEPTION 'Un grupo uno_a_varios debe tener un movimiento y al menos dos comprobantes.';
    ELSIF v_tipo = 'varios_a_uno' AND (array_length(v_movs,1) < 2 OR array_length(v_cfdis,1) <> 1) THEN
      RAISE EXCEPTION 'Un grupo varios_a_uno debe tener al menos dos movimientos y un comprobante.';
    END IF;

    -- Sumas: lo asignado debe cuadrar con el banco y con los comprobantes.
    SELECT coalesce(sum(importe_centavos),0) INTO v_banco
      FROM public.movimientos_bancarios WHERE id = ANY(v_movs);
    v_docs := 0;
    FOR r IN SELECT id, tipo_cfdi, total FROM public.cfdi_xml WHERE id = ANY(v_cfdis) LOOP
      IF upper(coalesce(r.tipo_cfdi,'')) = 'P' THEN
        -- Un complemento vale lo que declaran sus pagos, no su Total (que es 0).
        SELECT coalesce(sum(round(monto*100)),0)::bigint INTO v_pagos FROM public.cfdi_pagos WHERE cfdi_id = r.id;
        v_docs := v_docs + v_pagos;
      ELSE
        v_docs := v_docs + round(coalesce(r.total,0)*100)::bigint;
      END IF;
    END LOOP;
    SELECT coalesce(sum((x->>'asignado_centavos')::bigint),0) INTO v_suma_mov
      FROM jsonb_array_elements(g->'miembros') x;
    IF v_suma_mov <> v_banco OR v_suma_mov <> v_docs THEN
      RAISE EXCEPTION 'Las sumas del grupo no cuadran (banco %, comprobantes %, asignado %).', v_banco, v_docs, v_suma_mov;
    END IF;
    IF v_banco <> (g->>'importe_banco_centavos')::bigint OR v_docs <> (g->>'importe_cfdi_centavos')::bigint THEN
      RAISE EXCEPTION 'Importes del mensaje no coinciden con las filas reales.';
    END IF;

    IF v_conflicto OR EXISTS (SELECT 1 FROM public.conciliacion_grupos
                               WHERE cliente_id = _cliente_id AND idempotency_key = g->>'idempotency_key') THEN
      v_omitidos := v_omitidos + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.conciliacion_grupos (
      despacho_id, cliente_id, periodo, corrida_id, tipo, origen, estado, nivel_propuesta,
      probabilidad_bp, importe_banco_centavos, importe_cfdi_centavos, diferencia_centavos,
      evidencia, motivo, regla, version, idempotency_key
    ) VALUES (
      v_despacho, _cliente_id, _periodo, v_corrida, v_tipo, 'motor', 'propuesto', v_nivel,
      v_bp, v_banco, v_docs, v_banco - v_docs,
      coalesce(g->'evidencia','{}'::jsonb), g->>'motivo',
      g->'evidencia'->>'regla', _algoritmo_version, g->>'idempotency_key'
    ) RETURNING id INTO v_grupo;

    INSERT INTO public.conciliaciones (
      despacho_id, cliente_id, movimiento_id, cfdi_id, grupo_id, corrida_id,
      periodo, asignado_centavos, tipo_match, probabilidad, diferencia, motivo
    )
    SELECT v_despacho, _cliente_id, (x->>'movimiento_id')::uuid, (x->>'cfdi_id')::uuid, v_grupo, v_corrida,
           _periodo, (x->>'asignado_centavos')::bigint, v_tipo, (v_bp::numeric / 10000), 0, g->>'motivo'
      FROM jsonb_array_elements(g->'miembros') x;

    INSERT INTO public.conciliacion_bitacora (
      despacho_id, cliente_id, periodo, grupo_id, movimiento_id, accion,
      estado_nuevo, motivo, actor, detalle
    ) VALUES (
      v_despacho, _cliente_id, _periodo, v_grupo, v_movs[1], 'propuesta',
      'propuesto', g->>'motivo', _actor,
      jsonb_build_object(
        'origen', 'motor', 'algoritmo_version', _algoritmo_version, 'corrida_id', v_corrida,
        'tipo', v_tipo, 'nivel_propuesta', v_nivel, 'probabilidad_bp', v_bp,
        'movimientos', to_jsonb(v_movs), 'comprobantes', to_jsonb(v_cfdis),
        'evidencia', coalesce(g->'evidencia','{}'::jsonb))
    );

    v_creados := v_creados + 1;
    IF v_nivel = 'automatica_alta_confianza' THEN v_alta := v_alta + 1; ELSE v_rev := v_rev + 1; END IF;
  END LOOP;

  UPDATE public.conciliacion_corridas
     SET estado = 'exito', fin_at = now(),
         metricas = jsonb_build_object(
           'grupos_creados', v_creados, 'grupos_omitidos', v_omitidos,
           'propuestas_alta_confianza', v_alta, 'propuestas_revision', v_rev)
   WHERE id = v_corrida;

  RETURN jsonb_build_object('ok', true, 'reutilizada', false, 'corrida_id', v_corrida,
    'metricas', jsonb_build_object('grupos_creados', v_creados, 'grupos_omitidos', v_omitidos,
      'propuestas_alta_confianza', v_alta, 'propuestas_revision', v_rev));
END; $$;

REVOKE ALL ON FUNCTION public.conciliacion_ejecutar_corrida_v2(uuid, text, uuid, text, text, text, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conciliacion_ejecutar_corrida_v2(uuid, text, uuid, text, text, text, jsonb, jsonb, integer) TO service_role;
