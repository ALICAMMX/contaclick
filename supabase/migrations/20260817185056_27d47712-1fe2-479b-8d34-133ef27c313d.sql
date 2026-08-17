CREATE OR REPLACE FUNCTION public.poliza_aprobar(_poliza_id uuid, _motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_p public.polizas; v_cargos bigint; v_abonos bigint; v_malas bigint; v_n bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.'; END IF;
  SELECT * INTO v_p FROM public.polizas WHERE id = _poliza_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Póliza inexistente.'; END IF;
  PERFORM public.cierre_autorizar_expediente(v_p.cliente_id);
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN RAISE EXCEPTION 'La aprobación exige un motivo de al menos 10 caracteres.'; END IF;
  IF v_p.estado = 'aprobada' THEN
    RETURN jsonb_build_object('poliza_id', v_p.id,'estado','aprobada','accion','idempotente');
  END IF;

  -- Toda la validación se limita a la póliza objetivo: nunca se evalúan otros
  -- borradores del mismo periodo.
  SELECT count(*), coalesce(sum(cargo_centavos),0), coalesce(sum(abono_centavos),0)
    INTO v_n, v_cargos, v_abonos FROM public.poliza_renglones WHERE poliza_id = _poliza_id;
  IF v_n < 2 THEN
    RAISE EXCEPTION 'La póliza % no tiene renglones suficientes.', _poliza_id;
  END IF;
  IF v_cargos <> v_abonos OR v_cargos = 0 THEN
    RAISE EXCEPTION 'La póliza % tiene la partida doble rota: cargos % ≠ abonos % (centavos).', _poliza_id, v_cargos, v_abonos;
  END IF;

  SELECT count(*) INTO v_malas FROM public.poliza_renglones r
   WHERE r.poliza_id = _poliza_id AND (
     btrim(coalesce(r.cuenta,'')) = '' OR r.cuenta ILIKE '%por identificar%'
     OR NOT EXISTS (SELECT 1 FROM public.catalogo_cuentas cc
                    WHERE cc.cliente_id = v_p.cliente_id AND cc.codigo = r.cuenta AND cc.activa));
  IF v_malas > 0 THEN
    RAISE EXCEPTION 'La póliza % tiene % renglones con cuenta ausente del catálogo o por identificar.', _poliza_id, v_malas;
  END IF;

  UPDATE public.polizas SET estado = 'aprobada', aprobada_por = auth.uid(), aprobada_at = now(),
    rechazada_por = NULL, rechazada_at = NULL, rechazo_motivo = NULL,
    monto = v_cargos / 100.0, updated_at = now() WHERE id = _poliza_id;

  PERFORM 1 FROM public.cierre_reabrir_cascada(v_p.cliente_id, v_p.periodo, 'poliza',
    btrim(_motivo), 'poliza', _poliza_id::text, 'poliza:aprob:'||_poliza_id::text||':'||v_p.version::text);

  RETURN jsonb_build_object('poliza_id', _poliza_id,'estado','aprobada','accion','aprobada',
    'cargos_centavos', v_cargos, 'abonos_centavos', v_abonos);
END; $function$;