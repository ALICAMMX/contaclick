
CREATE TABLE public.activos_fijos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  codigo text,
  descripcion text NOT NULL,
  categoria text NOT NULL DEFAULT 'otro',
  fecha_adquisicion date NOT NULL,
  fecha_inicio_uso date,
  moi numeric(14,2) NOT NULL CHECK (moi >= 0),
  tasa_fiscal_anual numeric(5,2) NOT NULL DEFAULT 10 CHECK (tasa_fiscal_anual > 0 AND tasa_fiscal_anual <= 100),
  tasa_contable_anual numeric(5,2),
  valor_residual numeric(14,2) NOT NULL DEFAULT 0,
  metodo text NOT NULL DEFAULT 'linea_recta',
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','baja','vendido','siniestro')),
  ubicacion text,
  responsable text,
  proveedor text,
  factura_uuid text,
  notas text,
  baja_fecha date,
  baja_motivo text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activos_fijos TO authenticated;
GRANT ALL ON public.activos_fijos TO service_role;

ALTER TABLE public.activos_fijos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read activos"
  ON public.activos_fijos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_memberships m
    WHERE m.user_id = auth.uid() AND m.despacho_id = activos_fijos.despacho_id AND m.estado = 'activo'));

CREATE POLICY "members insert activos"
  ON public.activos_fijos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_memberships m
    WHERE m.user_id = auth.uid() AND m.despacho_id = activos_fijos.despacho_id AND m.estado = 'activo'));

CREATE POLICY "members update activos"
  ON public.activos_fijos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_memberships m
    WHERE m.user_id = auth.uid() AND m.despacho_id = activos_fijos.despacho_id AND m.estado = 'activo'));

CREATE POLICY "members delete activos"
  ON public.activos_fijos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_memberships m
    WHERE m.user_id = auth.uid() AND m.despacho_id = activos_fijos.despacho_id AND m.estado = 'activo'));

CREATE INDEX idx_activos_despacho ON public.activos_fijos(despacho_id);
CREATE INDEX idx_activos_cliente ON public.activos_fijos(cliente_id);

CREATE TRIGGER set_activos_updated_at
  BEFORE UPDATE ON public.activos_fijos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
