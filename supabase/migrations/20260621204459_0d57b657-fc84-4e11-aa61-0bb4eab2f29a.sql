
-- 1) Revoke EXECUTE on SECURITY DEFINER helpers from anon/public; keep authenticated where appropriate.
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(public.app_role, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(public.app_role, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_member_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_member_of(uuid) TO authenticated;

-- 2) Auto-cleanup orphaned roles when a user is removed from a despacho's membership.
CREATE OR REPLACE FUNCTION public.cleanup_roles_on_membership_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_roles
  WHERE user_id = OLD.user_id AND despacho_id = OLD.despacho_id;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_roles_on_membership_removal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cleanup_roles_on_membership_delete ON public.user_memberships;
CREATE TRIGGER trg_cleanup_roles_on_membership_delete
AFTER DELETE ON public.user_memberships
FOR EACH ROW EXECUTE FUNCTION public.cleanup_roles_on_membership_removal();

-- Also cleanup when a membership is marked as inactive (estado != 'activo')
CREATE OR REPLACE FUNCTION public.cleanup_roles_on_membership_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM 'activo' AND OLD.estado = 'activo' THEN
    DELETE FROM public.user_roles
    WHERE user_id = NEW.user_id AND despacho_id = NEW.despacho_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_roles_on_membership_deactivation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cleanup_roles_on_membership_deactivate ON public.user_memberships;
CREATE TRIGGER trg_cleanup_roles_on_membership_deactivate
AFTER UPDATE OF estado ON public.user_memberships
FOR EACH ROW EXECUTE FUNCTION public.cleanup_roles_on_membership_deactivation();
