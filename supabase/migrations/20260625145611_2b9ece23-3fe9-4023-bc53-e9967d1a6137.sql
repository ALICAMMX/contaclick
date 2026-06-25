
-- 1.1 Contadores SAT en uso_periodo
ALTER TABLE public.uso_periodo
  ADD COLUMN IF NOT EXISTS sat_solicitudes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sat_costo_centavos bigint NOT NULL DEFAULT 0;

-- 1.2 Actualizar planes.limites con cuota SAT
UPDATE public.planes SET limites = limites
  || jsonb_build_object('sat_solicitudes_mes', 600, 'sat_frecuencia_max', 'semanal')
  WHERE clave = 'starter';
UPDATE public.planes SET limites = limites
  || jsonb_build_object('sat_solicitudes_mes', 3500, 'sat_frecuencia_max', 'diaria')
  WHERE clave = 'pro';
UPDATE public.planes SET limites = limites
  || jsonb_build_object('sat_solicitudes_mes', 15000, 'sat_frecuencia_max', 'diaria')
  WHERE clave = 'despacho';
UPDATE public.planes SET limites = limites
  || jsonb_build_object('sat_solicitudes_mes', -1, 'sat_frecuencia_max', 'diaria')
  WHERE clave = 'enterprise';

-- 1.3 Tabla singleton de saldo PAC
CREATE TABLE IF NOT EXISTS public.sat_pac_saldo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor text NOT NULL DEFAULT 'sw_sapien',
  saldo_solicitudes integer NOT NULL DEFAULT 0,
  costo_unitario_centavos integer NOT NULL DEFAULT 50, -- $0.50 MXN por solicitud aprox
  umbral_aviso integer NOT NULL DEFAULT 1000,
  consumido_total bigint NOT NULL DEFAULT 0,
  recargado_total bigint NOT NULL DEFAULT 0,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid REFERENCES auth.users(id),
  CONSTRAINT sat_pac_saldo_singleton UNIQUE (proveedor)
);

GRANT SELECT, UPDATE ON public.sat_pac_saldo TO authenticated;
GRANT ALL ON public.sat_pac_saldo TO service_role;
ALTER TABLE public.sat_pac_saldo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sat_pac_saldo super admin select"
  ON public.sat_pac_saldo FOR SELECT TO authenticated
  USING (public.is_super_admin());
CREATE POLICY "sat_pac_saldo super admin update"
  ON public.sat_pac_saldo FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Sembrar fila singleton si no existe
INSERT INTO public.sat_pac_saldo (proveedor, saldo_solicitudes, costo_unitario_centavos, umbral_aviso)
VALUES ('sw_sapien', 0, 50, 1000)
ON CONFLICT (proveedor) DO NOTHING;

-- 1.4 RPC atómico para incrementar consumo SAT (espejo de incrementar_uso_ia)
CREATE OR REPLACE FUNCTION public.incrementar_uso_sat(
  _despacho uuid, _periodo text, _solicitudes integer, _costo_centavos bigint
) RETURNS public.uso_periodo
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.uso_periodo;
BEGIN
  IF NOT public.is_member_of(_despacho) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  INSERT INTO public.uso_periodo (despacho_id, periodo, sat_solicitudes, sat_costo_centavos)
  VALUES (_despacho, _periodo, _solicitudes, _costo_centavos)
  ON CONFLICT (despacho_id, periodo) DO UPDATE SET
    sat_solicitudes = uso_periodo.sat_solicitudes + EXCLUDED.sat_solicitudes,
    sat_costo_centavos = uso_periodo.sat_costo_centavos + EXCLUDED.sat_costo_centavos,
    updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

-- 1.5 RPC para descontar saldo global (solo cuenta del PAC, requiere service_role o super_admin)
CREATE OR REPLACE FUNCTION public.descontar_saldo_pac(_solicitudes integer, _costo_centavos bigint)
RETURNS public.sat_pac_saldo
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.sat_pac_saldo;
BEGIN
  UPDATE public.sat_pac_saldo
    SET saldo_solicitudes = GREATEST(0, saldo_solicitudes - _solicitudes),
        consumido_total = consumido_total + _solicitudes,
        actualizado_at = now()
    WHERE proveedor = 'sw_sapien'
    RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

-- 1.6 RPC para registrar recarga (solo super_admin)
CREATE OR REPLACE FUNCTION public.recargar_saldo_pac(_solicitudes integer, _costo_total_centavos bigint)
RETURNS public.sat_pac_saldo
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.sat_pac_saldo;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Solo super-admin puede recargar saldo PAC';
  END IF;
  UPDATE public.sat_pac_saldo
    SET saldo_solicitudes = saldo_solicitudes + _solicitudes,
        costo_unitario_centavos = CASE WHEN _solicitudes > 0
          THEN GREATEST(1, (_costo_total_centavos / _solicitudes)::integer)
          ELSE costo_unitario_centavos END,
        recargado_total = recargado_total + _solicitudes,
        actualizado_at = now(),
        actualizado_por = auth.uid()
    WHERE proveedor = 'sw_sapien'
    RETURNING * INTO v_row;
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, metadata)
  VALUES (auth.uid(), 'sat_pac.recarga', 'sat_pac_saldo', v_row.id::text,
          jsonb_build_object('solicitudes', _solicitudes, 'costo_total_centavos', _costo_total_centavos));
  RETURN v_row;
END; $$;
