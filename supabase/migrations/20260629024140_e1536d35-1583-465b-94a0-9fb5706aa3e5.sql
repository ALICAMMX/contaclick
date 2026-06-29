-- Cumplimiento Laboral: checklist con vencimientos y evidencia
CREATE TABLE public.cumplimiento_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  area TEXT NOT NULL CHECK (area IN ('IMSS','INFONAVIT','SAT','STPS','Estatal','Otro')),
  item TEXT NOT NULL,
  descripcion TEXT,
  frecuencia TEXT NOT NULL CHECK (frecuencia IN ('mensual','bimestral','trimestral','semestral','anual','unica','continuo')),
  proximo_vencimiento DATE,
  ultimo_cumplido DATE,
  evidencia_url TEXT,
  responsable TEXT,
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','cumplido','vencido','na')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cumplimiento_items TO authenticated;
GRANT ALL ON public.cumplimiento_items TO service_role;

ALTER TABLE public.cumplimiento_items ENABLE ROW LEVEL SECURITY;

-- Lectura: miembros del despacho
CREATE POLICY "members read cumplimiento"
  ON public.cumplimiento_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_memberships m
    WHERE m.user_id = auth.uid() AND m.despacho_id = cumplimiento_items.despacho_id AND m.estado = 'activo'
  ));

-- Escritura/actualización/borrado: miembros del despacho
CREATE POLICY "members insert cumplimiento"
  ON public.cumplimiento_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_memberships m
    WHERE m.user_id = auth.uid() AND m.despacho_id = cumplimiento_items.despacho_id AND m.estado = 'activo'
  ));

CREATE POLICY "members update cumplimiento"
  ON public.cumplimiento_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_memberships m
    WHERE m.user_id = auth.uid() AND m.despacho_id = cumplimiento_items.despacho_id AND m.estado = 'activo'
  ));

CREATE POLICY "members delete cumplimiento"
  ON public.cumplimiento_items FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_memberships m
    WHERE m.user_id = auth.uid() AND m.despacho_id = cumplimiento_items.despacho_id AND m.estado = 'activo'
  ));

CREATE INDEX idx_cumplimiento_despacho ON public.cumplimiento_items(despacho_id);
CREATE INDEX idx_cumplimiento_cliente ON public.cumplimiento_items(cliente_id);
CREATE INDEX idx_cumplimiento_venc ON public.cumplimiento_items(proximo_vencimiento);

CREATE TRIGGER set_cumplimiento_updated_at
  BEFORE UPDATE ON public.cumplimiento_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
