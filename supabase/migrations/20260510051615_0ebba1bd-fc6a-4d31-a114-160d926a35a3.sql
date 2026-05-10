GRANT EXECUTE ON FUNCTION public.is_member_of(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(public.app_role, uuid, uuid) TO authenticated, anon;