
ALTER TABLE public.invitaciones
  ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS idx_invitaciones_email_pending
  ON public.invitaciones (lower(email))
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_despacho_id uuid;
  v_nombre text;
  v_inv record;
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

  IF new.email IS NOT NULL THEN
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
