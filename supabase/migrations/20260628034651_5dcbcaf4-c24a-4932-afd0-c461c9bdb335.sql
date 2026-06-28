
-- 1) Fijar search_path en helpers de email/pgmq (evita hijack de schema)
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;

-- 2) Revocar EXECUTE público de funciones SECURITY DEFINER sensibles.
--    Postgres concede EXECUTE a PUBLIC por defecto. Restringimos a 'authenticated'
--    donde el cliente debe poder llamarlas, y dejamos solo service_role en las
--    que jamás deben invocarse desde sesión de usuario (triggers internos).

-- Helpers de autorización: solo usuarios autenticados.
REVOKE EXECUTE ON FUNCTION public.has_role(public.app_role, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_member_of(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_despacho_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_cliente_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(public.app_role, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_despacho_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_cliente_access(uuid) TO authenticated;

-- Contadores de uso y saldo: solo authenticated (la fn ya valida is_member_of/is_super_admin).
REVOKE EXECUTE ON FUNCTION public.incrementar_uso_sat(uuid, text, integer, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.incrementar_uso_ia(uuid, text, integer, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.descontar_saldo_pac(integer, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recargar_saldo_pac(integer, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incrementar_uso_sat(uuid, text, integer, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.incrementar_uso_ia(uuid, text, integer, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.descontar_saldo_pac(integer, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recargar_saldo_pac(integer, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated;

-- Aceptar invitación: requiere sesión (auth.uid()), nunca anon.
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

-- Validar cupón: se llama desde checkout autenticado.
REVOKE EXECUTE ON FUNCTION public.validar_cupon(text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validar_cupon(text, text, text, uuid) TO authenticated;

-- Email/pgmq: solo service_role (los llaman edge/server routes con admin).
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
