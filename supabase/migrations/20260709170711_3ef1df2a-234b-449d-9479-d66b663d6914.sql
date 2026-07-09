
-- 1) Prevent privilege escalation: super_admin must have NULL despacho_id, and despacho admins cannot grant super_admin via user_roles INSERT policy.
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'super_admin'::app_role
      AND despacho_id IS NULL
      AND cliente_id IS NULL
  );
$function$;

-- Remove any historical super_admin rows scoped to a despacho/cliente (they were the escalation vector)
DELETE FROM public.user_roles
WHERE role = 'super_admin'::app_role
  AND (despacho_id IS NOT NULL OR cliente_id IS NOT NULL);

DROP POLICY IF EXISTS "roles asigna despacho" ON public.user_roles;
CREATE POLICY "roles asigna despacho" ON public.user_roles
  FOR INSERT
  WITH CHECK (
    role <> 'super_admin'::app_role
    AND despacho_id IS NOT NULL
    AND has_role('despacho'::app_role, despacho_id)
    AND EXISTS (
      SELECT 1 FROM public.user_memberships m
      WHERE m.user_id = user_roles.user_id
        AND m.despacho_id = user_roles.despacho_id
    )
  );

-- 2) Revoke EXECUTE from anon on SECURITY DEFINER functions that shouldn't be publicly callable.
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_ley_articulos(vector, integer, double precision, text[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_ley_articulos(vector, integer, double precision, text[]) TO authenticated;
