-- 1. Almacén privado de secretos para el cron (sólo service_role/postgres)
CREATE TABLE IF NOT EXISTS public.cron_secretos (
  nombre text PRIMARY KEY,
  valor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.cron_secretos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cron_secretos TO service_role;
ALTER TABLE public.cron_secretos ENABLE ROW LEVEL SECURITY;
-- Sin políticas: ningún rol con RLS puede leerla.

CREATE OR REPLACE FUNCTION public.cron_secreto(_nombre text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT valor FROM public.cron_secretos WHERE nombre = _nombre $$;
REVOKE ALL ON FUNCTION public.cron_secreto(text) FROM PUBLIC, anon, authenticated;

-- 2. Actor explícito protegido: nadie puede evaluar el alcance de otro usuario.
CREATE OR REPLACE FUNCTION public.has_cliente_access_for(_cliente uuid, _user uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v boolean;
BEGIN
  IF _user IS NULL THEN
    RAISE EXCEPTION 'Actor no válido para evaluar el alcance.';
  END IF;
  -- auth.uid() es nulo sólo para service_role/postgres (despachador interno).
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user THEN
    RAISE EXCEPTION 'No puedes evaluar el alcance de otro usuario.';
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM public.clientes c
    JOIN public.despachos d ON d.id = c.despacho_id
    WHERE c.id = _cliente
      AND (
        d.owner_user_id = _user
        OR EXISTS (
          SELECT 1 FROM public.user_memberships m
          WHERE m.user_id = _user AND m.despacho_id = c.despacho_id AND m.estado = 'activo'
        )
      )
      AND (
        CASE
          WHEN d.owner_user_id = _user THEN true
          WHEN EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = _user AND ur.role = 'despacho'::public.app_role
              AND ur.despacho_id = c.despacho_id
          ) THEN true
          WHEN EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = _user AND ur.role = 'cliente_final'::public.app_role
              AND ur.despacho_id = c.despacho_id
          ) THEN EXISTS (
            SELECT 1 FROM public.cliente_asignaciones a
            WHERE a.cliente_id = COALESCE(c.cliente_padre_id, c.id) AND a.user_id = _user
          )
          ELSE d.acceso_restringido = false
            OR EXISTS (
              SELECT 1 FROM public.cliente_asignaciones a
              WHERE a.cliente_id = COALESCE(c.cliente_padre_id, c.id) AND a.user_id = _user
            )
        END
      )
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.has_cliente_access_for(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_cliente_access_for(uuid, uuid) TO authenticated, service_role;

-- 3. Permiso administrativo acotado al despacho
CREATE OR REPLACE FUNCTION public.sat_prog_puede_administrar(_user uuid, _despacho uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.despachos d WHERE d.id = _despacho AND d.owner_user_id = _user)
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = _user
          AND (
            ur.role = 'super_admin'::public.app_role
            OR (ur.role IN ('despacho'::public.app_role, 'contador'::public.app_role)
                AND ur.despacho_id = _despacho)
          )
      );
$$;
REVOKE ALL ON FUNCTION public.sat_prog_puede_administrar(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sat_prog_puede_administrar(uuid, uuid) TO authenticated, service_role;

-- 4. Escritura canónica: se retira la escritura directa
REVOKE INSERT, UPDATE, DELETE ON public.sat_programaciones FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sat_programacion_bitacora FROM authenticated;
GRANT SELECT ON public.sat_programaciones TO authenticated;
GRANT SELECT ON public.sat_programacion_bitacora TO authenticated;
GRANT ALL ON public.sat_programaciones TO service_role;
GRANT ALL ON public.sat_programacion_bitacora TO service_role;

CREATE OR REPLACE FUNCTION public.sat_programacion_guardar(
  _cliente uuid,
  _fila jsonb,
  _detalle jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_despacho uuid;
  v_previa public.sat_programaciones%ROWTYPE;
  v_id uuid;
  v_bit uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida.';
  END IF;
  SELECT c.despacho_id INTO v_despacho FROM public.clientes c WHERE c.id = _cliente;
  IF v_despacho IS NULL THEN
    RAISE EXCEPTION 'El expediente no existe o no está vinculado a un despacho.';
  END IF;
  IF NOT public.has_cliente_access_for(_cliente, v_actor) THEN
    RAISE EXCEPTION 'No tienes acceso a este expediente.';
  END IF;
  IF NOT public.sat_prog_puede_administrar(v_actor, v_despacho) THEN
    RAISE EXCEPTION 'No tienes permiso para administrar la programación de descargas SAT en este despacho.';
  END IF;

  SELECT * INTO v_previa FROM public.sat_programaciones
   WHERE cliente_id = _cliente AND cancelada = false
   FOR UPDATE;

  IF v_previa.id IS NOT NULL THEN
    UPDATE public.sat_programaciones SET
      zona_horaria = _fila->>'zona_horaria',
      tipo = _fila->>'tipo',
      recurrencia = NULLIF(_fila->>'recurrencia',''),
      dias_semana = COALESCE((SELECT array_agg((x)::int) FROM jsonb_array_elements_text(COALESCE(_fila->'dias_semana','[]'::jsonb)) x), '{}'::int[]),
      dia_mes = NULLIF(_fila->>'dia_mes','')::int,
      hora = (_fila->>'hora')::int,
      minuto = (_fila->>'minuto')::int,
      fecha_unica = NULLIF(_fila->>'fecha_unica','')::date,
      periodo_opcion = _fila->>'periodo_opcion',
      rango_desde = NULLIF(_fila->>'rango_desde','')::date,
      rango_hasta = NULLIF(_fila->>'rango_hasta','')::date,
      solapamiento_dias = (_fila->>'solapamiento_dias')::int,
      emitidos = (_fila->>'emitidos')::boolean,
      recibidos = (_fila->>'recibidos')::boolean,
      clasificar_nomina = (_fila->>'clasificar_nomina')::boolean,
      clasificar_pagos = (_fila->>'clasificar_pagos')::boolean,
      tolerancia_minutos = (_fila->>'tolerancia_minutos')::int,
      politica_retraso = _fila->>'politica_retraso',
      activa = (_fila->>'activa')::boolean,
      pausada = false,
      proxima_ejecucion_at = NULLIF(_fila->>'proxima_ejecucion_at','')::timestamptz,
      actualizado_por = v_actor,
      version = COALESCE(v_previa.version, 1) + 1
    WHERE id = v_previa.id;
    v_id := v_previa.id;
  ELSE
    INSERT INTO public.sat_programaciones (
      despacho_id, cliente_id, zona_horaria, tipo, recurrencia, dias_semana, dia_mes,
      hora, minuto, fecha_unica, periodo_opcion, rango_desde, rango_hasta,
      solapamiento_dias, emitidos, recibidos, clasificar_nomina, clasificar_pagos,
      tolerancia_minutos, politica_retraso, activa, pausada, proxima_ejecucion_at,
      creado_por, actualizado_por
    ) VALUES (
      v_despacho, _cliente, _fila->>'zona_horaria', _fila->>'tipo', NULLIF(_fila->>'recurrencia',''),
      COALESCE((SELECT array_agg((x)::int) FROM jsonb_array_elements_text(COALESCE(_fila->'dias_semana','[]'::jsonb)) x), '{}'::int[]),
      NULLIF(_fila->>'dia_mes','')::int, (_fila->>'hora')::int, (_fila->>'minuto')::int,
      NULLIF(_fila->>'fecha_unica','')::date, _fila->>'periodo_opcion',
      NULLIF(_fila->>'rango_desde','')::date, NULLIF(_fila->>'rango_hasta','')::date,
      (_fila->>'solapamiento_dias')::int, (_fila->>'emitidos')::boolean, (_fila->>'recibidos')::boolean,
      (_fila->>'clasificar_nomina')::boolean, (_fila->>'clasificar_pagos')::boolean,
      (_fila->>'tolerancia_minutos')::int, _fila->>'politica_retraso',
      (_fila->>'activa')::boolean, false, NULLIF(_fila->>'proxima_ejecucion_at','')::timestamptz,
      v_actor, v_actor
    ) RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.sat_programacion_bitacora (
    programacion_id, despacho_id, cliente_id, accion, actor_user_id, detalle
  ) VALUES (
    v_id, v_despacho, _cliente,
    CASE WHEN v_previa.id IS NOT NULL THEN 'modificacion' ELSE 'creacion' END,
    v_actor, COALESCE(_detalle, '{}'::jsonb)
  ) RETURNING id INTO v_bit;

  IF v_bit IS NULL THEN
    RAISE EXCEPTION 'No se pudo registrar la bitácora de la programación.';
  END IF;

  RETURN jsonb_build_object('id', v_id, 'creada', v_previa.id IS NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.sat_programacion_guardar(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sat_programacion_guardar(uuid, jsonb, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sat_programacion_cambiar_estado(
  _cliente uuid,
  _accion text,
  _proxima timestamptz DEFAULT NULL,
  _detalle jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_despacho uuid;
  v_p public.sat_programaciones%ROWTYPE;
  v_bit uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Sesión requerida.'; END IF;
  IF _accion NOT IN ('pausar','reanudar','cancelar') THEN
    RAISE EXCEPTION 'Acción no soportada.';
  END IF;
  SELECT c.despacho_id INTO v_despacho FROM public.clientes c WHERE c.id = _cliente;
  IF v_despacho IS NULL THEN RAISE EXCEPTION 'El expediente no existe.'; END IF;
  IF NOT public.has_cliente_access_for(_cliente, v_actor) THEN
    RAISE EXCEPTION 'No tienes acceso a este expediente.';
  END IF;
  IF NOT public.sat_prog_puede_administrar(v_actor, v_despacho) THEN
    RAISE EXCEPTION 'No tienes permiso para administrar la programación de descargas SAT en este despacho.';
  END IF;

  SELECT * INTO v_p FROM public.sat_programaciones
   WHERE cliente_id = _cliente AND cancelada = false FOR UPDATE;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'Este expediente no tiene una programación activa.';
  END IF;

  IF _accion = 'pausar' THEN
    UPDATE public.sat_programaciones
       SET pausada = true, actualizado_por = v_actor, version = COALESCE(version,1) + 1
     WHERE id = v_p.id;
  ELSIF _accion = 'reanudar' THEN
    UPDATE public.sat_programaciones
       SET pausada = false, proxima_ejecucion_at = _proxima,
           actualizado_por = v_actor, version = COALESCE(version,1) + 1
     WHERE id = v_p.id;
  ELSE
    UPDATE public.sat_programaciones
       SET cancelada = true, activa = false, proxima_ejecucion_at = NULL,
           actualizado_por = v_actor, version = COALESCE(version,1) + 1
     WHERE id = v_p.id;
  END IF;

  INSERT INTO public.sat_programacion_bitacora (
    programacion_id, despacho_id, cliente_id, accion, actor_user_id, detalle
  ) VALUES (
    v_p.id, v_despacho, _cliente,
    CASE _accion WHEN 'pausar' THEN 'pausa' WHEN 'reanudar' THEN 'reanudacion' ELSE 'cancelacion' END,
    v_actor, COALESCE(_detalle, '{}'::jsonb)
  ) RETURNING id INTO v_bit;

  IF v_bit IS NULL THEN
    RAISE EXCEPTION 'No se pudo registrar la bitácora de la programación.';
  END IF;

  RETURN jsonb_build_object('id', v_p.id, 'accion', _accion);
END;
$$;
REVOKE ALL ON FUNCTION public.sat_programacion_cambiar_estado(uuid, text, timestamptz, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sat_programacion_cambiar_estado(uuid, text, timestamptz, jsonb) TO authenticated, service_role;

-- 5. El cron envía el secreto exclusivo (rotable sin tocar código)
SELECT cron.unschedule('sat-programaciones-cada-minuto')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sat-programaciones-cada-minuto');

SELECT cron.schedule(
  'sat-programaciones-cada-minuto',
  '* * * * *',
  $cron$
  select net.http_post(
    url:='https://project--0afe7814-273e-44c3-835b-c1945ea1340d.lovable.app/api/public/hooks/sat-programaciones',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', coalesce(public.cron_secreto('SAT_PROGRAMACIONES_CRON_SECRET'), '')
    ),
    body:='{}'::jsonb
  ) as request_id;
  $cron$
);

SELECT cron.unschedule('sat-cron-secreto-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sat-cron-secreto-sync');

SELECT cron.schedule(
  'sat-cron-secreto-sync',
  '*/15 * * * *',
  $cron$
  select net.http_get(
    url:='https://project--0afe7814-273e-44c3-835b-c1945ea1340d.lovable.app/api/public/hooks/sat-programaciones'
  ) as request_id;
  $cron$
);