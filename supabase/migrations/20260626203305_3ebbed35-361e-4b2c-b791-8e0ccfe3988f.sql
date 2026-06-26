
-- 1) Revoke anon EXECUTE on SECURITY DEFINER functions; keep authenticated where needed.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.descontar_saldo_pac(integer, bigint) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.incrementar_uso_sat(uuid, text, integer, bigint) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_despacho_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recargar_saldo_pac(integer, bigint) FROM anon, PUBLIC;
-- descontar_saldo_pac is only meant to be called from other SECURITY DEFINER fns; lock it down.
REVOKE EXECUTE ON FUNCTION public.descontar_saldo_pac(integer, bigint) FROM authenticated;

-- 2) Restrict audit_logs SELECT to despacho admins (or self when no despacho).
DROP POLICY IF EXISTS "audit select" ON public.audit_logs;
CREATE POLICY "audit select" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    (despacho_id IS NULL AND user_id = auth.uid())
    OR public.is_despacho_admin(despacho_id)
  );

-- 3) Add UPDATE policy for conciliacion_integral_runs (admin-scoped).
CREATE POLICY "ci_runs_update" ON public.conciliacion_integral_runs
  FOR UPDATE TO authenticated
  USING (public.is_despacho_admin(despacho_id))
  WITH CHECK (public.is_despacho_admin(despacho_id));
