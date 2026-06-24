-- Prevent invited users from being promoted to despacho/super_admin in the invited workspace
CREATE OR REPLACE FUNCTION public.prevent_invited_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    RAISE EXCEPTION 'Un invitado no puede tener rol administrador en el despacho invitante';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_invited_admin_role ON public.user_roles;
CREATE TRIGGER trg_prevent_invited_admin_role
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_invited_admin_role();

-- Only admins can create new expedientes/RFCs inside a despacho
DROP POLICY IF EXISTS "clientes insert" ON public.clientes;
CREATE POLICY "clientes insert"
  ON public.clientes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      despacho_id IS NULL
      OR public.has_role('despacho'::public.app_role, despacho_id)
    )
  );

-- Harden manual invitation acceptance: invitation roles cannot grant admin powers
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.invitaciones%ROWTYPE;
  v_uid uuid := auth.uid();
  v_role public.app_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para aceptar la invitación';
  END IF;

  SELECT * INTO v_inv FROM public.invitaciones WHERE token = _token FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invitación no encontrada'; END IF;
  IF v_inv.used_at IS NOT NULL THEN RAISE EXCEPTION 'Esta invitación ya fue utilizada'; END IF;
  IF v_inv.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Esta invitación fue cancelada'; END IF;
  IF v_inv.expires_at < now() THEN RAISE EXCEPTION 'Esta invitación expiró'; END IF;

  v_role := COALESCE(v_inv.role, 'colaborador'::public.app_role);
  IF v_role IN ('despacho'::public.app_role, 'super_admin'::public.app_role) THEN
    v_role := 'colaborador'::public.app_role;
  END IF;

  INSERT INTO public.user_memberships (user_id, despacho_id, estado, invited_by)
  VALUES (v_uid, v_inv.despacho_id, 'activo', v_inv.created_by)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, despacho_id, role)
  VALUES (v_uid, v_inv.despacho_id, v_role)
  ON CONFLICT DO NOTHING;

  UPDATE public.invitaciones SET used_at = now(), used_by = v_uid WHERE id = v_inv.id;

  RETURN v_inv.despacho_id;
END;
$function$;

-- Harden automatic email matching on signup: invited users get operational roles only
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_despacho_id uuid;
  v_nombre text;
  v_inv record;
  v_has_invites boolean := false;
  v_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, despacho_nombre, telefono)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'despacho_nombre', ''),
    NULLIF(new.raw_user_meta_data->>'telefono', '')
  )
  ON CONFLICT (id) DO NOTHING;

  IF new.email IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.invitaciones
      WHERE lower(email) = lower(new.email)
        AND used_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > now()
    ) INTO v_has_invites;
  END IF;

  IF NOT v_has_invites THEN
    v_nombre := COALESCE(
      NULLIF(new.raw_user_meta_data->>'despacho_nombre', ''),
      NULLIF(new.raw_user_meta_data->>'full_name', ''),
      split_part(new.email, '@', 1),
      'Mi Despacho'
    );

    INSERT INTO public.despachos (nombre, owner_user_id, estado, trial_ends_at)
    VALUES (v_nombre, new.id, 'trial', now() + interval '14 days')
    RETURNING id INTO v_despacho_id;

    INSERT INTO public.user_memberships (user_id, despacho_id, estado)
    VALUES (new.id, v_despacho_id, 'activo')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.user_roles (user_id, despacho_id, role)
    VALUES (new.id, v_despacho_id, 'despacho')
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_has_invites THEN
    FOR v_inv IN
      SELECT id, despacho_id, role, created_by
      FROM public.invitaciones
      WHERE lower(email) = lower(new.email)
        AND used_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > now()
    LOOP
      v_role := COALESCE(v_inv.role, 'colaborador'::public.app_role);
      IF v_role IN ('despacho'::public.app_role, 'super_admin'::public.app_role) THEN
        v_role := 'colaborador'::public.app_role;
      END IF;

      INSERT INTO public.user_memberships (user_id, despacho_id, estado, invited_by)
      VALUES (new.id, v_inv.despacho_id, 'activo', v_inv.created_by)
      ON CONFLICT DO NOTHING;

      INSERT INTO public.user_roles (user_id, despacho_id, role)
      VALUES (new.id, v_inv.despacho_id, v_role)
      ON CONFLICT DO NOTHING;

      UPDATE public.invitaciones
      SET used_at = now(), used_by = new.id
      WHERE id = v_inv.id;
    END LOOP;
  END IF;

  RETURN new;
END;
$function$;