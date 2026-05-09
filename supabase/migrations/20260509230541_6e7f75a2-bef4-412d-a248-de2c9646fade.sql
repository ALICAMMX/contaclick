revoke execute on function public.is_member_of(uuid) from public, anon, authenticated;
revoke execute on function public.has_role(public.app_role, uuid, uuid) from public, anon, authenticated;
