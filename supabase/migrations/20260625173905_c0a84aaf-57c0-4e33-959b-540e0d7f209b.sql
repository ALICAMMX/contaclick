
-- 1) Ampliar pólizas
ALTER TABLE public.polizas DROP CONSTRAINT IF EXISTS polizas_origen_check;
ALTER TABLE public.polizas ADD CONSTRAINT polizas_origen_check
  CHECK (origen = ANY (ARRAY['manual','import','workflow','api','auto_sat']));

ALTER TABLE public.polizas ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'confirmada';
ALTER TABLE public.polizas DROP CONSTRAINT IF EXISTS polizas_estado_check;
ALTER TABLE public.polizas ADD CONSTRAINT polizas_estado_check
  CHECK (estado = ANY (ARRAY['borrador','confirmada','rechazada']));

ALTER TABLE public.polizas ADD COLUMN IF NOT EXISTS cfdi_id UUID
  REFERENCES public.cfdi_xml(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_polizas_cfdi ON public.polizas(cfdi_id) WHERE cfdi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_polizas_estado ON public.polizas(cliente_id, estado);

-- 2) Catálogo de cuentas
CREATE TABLE IF NOT EXISTS public.catalogo_cuentas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  naturaleza TEXT NOT NULL CHECK (naturaleza IN ('deudora','acreedora')),
  tipo_sat TEXT,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, codigo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_cuentas TO authenticated;
GRANT ALL ON public.catalogo_cuentas TO service_role;
ALTER TABLE public.catalogo_cuentas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalogo_cuentas_select" ON public.catalogo_cuentas FOR SELECT TO authenticated
  USING (has_cliente_access(cliente_id));
CREATE POLICY "catalogo_cuentas_insert" ON public.catalogo_cuentas FOR INSERT TO authenticated
  WITH CHECK (has_cliente_access(cliente_id) AND is_member_of(despacho_id));
CREATE POLICY "catalogo_cuentas_update" ON public.catalogo_cuentas FOR UPDATE TO authenticated
  USING (has_cliente_access(cliente_id));
CREATE POLICY "catalogo_cuentas_delete" ON public.catalogo_cuentas FOR DELETE TO authenticated
  USING (has_cliente_access(cliente_id));
CREATE TRIGGER trg_catalogo_cuentas_updated BEFORE UPDATE ON public.catalogo_cuentas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) Reglas contables
CREATE TABLE IF NOT EXISTS public.reglas_contables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  prioridad INT NOT NULL DEFAULT 100,
  condicion JSONB NOT NULL DEFAULT '{}'::jsonb,
  cuenta_cargo TEXT NOT NULL,
  cuenta_abono TEXT NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','aprendida','seed')),
  hits INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reglas_cliente_prio ON public.reglas_contables(cliente_id, prioridad) WHERE activa;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reglas_contables TO authenticated;
GRANT ALL ON public.reglas_contables TO service_role;
ALTER TABLE public.reglas_contables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reglas_contables_select" ON public.reglas_contables FOR SELECT TO authenticated
  USING (has_cliente_access(cliente_id));
CREATE POLICY "reglas_contables_insert" ON public.reglas_contables FOR INSERT TO authenticated
  WITH CHECK (has_cliente_access(cliente_id) AND is_member_of(despacho_id));
CREATE POLICY "reglas_contables_update" ON public.reglas_contables FOR UPDATE TO authenticated
  USING (has_cliente_access(cliente_id));
CREATE POLICY "reglas_contables_delete" ON public.reglas_contables FOR DELETE TO authenticated
  USING (has_cliente_access(cliente_id));
CREATE TRIGGER trg_reglas_contables_updated BEFORE UPDATE ON public.reglas_contables
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
