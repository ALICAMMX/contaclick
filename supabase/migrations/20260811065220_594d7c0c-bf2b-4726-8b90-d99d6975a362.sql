-- ═══════════════════════════════════════════════════════════════════════════
-- RENGLONES DE PÓLIZA (partida doble verificable)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.poliza_renglones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poliza_id uuid NOT NULL REFERENCES public.polizas(id) ON DELETE CASCADE,
  despacho_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  numero integer NOT NULL,
  cuenta text NOT NULL,
  cuenta_nombre text,
  concepto text,
  cargo_centavos bigint NOT NULL DEFAULT 0,
  abono_centavos bigint NOT NULL DEFAULT 0,
  cfdi_id uuid REFERENCES public.cfdi_xml(id) ON DELETE SET NULL,
  movimiento_bancario_id uuid REFERENCES public.movimientos_bancarios(id) ON DELETE SET NULL,
  origen text NOT NULL DEFAULT 'motor',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poliza_id, numero),
  CONSTRAINT poliza_renglon_importes CHECK (
    cargo_centavos >= 0 AND abono_centavos >= 0
    AND (cargo_centavos = 0) <> (abono_centavos = 0)),
  CONSTRAINT poliza_renglon_cuenta CHECK (btrim(cuenta) <> '')
);

GRANT SELECT ON public.poliza_renglones TO authenticated;
GRANT ALL ON public.poliza_renglones TO service_role;
ALTER TABLE public.poliza_renglones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "renglones visibles para el expediente"
  ON public.poliza_renglones FOR SELECT TO authenticated
  USING (public.has_cliente_access(cliente_id));

CREATE INDEX IF NOT EXISTS poliza_renglones_poliza_idx ON public.poliza_renglones (poliza_id);
CREATE INDEX IF NOT EXISTS poliza_renglones_cliente_idx ON public.poliza_renglones (cliente_id);

CREATE TRIGGER poliza_renglones_updated_at BEFORE UPDATE ON public.poliza_renglones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Una póliza sólo puede quedar aprobada si cuadra y tiene renglones.
CREATE OR REPLACE FUNCTION public.poliza_exigir_cuadre()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_c bigint; v_a bigint; v_n int;
BEGIN
  IF coalesce(NEW.estado,'borrador') <> 'aprobada' THEN RETURN NEW; END IF;
  SELECT count(*), coalesce(sum(cargo_centavos),0), coalesce(sum(abono_centavos),0)
    INTO v_n, v_c, v_a FROM public.poliza_renglones WHERE poliza_id = NEW.id;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'La póliza % no puede aprobarse sin renglones.', NEW.id;
  END IF;
  IF v_c <> v_a THEN
    RAISE EXCEPTION 'La póliza % no cuadra: cargos % vs abonos % (centavos).', NEW.id, v_c, v_a;
  END IF;
  IF NEW.cuenta IS NULL OR btrim(NEW.cuenta) = '' OR NEW.cuenta ILIKE '%por identificar%' THEN
    RAISE EXCEPTION 'La póliza % no puede aprobarse con cuenta por identificar.', NEW.id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS polizas_exigir_cuadre ON public.polizas;
CREATE TRIGGER polizas_exigir_cuadre BEFORE INSERT OR UPDATE ON public.polizas
  FOR EACH ROW EXECUTE FUNCTION public.poliza_exigir_cuadre();

-- ═══════════════════════════════════════════════════════════════════════════
-- ETAPA 3 — EVALUADOR DE BANCOS
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cierre_evaluar_bancos(_cliente_id uuid, _periodo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ini date; v_fin date;
  v_total bigint; v_conc bigint; v_conf bigint; v_dif_sin_motivo bigint;
  v_cob numeric; v_estado text; v_hash text;
  v_pend jsonb := '[]'::jsonb; v_cump jsonb := '[]'::jsonb; v_res jsonb;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;
  v_ini := to_date(_periodo||'-01','YYYY-MM-DD'); v_fin := (v_ini + interval '1 month')::date;

  SELECT count(*) INTO v_total FROM public.movimientos_bancarios
   WHERE cliente_id = _cliente_id AND fecha >= v_ini AND fecha < v_fin;

  SELECT count(DISTINCT k.movimiento_id) INTO v_conc
    FROM public.conciliaciones k JOIN public.movimientos_bancarios m ON m.id = k.movimiento_id
   WHERE k.cliente_id = _cliente_id AND m.fecha >= v_ini AND m.fecha < v_fin;

  SELECT count(DISTINCT k.movimiento_id) INTO v_conf
    FROM public.conciliaciones k JOIN public.movimientos_bancarios m ON m.id = k.movimiento_id
   WHERE k.cliente_id = _cliente_id AND m.fecha >= v_ini AND m.fecha < v_fin
     AND k.confirmado_por IS NOT NULL AND k.estatus IN ('confirmada','aceptada','conciliado','conciliada');

  SELECT count(*) INTO v_dif_sin_motivo
    FROM public.conciliaciones k JOIN public.movimientos_bancarios m ON m.id = k.movimiento_id
   WHERE k.cliente_id = _cliente_id AND m.fecha >= v_ini AND m.fecha < v_fin
     AND coalesce(k.diferencia,0) <> 0 AND length(btrim(coalesce(k.motivo,''))) < 10;

  v_cob := CASE WHEN v_total = 0 THEN 0 ELSE round(v_conf * 100.0 / v_total, 2) END;

  IF v_total = 0 THEN
    v_estado := 'no_iniciada';
    v_pend := v_pend || jsonb_build_object('codigo','sin_movimientos',
      'detalle','No hay movimientos bancarios cargados en el periodo: la etapa no es evaluable.');
  ELSE
    IF v_conf < v_total THEN
      v_pend := v_pend || jsonb_build_object('codigo','movimientos_sin_confirmar',
        'detalle',(v_total - v_conf)||' movimientos sin conciliación confirmada por una persona.');
    ELSE
      v_cump := v_cump || jsonb_build_object('codigo','conciliacion_completa',
        'detalle','Los '||v_total||' movimientos del mes tienen conciliación confirmada.');
    END IF;
    IF v_dif_sin_motivo > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','diferencias_sin_motivo',
        'detalle',v_dif_sin_motivo||' conciliaciones con diferencia y sin motivo escrito.');
    END IF;
    v_estado := CASE WHEN jsonb_array_length(v_pend) = 0 THEN 'lista' ELSE 'en_proceso' END;
  END IF;

  v_res := jsonb_build_object('movimientos', v_total, 'conciliados', v_conc,
    'confirmados', v_conf, 'diferencias_sin_motivo', v_dif_sin_motivo);
  v_hash := encode(sha256(convert_to(public.cierre_canonizar(
    coalesce((SELECT jsonb_agg(jsonb_build_object('m',m.id,'h',m.hash,'k',
        (SELECT jsonb_agg(jsonb_build_object('e',k.estatus,'d',k.diferencia,'c',k.confirmado_por,'mo',k.motivo) ORDER BY k.id)
           FROM public.conciliaciones k WHERE k.movimiento_id = m.id)) ORDER BY m.id)
      FROM public.movimientos_bancarios m
      WHERE m.cliente_id = _cliente_id AND m.fecha >= v_ini AND m.fecha < v_fin), '[]'::jsonb)), 'UTF8')), 'hex');

  PERFORM public.cierre_etapa_transicion(_cliente_id, _periodo, 'bancos', v_estado,
    NULL, v_cob, v_cump, v_pend, v_hash, 'bancos@1', v_res, 'eval:bancos:'||v_hash, 'evaluador');

  RETURN jsonb_build_object('etapa','bancos','estado',v_estado,'cobertura',v_cob,
    'input_hash',v_hash,'evaluador_version','bancos@1',
    'criterios_cumplidos',v_cump,'criterios_pendientes',v_pend,'resultado',v_res);
END; $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ETAPA 4 — EVALUADOR DE PÓLIZAS
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cierre_evaluar_polizas(_cliente_id uuid, _periodo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ini date; v_fin date;
  v_total bigint; v_aprob bigint; v_sin_cuenta bigint; v_descuadre bigint; v_sin_renglones bigint;
  v_cob numeric; v_estado text; v_hash text;
  v_pend jsonb := '[]'::jsonb; v_cump jsonb := '[]'::jsonb; v_res jsonb;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;
  v_ini := to_date(_periodo||'-01','YYYY-MM-DD'); v_fin := (v_ini + interval '1 month')::date;

  SELECT count(*),
         count(*) FILTER (WHERE estado = 'aprobada'),
         count(*) FILTER (WHERE cuenta IS NULL OR btrim(cuenta) = '' OR cuenta ILIKE '%por identificar%')
    INTO v_total, v_aprob, v_sin_cuenta
    FROM public.polizas
   WHERE cliente_id = _cliente_id AND fecha >= v_ini AND fecha < v_fin;

  SELECT count(*) INTO v_sin_renglones FROM public.polizas p
   WHERE p.cliente_id = _cliente_id AND p.fecha >= v_ini AND p.fecha < v_fin
     AND NOT EXISTS (SELECT 1 FROM public.poliza_renglones r WHERE r.poliza_id = p.id);

  SELECT count(*) INTO v_descuadre FROM (
    SELECT r.poliza_id FROM public.poliza_renglones r
      JOIN public.polizas p ON p.id = r.poliza_id
     WHERE p.cliente_id = _cliente_id AND p.fecha >= v_ini AND p.fecha < v_fin
     GROUP BY r.poliza_id
    HAVING sum(r.cargo_centavos) <> sum(r.abono_centavos)) q;

  v_cob := CASE WHEN v_total = 0 THEN 0 ELSE round(v_aprob * 100.0 / v_total, 2) END;

  IF v_total = 0 THEN
    v_estado := 'no_iniciada';
    v_pend := v_pend || jsonb_build_object('codigo','sin_polizas',
      'detalle','No hay pólizas generadas para el periodo: la etapa no es evaluable.');
  ELSE
    IF v_aprob < v_total THEN
      v_pend := v_pend || jsonb_build_object('codigo','polizas_sin_aprobar',
        'detalle',(v_total - v_aprob)||' pólizas en borrador o rechazadas.');
    ELSE
      v_cump := v_cump || jsonb_build_object('codigo','polizas_aprobadas',
        'detalle','Las '||v_total||' pólizas del mes están aprobadas.');
    END IF;
    IF v_sin_cuenta > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','cuentas_por_identificar',
        'detalle',v_sin_cuenta||' pólizas sin cuenta contable identificada.');
    END IF;
    IF v_sin_renglones > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','polizas_sin_renglones',
        'detalle',v_sin_renglones||' pólizas sin renglones de partida doble.');
    END IF;
    IF v_descuadre > 0 THEN
      v_pend := v_pend || jsonb_build_object('codigo','polizas_descuadradas',
        'detalle',v_descuadre||' pólizas cuyos cargos no igualan sus abonos.');
    END IF;
    v_estado := CASE WHEN jsonb_array_length(v_pend) = 0 THEN 'lista' ELSE 'en_proceso' END;
  END IF;

  v_res := jsonb_build_object('polizas', v_total, 'aprobadas', v_aprob,
    'sin_cuenta', v_sin_cuenta, 'sin_renglones', v_sin_renglones, 'descuadradas', v_descuadre);
  v_hash := encode(sha256(convert_to(public.cierre_canonizar(
    coalesce((SELECT jsonb_agg(jsonb_build_object('p',p.id,'e',p.estado,'c',p.cuenta,
        'r',(SELECT jsonb_agg(jsonb_build_object('n',r.numero,'cu',r.cuenta,'d',r.cargo_centavos,'h',r.abono_centavos) ORDER BY r.numero)
               FROM public.poliza_renglones r WHERE r.poliza_id = p.id)) ORDER BY p.id)
      FROM public.polizas p
      WHERE p.cliente_id = _cliente_id AND p.fecha >= v_ini AND p.fecha < v_fin), '[]'::jsonb)), 'UTF8')), 'hex');

  PERFORM public.cierre_etapa_transicion(_cliente_id, _periodo, 'polizas', v_estado,
    NULL, v_cob, v_cump, v_pend, v_hash, 'polizas@1', v_res, 'eval:polizas:'||v_hash, 'evaluador');

  RETURN jsonb_build_object('etapa','polizas','estado',v_estado,'cobertura',v_cob,
    'input_hash',v_hash,'evaluador_version','polizas@1',
    'criterios_cumplidos',v_cump,'criterios_pendientes',v_pend,'resultado',v_res);
END; $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ETAPA 5 — IMPUESTOS PRELIMINARES (estimación, nunca presentable)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cierre_evaluar_impuestos(_cliente_id uuid, _periodo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trasladado bigint; v_acreditable bigint; v_ingresos bigint; v_deducciones bigint;
  v_sin_estatus bigint; v_sin_decision bigint;
  v_estado text; v_hash text; v_cob numeric;
  v_pend jsonb := '[]'::jsonb; v_cump jsonb := '[]'::jsonb; v_res jsonb;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  IF _periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Periodo inválido: %', _periodo; END IF;

  SELECT
    coalesce(sum(round(coalesce(c.iva_trasladado,0)*100)) FILTER (WHERE c.direccion='emitido' AND c.estatus_sat='vigente'),0),
    coalesce(sum(round(coalesce(c.total,0)*100)) FILTER (WHERE c.direccion='emitido' AND c.estatus_sat='vigente'),0),
    count(*) FILTER (WHERE coalesce(c.estatus_sat,'desconocido') <> 'vigente')
  INTO v_trasladado, v_ingresos, v_sin_estatus
  FROM public.cfdi_xml c WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo;

  -- Sólo lo recibido, vigente y con decisión humana de deducibilidad cuenta.
  SELECT
    coalesce(sum(round(coalesce(c.iva_trasladado,0)*100 * coalesce(d.porcentaje_deducible,100)/100.0)),0),
    coalesce(sum(round(coalesce(c.total,0)*100 * coalesce(d.porcentaje_deducible,100)/100.0)),0)
  INTO v_acreditable, v_deducciones
  FROM public.cfdi_xml c
  JOIN public.cfdi_decisiones_fiscales d ON d.cfdi_id = c.id
  WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo
    AND c.direccion = 'recibido' AND c.estatus_sat = 'vigente'
    AND d.decision IN ('deducible','parcial');

  SELECT count(*) INTO v_sin_decision FROM public.cfdi_xml c
   WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo AND c.direccion = 'recibido'
     AND NOT EXISTS (SELECT 1 FROM public.cfdi_decisiones_fiscales d WHERE d.cfdi_id = c.id);

  IF v_sin_estatus > 0 THEN
    v_pend := v_pend || jsonb_build_object('codigo','estatus_sat_incompleto',
      'detalle',v_sin_estatus||' comprobantes sin estatus SAT confirmado: el cálculo no es evaluable.');
  END IF;
  IF v_sin_decision > 0 THEN
    v_pend := v_pend || jsonb_build_object('codigo','deducibilidad_incompleta',
      'detalle',v_sin_decision||' comprobantes recibidos sin decisión de deducibilidad.');
  END IF;
  IF jsonb_array_length(v_pend) = 0 THEN
    v_cump := v_cump || jsonb_build_object('codigo','base_completa',
      'detalle','Todos los comprobantes tienen estatus SAT y decisión de deducibilidad.');
  END IF;

  v_estado := CASE WHEN jsonb_array_length(v_pend) = 0 THEN 'lista' ELSE 'en_proceso' END;
  v_cob := CASE WHEN v_sin_decision + v_sin_estatus = 0 THEN 100 ELSE 0 END;

  v_res := jsonb_build_object(
    'naturaleza','estimacion_interna',
    'advertencia','Cálculo preliminar de apoyo. No es una declaración ni sustituye el cálculo oficial ante el SAT.',
    'iva_trasladado_centavos', v_trasladado,
    'iva_acreditable_centavos', v_acreditable,
    'iva_a_cargo_centavos', greatest(v_trasladado - v_acreditable, 0),
    'iva_a_favor_centavos', greatest(v_acreditable - v_trasladado, 0),
    'ingresos_centavos', v_ingresos,
    'deducciones_autorizadas_centavos', v_deducciones,
    'comprobantes_sin_estatus_sat', v_sin_estatus,
    'comprobantes_sin_decision', v_sin_decision);

  v_hash := encode(sha256(convert_to(public.cierre_canonizar(
    coalesce((SELECT jsonb_agg(jsonb_build_object('c',c.id,'s',c.estatus_sat,'t',c.total,'i',c.iva_trasladado,
        'd',(SELECT d.decision||':'||coalesce(d.porcentaje_deducible,100)::text
               FROM public.cfdi_decisiones_fiscales d WHERE d.cfdi_id = c.id)) ORDER BY c.id)
      FROM public.cfdi_xml c WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo), '[]'::jsonb)), 'UTF8')), 'hex');

  PERFORM public.cierre_etapa_transicion(_cliente_id, _periodo, 'impuestos', v_estado,
    NULL, v_cob, v_cump, v_pend, v_hash, 'impuestos@1', v_res, 'eval:impuestos:'||v_hash, 'evaluador');

  RETURN jsonb_build_object('etapa','impuestos','estado',v_estado,'cobertura',v_cob,
    'input_hash',v_hash,'evaluador_version','impuestos@1',
    'criterios_cumplidos',v_cump,'criterios_pendientes',v_pend,'resultado',v_res);
END; $$;

REVOKE ALL ON FUNCTION public.cierre_evaluar_bancos(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cierre_evaluar_polizas(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cierre_evaluar_impuestos(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cierre_evaluar_bancos(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cierre_evaluar_polizas(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cierre_evaluar_impuestos(uuid,text) TO authenticated, service_role;