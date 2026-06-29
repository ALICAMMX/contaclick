
CREATE TABLE IF NOT EXISTS public.buzon_notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  origen TEXT NOT NULL DEFAULT 'SAT',
  asunto TEXT NOT NULL,
  folio TEXT,
  fecha_recibida DATE NOT NULL DEFAULT CURRENT_DATE,
  plazo_dias INTEGER,
  vence_at DATE,
  pdf_base64 TEXT,
  pdf_filename TEXT,
  resumen TEXT,
  ia_analisis JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buzon_despacho ON public.buzon_notificaciones(despacho_id, vence_at);
CREATE INDEX IF NOT EXISTS idx_buzon_cliente ON public.buzon_notificaciones(cliente_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.buzon_notificaciones TO authenticated;
GRANT ALL ON public.buzon_notificaciones TO service_role;

ALTER TABLE public.buzon_notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buzon_select_member" ON public.buzon_notificaciones
  FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "buzon_insert_member" ON public.buzon_notificaciones
  FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "buzon_update_member" ON public.buzon_notificaciones
  FOR UPDATE TO authenticated USING (public.is_member_of(despacho_id)) WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "buzon_delete_admin" ON public.buzon_notificaciones
  FOR DELETE TO authenticated USING (public.is_despacho_admin(despacho_id));

CREATE TRIGGER buzon_set_updated_at
  BEFORE UPDATE ON public.buzon_notificaciones
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.nomina_simulaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  entrada JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nomsim_despacho ON public.nomina_simulaciones(despacho_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nomina_simulaciones TO authenticated;
GRANT ALL ON public.nomina_simulaciones TO service_role;

ALTER TABLE public.nomina_simulaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nomsim_select_member" ON public.nomina_simulaciones
  FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "nomsim_insert_member" ON public.nomina_simulaciones
  FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "nomsim_update_member" ON public.nomina_simulaciones
  FOR UPDATE TO authenticated USING (public.is_member_of(despacho_id)) WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "nomsim_delete_admin" ON public.nomina_simulaciones
  FOR DELETE TO authenticated USING (public.is_despacho_admin(despacho_id));

CREATE TRIGGER nomsim_set_updated_at
  BEFORE UPDATE ON public.nomina_simulaciones
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
