CREATE OR REPLACE FUNCTION public.has_cliente_access(_cliente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.clientes c
    JOIN public.despachos d ON d.id = c.despacho_id
    WHERE c.id = _cliente
      AND public.is_member_of(c.despacho_id)
      AND (
        CASE
          WHEN d.owner_user_id = auth.uid() THEN true
          WHEN public.has_role('despacho'::public.app_role, c.despacho_id) THEN true
          WHEN EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = 'cliente_final'::public.app_role
              AND ur.despacho_id = c.despacho_id
          ) THEN
            EXISTS (
              SELECT 1 FROM public.cliente_asignaciones a
              WHERE a.cliente_id = COALESCE(c.cliente_padre_id, c.id)
                AND a.user_id = auth.uid()
            )
          ELSE
            d.acceso_restringido = false
            OR EXISTS (
              SELECT 1 FROM public.cliente_asignaciones a
              WHERE a.cliente_id = COALESCE(c.cliente_padre_id, c.id)
                AND a.user_id = auth.uid()
            )
        END
      )
  );
$function$;