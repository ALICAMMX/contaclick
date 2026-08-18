-- El despachador de programaciones corre sin sesión (auth.uid() es nulo), de
-- modo que necesita evaluar el permiso fino del ACTOR de forma explícita.
-- Misma regla que has_cliente_access, pero parametrizada por usuario.
CREATE OR REPLACE FUNCTION public.has_cliente_access_for(_cliente uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clientes c
    JOIN public.despachos d ON d.id = c.despacho_id
    WHERE c.id = _cliente
      AND (
        d.owner_user_id = _user
        OR EXISTS (
          SELECT 1 FROM public.user_memberships m
          WHERE m.user_id = _user AND m.despacho_id = c.despacho_id AND m.estado = 'activo'
        )
      )
      AND (
        CASE
          WHEN d.owner_user_id = _user THEN true
          WHEN EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = _user
              AND ur.role = 'despacho'::public.app_role
              AND ur.despacho_id = c.despacho_id
          ) THEN true
          WHEN EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = _user
              AND ur.role = 'cliente_final'::public.app_role
              AND ur.despacho_id = c.despacho_id
          ) THEN
            EXISTS (
              SELECT 1 FROM public.cliente_asignaciones a
              WHERE a.cliente_id = COALESCE(c.cliente_padre_id, c.id)
                AND a.user_id = _user
            )
          ELSE
            d.acceso_restringido = false
            OR EXISTS (
              SELECT 1 FROM public.cliente_asignaciones a
              WHERE a.cliente_id = COALESCE(c.cliente_padre_id, c.id)
                AND a.user_id = _user
            )
        END
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_cliente_access_for(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_cliente_access_for(uuid, uuid) TO authenticated, service_role;