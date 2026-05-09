
-- Lock down trigger functions
alter function public.tg_set_updated_at() set search_path = public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.tg_set_updated_at() from public, anon, authenticated;
