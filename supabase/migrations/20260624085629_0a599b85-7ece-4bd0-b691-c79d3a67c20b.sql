REVOKE ALL ON FUNCTION public.prevent_invited_admin_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_invited_admin_role() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_invited_admin_role() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_invited_admin_role() TO service_role;