-- Reporte Ejecutivo + Agente Fiscal IA

CREATE TABLE public.reportes_ejecutivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo TEXT NOT NULL, -- YYYY-MM
  tipo TEXT NOT NULL DEFAULT 'mensual', -- mensual | extraordinario | trimestral
  estado TEXT NOT NULL DEFAULT 'borrador', -- borrador | listo | enviado
  resumen_financiero JSONB NOT NULL DEFAULT '{}'::jsonb,
  resumen_fiscal JSONB NOT NULL DEFAULT '{}'::jsonb,
  salud JSONB NOT NULL DEFAULT '{}'::jsonb,
  conciliacion JSONB NOT NULL DEFAULT '{}'::jsonb,
  obligaciones JSONB NOT NULL DEFAULT '{}'::jsonb,
  riesgos JSONB NOT NULL DEFAULT '{}'::jsonb,
  hallazgos JSONB NOT NULL DEFAULT '[]'::jsonb,
  oportunidades JSONB NOT NULL DEFAULT '[]'::jsonb,
  resumen_ejecutivo TEXT,
  ahorro_estimado_centavos BIGINT NOT NULL DEFAULT 0,
  enviado_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reportes_ejecutivos TO authenticated;
GRANT ALL ON public.reportes_ejecutivos TO service_role;
ALTER TABLE public.reportes_ejecutivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reportes_ej_select" ON public.reportes_ejecutivos
  FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "reportes_ej_insert" ON public.reportes_ejecutivos
  FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "reportes_ej_update" ON public.reportes_ejecutivos
  FOR UPDATE TO authenticated USING (public.is_member_of(despacho_id))
  WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "reportes_ej_delete" ON public.reportes_ejecutivos
  FOR DELETE TO authenticated USING (public.is_despacho_admin(despacho_id));

CREATE INDEX idx_reportes_ej_despacho ON public.reportes_ejecutivos(despacho_id, periodo DESC);
CREATE INDEX idx_reportes_ej_cliente ON public.reportes_ejecutivos(cliente_id, periodo DESC);

CREATE TRIGGER trg_reportes_ej_updated_at BEFORE UPDATE ON public.reportes_ejecutivos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Recomendaciones generadas por la IA
CREATE TABLE public.recomendaciones_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  reporte_id UUID REFERENCES public.reportes_ejecutivos(id) ON DELETE SET NULL,
  categoria TEXT NOT NULL, -- optimizacion | correccion | riesgo_sat | flujo | nomina | otro
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  accion_sugerida TEXT,
  prioridad TEXT NOT NULL DEFAULT 'media', -- alta | media | baja
  impacto_estimado_centavos BIGINT DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | en_proceso | implementada | descartada
  tarea_id UUID REFERENCES public.tareas(id) ON DELETE SET NULL,
  implementada_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recomendaciones_ia TO authenticated;
GRANT ALL ON public.recomendaciones_ia TO service_role;
ALTER TABLE public.recomendaciones_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recom_ia_select" ON public.recomendaciones_ia
  FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "recom_ia_insert" ON public.recomendaciones_ia
  FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "recom_ia_update" ON public.recomendaciones_ia
  FOR UPDATE TO authenticated USING (public.is_member_of(despacho_id))
  WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "recom_ia_delete" ON public.recomendaciones_ia
  FOR DELETE TO authenticated USING (public.is_despacho_admin(despacho_id));

CREATE INDEX idx_recom_ia_despacho ON public.recomendaciones_ia(despacho_id, created_at DESC);
CREATE INDEX idx_recom_ia_cliente ON public.recomendaciones_ia(cliente_id, estado);

CREATE TRIGGER trg_recom_ia_updated_at BEFORE UPDATE ON public.recomendaciones_ia
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Simulaciones estratégicas
CREATE TABLE public.simulaciones_fiscales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  escenario TEXT NOT NULL,
  parametros JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
  narrativa TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulaciones_fiscales TO authenticated;
GRANT ALL ON public.simulaciones_fiscales TO service_role;
ALTER TABLE public.simulaciones_fiscales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sim_fis_select" ON public.simulaciones_fiscales
  FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "sim_fis_insert" ON public.simulaciones_fiscales
  FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "sim_fis_delete" ON public.simulaciones_fiscales
  FOR DELETE TO authenticated USING (public.is_member_of(despacho_id));

CREATE INDEX idx_sim_fis_cliente ON public.simulaciones_fiscales(cliente_id, created_at DESC);
