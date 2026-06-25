-- Snapshots históricos del score de salud fiscal por cliente
CREATE TABLE public.salud_fiscal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo text NOT NULL,
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  semaforo text NOT NULL CHECK (semaforo IN ('verde','amarillo','naranja','rojo')),
  subscores jsonb NOT NULL DEFAULT '{}'::jsonb,
  alertas jsonb NOT NULL DEFAULT '[]'::jsonb,
  hallazgos jsonb NOT NULL DEFAULT '[]'::jsonb,
  recomendaciones jsonb NOT NULL DEFAULT '[]'::jsonb,
  comparativo jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_resumen text,
  computed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, periodo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salud_fiscal_snapshots TO authenticated;
GRANT ALL ON public.salud_fiscal_snapshots TO service_role;

ALTER TABLE public.salud_fiscal_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Miembros del despacho pueden ver snapshots"
  ON public.salud_fiscal_snapshots FOR SELECT TO authenticated
  USING (public.has_cliente_access(cliente_id));

CREATE POLICY "Miembros del despacho pueden insertar snapshots"
  ON public.salud_fiscal_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.has_cliente_access(cliente_id));

CREATE POLICY "Miembros del despacho pueden actualizar snapshots"
  ON public.salud_fiscal_snapshots FOR UPDATE TO authenticated
  USING (public.has_cliente_access(cliente_id))
  WITH CHECK (public.has_cliente_access(cliente_id));

CREATE POLICY "Admin despacho puede eliminar snapshots"
  ON public.salud_fiscal_snapshots FOR DELETE TO authenticated
  USING (public.is_despacho_admin(despacho_id));

CREATE INDEX idx_salud_snapshots_cliente_periodo ON public.salud_fiscal_snapshots (cliente_id, periodo DESC);
CREATE INDEX idx_salud_snapshots_despacho ON public.salud_fiscal_snapshots (despacho_id, created_at DESC);

CREATE TRIGGER update_salud_fiscal_snapshots_updated_at
  BEFORE UPDATE ON public.salud_fiscal_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Permitir que el cliente final vea su salud fiscal en el portal
ALTER TABLE public.cliente_portal_config
  ADD COLUMN IF NOT EXISTS ver_salud_fiscal boolean NOT NULL DEFAULT true;