CREATE OR REPLACE FUNCTION public.prevent_invited_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.despacho_id IS NOT NULL
     AND NEW.role IN ('despacho'::public.app_role, 'super_admin'::public.app_role)
     AND EXISTS (
       SELECT 1
       FROM public.user_memberships um
       JOIN public.despachos d ON d.id = um.despacho_id
       WHERE um.user_id = NEW.user_id
         AND um.despacho_id = NEW.despacho_id
         AND um.estado = 'activo'
         AND um.invited_by IS NOT NULL
         AND d.owner_user_id <> NEW.user_id
     ) THEN
    RAISE NOTICE 'Rol administrador bloqueado para usuario invitado % en despacho %', NEW.user_id, NEW.despacho_id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_invited_admin_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_invited_admin_role() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_invited_admin_role() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_invited_admin_role() TO service_role;