-- El mapa canónico de cierre_reabrir_cascada sólo admite:
-- cfdi | clasificacion | banco | poliza | parametro_fiscal.
-- Las decisiones de conciliación pertenecen a la etapa 'bancos'.

CREATE OR REPLACE FUNCTION public.conciliacion_confirmar_grupo(_grupo_id uuid, _motivo text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  PERFORM public.cierre_reabrir_cascada(g.cliente_id, g.periodo, 'banco',
    'Confirmación humana de conciliación bancaria.', 'conciliacion_grupo', g.id::text, 'conf:'||g.id::text);
  RETURN jsonb_build_object('ok', true, 'grupo_id', g.id, 'estado', 'confirmado');
END; $function$;

CREATE OR REPLACE FUNCTION public.conciliacion_rechazar_grupo(_grupo_id uuid, _motivo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    PERFORM public.cierre_reabrir_cascada(g.cliente_id, g.periodo, 'banco',
      'Rechazo de una conciliación previamente confirmada.', 'conciliacion_grupo', g.id::text, 'rech:'||g.id::text);
  END IF;
  RETURN jsonb_build_object('ok', true, 'grupo_id', g.id, 'estado', 'rechazado');
END; $function$;

CREATE OR REPLACE FUNCTION public.conciliacion_revertir_grupo(_grupo_id uuid, _motivo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  PERFORM public.cierre_reabrir_cascada(g.cliente_id, g.periodo, 'banco',
    'Reversión de una confirmación de conciliación.', 'conciliacion_grupo', g.id::text, 'rev:'||g.id::text||':'||extract(epoch from now())::bigint);
  RETURN jsonb_build_object('ok', true, 'grupo_id', g.id, 'estado', 'propuesto');
END; $function$;

CREATE OR REPLACE FUNCTION public.conciliacion_ignorar_movimiento(_movimiento_id uuid, _motivo text, _no_fiscal boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  PERFORM public.cierre_reabrir_cascada(m.cliente_id, v_periodo, 'banco',
    'Movimiento bancario marcado como no conciliable.', 'movimiento', m.id::text, 'ign:'||m.id::text);
  RETURN jsonb_build_object('ok', true, 'movimiento_id', m.id);
END; $function$;