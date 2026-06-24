
-- Refuerzo: las políticas RESTRICTIVAS de "restrict assigned" no deben aplicar
-- a dueños del despacho ni a usuarios con rol 'despacho'. Esto evita falsos
-- positivos de "new row violates RLS policy clientes restrict assigned select"
-- cuando un administrador da de alta un RFC y PostgREST hace INSERT...RETURNING.

CREATE OR REPLACE FUNCTION public.is_despacho_admin(_despacho uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _despacho IS NULL OR EXISTS (
    SELECT 1 FROM public.despachos d
    WHERE d.id = _despacho AND d.owner_user_id = auth.uid()
  ) OR public.has_role('despacho'::public.app_role, _despacho);
$$;

-- clientes
DROP POLICY IF EXISTS "clientes restrict assigned select" ON public.clientes;
CREATE POLICY "clientes restrict assigned select" ON public.clientes
AS RESTRICTIVE FOR SELECT TO authenticated
USING (despacho_id IS NULL OR public.is_despacho_admin(despacho_id) OR public.has_cliente_access(id));

DROP POLICY IF EXISTS "clientes restrict assigned update" ON public.clientes;
CREATE POLICY "clientes restrict assigned update" ON public.clientes
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (despacho_id IS NULL OR public.is_despacho_admin(despacho_id) OR public.has_cliente_access(id))
WITH CHECK (despacho_id IS NULL OR public.is_despacho_admin(despacho_id) OR public.has_cliente_access(id));

DROP POLICY IF EXISTS "clientes restrict assigned delete" ON public.clientes;
CREATE POLICY "clientes restrict assigned delete" ON public.clientes
AS RESTRICTIVE FOR DELETE TO authenticated
USING (despacho_id IS NULL OR public.is_despacho_admin(despacho_id) OR public.has_cliente_access(id));

-- rfcs
DROP POLICY IF EXISTS "rfcs restrict assigned select" ON public.rfcs;
CREATE POLICY "rfcs restrict assigned select" ON public.rfcs
AS RESTRICTIVE FOR SELECT TO authenticated
USING (cliente_id IS NULL OR public.is_despacho_admin(despacho_id) OR public.has_cliente_access(cliente_id));

DROP POLICY IF EXISTS "rfcs restrict assigned insert" ON public.rfcs;
CREATE POLICY "rfcs restrict assigned insert" ON public.rfcs
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (cliente_id IS NULL OR public.is_despacho_admin(despacho_id) OR public.has_cliente_access(cliente_id));

DROP POLICY IF EXISTS "rfcs restrict assigned update" ON public.rfcs;
CREATE POLICY "rfcs restrict assigned update" ON public.rfcs
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (cliente_id IS NULL OR public.is_despacho_admin(despacho_id) OR public.has_cliente_access(cliente_id))
WITH CHECK (cliente_id IS NULL OR public.is_despacho_admin(despacho_id) OR public.has_cliente_access(cliente_id));

DROP POLICY IF EXISTS "rfcs restrict assigned delete" ON public.rfcs;
CREATE POLICY "rfcs restrict assigned delete" ON public.rfcs
AS RESTRICTIVE FOR DELETE TO authenticated
USING (cliente_id IS NULL OR public.is_despacho_admin(despacho_id) OR public.has_cliente_access(cliente_id));
