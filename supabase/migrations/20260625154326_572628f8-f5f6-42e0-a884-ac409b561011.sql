-- =====================================================
-- POLIZAS (capa contable mínima)
-- =====================================================
CREATE TABLE public.polizas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso','diario')),
  fecha DATE NOT NULL,
  concepto TEXT,
  monto NUMERIC(18,2) NOT NULL DEFAULT 0,
  cuenta TEXT,
  referencia TEXT,
  uuid_cfdi TEXT,
  movimiento_bancario_id UUID REFERENCES public.movimientos_bancarios(id) ON DELETE SET NULL,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','import','workflow','api')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_polizas_cliente_fecha ON public.polizas(cliente_id, fecha);
CREATE INDEX idx_polizas_uuid ON public.polizas(uuid_cfdi) WHERE uuid_cfdi IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.polizas TO authenticated;
GRANT ALL ON public.polizas TO service_role;
ALTER TABLE public.polizas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "polizas_select" ON public.polizas FOR SELECT TO authenticated
  USING (public.has_cliente_access(cliente_id));
CREATE POLICY "polizas_insert" ON public.polizas FOR INSERT TO authenticated
  WITH CHECK (public.has_cliente_access(cliente_id) AND public.is_member_of(despacho_id));
CREATE POLICY "polizas_update" ON public.polizas FOR UPDATE TO authenticated
  USING (public.has_cliente_access(cliente_id)) WITH CHECK (public.has_cliente_access(cliente_id));
CREATE POLICY "polizas_delete" ON public.polizas FOR DELETE TO authenticated
  USING (public.has_cliente_access(cliente_id));

CREATE TRIGGER trg_polizas_updated BEFORE UPDATE ON public.polizas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- CONCILIACION INTEGRAL RUNS
-- =====================================================
CREATE TABLE public.conciliacion_integral_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  desde DATE NOT NULL,
  hasta DATE NOT NULL,
  score_consistencia INTEGER NOT NULL DEFAULT 100,
  kpis JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_incidencias INTEGER NOT NULL DEFAULT 0,
  criticas INTEGER NOT NULL DEFAULT 0,
  medias INTEGER NOT NULL DEFAULT 0,
  bajas INTEGER NOT NULL DEFAULT 0,
  monto_observado NUMERIC(18,2) NOT NULL DEFAULT 0,
  trigger_origen TEXT NOT NULL DEFAULT 'manual',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ci_runs_cliente ON public.conciliacion_integral_runs(cliente_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliacion_integral_runs TO authenticated;
GRANT ALL ON public.conciliacion_integral_runs TO service_role;
ALTER TABLE public.conciliacion_integral_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ci_runs_select" ON public.conciliacion_integral_runs FOR SELECT TO authenticated
  USING (public.has_cliente_access(cliente_id));
CREATE POLICY "ci_runs_insert" ON public.conciliacion_integral_runs FOR INSERT TO authenticated
  WITH CHECK (public.has_cliente_access(cliente_id) AND public.is_member_of(despacho_id));
CREATE POLICY "ci_runs_delete" ON public.conciliacion_integral_runs FOR DELETE TO authenticated
  USING (public.is_despacho_admin(despacho_id));

-- =====================================================
-- INCIDENCIAS
-- =====================================================
CREATE TABLE public.conciliacion_incidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.conciliacion_integral_runs(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'ingreso_sat_sin_poliza','gasto_sat_sin_poliza','pago_banco_sin_cfdi',
    'cfdi_sin_movimiento','diferencia_monto','cfdi_duplicado','cfdi_cancelado_no_ajustado'
  )),
  gravedad TEXT NOT NULL DEFAULT 'media' CHECK (gravedad IN ('critica','media','baja')),
  estatus TEXT NOT NULL DEFAULT 'abierta' CHECK (estatus IN ('abierta','revisada','escalada','resuelta','falso_positivo')),
  fecha DATE,
  monto NUMERIC(18,2) NOT NULL DEFAULT 0,
  cfdi_id UUID REFERENCES public.cfdi_xml(id) ON DELETE SET NULL,
  poliza_id UUID REFERENCES public.polizas(id) ON DELETE SET NULL,
  movimiento_id UUID REFERENCES public.movimientos_bancarios(id) ON DELETE SET NULL,
  ref_hash TEXT NOT NULL,
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  recomendacion TEXT,
  explicacion_ia TEXT,
  impacto_isr NUMERIC(18,2) NOT NULL DEFAULT 0,
  impacto_iva NUMERIC(18,2) NOT NULL DEFAULT 0,
  tarea_id UUID REFERENCES public.tareas(id) ON DELETE SET NULL,
  resuelta_at TIMESTAMPTZ,
  resuelta_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, tipo, ref_hash)
);
CREATE INDEX idx_ci_inc_cliente ON public.conciliacion_incidencias(cliente_id, estatus, gravedad);
CREATE INDEX idx_ci_inc_run ON public.conciliacion_incidencias(run_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliacion_incidencias TO authenticated;
GRANT ALL ON public.conciliacion_incidencias TO service_role;
ALTER TABLE public.conciliacion_incidencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ci_inc_select" ON public.conciliacion_incidencias FOR SELECT TO authenticated
  USING (public.has_cliente_access(cliente_id));
CREATE POLICY "ci_inc_insert" ON public.conciliacion_incidencias FOR INSERT TO authenticated
  WITH CHECK (public.has_cliente_access(cliente_id) AND public.is_member_of(despacho_id));
CREATE POLICY "ci_inc_update" ON public.conciliacion_incidencias FOR UPDATE TO authenticated
  USING (public.has_cliente_access(cliente_id)) WITH CHECK (public.has_cliente_access(cliente_id));
CREATE POLICY "ci_inc_delete" ON public.conciliacion_incidencias FOR DELETE TO authenticated
  USING (public.is_despacho_admin(despacho_id));

CREATE TRIGGER trg_ci_inc_updated BEFORE UPDATE ON public.conciliacion_incidencias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- SCORE HISTORICO
-- =====================================================
CREATE TABLE public.conciliacion_score_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.conciliacion_integral_runs(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  criticas INTEGER NOT NULL DEFAULT 0,
  medias INTEGER NOT NULL DEFAULT 0,
  bajas INTEGER NOT NULL DEFAULT 0,
  monto_observado NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ci_score_cliente ON public.conciliacion_score_historico(cliente_id, created_at DESC);

GRANT SELECT, INSERT ON public.conciliacion_score_historico TO authenticated;
GRANT ALL ON public.conciliacion_score_historico TO service_role;
ALTER TABLE public.conciliacion_score_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ci_score_select" ON public.conciliacion_score_historico FOR SELECT TO authenticated
  USING (public.has_cliente_access(cliente_id));
CREATE POLICY "ci_score_insert" ON public.conciliacion_score_historico FOR INSERT TO authenticated
  WITH CHECK (public.has_cliente_access(cliente_id) AND public.is_member_of(despacho_id));