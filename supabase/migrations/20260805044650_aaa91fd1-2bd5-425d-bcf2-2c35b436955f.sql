CREATE TABLE IF NOT EXISTS public.programa_fundador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL UNIQUE REFERENCES public.despachos(id) ON DELETE CASCADE,
  fecha_ingreso date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  descuento_pct integer NOT NULL DEFAULT 40,
  precio_anual_acordado_centavos bigint,
  plan_id text,
  renovaciones_cubiertas integer NOT NULL DEFAULT 1,
  fecha_renovacion date,
  responsable_onboarding text,
  ultima_sesion_feedback date,
  proxima_sesion_feedback date,
  estado text NOT NULL DEFAULT 'activo',
  notas text,
  creado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.programa_fundador
  DROP CONSTRAINT IF EXISTS programa_fundador_estado_check;
ALTER TABLE public.programa_fundador
  ADD CONSTRAINT programa_fundador_estado_check
  CHECK (estado IN ('activo','pausado','vencido','cancelado'));

ALTER TABLE public.programa_fundador
  DROP CONSTRAINT IF EXISTS programa_fundador_descuento_check;
ALTER TABLE public.programa_fundador
  ADD CONSTRAINT programa_fundador_descuento_check
  CHECK (descuento_pct >= 0 AND descuento_pct <= 100);

GRANT SELECT ON public.programa_fundador TO authenticated;
GRANT ALL ON public.programa_fundador TO service_role;

ALTER TABLE public.programa_fundador ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fundador select propio" ON public.programa_fundador;
CREATE POLICY "fundador select propio" ON public.programa_fundador
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.is_member_of(despacho_id));

DROP POLICY IF EXISTS "fundador admin all" ON public.programa_fundador;
CREATE POLICY "fundador admin all" ON public.programa_fundador
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.touch_programa_fundador()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_programa_fundador ON public.programa_fundador;
CREATE TRIGGER trg_touch_programa_fundador
  BEFORE UPDATE ON public.programa_fundador
  FOR EACH ROW EXECUTE FUNCTION public.touch_programa_fundador();