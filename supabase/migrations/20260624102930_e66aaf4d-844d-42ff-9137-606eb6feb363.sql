DELETE FROM public.user_roles
WHERE user_id = '114bd51b-9ab8-45a1-89b0-bdffc115b7c7'::uuid
  AND role IN ('despacho'::public.app_role, 'super_admin'::public.app_role)
  AND despacho_id = '399a2f9c-7686-41d4-b82b-ee470c45b275'::uuid;

DELETE FROM public.user_memberships
WHERE user_id = '114bd51b-9ab8-45a1-89b0-bdffc115b7c7'::uuid
  AND despacho_id = '399a2f9c-7686-41d4-b82b-ee470c45b275'::uuid
  AND invited_by IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = '114bd51b-9ab8-45a1-89b0-bdffc115b7c7'::uuid
      AND ur.role = 'cliente_final'::public.app_role
      AND ur.cliente_id IS NOT NULL
  );