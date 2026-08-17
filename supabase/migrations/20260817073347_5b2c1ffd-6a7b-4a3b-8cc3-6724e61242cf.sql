
-- ─────────────────────────────────────────────────────────────
-- 1. RESPALDO REVERSIBLE (idempotente, sólo sistema)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conciliacion_respaldo_bloque1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tomado_at timestamptz NOT NULL DEFAULT now(),
  etiqueta text NOT NULL,
  tabla text NOT NULL,
  fila_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  UNIQUE (etiqueta, tabla, fila_id)
);
GRANT ALL ON public.conciliacion_respaldo_bloque1 TO service_role;
ALTER TABLE public.conciliacion_respaldo_bloque1 ENABLE ROW LEVEL SECURITY;

INSERT INTO public.conciliacion_respaldo_bloque1 (etiqueta, tabla, fila_id, snapshot)
SELECT 'bloque1-semantica', 'conciliacion_grupos', g.id, to_jsonb(g) FROM public.conciliacion_grupos g
ON CONFLICT (etiqueta, tabla, fila_id) DO NOTHING;

INSERT INTO public.conciliacion_respaldo_bloque1 (etiqueta, tabla, fila_id, snapshot)
SELECT 'bloque1-semantica', 'conciliaciones', k.id, to_jsonb(k) FROM public.conciliaciones k
ON CONFLICT (etiqueta, tabla, fila_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. NIVEL DE PROPUESTA
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.conciliacion_grupos
  ADD COLUMN IF NOT EXISTS nivel_propuesta text;

UPDATE public.conciliacion_grupos
   SET nivel_propuesta = CASE
     WHEN origen = 'humano' THEN 'decision_humana'
     WHEN coalesce(evidencia->>'regla','') = 'unico_exacto_dos_senales' THEN 'automatica_alta_confianza'
     ELSE 'revision_requerida' END
 WHERE nivel_propuesta IS NULL;

ALTER TABLE public.conciliacion_grupos
  ALTER COLUMN nivel_propuesta SET DEFAULT 'revision_requerida';
ALTER TABLE public.conciliacion_grupos
  ALTER COLUMN nivel_propuesta SET NOT NULL;

ALTER TABLE public.conciliacion_grupos DROP CONSTRAINT IF EXISTS conc_g_nivel_chk;
ALTER TABLE public.conciliacion_grupos ADD CONSTRAINT conc_g_nivel_chk
  CHECK (nivel_propuesta IN ('automatica_alta_confianza','revision_requerida','decision_humana'));

-- ─────────────────────────────────────────────────────────────
-- 3. NORMALIZACIÓN: confirmado exige persona real
-- ─────────────────────────────────────────────────────────────
WITH deg AS (
  UPDATE public.conciliacion_grupos g
     SET estado = 'propuesto',
         confirmado_at = NULL,
         confirmado_por = NULL,
         nivel_propuesta = CASE WHEN coalesce(g.evidencia->>'regla','') = 'unico_exacto_dos_senales'
                                THEN 'automatica_alta_confianza' ELSE 'revision_requerida' END,
         updated_at = now()
   WHERE g.estado = 'confirmado' AND g.confirmado_por IS NULL
  RETURNING g.id, g.despacho_id, g.cliente_id, g.periodo, g.evidencia
)
INSERT INTO public.conciliacion_bitacora
  (despacho_id, cliente_id, periodo, grupo_id, accion, estado_anterior, estado_nuevo, motivo, actor, detalle)
SELECT deg.despacho_id, deg.cliente_id, deg.periodo, deg.id, 'normalizacion_semantica',
       'confirmado', 'propuesto',
       'Confirmación sin persona identificada: el motor no puede cerrar una decisión. Se devuelve a propuesta conservando la evidencia.',
       NULL, jsonb_build_object('migracion','bloque1-semantica','evidencia',deg.evidencia)
FROM deg;

ALTER TABLE public.conciliacion_grupos DROP CONSTRAINT IF EXISTS conc_g_confirmado_chk;
ALTER TABLE public.conciliacion_grupos ADD CONSTRAINT conc_g_confirmado_chk
  CHECK (estado <> 'confirmado' OR (confirmado_por IS NOT NULL AND confirmado_at IS NOT NULL));

-- ─────────────────────────────────────────────────────────────
-- 4. ESCRITOR DE CORRIDAS: sólo servidor interno + revalidación total
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.conciliacion_ejecutar_corrida(uuid, text, text, text, text, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.conciliacion_ejecutar_corrida(
  _cliente_id uuid, _periodo text, _actor uuid, _idempotency_key text, _input_hash text,
  _algoritmo_version text, _parametros jsonb, _grupos jsonb, _dias_ventana int DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_despacho uuid; v_corrida uuid; v_existente public.conciliacion_corridas;
  g jsonb; v_grupo uuid;
  v_mov public.movimientos_bancarios; v_cfdi public.cfdi_xml;
  v_ini date; v_fin date;
  v_mov_cent bigint; v_cfdi_cent bigint; v_dir text; v_bp int; v_nivel text;
  v_creados int := 0; v_omitidos int := 0; v_alta int := 0; v_rev int := 0;
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
    -- Contrato del payload: sólo propuestas uno_a_uno
    IF coalesce(g->>'tipo','uno_a_uno') <> 'uno_a_uno' THEN
      RAISE EXCEPTION 'El Bloque 1 sólo admite grupos uno_a_uno.';
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

    -- Revalidación contra las filas reales (el payload nunca es fuente de verdad)
    SELECT * INTO v_mov FROM public.movimientos_bancarios WHERE id = (g->>'movimiento_id')::uuid;
    IF v_mov.id IS NULL THEN RAISE EXCEPTION 'Movimiento inexistente.'; END IF;
    SELECT * INTO v_cfdi FROM public.cfdi_xml WHERE id = (g->>'cfdi_id')::uuid;
    IF v_cfdi.id IS NULL THEN RAISE EXCEPTION 'Comprobante inexistente.'; END IF;

    IF v_mov.cliente_id <> _cliente_id OR v_mov.despacho_id <> v_despacho
       OR v_cfdi.cliente_id <> _cliente_id OR v_cfdi.despacho_id <> v_despacho THEN
      RAISE EXCEPTION 'Referencia cruzada a otro expediente o despacho: operación rechazada.';
    END IF;
    IF v_mov.fecha < v_ini OR v_mov.fecha >= v_fin THEN
      RAISE EXCEPTION 'El movimiento no pertenece al periodo %.', _periodo;
    END IF;
    IF v_cfdi.fecha::date < (v_ini - make_interval(days => greatest(_dias_ventana,0)))
       OR v_cfdi.fecha::date >= (v_fin + make_interval(days => greatest(_dias_ventana,0))) THEN
      RAISE EXCEPTION 'El comprobante queda fuera del alcance temporal del motor.';
    END IF;
    IF v_mov.ignorado_at IS NOT NULL OR v_mov.no_fiscal THEN
      RAISE EXCEPTION 'El movimiento está ignorado o marcado como no fiscal.';
    END IF;
    IF upper(coalesce(v_mov.moneda,'MXN')) <> upper(coalesce(v_cfdi.moneda,'MXN')) THEN
      RAISE EXCEPTION 'Moneda incompatible entre movimiento y comprobante.';
    END IF;

    v_dir := CASE WHEN coalesce(v_mov.abono,0) > 0 THEN 'emitido' ELSE 'recibido' END;
    IF coalesce(v_cfdi.direccion,'') <> v_dir THEN
      RAISE EXCEPTION 'Dirección incompatible: el movimiento exige un comprobante %.', v_dir;
    END IF;

    v_mov_cent := v_mov.importe_centavos;
    v_cfdi_cent := round(coalesce(v_cfdi.total,0) * 100)::bigint;
    IF v_mov_cent <> (g->>'importe_banco_centavos')::bigint
       OR v_cfdi_cent <> (g->>'importe_cfdi_centavos')::bigint THEN
      RAISE EXCEPTION 'Importes del mensaje no coinciden con las filas reales.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.conciliacion_grupos
                WHERE cliente_id = _cliente_id AND idempotency_key = g->>'idempotency_key')
       OR EXISTS (SELECT 1 FROM public.conciliaciones
                   WHERE cliente_id = _cliente_id
                     AND estado_grupo IN ('propuesto','confirmado')
                     AND (movimiento_id = v_mov.id OR cfdi_id = v_cfdi.id))
    THEN
      v_omitidos := v_omitidos + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.conciliacion_grupos (
      despacho_id, cliente_id, periodo, corrida_id, tipo, origen, estado, nivel_propuesta,
      probabilidad_bp, importe_banco_centavos, importe_cfdi_centavos, diferencia_centavos,
      evidencia, motivo, regla, version, idempotency_key
    ) VALUES (
      v_despacho, _cliente_id, _periodo, v_corrida, 'uno_a_uno', 'motor', 'propuesto', v_nivel,
      v_bp, v_mov_cent, v_cfdi_cent, v_mov_cent - v_cfdi_cent,
      coalesce(g->'evidencia','{}'::jsonb), g->>'motivo',
      g->'evidencia'->>'regla', _algoritmo_version, g->>'idempotency_key'
    ) RETURNING id INTO v_grupo;

    INSERT INTO public.conciliaciones (
      despacho_id, cliente_id, movimiento_id, cfdi_id, grupo_id, corrida_id,
      periodo, asignado_centavos, tipo_match, probabilidad, diferencia, motivo
    ) VALUES (
      v_despacho, _cliente_id, v_mov.id, v_cfdi.id, v_grupo, v_corrida,
      _periodo, v_cfdi_cent, 'uno_a_uno', (v_bp::numeric / 10000), 0, g->>'motivo'
    );

    INSERT INTO public.conciliacion_bitacora (
      despacho_id, cliente_id, periodo, grupo_id, movimiento_id, accion,
      estado_nuevo, motivo, actor, detalle
    ) VALUES (
      v_despacho, _cliente_id, _periodo, v_grupo, v_mov.id, 'motor',
      'propuesto', g->>'motivo', _actor,
      jsonb_build_object('corrida_id', v_corrida, 'nivel_propuesta', v_nivel, 'evidencia', g->'evidencia')
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
END; $function$;

REVOKE ALL ON FUNCTION public.conciliacion_ejecutar_corrida(uuid, text, uuid, text, text, text, jsonb, jsonb, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conciliacion_ejecutar_corrida(uuid, text, uuid, text, text, text, jsonb, jsonb, int) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 5. DIAGNÓSTICO BANCARIO FINAL (bancos@5)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cierre_diag_bancos(_cliente_id uuid, _periodo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ini date; v_fin date; v_tol bigint;
  v_total bigint; v_evaluables bigint; v_ignorados bigint; v_no_fiscales bigint;
  v_sin_candidato bigint; v_propuestos bigint; v_alta bigint; v_rechazados bigint;
  v_conf_hum bigint; v_conf_sin_persona bigint; v_fuera bigint;
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
    SELECT k.grupo_id,
           count(DISTINCT k.movimiento_id) FILTER (WHERE k.movimiento_id IS NOT NULL) AS n_mov,
           count(DISTINCT k.cfdi_id) FILTER (WHERE k.cfdi_id IS NOT NULL) AS n_cfdi
      FROM public.conciliaciones k
      JOIN g ON g.id = k.grupo_id
     WHERE k.cliente_id = _cliente_id AND k.periodo = _periodo
     GROUP BY k.grupo_id
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
    (SELECT count(*) FROM g WHERE estado = 'propuesto' AND nivel_propuesta = 'automatica_alta_confianza'),
    (SELECT count(*) FROM g WHERE estado = 'rechazado'),
    (SELECT count(*) FROM mov_conf mc JOIN mov ON mov.id = mc.movimiento_id),
    (SELECT count(*) FROM g WHERE estado = 'confirmado' AND confirmado_por IS NULL),
    (SELECT count(*) FROM g WHERE estado IN ('propuesto','confirmado')
       AND abs(diferencia_centavos) > v_tol AND length(btrim(coalesce(motivo,''))) < 10),
    (SELECT count(*) FROM g JOIN miembros mm ON mm.grupo_id = g.id WHERE g.estado IN ('propuesto','confirmado') AND mm.n_cfdi > 1),
    (SELECT count(*) FROM g JOIN miembros mm ON mm.grupo_id = g.id WHERE g.estado IN ('propuesto','confirmado') AND mm.n_mov > 1),
    coalesce((SELECT jsonb_agg(jsonb_build_object(
        'grupo_id', g.id, 'tipo', g.tipo, 'estado', g.estado, 'origen', g.origen,
        'nivel_propuesta', g.nivel_propuesta,
        'movimientos', coalesce(mm.n_mov,0), 'cfdi', coalesce(mm.n_cfdi,0),
        'importe_movimientos_centavos', g.importe_banco_centavos,
        'importe_cfdi_centavos', g.importe_cfdi_centavos,
        'diferencia_centavos', g.diferencia_centavos,
        'dentro_tolerancia', abs(g.diferencia_centavos) <= v_tol,
        'confirmacion_humana', g.confirmado_por IS NOT NULL,
        'motivo_suficiente', length(btrim(coalesce(g.motivo,''))) >= 10)
      ORDER BY g.estado, g.id) FROM g LEFT JOIN miembros mm ON mm.grupo_id = g.id),'[]'::jsonb)
  INTO v_total, v_evaluables, v_ignorados, v_no_fiscales, v_sin_candidato, v_propuestos, v_alta,
       v_rechazados, v_conf_hum, v_conf_sin_persona, v_fuera, v_1n, v_n1, v_grupos;

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
      v_pend := v_pend || jsonb_build_object('codigo','propuestas_sin_revisar','detalle', v_propuestos||' propuestas pendientes de confirmación humana ('||v_alta||' de alta confianza).');
    END IF;
    IF v_conf_sin_persona > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','confirmacion_sin_persona','detalle', v_conf_sin_persona||' grupos figuran confirmados sin persona identificada: dato inconsistente.');
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
    'movimientos_confirmados_por_persona', v_conf_hum,
    'grupos_propuestos', v_propuestos,
    'propuestas_alta_confianza', v_alta,
    'grupos_rechazados', v_rechazados,
    'grupos_confirmados_sin_persona', v_conf_sin_persona,
    'grupos_uno_a_varios', v_1n, 'grupos_varios_a_uno', v_n1,
    'grupos_fuera_tolerancia', v_fuera,
    'tolerancia_centavos', v_tol, 'grupos', v_grupos);

  v_hash := public.cierre_hash_jsonb(jsonb_build_object('tol',v_tol,'g',v_grupos,'sc',v_sin_candidato,'ev',v_evaluables));

  RETURN jsonb_build_object('etapa','bancos','estado',v_estado,'cobertura',v_cob,
    'input_hash',v_hash,'evaluador_version','bancos@5',
    'criterios_cumplidos',v_cump,'criterios_pendientes',v_pend,'resultado',v_res);
END; $function$;
