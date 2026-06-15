
-- 1. Remove broad SELECT on invitaciones — token lookup now goes through admin server fn
DROP POLICY IF EXISTS "inv select valid by token" ON public.invitaciones;

-- 2. Remove self-insert escalation on user_memberships
DROP POLICY IF EXISTS "membresias insert despacho" ON public.user_memberships;
CREATE POLICY "membresias insert despacho"
  ON public.user_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role('despacho'::app_role, despacho_id));

-- 3. Remove self-insert escalation on user_roles
DROP POLICY IF EXISTS "roles asigna despacho" ON public.user_roles;
CREATE POLICY "roles asigna despacho"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role('despacho'::app_role, despacho_id));

-- 4. Lock down SECURITY DEFINER function execution to least privilege.
-- has_role and is_member_of are used inside RLS policies and must remain executable
-- by authenticated users, but anon does not need them.
REVOKE EXECUTE ON FUNCTION public.has_role(app_role, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_member_of(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
