
-- ============ CXC ============
CREATE TABLE public.cxc (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  contraparte text NOT NULL,
  concepto text,
  monto numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'MXN',
  fecha_emision date NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento date NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','cobrado','cancelado')),
  notas text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cxc_despacho_idx ON public.cxc(despacho_id);
CREATE INDEX cxc_cliente_idx ON public.cxc(cliente_id);
CREATE INDEX cxc_vto_idx ON public.cxc(fecha_vencimiento);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cxc TO authenticated;
GRANT ALL ON public.cxc TO service_role;

ALTER TABLE public.cxc ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cxc miembros select" ON public.cxc FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "cxc miembros insert" ON public.cxc FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "cxc miembros update" ON public.cxc FOR UPDATE TO authenticated USING (public.is_member_of(despacho_id)) WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "cxc miembros delete" ON public.cxc FOR DELETE TO authenticated USING (public.is_member_of(despacho_id));

CREATE TRIGGER cxc_updated_at BEFORE UPDATE ON public.cxc FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ CXP ============
CREATE TABLE public.cxp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  contraparte text NOT NULL,
  concepto text,
  monto numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'MXN',
  fecha_emision date NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento date NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagado','cancelado')),
  notas text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cxp_despacho_idx ON public.cxp(despacho_id);
CREATE INDEX cxp_cliente_idx ON public.cxp(cliente_id);
CREATE INDEX cxp_vto_idx ON public.cxp(fecha_vencimiento);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cxp TO authenticated;
GRANT ALL ON public.cxp TO service_role;

ALTER TABLE public.cxp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cxp miembros select" ON public.cxp FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "cxp miembros insert" ON public.cxp FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "cxp miembros update" ON public.cxp FOR UPDATE TO authenticated USING (public.is_member_of(despacho_id)) WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "cxp miembros delete" ON public.cxp FOR DELETE TO authenticated USING (public.is_member_of(despacho_id));

CREATE TRIGGER cxp_updated_at BEFORE UPDATE ON public.cxp FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ TRAMITES ============
CREATE TABLE public.tramites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  descripcion text,
  autoridad text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_proceso','esperando_autoridad','resuelto')),
  fecha_vencimiento date,
  responsable uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notas text,
  orden integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tramites_despacho_idx ON public.tramites(despacho_id);
CREATE INDEX tramites_cliente_idx ON public.tramites(cliente_id);
CREATE INDEX tramites_estado_idx ON public.tramites(estado);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tramites TO authenticated;
GRANT ALL ON public.tramites TO service_role;

ALTER TABLE public.tramites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tramites miembros select" ON public.tramites FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "tramites miembros insert" ON public.tramites FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "tramites miembros update" ON public.tramites FOR UPDATE TO authenticated USING (public.is_member_of(despacho_id)) WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "tramites miembros delete" ON public.tramites FOR DELETE TO authenticated USING (public.is_member_of(despacho_id));

CREATE TRIGGER tramites_updated_at BEFORE UPDATE ON public.tramites FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
