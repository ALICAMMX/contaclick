
-- 1. Add cliente_id to invitaciones
ALTER TABLE public.invitaciones
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;

-- 2. cliente_portal_config table
CREATE TABLE IF NOT EXISTS public.cliente_portal_config (
  cliente_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  ver_dashboard boolean NOT NULL DEFAULT true,
  ver_cfdi boolean NOT NULL DEFAULT true,
  ver_cxc boolean NOT NULL DEFAULT true,
  ver_cxp boolean NOT NULL DEFAULT true,
  ver_impuestos boolean NOT NULL DEFAULT true,
  ver_obligaciones boolean NOT NULL DEFAULT true,
  ver_reportes boolean NOT NULL DEFAULT true,
  ver_mensajes boolean NOT NULL DEFAULT true,
  puede_subir_docs boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_portal_config TO authenticated;
GRANT ALL ON public.cliente_portal_config TO service_role;

ALTER TABLE public.cliente_portal_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage portal config" ON public.cliente_portal_config;
CREATE POLICY "admins manage portal config" ON public.cliente_portal_config
  FOR ALL TO authenticated
  USING (public.has_role('despacho'::public.app_role, despacho_id))
  WITH CHECK (public.has_role('despacho'::public.app_role, despacho_id));

DROP POLICY IF EXISTS "cliente_final reads own portal config" ON public.cliente_portal_config;
CREATE POLICY "cliente_final reads own portal config" ON public.cliente_portal_config
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cliente_asignaciones a
    WHERE a.cliente_id = cliente_portal_config.cliente_id
      AND a.user_id = auth.uid()
  ));

DROP TRIGGER IF EXISTS tg_cliente_portal_config_updated_at ON public.cliente_portal_config;
CREATE TRIGGER tg_cliente_portal_config_updated_at
  BEFORE UPDATE ON public.cliente_portal_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Update has_cliente_access: cliente_final SIEMPRE restringido a su asignación
CREATE OR REPLACE FUNCTION public.has_cliente_access(_cliente uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clientes c
    JOIN public.despachos d ON d.id = c.despacho_id
    WHERE c.id = _cliente
      AND public.is_member_of(c.despacho_id)
      AND (
        CASE
          WHEN EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = 'cliente_final'::public.app_role
          ) THEN
            EXISTS (
              SELECT 1 FROM public.cliente_asignaciones a
              WHERE a.cliente_id = COALESCE(c.cliente_padre_id, c.id)
                AND a.user_id = auth.uid()
            )
          ELSE
            d.acceso_restringido = false
            OR d.owner_user_id = auth.uid()
            OR public.has_role('despacho'::public.app_role, c.despacho_id)
            OR EXISTS (
              SELECT 1 FROM public.cliente_asignaciones a
              WHERE a.cliente_id = COALESCE(c.cliente_padre_id, c.id)
                AND a.user_id = auth.uid()
            )
        END
      )
  );
$$;

-- 4. Update accept_invitation
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invitaciones%ROWTYPE;
  v_uid uuid := auth.uid();
  v_role public.app_role;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión para aceptar la invitación'; END IF;
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

  INSERT INTO public.user_roles (user_id, despacho_id, role, cliente_id)
  VALUES (v_uid, v_inv.despacho_id, v_role,
    CASE WHEN v_role = 'cliente_final'::public.app_role THEN v_inv.cliente_id ELSE NULL END)
  ON CONFLICT DO NOTHING;

  IF v_role = 'cliente_final'::public.app_role AND v_inv.cliente_id IS NOT NULL THEN
    INSERT INTO public.cliente_asignaciones (despacho_id, cliente_id, user_id, created_by)
    VALUES (v_inv.despacho_id, v_inv.cliente_id, v_uid, v_inv.created_by)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.cliente_portal_config (cliente_id, despacho_id)
    VALUES (v_inv.cliente_id, v_inv.despacho_id)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.invitaciones SET used_at = now(), used_by = v_uid WHERE id = v_inv.id;
  RETURN v_inv.despacho_id;
END;
$$;

-- 5. Update handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_despacho_id uuid;
  v_nombre text;
  v_inv record;
  v_has_invites boolean := false;
  v_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, despacho_nombre, telefono)
  VALUES (
    new.id, new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'despacho_nombre', ''),
    NULLIF(new.raw_user_meta_data->>'telefono', '')
  )
  ON CONFLICT (id) DO NOTHING;

  IF new.email IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.invitaciones
      WHERE lower(email) = lower(new.email)
        AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
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
    VALUES (new.id, v_despacho_id, 'activo') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, despacho_id, role)
    VALUES (new.id, v_despacho_id, 'despacho') ON CONFLICT DO NOTHING;
  ELSE
    FOR v_inv IN
      SELECT id, despacho_id, role, created_by, cliente_id
      FROM public.invitaciones
      WHERE lower(email) = lower(new.email)
        AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
    LOOP
      v_role := COALESCE(v_inv.role, 'colaborador'::public.app_role);
      IF v_role IN ('despacho'::public.app_role, 'super_admin'::public.app_role) THEN
        v_role := 'colaborador'::public.app_role;
      END IF;

      INSERT INTO public.user_memberships (user_id, despacho_id, estado, invited_by)
      VALUES (new.id, v_inv.despacho_id, 'activo', v_inv.created_by)
      ON CONFLICT DO NOTHING;

      INSERT INTO public.user_roles (user_id, despacho_id, role, cliente_id)
      VALUES (new.id, v_inv.despacho_id, v_role,
        CASE WHEN v_role = 'cliente_final'::public.app_role THEN v_inv.cliente_id ELSE NULL END)
      ON CONFLICT DO NOTHING;

      IF v_role = 'cliente_final'::public.app_role AND v_inv.cliente_id IS NOT NULL THEN
        INSERT INTO public.cliente_asignaciones (despacho_id, cliente_id, user_id, created_by)
        VALUES (v_inv.despacho_id, v_inv.cliente_id, new.id, v_inv.created_by)
        ON CONFLICT DO NOTHING;

        INSERT INTO public.cliente_portal_config (cliente_id, despacho_id)
        VALUES (v_inv.cliente_id, v_inv.despacho_id)
        ON CONFLICT DO NOTHING;
      END IF;

      UPDATE public.invitaciones SET used_at = now(), used_by = new.id WHERE id = v_inv.id;
    END LOOP;
  END IF;
  RETURN new;
END;
$$;
