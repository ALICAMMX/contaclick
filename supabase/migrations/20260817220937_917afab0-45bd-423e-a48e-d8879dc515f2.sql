-- =====================================================================
-- Programación de Descargas Masivas SAT
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sat_programaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,

  zona_horaria text NOT NULL DEFAULT 'America/Mexico_City',
  tipo text NOT NULL DEFAULT 'recurrente' CHECK (tipo IN ('unica','recurrente')),
  recurrencia text NULL CHECK (recurrencia IN ('diaria','semanal','mensual')),
  dias_semana smallint[] NULL,
  dia_mes smallint NULL CHECK (dia_mes IS NULL OR (dia_mes BETWEEN 1 AND 31)),
  hora smallint NOT NULL DEFAULT 2 CHECK (hora BETWEEN 0 AND 23),
  minuto smallint NOT NULL DEFAULT 0 CHECK (minuto BETWEEN 0 AND 59),
  fecha_unica date NULL,

  periodo_opcion text NOT NULL DEFAULT 'desde_ultima'
    CHECK (periodo_opcion IN ('dia_anterior','ultimos_3','ultimos_7','mes_anterior','desde_ultima','rango_fijo')),
  rango_desde date NULL,
  rango_hasta date NULL,
  solapamiento_dias smallint NOT NULL DEFAULT 1 CHECK (solapamiento_dias BETWEEN 0 AND 30),

  emitidos boolean NOT NULL DEFAULT true,
  recibidos boolean NOT NULL DEFAULT true,
  clasificar_nomina boolean NOT NULL DEFAULT true,
  clasificar_pagos boolean NOT NULL DEFAULT true,

  tolerancia_minutos smallint NOT NULL DEFAULT 60 CHECK (tolerancia_minutos BETWEEN 0 AND 720),
  politica_retraso text NOT NULL DEFAULT 'recuperar' CHECK (politica_retraso IN ('recuperar','omitir')),

  proxima_ejecucion_at timestamptz NULL,
  ultima_ejecucion_at timestamptz NULL,
  ultima_programada_at timestamptz NULL,
  ultima_corrida_id uuid NULL,
  ultimo_resultado text NULL,
  ultimo_detalle text NULL,
  ultimo_retraso_ms integer NULL,
  ultima_ocurrencia_key text NULL,

  activa boolean NOT NULL DEFAULT true,
  pausada boolean NOT NULL DEFAULT false,
  cancelada boolean NOT NULL DEFAULT false,

  bloqueo_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  creado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actualizado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Una sola programación viva por expediente.
CREATE UNIQUE INDEX IF NOT EXISTS sat_prog_cliente_viva_uq
  ON public.sat_programaciones (cliente_id)
  WHERE cancelada = false;

CREATE INDEX IF NOT EXISTS sat_prog_debidas_idx
  ON public.sat_programaciones (proxima_ejecucion_at)
  WHERE activa = true AND pausada = false AND cancelada = false;

GRANT SELECT ON public.sat_programaciones TO authenticated;
GRANT ALL ON public.sat_programaciones TO service_role;
ALTER TABLE public.sat_programaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sat_prog_select_despacho"
  ON public.sat_programaciones FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_memberships m
    WHERE m.user_id = auth.uid()
      AND m.despacho_id = sat_programaciones.despacho_id
      AND m.estado = 'activo'
  ) OR EXISTS (
    SELECT 1 FROM public.despachos d
    WHERE d.id = sat_programaciones.despacho_id AND d.owner_user_id = auth.uid()
  ));

-- =====================================================================
-- Bitácora inmutable
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sat_programacion_bitacora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programacion_id uuid NOT NULL REFERENCES public.sat_programaciones(id) ON DELETE CASCADE,
  despacho_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  accion text NOT NULL CHECK (accion IN (
    'creacion','modificacion','pausa','reanudacion','cancelacion',
    'ejecucion','omision','fallo','encolada'
  )),
  programada_at timestamptz NULL,
  retraso_ms integer NULL,
  run_id uuid NULL,
  resultado text NULL,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sat_prog_bit_idx
  ON public.sat_programacion_bitacora (programacion_id, created_at DESC);

GRANT SELECT ON public.sat_programacion_bitacora TO authenticated;
GRANT ALL ON public.sat_programacion_bitacora TO service_role;
ALTER TABLE public.sat_programacion_bitacora ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sat_prog_bit_select_despacho"
  ON public.sat_programacion_bitacora FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_memberships m
    WHERE m.user_id = auth.uid()
      AND m.despacho_id = sat_programacion_bitacora.despacho_id
      AND m.estado = 'activo'
  ) OR EXISTS (
    SELECT 1 FROM public.despachos d
    WHERE d.id = sat_programacion_bitacora.despacho_id AND d.owner_user_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.sat_programacion_bitacora_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora de programaciones SAT es inmutable.';
END;
$$;

DROP TRIGGER IF EXISTS sat_prog_bit_inmutable ON public.sat_programacion_bitacora;
CREATE TRIGGER sat_prog_bit_inmutable
  BEFORE UPDATE OR DELETE ON public.sat_programacion_bitacora
  FOR EACH ROW EXECUTE FUNCTION public.sat_programacion_bitacora_inmutable();

-- =====================================================================
-- updated_at
-- =====================================================================

CREATE OR REPLACE FUNCTION public.sat_programaciones_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sat_programaciones_touch_trg ON public.sat_programaciones;
CREATE TRIGGER sat_programaciones_touch_trg
  BEFORE UPDATE ON public.sat_programaciones
  FOR EACH ROW EXECUTE FUNCTION public.sat_programaciones_touch();

-- =====================================================================
-- Despachador: toma programaciones vencidas con bloqueo transaccional
-- =====================================================================

CREATE OR REPLACE FUNCTION public.sat_programaciones_reclamar(
  _ahora timestamptz DEFAULT now(),
  _limite integer DEFAULT 10
)
RETURNS SETOF public.sat_programaciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH debidas AS (
    SELECT p.id
    FROM public.sat_programaciones p
    WHERE p.activa = true
      AND p.pausada = false
      AND p.cancelada = false
      AND p.proxima_ejecucion_at IS NOT NULL
      AND p.proxima_ejecucion_at <= _ahora
      -- Un bloqueo vivo (menos de 15 min) significa que otro worker la tomó.
      AND (p.bloqueo_at IS NULL OR p.bloqueo_at < _ahora - interval '15 minutes')
    ORDER BY p.proxima_ejecucion_at ASC
    LIMIT GREATEST(_limite, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sat_programaciones s
  SET bloqueo_at = _ahora
  FROM debidas d
  WHERE s.id = d.id
  RETURNING s.*;
END;
$$;

REVOKE ALL ON FUNCTION public.sat_programaciones_reclamar(timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sat_programaciones_reclamar(timestamptz, integer) TO service_role;