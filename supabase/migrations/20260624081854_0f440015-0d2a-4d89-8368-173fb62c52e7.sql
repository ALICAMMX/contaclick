
-- 1) Replace handle_new_user: if pending invitations exist, skip personal despacho creation
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

  -- Check pending invitations for this email
  IF new.email IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.invitaciones
      WHERE lower(email) = lower(new.email)
        AND used_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > now()
    ) INTO v_has_invites;
  END IF;

  -- Only create personal despacho if user was NOT invited
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

  -- Process invitations (attach to inviter's despacho as colaborador)
  IF v_has_invites THEN
    FOR v_inv IN
      SELECT id, despacho_id, role, created_by
      FROM public.invitaciones
      WHERE lower(email) = lower(new.email)
        AND used_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > now()
    LOOP
      INSERT INTO public.user_memberships (user_id, despacho_id, estado, invited_by)
      VALUES (new.id, v_inv.despacho_id, 'activo', v_inv.created_by)
      ON CONFLICT DO NOTHING;

      INSERT INTO public.user_roles (user_id, despacho_id, role)
      VALUES (new.id, v_inv.despacho_id, v_inv.role)
      ON CONFLICT DO NOTHING;

      UPDATE public.invitaciones
      SET used_at = now(), used_by = new.id
      WHERE id = v_inv.id;
    END LOOP;
  END IF;

  RETURN new;
END;
$function$;

-- 2) One-time cleanup: remove empty personal despachos for users that were invited elsewhere
DO $$
DECLARE
  r record;
  v_has_data boolean;
BEGIN
  FOR r IN
    SELECT d.id AS despacho_id, d.owner_user_id
    FROM public.despachos d
    WHERE d.owner_user_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_memberships m2
        WHERE m2.user_id = d.owner_user_id
          AND m2.despacho_id <> d.id
          AND m2.estado = 'activo'
      )
  LOOP
    SELECT
      EXISTS (SELECT 1 FROM public.clientes WHERE despacho_id = r.despacho_id)
      OR EXISTS (SELECT 1 FROM public.cfdi_xml WHERE despacho_id = r.despacho_id)
    INTO v_has_data;

    IF NOT v_has_data THEN
      DELETE FROM public.user_roles WHERE despacho_id = r.despacho_id;
      DELETE FROM public.user_memberships WHERE despacho_id = r.despacho_id;
      DELETE FROM public.invitaciones WHERE despacho_id = r.despacho_id;
      DELETE FROM public.despachos WHERE id = r.despacho_id;
    END IF;
  END LOOP;
END $$;
