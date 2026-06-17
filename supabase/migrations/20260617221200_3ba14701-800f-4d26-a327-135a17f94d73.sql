-- Tighten user_roles INSERT: prevent a despacho admin from inserting roles
-- for arbitrary user_ids; the target user must already be a member of the despacho.
DROP POLICY IF EXISTS "roles asigna despacho" ON public.user_roles;
CREATE POLICY "roles asigna despacho"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role('despacho'::app_role, despacho_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_memberships m
      WHERE m.user_id = user_roles.user_id
        AND m.despacho_id = user_roles.despacho_id
    )
  );