
REVOKE EXECUTE ON FUNCTION public.has_cliente_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_cliente_access(uuid) TO authenticated;
