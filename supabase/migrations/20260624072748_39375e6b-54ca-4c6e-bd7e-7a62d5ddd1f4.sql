
ALTER TABLE public.despachos
  ADD COLUMN IF NOT EXISTS acceso_restringido boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.cliente_asignaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (cliente_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cliente_asignaciones_user ON public.cliente_asignaciones(user_id);
CREATE INDEX IF NOT EXISTS idx_cliente_asignaciones_despacho ON public.cliente_asignaciones(despacho_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_asignaciones TO authenticated;
GRANT ALL ON public.cliente_asignaciones TO service_role;

ALTER TABLE public.cliente_asignaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read dispatch assignments"
  ON public.cliente_asignaciones FOR SELECT TO authenticated
  USING (public.is_member_of(despacho_id));

CREATE POLICY "admins insert assignments"
  ON public.cliente_asignaciones FOR INSERT TO authenticated
  WITH CHECK (public.has_role('despacho'::public.app_role, despacho_id));

CREATE POLICY "admins update assignments"
  ON public.cliente_asignaciones FOR UPDATE TO authenticated
  USING (public.has_role('despacho'::public.app_role, despacho_id))
  WITH CHECK (public.has_role('despacho'::public.app_role, despacho_id));

CREATE POLICY "admins delete assignments"
  ON public.cliente_asignaciones FOR DELETE TO authenticated
  USING (public.has_role('despacho'::public.app_role, despacho_id));

CREATE OR REPLACE FUNCTION public.has_cliente_access(_cliente uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clientes c
    JOIN public.despachos d ON d.id = c.despacho_id
    WHERE c.id = _cliente
      AND public.is_member_of(c.despacho_id)
      AND (
        d.acceso_restringido = false
        OR d.owner_user_id = auth.uid()
        OR public.has_role('despacho'::public.app_role, c.despacho_id)
        OR EXISTS (
          SELECT 1 FROM public.cliente_asignaciones a
          WHERE a.cliente_id = _cliente AND a.user_id = auth.uid()
        )
      )
  );
$$;
