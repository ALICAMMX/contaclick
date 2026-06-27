CREATE TABLE public.cupones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  porcentaje NUMERIC(5,2) NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
  vigente_desde TIMESTAMPTZ,
  vigente_hasta TIMESTAMPTZ,
  max_usos INTEGER,
  usos_actuales INTEGER NOT NULL DEFAULT 0,
  planes_permitidos TEXT[],
  ciclos_permitidos TEXT[],
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
GRANT SELECT ON public.cupones TO authenticated;
GRANT ALL ON public.cupones TO service_role;
ALTER TABLE public.cupones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth puede leer cupones activos" ON public.cupones FOR SELECT TO authenticated USING (activo = true);
CREATE POLICY "super admin gestiona cupones" ON public.cupones FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE TRIGGER cupones_updated_at BEFORE UPDATE ON public.cupones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.cupon_redenciones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cupon_id UUID NOT NULL REFERENCES public.cupones(id) ON DELETE CASCADE,
  despacho_id UUID NOT NULL,
  user_id UUID NOT NULL,
  mp_subscription_id UUID REFERENCES public.mp_subscriptions(id) ON DELETE SET NULL,
  plan_id TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  subtotal_original NUMERIC(12,2) NOT NULL,
  descuento NUMERIC(12,2) NOT NULL,
  total_final NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cupon_id, despacho_id)
);
GRANT SELECT, INSERT ON public.cupon_redenciones TO authenticated;
GRANT ALL ON public.cupon_redenciones TO service_role;
ALTER TABLE public.cupon_redenciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "miembros leen sus redenciones" ON public.cupon_redenciones FOR SELECT TO authenticated
  USING (public.is_member_of(despacho_id) OR public.is_super_admin());
CREATE POLICY "miembros insertan sus redenciones" ON public.cupon_redenciones FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_member_of(despacho_id));

CREATE OR REPLACE FUNCTION public.validar_cupon(_codigo TEXT, _plan_id TEXT, _cycle TEXT, _despacho UUID)
RETURNS TABLE(valido BOOLEAN, motivo TEXT, cupon_id UUID, porcentaje NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cupones;
BEGIN
  SELECT * INTO c FROM public.cupones WHERE lower(codigo) = lower(_codigo) LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'Cupón no existe', NULL::uuid, NULL::numeric; RETURN; END IF;
  IF NOT c.activo THEN RETURN QUERY SELECT false, 'Cupón inactivo', c.id, c.porcentaje; RETURN; END IF;
  IF c.vigente_desde IS NOT NULL AND now() < c.vigente_desde THEN RETURN QUERY SELECT false, 'Cupón aún no vigente', c.id, c.porcentaje; RETURN; END IF;
  IF c.vigente_hasta IS NOT NULL AND now() > c.vigente_hasta THEN RETURN QUERY SELECT false, 'Cupón expirado', c.id, c.porcentaje; RETURN; END IF;
  IF c.max_usos IS NOT NULL AND c.usos_actuales >= c.max_usos THEN RETURN QUERY SELECT false, 'Cupón agotado', c.id, c.porcentaje; RETURN; END IF;
  IF c.planes_permitidos IS NOT NULL AND array_length(c.planes_permitidos,1) > 0 AND NOT (_plan_id = ANY(c.planes_permitidos)) THEN
    RETURN QUERY SELECT false, 'Cupón no aplica a este plan', c.id, c.porcentaje; RETURN;
  END IF;
  IF c.ciclos_permitidos IS NOT NULL AND array_length(c.ciclos_permitidos,1) > 0 AND NOT (_cycle = ANY(c.ciclos_permitidos)) THEN
    RETURN QUERY SELECT false, 'Cupón no aplica a este ciclo', c.id, c.porcentaje; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.cupon_redenciones WHERE cupon_id = c.id AND despacho_id = _despacho) THEN
    RETURN QUERY SELECT false, 'Este despacho ya usó este cupón', c.id, c.porcentaje; RETURN;
  END IF;
  RETURN QUERY SELECT true, 'OK'::text, c.id, c.porcentaje;
END; $$;